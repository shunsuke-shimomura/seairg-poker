/**
 * 局面計算: 相手の行動から手札を推定し（問1）、共有カードの確率を出し（問2）、
 * 一つの判断の期待値を比較する（問3・問4）。
 *
 * 「この時点からの増減」の約束: 今後自分が出すチップを引き、最終的に受け取るチップを足す。
 * フォールドは 0。ポットを勝ち取れば、過去に自分が入れた分も含めてポット全額が増減になる。
 */
import {
  ANTE,
  BET_SIZE,
  DEALS,
  RANKS,
  type Position,
  type R1Outcome,
  type Rank,
  type Strategy,
  histFor,
  r1Key,
  r2Key,
  showdown,
} from './game';
import { bestResponse } from './bestResponse';

export type Action = 'bet' | 'check' | 'call' | 'fold';

export interface GameState {
  round: 1 | 2;
  /** そのラウンドでこれまでに取られた行動（先手の行動から順に） */
  seq: Action[];
  /** 第2ラウンドなら第1ラウンドの結末 */
  r1?: R1Outcome;
}

export interface SituationInput {
  me: Position;
  myHand: Rank;
  /** 相手の表（相手の立場のもの） */
  opp: Strategy;
  /** 第1ラウンドでこれまでに取られた行動 */
  r1: Action[];
  /** 共有カード（第1ラウンド終了後に判明） */
  board?: Rank;
  /** 第2ラウンドでこれまでに取られた行動 */
  r2: Action[];
}

export interface Factor {
  label: string;
  value: number;
}

export interface PosteriorRow {
  hand: Rank;
  prior: number;
  factors: Factor[];
  weight: number;
  posterior: number;
}

export interface BoardRow {
  board: Rank;
  /** 相手の手札ごとの P(共有カード | 両者の手札) */
  perHand: Record<Rank, number>;
  prob: number;
}

export interface ByHandRow {
  hand: Rank;
  posterior: number;
  /** この時点からの増減（相手の手札で条件づけ） */
  value: number;
  note: string;
}

export interface ByBoardRow {
  board: Rank;
  prob: number;
  value: number;
}

export interface DecisionOption {
  action: Action;
  /** この時点からの増減の期待値 */
  ev: number;
  byHand: ByHandRow[];
  /** 共有カードが未定のときだけ */
  byBoard?: ByBoardRow[];
}

export interface Situation {
  state: GameState;
  whoseTurn: Position | null;
  isTerminal: boolean;
  /** 現在のポット（両者分） */
  pot: number;
  /** 自分がこれまでに入れたチップ */
  invested: number;
  posterior: PosteriorRow[];
  boardDist?: BoardRow[];
  decision?: DecisionOption[];
  /** 自分の今後の打ち方として使った最適応答の表 */
  myFuture: Strategy;
}

/** 行動列が終わっているか、次に誰の番か */
export function turnOf(seq: Action[]): Position | null {
  if (seq.length === 0) return 0;
  if (seq.length === 1) return 1;
  if (seq.length === 2) return seq[0] === 'check' && seq[1] === 'bet' ? 0 : null;
  return null;
}

export function isRoundOver(seq: Action[]): boolean {
  return turnOf(seq) === null;
}

export function endedByFold(seq: Action[]): Position | null {
  if (seq[seq.length - 1] !== 'fold') return null;
  // ['bet','fold'] -> 後手が降りた, ['check','bet','fold'] -> 先手が降りた
  return seq.length === 2 ? 1 : 0;
}

export function r1OutcomeOf(seq: Action[]): R1Outcome | null {
  if (seq.length === 2 && seq[0] === 'bet' && seq[1] === 'call') return 'bc';
  if (seq.length === 2 && seq[0] === 'check' && seq[1] === 'check') return 'cc';
  if (seq.length === 3 && seq[2] === 'call') return 'cbc';
  return null;
}

/** 次に行動するプレイヤーの選択肢 [積極, 消極] */
export function optionsFor(seq: Action[]): [Action, Action] {
  if (seq.length === 0 || (seq.length === 1 && seq[0] === 'check')) return ['bet', 'check'];
  return ['call', 'fold'];
}

