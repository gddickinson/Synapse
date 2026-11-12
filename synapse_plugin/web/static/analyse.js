// Analyse page: pick the demo table or your own file, set the plugin's parameters, run the analysis in the browser,
// then explore the 3D view, the statistics, the paired clusters and the distance histograms.
import { $, api, app, download, esc, isStatic, onLeave, route } from './core.js';
import { analyse, DEFAULTS } from './analysis.js';
import { CH_COLORS, clusterColor, hexRgb, NOISE_COLOR } from './fmt.js';
import { charts, pairsCsv, pairsTable, pointsCsv, statsCsv, statsTable, tiles } from './results.js';
import { loadDemo, setTable, state } from './state.js';
import { NM_PER_PIXEL, UNIT_LABEL } from './table.js';
import { createViewer } from './viewer3d.js';

const view = { colour: 'channel', noise: true, links: true, size: 2, zscale: 1, page: 0, sel: -1 };
let viewer = null;

route('analyse', async () => {
  if (!state.table) await loadDemo();
  const p = state.params || { ...DEFAULTS, unit: 'nm', seed: 1 };
  app().innerHTML = `
  <p class="kicker">3D DBSCAN · paired clusters · nm</p>
  <h1>Analyse a localisation table</h1>
  <p class="lead">Runs the Synapse3D cluster analysis (the plugin's Version 2 pipeline) in your browser: nothing is uploaded.
    Columns needed: <code>Channel Name</code> (or <code>Channel</code>), <code>Xc</code>, <code>Yc</code>, <code>Zc</code>; tab- or comma-separated; two channels
    (rows named "Z Rejected" are ignored).</p>
  <div class="side">
    <form class="params panel" id="form">
      <fieldset class="src"><legend>Data</legend>
        <label><input type="radio" name="src" value="demo" ${state.kind !== 'file' ? 'checked' : ''}> Demo table (synthetic, labelled)</label>
        <label><input type="radio" name="src" value="file" ${state.kind === 'file' ? 'checked' : ''}> My file</label>
        <label for="file">Localisation file (.txt / .csv)</label><input type="file" id="file" accept=".txt,.csv,.tsv,text/plain,text/csv">
        <p class="hint" id="srclabel">${esc(state.label)}</p>
        <label for="unit">Coordinates in the file are in</label>
        <select id="unit">${Object.entries(UNIT_LABEL).map(([k, t]) => `<option value="${k}" ${p.unit === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        <p class="hint">Converted to nm before clustering (the plugin reads nm; ${NM_PER_PIXEL} nm is its camera pixel size).</p>
      </fieldset>
      <fieldset><legend>Clustering</legend>
        <label for="eps">Max distance between points, eps (nm)</label><input id="eps" type="number" min="0.001" step="any" value="${p.eps}">
        <label for="ms">Minimum number of points (min_samples)</label><input id="ms" type="number" min="1" step="1" value="${p.min_samples}">
        <label for="md">Max distance between clusters (nm)</label><input id="md" type="number" min="0" step="any" value="${p.max_distance}">
        <label for="seed">Seed for the random control</label><input id="seed" type="number" step="1" value="${p.seed}">
      </fieldset>
      <button type="submit">Run analysis</button>
      <p class="status" id="status" role="status" aria-live="polite"></p>
    </form>
    <div>
      <div id="viewer"></div>
      <div class="vctl">
        <label>Colour <select id="colour"><option value="channel">by channel</option><option value="cluster">by cluster</option>
          <option value="truth">by simulated truth</option></select></label>
        <label><input type="checkbox" id="noise" ${view.noise ? 'checked' : ''}> noise</label>
        <label><input type="checkbox" id="links" ${view.links ? 'checked' : ''}> centroids &amp; pair links</label>
        <label>size <input type="range" id="size" min="1" max="6" step="0.5" value="${view.size}"></label>
        <label>z × <input type="range" id="zs" min="1" max="10" step="1" value="${view.zscale}"> <b id="zsv">${view.zscale}</b></label>
      </div>
    </div>
  </div>
  <div id="out"></div>`;
  viewer = createViewer($('#viewer'));
  onLeave(() => viewer && viewer.destroy());
  $('#colour').value = view.colour;
  wire();
  if (state.result) show(); else await run();
});

function wire() {
  $('#file').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      setTable(await f.text(), `${f.name} (${(f.size / 1e6).toFixed(2)} MB, read in your browser)`, 'file');
      document.querySelector('input[name=src][value=file]').checked = true;
      $('#srclabel').textContent = state.label;
      await run();
    } catch (err) { status(err.message, true); }
  });
  $('#form').addEventListener('submit', async e => {
    e.preventDefault();
    const src = document.querySelector('input[name=src]:checked').value;
    if (src === 'demo' && state.kind !== 'demo') { await loadDemo(); $('#srclabel').textContent = state.label; }
    if (src === 'file' && state.kind !== 'file') return status('Choose a file first.', true);
    await run();
  });
  const redraw = () => draw();
  $('#colour').addEventListener('change', e => { view.colour = e.target.value; redraw(); });
  $('#noise').addEventListener('change', e => { view.noise = e.target.checked; redraw(); });
  $('#links').addEventListener('change', e => { view.links = e.target.checked; redraw(); });
  $('#size').addEventListener('input', e => { view.size = +e.target.value; viewer.options({ size: view.size }); });
  $('#zs').addEventListener('input', e => { view.zscale = +e.target.value; $('#zsv').textContent = view.zscale; viewer.options({ zscale: view.zscale }); });
}

function status(msg, bad = false) { const s = $('#status'); if (s) { s.textContent = msg; s.className = 'status' + (bad ? ' err' : ''); } }

async function run() {
  const params = { eps: +$('#eps').value, min_samples: +$('#ms').value, max_distance: +$('#md').value,
    unit: $('#unit').value, seed: Math.trunc(+$('#seed').value) || 0 };
  status('Clustering...');
  await new Promise(r => setTimeout(r, 20));  // let the status paint
  try {
    const t0 = performance.now();
    state.result = analyse(state.table, params);
    state.params = params; state.python = null; view.page = 0; view.sel = -1;
    status(`Done in ${Math.round(performance.now() - t0)} ms (in your browser).`);
    show();
  } catch (err) { status(err.message, true); }
}

function show() {
  const r = state.result, [a, b] = r.channels;
  $('#out').innerHTML = `
    ${tiles(r)}
    <div id="check">${agreement()}</div>
    <h2>Statistics</h2>${statsTable(r)}
    <h2>Paired clusters (ROIs)</h2>
    <p class="small mute">Each <span class="c1">${esc(a.name)}</span> cluster is paired with the nearest <span class="c2">${esc(b.name)}</span>
      cluster whose centroid is within ${r.params.max_distance} nm. Volumes are convex hulls (0 below 4 points or for a flat cluster).</p>
    <div id="pairs">${pairsTable(r, view.page, 25, view.sel)}</div>
    <h2>Distances</h2>${charts(r)}
    <h2>Export</h2>
    <p><button class="alt" id="dl-pairs">Paired clusters CSV</button> <button class="alt" id="dl-stats">Statistics CSV</button>
      <button class="alt" id="dl-pts">Localisations with cluster labels CSV</button></p>`;
  $('#dl-pairs').onclick = () => download('roiAnalysis.csv', pairsCsv(r), 'text/csv');
  $('#dl-stats').onclick = () => download('stats.csv', statsCsv(r), 'text/csv');
  $('#dl-pts').onclick = () => download('localisations_labelled.csv', pointsCsv(r), 'text/csv');
  const btn = $('#pycheck');
  if (btn) btn.onclick = pythonCheck;
  $('#pairs').addEventListener('click', onPairs);
  $('#pairs').addEventListener('keydown', e => { if (e.key === 'Enter') onPairs(e); });
  draw();
}

function onPairs(e) {
  const pg = e.target.closest('[data-pg]'), tr = e.target.closest('tr[data-roi]'), r = state.result;
  if (pg) view.page += +pg.dataset.pg;
  else if (tr) {
    view.sel = +tr.dataset.roi;
    const p = r.pairs[view.sel];
    viewer.focus(p.center, 0.35);
  } else return;
  $('#pairs').innerHTML = pairsTable(r, view.page, 25, view.sel);
}

// Compare with Python: automatically for the demo with default parameters (result exported at build time),
// on request against the local server otherwise.
function agreement() {
  const r = state.result, p = state.params;
  const ref = state.python || (state.kind === 'demo' && state.demoPython &&
    ['eps', 'min_samples', 'max_distance'].every(k => +p[k] === +state.demoParams[k]) && p.unit === 'nm' ? state.demoPython : null);
  if (ref) {
    const d = maxRel(r.stats, ref.stats);
    const ok = d < 1e-6;
    return `<p><span class="badge ${ok ? 'ok' : 'bad'}">${ok ? 'matches' : 'differs from'} the Python analysis (cluster_core.py)</span>
      <span class="small mute">largest relative difference in the statistics ${d.toExponential(1)}${state.python ? '' : '; Python result computed when the site was built'}</span></p>`;
  }
  return isStatic() ? '' : '<p><button class="alt" id="pycheck">Check against the Python analysis</button></p>';
}

async function pythonCheck() {
  const b = $('#pycheck');
  b.disabled = true; b.textContent = 'Running in Python...';
  try {
    state.python = await api('/analyse', { body: { text: state.text, ...state.params } });
    $('#check').innerHTML = agreement();
  } catch (err) { $('#check').innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

function maxRel(a, b) {
  if (typeof b === 'number') return Math.abs(a - b) / Math.max(1e-12, Math.abs(b));
  if (b === null || a === null) return a === b ? 0 : Infinity;
  return Math.max(0, ...Object.keys(b).map(k => maxRel(a[k], b[k])));
}

function draw() {
  const r = state.result;
  if (!r || !viewer) return;
  const pos = [], col = [], truth = state.table.truth;
  const leg = [];
  const noiseRgb = hexRgb(NOISE_COLOR);
  if (view.colour === 'truth' && !truth) { view.colour = 'channel'; $('#colour').value = 'channel'; }
  r.channels.forEach((ch, c) => {
    const chRgb = hexRgb(CH_COLORS[c]);
    ch.labels.forEach((l, i) => {
      if (l < 0 && !view.noise) return;
      pos.push(r.points[c][3 * i], r.points[c][3 * i + 1], r.points[c][3 * i + 2]);
      let rgb;
      if (view.colour === 'cluster') rgb = l < 0 ? noiseRgb : clusterColor(l + 1000 * c);
      else if (view.colour === 'truth') { const t = truth[ch.rows[i]]; rgb = t < 0 ? noiseRgb : clusterColor(t); }
      else rgb = l < 0 ? chRgb.map(v => v * 0.35) : chRgb;
      col.push(...rgb);
    });
    if (view.colour === 'channel') leg.push([CH_COLORS[c], ch.name]);
  });
  if (view.colour !== 'channel') leg.push(['linear-gradient(90deg,#f55,#5f5,#55f)', view.colour === 'truth' ? 'simulated cluster' : 'DBSCAN cluster']);
  leg.push([NOISE_COLOR, view.colour === 'truth' ? 'background' : 'noise']);
  const cen = [], cc = [], lines = [], lc = [];
  if (view.links) {
    for (const p of r.pairs) {
      cen.push(...p.centroid1, ...p.centroid2); cc.push(1, 1, 1, 1, 1, 1);
      lines.push(...p.centroid1, ...p.centroid2); lc.push(0.35, 0.69, 1, 0.35, 0.69, 1);
    }
    leg.push(['#fff', 'paired centroids']);
  }
  viewer.set({ points: pos, colors: col, centroids: cen, centroidColors: cc, lines, lineColors: lc, bbox: r.bbox, legend: leg });
  viewer.options({ size: view.size, zscale: view.zscale });
}
