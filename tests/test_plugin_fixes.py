"""Regression tests for bugs fixed in the desktop plugin code (run against the plugin's own source).

Run: python -m pytest -q tests/test_plugin_fixes.py
"""
import ast
import os
import random
import subprocess
import sys

import numpy as np
import pytest
from scipy.spatial import ConvexHull

sys.path.insert(0, os.path.dirname(__file__))
from gui_source import PLUGIN, function_source, load_function, load_module  # noqa: E402

GUI_FILES = ["clusterAnalysis_2.py", "Synapse3D.py"]


def _border_stolen_points():
    """13 points where sklearn's DBSCAN (eps=100, min_samples=4) returns a 1-point cluster: the last point is a core
    point whose three neighbours are border points already claimed by three earlier clusters."""
    pts = []
    for d in [(1, 0), (-1, 0), (0, 1)]:
        d = np.array(d, float)
        o = np.array([-d[1], d[0]])
        pts += [1.8 * d, 0.9 * d, 2.4 * d + 0.6 * o, 2.4 * d - 0.6 * o]
    pts.append(np.zeros(2))
    return np.c_[np.array(pts) * 100, np.zeros(len(pts))]


def test_dbscan_module_imports_and_returns_array():
    """BioDocks/dbscan.py imported sklearn.datasets.samples_generator (removed in scikit-learn 0.24), so the plugin
    could not start; and after dropping undersized clusters it returned labels as a Python list, which broke
    `points[labels == i]` in getHulls."""
    mod = load_module("BioDocks/dbscan.py", "biodocks_dbscan")
    labels, n_clusters, n_noise = mod.dbscan(_border_stolen_points(), eps=100, min_samples=4)
    assert isinstance(labels, np.ndarray)
    assert labels.tolist() == [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, -1]
    assert (n_clusters, n_noise) == (3, 1)


@pytest.mark.parametrize("file", GUI_FILES)
def test_random_points_fill_the_x_range(file):
    """getRandomXYZ drew x from uniform(minX, maxY) instead of uniform(minX, maxX)."""
    cls = "ClusterAnalysis" if file == "clusterAnalysis_2.py" else "Synapse3D"
    fn = load_function(file, "getRandomXYZ", {"np": np, "random": random}, cls=cls)
    random.seed(3)
    pts = fn(None, 0, 0, -50, 20000, 100, 50, 500)
    assert pts[:, 0].min() >= 0 and pts[:, 0].max() <= 20000
    assert pts[:, 0].max() > 1000  # with the bug every x was <= maxY = 100


@pytest.mark.parametrize("file", GUI_FILES)
def test_get_hulls_with_clusters_of_different_sizes(file):
    """getHulls built np.array() from ragged lists, which numpy >= 1.24 refuses (ValueError) whenever two clusters
    have different sizes, i.e. on almost every real data set."""
    cls = "ClusterAnalysis" if file == "clusterAnalysis_2.py" else "Synapse3D"
    fn = load_function(file, "getHulls", {"np": np, "ConvexHull": ConvexHull}, cls=cls)
    rng = np.random.default_rng(1)
    pts = np.r_[rng.normal(0, 30, (12, 3)), rng.normal(1000, 30, (20, 3)), rng.uniform(-5000, 5000, (5, 3))]
    labels = np.r_[np.zeros(12, int), np.ones(20, int), -np.ones(5, int)]
    hulls, centroids, groups = fn(None, pts, labels)
    assert len(hulls) == 2 and [len(g) for g in groups] == [12, 20]
    np.testing.assert_allclose(centroids[1], pts[12:32].mean(axis=0))


@pytest.mark.parametrize("file", GUI_FILES)
def test_channel_order_does_not_depend_on_hash_seed(file):
    """open_file took the channel names from a set, whose order changes with Python's per-process string hash seed, so
    which channel was 'channel 1' (the one whose clusters are paired to their nearest channel-2 cluster) could change
    from run to run."""
    cls = "ClusterAnalysis" if file == "clusterAnalysis_2.py" else "Synapse3D"
    src = function_source(file, "open_file", cls=cls)
    line = next(ln.strip() for ln in src.splitlines() if ln.strip().startswith("self.names ="))
    expr = ast.unparse(ast.parse(line).body[0].value)
    prog = ("import numpy as np, types\n"
            "self = types.SimpleNamespace(ignore={'Z Rejected'}, data={'Channel Name': np.array("
            "['atto488', 'Alexa647', 'Z Rejected', '405/640', 'atto488'])})\n"
            f"print(list({expr}))")
    outs = set()
    for seed in range(8):
        env = dict(os.environ, PYTHONHASHSEED=str(seed))
        outs.add(subprocess.run([sys.executable, "-c", prog], env=env, capture_output=True, text=True,
                                check=True).stdout)
    assert len(outs) == 1, outs


def test_fixed_files_still_compile():
    for f in GUI_FILES + ["clusterAnalysis.py", "clusterTest.py", "clusterTest_stepBystep.py", "BioDocks/dbscan.py"]:
        compile((PLUGIN / f).read_text(), f, "exec")
