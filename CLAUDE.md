# Synapse3D

FLIKA plugin for 3D DBSCAN cluster analysis of two-channel localisation tables (nm), plus a web interface.
Navigation map: @INTERFACE.md. Progress: SESSION_LOG.md.

- The desktop plugin imports flika/PyQt/`distutils` at module level; tests load single plugin functions with
  `tests/gui_source.py` instead of importing it.
- `synapse_plugin/cluster_core.py` is the Qt-free pipeline; the web JS (`web/static/analysis.js` etc.) is a port tested
  against it. After changing either, run `python scripts/make_engine_fixture.py` and `python -m pytest -q tests`.
- Web app port 8111. Files under 500 lines.
