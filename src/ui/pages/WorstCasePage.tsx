import { useMemo, useState } from 'react';
import type { Position } from '../../engine/game';
import { expectedValue } from '../../engine/game';
import { worstCase } from '../../engine/bestResponse';
import { BASE_ID, positionLabel, useStore } from '../store';
import presets from '../../engine/presets.json';
import { Ev, PositionButtons } from '../components/common';
import { StrategyTable } from '../components/StrategyTable';

export function WorstCasePage() {
  const store = useStore();
  const [pos, setPos] = useState<Position>(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = store.byPosition(pos);
  const base = store.byId(BASE_ID[(1 - pos) as Position])!.strategy;

  const rows = useMemo(
    () =>
      list.map((t) => ({
        t,
        vsBase: pos === 0 ? expectedValue(t.strategy, base) : -expectedValue(base, t.strategy),
        worst: worstCase(t.strategy, pos),
      })),
    [list, base, pos],
  );

  const p0s = store.byPosition(0);
  const p1s = store.byPosition(1);
  const matrix = useMemo(() => p0s.map((a) => p1s.map((b) => expectedValue(a.strategy, b.strategy))), [p0s, p1s]);

  const opened = openId ? store.byId(openId) : undefined;

  return (
    <div>
      <h1>最悪ケース</h1>
      <p className="lead">
        相手が分からないなら、相手が自分に最も都合の悪い対策（最適応答）をしてきたときの期待値で表を比べる。
        最悪ケースを最大にする表がミニマックスで、2人ゼロサムゲームではナッシュ均衡と一致する。段階4で使う。
      </p>

      <div className="controls">
        <PositionButtons label="比べる立場" value={pos} onChange={setPos} />
      </div>

      <div className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>{positionLabel(pos)}の表</th>
              <th>基本表の{positionLabel((1 - pos) as Position)}に対して</th>
              <th>最悪の相手に対して</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, vsBase, worst }) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>
                  <Ev value={vsBase} />
                </td>
                <td>
                  <Ev value={worst} />
                </td>
                <td>
                  <button className="ghost" onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                    {openId === t.id ? '表を隠す' : '表を見る'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          1ハンドあたりのチップ。均衡の値（先手）は {presets.equilibriumValueP0.toFixed(3)} で、先手の表の最悪ケースはこれ以下、後手の表の最悪ケースは {(-presets.equilibriumValueP0).toFixed(3)} 以下。
        </p>
      </div>

      {opened && (
        <div className="panel">
          <h3>
            {opened.name}（{positionLabel(opened.position)}）
          </h3>
          {opened.note && <p className="muted">{opened.note}</p>}
          <StrategyTable strategy={opened.strategy} position={opened.position} compact />
        </div>
      )}

      <h2>総当たり（先手の期待値）</h2>
      <p className="muted">行が先手の表、列が後手の表。正なら先手が勝つ。</p>
      <div className="panel" style={{ overflowX: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              <th>先手＼後手</th>
              {p1s.map((b) => (
                <th key={b.id}>{b.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {p0s.map((a, i) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                {p1s.map((b, j) => (
                  <td key={b.id}>
                    <Ev value={matrix[i][j]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
