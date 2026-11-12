"""Write tests/fixtures/engine_cases.json: inputs and the Python pipeline's outputs for the JS engine test.

synapse_plugin/web/static/engine.test.mjs runs the JS port (table.js, dbscan.js, hull.js, analysis.js, simulate.js) on
the same inputs and checks it reproduces these numbers; tests/test_core.py checks the fixture still matches what the
Python code computes now. The random-control part of the analysis is left out (different generators).

Run: python scripts/make_engine_fixture.py
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from synapse_plugin.cluster_core import analyse, convex_volume, parse_table  # noqa: E402
from synapse_plugin.simulate import simulate  # noqa: E402

OUT = ROOT / "tests" / "fixtures" / "engine_cases.json"
SIM = dict(seed=3, n_pairs=12, n_single=4, noise=150, z_rejected=20)
PARAMS = [
    dict(eps=100, min_samples=10, max_distance=100, unit="nm"),
    dict(eps=60, min_samples=5, max_distance=150, unit="nm"),
    dict(eps=150, min_samples=15, max_distance=60, unit="nm"),
    dict(eps=8000, min_samples=10, max_distance=15000, unit="px"),  # file read as pixels of 166 nm
]


def border_table() -> str:
    """Channel A: 13 points where a 1-point DBSCAN cluster (eps 100, min_samples 4) must be dropped by the plugin's
    size filter; channel B: the same pattern shifted 50 nm."""
    pts = []
    for d in [(1, 0), (-1, 0), (0, 1)]:
        d = np.array(d, float)
        o = np.array([-d[1], d[0]])
        pts += [1.8 * d, 0.9 * d, 2.4 * d + 0.6 * o, 2.4 * d - 0.6 * o]
    pts.append(np.zeros(2))
    xy = np.array(pts) * 100
    rows = ["Channel,Xc,Yc,Zc"]
    for name, shift in (("A", 0.0), ("B", 50.0)):
        for k, (x, y) in enumerate(xy):
            rows.append(f"{name},{x + shift},{y},{(k % 3) * 7.0}")
    return "\n".join(rows) + "\n"


def strip(res: dict) -> dict:
    return {k: v for k, v in res.items() if k not in ("random", "random_stats")}


def volume_cases() -> list:
    rng = np.random.default_rng(11)
    cases = [rng.normal(0, 40, (n, 3)) * [1, 1, 1.5] + 5000 for n in (4, 5, 8, 20, 60, 300)]
    cases.append(rng.uniform(0, 100, (200, 3)))
    cases.append(np.c_[rng.uniform(0, 100, (30, 2)), np.full(30, 12.5)])  # flat -> 0
    cases.append(rng.normal(0, 10, (3, 3)))  # too few -> 0
    return [{"points": c.round(3).tolist(), "volume": convex_volume(c.round(3))} for c in cases]


def build() -> dict:
    sim_text = simulate(**SIM)["text"]
    cases = []
    for p in PARAMS:
        cases.append({"name": f"sim {p}", "text": "sim", "params": p,
                      "result": strip(analyse(parse_table(sim_text), **p))})
    bt = border_table()
    p = dict(eps=100, min_samples=4, max_distance=100, unit="nm")
    cases.append({"name": "border points claimed by earlier clusters", "text": "border", "params": p,
                  "result": strip(analyse(parse_table(bt), **p))})
    flat = simulate(seed=4, n_pairs=6, n_single=2, noise=60, z_rejected=0, sigma_z=0, depth_nm=0)["text"]
    p = dict(eps=100, min_samples=10, max_distance=100, unit="nm")
    cases.append({"name": "2D table (all Zc equal): flat clusters", "text": "flat", "params": p,
                  "result": strip(analyse(parse_table(flat), **p))})
    sims = [{"params": SIM, "text": "sim"}]
    return {"texts": {"sim": sim_text, "border": bt, "flat": flat}, "cases": cases, "volumes": volume_cases(), "simulations": sims}


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(build(), separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
