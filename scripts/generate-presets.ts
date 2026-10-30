/**
 * プリセット表を生成して src/engine/presets.json に書き出す。
 *
 *   npm run presets
 *
 * 手順（決定的。乱数は使わない）:
 *   1. vanilla CFR を ITERATIONS 回まわして平均戦略（均衡の近似）を得る
 *   2. 各マスを 1/6 刻みに丸める
 *   3. 最悪ケース（最適応答してくる相手に対する期待値）が改善するマスだけを動かす座標降下
 *   4. 読み合いの繰り返し（相手のモデル＝直前の表／これまでの平均）の搾取可能性の推移
 *   5. Restricted Nash Response の曲線（基本表をモデルに p を 0〜1 で動かす）
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runCfr } from '../src/engine/cfr';
import { roundToSixths, coordinateDescent } from '../src/engine/search';
import { worstCase, exploitability } from '../src/engine/bestResponse';
import { baseTable } from '../src/engine/baseTable';
import { expectedValue } from '../src/engine/game';
import { RNR_PS, iterateBestResponses, rnrCurve } from '../src/engine/dynamics';

/** scripts/lp_equilibrium.py（線形計画法）が出した先手の均衡値の厳密値。CFR の検証に使う */
export const EQUILIBRIUM_VALUE_LP = -0.078106;

const ITERATIONS = Number(process.env.CFR_ITERATIONS ?? 20000);
const ITERATE_STEPS = Number(process.env.ITERATE_STEPS ?? 400);
const RNR_ITERATIONS = Number(process.env.RNR_ITERATIONS ?? 10000);

