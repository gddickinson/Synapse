"""Web interface tests: every exported endpoint answers, the static build is complete, and the JS engine tests pass.

Run: python -m pytest -q tests/test_web.py
"""
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from synapse_plugin.web.app import STATIC, STATIC_ENDPOINTS, app  # noqa: E402

client = TestClient(app)


def test_index_served():
    r = client.get("/")
    assert r.status_code == 200 and "static/main.js" in r.text


@pytest.mark.parametrize("path", STATIC_ENDPOINTS)
def test_endpoint(path):
    r = client.get("/api" + path)
    assert r.status_code == 200, r.text
    assert r.json() is not None


def test_static_build(tmp_path):
    sys.path.insert(0, str(ROOT / "scripts"))
    import build_static
    build_static.build(tmp_path / "site")
    assert (tmp_path / "site" / "index.html").read_text().count("APP_STATIC") == 1
    for path in STATIC_ENDPOINTS:
        assert (tmp_path / "site" / "api" / (path.strip("/") + ".json")).exists()


def test_static_assets_referenced_exist():
    html = (STATIC / "index.html").read_text()
    for name in ("style.css", "main.js"):
        assert f"static/{name}" in html and (STATIC / name).exists()


@pytest.mark.skipif(not shutil.which("node"), reason="node not installed")
def test_js_engine():
    tests = sorted(STATIC.glob("*.test.mjs"))
    for t in tests:
        r = subprocess.run(["node", str(t)], capture_output=True, text=True)
        assert r.returncode == 0, r.stdout + r.stderr


# --- project-specific API tests ----------------------------------------------------------------------------------
def test_info_counts_come_from_the_demo_analysis():
    info = client.get("/api/info").json()
    demo = client.get("/api/demo").json()
    assert info["demo"]["pairs"] == demo["python"]["stats"]["pairs"] > 0
    assert info["defaults"] == {"eps": 100.0, "min_samples": 10, "max_distance": 100.0}
    assert demo["text"].startswith("Channel Name\tXc\tYc\tZc")


def test_analyse_endpoint_matches_demo():
    demo = client.get("/api/demo").json()
    r = client.post("/api/analyse", json={"text": demo["text"]})
    assert r.status_code == 200
    assert r.json()["stats"] == demo["python"]["stats"]


def test_analyse_endpoint_reports_bad_tables():
    r = client.post("/api/analyse", json={"text": "Channel Name\tXc\tYc\tZc\nA\t1\t2\t3\n"})
    assert r.status_code == 400 and "two channels" in r.json()["detail"]
    r = client.post("/api/analyse", json={"text": "a,b\n1,2\n"})
    assert r.status_code == 400 and "required" in r.json()["detail"]
