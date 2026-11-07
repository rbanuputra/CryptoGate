/** Round a quantity down to a tick/step size (Binance LOT_SIZE style). */
export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  const precision = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.floor(value / step) * step).toFixed(precision));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pctChange(from: number, to: number): number {
  if (from === 0) return 0;
  return (to - from) / from;
}

/** Pearson correlation of two equal-length series. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i]!;
    sb += b[i]!;
  }
  const ma = sa / n;
  const mb = sb / n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}
