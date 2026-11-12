// Synthetic two-channel localisation tables: port of synapse_plugin/simulate.py (same mulberry32 stream, so the same
// seed gives the same table; checked by engine.test.mjs). Not real microscopy data.
import { rng } from './core.js';

export const SIM_DEFAULTS = { seed: 7, n_pairs: 40, n_single: 8, locs: 40, sigma_xy: 35, sigma_z: 50, offset_nm: 70,
  field_nm: 12000, depth_nm: 800, noise: 400, z_rejected: 60 };
export const SIM_NAMES = ['synthetic A', 'synthetic B'];

export function simulate(opts = {}) {
  const p = { ...SIM_DEFAULTS, ...opts };
  const rand = rng(Math.trunc(p.seed));
  const gauss = () => { const u1 = rand(), u2 = rand(); return Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2); };
  const centre = () => [p.field_nm * rand(), p.field_nm * rand(), p.depth_nm * (0.25 + 0.5 * rand())];
  const rows = [];
  const blob = (name, c, id) => {
    const n = Math.floor(Math.trunc(p.locs) / 2) + Math.floor(Math.trunc(p.locs) * rand());
    for (let k = 0; k < n; k++) {
      rows.push([name, c[0] + p.sigma_xy * gauss(), c[1] + p.sigma_xy * gauss(), c[2] + p.sigma_z * gauss(), id]);
    }
  };
  let id = 0;
  for (let i = 0; i < Math.trunc(p.n_pairs); i++) {
    const c = centre();
    const phi = 2 * Math.PI * rand(), cz = 2 * rand() - 1, s = Math.sqrt(1 - cz * cz);
    const d = [s * Math.cos(phi), s * Math.sin(phi), cz], h = p.offset_nm / 2;
    blob(SIM_NAMES[0], c.map((v, k) => v - d[k] * h), id);
    blob(SIM_NAMES[1], c.map((v, k) => v + d[k] * h), id);
    id++;
  }
  for (let i = 0; i < Math.trunc(p.n_single); i++) for (const name of SIM_NAMES) blob(name, centre(), id++);
  for (const name of [...SIM_NAMES, 'Z Rejected']) {
    const n = Math.trunc(name === 'Z Rejected' ? p.z_rejected : p.noise);
    for (let k = 0; k < n; k++) rows.push([name, p.field_nm * rand(), p.field_nm * rand(), p.depth_nm * rand(), -1]);
  }
  const lines = ['Channel Name\tXc\tYc\tZc\tSimClusterID',
    ...rows.map(r => `${r[0]}\t${r[1].toFixed(2)}\t${r[2].toFixed(2)}\t${r[3].toFixed(2)}\t${r[4]}`)];
  return { text: lines.join('\n') + '\n', params: p, rows: rows.length };
}
