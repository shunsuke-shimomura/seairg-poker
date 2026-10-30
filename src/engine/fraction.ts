/** 表示用の分数近似（連分数）。戦略は 1/6 刻みなので、多くの値は小さい分母で正確に表せる。 */

export interface Fraction {
  num: number;
  den: number;
}

export function toFraction(x: number, maxDen = 2000, eps = 1e-9): Fraction | null {
  if (!Number.isFinite(x)) return null;
  const sign = x < 0 ? -1 : 1;
  let v = Math.abs(x);
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  for (let i = 0; i < 64; i++) {
    const a = Math.floor(v);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(Math.abs(x) - h1 / k1) < eps) return { num: sign * h1, den: k1 };
    const frac = v - a;
    if (frac < 1e-12) break;
    v = 1 / frac;
  }
  return k1 > 0 && Math.abs(Math.abs(x) - h1 / k1) < eps ? { num: sign * h1, den: k1 } : null;
}

/** 分数で表せれば "13/28"、整数なら "2"、表せなければ小数 */
export function fmtFraction(x: number, maxDen = 2000): string {
  const f = toFraction(x, maxDen);
  if (f) {
    if (f.den === 1) return `${f.num}`;
    return `${f.num}/${f.den}`;
  }
  return x.toFixed(3);
}

/** 1/6 刻みの確率を "k/6" で表示 */
export function fmtSixths(p: number): string {
  const k = Math.round(p * 6);
  if (Math.abs(p * 6 - k) < 1e-6) return `${k}/6`;
  return p.toFixed(2);
}

/** 符号つき小数 */
export function fmtSigned(x: number, digits = 2): string {
  const s = x.toFixed(digits);
  if (x > 0) return `+${s}`;
  if (Math.abs(x) < 0.5 * 10 ** -digits) return (0).toFixed(digits).replace(/^/, '±');
  return s;
}

/** 分数と小数の併記 */
export function fmtBoth(x: number, digits = 2, maxDen = 2000): string {
  const f = toFraction(x, maxDen);
  if (f && f.den !== 1 && f.den <= maxDen) return `${f.num}/${f.den}（${x.toFixed(digits)}）`;
  if (f && f.den === 1) return `${f.num}`;
  return x.toFixed(digits);
}
