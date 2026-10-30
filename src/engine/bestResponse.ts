/**
 * 最適応答（best response）、最悪ケース、対策の連鎖。
 *
 * タイ（継続と消極の価値が同じマス）は 1/2 にする（ワークショップの設計判断）。
 */
import {
  type Position,
  type Strategy,
  allKeys,
  counterfactualValues,
  valueFor,
} from './game';

export const TIE_VALUE = 0.5;
const TIE_EPS = 1e-9;

export interface BestResponseResult {
  strategy: Strategy;
  /** タイだったマス（どちらの行動も価値が同じ。到達不能なマスは含まない） */
  ties: string[];
  /** 相手の表ではそこに来ないので、価値が 0 対 0 で決めようのないマス */
  unreachable: string[];
  /** 最適応答した側が得る1ハンドあたりの期待値 */
  value: number;
}

/**
 * 相手の表 `opp`（立場 1-player）に対する、立場 `player` の最適応答。
 * 第2ラウンドのマスから第1ラウンドへと後ろ向きに決める。
 *   1. 第2ラウンドのコール判断（終端が直後）
 *   2. 第2ラウンドのベット判断（先手はチェック後の自分のコール判断に依存）
 *   3. 第1ラウンドのコール判断
 *   4. 第1ラウンドのベット判断
 */
export function bestResponse(opp: Strategy, player: Position): BestResponseResult {
  const keys = allKeys();
  const me: Strategy = {};
  for (const k of keys) me[k] = 1;
  const levels = [
    keys.filter((k) => k.startsWith('r2|call')),
    keys.filter((k) => k.startsWith('r2|bet')),
    keys.filter((k) => k.startsWith('r1|call')),
    keys.filter((k) => k.startsWith('r1|bet')),
  ];
  const ties: string[] = [];
  const unreachable: string[] = [];
  for (const level of levels) {
    const cfv = player === 0 ? counterfactualValues(me, opp, 0) : counterfactualValues(opp, me, 1);
    for (const k of level) {
      const [a, b] = cfv.get(k) ?? [0, 0];
      if (Math.abs(a - b) <= TIE_EPS) {
        if (Math.abs(a) <= TIE_EPS && Math.abs(b) <= TIE_EPS) unreachable.push(k);
        else ties.push(k);
        me[k] = TIE_VALUE;
      } else {
        me[k] = a > b ? 1 : 0;
      }
    }
  }
  const value = player === 0 ? valueFor(0, me, opp) : valueFor(1, opp, me);
  return { strategy: me, ties, unreachable, value };
}

/** 表 `strat`（立場 player）を、最適応答してくる相手と戦わせたときの期待値（最悪ケース） */
export function worstCase(strat: Strategy, player: Position): number {
  const br = bestResponse(strat, (1 - player) as Position);
  return -br.value;
}

/** 両者の最悪ケースの和の符号反転 = 搾取可能性（0 なら均衡） */
export function exploitability(s0: Strategy, s1: Strategy): number {
  return -(worstCase(s0, 0) + worstCase(s1, 1));
}

export interface ChainStep {
  step: number;
  /** 対策した側 */
  player: Position;
  strategy: Strategy;
  ties: string[];
  unreachable: string[];
  /** 対策した側が得る期待値 */
  gain: number;
}

/** 対策の連鎖: `start`（立場 startPlayer）から始めて、最適応答を交互に n 回とる */
export function counterChain(start: Strategy, startPlayer: Position, n: number): ChainStep[] {
  const steps: ChainStep[] = [];
  let target = start;
  let targetPlayer = startPlayer;
  for (let i = 1; i <= n; i++) {
    const player = (1 - targetPlayer) as Position;
    const br = bestResponse(target, player);
    steps.push({ step: i, player, strategy: br.strategy, ties: br.ties, unreachable: br.unreachable, gain: br.value });
    target = br.strategy;
    targetPlayer = player;
  }
  return steps;
}
