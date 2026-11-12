// SVG histograms (two overlaid series: measured clusters vs the random control).
import { esc } from './core.js';
import { fmt } from './fmt.js';

// series: [{ values, cls, label }]; returns an SVG string (x in nm, y = count)
export function histogram(series, { xlabel = 'distance (nm)', bins = 25, title = '' } = {}) {
  const all = series.flatMap(s => s.values);
  const W = 420, H = 230, L = 46, R = 12, T = 14, B = 40;
  if (!all.length) return `<p class="mute small">No values to plot (no paired clusters).</p>`;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi === lo) { lo -= 1; hi += 1; }
  const w = (hi - lo) / bins;
  const counts = series.map(s => { const c = new Array(bins).fill(0); for (const v of s.values) c[Math.min(bins - 1, Math.floor((v - lo) / w))]++; return c; });
  const ymax = Math.max(1, ...counts.flat());
  const X = v => L + (v - lo) / (hi - lo) * (W - L - R), Y = c => H - B - c / ymax * (H - T - B);
  const bars = counts.map((c, si) => c.map((n, i) => n ? `<rect class="${series[si].cls}" x="${X(lo + i * w) + 0.5}" y="${Y(n)}" width="${Math.max(1, X(lo + (i + 1) * w) - X(lo + i * w) - 1)}" height="${H - B - Y(n)}"><title>${esc(series[si].label)}: ${n} in ${fmt(lo + i * w, 0)}–${fmt(lo + (i + 1) * w, 0)} nm</title></rect>` : '').join('')).join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = lo + f * (hi - lo); return `<line class="axis" x1="${X(v)}" x2="${X(v)}" y1="${H - B}" y2="${H - B + 4}"/><text x="${X(v)}" y="${H - B + 16}" text-anchor="middle">${fmt(v, 0)}</text>`; }).join('');
  const legend = series.map((s, i) => `<rect class="${s.cls}" x="${L + 8 + i * 150}" y="${T - 10}" width="10" height="10"/><text x="${L + 22 + i * 150}" y="${T - 1}">${esc(s.label)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || xlabel)} histogram">
    ${bars}<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><line class="axis" x1="${L}" x2="${L}" y1="${T}" y2="${H - B}"/>
    ${ticks}<text x="${L - 6}" y="${T + 8}" text-anchor="end">${ymax}</text><text x="${L - 6}" y="${H - B}" text-anchor="end">0</text>
    <text x="${(W + L) / 2}" y="${H - 6}" text-anchor="middle">${esc(xlabel)}</text>${legend}</svg>`;
}
