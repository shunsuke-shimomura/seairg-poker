import { useEffect, useMemo, useRef, useState } from 'react';
import type { Position, Strategy } from '../../engine/game';
import { allKeys, valueFor } from '../../engine/game';
import { worstCase } from '../../engine/bestResponse';
import { RNR_PS } from '../../engine/dynamics';
import { GRID } from '../../engine/search';
import { fmtSixths } from '../../engine/fraction';
import presets from '../../engine/presets.json';
import type { RnrPoint, WorkerRequest, WorkerResponse } from '../worker';
import { BASE_ID, NEAR_EQ_ID, positionLabel, useStore } from '../store';
import { Ev, TableSelect } from '../components/common';
import { LineChart } from '../components/LineChart';
import { StrategyTable, describeKey } from '../components/StrategyTable';

const COLOR_ATTACK = '#2a78d6';
const COLOR_DEFENSE = '#eb6834';
const LIVE_ITERATIONS = 3000;

type PresetRnr = Record<string, { p: number; vsModel: number; worst: number; strategy: Record<string, number> }[]>;
const PRESET_RNR = presets.rnr as PresetRnr;

function myValue(me: Position, mine: Strategy, opp: Strategy): number {
  return me === 0 ? valueFor(0, mine, opp) : valueFor(1, opp, mine);
}

