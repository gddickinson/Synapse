// The Synapse3D analysis pipeline in the browser: port of cluster_core.analyse (clusterAnalysis_2.ClusterAnalysis
// runAnalysis). Same steps, defaults and output layout; all lengths in nm. Tested against the Python output by
// engine.test.mjs (everything except the random control, which uses a different generator in each language).
import { rng } from './core.js';
import { dbscan } from './dbscan.js';
import { convexVolume } from './hull.js';
import { UNITS } from './table.js';

export const DEFAULTS = { eps: 100, min_samples: 10, max_distance: 100 };

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function clustersOf(pts, labels) {
  const groups = new Map();
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l < 0) continue;
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push([pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]]);
  }
  return [...groups.keys()].sort((a, b) => a - b).map(label => {
    const p = groups.get(label);
    const volume = convexVolume(p);
    return { label, n: p.length, centroid: mean3(p), volume, flat: isFlat(p, volume), points: p };
  });
}

// a cluster of at least 4 points whose convex hull has no volume (coplanar): volume reported as 0, flagged
export const isFlat = (p, volume) => p.length >= 4 && volume === 0;

export function mean3(p) {
  const m = [0, 0, 0];
  for (const q of p) { m[0] += q[0]; m[1] += q[1]; m[2] += q[2]; }
  return m.map(v => v / p.length);
}

// For each channel-1 cluster, the nearest channel-2 centroid if within maxDistance: [[i, j, d]]
export function pairClusters(c1, c2, maxDistance) {
  if (!c1.length || !c2.length) return [];
  const out = [];
  c1.forEach((a, i) => {
    let bj = -1, bd = Infinity;
    c2.forEach((b, j) => { const d = dist(a.centroid, b.centroid); if (d < bd) { bd = d; bj = j; } });
    if (bd <= maxDistance) out.push([i, bj, bd]);
  });
  return out;
}

export function roiStats(p1, p2) {
  const a = mean3(p1), b = mean3(p2), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const q of [...p1, ...p2]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); }
  const e = hi.map((h, k) => h - lo[k]);
  const v1 = convexVolume(p1), v2 = convexVolume(p2);
  return { n1: p1.length, n2: p2.length, volume1: v1, volume2: v2, flat1: isFlat(p1, v1), flat2: isFlat(p2, v2), distance: dist(a, b),
    centroid1: a, centroid2: b, center: a.map((v, k) => (v + b[k]) / 2), height: e[0], width: e[1], depth: e[2],
    box_volume: e[0] * e[1] * e[2] };
}

// Distances from each test point to its k nearest train points, flattened (sorted per test point).
export function nnDistances(train, test, k = 1) {
  if (!train.length || !test.length) return [];
  const out = [];
  for (const t of test) {
    const d = train.map(p => dist(p, t)).sort((x, y) => x - y);
    out.push(...d.slice(0, k));
  }
  return out;
}

export function describe(x) {
  const n = x.length;
  if (!n) return { n, mean: null, sem: null, sd: null };
  const mean = x.reduce((s, v) => s + v, 0) / n;
  const ss = x.reduce((s, v) => s + (v - mean) ** 2, 0);
  return { n, mean, sem: n > 1 ? Math.sqrt(ss / (n - 1)) / Math.sqrt(n) : null, sd: Math.sqrt(ss / n) };
}

export function randomBoxPoints(lo, hi, n, rand) {
  return Array.from({ length: n }, () => [0, 1, 2].map(k => lo[k] + rand() * (hi[k] - lo[k])));
}

// table: from parseTable. Returns the same structure as cluster_core.analyse (plus `points` per channel for drawing).
export function analyse(table, { eps = DEFAULTS.eps, min_samples = DEFAULTS.min_samples, max_distance = DEFAULTS.max_distance,
  unit = 'nm', seed = 1 } = {}) {
  eps = +eps; min_samples = Math.round(+min_samples); max_distance = +max_distance;
  if (!(unit in UNITS)) throw new Error(`unit must be one of ${Object.keys(UNITS).join(', ')}`);
  if (!(eps > 0) || !(min_samples >= 1) || !(max_distance >= 0)) throw new Error('eps must be > 0, min_samples >= 1 and max_distance >= 0');
  const f = UNITS[unit], N = table.channel.length;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
    const v = table.xyz[3 * i + k] * f;
    if (v < lo[k]) lo[k] = v;
    if (v > hi[k]) hi[k] = v;
  }
  const channels = [], clus = [], points = [];
  for (const name of table.names) {
    const idx = [];
    for (let i = 0; i < N; i++) if (table.channel[i] === name) idx.push(i);
    const pts = new Float64Array(3 * idx.length);
    idx.forEach((r, i) => { for (let k = 0; k < 3; k++) pts[3 * i + k] = table.xyz[3 * r + k] * f; });
    const { labels, nClusters, nNoise } = dbscan(pts, eps, min_samples);
    clus.push(clustersOf(pts, labels));
    points.push(pts);
    channels.push({ name, n: idx.length, n_noise: nNoise, n_clustered: idx.length - nNoise, n_clusters: nClusters,
      labels: Array.from(labels), rows: idx });
  }
  const pairs = pairClusters(clus[0], clus[1], max_distance).map(([i, j, d], roi) =>
    ({ roi, cluster1: i, cluster2: j, pair_distance: d, ...roiStats(clus[0][i].points, clus[1][j].points) }));
  const c1 = pairs.map(p => p.centroid1), c2 = pairs.map(p => p.centroid2);
  const near = nnDistances(c1, c2, 1), all = nnDistances(c1, c2, c2.length);
  const rand = rng(seed);
  const r1 = randomBoxPoints(lo, hi, c1.length, rand), r2 = randomBoxPoints(lo, hi, c2.length, rand);
  const rnear = nnDistances(r1, r2, 1), rall = nnDistances(r1, r2, r1.length);
  return {
    params: { eps, min_samples, max_distance, unit, nm_per_unit: f, seed },
    channels,
    clusters: clus.map(cl => cl.map(({ points: _p, ...c }) => c)),
    pairs,
    bbox: { min: lo, max: hi },
    distances: { nearest: near, all },
    random: { points1: r1, points2: r2, nearest: rnear, all: rall },
    stats: summary(channels, pairs, near, all),
    random_stats: { nearest: describe(rnear), all: describe(rall) },
    points,
  };
}

export function summary(channels, pairs, near, all) {
  const out = { pairs: pairs.length, nearest: describe(near), all: describe(all) };
  channels.forEach((ch, i) => {
    const k = i + 1;
    out[`ch${k}`] = { localisations: ch.n, noise: ch.n_noise, clustered: ch.n_clustered, clusters: ch.n_clusters,
      // distinct: a channel-2 cluster can be in several pairs
      unpaired_clusters: ch.n_clusters - new Set(pairs.map(p => p[`cluster${k}`])).size, locs_per_cluster: describe(pairs.map(p => p[`n${k}`])),
      volume: describe(pairs.map(p => p[`volume${k}`])) };
  });
  return out;
}
