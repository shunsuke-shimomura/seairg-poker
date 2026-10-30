/**
 * 60マスの行動表の表示・編集。
 * 各マスは「自分からベットする確率 / ベットされたらコールする確率」。
 */
import { HISTS, RANKS, type Hist, type Position, type Rank, type Strategy, r1Key, r2Key } from '../../engine/game';
import { fmtSixths } from '../../engine/fraction';

export const HIST_LABEL: Record<Hist, string> = {
  oppbet: '相手がベットした（自分はコール）',
  mebet: '自分がベットした（相手はコール）',
  check: '両者チェック',
};

export function decisionLabels(position: Position): [string, string] {
  return position === 0
    ? ['自分からベット', 'チェックのあとベットされたらコール']
    : ['チェックされたら自分からベット', 'ベットされたらコール'];
}

interface Props {
  strategy: Strategy;
  position: Position;
  editable?: boolean;
  onChange?: (key: string, value: number) => void;
  /** 強調するマス（タイなど） */
  highlight?: Set<string>;
  /** 比較対象。違うマスに印をつける */
  compare?: Strategy;
  /** 選択中のマス */
  selected?: string;
  onSelect?: (key: string) => void;
  compact?: boolean;
}

const SIXTHS = [0, 1, 2, 3, 4, 5, 6];

function Cell({
  k,
  value,
  editable,
  onChange,
  highlight,
  changed,
  selected,
  onSelect,
}: {
  k: string;
  value: number;
  editable?: boolean;
  onChange?: (key: string, v: number) => void;
  highlight?: boolean;
  changed?: boolean;
  selected?: boolean;
  onSelect?: (key: string) => void;
}) {
  const shade = `rgba(37, 99, 235, ${0.08 + 0.42 * value})`;
  const cls = ['prob', highlight ? 'tie' : '', changed ? 'changed' : '', selected ? 'selected' : '']
    .filter(Boolean)
    .join(' ');
  if (editable && onChange) {
    const k6 = Math.round(value * 6);
    const exact = Math.abs(value * 6 - k6) < 1e-6;
    return (
      <select
        className={cls}
        style={{ background: shade }}
        value={exact ? k6 : -1}
        onChange={(e) => onChange(k, Number(e.target.value) / 6)}
        title={k}
      >
        {!exact && <option value={-1}>{value.toFixed(2)}</option>}
        {SIXTHS.map((n) => (
          <option key={n} value={n}>
            {n}/6
          </option>
        ))}
      </select>
    );
  }
  return (
    <span
      className={cls}
      style={{ background: shade, cursor: onSelect ? 'pointer' : undefined }}
      title={k}
      onClick={onSelect ? () => onSelect(k) : undefined}
    >
      {fmtSixths(value)}
    </span>
  );
}

export function StrategyTable({ strategy, position, editable, onChange, highlight, compare, selected, onSelect, compact }: Props) {
  const [d1, d2] = decisionLabels(position);
  const cell = (k: string) => (
    <Cell
      k={k}
      value={strategy[k] ?? 0}
      editable={editable}
      onChange={onChange}
      highlight={highlight?.has(k)}
      changed={compare ? Math.abs((compare[k] ?? 0) - (strategy[k] ?? 0)) > 1e-9 : false}
      selected={selected === k}
      onSelect={onSelect}
    />
  );
  return (
    <div className={`strategy-table ${compact ? 'compact' : ''}`}>
      <div className="block">
        <h4>第1ラウンド</h4>
        <table>
          <thead>
            <tr>
              <th>手札</th>
              <th>{d1}</th>
              <th>{d2}</th>
            </tr>
          </thead>
          <tbody>
            {RANKS.map((h) => (
              <tr key={h}>
                <th>{h}</th>
                <td>{cell(r1Key('bet', h))}</td>
                <td>{cell(r1Key('call', h))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="r2-blocks">
        {HISTS.map((hist) => (
          <div className="block" key={hist}>
            <h4>
              第2ラウンド・{HIST_LABEL[hist]}
              <span className="sub">
                （各マス: {position === 0 ? 'ベット' : 'チェックされたらベット'} / ベットされたらコール）
              </span>
            </h4>
            <table>
              <thead>
                <tr>
                  <th>手札＼共有</th>
                  {RANKS.map((b) => (
                    <th key={b}>{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RANKS.map((h) => (
                  <tr key={h}>
                    <th>{h}</th>
                    {RANKS.map((b) => (
                      <td key={b} className={h === b ? 'pair' : ''}>
                        <div className="pair-cell">
                          {cell(r2Key('bet', h, b, hist))}
                          <span className="slash">/</span>
                          {cell(r2Key('call', h, b, hist))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

/** マスのキーを日本語で説明 */
export function describeKey(key: string, position: Position): string {
  const parts = key.split('|');
  const [d1, d2] = decisionLabels(position);
  if (parts[0] === 'r1') {
    return `第1ラウンド・手札${parts[2]}・${parts[1] === 'bet' ? d1 : d2}`;
  }
  const kind = parts[1] === 'bet' ? (position === 0 ? 'ベット' : 'チェックされたらベット') : 'ベットされたらコール';
  return `第2ラウンド・${HIST_LABEL[parts[4] as Hist]}・手札${parts[2]}・共有${parts[3]}・${kind}`;
}

export const RANK_LIST: readonly Rank[] = RANKS;
