# INTERFACE.md: navigation map

## Desktop FLIKA plugin (`synapse_plugin/`)
| File | Contents |
|------|----------|
| `info.xml`, `synapse_Start.py` | FLIKA menu entry: `SynapseStart` chooses "synapse3D_version2" (`ClusterAnalysis`) or its batch dialog (`Synapse3D_batch_2`). |
| `clusterAnalysis_2.py` | Version 2 (current): `ClusterAnalysis` (open_file, getClusters, getHulls, makeHulls, makeROIs, analyze_roi, randomPointAnalysis, saveStats, runAnalysis, runBatch...), `ClusterOptions_win`, `PlotOption_win`, `Synapse3D_batch_2`. Qt/flika/pathos/yaml. |
| `Synapse3D.py`, `Synapse.py`, `clusterAnalysis.py` | Earlier versions (not in the menu). |
| `clusterTest.py`, `clusterTest_stepBystep.py`, `*_example.py`, `*Test*.py`, `test_NearestNeighbour` | Development scripts. |
| `BioDocks/` | Brett Settle's BioDocks library (third-party terms, see THIRD_PARTY.md): `dbscan.py` (sklearn DBSCAN + undersized-cluster filter), `ClusterMath.py` (`convex_volume`), `Tools.py` (`combineClosestHulls`, `order_points`), `Channels.py`, `ROIs.py`, `AnalysisIO.py` (`importFile`), widgets. Package `__init__` imports Qt. |
| `cluster_core.py` | Qt-free Version 2 pipeline: `DEFAULTS`, `UNITS`, `parse_table`, `dbscan_labels`, `convex_volume`, `hull_simplices` (also used by the plugin's getHulls: 2D fallback for flat clusters), `is_flat`, `clusters_of`, `pair_clusters`, `roi_stats`, `nn_distances`, `random_box_points`, `describe`, `analyse`, `summary`, `clean`. numpy/scipy/sklearn. Used by the web app; tested against the plugin's functions. |
| `version_compat.py` | `StrictVersion` replacement (distutils is gone in Python 3.12); used by every plugin module. |
| `simulate.py` | Synthetic labelled two-channel tables: `DEFAULTS`, `NAMES`, `mulberry32` (same stream as core.js `rng`), `simulate`. |
| `user-guide.md`, `batch.yaml`, `_roiAnalysis.csv` | User guide, batch parameter example, example ROI output. |

## Web interface (`synapse_plugin/web/`, module `synapse_plugin.web.app`)
| File | Contents |
|------|----------|
| `run_web.py` | Starts uvicorn on 127.0.0.1:8111. |
| `web/app.py` | FastAPI: `/api/info`, `/api/demo` (simulated table + Python result; both exported), `POST /api/analyse` (Python reference); `STATIC_ENDPOINTS`. |
| `scripts/build_static.py` | Static site export (every STATIC_ENDPOINTS GET to JSON). |
| `scripts/screenshots.py` | Playwright smoke test + `docs/img/*.png`. |
| `scripts/make_engine_fixture.py` | Writes `tests/fixtures/engine_cases.json` from cluster_core/simulate. |
| `.github/workflows/pages.yml` | Tests, builds and publishes the static site on push to main. |

### Front end (`web/static/`, ES modules, no build step)
| File | Contents |
|------|----------|
| `index.html`, `style.css` (kit theme), `style_app.css`, `icon.svg` | Shell and styles. |
| `core.js` | Kit core: `api`, router, `download`, `rng` (mulberry32). |
| `main.js` | Lazy pages, mode label, background. |
| `static_api.js` | Static site: exported JSON; the Python cross-check needs the server. |
| `table.js` | `parseTable`, `UNITS`, `NM_PER_PIXEL`, `IGNORE`. |
| `dbscan.js` | `dbscan`, `neighbourhoods` (grid) matching sklearn + plugin filter. |
| `hull.js` | `convexVolume` (incremental 3D hull). |
| `analysis.js` | `analyse` (port of cluster_core.analyse), `isFlat`, `pairClusters`, `roiStats`, `nnDistances`, `describe`, `summary`. |
| `simulate.js` | Port of simulate.py. |
| `engine.test.mjs` | Node test of the above against the fixture. |
| `viewer3d.js` | Raw WebGL point-cloud viewer (`createViewer`: set, options, focus). |
| `charts.js` | SVG `histogram`. |
| `fmt.js`, `state.js`, `results.js` | Formatting/colours/CSV; shared table+result state; stats/pairs tables, charts, CSV exports. |
| `home.js`, `analyse.js`, `simulate_page.js`, `docs.js` | Pages (`docs.js`: method, about). |

## Tests (`tests/`)
`test_plugin_fixes.py` (regressions for fixed plugin bugs, via `gui_source.py` which loads plugin functions without Qt),
`test_core.py` (cluster_core vs the plugin's functions; fixture current), `test_web.py` (API, static build, node test).
