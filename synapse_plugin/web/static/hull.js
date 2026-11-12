// Convex-hull volume in 3D (incremental hull), the JS counterpart of scipy's ConvexHull(points).volume used by
// cluster_core.convex_volume and the plugin's ClusterMath.convex_volume. Returns 0 below 4 points or when the points
// are (numerically) coplanar, where the plugin also reports 0 (Qhull refuses a flat hull).

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.sqrt(dot(a, a));

// pts: array of [x, y, z]
export function convexVolume(pts) {
  const n = pts.length;
  if (n < 4) return 0;
  // work relative to the mean for precision
  const m = [0, 0, 0];
  for (const p of pts) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }
  m[0] /= n; m[1] /= n; m[2] /= n;
  const P = pts.map(p => sub(p, m));
  let scale = 0;
  for (const p of P) scale = Math.max(scale, norm(p));
  if (scale === 0) return 0;
  const tol = 1e-10 * scale;
  // initial tetrahedron from extreme points
  let i0 = 0;
  for (let i = 1; i < n; i++) if (P[i][0] < P[i0][0]) i0 = i;
  let i1 = -1, best = -1;
  for (let i = 0; i < n; i++) { const d = norm(sub(P[i], P[i0])); if (d > best) { best = d; i1 = i; } }
  if (best <= tol) return 0;
  const e = sub(P[i1], P[i0]);
  let i2 = -1; best = -1;
  for (let i = 0; i < n; i++) { const d = norm(cross(e, sub(P[i], P[i0]))) / norm(e); if (d > best) { best = d; i2 = i; } }
  if (best <= tol) return 0;
  const nrm = cross(e, sub(P[i2], P[i0])), nl = norm(nrm);
  let i3 = -1; best = -1;
  for (let i = 0; i < n; i++) { const d = Math.abs(dot(nrm, sub(P[i], P[i0]))) / nl; if (d > best) { best = d; i3 = i; } }
  if (best <= 1e-9 * scale) return 0;  // flat
  const inside = [0, 1, 2].map(k => (P[i0][k] + P[i1][k] + P[i2][k] + P[i3][k]) / 4);

  const faces = [];          // {v: [a,b,c], n (unit outward normal), off}
  const alive = new Set();   // ids of current hull faces
  const edge = new Map();    // directed edge a->b  ->  face index
  const ek = (a, b) => a * n + b;
  const addFace = (a, b, c) => {
    let nn = cross(sub(P[b], P[a]), sub(P[c], P[a]));
    if (dot(nn, sub(inside, P[a])) > 0) { [b, c] = [c, b]; nn = cross(sub(P[b], P[a]), sub(P[c], P[a])); }
    const len = norm(nn) || 1;
    nn = [nn[0] / len, nn[1] / len, nn[2] / len];
    const f = { v: [a, b, c], n: nn, off: dot(nn, P[a]) };
    const id = faces.push(f) - 1;
    alive.add(id);
    edge.set(ek(a, b), id); edge.set(ek(b, c), id); edge.set(ek(c, a), id);
  };
  addFace(i0, i1, i2); addFace(i0, i1, i3); addFace(i0, i2, i3); addFace(i1, i2, i3);
  const used = new Set([i0, i1, i2, i3]);

  for (let p = 0; p < n; p++) {
    if (used.has(p)) continue;
    const q = P[p];
    const vis = [];
    for (const f of alive) if (dot(faces[f].n, q) - faces[f].off > tol) vis.push(f);
    if (!vis.length) continue;
    const visSet = new Set(vis);
    const horizon = [];
    for (const f of vis) {
      const [a, b, c] = faces[f].v;
      for (const [u, v] of [[a, b], [b, c], [c, a]]) if (!visSet.has(edge.get(ek(v, u)))) horizon.push([u, v]);
    }
    for (const f of vis) {
      const [a, b, c] = faces[f].v;
      alive.delete(f);
      for (const [u, v] of [[a, b], [b, c], [c, a]]) if (edge.get(ek(u, v)) === f) edge.delete(ek(u, v));
    }
    for (const [u, v] of horizon) addFace(u, v, p);
  }
  let vol = 0;
  for (const id of alive) {
    const [a, b, c] = faces[id].v.map(i => sub(P[i], inside));
    vol += dot(a, cross(b, c));
  }
  return Math.abs(vol) / 6;
}
