// Node test: the JS port (table.js, dbscan.js, hull.js, analysis.js, simulate.js) reproduces the Python pipeline
// (synapse_plugin/cluster_core.py, simulate.py) on tests/fixtures/engine_cases.json.
// Run: node synapse_plugin/web/static/engine.test.mjs   (regenerate the fixture: python scripts/make_engine_fixture.py)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyse, nnDistances } from './analysis.js';
import { convexVolume } from './hull.js';
import { simulate } from './simulate.js';
import { parseTable } from './table.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const fx = JSON.parse(readFileSync(here + '../../../tests/fixtures/engine_cases.json', 'utf8'));
let checks = 0;

function close(a, b, path, rtol = 1e-9, atol = 1e-6) {
  if (a === null || b === null || typeof b === 'string' || typeof b === 'boolean') { assert.equal(a, b, path); checks++; return; }
  if (Array.isArray(b)) {
    assert.ok(Array.isArray(a), `${path}: not an array`);
    assert.equal(a.length, b.length, `${path}: length`);
    b.forEach((v, i) => close(a[i], v, `${path}[${i}]`, rtol, atol));
    return;
  }
  if (typeof b === 'object') { for (const k of Object.keys(b)) close(a[k], b[k], `${path}.${k}`, rtol, atol); return; }
  assert.ok(Math.abs(a - b) <= atol + rtol * Math.abs(b), `${path}: js ${a} vs python ${b}`);
  checks++;
}

for (const c of fx.cases) {
  const js = analyse(parseTable(fx.texts[c.text]), c.params);
  const py = c.result;
  // per-point DBSCAN labels must agree exactly; numbers to rounding
  py.channels.forEach((ch, i) => assert.deepEqual(js.channels[i].labels, ch.labels, `${c.name}: labels ch${i + 1}`));
  const sorted = x => [...x].sort((p, q) => p - q);
  close({ ...js, distances: { nearest: sorted(js.distances.nearest), all: sorted(js.distances.all) } },
    { ...py, distances: { nearest: sorted(py.distances.nearest), all: sorted(py.distances.all) } }, c.name);
  // the random control: right count, inside the bounding box
  assert.equal(js.random.points1.length, py.pairs.length);
  for (const p of js.random.points1) p.forEach((v, k) => assert.ok(v >= js.bbox.min[k] && v <= js.bbox.max[k]));
  console.log(`ok  ${c.name}: ${py.pairs.length} pairs, clusters ${py.channels.map(ch => ch.n_clusters).join('/')}`);
}

for (const v of fx.volumes) close(convexVolume(v.points), v.volume, `volume of ${v.points.length} points`, 1e-9, 1e-6);
console.log(`ok  ${fx.volumes.length} convex-hull volumes`);

// nearest / all-neighbour distances (cKDTree in Python): every test point to its k nearest train points
assert.deepEqual(nnDistances([[0, 0, 0], [10, 0, 0]], [[1, 0, 0], [9, 0, 0], [20, 0, 0]], 1), [1, 1, 10]);
assert.deepEqual(nnDistances([[0, 0, 0], [10, 0, 0]], [[1, 0, 0]], 2), [1, 9]);

for (const s of fx.simulations) {
  const js = simulate(s.params).text.trim().split('\n'), py = fx.texts[s.text].trim().split('\n');
  assert.equal(js.length, py.length, 'simulated row count');
  assert.equal(js[0], py[0]);
  let maxd = 0;
  for (let i = 1; i < py.length; i++) {
    const a = js[i].split('\t'), b = py[i].split('\t');
    assert.equal(a[0], b[0]); assert.equal(a[4], b[4]);
    for (let k = 1; k <= 3; k++) maxd = Math.max(maxd, Math.abs(+a[k] - +b[k]));
  }
  assert.ok(maxd <= 0.011, `simulated coordinates differ by ${maxd}`);
  console.log(`ok  simulator ${JSON.stringify(s.params)}: ${py.length - 1} rows, max coordinate difference ${maxd.toFixed(3)} nm`);
}

assert.throws(() => parseTable('Channel Name\tXc\tYc\tZc\nA\t1\t2\t3\n'), /two channels/);
assert.throws(() => parseTable('Chan\tX\tY\n1\t2\t3\n'), /required/);
console.log(`all engine checks passed (${checks} numbers compared)`);

// flat (coplanar) clusters: volume 0 and flagged, as cluster_core.roi_stats
{
  const { roiStats } = await import('./analysis.js');
  const flat = Array.from({ length: 8 }, (_, i) => [Math.cos(i), Math.sin(i * 1.7), 5]);
  const s = roiStats(flat, [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  assert.equal(s.volume1, 0); assert.equal(s.flat1, true); assert.equal(s.flat2, false);
  console.log('ok  flat clusters flagged');
}
