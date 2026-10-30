/**
 * 読み合いの力学：
 *   - 繰り返し最適応答（相手のモデル＝直前の表 or これまでの平均）
 *   - Restricted Nash Response（相手がモデル通りに動く確率 p、最適応答してくる確率 1−p）
 *
 * 「平均」は sequence form で正しく取る（各マスの値を自分の到達確率で重みづけして平均する）。
 * こうすると平均の表の実現確率が各表の実現確率の平均になり、
 * 2人ゼロサムでは fictitious play（Brown 1951）の平均が均衡に収束する（Robinson 1951）。
 */
import { type Position, type Strategy, allKeys, traverse, valueFor } from './game';
import { bestResponse, exploitability, worstCase } from './bestResponse';

/** 立場 player の各マスへの自分の到達確率（自分の行動確率の積。相手・配り方は含まない） */
export function ownReach(strategy: Strategy, player: Position): Map<string, number> {
  const out = new Map<string, number>();
  const dummy: Strategy = {};
  for (const k of allKeys()) dummy[k] = 0.5;
  const s0 = player === 0 ? strategy : dummy;
  const s1 = player === 1 ? strategy : dummy;
  traverse(s0, s1, (p, key, reachOwn) => {
    if (p === player && !out.has(key)) out.set(key, reachOwn);
  });
  return out;
}

/** 到達確率で重みづけした表の平均（sequence form の平均） */
export class StrategyAverager {
  private num = new Map<string, number>();
  private den = new Map<string, number>();
  count = 0;

  constructor(private readonly player: Position) {}

  add(strategy: Strategy, weight = 1): void {
    const reach = ownReach(strategy, this.player);
    for (const k of allKeys()) {
      const w = weight * (reach.get(k) ?? 0);
      this.num.set(k, (this.num.get(k) ?? 0) + w * strategy[k]);
      this.den.set(k, (this.den.get(k) ?? 0) + w);
    }
    this.count++;
  }

  average(): Strategy {
    const out: Strategy = {};
    for (const k of allKeys()) {
      const d = this.den.get(k) ?? 0;
      out[k] = d > 0 ? (this.num.get(k) ?? 0) / d : 0.5;
    }
    return out;
  }
}

export type OpponentModel = 'latest' | 'average';

export interface IterationStep {
  step: number;
  /** この段で両者が作った表（最適応答） */
  latest: [Strategy, Strategy];
  /** 出発点からこの段までの平均の表 */
  average: [Strategy, Strategy];
  /** この段の表どうしの搾取可能性 */
  exploitLatest: number;
  /** 平均の表どうしの搾取可能性 */
  exploitAverage: number;
  /** 平均の表どうしの期待値（先手） */
  valueAverage: number;
}

/**
 * 両者が同時に「相手のモデルへの最適応答」を繰り返す。
 *   model = 'latest' : 相手の直前の表に最適応答（対策の連鎖。振動して収束しない）
 *   model = 'average': 相手のこれまでの平均の表に最適応答（fictitious play。平均が均衡に収束する）
 */
export function iterateBestResponses(
  start: [Strategy, Strategy],
  steps: number,
  model: OpponentModel,
  onStep?: (s: IterationStep) => void,
): IterationStep[] {
  const avg: [StrategyAverager, StrategyAverager] = [new StrategyAverager(0), new StrategyAverager(1)];
  let latest: [Strategy, Strategy] = [start[0], start[1]];
  avg[0].add(latest[0]);
  avg[1].add(latest[1]);
  const out: IterationStep[] = [];
  for (let t = 1; t <= steps; t++) {
    const target: [Strategy, Strategy] = model === 'latest' ? latest : [avg[0].average(), avg[1].average()];
    latest = [bestResponse(target[1], 0).strategy, bestResponse(target[0], 1).strategy];
    avg[0].add(latest[0]);
    avg[1].add(latest[1]);
    const average: [Strategy, Strategy] = [avg[0].average(), avg[1].average()];
    const s: IterationStep = {
      step: t,
      latest,
      average,
      exploitLatest: exploitability(latest[0], latest[1]),
      exploitAverage: exploitability(average[0], average[1]),
      valueAverage: valueFor(0, average[0], average[1]),
    };
    out.push(s);
    onStep?.(s);
  }
  return out;
}

