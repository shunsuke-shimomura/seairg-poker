import { useMemo, useState } from 'react';
import type { Position } from '../../engine/game';
import { RANKS, handValues } from '../../engine/game';
import { bestResponse, counterChain, worstCase } from '../../engine/bestResponse';
import { BASE_ID, positionLabel, useStore } from '../store';
import { Ev, TableSelect } from '../components/common';
import { StrategyTable, describeKey } from '../components/StrategyTable';
import { IterateSection } from '../components/IterateSection';

export function BestResponsePage() {
  const store = useStore();
  const [targetId, setTargetId] = useState<string>(BASE_ID[1]);
  const [saveName, setSaveName] = useState('');
  const [chainStartId, setChainStartId] = useState<string>(BASE_ID[1]);
  const [chainN, setChainN] = useState(4);
  const [chainRun, setChainRun] = useState(0);
  const [msg, setMsg] = useState('');

  const target = store.byId(targetId) ?? store.tables[0];
  const me = (1 - target.position) as Position;

  const br = useMemo(() => bestResponse(target.strategy, me), [target, me]);
  const hands = useMemo(
    () => (me === 0 ? handValues(br.strategy, target.strategy, 0) : handValues(target.strategy, br.strategy, 1)),
    [br, target, me],
  );
  const worst = useMemo(() => worstCase(br.strategy, me), [br, me]);

  const chainStart = store.byId(chainStartId) ?? store.tables[0];
  const chain = useMemo(
    () => (chainRun > 0 ? counterChain(chainStart.strategy, chainStart.position, chainN) : null),
    // chainRun を変えたときだけ計算し直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainRun],
  );
  const chainWorst = useMemo(() => chain?.map((c) => worstCase(c.strategy, c.player)) ?? [], [chain]);

  const defaultName = `対策：${target.name}を突く（${positionLabel(me)}）`;
  const highlight = new Set([...br.ties, ...br.unreachable]);

  return (
    <div>
      <h1>最適応答</h1>
      <p className="lead">相手の表を固定し、第2ラウンドから後ろ向きにすべてのマスを最善にした表。段階2（基本表への最適応答）、段階3（対策の連鎖）、段階4（読み合いの平均）で使う。</p>

      <div className="controls">
        <TableSelect label="突く相手の表" value={target.id} onChange={setTargetId} />
        <span>
          → <b>{positionLabel(me)}</b>の最適応答を作る
        </span>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>
          {positionLabel(me)}の最適応答：1ハンドあたり <Ev value={br.value} /> を{target.name}から取る
        </h2>
        <table className="data">
          <thead>
            <tr>
              <th>自分の手札</th>
              {RANKS.map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th>表全体</th>
              <th>この表の最悪ケース</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>期待値</td>
              {RANKS.map((h) => (
                <td key={h}>
                  <Ev value={hands[h]} />
                </td>
              ))}
              <td>
                <Ev value={br.value} />
              </td>
              <td>
                <Ev value={worst} />
              </td>
            </tr>
          </tbody>
        </table>
        <div className="legend">
          <span>
            <span className="prob tie" style={{ background: 'rgba(37,99,235,0.3)' }}>
              3/6
            </span>{' '}
            タイ（どちらでも同じ）または相手が来ないマス → 1/2 にする
          </span>
        </div>
        {br.ties.length > 0 && (
          <p className="muted">
            タイ：{br.ties.map((k) => describeKey(k, me)).join('、')}
          </p>
        )}
        {br.unreachable.length > 0 && (
          <p className="muted">相手の表ではそこに来ないので決めようのないマス：{br.unreachable.length} 個</p>
        )}
        <StrategyTable strategy={br.strategy} position={me} highlight={highlight} />
        <div className="row" style={{ marginTop: '0.6rem' }}>
          <input type="text" placeholder={defaultName} value={saveName} onChange={(e) => setSaveName(e.target.value)} style={{ minWidth: '24rem' }} />
          <button
            className="primary"
            onClick={() => {
              store.add({
                name: saveName.trim() || defaultName,
                position: me,
                strategy: br.strategy,
                note: `${target.name}への最適応答（+${br.value.toFixed(2)}）`,
              });
              setMsg('保存しました。「表を作る」「最悪ケース」で確認できます。');
              setSaveName('');
            }}
          >
            この表を保存
          </button>
          <span className="muted">{msg}</span>
        </div>
      </div>

      <h2>対策の連鎖</h2>
      <p className="muted">ある表から始めて、相手の直前の表への最適応答を交互にとる。相手を突くたびに大きく勝ち、突かれるたびに大きく負ける。何段続けても落ち着かない。</p>
      <div className="controls">
        <TableSelect label="出発点の表" value={chainStart.id} onChange={setChainStartId} />
        <label className="field">
          <span>段数</span>
          <input type="number" min={1} max={10} value={chainN} onChange={(e) => setChainN(Math.max(1, Math.min(10, Number(e.target.value))))} style={{ width: '5rem' }} />
        </label>
        <button className="primary" onClick={() => setChainRun((n) => n + 1)}>
          連鎖を作る
        </button>
      </div>
      {chain && (
        <div className="panel">
          <table className="data">
            <thead>
              <tr>
                <th>段</th>
                <th>誰が誰に対策するか</th>
                <th>対策した側が1ハンドで得るチップ</th>
                <th>その表の最悪ケース</th>
                <th>タイ／来ないマス</th>
              </tr>
            </thead>
            <tbody>
              {chain.map((c, i) => (
                <tr key={c.step}>
                  <td>{c.step}</td>
                  <td style={{ textAlign: 'left' }}>
                    {positionLabel(c.player)}が、{i === 0 ? chainStart.name : `${i}の${positionLabel((1 - c.player) as Position)}`}を突く
                  </td>
                  <td>
                    <Ev value={c.gain} />
                  </td>
                  <td>
                    <Ev value={chainWorst[i]} />
                  </td>
                  <td>
                    {c.ties.length}／{c.unreachable.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => {
              chain.forEach((c, i) => {
                store.add({
                  name: `連鎖${c.step}：${positionLabel(c.player)}が${i === 0 ? chainStart.name : `連鎖${i}`}を突く`,
                  position: c.player,
                  strategy: c.strategy,
                  note: `対策の連鎖 第${c.step}段（+${c.gain.toFixed(2)}）`,
                });
              });
              setMsg('連鎖の表をすべて保存しました。');
            }}
          >
            連鎖の表をすべて保存
          </button>
          <span className="muted" style={{ marginLeft: 8 }}>
            {msg}
          </span>
        </div>
      )}

      <IterateSection />
    </div>
  );
}
