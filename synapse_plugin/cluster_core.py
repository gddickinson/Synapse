"""Qt-free core of the Synapse3D cluster analysis (the clusterAnalysis_2 "Version 2" pipeline), for the web app and tests.

Pipeline (same steps and defaults as ClusterAnalysis.runAnalysis in clusterAnalysis_2.py):
  1. read a localisation table: 'Channel Name' (or 'Channel'), Xc, Yc, Zc in nanometres; rows of channel "Z Rejected"
     are ignored; exactly two channels remain, in sorted name order;
  2. 3D DBSCAN on each channel (eps in nm, min_samples), then clusters with fewer than min_samples points -> noise
     (`dbscan_labels`; BioDocks/dbscan.py calls it);
  3. cluster centroids; every channel-1 cluster is paired with the nearest channel-2 cluster centroid if that is at most
     max_distance nm away (BioDocks.Tools.combineClosestHulls);
  4. per pair ("ROI"): localisation counts, convex-hull volume per channel (0 below 4 points or for flat clusters),
     centroid distance, bounding-box extents (ClusterAnalysis.analyze_roi);
  5. nearest-neighbour and all-pair distances between paired centroids (each channel-2 centroid to the channel-1
     centroids), against the same number of uniformly random points in the data's bounding box
     (ClusterAnalysis.randomPointAnalysis), summarised like ClusterAnalysis.saveStats.

Everything is in nanometres. The desktop plugin rounds volumes, distances and extents to 0.01 nm in its table; this
module returns unrounded values. Coordinates in other units are converted with `nm_per_unit` before step 2.
"""
import math

import numpy as np
from scipy.spatial import ConvexHull, cKDTree
from scipy.spatial import QhullError
from sklearn.cluster import DBSCAN

DEFAULTS = {"eps": 100.0, "min_samples": 10, "max_distance": 100.0}
IGNORE = {"Z Rejected"}
NM_PER_PIXEL = 166  # the plugin's camera pixel size (ClusterAnalysis.unitPerPixel)
UNITS = {"nm": 1.0, "um": 1000.0, "px": float(NM_PER_PIXEL)}


# ----------------------------------------------------------------------------------------------------- reading
def parse_table(text: str) -> dict:
    """Parse a tab- or comma-separated localisation table. Returns {'names': [ch1, ch2], 'channel': [...], 'xyz': (n,3),
    'columns': header}. Coordinates are as written in the file (no unit conversion)."""
    lines = [ln for ln in text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if ln.strip()]
    if len(lines) < 2:
        raise ValueError("The file needs a header row and at least one data row.")
    sep = "\t" if "\t" in lines[0] else ","
    header = [h.strip().strip('"') for h in lines[0].split(sep)]
    norm = {h.lower(): i for i, h in enumerate(header)}
    ci = norm.get("channel name", norm.get("channel"))
    cols = [norm.get(k) for k in ("xc", "yc", "zc")]
    if ci is None or None in cols:
        raise ValueError("Columns 'Channel Name' (or 'Channel'), 'Xc', 'Yc' and 'Zc' are required; found: "
                         + ", ".join(header))
    channel, xyz = [], []
    for k, ln in enumerate(lines[1:], start=2):
        f = [v.strip().strip('"') for v in ln.split(sep)]
        if len(f) < len(header):
            raise ValueError(f"Row {k} has {len(f)} fields, the header has {len(header)}.")
        try:
            xyz.append([float(f[c]) for c in cols])
        except ValueError:
            raise ValueError(f"Row {k}: Xc/Yc/Zc must be numbers.") from None
        channel.append(f[ci])
    names = sorted(set(channel) - IGNORE)
    if len(names) != 2:
        raise ValueError(f"Exactly two channels are needed (rows named {sorted(IGNORE)} are ignored); found "
                         f"{len(names)}: {', '.join(names) or 'none'}.")
    return {"names": names, "channel": channel, "xyz": np.array(xyz, float), "columns": header}


