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
    from synapse_plugin.cluster_core import hull_simplices
    fn = load_function(file, "getHulls", {"np": np, "ConvexHull": ConvexHull, "hull_simplices": hull_simplices}, cls=cls)
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


# --- second round of fixes ------------------------------------------------------------------------------------------
def _save_stats_self(tmp_path, n_ch2_clusters):
    """Fake ClusterAnalysis state: 3 channel-1 clusters, two of them paired with the same channel-2 cluster."""
    import types
    c2 = np.array([[0.0, 0, 0], [0.0, 0, 0], [500.0, 0, 0]])  # channel-2 centroids of the 3 pairs (2 distinct)
    d = np.array([10.0, 20.0, 30.0])
    return types.SimpleNamespace(
        eps=100, min_samples=10, maxDistance=100, combined_ch1_Centeroids=c2 + 1, combined_ch2_Centeroids=c2,
        ch1Points=np.zeros((50, 2)), ch2Points=np.zeros((40, 2)), ch1_numNoise=5, ch2_numNoise=4,
        ch1_numClusters=3, ch2_numClusters=n_ch2_clusters, dist_clusters=d, distAll_clusters=d, dist_random=d,
        distAll_random=d, ch1_random=c2, ch2_random=c2,
        getClusterLocalizations=lambda ch: d, getClusterVolumes=lambda ch: d, displayMessage=lambda *a, **k: None)


def test_non_paired_channel2_clusters_counts_distinct_clusters(tmp_path):
    """saveStats reported channel-2 non-paired clusters as clusters minus pairs, which undercounts (even goes negative)
    when one channel-2 cluster is the nearest partner of several channel-1 clusters."""
    import pandas as pd
    from scipy import stats
    fn = load_function("clusterAnalysis_2.py", "saveStats", {"np": np, "pd": pd, "stats": stats, "os": os},
                       cls="ClusterAnalysis")
    fn(_save_stats_self(tmp_path, 2), savePath=str(tmp_path), fileName="t")
    row = pd.read_csv(tmp_path / "t_stats.csv").iloc[0]
    assert row["Channel 1: Number of non-paired clusters"] == 0
    assert row["Channel 2: Number of non-paired clusters"] == 0  # both channel-2 clusters are paired (was -1)


def test_core_counts_distinct_unpaired_channel2_clusters():
    from synapse_plugin.cluster_core import summary
    ch = [{"n": 10, "n_noise": 0, "n_clustered": 10, "n_clusters": 3}, {"n": 10, "n_noise": 0, "n_clustered": 10, "n_clusters": 2}]
    pairs = [{"cluster1": i, "cluster2": j, "n1": 4, "n2": 4, "volume1": 1.0, "volume2": 1.0} for i, j in ((0, 0), (1, 0), (2, 1))]
    s = summary(ch, pairs, np.ones(3), np.ones(9))
    assert (s["ch1"]["unpaired_clusters"], s["ch2"]["unpaired_clusters"]) == (0, 0)


def test_plugin_does_not_need_distutils():
    """The plugin imported distutils.version.StrictVersion, and distutils was removed in Python 3.12."""
    for f in sorted(PLUGIN.glob("*.py")):
        assert "from distutils" not in f.read_text(), f.name
    vc = load_module("version_compat.py", "version_compat")
    assert vc.StrictVersion("0.2.9") < vc.StrictVersion("0.2.23") <= vc.StrictVersion("0.2.23")
    assert vc.StrictVersion("1.0") > vc.StrictVersion("0.2.23")


@pytest.mark.parametrize("file", GUI_FILES)
def test_get_hulls_with_a_flat_cluster(file):
    """In 3D mode getHulls called ConvexHull on every cluster, which raises QhullError for a flat cluster (e.g. all Zc
    equal), stopping the analysis. A flat cluster now gets the 2D hull of its x, y footprint (as triangles)."""
    from synapse_plugin.cluster_core import hull_simplices
    cls = "ClusterAnalysis" if file == "clusterAnalysis_2.py" else "Synapse3D"
    fn = load_function(file, "getHulls", {"np": np, "ConvexHull": ConvexHull, "hull_simplices": hull_simplices}, cls=cls)
    rng = np.random.default_rng(5)
    flat = np.c_[rng.normal(0, 30, (15, 2)), np.full(15, 40.0)]
    pts = np.r_[flat, rng.normal(1000, 30, (12, 3))]
    labels = np.r_[np.zeros(15, int), np.ones(12, int)]
    hulls, centroids, groups = fn(None, pts, labels)
    assert len(hulls) == 2 and hulls[0].shape[1] == 3 and len(hulls[0]) > 0
    assert np.concatenate((hulls[0], hulls[1])).shape[1] == 3  # combineClosestHulls concatenates them


def test_core_flags_flat_clusters():
    from synapse_plugin.cluster_core import roi_stats
    rng = np.random.default_rng(6)
    flat = np.c_[rng.normal(0, 30, (10, 2)), np.zeros(10)]
    s = roi_stats(flat, rng.normal(0, 30, (10, 3)))
    assert s["volume1"] == 0 and s["flat1"] and not s["flat2"]


def test_no_compiled_python_tracked():
    """43 stale .pyc files (Python 3.6/3.7) were committed; they are now untracked and ignored."""
    r = subprocess.run(["git", "ls-files", "*.pyc"], cwd=PLUGIN.parent, capture_output=True, text=True)
    if r.returncode:
        pytest.skip("not a git checkout")
    assert r.stdout.strip() == ""
    assert "*.pyc" in (PLUGIN.parent / ".gitignore").read_text()
