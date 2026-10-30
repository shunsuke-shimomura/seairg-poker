import { useMemo, useState } from 'react';
import type { Position, Strategy } from '../../engine/game';
import { RANKS, allKeys, expectedValue, handValues } from '../../engine/game';
import { bestResponse } from '../../engine/bestResponse';
import { GRID } from '../../engine/search';
import { fmtSixths } from '../../engine/fraction';
import { NEAR_EQ_ID, positionLabel, useStore } from '../store';
import { Ev, TableSelect } from '../components/common';
import { StrategyTable, describeKey } from '../components/StrategyTable';

function evalAgainstBr(strategy: Strategy, position: Position) {
  const br = bestResponse(strategy, (1 - position) as Position);
  const hands = position === 0 ? handValues(strategy, br.strategy, 0) : handValues(br.strategy, strategy, 1);
  const total = position === 0 ? expectedValue(strategy, br.strategy) : -expectedValue(br.strategy, strategy);
  return { br: br.strategy, hands, total };
}

export function HandEvPage() {
  const store = useStore();
  const [myId, setMyId] = useState<string>(NEAR_EQ_ID[0]);
  const [cell, setCell] = useState<string>('r1|bet|J');
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [msg, setMsg] = useState('');

  const mine = store.byId(myId) ?? store.tables[0];
  const opp = (1 - mine.position) as Position;

  const current = useMemo(() => evalAgainstBr(mine.strategy, mine.position), [mine]);

  const sweep = useMemo(() => {
    return GRID.map((g) => {
      const s = { ...mine.strategy, [cell]: g };
      const r = evalAgainstBr(s, mine.position);
      const changed = allKeys().filter((k) => Math.abs(r.br[k] - current.br[k]) > 1e-9);
      return { value: g, ...r, changed };
    });
  }, [mine, cell, current]);

  const bestTotal = Math.max(...sweep.map((r) => r.total));
  const bestHand: Record<string, number> = {};
  for (const h of RANKS) bestHand[h] = Math.max(...sweep.map((r) => r.hands[h]));
  const currentValue = mine.strategy[cell];

  return (
    <div>
      <h1>手札別の期待値</h1>
      <p className="lead">
        自分の表に対して相手が最適応答してきたときの、手札ごとの期待値。表の1マスを動かすと、相手の対応が変わり、別の手の価値まで動く。段階3で使う。
      </p>

      <div className="controls">
        <TableSelect label="自分の表" value={mine.id} onChange={setMyId} />
        <span>
          相手（{positionLabel(opp)}）は最適応答してくるとする
        </span>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>今の表：{mine.name}</h2>
        <table className="data">
          <thead>
            <tr>
              <th>自分の手札</th>
              {RANKS.map((h) => (
                <th key={h}>{h}を持ったとき</th>
              ))}
              <th>表全体</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>期待値（1ハンドあたり）</td>
              {RANKS.map((h) => (
                <td key={h}>
                  <Ev value={current.hands[h]} />
                </td>
              ))}
              <td>
                <Ev value={current.total} digits={3} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>1マスを動かす</h2>
      <p className="muted">下の表でマスをクリックして選ぶ（青枠）。選んだマスを 0/6〜6/6 に変えたときの、手札別の期待値を並べる。</p>
      <div className="panel">
        <p>
          選んだマス：<b>{describeKey(cell, mine.position)}</b>（今の値 {fmtSixths(currentValue)}）
        </p>
        <table className="data">
          <thead>
            <tr>
              <th>このマスの値</th>
              {RANKS.map((h) => (
                <th key={h}>{h}を持ったとき</th>
              ))}
              <th>表全体</th>
              <th>相手の最適応答で変わるマス</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sweep.map((r, i) => (
              <tr key={i} className={Math.abs(r.total - bestTotal) < 1e-9 ? 'best' : ''}>
                <td>
                  {fmtSixths(r.value)}
                  {Math.abs(r.value - currentValue) < 1e-9 && <small className="muted">（今）</small>}
                </td>
                {RANKS.map((h) => (
                  <td key={h} className={Math.abs(r.hands[h] - bestHand[h]) < 1e-9 ? 'best' : ''}>
                    <Ev value={r.hands[h]} />
                  </td>
                ))}
                <td>
                  <Ev value={r.total} digits={3} />
                </td>
                <td>
                  {r.changed.length === 0 ? (
                    <span className="muted">変わらない</span>
                  ) : (
                    <button className="ghost" onClick={() => setOpenRow(openRow === i ? null : i)}>
                      {r.changed.length} 個 {openRow === i ? '▲' : '▼'}
                    </button>
                  )}
                </td>
                <td>
                  {Math.abs(r.value - currentValue) >= 1e-9 && (
                    <button
                      className="ghost"
                      onClick={() => {
                        const t = store.add({
                          name: `${mine.name}／${describeKey(cell, mine.position)}＝${fmtSixths(r.value)}`,
                          position: mine.position,
                          strategy: { ...mine.strategy, [cell]: r.value },
                          note: `${mine.name} の1マスを変えたもの`,
                        });
                        setMsg(`「${t.name}」として保存しました`);
                      }}
                    >
                      この値で保存
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">緑：その列で最大。{msg}</p>
        {openRow !== null && (
          <div className="callout">
            <b>
              このマスを {fmtSixths(sweep[openRow].value)} にすると、相手（{positionLabel(opp)}）の最適応答で変わるマス：
            </b>
            <ul>
              {sweep[openRow].changed.map((k) => (
                <li key={k}>
                  {describeKey(k, opp)}：{fmtSixths(current.br[k])} → {fmtSixths(sweep[openRow].br[k])}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>自分の表（マスをクリックして選ぶ）</h3>
        <StrategyTable strategy={mine.strategy} position={mine.position} selected={cell} onSelect={setCell} compact />
      </div>

      <div className="panel">
        <h3>相手（{positionLabel(opp)}）の最適応答</h3>
        <StrategyTable strategy={current.br} position={opp} compact />
      </div>
    </div>
  );
}
