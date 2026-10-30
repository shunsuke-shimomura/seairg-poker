/**
 * 重い計算（CFR・座標降下・読み合いの繰り返し・RNR）を UI を止めずに回す Web Worker。
 */
import type { Position, Strategy } from '../engine/game';
import { expectedValue } from '../engine/game';
import { CfrRunner } from '../engine/cfr';
import { exploitability } from '../engine/bestResponse';
import { coordinateDescent } from '../engine/search';
import { type OpponentModel, iterateBestResponses, restrictedNashResponse } from '../engine/dynamics';

export interface IteratePoint {
  step: number;
  exploitLatest: number;
  exploitAverage: number;
  valueAverage: number;
}

export interface RnrPoint {
  p: number;
  vsModel: number;
  worst: number;
  strategy: Strategy;
}

export type WorkerRequest =
  | { type: 'cfr'; iterations: number }
  | { type: 'descent'; strategy: Strategy; player: Position }
  | { type: 'iterate'; start: [Strategy, Strategy]; steps: number; model: OpponentModel }
  | { type: 'rnr'; model: Strategy; modelPlayer: Position; ps: number[]; iterations: number };

export type WorkerResponse =
  | { type: 'cfr-progress'; iterations: number; value: number; exploitability: number }
  | { type: 'cfr-done'; iterations: number; average: [Strategy, Strategy]; value: number; exploitability: number }
  | { type: 'descent-progress'; sweep: number; worst: number }
  | { type: 'descent-done'; strategy: Strategy; worst: number; sweeps: number }
  | { type: 'iterate-progress'; point: IteratePoint; steps: number }
  | { type: 'iterate-done'; points: IteratePoint[]; latest: [Strategy, Strategy]; average: [Strategy, Strategy] }
  | { type: 'rnr-progress'; done: number; total: number; point: RnrPoint }
  | { type: 'rnr-done'; points: RnrPoint[] };

const post = (msg: WorkerResponse) => (self as unknown as Worker).postMessage(msg);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  if (req.type === 'cfr') {
    const runner = new CfrRunner();
    const chunk = Math.max(50, Math.floor(req.iterations / 40));
    while (runner.iterations < req.iterations) {
      runner.step(Math.min(chunk, req.iterations - runner.iterations));
      const [a0, a1] = [runner.average(0), runner.average(1)];
      post({
        type: 'cfr-progress',
        iterations: runner.iterations,
        value: expectedValue(a0, a1),
        exploitability: exploitability(a0, a1),
      });
    }
    const [a0, a1] = [runner.average(0), runner.average(1)];
    post({
      type: 'cfr-done',
      iterations: runner.iterations,
      average: [a0, a1],
      value: expectedValue(a0, a1),
      exploitability: exploitability(a0, a1),
    });
  } else if (req.type === 'descent') {
    const res = coordinateDescent(req.strategy, req.player, {
      onSweep: (sweep, worst) => post({ type: 'descent-progress', sweep, worst }),
    });
    post({ type: 'descent-done', strategy: res.strategy, worst: res.worst, sweeps: res.sweeps });
  } else if (req.type === 'iterate') {
    const points: IteratePoint[] = [];
    const steps = iterateBestResponses(req.start, req.steps, req.model, (s) => {
      const point = { step: s.step, exploitLatest: s.exploitLatest, exploitAverage: s.exploitAverage, valueAverage: s.valueAverage };
      points.push(point);
      if (s.step % 10 === 0 || s.step === req.steps) post({ type: 'iterate-progress', point, steps: req.steps });
    });
    const last = steps[steps.length - 1];
    post({ type: 'iterate-done', points, latest: last.latest, average: last.average });
  } else if (req.type === 'rnr') {
    const points: RnrPoint[] = [];
    req.ps.forEach((p, i) => {
      const r = restrictedNashResponse(req.model, req.modelPlayer, p, req.iterations);
      const point = { p: r.p, vsModel: r.vsModel, worst: r.worst, strategy: r.strategy };
      points.push(point);
      post({ type: 'rnr-progress', done: i + 1, total: req.ps.length, point });
    });
    post({ type: 'rnr-done', points });
  }
};
