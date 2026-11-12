// DBSCAN in 3D, matching scikit-learn's DBSCAN (Euclidean, distance <= eps, a point counts itself towards min_samples)
// followed by the plugin's filter (clusters smaller than min_samples become noise, labels are not renumbered).
// Port of cluster_core.dbscan_labels / BioDocks/dbscan.py; tested against them by engine.test.mjs.

// pts: Float64Array of x,y,z triples (nm). Returns { labels: Int32Array, nClusters, nNoise }.
export function dbscan(pts, eps, minSamples) {
  const n = pts.length / 3;
  const labels = new Int32Array(n).fill(-1);
  if (n === 0) return { labels, nClusters: 0, nNoise: 0 };
  const neigh = neighbourhoods(pts, eps);
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) core[i] = neigh[i].length >= minSamples ? 1 : 0;
  // sklearn's dbscan_inner: depth-first expansion from each unlabelled core point, in index order
  let label = 0;
  const stack = [];
  for (let i0 = 0; i0 < n; i0++) {
    if (labels[i0] !== -1 || !core[i0]) continue;
    let i = i0;
    for (;;) {
      if (labels[i] === -1) {
        labels[i] = label;
        if (core[i]) for (const j of neigh[i]) if (labels[j] === -1) stack.push(j);
      }
      if (!stack.length) break;
      i = stack.pop();
    }
    label++;
  }
  // plugin filter: undersized clusters -> noise
  const counts = new Map();
  for (const l of labels) if (l >= 0) counts.set(l, (counts.get(l) || 0) + 1);
  const drop = new Set([...counts].filter(([, c]) => c < minSamples).map(([l]) => l));
  let nNoise = 0;
  for (let i = 0; i < n; i++) {
    if (drop.has(labels[i])) labels[i] = -1;
    if (labels[i] === -1) nNoise++;
  }
  return { labels, nClusters: counts.size - drop.size, nNoise };
}

// Neighbour lists (indices j with |p_i - p_j| <= eps, including i) using a uniform grid of cell size eps.
export function neighbourhoods(pts, eps) {
  const n = pts.length / 3, eps2 = eps * eps;
  const cell = new Map();
  const key = (a, b, c) => `${a},${b},${c}`;
  const ci = new Int32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(pts[3 * i] / eps), b = Math.floor(pts[3 * i + 1] / eps), c = Math.floor(pts[3 * i + 2] / eps);
    ci[3 * i] = a; ci[3 * i + 1] = b; ci[3 * i + 2] = c;
    const k = key(a, b, c);
    let arr = cell.get(k);
    if (!arr) cell.set(k, arr = []);
    arr.push(i);
  }
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2], res = [];
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) for (let dc = -1; dc <= 1; dc++) {
      const arr = cell.get(key(ci[3 * i] + da, ci[3 * i + 1] + db, ci[3 * i + 2] + dc));
      if (!arr) continue;
      for (const j of arr) {
        const dx = x - pts[3 * j], dy = y - pts[3 * j + 1], dz = z - pts[3 * j + 2];
        if (dx * dx + dy * dy + dz * dz <= eps2) res.push(j);
      }
    }
    res.sort((p, q) => p - q);
    out[i] = res;
  }
  return out;
}
