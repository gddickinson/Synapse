// Home: hero, real counts from the Python analysis of the demo table, cards to the pages.
import { app, esc, route } from './core.js';
import { getInfo } from './state.js';

route('home', async () => {
  const info = await getInfo(), d = info.demo, df = info.defaults;
  app().innerHTML = `
  <section class="hero">
    <p class="kicker">Superresolution microscopy · 3D cluster analysis</p>
    <h1 class="glow">Synapse3D</h1>
    <p class="lead">Find protein clusters in two-channel 3D localisation tables with DBSCAN, pair each cluster with its nearest partner
      in the other channel, and measure counts, convex-hull volumes and centroid distances in nanometres, against a random control.
      The analysis of the FLIKA plugin, running in your browser on your own file.</p>
    <a class="btn" href="#/analyse">Analyse a table</a><a class="btn alt" href="#/simulate">Simulate data</a><a class="btn alt" href="#/method">How it works</a>
  </section>
  <div class="tiles">
    <div class="tile"><b>${d.rows.toLocaleString('en-GB')}</b><span>rows in the demo table (synthetic)</span></div>
    <div class="tile"><b>${d.clusters[0]} / ${d.clusters[1]}</b><span>clusters found per channel</span></div>
    <div class="tile"><b>${d.pairs}</b><span>paired clusters</span></div>
    <div class="tile"><b>${Math.round(d.nearest_mean_nm)} nm</b><span>mean nearest centroid distance</span></div>
    <div class="tile"><b>${df.eps} / ${df.min_samples} / ${df.max_distance}</b><span>default eps (nm) / min points / max pair distance (nm)</span></div>
  </div>
  <p class="small mute">Demo numbers: the repo's Python code (cluster_core.py) on a table from simulate.py with the plugin's default parameters.
    The repo contains no measured localisation data, so the demo is synthetic and labelled as such.</p>
  <h2>Pages</h2>
  <div class="grid">
    <a class="card" href="#/analyse"><b>Analyse</b><span>Load the demo or your own localisation file (${esc(info.ignore.join(', '))} rows ignored), set eps, min points and the pairing distance, and explore the 3D view, statistics, paired clusters and distance histograms. Export CSVs.</span></a>
    <a class="card" href="#/simulate"><b>Simulate</b><span>Generate a labelled synthetic table with known pairs and background, preview it in 3D, download it or analyse it.</span></a>
    <a class="card" href="#/method"><b>Method</b><span>The pipeline step by step, the units, and how the browser version is checked against the Python code.</span></a>
    <a class="card" href="#/about"><b>About</b><span>The FLIKA plugin, authors, how to run the desktop and web apps.</span></a>
  </div>`;
});
