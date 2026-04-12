"""TAPnPAY Fraud Detection API v4.0 - Zimbabwe-Optimized"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import json, os, sys
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from utils.risk_engine import TAPnPAYRiskEngine

app = FastAPI(title="TAPnPAY v4.0 Fraud Detection", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Initialize with v4 model
engine = TAPnPAYRiskEngine(model_path='model/fraud_detection_model_v4_zimbabwe.txt')

# Load v4 metadata
try:
    with open('model/model_metadata_v4_zimbabwe.json', 'r') as f:
        metadata = json.load(f)
except:
    metadata = {'version': '4.0', 'model': 'LightGBM', 'focus': 'Zimbabwe-Optimized'}


class ZimbabweTransaction(BaseModel):
    """Enhanced Zimbabwe-specific transaction model for v4"""
    amount: float
    transaction_type: str = 'p2p'
    
    # Network identity
    sim_change_frequency: int = 0
    network_type: str = 'ecoz_mobile'
    
    # Behavioral (Social Engineering)
    new_device_login: int = 0
    time_since_login_seconds: int = 3600
    is_smurf_pattern: int = 0
    recent_cashins_24h: int = 0
    is_post_downtime: int = 0
    
    # Receiver/Merchant risk
    receiver_risk_score: float = 0.0
    is_legit_merchant: int = 1
    is_mule_destination: int = 0
    merchant_name_risk: str = 'LEGIT'
    
    # Geospatial & Temporal
    Token_latency_seconds: int = 5
    geo_velocity_kmh: float = 0.0
    distance_from_last_cashout_km: float = 0.0
    transaction_hour: int = 12
    is_night_transaction: int = 0
    cashout_interval_hours: float = 24.0


class BatchScoringRequest(BaseModel):
    """Batch scoring request up to 1000 transactions"""
    transactions: List[dict]
    max_size: int = 1000


@app.get("/")
async def root():
    return {
        "service": "TAPnPAY Fraud Detection - Zimbabwe-Optimized",
        "version": "4.0.0",
        "model": "LightGBM v4",
        "features": "Social Engineering, OTP Interception, Mule Detection, Offline Vulnerability",
        "endpoints": ["/health", "/model-info", "/score", "/batch-score", "/check-rules", "/analyze"],
        "timestamp": datetime.now().isoformat()
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "4.0.0",
        "model": "LightGBM v4 Zimbabwe-Optimized",
        "framework": "FastAPI",
        "timestamp": datetime.now().isoformat()
    }


@app.get("/model-info")
async def model_info():
    """Get comprehensive model metadata including all Zimbabwe patterns"""
    return metadata


@app.post("/score")
async def score(tx: ZimbabweTransaction):
    """
    Score a single transaction with explainability.
    Returns risk_score (0-100), decision, and fraud reasoning.
    """
    try:
        tx_dict = tx.dict()
        result = engine.score_transaction(tx_dict)
        
        risk_score = result.get('risk_score', 0)
        risk_level = result.get('risk_level', 'unknown')
        reasons = result.get('rule_reasons', [])
        
        # Decision thresholds for Zimbabwe context
        if risk_score >= 85:
            decision = 'BLOCK'
        elif risk_score >= 70:
            decision = 'VERIFY'
        elif risk_score >= 50:
            decision = 'CHALLENGE'
        elif risk_score >= 30:
            decision = 'MONITOR'
        else:
            decision = 'APPROVE'
        
        return {
            "risk_score": round(risk_score, 2),
            "risk_level": risk_level,
            "decision": decision,
            "fraud_probability": round(risk_score / 100.0, 4),
            "reasons": reasons,
            "patterns_detected": len(reasons),
            "confidence": "high" if risk_score > 70 or risk_score < 30 else "medium",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scoring error: {str(e)}")


@app.post("/batch-score")
async def batch_score(request: BatchScoringRequest):
    """
    Score up to 1000 transactions in batch mode.
    Optimized for high-throughput processing.
    """
    try:
        if len(request.transactions) > request.max_size:
            raise HTTPException(
                status_code=400,
                detail=f"Max {request.max_size} transactions allowed"
            )
        
        results = engine.batch_score_transactions(request.transactions)
        
        # Calculate summary statistics
        blocked = sum(1 for r in results if r.get('decision') == 'BLOCK')
        verified = sum(1 for r in results if r.get('decision') == 'VERIFY')
        challenged = sum(1 for r in results if r.get('decision') == 'CHALLENGE')
        approved = sum(1 for r in results if r.get('decision') == 'APPROVE')
        
        return {
            "count": len(results),
            "processed_at": datetime.now().isoformat(),
            "results": results,
            "summary": {
                "approved": approved,
                "monitor": sum(1 for r in results if r.get('decision') == 'MONITOR'),
                "challenged": challenged,
                "verify": verified,
                "blocked": blocked,
                "fraud_rate": round(blocked / len(results), 4) if results else 0
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch processing error: {str(e)}")


@app.post("/check-rules")
async def check_rules(tx: ZimbabweTransaction):
    """
    Apply only rule-based checks (9 Zimbabwe fraud rules).
    Fast-path for deterministic rule evaluation.
    """
    try:
        tx_dict = tx.dict()
        is_fraud, triggered_rules = engine.apply_rule_based_checks(tx_dict)
        
        return {
            "is_fraud": is_fraud,
            "triggered_rules": triggered_rules,
            "rule_count": len(triggered_rules),
            "recommendation": "BLOCK" if is_fraud else "APPROVE",
            "rules_summary": {
                "amount_violations": sum(1 for r in triggered_rules if 'AMOUNT' in r),
                "velocity_attacks": sum(1 for r in triggered_rules if 'VELOCITY' in r or 'BURST' in r),
                "location_anomalies": sum(1 for r in triggered_rules if 'LOCATION' in r),
                "account_takeover_indicators": sum(1 for r in triggered_rules if 'TAKEOVER' in r),
                "merchant_risks": sum(1 for r in triggered_rules if 'MERCHANT' in r),
                "other": sum(1 for r in triggered_rules if not any(x in r for x in ['AMOUNT', 'VELOCITY', 'BURST', 'LOCATION', 'TAKEOVER', 'MERCHANT']))
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rules evaluation error: {str(e)}")


@app.post("/analyze")
async def analyze(tx: ZimbabweTransaction):
    """
    Comprehensive analysis combining ML + rules with full explainability.
    Returns both model predictions and triggered fraud rules.
    """
    try:
        tx_dict = tx.dict()
        
        # Get ML score
        ml_result = engine.score_transaction(tx_dict)
        ml_score = ml_result.get('risk_score', 0)
        ml_reasons = ml_result.get('rule_reasons', [])
        
        # Get rule-based checks
        is_fraud, triggered_rules = engine.apply_rule_based_checks(tx_dict)
        
        # Combined decision logic
        if ml_score >= 85 or is_fraud:
            combined_decision = 'BLOCK'
        elif ml_score >= 70:
            combined_decision = 'VERIFY'
        elif ml_score >= 50 or len(triggered_rules) > 2:
            combined_decision = 'CHALLENGE'
        elif ml_score >= 30 or len(triggered_rules) > 0:
            combined_decision = 'MONITOR'
        else:
            combined_decision = 'APPROVE'
        
        return {
            "ml_analysis": {
                "score": round(ml_score, 2),
                "prediction": "fraud" if ml_score > 50 else "legitimate",
                "risk_level": ml_result.get('risk_level', 'unknown'),
                "confidence": "high" if ml_score > 70 or ml_score < 30 else "medium",
                "top_reasons": ml_reasons[:5]
            },
            "rule_analysis": {
                "is_fraud": is_fraud,
                "triggered_rules": triggered_rules,
                "rule_count": len(triggered_rules),
                "severity": "critical" if is_fraud else "none"
            },
            "combined_assessment": {
                "final_decision": combined_decision,
                "overall_risk": round(ml_score, 2),
                "fraud_indicators": len(ml_reasons) + len(triggered_rules),
                "explainability": {
                    "ml_contribution": f"ML model: {ml_score:.0f}/100",
                    "rules_contribution": f"{len(triggered_rules)} Zimbabwe rules triggered",
                    "recommendation": f"→ {combined_decision}"
                }
            },
            "zimbabwe_patterns": {
                "otp_interception_risk": tx.new_device_login and tx.time_since_login_seconds < 60,
                "offline_vulnerability": tx.is_post_downtime,
                "smurfing_detected": tx.is_smurf_pattern,
                "mule_network_risk": tx.is_mule_destination,
                "network_security": "Public WiFi" if tx.network_type != 'ecoz_mobile' else "Mobile",
                "sim_cycling": tx.sim_change_frequency > 5,
                "geospatial_anomaly": tx.geo_velocity_kmh > 100
            },
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
