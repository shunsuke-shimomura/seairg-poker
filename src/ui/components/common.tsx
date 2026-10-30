import type { Position, Rank } from '../../engine/game';
import { RANKS } from '../../engine/game';
import { fmtSigned, fmtBoth } from '../../engine/fraction';
import { positionLabel, useStore, type TableEntry } from '../store';

export function Ev({ value, digits = 2 }: { value: number; digits?: number }) {
  const cls = value > 1e-9 ? 'ev pos' : value < -1e-9 ? 'ev neg' : 'ev';
  return <span className={cls}>{fmtSigned(value, digits)}</span>;
}

export function Frac({ value, digits = 3 }: { value: number; digits?: number }) {
  return <span className="frac">{fmtBoth(value, digits)}</span>;
}

export function TableSelect({
  position,
  value,
  onChange,
  label,
}: {
  position?: Position;
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const store = useStore();
  const groups: Position[] = position === undefined ? [0, 1] : [position];
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map((p) => (
          <optgroup key={p} label={`${positionLabel(p)}の表`}>
            {store.byPosition(p).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function RankButtons({ value, onChange, label }: { value: Rank; onChange: (r: Rank) => void; label?: string }) {
  return (
    <div className="field">
      {label && <span>{label}</span>}
      <div className="btn-group">
        {RANKS.map((r) => (
          <button key={r} className={r === value ? 'active' : ''} onClick={() => onChange(r)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PositionButtons({ value, onChange, label }: { value: Position; onChange: (p: Position) => void; label?: string }) {
  return (
    <div className="field">
      {label && <span>{label}</span>}
      <div className="btn-group">
        {([0, 1] as Position[]).map((p) => (
          <button key={p} className={p === value ? 'active' : ''} onClick={() => onChange(p)}>
            {positionLabel(p)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function tableName(t: TableEntry | undefined): string {
  return t ? t.name : '（不明な表）';
}
