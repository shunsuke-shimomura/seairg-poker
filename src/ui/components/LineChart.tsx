import { useId, useState } from 'react';

export interface Series {
  name: string;
  /** 線の右端に付ける短い名前（省略時は name） */
  label?: string;
  color: string;
  points: { x: number; y: number }[];
  dashed?: boolean;
}

export interface LineChartProps {
  series: Series[];
  xLabel: string;
  yLabel: string;
  width?: number;
  height?: number;
  xScale?: 'linear' | 'log';
  xTicks?: number[];
  xFormat?: (x: number) => string;
  yFormat?: (y: number) => string;
  /** y=0 などの基準線 */
  referenceY?: { value: number; label: string }[];
  yDomain?: [number, number];
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (max <= min) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** 2〜3系列の折れ線グラフ（SVG）。ホバーで最寄りの x の値をすべて表示する */
export function LineChart({
  series,
  xLabel,
  yLabel,
  width = 640,
  height = 320,
  xScale = 'linear',
  xTicks,
  xFormat = (x) => String(x),
  yFormat = (y) => y.toFixed(2),
  referenceY = [],
  yDomain,
}: LineChartProps) {
  const id = useId();
  const [hoverX, setHoverX] = useState<number | null>(null);
  const pad = { left: 60, right: 150, top: 16, bottom: 48 };
  const W = width - pad.left - pad.right;
  const H = height - pad.top - pad.bottom;

  const xs = series.flatMap((s) => s.points.map((p) => p.x));
  const ys = series.flatMap((s) => s.points.map((p) => p.y)).concat(referenceY.map((r) => r.value));
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yLo = yDomain ? yDomain[0] : Math.min(0, ...ys);
  const yHi = yDomain ? yDomain[1] : Math.max(...ys);
  const yPadding = (yHi - yLo) * 0.05 || 0.1;
  const yMin = yLo - yPadding;
  const yMax = yHi + yPadding;

  const tx = (x: number) => {
    if (xScale === 'log') {
      const a = Math.log10(Math.max(xMin, 1e-9));
      const b = Math.log10(xMax);
      return pad.left + ((Math.log10(Math.max(x, 1e-9)) - a) / (b - a || 1)) * W;
    }
    return pad.left + ((x - xMin) / (xMax - xMin || 1)) * W;
  };
  const ty = (y: number) => pad.top + (1 - (y - yMin) / (yMax - yMin || 1)) * H;

  const xt = xTicks ?? niceTicks(xMin, xMax, 6);
  const yt = niceTicks(yMin, yMax, 5);

  const allX = Array.from(new Set(xs)).sort((a, b) => a - b);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = allX[0];
    let bd = Infinity;
    for (const x of allX) {
      const d = Math.abs(tx(x) - px);
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    setHoverX(best);
  };

  const hovered = hoverX === null ? null : series.map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) })).filter((h) => h.p);
  const tooltipLeft = hoverX !== null && tx(hoverX) > pad.left + W * 0.6;

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ maxWidth: width, display: 'block' }}
        role="img"
        aria-labelledby={`${id}-title`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverX(null)}
      >
        <title id={`${id}-title`}>
          {yLabel}（横軸：{xLabel}）
        </title>
        {yt.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={pad.left + W} y1={ty(v)} y2={ty(v)} className="grid" />
            <text x={pad.left - 8} y={ty(v)} className="tick" textAnchor="end" dominantBaseline="middle">
              {yFormat(v)}
            </text>
          </g>
        ))}
        {xt.map((v) => (
          <g key={v}>
            <line x1={tx(v)} x2={tx(v)} y1={pad.top + H} y2={pad.top + H + 5} className="axis" />
            <text x={tx(v)} y={pad.top + H + 20} className="tick" textAnchor="middle">
              {xFormat(v)}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={pad.left + W} y1={pad.top + H} y2={pad.top + H} className="axis" />
        <text x={pad.left + W / 2} y={height - 8} className="axis-label" textAnchor="middle">
          {xLabel}
        </text>
        <text x={14} y={pad.top + H / 2} className="axis-label" textAnchor="middle" transform={`rotate(-90 14 ${pad.top + H / 2})`}>
          {yLabel}
        </text>
        {referenceY.map((r) => (
          <g key={r.label}>
            <line x1={pad.left} x2={pad.left + W} y1={ty(r.value)} y2={ty(r.value)} className="reference" />
            <text x={pad.left + 4} y={ty(r.value) - 4} className="tick">
              {r.label}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ');
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" />
              {s.points.length <= 24 &&
                s.points.map((p) => <circle key={p.x} cx={tx(p.x)} cy={ty(p.y)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />)}
              {last && (
                <text x={tx(last.x) + 8} y={ty(last.y)} className="series-label" dominantBaseline="middle">
                  <tspan fill={s.color}>●</tspan> {s.label ?? s.name}
                </text>
              )}
            </g>
          );
        })}
        {hoverX !== null && (
          <g>
            <line x1={tx(hoverX)} x2={tx(hoverX)} y1={pad.top} y2={pad.top + H} className="crosshair" />
            {hovered?.map(({ s, p }) => (
              <circle key={s.name} cx={tx(p!.x)} cy={ty(p!.y)} r={6} fill={s.color} stroke="#fff" strokeWidth={2} />
            ))}
            <foreignObject x={tooltipLeft ? tx(hoverX) - 190 : tx(hoverX) + 10} y={pad.top} width={180} height={H}>
              <div className="tooltip">
                <div className="muted">
                  {xLabel} {xFormat(hoverX)}
                </div>
                {hovered?.map(({ s, p }) => (
                  <div key={s.name}>
                    <span style={{ color: s.color }}>●</span> {s.name}：{yFormat(p!.y)}
                  </div>
                ))}
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.name}>
            <span style={{ color: s.color }}>{s.dashed ? '╌╌' : '━'}</span> {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
