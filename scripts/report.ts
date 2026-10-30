/**
 * 進行台本に載せる数値を一括で出力する。
 *
 *   npm run report
 *
 * presets.json を変えたら、この出力で docs/進行台本.md の数値を更新する。
 */
import { baseTable } from '../src/engine/baseTable';
import { HISTS, RANKS, type Position, type Strategy, allKeys, expectedValue, handValues, parseKey, r1Key, r2Key, valueFor } from '../src/engine/game';
import { bestResponse, counterChain, worstCase } from '../src/engine/bestResponse';
import { analyzeSituation } from '../src/engine/situation';
import { fmtFraction, fmtSixths } from '../src/engine/fraction';
import { GRID } from '../src/engine/search';
import presets from '../src/engine/presets.json';

const b0 = baseTable(0);
const b1 = baseTable(1);
const near0 = presets.tables.find((t) => t.id === 'neareq-0')!.strategy as Strategy;
const near1 = presets.tables.find((t) => t.id === 'neareq-1')!.strategy as Strategy;
const f = (x: number, d = 2) => (x >= 0 ? '+' : '') + x.toFixed(d);

console.log('# 数値レポート\n');
console.log(`CFR 反復回数: ${presets.cfrIterations}, 均衡値（先手）: CFR ${f(presets.equilibriumValueP0, 4)} / 線形計画法の厳密値 ${f(presets.equilibriumValueExact, 4)}\n`);

console.log('## 段階1');
let s = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['bet'], r2: [] });
console.log('問1 ベットされた:', s.posterior.map((r) => `${r.hand} ${fmtFraction(r.posterior)}`).join(', '));
console.log('問2 共有カード:', s.boardDist!.map((r) => `${r.board} ${fmtFraction(r.prob)}`).join(', '));
let t = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['check'], r2: [] });
console.log('問1続き チェックされた:', t.posterior.map((r) => `${r.hand} ${fmtFraction(r.posterior)}`).join(', '));
t = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['bet', 'call'], board: 'K', r2: ['bet'] });
console.log('問3(a):', t.posterior.map((r) => `${r.hand} ${fmtFraction(r.posterior)}`).join(', '), '|', t.decision!.map((o) => `${o.action} ${f(o.ev)}`).join(', '));
t = analyzeSituation({ me: 1, myHand: 'Q', opp: b0, r1: ['bet', 'call'], board: 'K', r2: ['check'] });
console.log('問3(b):', t.posterior.map((r) => `${r.hand} ${fmtFraction(r.posterior)}`).join(', '), '|', t.decision!.map((o) => `${o.action} ${f(o.ev)}`).join(', '));

console.log('\n## 段階2');
const call = s.decision!.find((o) => o.action === 'call')!;
console.log('問4 コール:', f(call.ev), '| 共有カード別:', call.byBoard!.map((r) => `${r.board} p=${fmtFraction(r.prob)} v=${f(r.value)}`).join(', '));
for (const h of RANKS) {
  const u = analyzeSituation({ me: 1, myHand: h, opp: b0, r1: ['bet'], r2: [] });
  console.log(`  手札${h}: コール ${f(u.decision!.find((o) => o.action === 'call')!.ev)}`);
}
const br0 = bestResponse(b1, 0);
const br1 = bestResponse(b0, 1);
console.log(`基本表への最適応答: 先手 ${f(br0.value)} 後手 ${f(br1.value)}（後手のタイ: ${br1.ties.join(', ') || 'なし'}）`);

console.log('\n## 段階3（均衡に近い表・先手の第1ラウンドJベット率を変える）');
console.log('| Jのベット率 | J | Q | K | 表全体 |');
for (let k = 0; k <= 6; k++) {
  const v = { ...near0, [r1Key('bet', 'J')]: k / 6 };
  const br = bestResponse(v, 1).strategy;
  const hv = handValues(v, br, 0);
  console.log(`| ${k}/6 | ${f(hv.J)} | ${f(hv.Q)} | ${f(hv.K)} | ${f(expectedValue(v, br), 3)} |`);
}

console.log('\n## 段階4');
const chain = counterChain(b1, 1, 4);
console.log('対策の連鎖:', chain.map((c) => `${c.step}: ${c.player === 0 ? '先手' : '後手'} ${f(c.gain)}（タイ${c.ties.length}・到達不能${c.unreachable.length}）`).join(' / '));
console.log('最悪ケース（先手の表）:');
console.log(`  基本表: 対基本 ${f(expectedValue(b0, b1))} 最悪 ${f(worstCase(b0, 0))}`);
console.log(`  基本表を突く表: 対基本 ${f(expectedValue(br0.strategy, b1))} 最悪 ${f(worstCase(br0.strategy, 0))}`);
console.log(`  均衡に近い表: 対基本 ${f(expectedValue(near0, b1))} 最悪 ${f(worstCase(near0, 0))}`);
console.log('最悪ケース（後手の表）:');
console.log(`  基本表: 対基本 ${f(-expectedValue(b0, b1))} 最悪 ${f(worstCase(b1, 1))}`);
console.log(`  基本表を突く表: 対基本 ${f(-expectedValue(b0, br1.strategy))} 最悪 ${f(worstCase(br1.strategy, 1))}`);
console.log(`  均衡に近い表: 対基本 ${f(-expectedValue(b0, near1))} 最悪 ${f(worstCase(near1, 1))}`);

