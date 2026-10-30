/**
 * 反実仮想後悔最小化（vanilla CFR, Zinkevich et al. 2007）。
 * 乱数を使わないので、反復回数が同じなら結果は毎回同じ。
 */
import { type Strategy, allKeys, traverse } from './game';

export interface CfrSnapshot {
  iterations: number;
  /** 平均戦略 */
  average: [Strategy, Strategy];
  /** 現在戦略（後悔マッチング） */
  current: [Strategy, Strategy];
}

export class CfrRunner {
  private regret: [Map<string, [number, number]>, Map<string, [number, number]>];
  private strategySum: [Map<string, [number, number]>, Map<string, [number, number]>];
  iterations = 0;

  constructor() {
    const mk = () => new Map(allKeys().map((k) => [k, [0, 0] as [number, number]]));
    this.regret = [mk(), mk()];
    this.strategySum = [mk(), mk()];
  }

  current(player: 0 | 1): Strategy {
    const out: Strategy = {};
    for (const [k, r] of this.regret[player]) {
      const p0 = Math.max(r[0], 0);
      const p1 = Math.max(r[1], 0);
      const tot = p0 + p1;
      out[k] = tot > 0 ? p0 / tot : 0.5;
    }
    return out;
  }

  average(player: 0 | 1): Strategy {
    const out: Strategy = {};
    for (const [k, s] of this.strategySum[player]) {
      const tot = s[0] + s[1];
      out[k] = tot > 0 ? s[0] / tot : 0.5;
    }
    return out;
  }

  /** n 回反復する */
  step(n: number): void {
    for (let t = 0; t < n; t++) {
      const s0 = this.current(0);
      const s1 = this.current(1);
      const strats = [s0, s1] as const;
      traverse(s0, s1, (player, key, reachOwn, reachOpp, chance, values) => {
        const sign = player === 0 ? 1 : -1;
        const p = strats[player][key];
        const nodeValue = p * values[0] + (1 - p) * values[1];
        const w = chance * reachOpp;
        const r = this.regret[player].get(key)!;
        r[0] += w * sign * (values[0] - nodeValue);
        r[1] += w * sign * (values[1] - nodeValue);
        const s = this.strategySum[player].get(key)!;
        const ro = chance * reachOwn;
        s[0] += ro * p;
        s[1] += ro * (1 - p);
      });
      this.iterations++;
    }
  }

  snapshot(): CfrSnapshot {
    return {
      iterations: this.iterations,
      average: [this.average(0), this.average(1)],
      current: [this.current(0), this.current(1)],
    };
  }
}

/** 一括実行の簡便版 */
export function runCfr(iterations: number): CfrSnapshot {
  const runner = new CfrRunner();
  runner.step(iterations);
  return runner.snapshot();
}
