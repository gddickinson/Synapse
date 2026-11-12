// Simulate page: make a labelled synthetic two-channel table (simulate.js = simulate.py), preview it in 3D,
// download it, or send it to the Analyse page.
import { $, app, download, esc, go, onLeave, route } from './core.js';
import { CH_COLORS, clusterColor, hexRgb, NOISE_COLOR } from './fmt.js';
import { SIM_DEFAULTS, simulate } from './simulate.js';
import { setTable } from './state.js';
import { parseTable } from './table.js';
import { createViewer } from './viewer3d.js';

const FIELDS = [
  ['seed', 'Random seed', 1], ['n_pairs', 'Paired "synapses" (A + B cluster)', 1], ['n_single', 'Unpaired clusters per channel', 1],
  ['locs', 'Mean localisations per cluster (uniform from locs/2 to 1.5·locs)', 1], ['sigma_xy', 'Cluster spread σ in x, y (nm)', 'any'],
  ['sigma_z', 'Cluster spread σ in z (nm)', 'any'], ['offset_nm', 'Distance between the A and B centres of a pair (nm)', 'any'],
  ['field_nm', 'Field width in x and y (nm)', 'any'], ['depth_nm', 'Depth in z (nm)', 'any'],
  ['noise', 'Uniform background localisations per channel', 1], ['z_rejected', '"Z Rejected" rows (ignored by the analysis)', 1]];
let p = { ...SIM_DEFAULTS }, sim = null;

route('simulate', () => {
  app().innerHTML = `
  <p class="kicker">Synthetic data with known truth</p>
  <h1>Simulate a localisation table</h1>
  <p class="lead">Gaussian clusters in two channels: each "synapse" is a channel-A cluster and a channel-B cluster a set distance
    apart in a random 3D direction, plus unpaired clusters, uniform background and a few "Z Rejected" rows. The table has the
    plugin's input columns and a <code>SimClusterID</code> ground-truth column. This is synthetic data, not a microscopy measurement.</p>
  <div class="side">
    <form class="params panel" id="sf">
      <fieldset><legend>Parameters</legend>${FIELDS.map(([k, l, st]) =>
        `<label for="s-${k}">${esc(l)}</label><input id="s-${k}" type="number" step="${st}" min="0" value="${p[k]}">`).join('')}</fieldset>
      <button type="submit">Generate</button> <button type="button" class="alt" id="reset">Defaults</button>
      <p class="status" id="sst" role="status" aria-live="polite"></p>
    </form>
    <div><div id="sv"></div>
      <p><button id="toan">Analyse this table</button> <button class="alt" id="dl">Download .txt</button></p>
      <p class="small mute">Colours: ground-truth cluster (shared by the two halves of a pair); grey = background. The same seed always gives the same table
        (the generator is shared with simulate.py in the repo).</p></div>
  </div>`;
  const viewer = createViewer($('#sv'));
  onLeave(() => viewer.destroy());
  const make = () => {
    for (const [k] of FIELDS) p[k] = Math.max(0, +$('#s-' + k).value || 0);
    if (p.n_pairs + p.n_single > 5000 || (p.n_pairs + 2 * p.n_single) * p.locs * 3 + 2 * p.noise > 2e6) {
      $('#sst').textContent = 'Too large for the browser preview: reduce the counts.'; return;
    }
    sim = simulate(p);
    const t = parseTable(sim.text), pos = [], col = [];
    for (let i = 0; i < t.channel.length; i++) {
      if (!t.names.includes(t.channel[i])) continue;
      pos.push(t.xyz[3 * i], t.xyz[3 * i + 1], t.xyz[3 * i + 2]);
      col.push(...(t.truth[i] < 0 ? hexRgb(NOISE_COLOR) : clusterColor(t.truth[i])));
    }
    const lo = [0, 0, 0], hi = [p.field_nm, p.field_nm, p.depth_nm];
    viewer.set({ points: pos, colors: col, bbox: { min: lo, max: hi },
      legend: [[CH_COLORS[0], 'clusters (by truth id)'], [NOISE_COLOR, 'background']] });
    $('#sst').textContent = `${sim.rows.toLocaleString('en-GB')} rows generated.`;
  };
  $('#sf').addEventListener('submit', e => { e.preventDefault(); make(); });
  $('#reset').onclick = () => { p = { ...SIM_DEFAULTS }; for (const [k] of FIELDS) $('#s-' + k).value = p[k]; make(); };
  $('#dl').onclick = () => sim && download(`synapse3d_simulated_seed${p.seed}.txt`, sim.text);
  $('#toan').onclick = () => {
    if (!sim) return;
    setTable(sim.text, `Simulated table (seed ${p.seed}, ${sim.rows} rows; synthetic, made in this browser)`, 'sim');
    go('#/analyse');
  };
  make();
});
