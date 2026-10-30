/**
 * 簡約 Leduc Hold'em（J・Q・K 各2枚、レイズなし）のゲーム定義と木の走査。
 *
 * 位置: 0 = 先手（両ラウンドとも先に行動）, 1 = 後手
 * 戦略 (Strategy): 情報集合キー -> 「ベット／コール」する確率
 *   第1ラウンド: "r1|bet|J"  / "r1|call|J"
 *     先手: bet = 初手でベットする確率, call = チェック後にベットされたらコールする確率
 *     後手: call = ベットされたらコールする確率, bet = チェックされたらベットする確率
 *   第2ラウンド: "r2|bet|J|K|oppbet" = 手札 J・共有カード K・経緯 oppbet
 *     経緯: oppbet = 相手がベットし自分がコール, mebet = 自分がベットし相手がコール, check = 両者チェック
 *
 * チップの数え方: 先手の純増減（アンティ込み）。後手の値は符号を反転したもの。
 */

export type Rank = 'J' | 'Q' | 'K';
export const RANKS: readonly Rank[] = ['J', 'Q', 'K'] as const;
export const RANK_VALUE: Record<Rank, number> = { J: 0, Q: 1, K: 2 };

export type Position = 0 | 1;
export type Hist = 'oppbet' | 'mebet' | 'check';
export const HISTS: readonly Hist[] = ['oppbet', 'mebet', 'check'] as const;
export type Kind = 'bet' | 'call';

/** 第1ラウンドの結末（フォールドなしで第2ラウンドへ進んだもの） */
export type R1Outcome = 'bc' | 'cbc' | 'cc';

export const ANTE = 1;
export const BET_SIZE: Record<1 | 2, number> = { 1: 2, 2: 4 };

export type Strategy = Record<string, number>;

export interface Deal {
  h0: Rank;
  h1: Rank;
  board: Rank;
  prob: number;
}

export const r1Key = (kind: Kind, hand: Rank): string => `r1|${kind}|${hand}`;
export const r2Key = (kind: Kind, hand: Rank, board: Rank, hist: Hist): string =>
  `r2|${kind}|${hand}|${board}|${hist}`;

export interface ParsedKey {
  round: 1 | 2;
  kind: Kind;
  hand: Rank;
  board?: Rank;
  hist?: Hist;
}

export function parseKey(key: string): ParsedKey {
  const parts = key.split('|');
  if (parts[0] === 'r1') {
    return { round: 1, kind: parts[1] as Kind, hand: parts[2] as Rank };
  }
  return {
    round: 2,
    kind: parts[1] as Kind,
    hand: parts[2] as Rank,
    board: parts[3] as Rank,
    hist: parts[4] as Hist,
  };
}

/** 1つの立場の全情報集合キー（60個）。第1ラウンド6 + 第2ラウンド54 */
export function allKeys(): string[] {
  const keys: string[] = [];
  for (const h of RANKS) {
    keys.push(r1Key('bet', h));
    keys.push(r1Key('call', h));
  }
  for (const h of RANKS) {
    for (const b of RANKS) {
      for (const hist of HISTS) {
        keys.push(r2Key('bet', h, b, hist));
        keys.push(r2Key('call', h, b, hist));
      }
    }
  }
  return keys;
}

