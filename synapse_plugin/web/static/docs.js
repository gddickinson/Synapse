// Method and About pages (content from the README, user-guide.md and the code).
import { app, route } from './core.js';
import { getInfo } from './state.js';

route('method', async () => {
  const info = await getInfo(), d = info.defaults;
  app().innerHTML = `
  <p class="kicker">How it works</p>
  <h1>The analysis, step by step</h1>
  <p class="lead">The same steps as <code>ClusterAnalysis.runAnalysis</code> in <code>synapse_plugin/clusterAnalysis_2.py</code> (the plugin's
    "Synapse3D Version 2"). All lengths are in nanometres; volumes in nm³ (1 µm³ = 10⁹ nm³).</p>
  <ol class="steps">
    <li><b>Read the table.</b> Columns <code>Channel Name</code> (or <code>Channel</code>), <code>Xc</code>, <code>Yc</code>, <code>Zc</code>. Rows of channel
      <code>Z Rejected</code> are dropped from the analysis (but still count for the bounding box of the random control). Exactly two channels must remain;
      channel 1 is the first name in sorted order. Coordinates given in µm or in camera pixels (${info.nm_per_pixel} nm, the plugin's value) are converted to nm.</li>
    <li><b>DBSCAN in 3D, per channel</b> (<code>BioDocks/dbscan.py</code>, scikit-learn). A point with at least <i>min_samples</i> points (itself included)
      within <i>eps</i> is a core point; clusters grow from core points. Then the plugin turns any cluster with fewer than min_samples points into noise.
      Defaults: eps = ${d.eps} nm, min_samples = ${d.min_samples}.</li>
    <li><b>Centroids and pairing</b> (<code>getHulls</code>, <code>combineClosestHulls</code>). Each channel-1 cluster is paired with the channel-2 cluster whose
      centroid is nearest, if that distance is at most the <i>max distance between clusters</i> (default ${d.max_distance} nm). A channel-2 cluster can be paired more than once.</li>
    <li><b>Per pair (ROI)</b> (<code>analyze_roi</code>): localisations per channel, convex-hull volume per channel (0 with fewer than 4 points; 0 and flagged
      "flat" when the points are coplanar, e.g. 2D data with one Zc, where the plugin now draws the x, y footprint instead of stopping), the distance between the two centroids ("Mean Distance"), and the x, y, z extents of both clusters together (the plugin calls them height, width, depth).</li>
    <li><b>Distances against a random control</b> (<code>randomPointAnalysis</code>): from each channel-2 paired centroid, the distance to the nearest channel-1
      paired centroid, and to all of them. The same is done for as many uniformly random points in the data's bounding box. Summaries: mean, SEM (n−1), SD (n).</li>
  </ol>
  <h2>Browser and Python</h2>
  <p>The web pages run a JavaScript port of the pipeline (<code>dbscan.js</code>, <code>hull.js</code>, <code>analysis.js</code>). A node test runs it on
    synthetic tables with several parameter sets and on an edge case for the min_samples filter, and requires the same DBSCAN label for every localisation
    and the same numbers to 10⁻⁹ relative as <code>synapse_plugin/cluster_core.py</code> (scikit-learn DBSCAN, scipy ConvexHull and cKDTree). The random control
    uses a different random generator in each language, so only its method is the same. On the Analyse page the demo result is compared with the Python
    result live; with the local app you can check any file against Python.</p>
  <h2>Differences from the desktop plugin</h2>
  <ul>
    <li>The plugin rounds volumes, distances and extents to 0.01 nm in its table; the web shows them unrounded (and computes the box volume from unrounded extents).</li>
    <li>The plugin assigns each point of a pair back to a channel by comparing coordinates, so a channel-2 point with exactly the same coordinates as a channel-1 point would be counted in channel 1; the web keeps each point's own channel.</li>
    <li>The plugin's 2D ROI drawing, intensity colouring and batch mode (folders of files with <code>batch.yaml</code>) are desktop-only.</li>
  </ul>`;
});

route('about', () => {
  app().innerHTML = `
  <p class="kicker">About</p>
  <h1>Synapse3D</h1>
  <p class="lead">A FLIKA plugin for 3D cluster analysis of superresolution microscopy data, with a focus on synaptic protein organization:
    DBSCAN cluster detection in 3D, dual-channel analysis of cluster relationships, cluster volume and density, statistics against random
    distributions, batch processing and CSV export (from the README).</p>
  <h2>Desktop plugin</h2>
  <p>Install <a href="http://flika-org.github.io/" rel="noopener">FLIKA</a>, put the <code>synapse_plugin</code> folder in FLIKA's plugins folder, then
    Plugins → Synapse → choose "synapse3D_version2" (or the batch version). It needs numpy, scipy, pandas, scikit-learn, PyQt5, pyqtgraph and, for the
    Version 2 window, pathos and PyYAML. See <code>synapse_plugin/user-guide.md</code>.</p>
  <h2>Web app</h2>
  <pre>pip install -r requirements-web.txt
python run_web.py          # http://127.0.0.1:8111</pre>
  <p>The local app adds the "check against Python" button (POST /api/analyse runs <code>cluster_core.py</code>). The static site on GitHub Pages runs
    everything else in the browser; files you load are never uploaded.</p>
  <h2>Credits</h2>
  <p>George Dickinson and Brett Settle. Originally developed from code by Brett Settle
    (<a href="https://github.com/BrettJSettle/SynapseAnalysis" rel="noopener">SynapseAnalysis</a>) for the Ian Smith Lab at the University of California, Irvine.
    The repository's own code is MIT licensed; the bundled BioDocks code and <code>tifffile.py</code> keep their authors' terms (THIRD_PARTY.md).</p>`;
});
