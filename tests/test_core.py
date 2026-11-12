"""cluster_core.py (the Qt-free pipeline used by the web app) agrees with the desktop plugin's own functions, and the
JS engine fixture is current.

Run: python -m pytest -q tests/test_core.py
"""
import json
import os
import sys
import types
from collections import OrderedDict
from pathlib import Path

import numpy as np
import pytest
from scipy.spatial import KDTree

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, os.path.dirname(__file__))

from gui_source import load_function, load_module  # noqa: E402
from synapse_plugin import cluster_core as core  # noqa: E402
from synapse_plugin.simulate import mulberry32, simulate  # noqa: E402


@pytest.fixture(scope="module")
def table():
    return core.parse_table(simulate(seed=5, n_pairs=15, n_single=5, noise=200)["text"])


def _channel(table, k):
    return table["xyz"][np.array(table["channel"]) == table["names"][k]]


def test_dbscan_matches_plugin_dbscan(table):
    plugin = load_module("BioDocks/dbscan.py", "biodocks_dbscan")
    for k in (0, 1):
        pts = _channel(table, k)
        for eps, ms in ((100, 10), (60, 4), (200, 30)):
            a = plugin.dbscan(pts, eps=eps, min_samples=ms)
            b = core.dbscan_labels(pts, eps, ms)
            assert np.array_equal(np.asarray(a[0]), b[0]) and a[1:] == b[1:]


def test_volume_matches_plugin_convex_volume():
    cm = load_module("BioDocks/ClusterMath.py", "biodocks_clustermath")
    rng = np.random.default_rng(2)
    for n in (4, 10, 100):
        p = rng.normal(0, 50, (n, 3))
        assert core.convex_volume(p) == pytest.approx(cm.convex_volume(p), rel=1e-9)
    assert core.convex_volume(rng.normal(size=(3, 3))) == 0.0
    assert core.convex_volume(np.c_[rng.normal(size=(10, 2)), np.zeros(10)]) == 0.0


def test_pairing_and_roi_stats_match_plugin(table):
    combine = load_function("BioDocks/Tools.py", "combineClosestHulls", {"np": np, "KDTree": KDTree})
    cm = load_module("BioDocks/ClusterMath.py", "biodocks_clustermath")
    analyze_roi = load_function("clusterAnalysis_2.py", "analyze_roi",
                                {"np": np, "OrderedDict": OrderedDict, "convex_volume": cm.convex_volume}, cls="ClusterAnalysis")
    cl = []
    for k in (0, 1):
        pts = _channel(table, k)
        cl.append(core.clusters_of(pts, core.dbscan_labels(pts, 100, 10)[0]))
    pairs = core.pair_clusters(cl[0], cl[1], 100)
    hulls = [[np.zeros((1, 3), int)] * len(c) for c in cl]
    _, pts_list, c1, c2 = combine(hulls[0], np.array([c["centroid"] for c in cl[0]]), [c["points"] for c in cl[0]],
                                  hulls[1], np.array([c["centroid"] for c in cl[1]]), [c["points"] for c in cl[1]], 100)
    assert len(pairs) == len(pts_list) > 0
    names = [types.SimpleNamespace(__name__=n) for n in table["names"]]
    fake = types.SimpleNamespace(Channels=names, unit="Nanometers", unit_prefixes={"Nanometers": "nm"},
                                 AllPoints_ch1=[], AllPoints_ch2=[])
    for (i, j, _), roi in zip(pairs, pts_list):
        n1 = cl[0][i]["n"]
        chan = np.array([table["names"][0]] * n1 + [table["names"][1]] * (len(roi) - n1))
        ref = analyze_roi(fake, roi, chan, 0)
        mine = core.roi_stats(cl[0][i]["points"], cl[1][j]["points"])
        a, b = table["names"]
        assert (ref[f"{a} N"], ref[f"{b} N"]) == (mine["n1"], mine["n2"])
        assert ref[f"{a} Volume (nm^3)"] == pytest.approx(mine["volume1"], abs=0.006)
        assert ref[f"{b} Volume (nm^3)"] == pytest.approx(mine["volume2"], abs=0.006)
        assert ref["Mean Distance (nm)"] == pytest.approx(mine["distance"], abs=0.006)
        assert (ref["height"], ref["width"], ref["depth"]) == pytest.approx(
            (mine["height"], mine["width"], mine["depth"]), abs=0.006)


def test_nearest_neighbour_distances_match_plugin():
    from sklearn.neighbors import KDTree as SKTree
    get_nn = load_function("clusterAnalysis_2.py", "getNearestNeighbors", {"np": np, "KDTree": SKTree}, cls="ClusterAnalysis")
    rng = np.random.default_rng(4)
    a, b = rng.uniform(0, 1000, (12, 3)), rng.uniform(0, 1000, (12, 3))
    np.testing.assert_allclose(core.nn_distances(a, b, 1), get_nn(None, a, b))
    np.testing.assert_allclose(core.nn_distances(a, b, 12), get_nn(None, a, b, k=12))


def test_analyse_on_simulated_truth():
    """With well-separated synthetic pairs, every simulated pair is found and the mean distance is near the offset."""
    s = simulate(seed=9, n_pairs=20, n_single=0, noise=0, z_rejected=10, offset_nm=70)
    r = core.analyse(core.parse_table(s["text"]))
    assert r["stats"]["pairs"] == 20
    assert 55 < r["stats"]["nearest"]["mean"] < 85


def test_units_and_parse_errors():
    t = core.parse_table("Channel,Xc,Yc,Zc\nA,0,0,0\nB,1,1,1\nZ Rejected,9,9,9\n")
    assert t["names"] == ["A", "B"]
    r = core.analyse(t, unit="um", min_samples=1)
    assert r["bbox"]["max"] == [9000.0, 9000.0, 9000.0]
    with pytest.raises(ValueError, match="two channels"):
        core.parse_table("Channel Name\tXc\tYc\tZc\nA\t1\t2\t3\n")


def test_mulberry32_matches_core_js_reference():
    # first values of rng(1) in core.js (node: import { rng } from './core.js'; const r = rng(1); r(); r(); r())
    r = mulberry32(1)
    assert [round(r(), 12) for _ in range(3)] == [0.627073940588, 0.00273572118, 0.52744703996]


def test_engine_fixture_is_current():
    sys.path.insert(0, str(ROOT / "scripts"))
    import make_engine_fixture
    fresh = make_engine_fixture.build()
    stored = json.loads((ROOT / "tests" / "fixtures" / "engine_cases.json").read_text())
    assert fresh["texts"] == stored["texts"]
    _close(json.loads(json.dumps(fresh)), stored)


def _close(a, b, path="fixture"):
    if isinstance(b, dict):
        assert a.keys() == b.keys(), path
        for k in b:
            _close(a[k], b[k], f"{path}.{k}")
    elif isinstance(b, list):
        assert len(a) == len(b), path
        for i, (x, y) in enumerate(zip(a, b)):
            _close(x, y, f"{path}[{i}]")
    elif isinstance(b, float):
        assert a == pytest.approx(b, rel=1e-9, abs=1e-6), path
    else:
        assert a == b, path
