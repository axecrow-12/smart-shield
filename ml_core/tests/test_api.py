import os
import sys

import pytest
from fastapi.testclient import TestClient

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE, "api"))
sys.path.insert(0, BASE)

import app as app_module  # noqa: E402

client = TestClient(app_module.app)

CLEAN_TX = {"amount": 20.0, "transaction_type": "p2p"}
FRAUD_TX = {
    "amount": 480, "new_device_login": 1, "time_since_login_seconds": 30,
    "is_mule_destination": 1, "receiver_risk_score": 0.95,
    "geo_velocity_kmh": 400, "is_smurf_pattern": 1,
}


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_model_info_reports_real_metrics():
    r = client.get("/model-info")
    assert r.status_code == 200
    meta = r.json()
    perf = meta.get("performance", {})
    assert 0.5 < perf.get("roc_auc", 0) <= 1.0
    assert 0 < perf.get("f1_score", 0) <= 1.0
    assert meta.get("threshold") == 0.5
    assert len(meta.get("features", [])) == 19


def test_score_clean_approves():
    r = client.post("/score", json=CLEAN_TX)
    assert r.status_code == 200
    body = r.json()
    assert body["decision"] == "APPROVE"
    assert body["risk_score"] < 30
    assert body["reasons"] == []


def test_score_fraud_blocks_with_reasons():
    r = client.post("/score", json=FRAUD_TX)
    assert r.status_code == 200
    body = r.json()
    assert body["decision"] == "BLOCK"
    assert body["risk_score"] >= 85
    assert "MULE_NETWORK_DETECTION" in body["reasons"]


def test_score_rejects_missing_amount():
    r = client.post("/score", json={"transaction_type": "p2p"})
    assert r.status_code == 422  # pydantic validation


def test_score_rejects_non_numeric_amount():
    r = client.post("/score", json={"amount": "lots"})
    assert r.status_code == 422


def test_check_rules_fast_path():
    r = client.post("/check-rules", json=FRAUD_TX)
    assert r.status_code == 200
    body = r.json()
    assert body["is_fraud"] is True
    assert body["recommendation"] == "BLOCK"
    assert body["rule_count"] >= 3


def test_batch_score_summary():
    r = client.post("/batch-score", json={"transactions": [CLEAN_TX, FRAUD_TX]})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert body["summary"]["approved"] >= 1
    assert body["summary"]["blocked"] >= 1


def test_batch_score_enforces_limit():
    txs = [CLEAN_TX] * 5
    r = client.post("/batch-score", json={"transactions": txs, "max_size": 3})
    assert r.status_code in (400, 500)  # rejected, not processed
    assert "3" in r.json()["detail"]


def test_analyze_combines_ml_and_rules():
    r = client.post("/analyze", json=FRAUD_TX)
    assert r.status_code == 200
    body = r.json()
    assert body["combined_assessment"]["final_decision"] == "BLOCK"
    assert body["rule_analysis"]["is_fraud"] is True
    assert body["zimbabwe_patterns"]["mule_network_risk"] == 1
