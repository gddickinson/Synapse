"""FastAPI web app for Synapse3D: serves the front end in static/ and the JSON API under /api.

Run with `python run_web.py` (http://127.0.0.1:8111, local only). `scripts/build_static.py` exports every path in
STATIC_ENDPOINTS to JSON for the GitHub Pages site, so keep that list in step with the GET routes below. The analysis
itself also runs in the browser (static/analysis.js, a port of cluster_core tested against it); POST /api/analyse is
the Python reference, used by the "check with Python" button when the local server is running.
"""
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from synapse_plugin import cluster_core as core
from synapse_plugin import simulate as sim

STATIC = Path(__file__).resolve().parent / "static"
MAX_TEXT = 60_000_000  # characters (~1.5 million localisations)

app = FastAPI(title="Synapse3D")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(STATIC / "index.html")


def _slim(res: dict) -> dict:
    """Result without per-point labels and random point coordinates (the browser recomputes those)."""
    out = dict(res)
    out["channels"] = [{k: v for k, v in ch.items() if k != "labels"} for ch in res["channels"]]
    out["random"] = {k: v for k, v in res["random"].items() if k in ("nearest", "all")}
    return out


@lru_cache(maxsize=1)
def demo() -> dict:
    """The demo table (simulate.py with its defaults) and the Python analysis of it with the default parameters."""
    s = sim.simulate()
    res = core.analyse(core.parse_table(s["text"]), **core.DEFAULTS)
    return {"text": s["text"], "rows": s["rows"], "sim_params": s["params"], "params": core.DEFAULTS,
            "python": _slim(res)}


@app.get("/api/info")
def info():
    """Project summary, defaults and demo counts for the home page."""
    d = demo()
    st = d["python"]["stats"]
    return {"title": "Synapse3D", "defaults": core.DEFAULTS, "sim_defaults": sim.DEFAULTS, "sim_names": sim.NAMES,
            "units": core.UNITS, "nm_per_pixel": core.NM_PER_PIXEL, "ignore": sorted(core.IGNORE),
            "demo": {"rows": d["rows"], "channels": [c["name"] for c in d["python"]["channels"]],
                     "clusters": [st["ch1"]["clusters"], st["ch2"]["clusters"]], "pairs": st["pairs"],
                     "nearest_mean_nm": st["nearest"]["mean"]}}


@app.get("/api/demo")
def get_demo():
    """Demo localisation table (synthetic, labelled) plus the Python result for the default parameters."""
    return demo()


class AnalyseRequest(BaseModel):
    text: str = Field(..., max_length=MAX_TEXT)
    eps: float = core.DEFAULTS["eps"]
    min_samples: int = core.DEFAULTS["min_samples"]
    max_distance: float = core.DEFAULTS["max_distance"]
    unit: str = "nm"
    seed: int = 1


@app.post("/api/analyse")
def analyse(req: AnalyseRequest):
    """Python reference analysis of a localisation table (the same pipeline the browser runs)."""
    try:
        table = core.parse_table(req.text)
        res = core.analyse(table, req.eps, req.min_samples, req.max_distance, req.unit, req.seed)
    except ValueError as e:
        raise HTTPException(400, str(e)) from None
    return {**_slim(res), "computed_by": "python"}


# GET paths (without the /api prefix) written to the static site as api/<path>.json.
STATIC_ENDPOINTS = ["/info", "/demo"]