/** それぞれの投入チップ [先手, 後手] */
export function contributions(state: GameState): [number, number] {
  let c0 = ANTE;
  let c1 = ANTE;
  if (state.round === 2 && state.r1 && state.r1 !== 'cc') {
    c0 += BET_SIZE[1];
    c1 += BET_SIZE[1];
  }
  const bet = BET_SIZE[state.round];
  const seq = state.seq;
  if (seq[0] === 'bet') {
    c0 += bet;
    if (seq[1] === 'call') c1 += bet;
  } else if (seq[0] === 'check' && seq[1] === 'bet') {
    c1 += bet;
    if (seq[2] === 'call') c0 += bet;
  }
  return [c0, c1];
}

function keyFor(player: Position, hand: Rank, board: Rank, state: GameState): string {
  const kind = optionsFor(state.seq)[0] === 'bet' ? 'bet' : 'call';
  if (state.round === 1) return r1Key(kind, hand);
  return r2Key(kind, hand, board, histFor(player, state.r1!));
}

/**
 * 状態 state から先を両者の戦略で打ったときの、先手の最終的な純増減。
 */
export function nodeValue(
  h0: Rank,
  h1: Rank,
  board: Rank,
  s0: Strategy,
  s1: Strategy,
  state: GameState,
): number {
  const seq = state.seq;
  const turn = turnOf(seq);
  if (turn === null) {
    const [c0, c1] = contributions(state);
    const folder = endedByFold(seq);
    if (folder === 1) return c1;
    if (folder === 0) return -c0;
    if (state.round === 1) {
      return nodeValue(h0, h1, board, s0, s1, { round: 2, seq: [], r1: r1OutcomeOf(seq)! });
    }
    return showdown(h0, h1, board) * c0;
  }
  const hand = turn === 0 ? h0 : h1;
  const p = (turn === 0 ? s0 : s1)[keyFor(turn, hand, board, state)];
  const [aggressive, passive] = optionsFor(seq);
  const vA = nodeValue(h0, h1, board, s0, s1, { ...state, seq: [...seq, aggressive] });
  const vP = nodeValue(h0, h1, board, s0, s1, { ...state, seq: [...seq, passive] });
  return p * vA + (1 - p) * vP;
}

const ACTION_LABEL: Record<Action, string> = {
  bet: 'ベット',
  check: 'チェック',
  call: 'コール',
  fold: 'フォールド',
};

/** 自分の手札を除いた残り5枚から、相手の手札が h である事前確率 */
export function priorOpp(myHand: Rank, h: Rank): number {
  return h === myHand ? 1 / 5 : 2 / 5;
}

/** 両者の手札を除いた残り4枚から、共有カードが b である確率 */
export function boardProb(myHand: Rank, oppHand: Rank, b: Rank): number {
  let n = 2;
  if (myHand === b) n--;
  if (oppHand === b) n--;
  return n / 4;
}

/**
 * 相手の行動の確率因子を、ラウンドの行動列から集める。
 */
function actionFactors(
  input: SituationInput,
  oppHand: Rank,
  state: GameState,
  seq: Action[],
  board: Rank | undefined,
): Factor[] {
  const factors: Factor[] = [];
  const oppPos = (1 - input.me) as Position;
  for (let i = 0; i < seq.length; i++) {
    const prefix = seq.slice(0, i);
    const turn = turnOf(prefix);
    if (turn !== oppPos) continue;
    const st: GameState = { ...state, seq: prefix };
    // 第2ラウンドの因子は共有カードが要る
    const key = keyFor(oppPos, oppHand, board ?? 'J', st);
    const p = input.opp[key];
    const [aggressive] = optionsFor(prefix);
    const act = seq[i];
    const value = act === aggressive ? p : 1 - p;
    const roundLabel = state.round === 1 ? '第1R' : '第2R';
    factors.push({ label: `${roundLabel}で${ACTION_LABEL[act]}`, value });
  }
  return factors;
}