const t0 = Date.now();
console.log(`CFR ${ITERATIONS} 回 ...`);
const snap = runCfr(ITERATIONS);
const [e0, e1] = snap.average;
console.log(
  `  均衡値（先手） ${expectedValue(e0, e1).toFixed(4)}  搾取可能性 ${exploitability(e0, e1).toFixed(4)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
);

const r0 = roundToSixths(e0);
const r1 = roundToSixths(e1);
console.log(`丸め後の最悪ケース: 先手 ${worstCase(r0, 0).toFixed(4)} 後手 ${worstCase(r1, 1).toFixed(4)}`);

console.log('座標降下（先手）...');
const d0 = coordinateDescent(r0, 0, { onSweep: (s, w) => console.log(`  sweep ${s}: 最悪 ${w.toFixed(4)}`) });
console.log('座標降下（後手）...');
const d1 = coordinateDescent(r1, 1, { onSweep: (s, w) => console.log(`  sweep ${s}: 最悪 ${w.toFixed(4)}`) });

const b0 = baseTable(0);
const b1 = baseTable(1);
console.log(`均衡に近い表（先手）: 対基本表 ${expectedValue(d0.strategy, b1).toFixed(4)}  最悪 ${d0.worst.toFixed(4)}`);
console.log(`均衡に近い表（後手）: 対基本表 ${(-expectedValue(b0, d1.strategy)).toFixed(4)}  最悪 ${d1.worst.toFixed(4)}`);

console.log(`読み合いの繰り返し ${ITERATE_STEPS} 段 ...`);
const iterate = {
  steps: ITERATE_STEPS,
  start: ['base-0', 'base-1'],
  latest: iterateBestResponses([b0, b1], ITERATE_STEPS, 'latest').map((s) => [s.exploitLatest, s.exploitAverage, s.valueAverage]),
  average: [] as number[][],
};
const fpSteps = iterateBestResponses([b0, b1], ITERATE_STEPS, 'average');
iterate.average = fpSteps.map((s) => [s.exploitLatest, s.exploitAverage, s.valueAverage]);
const fpLast = fpSteps[fpSteps.length - 1];
console.log(
  `  直前の表に最適応答: 最終段の搾取可能性 ${iterate.latest[ITERATE_STEPS - 1][0].toFixed(3)}（平均の表 ${iterate.latest[ITERATE_STEPS - 1][1].toFixed(3)}）`,
);
console.log(`  平均の表に最適応答: 最終段の搾取可能性 ${fpLast.exploitLatest.toFixed(3)}（平均の表 ${fpLast.exploitAverage.toFixed(3)}、先手EV ${fpLast.valueAverage.toFixed(4)}）`);

console.log(`Restricted Nash Response（各 p で CFR ${RNR_ITERATIONS} 回）...`);
const rnr: Record<string, { p: number; vsModel: number; worst: number; strategy: Record<string, number> }[]> = {};
for (const modelPlayer of [0, 1] as const) {
  const model = modelPlayer === 0 ? b0 : b1;
  const id = modelPlayer === 0 ? 'base-0' : 'base-1';
  rnr[id] = rnrCurve(model, modelPlayer, RNR_PS, RNR_ITERATIONS, (r) =>
    console.log(`  モデル ${id}  p=${r.p.toFixed(1)}  対モデル ${r.vsModel.toFixed(4)}  最悪 ${r.worst.toFixed(4)}`),
  ).map((r) => ({ p: r.p, vsModel: r.vsModel, worst: r.worst, strategy: r.strategy }));
}

const presets = {
  generatedBy: 'scripts/generate-presets.ts',
  cfrIterations: ITERATIONS,
  equilibriumValueP0: expectedValue(e0, e1),
  /** 線形計画法（scripts/lp_equilibrium.py）による厳密値 */
  equilibriumValueExact: EQUILIBRIUM_VALUE_LP,
  /** 読み合いの繰り返し。各段 [その段の表の搾取可能性, 平均の表の搾取可能性, 平均の表の先手EV] */
  iterate,
  /** Restricted Nash Response の曲線。キーはモデルにした表の id、値は自分（反対の立場）の表 */
  rnrIterations: RNR_ITERATIONS,
  rnr,
  tables: [
    { id: 'base-0', name: '基本表（先手）', position: 0, strategy: b0, note: '主催者が設計した相手の表。段階1〜2で使う。' },
    { id: 'base-1', name: '基本表（後手）', position: 1, strategy: b1, note: '主催者が設計した相手の表。段階1〜2で使う。' },
    {
      id: 'neareq-0',
      name: '均衡に近い表（先手）',
      position: 0,
      strategy: d0.strategy,
      note: `CFR ${ITERATIONS} 回 → 1/6 刻みに丸め → 最悪ケースを改善する座標降下。最悪 ${d0.worst.toFixed(3)}。段階3〜4で使う。`,
    },
    {
      id: 'neareq-1',
      name: '均衡に近い表（後手）',
      position: 1,
      strategy: d1.strategy,
      note: `CFR ${ITERATIONS} 回 → 1/6 刻みに丸め → 最悪ケースを改善する座標降下。最悪 ${d1.worst.toFixed(3)}。段階4で使う。`,
    },
    {
      id: 'avg-0',
      name: `読み合いの平均（先手・${ITERATE_STEPS}段）`,
      position: 0,
      strategy: fpLast.average[0],
      note: `基本表から始めて、両者が「相手のこれまでの平均の表」に最適応答し続けた ${ITERATE_STEPS} 段の平均。搾取可能性 ${fpLast.exploitAverage.toFixed(3)}。段階4で使う。`,
    },
    {
      id: 'avg-1',
      name: `読み合いの平均（後手・${ITERATE_STEPS}段）`,
      position: 1,
      strategy: fpLast.average[1],
      note: `基本表から始めて、両者が「相手のこれまでの平均の表」に最適応答し続けた ${ITERATE_STEPS} 段の平均。搾取可能性 ${fpLast.exploitAverage.toFixed(3)}。段階4で使う。`,
    },
    {
      id: 'cfr-0',
      name: 'CFR均衡・未丸め（先手）',
      position: 0,
      strategy: e0,
      note: `CFR ${ITERATIONS} 回の平均戦略。参考用。`,
    },
    {
      id: 'cfr-1',
      name: 'CFR均衡・未丸め（後手）',
      position: 1,
      strategy: e1,
      note: `CFR ${ITERATIONS} 回の平均戦略。参考用。`,
    },
  ],
};

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/engine/presets.json');
writeFileSync(out, JSON.stringify(presets, null, 1) + '\n');
console.log(`書き出し: ${out}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
