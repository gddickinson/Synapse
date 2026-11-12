// Result tables, charts and CSV exports for the Analyse page (all lengths nm, volumes nm³).
import { esc, list } from './core.js';
import { histogram } from './charts.js';
import { csv, int, meanSem, nm, nm3 } from './fmt.js';

export function tiles(r) {
  const [a, b] = r.channels, s = r.stats;
  return `<div class="tiles">
    <div class="tile"><b>${int(a.n + b.n)}</b><span>localisations analysed</span></div>
    <div class="tile"><b><span class="c1">${a.n_clusters}</span> / <span class="c2">${b.n_clusters}</span></b><span>clusters (${esc(a.name)} / ${esc(b.name)})</span></div>
    <div class="tile"><b>${s.pairs}</b><span>paired clusters (ROIs)</span></div>
    <div class="tile"><b>${s.nearest.mean === null ? 'n/a' : Math.round(s.nearest.mean)}</b><span>mean nearest centroid distance (nm)</span></div>
    <div class="tile"><b>${r.random_stats.nearest.mean === null ? 'n/a' : Math.round(r.random_stats.nearest.mean)}</b><span>same for random points (nm)</span></div>
  </div>`;
}

// rows of [label, value] in the order of the plugin's stats file
export function statRows(r) {
  const s = r.stats, rs = r.random_stats, p = r.params, [a, b] = r.channels;
  const rows = [['eps (nm)', p.eps], ['min_samples', p.min_samples], ['maxDistance (nm)', p.max_distance],
    ['Number of paired clusters', s.pairs]];
  [[a, s.ch1, 1], [b, s.ch2, 2]].forEach(([ch, c, k]) => rows.push(
    [`Channel ${k} (${ch.name}): localisations`, c.localisations], [`Channel ${k}: noise`, c.noise],
    [`Channel ${k}: in clusters`, c.clustered], [`Channel ${k}: clusters`, c.clusters],
    [`Channel ${k}: clusters not in any pair`, c.unpaired_clusters]));
  const d = (lab, st, f = nm) => rows.push([lab, meanSem(st, f)]);
  d('Nearest-neighbour distance', s.nearest); d('All distances', s.all);
  d('Channel 1: localisations per paired cluster', s.ch1.locs_per_cluster, v => (v === null ? 'n/a' : v.toFixed(2)));
  d('Channel 2: localisations per paired cluster', s.ch2.locs_per_cluster, v => (v === null ? 'n/a' : v.toFixed(2)));
  d('Channel 1: paired cluster volume', s.ch1.volume, nm3); d('Channel 2: paired cluster volume', s.ch2.volume, nm3);
  d('Random: nearest-neighbour distance', rs.nearest); d('Random: all distances', rs.all);
  return rows;
}

export function statsTable(r) {
  return `<div class="scroll"><table class="tbl"><tbody>${list(statRows(r), ([k, v]) =>
    `<tr><th scope="row">${esc(k)}</th><td>${typeof v === 'number' ? int(v) : esc(v)}</td></tr>`)}</tbody></table></div>
    <p class="small mute">Mean ± SEM (SEM with n−1, SD with n, as the plugin's stats file). Distances: from each channel-2
    paired centroid to the channel-1 paired centroids. Random: the same number of uniform points in the data's bounding box.</p>`;
}

const PAIR_COLS = [['ROI #', p => p.roi], ['Mean distance (nm)', p => nm(p.distance)], ['N ch1', p => p.n1], ['N ch2', p => p.n2],
  ['Volume ch1', p => nm3(p.volume1)], ['Volume ch2', p => nm3(p.volume2)],
  ['Extent x × y × z (nm)', p => `${Math.round(p.height)} × ${Math.round(p.width)} × ${Math.round(p.depth)}`]];

export function pairsTable(r, page = 0, per = 25, sel = -1) {
  const n = r.pairs.length;
  if (!n) return '<p class="mute">No paired clusters: try a larger max distance between clusters, or check eps and min_samples.</p>';
  const rows = r.pairs.slice(page * per, (page + 1) * per);
  return `<div class="scroll"><table class="tbl"><thead><tr>${list(PAIR_COLS, ([h]) => `<th scope="col">${esc(h)}</th>`)}</tr></thead>
    <tbody>${list(rows, p => `<tr class="click${p.roi === sel ? ' on' : ''}" tabindex="0" data-roi="${p.roi}">${list(PAIR_COLS, ([, f]) => `<td>${esc(f(p))}</td>`)}</tr>`)}</tbody></table></div>
    <div class="pager"><button class="alt" data-pg="-1" ${page ? '' : 'disabled'}>Previous</button>
    <span class="small mute">rows ${page * per + 1}–${Math.min(n, (page + 1) * per)} of ${n} · click a row to fly to that pair</span>
    <button class="alt" data-pg="1" ${(page + 1) * per < n ? '' : 'disabled'}>Next</button></div>`;
}

export function charts(r) {
  return `<div class="charts">
    <div class="panel"><h3>Nearest-neighbour distance</h3>${histogram([
      { values: r.distances.nearest, cls: 'b1', label: 'paired clusters' }, { values: r.random.nearest, cls: 'b2', label: 'random points' }])}</div>
    <div class="panel"><h3>All centroid distances</h3>${histogram([
      { values: r.distances.all, cls: 'b1', label: 'paired clusters' }, { values: r.random.all, cls: 'b2', label: 'random points' }])}</div>
  </div>`;
}

// --- CSV exports
export function pairsCsv(r) {
  const [a, b] = r.channels.map(c => c.name);
  return csv([['ROI #', 'Mean Distance (nm)', `${a} N`, `${b} N`, `${a} Volume (nm^3)`, `${b} Volume (nm^3)`,
    `${a} Centroid x (nm)`, `${a} Centroid y (nm)`, `${a} Centroid z (nm)`, `${b} Centroid x (nm)`, `${b} Centroid y (nm)`, `${b} Centroid z (nm)`,
    'height (x extent, nm)', 'width (y extent, nm)', 'depth (z extent, nm)', 'box volume (nm^3)'],
  ...r.pairs.map(p => [p.roi, p.distance, p.n1, p.n2, p.volume1, p.volume2, ...p.centroid1, ...p.centroid2, p.height, p.width, p.depth, p.box_volume])]);
}
export const statsCsv = r => csv([['quantity', 'value'], ...statRows(r)]);
// every analysed localisation with its channel and DBSCAN label (-1 = noise)
export function pointsCsv(r) {
  const rows = [['channel', 'x (nm)', 'y (nm)', 'z (nm)', 'cluster label']];
  r.channels.forEach((ch, c) => ch.labels.forEach((l, i) => rows.push([ch.name, r.points[c][3 * i], r.points[c][3 * i + 1], r.points[c][3 * i + 2], l])));
  return csv(rows);
}
