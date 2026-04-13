"""Test TAPnPAY v4 API - Zimbabwe-Optimized Fraud Detection"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

print("="*70)
print("TAPnPAY v4 API TESTING - Zimbabwe-Optimized Model")
print("="*70)

# ============= TEST 1: Health Check =============
print("\nTEST 1: Health Check")
try:
    r = requests.get(f"{BASE_URL}/health")
    print(f"Status: {r.status_code}")
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print(f"❌ Error: {e}")

# ============= TEST 2: Model Info =============
print("\nTEST 2: Model Info (Metadata)")
try:
    r = requests.get(f"{BASE_URL}/model-info")
    data = r.json()
    print(f"Status: {r.status_code}")
    print(f"Model Version: {data.get('version')}")
    print(f"Focus: {data.get('focus')}")
    print(f"Dataset Size: {data.get('dataset_size')}")
    print(f"Fraud Rate: {data.get('fraud_rate')}")
    print(f"Performance: AUC {data.get('performance', {}).get('roc_auc', 'N/A')}, F1 {data.get('performance', {}).get('f1_score', 'N/A')}")
except Exception as e:
    print(f"Error: {e}")

# ============= TEST 3: Legitimate Transaction =============
print("\nTEST 3: Legitimate Transaction (Should APPROVE)")
legit_tx = {
    "amount": 50.0,
    "transaction_type": "p2p",
    "sim_change_frequency": 0,
    "network_type": "ecoz_mobile",
    "new_device_login": 0,
    "time_since_login_seconds": 3600,
    "is_smurf_pattern": 0,
    "recent_cashins_24h": 0,
    "is_post_downtime": 0,
    "receiver_risk_score": 0.05,
    "is_legit_merchant": 1,
    "is_mule_destination": 0,
    "merchant_name_risk": "LEGIT",
    "Token_latency_seconds": 5,
    "geo_velocity_kmh": 10.0,
    "distance_from_last_cashout_km": 5.0,
    "transaction_hour": 12,
    "is_night_transaction": 0,
    "cashout_interval_hours": 24.0
}
try:
    r = requests.post(f"{BASE_URL}/score", json=legit_tx)
    data = r.json()
    print(f"Status: {r.status_code}")
    print(f"Risk Score: {data.get('risk_score')}")
    print(f"Decision: {data.get('decision')}")
    print(f"Patterns Detected: {data.get('patterns_detected')}")
    print(f"PASS" if data.get('decision') == 'APPROVE' else f"FAIL - Expected APPROVE, got {data.get('decision')}")
except Exception as e:
    print(f"Error: {e}")

# ============= TEST 4: OTP Interception Fraud =============
print("\nTEST 4: OTP Interception (New Device + Immediate Tx - Should BLOCK)")
otp_fraud_tx = {
    "amount": 300.0,
    "transaction_type": "p2p",
    "sim_change_frequency": 2,
    "network_type": "public_wifi",
    "new_device_login": 1,
    "time_since_login_seconds": 30,  # Immediate
    "is_smurf_pattern": 0,
    "recent_cashins_24h": 1,
    "is_post_downtime": 0,
    "receiver_risk_score": 0.45,
    "is_legit_merchant": 0,
    "is_mule_destination": 1,
    "merchant_name_risk": "RISKY",
    "Token_latency_seconds": 2,
    "geo_velocity_kmh": 250.0,  # High velocity
    "distance_from_last_cashout_km": 150.0,  # Distance jump
    "transaction_hour": 2,
    "is_night_transaction": 1,
    "cashout_interval_hours": 0.5
}
try:
    r = requests.post(f"{BASE_URL}/score", json=otp_fraud_tx)
    data = r.json()
    print(f"Status: {r.status_code}")
    print(f"Risk Score: {data.get('risk_score')}")
    print(f"Decision: {data.get('decision')}")
    print(f"Patterns Detected: {data.get('patterns_detected')}")
    print(f"Top Reasons: {data.get('reasons', [])[:3]}")
    if data.get('risk_score', 0) >= 85:
        print(f"PASS - High fraud risk detected")
    else:
        print(f"Risk score: {data.get('risk_score')}")
except Exception as e:
    print(f"Error: {e}")

# ============= TEST 5: Offline Vulnerability =============
print("\nTEST 5: Offline Vulnerability (Post-Downtime - Should flag)")
offline_fraud_tx = {
    "amount": 400.0,
    "transaction_type": "merchant",
    "sim_change_frequency": 1,
    "network_type": "ecoz_mobile",
    "new_device_login": 0,
    "time_since_login_seconds": 1800,
    "is_smurf_pattern": 0,
    "recent_cashins_24h": 3,  # Multiple cash-ins
    "is_post_downtime": 1,  # System was down
    "receiver_risk_score": 0.3,
    "is_legit_merchant": 0,
    "is_mule_destination": 0,
    "merchant_name_risk": "SUSPICIOUS",
    "Token_latency_seconds": 10,
    "geo_velocity_kmh": 50.0,
    "distance_from_last_cashout_km": 20.0,
    "transaction_hour": 8,
    "is_night_transaction": 0,
    "cashout_interval_hours": 2.0
}
try:
    r = requests.post(f"{BASE_URL}/score", json=offline_fraud_tx)
    data = r.json()
    print(f"Status: {r.status_code}")
    print(f"Risk Score: {data.get('risk_score')}")
    print(f"Decision: {data.get('decision')}")
    print(f"Patterns Detected: {data.get('patterns_detected')}")
except Exception as e:
    print(f"Error: {e}")

# ============= TEST 6: Rules-Only Check =============
print("\nTEST 6: Rules-Only Check (Deterministic Rules)")
try:
    r = requests.post(f"{BASE_URL}/check-rules", json=otp_fraud_tx)
    data = r.json()
    print(f"Status: {r.status_code}")
    print(f"Is Fraud (Rules): {data.get('is_fraud')}")
    print(f"Triggered Rules: {len(data.get('triggered_rules', []))}")
    if data.get('triggered_rules'):
        for rule in data.get('triggered_rules', [])[:3]:
            print(f"  - {rule}")
except Exception as e:
    print(f"Error: {e}")

# ============= TEST 7: Comprehensive Analysis =============
print("\nTEST 7: Comprehensive Analysis (ML + Rules Combined)")
try:
    r = requests.post(f"{BASE_URL}/analyze", json=otp_fraud_tx)
    data = r.json()
    print(f"Status: {r.status_code}")
    print(f"ML Score: {data.get('ml_analysis', {}).get('score')}")
    print(f"ML Prediction: {data.get('ml_analysis', {}).get('prediction')}")
    print(f"Triggered Rules: {data.get('rule_analysis', {}).get('rule_count')}")
    print(f"Final Decision: {data.get('combined_assessment', {}).get('final_decision')}")
    print(f"Zimbabwe Patterns Detected:")
    for k, v in data.get('zimbabwe_patterns', {}).items():
        if v:
            print(f"  - {k.replace('_', ' ').title()}")
except Exception as e:
    print(f"Error: {e}")

# ============= TEST 8: Batch Scoring =============
print("\nTEST 8: Batch Scoring (3 Transactions)")
batch_request = {
    "transactions": [legit_tx, otp_fraud_tx, offline_fraud_tx],
    "max_size": 1000
}
try:
    r = requests.post(f"{BASE_URL}/batch-score", json=batch_request)
    data = r.json()
    print(f"Status: {r.status_code}")
    print(f"Processed: {data.get('count')} transactions")
    summary = data.get('summary', {})
    print(f"Summary:")
    print(f"  - Approved: {summary.get('approved')}")
    print(f"  - Monitor: {summary.get('monitor')}")
    print(f"  - Challenge: {summary.get('challenged')}")
    print(f"  - Verify: {summary.get('verify')}")
    print(f"  - Blocked: {summary.get('blocked')}")
    print(f"  Fraud Rate: {summary.get('fraud_rate'):.1%}")
except Exception as e:
    print(f"Error: {e}")

# ============= TEST 9: Root Endpoint =============
print("\nTEST 9: Root Endpoint (Service Info)")
try:
    r = requests.get(f"{BASE_URL}/")
    data = r.json()
    print(f"Status: {r.status_code}")
    print(f"Service: {data.get('service')}")
    print(f"Version: {data.get('version')}")
    print(f"Model: {data.get('model')}")
    print(f"Available Endpoints: {', '.join(data.get('endpoints', []))}")
except Exception as e:
    print(f"Error: {e}")

print("\n" + "="*70)
print("API v4 Testing Complete")
print("="*70)