console.log('\n## 段階3→4: 読み合いの繰り返し（出発点は基本表、両者同時に最適応答）');
console.log('| 段 | 直前の表に最適応答：その段の表の搾取可能性 | 平均に最適応答：その段の表 | 平均に最適応答：平均の表 | 平均の表どうしのEV（先手） |');
for (const t of [1, 2, 3, 5, 10, 20, 50, 100, 200, 400]) {
  if (t > presets.iterate.steps) break;
  const a = presets.iterate.latest[t - 1];
  const b = presets.iterate.average[t - 1];
  console.log(`| ${t} | ${a[0].toFixed(2)} | ${b[0].toFixed(2)} | ${b[1].toFixed(2)} | ${f(b[2], 3)} |`);
}

console.log('\n## 段階5: Restricted Nash Response（相手がモデルどおりに打つ確率 p）');
for (const id of ['base-0', 'base-1'] as const) {
  const me = id === 'base-0' ? '後手' : '先手';
  console.log(`モデル＝${id}、${me}の表。| p | 対モデル（攻め） | 最悪ケース（守り） |`);
  for (const r of presets.rnr[id]) console.log(`| ${r.p.toFixed(1)} | ${f(r.vsModel)} | ${f(r.worst)} |`);
}

console.log('\n## 段階5: 均衡に近い表から1マスだけ離れる（相手の癖＝基本表）');
function describeKey(key: string, pos: Position): string {
  const k = parseKey(key);
  const histLabel = { oppbet: '相手がベット', mebet: '自分がベット', check: '両者チェック' } as const;
  const act =
    k.kind === 'bet'
      ? pos === 0 || k.round === 2
        ? 'ベット'
        : 'チェックされたらベット'
      : pos === 0 && k.round === 1
        ? 'チェック後にベットされたらコール'
        : 'ベットされたらコール';
  return k.round === 1 ? `第1R 手札${k.hand} ${act}` : `第2R 手札${k.hand} 共有${k.board} ${histLabel[k.hist!]} ${act}`;
}
function deviations(mine: Strategy, me: Position, opp: Strategy) {
  const my = (s: Strategy) => (me === 0 ? valueFor(0, s, opp) : valueFor(1, opp, s));
  const base = my(mine);
  const out: { key: string; from: number; to: number; v: number; worst: number }[] = [];
  for (const k of allKeys()) {
    let best: { key: string; from: number; to: number; v: number; worst: number } | null = null;
    for (const g of GRID) {
      if (Math.abs(g - mine[k]) < 1e-9) continue;
      const v = my({ ...mine, [k]: g });
      if (!best || v > best.v) best = { key: k, from: mine[k], to: g, v, worst: 0 };
    }
    if (best && best.v > base + 1e-6) out.push(best);
  }
  out.sort((a, b) => b.v - a.v);
  const top = out.slice(0, 5);
  for (const d of top) d.worst = worstCase({ ...mine, [d.key]: d.to }, me);
  console.log(`  今: 対基本表 ${f(base, 3)} 最悪 ${f(worstCase(mine, me), 3)}`);
  for (const d of top) console.log(`  ${describeKey(d.key, me)} ${fmtSixths(d.from)}→${fmtSixths(d.to)}: 対基本表 ${f(d.v, 3)} 最悪 ${f(d.worst, 3)}`);
}
console.log('均衡に近い表（後手）vs 基本表（先手）:');
deviations(near1, 1, b0);
console.log('均衡に近い表（先手）vs 基本表（後手）:');
deviations(near0, 0, b1);

function printTable(name: string, st: Strategy, pos: 0 | 1) {
  const d1 = pos === 0 ? ['ベット', 'チェック後にベットされたらコール'] : ['ベットされたらコール', 'チェックされたらベット'];
  console.log(`\n### ${name}`);
  console.log(`第1ラウンド（${d1[0]} / ${d1[1]}）: ` + RANKS.map((h) => `${h} ${fmtSixths(st[r1Key('bet', h)])} / ${fmtSixths(st[r1Key('call', h)])}`).join(', '));
  const d2 = pos === 0 ? 'ベット / チェック後にベットされたらコール' : 'ベットされたらコール / チェックされたらベット';
  const histLabel = { oppbet: '相手がベット', mebet: '自分がベット', check: '両者チェック' } as const;
  for (const hist of HISTS) {
    console.log(`第2ラウンド・${histLabel[hist]}（${d2}）`);
    console.log('| 手札＼共有 | J | Q | K |');
    for (const h of RANKS) {
      const cells = RANKS.map((b) =>
        pos === 0
          ? `${fmtSixths(st[r2Key('bet', h, b, hist)])} / ${fmtSixths(st[r2Key('call', h, b, hist)])}`
          : `${fmtSixths(st[r2Key('call', h, b, hist)])} / ${fmtSixths(st[r2Key('bet', h, b, hist)])}`,
      );
      console.log(`| ${h} | ${cells.join(' | ')} |`);
    }
  }
}
printTable('均衡に近い表（先手）', near0, 0);
printTable('均衡に近い表（後手）', near1, 1);
