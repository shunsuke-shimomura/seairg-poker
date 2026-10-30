/**
 * 1/6 刻みの表を作る: 丸め → 最悪ケースを改善する座標降下。
 */
import { type Position, type Strategy, allKeys } from './game';
import { worstCase } from './bestResponse';

export const GRID = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1] as const;

/** 各マスを最も近い 1/6 の倍数に丸める */
export function roundToSixths(s: Strategy): Strategy {
  const out: Strategy = {};
  for (const k of Object.keys(s)) out[k] = Math.round(s[k] * 6) / 6;
  return out;
}

export interface DescentOptions {
  /** 動かさないマス */
  fixed?: Set<string>;
  maxSweeps?: number;
  onSweep?: (sweep: number, worst: number) => void;
}

export interface DescentResult {
  strategy: Strategy;
  worst: number;
  sweeps: number;
}

/**
 * 座標降下: 1マスずつ 0〜6/6 の7通りを試し、最悪ケースが厳密に改善する値だけ採用する。
 * 改善がなくなるまで（または maxSweeps まで）繰り返す。決定的。
 */
export function coordinateDescent(
  start: Strategy,
  player: Position,
  opts: DescentOptions = {},
): DescentResult {
  const fixed = opts.fixed ?? new Set<string>();
  const maxSweeps = opts.maxSweeps ?? 20;
  const cur: Strategy = { ...start };
  let best = worstCase(cur, player);
  let sweeps = 0;
  let improved = true;
  while (improved && sweeps < maxSweeps) {
    improved = false;
    sweeps++;
    for (const k of allKeys()) {
      if (fixed.has(k)) continue;
      let chosen = cur[k];
      for (const g of GRID) {
        if (Math.abs(g - chosen) < 1e-9) continue;
        cur[k] = g;
        const v = worstCase(cur, player);
        if (v > best + 1e-9) {
          best = v;
          chosen = g;
          improved = true;
        }
      }
      cur[k] = chosen;
    }
    opts.onSweep?.(sweeps, best);
  }
  return { strategy: cur, worst: best, sweeps };
}