/** 配り方の列挙: (先手の手札, 後手の手札, 共有カード) とその確率。120通りを種類ごとにまとめた27通り */
export const DEALS: readonly Deal[] = (() => {
  const deck: Rank[] = ['J', 'J', 'Q', 'Q', 'K', 'K'];
  const counts = new Map<string, number>();
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      if (j === i) continue;
      for (let k = 0; k < 6; k++) {
        if (k === i || k === j) continue;
        const key = `${deck[i]}${deck[j]}${deck[k]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  const out: Deal[] = [];
  for (const [key, c] of counts) {
    out.push({ h0: key[0] as Rank, h1: key[1] as Rank, board: key[2] as Rank, prob: c / 120 });
  }
  return out;
})();

/** ショーダウン: +1 先手勝ち, -1 後手勝ち, 0 折半 */
export function showdown(h0: Rank, h1: Rank, board: Rank): number {
  const p0 = h0 === board;
  const p1 = h1 === board;
  if (p0 && !p1) return 1;
  if (p1 && !p0) return -1;
  if (p0 && p1) return 0;
  if (RANK_VALUE[h0] > RANK_VALUE[h1]) return 1;
  if (RANK_VALUE[h0] < RANK_VALUE[h1]) return -1;
  return 0;
}

/** 第1ラウンドの結末を、そのプレイヤーから見た経緯ラベルに変換 */
export function histFor(player: Position, r1: R1Outcome): Hist {
  if (r1 === 'cc') return 'check';
  if (r1 === 'bc') return player === 0 ? 'mebet' : 'oppbet';
  return player === 0 ? 'oppbet' : 'mebet';
}

/** 第1ラウンド終了後のポット（両者分） */
export function potAfterR1(r1: R1Outcome): number {
  return r1 === 'cc' ? 2 * ANTE : 2 * ANTE + 2 * BET_SIZE[1];
}

/**
 * 走査のフック。各決定ノードで呼ばれる。
 * values = [継続（ベット/コール）した場合の先手EV, 消極（チェック/フォールド）した場合の先手EV]
 * reachOwn / reachOpp は、この配り方のもとで各プレイヤーの戦略がこのノードに到達する確率
 * （chance は含まない）。
 */
export type DecisionHook = (
  player: Position,
  key: string,
  reachOwn: number,
  reachOpp: number,
  chance: number,
  values: readonly [number, number],
) => void;

const noop: DecisionHook = () => {};

function round2(
  deal: Deal,
  s0: Strategy,
  s1: Strategy,
  pot: number,
  r1: R1Outcome,
  reach0: number,
  reach1: number,
  hook: DecisionHook,
): number {
  const bet = BET_SIZE[2];
  const sd = showdown(deal.h0, deal.h1, deal.board);
  const half = pot / 2;
  const hist0 = histFor(0, r1);
  const hist1 = histFor(1, r1);
  const chance = deal.prob;

  // 先手がベット -> 後手がコール/フォールド
  const k0 = r2Key('bet', deal.h0, deal.board, hist0);
  const pb = s0[k0];
  const k1c = r2Key('call', deal.h1, deal.board, hist1);
  const pc = s1[k1c];
  const vCall = sd * (half + bet);
  const vFold = half;
  hook(1, k1c, reach1, reach0 * pb, chance, [vCall, vFold]);
  const vBet = pc * vCall + (1 - pc) * vFold;

  // 先手がチェック -> 後手がベット/チェック
  const k1b = r2Key('bet', deal.h1, deal.board, hist1);
  const pb1 = s1[k1b];
  const k0c = r2Key('call', deal.h0, deal.board, hist0);
  const pc0 = s0[k0c];
  const vCall0 = sd * (half + bet);
  const vFold0 = -half;
  hook(0, k0c, reach0 * (1 - pb), reach1 * pb1, chance, [vCall0, vFold0]);
  const vP1Bet = pc0 * vCall0 + (1 - pc0) * vFold0;
  const vP1Check = sd * half;
  hook(1, k1b, reach1, reach0 * (1 - pb), chance, [vP1Bet, vP1Check]);
  const vCheck = pb1 * vP1Bet + (1 - pb1) * vP1Check;

  hook(0, k0, reach0, reach1, chance, [vBet, vCheck]);
  return pb * vBet + (1 - pb) * vCheck;
}

function round1(deal: Deal, s0: Strategy, s1: Strategy, hook: DecisionHook): number {
  const pot = 2 * ANTE;
  const bet = BET_SIZE[1];
  const chance = deal.prob;

  const k0 = r1Key('bet', deal.h0);
  const pb = s0[k0];
  const k1c = r1Key('call', deal.h1);
  const pc = s1[k1c];
  const vCall = round2(deal, s0, s1, pot + 2 * bet, 'bc', pb, pc, hook);
  const vFold = pot / 2;
  hook(1, k1c, 1, pb, chance, [vCall, vFold]);
  const vBet = pc * vCall + (1 - pc) * vFold;

  const k1b = r1Key('bet', deal.h1);
  const pb1 = s1[k1b];
  const k0c = r1Key('call', deal.h0);
  const pc0 = s0[k0c];
  const vCall0 = round2(deal, s0, s1, pot + 2 * bet, 'cbc', (1 - pb) * pc0, pb1, hook);
  const vFold0 = -pot / 2;
  hook(0, k0c, 1 - pb, pb1, chance, [vCall0, vFold0]);
  const vP1Bet = pc0 * vCall0 + (1 - pc0) * vFold0;
  const vP1Check = round2(deal, s0, s1, pot, 'cc', 1 - pb, 1 - pb1, hook);
  hook(1, k1b, 1, 1 - pb, chance, [vP1Bet, vP1Check]);
  const vCheck = pb1 * vP1Bet + (1 - pb1) * vP1Check;

  hook(0, k0, 1, 1, chance, [vBet, vCheck]);
  return pb * vBet + (1 - pb) * vCheck;
}

/** 木全体を走査し、先手の期待値（1ハンドあたりの純増減）を返す。 */
export function traverse(s0: Strategy, s1: Strategy, hook: DecisionHook = noop): number {
  let total = 0;
  for (const deal of DEALS) {
    total += deal.prob * round1(deal, s0, s1, hook);
  }
  return total;
}

/** 先手の期待値 */
export function expectedValue(s0: Strategy, s1: Strategy): number {
  return traverse(s0, s1);
}

/** 指定プレイヤーの期待値 */
export function valueFor(player: Position, s0: Strategy, s1: Strategy): number {
  const v = traverse(s0, s1);
  return player === 0 ? v : -v;
}

/**
 * 反実仮想価値（counterfactual value）: 各情報集合について、
 * [継続した場合, 消極した場合] の値を、相手到達確率×chance で重みづけして合計したもの（当人の符号）。
 */
export function counterfactualValues(
  s0: Strategy,
  s1: Strategy,
  player: Position,
): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  const sign = player === 0 ? 1 : -1;
  traverse(s0, s1, (p, key, _reachOwn, reachOpp, chance, values) => {
    if (p !== player) return;
    const w = chance * reachOpp;
    let acc = out.get(key);
    if (!acc) {
      acc = [0, 0];
      out.set(key, acc);
    }
    acc[0] += w * sign * values[0];
    acc[1] += w * sign * values[1];
  });
  return out;
}

/** 手札ごとの期待値（自分の手札で条件づけ） */
export function handValues(
  s0: Strategy,
  s1: Strategy,
  player: Position,
): Record<Rank, number> {
  const sums: Record<Rank, number> = { J: 0, Q: 0, K: 0 };
  const probs: Record<Rank, number> = { J: 0, Q: 0, K: 0 };
  for (const deal of DEALS) {
    const mine = player === 0 ? deal.h0 : deal.h1;
    sums[mine] += deal.prob * round1(deal, s0, s1, noop);
    probs[mine] += deal.prob;
  }
  const sign = player === 0 ? 1 : -1;
  const out: Record<Rank, number> = { J: 0, Q: 0, K: 0 };
  for (const h of RANKS) out[h] = (sign * sums[h]) / probs[h];
  return out;
}

/** 戦略に欠けているキーがないか確認し、欠けていれば埋める */
export function completeStrategy(s: Partial<Strategy>, fill = 0.5): Strategy {
  const out: Strategy = {};
  for (const k of allKeys()) out[k] = s[k] ?? fill;
  return out;
}
