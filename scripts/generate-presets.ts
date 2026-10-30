/**
 * プリセット表を生成して src/engine/presets.json に書き出す。
 *
 *   npm run presets
 *
 * 手順（決定的。乱数は使わない）:
 *   1. vanilla CFR を ITERATIONS 回まわして平均戦略（均衡の近似）を得る
 *   2. 各マスを 1/6 刻みに丸める
 *   3. 最悪ケース（最適応答してくる相手に対する期待値）が改善するマスだけを動かす座標降下
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runCfr } from '../src/engine/cfr';
import { roundToSixths, coordinateDescent } from '../src/engine/search';
import { worstCase, exploitability } from '../src/engine/bestResponse';
import { baseTable } from '../src/engine/baseTable';
import { expectedValue } from '../src/engine/game';

const ITERATIONS = Number(process.env.CFR_ITERATIONS ?? 20000);

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

const presets = {
  generatedBy: 'scripts/generate-presets.ts',
  cfrIterations: ITERATIONS,
  equilibriumValueP0: expectedValue(e0, e1),
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
