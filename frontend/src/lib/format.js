export const gateNames = {
  1: 'Tokenomics & Emisi',
  2: 'Valuation Metrics',
  3: 'Deteksi Manipulasi',
};

export function formatNumber(val) {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export function formatPrice(val) {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  if (num >= 1) return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${num.toFixed(6)}`;
}

export function formatSupply(val) {
  if (val === null || val === undefined) return '—';
  const num = Number(val);
  if (isNaN(num)) return '—';
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toFixed(0);
}