export function analyzeSituation(input: SituationInput): Situation {
  const r1Done = isRoundOver(input.r1);
  const r1Outcome = r1Done ? r1OutcomeOf(input.r1) : null;
  const inRound2 = r1Done && r1Outcome !== null;
  const state: GameState = inRound2
    ? { round: 2, seq: input.r2, r1: r1Outcome }
    : { round: 1, seq: input.r1 };
  const board = inRound2 ? input.board : undefined;
  const whoseTurn = turnOf(state.seq);
  const folded = endedByFold(state.seq);
  const isTerminal = whoseTurn === null && (folded !== null || state.round === 2);

  const [c0, c1] = contributions(state);
  const invested = input.me === 0 ? c0 : c1;
  const pot = c0 + c1;

  // --- 推定 ---
  const rows: PosteriorRow[] = [];
  for (const h of RANKS) {
    const prior = priorOpp(input.myHand, h);
    const factors: Factor[] = [];
    factors.push(...actionFactors(input, h, { round: 1, seq: input.r1 }, input.r1, undefined));
    if (board) {
      factors.push({ label: `共有カード${board}が出る`, value: boardProb(input.myHand, h, board) });
      factors.push(...actionFactors(input, h, state, input.r2, board));
    }
    const weight = factors.reduce((acc, f) => acc * f.value, prior);
    rows.push({ hand: h, prior, factors, weight, posterior: 0 });
  }
  const totalW = rows.reduce((a, r) => a + r.weight, 0);
  for (const r of rows) r.posterior = totalW > 0 ? r.weight / totalW : 0;
  const post = (h: Rank) => rows.find((r) => r.hand === h)!.posterior;

  // --- 共有カードの確率（未定のとき） ---
  let boardDist: BoardRow[] | undefined;
  if (!board) {
    boardDist = RANKS.map((b) => {
      const perHand = { J: 0, Q: 0, K: 0 } as Record<Rank, number>;
      let prob = 0;
      for (const h of RANKS) {
        perHand[h] = boardProb(input.myHand, h, b);
        prob += post(h) * perHand[h];
      }
      return { board: b, perHand, prob };
    });
  }

  // --- 判断 ---
  const myFuture = bestResponse(input.opp, input.me).strategy;
  const s0 = input.me === 0 ? myFuture : input.opp;
  const s1 = input.me === 0 ? input.opp : myFuture;
  const sign = input.me === 0 ? 1 : -1;
  let decision: DecisionOption[] | undefined;
  if (whoseTurn === input.me) {
    decision = optionsFor(state.seq).map((action) => {
      const next: GameState = { ...state, seq: [...state.seq, action] };
      const byHand: ByHandRow[] = [];
      const boardAcc: Record<Rank, { p: number; v: number }> = {
        J: { p: 0, v: 0 },
        Q: { p: 0, v: 0 },
        K: { p: 0, v: 0 },
      };
      let ev = 0;
      for (const h of RANKS) {
        const ph = post(h);
        let vh = 0;
        for (const b of RANKS) {
          if (board && b !== board) continue;
          const pb = board ? 1 : boardProb(input.myHand, h, b);
          if (pb === 0) continue;
          const h0 = input.me === 0 ? input.myHand : h;
          const h1 = input.me === 0 ? h : input.myHand;
          const v = sign * nodeValue(h0, h1, b, s0, s1, next) + invested;
          vh += pb * v;
          boardAcc[b].p += ph * pb;
          boardAcc[b].v += ph * pb * v;
        }
        byHand.push({ hand: h, posterior: ph, value: vh, note: noteFor(input, h, board) });
        ev += ph * vh;
      }
      const option: DecisionOption = { action, ev, byHand };
      if (!board) {
        option.byBoard = RANKS.map((b) => ({
          board: b,
          prob: boardAcc[b].p,
          value: boardAcc[b].p > 0 ? boardAcc[b].v / boardAcc[b].p : 0,
        }));
      }
      return option;
    });
  }

  return {
    state,
    whoseTurn,
    isTerminal,
    pot,
    invested,
    posterior: rows,
    boardDist,
    decision,
    myFuture,
  };
}

function noteFor(input: SituationInput, oppHand: Rank, board: Rank | undefined): string {
  if (!board) return '';
  const mine = input.myHand === board;
  const theirs = oppHand === board;
  if (mine && !theirs) return '自分がペア';
  if (theirs && !mine) return '相手がペア';
  if (mine && theirs) return '両者ペア（折半）';
  const cmp = showdown(input.myHand, oppHand, board);
  if (cmp === 0) return '同ランク（折半）';
  return cmp > 0 ? '自分が上' : '相手が上';
}

/** 検算用: nodeValue を全配り方で平均すると traverse と一致するはず */
export function fullValueViaNodes(s0: Strategy, s1: Strategy): number {
  let total = 0;
  for (const d of DEALS) {
    total += d.prob * nodeValue(d.h0, d.h1, d.board, s0, s1, { round: 1, seq: [] });
  }
  return total;
}
