import { useEffect, useRef, useState } from 'react';
import type { Position, Strategy } from '../../engine/game';
import { expectedValue } from '../../engine/game';
import { worstCase } from '../../engine/bestResponse';
import { roundToSixths } from '../../engine/search';
import type { WorkerRequest, WorkerResponse } from '../worker';
import { BASE_ID, NEAR_EQ_ID, positionLabel, useStore } from '../store';
import { Ev } from '../components/common';
import { StrategyTable } from '../components/StrategyTable';

interface CfrResult {
  iterations: number;
  average: [Strategy, Strategy];
  value: number;
  exploitability: number;
}

interface GridResult {
  strategy: Strategy;
  worst: number;
  sweeps: number;
}

export function EquilibriumPage() {
  const store = useStore();
  const [iterations, setIterations] = useState(20000);
  const [running, setRunning] = useState<'cfr' | 'descent' | null>(null);
  const [progress, setProgress] = useState<{ iterations: number; value: number; exploitability: number } | null>(null);
  const [result, setResult] = useState<CfrResult | null>(null);
  const [descentPlayer, setDescentPlayer] = useState<Position>(0);
  const [descentProgress, setDescentProgress] = useState<{ sweep: number; worst: number } | null>(null);
  const [grid, setGrid] = useState<[GridResult | null, GridResult | null]>([null, null]);
  const [msg, setMsg] = useState('');
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    const w = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === 'cfr-progress') setProgress({ iterations: m.iterations, value: m.value, exploitability: m.exploitability });
      else if (m.type === 'cfr-done') {
        setResult({ iterations: m.iterations, average: m.average, value: m.value, exploitability: m.exploitability });
        setGrid([null, null]);
        setRunning(null);
      } else if (m.type === 'descent-progress') setDescentProgress({ sweep: m.sweep, worst: m.worst });
      else if (m.type === 'descent-done') {
        setGrid((g) => {
          const next: [GridResult | null, GridResult | null] = [g[0], g[1]];
          next[descentPlayerRef.current] = { strategy: m.strategy, worst: m.worst, sweeps: m.sweeps };
          return next;
        });
        setRunning(null);
      }
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const descentPlayerRef = useRef<Position>(0);

  const send = (req: WorkerRequest) => workerRef.current?.postMessage(req);

  const runCfr = () => {
    setRunning('cfr');
    setProgress(null);
    setResult(null);
    send({ type: 'cfr', iterations });
  };

  const runDescent = (p: Position) => {
    if (!result) return;
    setDescentPlayer(p);
    descentPlayerRef.current = p;
    setDescentProgress(null);
    setRunning('descent');
    send({ type: 'descent', strategy: roundToSixths(result.average[p]), player: p });
  };

  const base0 = store.byId(BASE_ID[0])!.strategy;
  const base1 = store.byId(BASE_ID[1])!.strategy;
  const near0 = store.byId(NEAR_EQ_ID[0])!;
  const near1 = store.byId(NEAR_EQ_ID[1])!;

  const save = (name: string, position: Position, strategy: Strategy, note: string) => {
    store.add({ name, position, strategy, note });
    setMsg(`「${name}」を保存しました`);
  };

  return (
    <div>
      <h1>均衡を求める</h1>
      <p className="lead">
        反実仮想後悔最小化（CFR, Zinkevich et al. 2007）で、両者が同時に「これまでの後悔」を減らすように表を更新し続けると、
        平均の表がナッシュ均衡に近づく。求めた表を1/6刻みに丸め、最悪ケースを改善する座標降下で「均衡に近い表」を作る。
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>最初から入っている「均衡に近い表」</h2>
        <table className="data">
          <thead>
            <tr>
              <th>表</th>
              <th>基本表に対して</th>
              <th>最悪の相手に対して</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{near0.name}</td>
              <td>
                <Ev value={expectedValue(near0.strategy, base1)} />
              </td>
              <td>
                <Ev value={worstCase(near0.strategy, 0)} />
              </td>
            </tr>
            <tr>
              <td>{near1.name}</td>
              <td>
                <Ev value={-expectedValue(base0, near1.strategy)} />
              </td>
              <td>
                <Ev value={worstCase(near1.strategy, 1)} />
              </td>
            </tr>
          </tbody>
        </table>
        <p className="muted">{near0.note}</p>
      </div>

      <h2>CFR をその場で回す</h2>
      <div className="controls">
        <label className="field">
          <span>反復回数</span>
          <input type="number" min={100} max={200000} step={100} value={iterations} onChange={(e) => setIterations(Number(e.target.value))} style={{ width: '8rem' }} />
        </label>
        <button className="primary" onClick={runCfr} disabled={running !== null}>
          {running === 'cfr' ? '計算中…' : '実行'}
        </button>
        {progress && (
          <div style={{ minWidth: '20rem' }}>
            <div className="progress">
              <div style={{ width: `${(100 * progress.iterations) / iterations}%` }} />
            </div>
            <small className="muted">
              {progress.iterations} 回　均衡値（先手） {progress.value.toFixed(4)}　搾取可能性 {progress.exploitability.toFixed(4)}
            </small>
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="panel">
            <h3>
              結果：{result.iterations} 回　先手の均衡値 <Ev value={result.value} digits={4} />　搾取可能性 {result.exploitability.toFixed(4)}
            </h3>
            <p className="muted">搾取可能性＝両者の最悪ケースの和の符号反転。0に近いほど均衡に近い。</p>
            <div className="grid2">
              {([0, 1] as Position[]).map((p) => (
                <div key={p}>
                  <div className="row">
                    <h3 style={{ margin: 0 }}>{positionLabel(p)}の平均戦略（未丸め）</h3>
                    <span className="muted">
                      最悪 <Ev value={worstCase(result.average[p], p)} digits={3} />
                    </span>
                    <button onClick={() => save(`CFR ${result.iterations}回（${positionLabel(p)}）`, p, result.average[p], 'CFR の平均戦略（未丸め）')}>保存</button>
                  </div>
                  <StrategyTable strategy={result.average[p]} position={p} compact />
                </div>
              ))}
            </div>
          </div>

          <h2>1/6 刻みに丸めて、最悪ケースを改善する</h2>
          <div className="controls">
            {([0, 1] as Position[]).map((p) => (
              <button key={p} onClick={() => runDescent(p)} disabled={running !== null}>
                {running === 'descent' && descentPlayer === p ? '計算中…' : `${positionLabel(p)}の表を作る`}
              </button>
            ))}
            {descentProgress && running === 'descent' && (
              <small className="muted">
                sweep {descentProgress.sweep}　最悪 {descentProgress.worst.toFixed(4)}
              </small>
            )}
            <span className="muted">{msg}</span>
          </div>
          <div className="grid2">
            {([0, 1] as Position[]).map((p) => {
              const g = grid[p];
              if (!g) return null;
              const rounded = roundToSixths(result.average[p]);
              return (
                <div className="panel" key={p}>
                  <div className="row">
                    <h3 style={{ margin: 0 }}>{positionLabel(p)}・1/6刻み</h3>
                    <span className="muted">
                      丸めただけ：最悪 <Ev value={worstCase(rounded, p)} digits={3} /> → 座標降下後：最悪 <Ev value={g.worst} digits={3} />（{g.sweeps} sweep）
                    </span>
                    <button
                      className="primary"
                      onClick={() => save(`均衡に近い表・自作（${positionLabel(p)}）`, p, g.strategy, `CFR ${result.iterations}回 → 丸め → 座標降下。最悪 ${g.worst.toFixed(3)}`)}
                    >
                      保存
                    </button>
                  </div>
                  <StrategyTable strategy={g.strategy} position={p} compare={rounded} compact />
                  <p className="muted">赤の破線：丸めただけの表から座標降下で変わったマス</p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
