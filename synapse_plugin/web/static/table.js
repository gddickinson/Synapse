// Localisation-table reader (port of cluster_core.parse_table) and unit handling.
// Format (the plugin's): header row with 'Channel Name' (or 'Channel'), Xc, Yc, Zc; tab- or comma-separated; other
// columns are ignored. Rows of channel "Z Rejected" are kept for the bounding box but are not analysed.

export const IGNORE = new Set(['Z Rejected']);
export const NM_PER_PIXEL = 166;  // ClusterAnalysis.unitPerPixel in clusterAnalysis_2.py
export const UNITS = { nm: 1, um: 1000, px: NM_PER_PIXEL };
export const UNIT_LABEL = { nm: 'nm', um: 'µm', px: `pixels (${NM_PER_PIXEL} nm each)` };

const strip = s => s.trim().replace(/^"|"$/g, '');

// Returns { names: [ch1, ch2] (sorted), channel: string[], xyz: Float64Array (file units), columns, extra }
// `extra` holds a numeric SimClusterID column when present (ground truth of the simulator).
export function parseTable(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('The file needs a header row and at least one data row.');
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(sep).map(strip);
  const idx = {};
  header.forEach((h, i) => { idx[h.toLowerCase()] = i; });
  const ci = idx['channel name'] ?? idx.channel;
  const cols = ['xc', 'yc', 'zc'].map(k => idx[k]);
  if (ci === undefined || cols.includes(undefined)) {
    throw new Error(`Columns 'Channel Name' (or 'Channel'), 'Xc', 'Yc' and 'Zc' are required; found: ${header.join(', ')}`);
  }
  const ti = idx.simclusterid;
  const n = lines.length - 1, xyz = new Float64Array(3 * n), channel = new Array(n);
  const truth = ti === undefined ? null : new Int32Array(n);
  for (let r = 0; r < n; r++) {
    const f = lines[r + 1].split(sep).map(strip);
    if (f.length < header.length) throw new Error(`Row ${r + 2} has ${f.length} fields, the header has ${header.length}.`);
    for (let k = 0; k < 3; k++) {
      const v = Number(f[cols[k]]);
      if (f[cols[k]] === '' || !Number.isFinite(v)) throw new Error(`Row ${r + 2}: Xc/Yc/Zc must be numbers.`);
      xyz[3 * r + k] = v;
    }
    channel[r] = f[ci];
    if (truth) truth[r] = Number(f[ti]);
  }
  const names = [...new Set(channel)].filter(c => !IGNORE.has(c)).sort(pyCompare);
  if (names.length !== 2) {
    throw new Error(`Exactly two channels are needed (rows named "Z Rejected" are ignored); found ${names.length}: ${names.join(', ') || 'none'}.`);
  }
  return { names, channel, xyz, columns: header, truth };
}

// Python's sorted() order for strings (code points), not localeCompare.
export function pyCompare(a, b) {
  const A = [...a], B = [...b];
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const d = A[i].codePointAt(0) - B[i].codePointAt(0);
    if (d) return d;
  }
  return A.length - B.length;
}
