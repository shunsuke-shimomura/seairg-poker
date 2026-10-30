/**
 * 重い計算（CFR・座標降下）を UI を止めずに回す Web Worker。
 */
import type { Position, Strategy } from '../engine/game';
import { expectedValue } from '../engine/game';
import { CfrRunner } from '../engine/cfr';
import { exploitability } from '../engine/bestResponse';
import { coordinateDescent } from '../engine/search';

export type WorkerRequest =
  | { type: 'cfr'; iterations: number }
  | { type: 'descent'; strategy: Strategy; player: Position };

export type WorkerResponse =
  | { type: 'cfr-progress'; iterations: number; value: number; exploitability: number }
  | { type: 'cfr-done'; iterations: number; average: [Strategy, Strategy]; value: number; exploitability: number }
  | { type: 'descent-progress'; sweep: number; worst: number }
  | { type: 'descent-done'; strategy: Strategy; worst: number; sweeps: number };

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
  }
};