export function TradeoffPage() {
  const store = useStore();
  const [modelId, setModelId] = useState<string>(BASE_ID[0]);
  const [selectedP, setSelectedP] = useState(0.5);
  const [live, setLive] = useState<RnrPoint[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const workerRef = useRef<Worker | null>(null);

  const model = store.byId(modelId) ?? store.tables[0];
  const me = (1 - model.position) as Position;

  useEffect(() => {
    const w = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === 'rnr-progress') setProgress({ done: m.done, total: m.total });
      else if (m.type === 'rnr-done') {
        setLive(m.points);
        setRunning(false);
      }
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  // プリセット（基本表）はあらかじめ計算してある。それ以外の表は Worker で計算する
  const preset = model.preset && PRESET_RNR[model.id] ? PRESET_RNR[model.id] : null;
  const points: RnrPoint[] | null = preset ? preset.map((r) => ({ ...r, strategy: r.strategy as Strategy })) : live;

  useEffect(() => {
    setLive(null);
    setProgress(null);
  }, [modelId]);

  const runLive = () => {
    setRunning(true);
    setProgress({ done: 0, total: RNR_PS.length });
    const req: WorkerRequest = { type: 'rnr', model: model.strategy, modelPlayer: model.position, ps: RNR_PS, iterations: LIVE_ITERATIONS };
    workerRef.current?.postMessage(req);
  };

  const selected = points?.reduce((best, r) => (Math.abs(r.p - selectedP) < Math.abs(best.p - selectedP) ? r : best), points[0]);
  const equilibrium = points?.find((r) => r.p === 0);
  const pureBr = points?.find((r) => r.p === 1);

  return (
    <div>
      <h1>攻めと守り</h1>
      <p className="lead">
        相手のモデルに最適応答する表は、モデルが当たれば最も得をするが、外れると最も大きく負ける。均衡の表はその逆。
        両者は対立ではなく、一本の線の両端にある。段階5で使う。
      </p>

      <div className="controls">
        <TableSelect label="相手のモデル（相手がこう打つと思っている表）" value={model.id} onChange={setModelId} />
        <span>
          → <b>{positionLabel(me)}</b>の表を作る
        </span>
        {!preset && (
          <button className="primary" onClick={runLive} disabled={running}>
            {running ? `計算中… ${progress?.done ?? 0}/${progress?.total ?? RNR_PS.length}` : `この表で計算する（各 p で CFR ${LIVE_ITERATIONS} 回）`}
          </button>
        )}
      </div>

      <div className="callout">
        <b>Restricted Nash Response</b>（Johanson, Zinkevich &amp; Bowling 2008）：相手は確率 <b>p</b> でモデルどおりに打ち、確率 <b>1 − p</b>{' '}
        でこちらの表を知った上で最適応答してくる、と考える。この相手に対して最も得な表を p ごとに求める。
        p = 1 ならモデルへの最適応答（段階2の表）、p = 0 なら均衡（段階4の表）。
      </div>

      {points ? (
        <>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>
              p を動かしたときの、{positionLabel(me)}の表の「攻め」と「守り」
            </h2>
            <LineChart
              series={[
                { name: 'モデルどおりの相手に対する期待値（攻め）', label: '攻め', color: COLOR_ATTACK, points: points.map((r) => ({ x: r.p, y: r.vsModel })) },
                { name: '最適応答してくる相手に対する期待値（守り）', label: '守り', color: COLOR_DEFENSE, points: points.map((r) => ({ x: r.p, y: r.worst })) },
              ]}
              xLabel="p（相手がモデルどおりに打つ確率）"
              yLabel="1ハンドあたりのチップ"
              xTicks={RNR_PS}
              xFormat={(x) => x.toFixed(1)}
              referenceY={[{ value: 0, label: '0' }]}
            />
            <table className="data">
              <thead>
                <tr>
                  <th>p</th>
                  <th>モデルどおりの相手に対して（攻め）</th>
                  <th>最適応答してくる相手に対して（守り）</th>
                  <th>均衡の表と違うマス</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {points.map((r) => {
                  const diff = equilibrium ? allKeys().filter((k) => Math.abs(r.strategy[k] - equilibrium.strategy[k]) > 1 / 12).length : 0;
                  return (
                    <tr key={r.p} className={selected && r.p === selected.p ? 'best' : ''}>
                      <td>
                        {r.p.toFixed(1)}
                        {r.p === 0 && <small className="muted">（均衡）</small>}
                        {r.p === 1 && <small className="muted">（最適応答）</small>}
                      </td>
                      <td>
                        <Ev value={r.vsModel} />
                      </td>
                      <td>
                        <Ev value={r.worst} />
                      </td>
                      <td>{diff}</td>
                      <td>
                        <button className="ghost" onClick={() => setSelectedP(r.p)}>
                          表を見る
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="muted">
              「違うマス」は 1/12 より大きく値が違うマスの数。
              {pureBr && equilibrium && (
                <>
                  {' '}
                  p = 1 の最適応答は均衡より <Ev value={pureBr.vsModel - equilibrium.vsModel} /> 多く取るが、最悪ケースは <Ev value={pureBr.worst - equilibrium.worst} /> 悪い。
                </>
              )}
            </p>
          </div>

          {selected && (
            <div className="panel">
              <div className="row">
                <h3 style={{ margin: 0 }}>
                  p = {selected.p.toFixed(1)} の{positionLabel(me)}の表
                </h3>
                <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                  <span>p</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={selected.p}
                    onChange={(e) => setSelectedP(Number(e.target.value))}
                    aria-label="p"
                  />
                </label>
                <span>
                  攻め <Ev value={selected.vsModel} />　守り <Ev value={selected.worst} />
                </span>
                <button
                  onClick={() => {
                    store.add({
                      name: `RNR p=${selected.p.toFixed(1)}：${model.name}を相手に（${positionLabel(me)}）`,
                      position: me,
                      strategy: selected.strategy,
                      note: `Restricted Nash Response。対モデル ${selected.vsModel.toFixed(3)}、最悪 ${selected.worst.toFixed(3)}`,
                    });
                    setMsg('保存しました。');
                  }}
                >
                  この表を保存
                </button>
                <span className="muted">{msg}</span>
              </div>
              <p className="muted">赤の破線：p = 0（均衡）の表と 1/12 より大きく違うマス。p を上げるほど、モデルの弱点を突くマスが増える。</p>
              <StrategyTable strategy={selected.strategy} position={me} compare={equilibrium?.strategy} compact />
            </div>
          )}
        </>
      ) : (
        <p className="muted">この表はあらかじめ計算してありません。「この表で計算する」を押すと数十秒で曲線が出ます。</p>
      )}

      <DeviationSection />
    </div>
  );
}

/** 均衡に近い表から、相手のズレに合わせて1マスだけ離れるとどうなるか */
function DeviationSection() {
  const store = useStore();
  const [myId, setMyId] = useState<string>(NEAR_EQ_ID[1]);
  const [oppId, setOppId] = useState<string>(BASE_ID[0]);
  const [msg, setMsg] = useState('');

  const mine = store.byId(myId) ?? store.tables[0];
  const me = mine.position;
  const oppCandidates = store.byPosition((1 - me) as Position);
  const opp = store.byId(oppId)?.position === (1 - me) ? store.byId(oppId)! : oppCandidates[0];

  const base = useMemo(() => ({ vsModel: myValue(me, mine.strategy, opp.strategy), worst: worstCase(mine.strategy, me) }), [me, mine, opp]);

  const deviations = useMemo(() => {
    const out: { key: string; from: number; to: number; vsModel: number; worst: number }[] = [];
    for (const k of allKeys()) {
      let best: { key: string; from: number; to: number; vsModel: number; worst: number } | null = null;
      for (const g of GRID) {
        if (Math.abs(g - mine.strategy[k]) < 1e-9) continue;
        const s = { ...mine.strategy, [k]: g };
        const v = myValue(me, s, opp.strategy);
        if (!best || v > best.vsModel) best = { key: k, from: mine.strategy[k], to: g, vsModel: v, worst: NaN };
      }
      if (best && best.vsModel > base.vsModel + 1e-6) out.push(best);
    }
    out.sort((a, b) => b.vsModel - a.vsModel);
    const top = out.slice(0, 6);
    for (const d of top) d.worst = worstCase({ ...mine.strategy, [d.key]: d.to }, me);
    return top;
  }, [mine, me, opp, base]);

  return (
    <>
      <h2>均衡からズレを見て離れる</h2>
      <p className="muted">
        均衡に近い表を頭の中のモデルとして持ち、相手の癖（モデル）に気づいたら、その癖を突くマスだけ動かす。1マス動かすごとに「攻め」がいくら増え、「守り」がいくら減るか。
      </p>
      <div className="controls">
        <TableSelect label="自分の表（頭の中のモデル）" value={mine.id} onChange={setMyId} />
        <TableSelect label="相手の癖（相手がこう打つと気づいた）" position={(1 - me) as Position} value={opp.id} onChange={setOppId} />
      </div>
      <div className="panel">
        <p>
          今の表：{mine.name}。{opp.name}に対して <Ev value={base.vsModel} />、最悪ケース <Ev value={base.worst} />。
        </p>
        {deviations.length === 0 ? (
          <p className="muted">1マスの変更で得になるものはありません（この相手にはすでに最適応答している）。</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>動かすマス</th>
                <th>値</th>
                <th>{opp.name}に対して（攻め）</th>
                <th>最悪ケース（守り）</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {deviations.map((d) => (
                <tr key={d.key}>
                  <td>{describeKey(d.key, me)}</td>
                  <td>
                    {fmtSixths(d.from)} → <b>{fmtSixths(d.to)}</b>
                  </td>
                  <td>
                    <Ev value={d.vsModel} />{' '}
                    <small className="muted">
                      （<Ev value={d.vsModel - base.vsModel} />）
                    </small>
                  </td>
                  <td>
                    <Ev value={d.worst} />{' '}
                    <small className="muted">
                      （<Ev value={d.worst - base.worst} />）
                    </small>
                  </td>
                  <td>
                    <button
                      className="ghost"
                      onClick={() => {
                        const t = store.add({
                          name: `${mine.name}／${describeKey(d.key, me)}＝${fmtSixths(d.to)}`,
                          position: me,
                          strategy: { ...mine.strategy, [d.key]: d.to },
                          note: `${opp.name}の癖を突くために1マス動かした。対モデル ${d.vsModel.toFixed(3)}、最悪 ${d.worst.toFixed(3)}`,
                        });
                        setMsg(`「${t.name}」として保存しました。「表を作る」から選んで、さらに動かせます。`);
                      }}
                    >
                      保存
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted">攻めが増える順に上位6マス。{msg}</p>
      </div>
    </>
  );
}
