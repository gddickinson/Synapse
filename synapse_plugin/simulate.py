"""Synthetic two-channel 3D localisation tables for demos and tests (not real microscopy data).

Writes the plugin's input format: tab-separated 'Channel Name', Xc, Yc, Zc in nanometres, plus a SimClusterID column
holding the ground truth (the pair/cluster a localisation was drawn from, -1 for background). Clusters are Gaussian
blobs; each "synapse" is a channel-A blob and a channel-B blob whose centres are `offset_nm` apart in a random 3D
direction. Single (unpaired) blobs, uniform background in each channel and a few "Z Rejected" rows are added.

The random numbers come from mulberry32, the same generator as rng() in web/static/core.js, so web/static/simulate.js
produces the same table for the same seed (checked by the node test).
"""
import math

DEFAULTS = {"seed": 7, "n_pairs": 40, "n_single": 8, "locs": 40, "sigma_xy": 35.0, "sigma_z": 50.0,
            "offset_nm": 70.0, "field_nm": 12000.0, "depth_nm": 800.0, "noise": 400, "z_rejected": 60}
NAMES = ("synthetic A", "synthetic B")
_M = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & _M


def mulberry32(seed: int):
    """Uniform [0, 1) generator, bit-identical to rng(seed) in core.js."""
    a = seed & _M

    def nxt() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & _M
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & _M) ^ t
        return ((t ^ (t >> 14)) & _M) / 4294967296
    return nxt


def simulate(**kw) -> dict:
    """Return {'text': tab-separated table, 'params': ..., 'rows': n}. Keyword arguments override DEFAULTS."""
    p = {**DEFAULTS, **kw}
    rand = mulberry32(int(p["seed"]))

    def gauss() -> float:
        u1, u2 = rand(), rand()
        return math.sqrt(-2.0 * math.log(1.0 - u1)) * math.cos(2.0 * math.pi * u2)

    def centre():
        return [p["field_nm"] * rand(), p["field_nm"] * rand(), p["depth_nm"] * (0.25 + 0.5 * rand())]

    rows = []

    def blob(name, c, cid):
        n = int(p["locs"]) // 2 + math.floor(int(p["locs"]) * rand())
        for _ in range(n):
            rows.append((name, c[0] + p["sigma_xy"] * gauss(), c[1] + p["sigma_xy"] * gauss(),
                         c[2] + p["sigma_z"] * gauss(), cid))

    cid = 0
    for _ in range(int(p["n_pairs"])):
        c = centre()
        phi, cz = 2.0 * math.pi * rand(), 2.0 * rand() - 1.0
        s = math.sqrt(1.0 - cz * cz)
        d = [s * math.cos(phi), s * math.sin(phi), cz]
        h = p["offset_nm"] / 2.0
        blob(NAMES[0], [c[k] - d[k] * h for k in range(3)], cid)
        blob(NAMES[1], [c[k] + d[k] * h for k in range(3)], cid)
        cid += 1
    for _ in range(int(p["n_single"])):
        for name in NAMES:
            blob(name, centre(), cid)
            cid += 1
    for name in NAMES + ("Z Rejected",):
        n = int(p["z_rejected"] if name == "Z Rejected" else p["noise"])
        for _ in range(n):
            rows.append((name, p["field_nm"] * rand(), p["field_nm"] * rand(), p["depth_nm"] * rand(), -1))
    lines = ["Channel Name\tXc\tYc\tZc\tSimClusterID"]
    lines += [f"{r[0]}\t{r[1]:.2f}\t{r[2]:.2f}\t{r[3]:.2f}\t{r[4]}" for r in rows]
    return {"text": "\n".join(lines) + "\n", "params": p, "rows": len(rows)}
