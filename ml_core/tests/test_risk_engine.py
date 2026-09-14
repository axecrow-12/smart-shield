import os
import sys

import pytest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from utils.risk_engine import TAPnPAYRiskEngine  # noqa: E402

MODEL_PATH = os.path.join(BASE, "model", "fraud_detection_model_v4_zimbabwe.lgb")


@pytest.fixture(scope="module")
def engine():
    return TAPnPAYRiskEngine(model_path=MODEL_PATH)


CLEAN_TX = {
    "amount": 15.5, "transaction_type": "p2p", "sim_change_frequency": 0,
    "network_type": "ecoz_mobile", "new_device_login": 0,
    "time_since_login_seconds": 3600, "is_smurf_pattern": 0,
    "recent_cashins_24h": 0, "is_post_downtime": 0,
    "receiver_risk_score": 0.1, "is_legit_merchant": 1,
    "is_mule_destination": 0, "merchant_name_risk": "LEGIT",
    "Token_latency_seconds": 5, "geo_velocity_kmh": 2,
    "distance_from_last_cashout_km": 1, "transaction_hour": 14,
    "is_night_transaction": 0, "cashout_interval_hours": 24,
}

FRAUD_TX = {
    **CLEAN_TX,
    "amount": 480, "new_device_login": 1, "time_since_login_seconds": 30,
    "is_smurf_pattern": 1, "is_mule_destination": 1,
    "receiver_risk_score": 0.95, "geo_velocity_kmh": 400,
    "network_type": "public_wifi", "is_night_transaction": 1,
    "transaction_hour": 2, "recent_cashins_24h": 8,
    "merchant_name_risk": "RISKY", "is_legit_merchant": 0,
}


def test_model_loads(engine):
    assert engine.model is not None


class TestRules:
    def test_clean_transaction_triggers_no_rules(self, engine):
        is_fraud, reasons = engine.apply_rule_based_checks(CLEAN_TX)
        assert not is_fraud
        assert reasons == []

    @pytest.mark.parametrize("field,value,expected_reason", [
        ("amount", 600, "AMOUNT_LIMIT_EXCEEDED"),
        ("recent_cashins_24h", 5, "CASH_IN_VELOCITY"),
        ("geo_velocity_kmh", 350, "LOCATION_JUMP"),
        ("is_smurf_pattern", 1, "SMURFING_PATTERN"),
        ("is_mule_destination", 1, "MULE_NETWORK_DETECTION"),
        ("receiver_risk_score", 0.9, "HIGH_RISK_RECEIVER"),
    ])
    def test_single_rule_triggers(self, engine, field, value, expected_reason):
        tx = {**CLEAN_TX, field: value}
        is_fraud, reasons = engine.apply_rule_based_checks(tx)
        assert is_fraud
        assert expected_reason in reasons

    def test_account_takeover_needs_all_three_signals(self, engine):
        tx = {**CLEAN_TX, "new_device_login": 1,
              "distance_from_last_cashout_km": 100,
              "time_since_login_seconds": 30}
        is_fraud, reasons = engine.apply_rule_based_checks(tx)
        assert "ACCOUNT_TAKEOVER_RISK" in reasons
        # missing one leg -> no takeover flag
        tx2 = {**tx, "time_since_login_seconds": 3600}
        _, reasons2 = engine.apply_rule_based_checks(tx2)
        assert "ACCOUNT_TAKEOVER_RISK" not in reasons2


class TestScoring:
    def test_clean_scores_low_and_approves(self, engine):
        r = engine.score_transaction(CLEAN_TX)
        assert r["risk_score"] < 30
        assert r["risk_level"] == "NORMAL"
        assert r["decision"] == "APPROVE"

    def test_fraud_scores_high_and_blocks(self, engine):
        r = engine.score_transaction(FRAUD_TX)
        assert r["risk_score"] >= 85
        assert r["risk_level"] == "CRITICAL"
        assert r["decision"] == "BLOCK"

    def test_score_is_bounded(self, engine):
        for tx in (CLEAN_TX, FRAUD_TX):
            r = engine.score_transaction(tx)
            assert 0 <= r["risk_score"] <= 100

    def test_ml_score_present_and_discriminates(self, engine):
        clean = engine.score_transaction(CLEAN_TX)["ml_fraud_score"]
        fraud = engine.score_transaction(FRAUD_TX)["ml_fraud_score"]
        assert clean is not None and fraud is not None
        assert fraud > clean + 0.5

    def test_batch_scoring(self, engine):
        results = engine.batch_score_transactions([CLEAN_TX, FRAUD_TX])
        assert len(results) == 2
        assert results[0]["decision"] == "APPROVE"
        assert results[1]["decision"] == "BLOCK"


class TestEncodings:
    """Serving encodings must match training (see scripts/train_model.py)."""

    def test_transaction_type_aliases(self, engine):
        full = engine.extract_features({**CLEAN_TX, "transaction_type": "p2p_transfer"})
        alias = engine.extract_features({**CLEAN_TX, "transaction_type": "p2p"})
        assert full["transaction_type"].iloc[0] == 5
        assert alias["transaction_type"].iloc[0] == 5

    @pytest.mark.parametrize("value,code", [
        ("airtime_topup", 0), ("bill_payment", 1), ("cash_in_agent", 2),
        ("cash_out_agent", 3), ("merchant_payment", 4), ("p2p_transfer", 5),
        ("merchant", 4), ("cashout", 3),
    ])
    def test_transaction_type_mapping(self, engine, value, code):
        f = engine.extract_features({**CLEAN_TX, "transaction_type": value})
        assert f["transaction_type"].iloc[0] == code

    def test_binary_categoricals(self, engine):
        f = engine.extract_features({**CLEAN_TX, "network_type": "public_wifi",
                                     "merchant_name_risk": "RISKY"})
        assert f["network_type"].iloc[0] == 1
        assert f["merchant_name_risk"].iloc[0] == 1
        f2 = engine.extract_features(CLEAN_TX)
        assert f2["network_type"].iloc[0] == 0
        assert f2["merchant_name_risk"].iloc[0] == 0

    def test_feature_frame_shape_and_order(self, engine):
        f = engine.extract_features(CLEAN_TX)
        assert list(f.columns) == engine.feature_names
        assert len(f) == 1
