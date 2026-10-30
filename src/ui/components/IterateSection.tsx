import { useEffect, useRef, useState } from 'react';
import type { Position } from '../../engine/game';
import type { OpponentModel } from '../../engine/dynamics';
import presets from '../../engine/presets.json';
import type { IteratePoint, WorkerRequest, WorkerResponse } from '../worker';
import { BASE_ID, positionLabel, useStore } from '../store';
import { Ev, TableSelect } from './common';
import { LineChart } from './LineChart';

const COLOR_LATEST = '#2a78d6';
const COLOR_FP_LATEST = '#1baf7a';
const COLOR_FP_AVERAGE = '#eb6834';
const SHOW_STEPS = [1, 2, 3, 5, 10, 20, 50, 100, 200, 400];

interface Iterate {
  steps: number;
  start: string[];
  latest: number[][];
  average: number[][];
}
const PRESET: Iterate = presets.iterate as Iterate;

/** 「相手のモデル」を直前の表にするか、これまでの平均にするかで、読み合いの行き先が変わることを見せる */
export function IterateSection() {
  const store = useStore();
  const [start0, setStart0] = useState<string>(BASE_ID[0]);
  const [start1, setStart1] = useState<string>(BASE_ID[1]);
  const [steps, setSteps] = useState(200);
  const [model, setModel] = useState<OpponentModel>('average');
  const [live, setLive] = useState<{ model: OpponentModel; points: IteratePoint[] } | null>(null);
  const [progress, setProgress] = useState<IteratePoint | null>(null);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const workerRef = useRef<Worker | null>(null);
  const liveRef = useRef<{ model: OpponentModel; points: IteratePoint[] } | null>(null);
  const resultRef = useRef<{ latest: [Record<string, number>, Record<string, number>]; average: [Record<string, number>, Record<string, number>] } | null>(null);

  useEffect(() => {
    const w = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === 'iterate-progress') setProgress(m.point);
      else if (m.type === 'iterate-done') {
        const cur = liveRef.current;
        if (cur) setLive({ model: cur.model, points: m.points });
        resultRef.current = { latest: m.latest, average: m.average };
        setRunning(false);
      }
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const run = () => {
    const s0 = store.byId(start0)!;
    const s1 = store.byId(start1)!;
    liveRef.current = { model, points: [] };
    setLive(null);
    setProgress(null);
    setRunning(true);
    const req: WorkerRequest = { type: 'iterate', start: [s0.strategy, s1.strategy], steps, model };
    workerRef.current?.postMessage(req);
  };

  const stepsAxis = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
  const presetSeries = [
    {
      name: '直前の表に最適応答：その段の表',
      label: '直前モデル・各段',
      color: COLOR_LATEST,
      points: stepsAxis(PRESET.steps).map((t) => ({ x: t, y: PRESET.latest[t - 1][0] })),
    },
    {
      name: '平均の表に最適応答：その段の表',
      label: '平均モデル・各段',
      color: COLOR_FP_LATEST,
      points: stepsAxis(PRESET.steps).map((t) => ({ x: t, y: PRESET.average[t - 1][0] })),
      dashed: true,
    },
    {
      name: '平均の表に最適応答：平均の表',
      label: '平均モデル・平均の表',
      color: COLOR_FP_AVERAGE,
      points: stepsAxis(PRESET.steps).map((t) => ({ x: t, y: PRESET.average[t - 1][1] })),
    },
  ];

  return (
    <>
      <h2>相手のモデルを「これまでの平均」にする</h2>
      <p className="muted">
        対策の連鎖は「相手の<b>直前の表</b>」に最適応答する。代わりに「相手の<b>これまでの平均の表</b>」に最適応答し続けると（fictitious play, Brown 1951）、
        個々の表は尖ったままでも、<b>平均の表</b>は均衡に近づく（Robinson 1951）。搾取可能性（両者の最適応答で取れるチップの合計）が 0 に近いほど均衡に近い。
      </p>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>基本表から始めた {PRESET.steps} 段（あらかじめ計算）</h3>
        <LineChart
          series={presetSeries}
          xLabel="段数（対数目盛）"
          yLabel="搾取可能性（チップ／ハンド）"
          xScale="log"
          xTicks={[1, 2, 5, 10, 20, 50, 100, 200, 400]}
          referenceY={[{ value: 0, label: '均衡' }]}
          width={760}
          height={340}
        />
        <table className="data">
          <thead>
            <tr>
              <th>段</th>
              <th>直前の表に最適応答：その段の表</th>
              <th>平均の表に最適応答：その段の表</th>
              <th>平均の表に最適応答：平均の表</th>
              <th>平均の表どうしの期待値（先手）</th>
            </tr>
          </thead>
          <tbody>
            {SHOW_STEPS.filter((t) => t <= PRESET.steps).map((t) => (
              <tr key={t}>
                <td>{t}</td>
                <td>{PRESET.latest[t - 1][0].toFixed(2)}</td>
                <td>{PRESET.average[t - 1][0].toFixed(2)}</td>
                <td>
                  <b>{PRESET.average[t - 1][1].toFixed(2)}</b>
                </td>
                <td>
                  <Ev value={PRESET.average[t - 1][2]} digits={3} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          均衡値（先手）は {presets.equilibriumValueExact.toFixed(3)}。平均の表は「表を作る」の「読み合いの平均」として入っている。
        </p>
      </div>

      <h3>別の出発点・段数で回す</h3>
      <div className="controls">
        <TableSelect label="先手の出発点" position={0} value={start0} onChange={setStart0} />
        <TableSelect label="後手の出発点" position={1} value={start1} onChange={setStart1} />
        <label className="field">
          <span>段数</span>
          <input type="number" min={1} max={2000} value={steps} onChange={(e) => setSteps(Math.max(1, Math.min(2000, Number(e.target.value))))} style={{ width: '6rem' }} />
        </label>
        <div className="field">
          <span>相手のモデル</span>
          <div className="btn-group">
            <button className={model === 'latest' ? 'active' : ''} onClick={() => setModel('latest')}>
              直前の表
            </button>
            <button className={model === 'average' ? 'active' : ''} onClick={() => setModel('average')}>
              これまでの平均
            </button>
          </div>
        </div>
        <button className="primary" onClick={run} disabled={running}>
          {running ? `計算中… ${progress?.step ?? 0}/${steps}` : '回す'}
        </button>
      </div>
      {live && (
        <div className="panel">
          <LineChart
            series={[
              { name: 'その段の表', color: live.model === 'latest' ? COLOR_LATEST : COLOR_FP_LATEST, points: live.points.map((p) => ({ x: p.step, y: p.exploitLatest })), dashed: live.model === 'average' },
              { name: '平均の表', color: COLOR_FP_AVERAGE, points: live.points.map((p) => ({ x: p.step, y: p.exploitAverage })) },
            ]}
            xLabel="段数"
            yLabel="搾取可能性（チップ／ハンド）"
            xScale={live.points.length >= 20 ? 'log' : 'linear'}
            referenceY={[{ value: 0, label: '均衡' }]}
            width={760}
            height={340}
          />
          <div className="row">
            <span>
              最終段：その段の表 {live.points[live.points.length - 1].exploitLatest.toFixed(3)}、平均の表 <b>{live.points[live.points.length - 1].exploitAverage.toFixed(3)}</b>
              、平均の表どうしの期待値（先手） <Ev value={live.points[live.points.length - 1].valueAverage} digits={3} />
            </span>
            <button
              onClick={() => {
                const r = resultRef.current;
                if (!r) return;
                ([0, 1] as Position[]).forEach((p) => {
                  store.add({
                    name: `読み合いの平均（${positionLabel(p)}・${live.points.length}段・${live.model === 'latest' ? '直前' : '平均'}モデル）`,
                    position: p,
                    strategy: r.average[p],
                    note: `出発点 ${store.byId(start0)?.name} / ${store.byId(start1)?.name}。搾取可能性 ${live.points[live.points.length - 1].exploitAverage.toFixed(3)}`,
                  });
                });
                setMsg('平均の表を先手・後手とも保存しました。');
              }}
            >
              平均の表を保存
            </button>
            <span className="muted">{msg}</span>
          </div>
        </div>
      )}
    </>
  );
}
