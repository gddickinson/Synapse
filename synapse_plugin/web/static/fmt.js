// Number formatting (all lengths in nm), channel colours and CSV export helpers.
export const CH_COLORS = ['#ff4f6d', '#3dff8f'];
export const NOISE_COLOR = '#5d6680';

export function fmt(v, d = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  return Number(v).toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const nm = (v, d = 1) => v === null || v === undefined ? 'n/a' : `${fmt(v, d)} nm`;
// Volumes in nm³ (1 µm³ = 10⁹ nm³); large values in scientific notation.
export function nm3(v) {
  if (v === null || v === undefined) return 'n/a';
  if (v === 0) return '0 nm³';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e < 5) return `${fmt(v, 0)} nm³`;
  const sup = String(e).replace(/[-0-9]/g, c => '⁻⁰¹²³⁴⁵⁶⁷⁸⁹'['-0123456789'.indexOf(c)]);
  return `${(v / 10 ** e).toFixed(2)}×10${sup} nm³`;
}
export const int = v => v === null || v === undefined ? 'n/a' : Number(v).toLocaleString('en-GB');
export const meanSem = (s, f = nm) => s.n ? `${f(s.mean)} ± ${s.sem === null ? 'n/a' : f(s.sem)} (SD ${f(s.sd)}, n = ${int(s.n)})` : 'n/a (no pairs)';

// CSV text from rows (array of arrays); numbers written in full precision.
export function csv(rows) {
  const cell = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(cell).join(',')).join('\n') + '\n';
}

// Distinct colours for cluster ids (golden-angle hues), as [r,g,b] in 0..1.
export function clusterColor(i) {
  const h = ((i * 137.508) % 360) / 60, c = 0.85, x = c * (1 - Math.abs((h % 2) - 1)), m = 0.15;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}
export const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