# --------------------------------------------------------------------------------------------------- clustering
def dbscan_labels(points, eps: float, min_samples: int):
    """scikit-learn DBSCAN (Euclidean, 3D) followed by the plugin's filter: clusters with fewer than min_samples points
    become noise (-1). Labels are not renumbered. Returns (labels array, n_clusters, n_noise)."""
    points = np.asarray(points, float)
    if len(points) == 0:
        return np.zeros(0, int), 0, 0
    labels = DBSCAN(eps=eps, min_samples=min_samples, metric="euclidean", algorithm="auto", leaf_size=30,
                    n_jobs=-1).fit(points).labels_.copy()
    uniq, counts = np.unique(labels[labels >= 0], return_counts=True)
    for lab, c in zip(uniq, counts):
        if c < min_samples:
            labels[labels == lab] = -1
    n_clusters = len(np.unique(labels[labels >= 0]))
    return labels, n_clusters, int(np.sum(labels == -1))


def convex_volume(points) -> float:
    """Convex-hull volume in nm^3; 0 below 4 points or when the hull is flat (the plugin's analyze_roi gives 0 then)."""
    points = np.asarray(points, float)
    if len(points) < 4:
        return 0.0
    try:
        return float(ConvexHull(points).volume)
    except (QhullError, ValueError):
        return 0.0


def clusters_of(points, labels) -> list:
    """Clusters in ascending label order: {'label', 'n', 'centroid', 'volume'} (+ 'points' for internal use)."""
    out = []
    for lab in np.unique(labels[labels >= 0]):
        p = points[labels == lab]
        out.append({"label": int(lab), "n": len(p), "centroid": p.mean(axis=0), "volume": convex_volume(p),
                    "points": p})
    return out


def pair_clusters(c1: list, c2: list, max_distance: float) -> list:
    """For each channel-1 cluster, the nearest channel-2 centroid if within max_distance: [(i, j, distance)]. A channel-2
    cluster can be paired with several channel-1 clusters (as in combineClosestHulls)."""
    if not c1 or not c2:
        return []
    tree = cKDTree(np.array([c["centroid"] for c in c2]))
    pairs = []
    for i, c in enumerate(c1):
        d, j = tree.query(c["centroid"])
        if d <= max_distance:
            pairs.append((i, int(j), float(d)))
    return pairs


def roi_stats(p1, p2) -> dict:
    """analyze_roi for one pair: counts, volumes, centroid distance, centroids, extents (x = 'height', y = 'width',
    z = 'depth', as the plugin names them) and their product."""
    a, b = p1.mean(axis=0), p2.mean(axis=0)
    both = np.r_[p1, p2]
    ext = both.max(axis=0) - both.min(axis=0)
    return {"n1": len(p1), "n2": len(p2), "volume1": convex_volume(p1), "volume2": convex_volume(p2),
            "distance": float(np.linalg.norm(a - b)), "centroid1": a.tolist(), "centroid2": b.tolist(),
            "center": ((a + b) / 2).tolist(), "height": float(ext[0]), "width": float(ext[1]),
            "depth": float(ext[2]), "box_volume": float(ext[0] * ext[1] * ext[2])}


# ---------------------------------------------------------------------------------------------- distances & stats
def nn_distances(train, test, k: int = 1) -> np.ndarray:
    """Distances from each test point to its k nearest train points, flattened (getNearestNeighbors)."""
    train, test = np.asarray(train, float), np.asarray(test, float)
    if len(train) == 0 or len(test) == 0:
        return np.zeros(0)
    d, _ = cKDTree(train).query(test, k=k)
    return np.asarray(d, float).reshape(-1)


def random_box_points(lo, hi, n: int, rng) -> np.ndarray:
    """n points uniform in the box [lo, hi] (getRandomXYZ, after the maxX fix)."""
    lo, hi = np.asarray(lo, float), np.asarray(hi, float)
    return lo + rng.random((n, 3)) * (hi - lo)


def describe(x) -> dict:
    """n, mean, SEM (ddof 1, scipy.stats.sem) and StDev (ddof 0, np.std) as the stats file reports them."""
    x = np.asarray(x, float)
    n = len(x)
    return {"n": n, "mean": float(x.mean()) if n else None,
            "sem": float(x.std(ddof=1) / math.sqrt(n)) if n > 1 else None,
            "sd": float(x.std()) if n else None}


