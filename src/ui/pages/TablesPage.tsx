import { useMemo, useRef, useState } from 'react';
import type { Position } from '../../engine/game';
import { expectedValue } from '../../engine/game';
import { worstCase } from '../../engine/bestResponse';
import { baseTable } from '../../engine/baseTable';
import { BASE_ID, positionLabel, useStore } from '../store';
import { Ev } from '../components/common';
import { StrategyTable } from '../components/StrategyTable';

export function TablesPage() {
  const store = useStore();
  const [selectedId, setSelectedId] = useState<string>(BASE_ID[0]);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = store.byId(selectedId) ?? store.tables[0];

  const stats = useMemo(() => {
    if (!selected) return null;
    const base = store.byId(BASE_ID[(1 - selected.position) as Position])!.strategy;
    const vsBase = selected.position === 0 ? expectedValue(selected.strategy, base) : -expectedValue(base, selected.strategy);
    return { vsBase, worst: worstCase(selected.strategy, selected.position) };
  }, [selected, store]);

  if (!selected) return <p>表がありません。</p>;

  const duplicate = () => {
    const t = store.add({ name: `${selected.name}のコピー`, position: selected.position, strategy: { ...selected.strategy }, note: '' });
    setSelectedId(t.id);
  };
  const createNew = (position: Position) => {
    const t = store.add({ name: `新しい表（${positionLabel(position)}）`, position, strategy: baseTable(position), note: '基本表から作成' });
    setSelectedId(t.id);
  };
  const download = () => {
    const blob = new Blob([store.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leduc-tables.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const doImport = (text: string) => {
    try {
      const n = store.importJson(text);
      setMsg(`${n} 個の表を読み込みました`);
      setImportText('');
    } catch (e) {
      setMsg(`読み込みに失敗: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <h1>表を作る</h1>
      <p className="lead">行動表の一覧と編集。プリセットは編集できないので、複製してから変えてください。ユーザーの表はこのブラウザに保存されます。</p>

      <div className="grid2" style={{ gridTemplateColumns: 'minmax(280px, 1fr) 3fr' }}>
        <div>
          {([0, 1] as Position[]).map((p) => (
            <div className="panel" key={p}>
              <h3>{positionLabel(p)}の表</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {store.byPosition(p).map((t) => (
                  <li key={t.id} style={{ margin: '0.2rem 0' }}>
                    <button className={t.id === selected.id ? 'active' : ''} style={{ width: '100%', textAlign: 'left' }} onClick={() => setSelectedId(t.id)}>
                      {t.name}
                      {t.preset && <small className="muted">　プリセット</small>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <button onClick={() => createNew(p)}>基本表から新規作成</button>
              </div>
            </div>
          ))}
          <div className="panel">
            <h3>書き出し・読み込み</h3>
            <div className="row">
              <button onClick={download}>ユーザーの表をJSONで保存</button>
              <button onClick={() => fileRef.current?.click()}>JSONファイルを読み込む</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) doImport(await f.text());
                  e.target.value = '';
                }}
              />
            </div>
            <textarea placeholder="ここにJSONを貼り付けて読み込むこともできます" value={importText} onChange={(e) => setImportText(e.target.value)} />
            <div className="row">
              <button onClick={() => doImport(importText)} disabled={!importText.trim()}>
                貼り付けたJSONを読み込む
              </button>
              <span className="muted">{msg}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="row">
              {selected.preset ? (
                <h2 style={{ margin: 0, border: 'none', padding: 0 }}>{selected.name}</h2>
              ) : (
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => store.update(selected.id, { name: e.target.value })}
                  style={{ fontSize: '1.2rem', fontWeight: 'bold', minWidth: '20rem' }}
                />
              )}
              <span className="chip">{positionLabel(selected.position)}</span>
              <span className="spacer" />
              <button onClick={duplicate}>複製して編集</button>
              {!selected.preset && (
                <button
                  onClick={() => {
                    if (confirm(`「${selected.name}」を削除しますか？`)) {
                      store.remove(selected.id);
                      setSelectedId(BASE_ID[selected.position]);
                    }
                  }}
                >
                  削除
                </button>
              )}
            </div>
            {selected.preset ? (
              selected.note && <p className="muted">{selected.note}</p>
            ) : (
              <input
                type="text"
                placeholder="メモ"
                value={selected.note ?? ''}
                onChange={(e) => store.update(selected.id, { note: e.target.value })}
                style={{ width: '100%', marginTop: '0.4rem' }}
              />
            )}
            {stats && (
              <p>
                基本表（{positionLabel((1 - selected.position) as Position)}）に対して <Ev value={stats.vsBase} />　／　最悪の相手に対して <Ev value={stats.worst} />
                <small className="muted">　（1ハンドあたりのチップ）</small>
              </p>
            )}
            <div className="legend">
              <span>
                <span className="prob" style={{ background: 'rgba(37,99,235,0.5)' }}>
                  濃い
                </span>{' '}
                ほど確率が高い
              </span>
              <span>
                <span className="prob" style={{ background: 'var(--pair)' }}>
                  橙
                </span>{' '}
                の列はペア（手札＝共有カード）
              </span>
            </div>
            <StrategyTable
              strategy={selected.strategy}
              position={selected.position}
              editable={!selected.preset}
              onChange={(key, value) => store.update(selected.id, { strategy: { ...selected.strategy, [key]: value } })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