export interface RnrResult {
  p: number;
  /** 自分（1 − modelPlayer）の表 */
  strategy: Strategy;
  /** モデル通りの相手に対する期待値（自分の側から見た値） */
  vsModel: number;
  /** 最適応答してくる相手に対する期待値（最悪ケース） */
  worst: number;
  iterations: number;
}

/**
 * Restricted Nash Response（Johanson, Zinkevich & Bowling 2008）。
 * 相手は、配られた直後に確率 p で「モデルの表どおりに打つ相手」、確率 1−p で「自由に最適化する相手」になる。
 * 自分はどちらが来たか分からない。この制限つきゲームの均衡での自分の表が RNR。
 *   p = 1 → モデルへの最適応答、p = 0 → 均衡。
 * 計算は CFR（後悔を 0 で切り捨て、平均は反復番号で重みづける CFR+ 流）。乱数は使わない。
 */
export function restrictedNashResponse(
  model: Strategy,
  modelPlayer: Position,
  p: number,
  iterations: number,
  onProgress?: (iterations: number) => void,
): RnrResult {
  const me = (1 - modelPlayer) as Position;
  const keys = allKeys();
  const mk = () => new Map(keys.map((k) => [k, [0, 0] as [number, number]]));
  const regretMe = mk();
  const regretFree = mk();
  const sumMe = mk();
  const current = (regret: Map<string, [number, number]>): Strategy => {
    const out: Strategy = {};
    for (const [k, r] of regret) {
      const a = Math.max(r[0], 0);
      const b = Math.max(r[1], 0);
      const tot = a + b;
      out[k] = tot > 0 ? a / tot : 0.5;
    }
    return out;
  };

  for (let t = 1; t <= iterations; t++) {
    const sMe = current(regretMe);
    const sFree = current(regretFree);
    const branches: { opp: Strategy; weight: number; free: boolean }[] = [];
    if (p > 0) branches.push({ opp: model, weight: p, free: false });
    if (p < 1) branches.push({ opp: sFree, weight: 1 - p, free: true });
    for (const br of branches) {
      const s0 = me === 0 ? sMe : br.opp;
      const s1 = me === 1 ? sMe : br.opp;
      traverse(s0, s1, (player, key, reachOwn, reachOpp, chance, values) => {
        const sign = player === 0 ? 1 : -1;
        if (player === me) {
          const prob = sMe[key];
          const nodeValue = prob * values[0] + (1 - prob) * values[1];
          const w = br.weight * chance * reachOpp;
          const r = regretMe.get(key)!;
          r[0] = Math.max(0, r[0] + w * sign * (values[0] - nodeValue));
          r[1] = Math.max(0, r[1] + w * sign * (values[1] - nodeValue));
          const s = sumMe.get(key)!;
          const ro = t * br.weight * chance * reachOwn;
          s[0] += ro * prob;
          s[1] += ro * (1 - prob);
        } else if (br.free) {
          const prob = sFree[key];
          const nodeValue = prob * values[0] + (1 - prob) * values[1];
          const w = chance * reachOpp;
          const r = regretFree.get(key)!;
          r[0] = Math.max(0, r[0] + w * sign * (values[0] - nodeValue));
          r[1] = Math.max(0, r[1] + w * sign * (values[1] - nodeValue));
        }
      });
    }
    if (onProgress && t % 500 === 0) onProgress(t);
  }

  const strategy: Strategy = {};
  for (const [k, s] of sumMe) {
    const tot = s[0] + s[1];
    strategy[k] = tot > 0 ? s[0] / tot : 0.5;
  }
  const vsModel = me === 0 ? valueFor(0, strategy, model) : valueFor(1, model, strategy);
  return { p, strategy, vsModel, worst: worstCase(strategy, me), iterations };
}

/** p を 0 から 1 まで動かして RNR の曲線を作る */
export function rnrCurve(
  model: Strategy,
  modelPlayer: Position,
  ps: number[],
  iterations: number,
  onPoint?: (r: RnrResult) => void,
): RnrResult[] {
  const out: RnrResult[] = [];
  for (const p of ps) {
    const r = restrictedNashResponse(model, modelPlayer, p, iterations);
    out.push(r);
    onPoint?.(r);
  }
  return out;
}

export const RNR_PS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
