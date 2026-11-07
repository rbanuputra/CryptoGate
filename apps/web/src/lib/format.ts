export const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const fmtPct = (n: number) => `${n.toFixed(1)}%`;
export const fmtTime = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace("T", " ");
export const cls = (n: number) => (n > 0 ? "good" : n < 0 ? "bad" : "muted");
export const pfClass = (pf: number) => (pf >= 1.5 ? "good" : pf >= 1 ? "" : "bad");