# ---------------------------------------------------------------------------------------------------- pipeline
def analyse(table: dict, eps=None, min_samples=None, max_distance=None, unit: str = "nm", seed: int = 1) -> dict:
    """Run the whole pipeline on a parsed table. Coordinates are converted to nm first (unit 'nm', 'um' or 'px' at
    NM_PER_PIXEL). Returns JSON-ready results; `random` uses numpy's generator with `seed`."""
    eps = DEFAULTS["eps"] if eps is None else float(eps)
    min_samples = DEFAULTS["min_samples"] if min_samples is None else int(min_samples)
    max_distance = DEFAULTS["max_distance"] if max_distance is None else float(max_distance)
    if unit not in UNITS:
        raise ValueError(f"unit must be one of {sorted(UNITS)}")
    if eps <= 0 or min_samples < 1 or max_distance < 0:
        raise ValueError("eps must be > 0, min_samples >= 1 and max_distance >= 0")
    xyz = table["xyz"] * UNITS[unit]
    chan = np.array(table["channel"])
    channels, clus = [], []
    for name in table["names"]:
        pts = xyz[chan == name]
        labels, n_clusters, n_noise = dbscan_labels(pts, eps, min_samples)
        cl = clusters_of(pts, labels)
        clus.append(cl)
        channels.append({"name": name, "n": len(pts), "n_noise": n_noise, "n_clustered": len(pts) - n_noise,
                         "n_clusters": n_clusters, "labels": labels.tolist()})
    pairs = []
    for roi, (i, j, d) in enumerate(pair_clusters(clus[0], clus[1], max_distance)):
        s = roi_stats(clus[0][i]["points"], clus[1][j]["points"])
        pairs.append({"roi": roi, "cluster1": i, "cluster2": j, "pair_distance": d, **s})
    c1 = np.array([p["centroid1"] for p in pairs]).reshape(-1, 3)
    c2 = np.array([p["centroid2"] for p in pairs]).reshape(-1, 3)
    near, all_d = nn_distances(c1, c2, 1), nn_distances(c1, c2, len(c2))
    lo, hi = xyz.min(axis=0), xyz.max(axis=0)  # all rows, "Z Rejected" included, as in the plugin
    rng = np.random.default_rng(seed)
    r1, r2 = random_box_points(lo, hi, len(c1), rng), random_box_points(lo, hi, len(c2), rng)
    rnear, rall = nn_distances(r1, r2, 1), nn_distances(r1, r2, len(r1))
    return clean({
        "params": {"eps": eps, "min_samples": min_samples, "max_distance": max_distance, "unit": unit,
                   "nm_per_unit": UNITS[unit], "seed": seed},
        "channels": channels,
        "clusters": [[{k: v for k, v in c.items() if k != "points"} for c in cl] for cl in clus],
        "pairs": pairs,
        "bbox": {"min": lo.tolist(), "max": hi.tolist()},
        "distances": {"nearest": near.tolist(), "all": all_d.tolist()},
        "random": {"points1": r1.tolist(), "points2": r2.tolist(), "nearest": rnear.tolist(), "all": rall.tolist()},
        "stats": summary(channels, pairs, near, all_d),
        "random_stats": {"nearest": describe(rnear), "all": describe(rall)},
    })


def summary(channels, pairs, near, all_d) -> dict:
    """The deterministic part of saveStats (the random rows are in 'random_stats')."""
    out = {"pairs": len(pairs), "nearest": describe(near), "all": describe(all_d)}
    for k, ch in enumerate(channels, start=1):
        out[f"ch{k}"] = {"localisations": ch["n"], "noise": ch["n_noise"], "clustered": ch["n_clustered"],
                         "clusters": ch["n_clusters"], "unpaired_clusters": ch["n_clusters"] - len(pairs),
                         "locs_per_cluster": describe([p[f"n{k}"] for p in pairs]),
                         "volume": describe([p[f"volume{k}"] for p in pairs])}
    return out


def clean(o):
    """Recursively convert numpy types to Python and NaN/inf to None (valid JSON)."""
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, np.ndarray):
        return clean(o.tolist())
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return float(o) if math.isfinite(o) else None
    return o
