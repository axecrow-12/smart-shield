"""
TAPnPAY Risk Engine
Real-time fraud detection and risk scoring for mobile money transactions
Zimbabwe Mobile Money Context
"""

import numpy as np
import pandas as pd
import pickle
import lightgbm as lgb
import os
from typing import Dict, Tuple, List
from datetime import datetime
import json


class TAPnPAYRiskEngine:
    """
    Production-grade fraud detection risk engine for Zimbabwe mobile money
    
    Features:
    - Rule-based fraud detection
    - ML model scoring
    - Risk scoring with thresholds
    - Real-time transaction analysis
    """
    
    def __init__(self, model_path: str = None):
        """
        Initialize the risk engine
        
        Args:
            model_path: Path to the trained LightGBM model
        """
        self.model = None
        # V4 Zimbabwe-Optimized Features
        self.feature_names = [
            'sim_change_frequency', 'network_type',
            'new_device_login', 'time_since_login_seconds',
            'is_smurf_pattern', 'recent_cashins_24h', 'is_post_downtime',
            'receiver_risk_score', 'is_legit_merchant', 'is_mule_destination',
            'merchant_name_risk', 'Token_latency_seconds', 'geo_velocity_kmh',
            'distance_from_last_cashout_km', 'transaction_hour', 'is_night_transaction',
            'cashout_interval_hours', 'amount', 'transaction_type'
        ]
        
        # Risk thresholds (EcoCash 2026 - optimized for Zimbabwe market)
        self.risk_thresholds = {
            'low': 30,
            'medium': 50,
            'high': 70,
            'critical': 85
        }
        
        # Load model if provided
        if model_path:
            self.load_model(model_path)
            
        # Try to load metadata
        self.decision_threshold = 0.5
        metadata_path = os.path.join(os.path.dirname(model_path) if model_path else 'ml_core/model', 'model_metadata_v4_zimbabwe.json')
        if os.path.exists(metadata_path):
            try:
                with open(metadata_path, 'r') as f:
                    meta = json.load(f)
                    self.decision_threshold = meta.get('threshold', 0.5)
                print(f"Loaded optimized threshold: {self.decision_threshold}")
            except:
                pass
    
    def load_model(self, model_path: str):
        """Load trained LightGBM model"""
        try:
            if model_path.endswith('.pkl'):
                with open(model_path, 'rb') as f:
                    self.model = pickle.load(f)
            else:
                self.model = lgb.Booster(model_file=model_path)
            print(f"Model loaded from {model_path}")
        except Exception as e:
            print(f"Error loading model: {e}")
            self.model = None
    
    def extract_features(self, transaction: Dict) -> pd.DataFrame:
        """
        Extract and validate features from transaction
        """
        features = {}
        for field in self.feature_names:
            val = transaction.get(field, 0)
            # Handle categorical factorizing (simple encoding for inference)
            if isinstance(val, str):
                # Simple hash or mapping for network/type if needed
                # For v4, the model expects numeric. We'll simulate the factorization.
                if field == 'network_type':
                    mapping = {'ecoz_mobile': 0, 'public_wifi': 1, 'vpn': 2}
                    val = mapping.get(val, 3)
                elif field == 'transaction_type':
                    mapping = {'p2p': 0, 'merchant': 1, 'cashout': 2}
                    val = mapping.get(val, 3)
                elif field == 'merchant_name_risk':
                    mapping = {'LEGIT': 0, 'SUSPICIOUS': 1, 'RISKY': 2}
                    val = mapping.get(val, 1)
                else:
                    val = 0
            features[field] = val
        
        return pd.DataFrame([features], columns=self.feature_names)
    
    def apply_rule_based_checks(self, transaction: Dict) -> Tuple[bool, List[str]]:
        """
        Apply rule-based fraud detection rules (EcoCash Zimbabwe 2026 - V4 Aligned)
        """
        reasons = []
        is_fraud = False
        
        # Rule 1: AMOUNT LIMIT EXCEEDED - P2P max $500
        if transaction.get('amount', 0) > 500:
            reasons.append("AMOUNT_LIMIT_EXCEEDED")
            is_fraud = True
        
        # Rule 2: VELOCITY ATTACK - (Adapted for v4 data)
        if transaction.get('recent_cashins_24h', 0) >= 5:
            reasons.append("CASH_IN_VELOCITY")
            is_fraud = True
        
        # Rule 3: IMPOSSIBLE MOVEMENT - geo_velocity_kmh > 300
        if transaction.get('geo_velocity_kmh', 0) > 300:
            reasons.append("LOCATION_JUMP")
            is_fraud = True
        
        # Rule 4: ACCOUNT TAKEOVER - New device + location change + short session
        if (transaction.get('new_device_login', 0) == 1 and 
            transaction.get('distance_from_last_cashout_km', 0) > 50 and
            transaction.get('time_since_login_seconds', 0) < 60):
            reasons.append("ACCOUNT_TAKEOVER_RISK")
            is_fraud = True
        
        # Rule 5: SMURFING PATTERN
        if transaction.get('is_smurf_pattern', 0) == 1:
            reasons.append("SMURFING_PATTERN")
            is_fraud = True
            
        # Rule 6: POST DOWNTIME EXPLOIT
        if transaction.get('is_post_downtime', 0) == 1 and transaction.get('amount', 0) > 200:
            reasons.append("POST_DOWNTIME_VULNERABILITY")
            is_fraud = True
            
        # Rule 7: MULE NETWORK
        if transaction.get('is_mule_destination', 0) == 1:
            reasons.append("MULE_NETWORK_DETECTION")
            is_fraud = True
        
        # Rule 8: HIGH-RISK RECEIVER
        if transaction.get('receiver_risk_score', 0) > 0.8:
            reasons.append("HIGH_RISK_RECEIVER")
            is_fraud = True
            
        return is_fraud, reasons
    
    def score_transaction(self, transaction: Dict) -> Dict:
        """
        Score a transaction with RISK SCORE (0-100)
        
        Avoids over-flagging through:
        - Behavioral context
        - Risk-based thresholds
        - Contextual weighting
        
        Args:
            transaction: Transaction data
            
        Returns:
            Scoring result with risk_score (0-100)
        """
        
        result = {
            'timestamp': datetime.now().isoformat(),
            'transaction_amount': transaction.get('amount'),
            'merchant_type': 'vendor' if transaction.get('merchant_type') == 0 else 'individual',
        }
        
        try:
            # Apply rule-based checks
            rule_based_fraud, rule_reasons = self.apply_rule_based_checks(transaction)
            
            result['rule_based_fraud'] = rule_based_fraud
            result['rule_reasons'] = rule_reasons
            
            # ML Model scoring
            if self.model:
                try:
                    features_df = self.extract_features(transaction)
                    ml_score = float(self.model.predict(features_df)[0])
                    result['ml_fraud_score'] = round(ml_score, 4)
                except Exception as e:
                    result['ml_fraud_score'] = None
            else:
                result['ml_fraud_score'] = None
            
            # Calculate RISK SCORE (0-100)
            risk_score, context_info = self.calculate_fraud_probability(
                rule_based_fraud,
                result.get('ml_fraud_score'),
                transaction
            )
            result['risk_score'] = risk_score  # Now 0-100
            result['context'] = context_info
            
            # Risk level classification based on 0-100 score
            risk_level = self.classify_risk_level_by_score(risk_score)
            result['risk_level'] = risk_level
            
            # Action recommendation
            result['action'] = self.get_recommended_action(risk_level, rule_reasons)
            result['decision'] = self.get_decision_label(risk_level)
            
            return result
            
        except ValueError as e:
            return {
                'error': str(e),
                'status': 'validation_failed'
            }
    
    def calculate_fraud_probability(self, rule_fraud: bool, ml_score: float = None, transaction: Dict = None) -> Tuple[float, Dict]:
        """
        Calculate RISK SCORE (0-100) instead of binary fraud probability
        
        Production-ready scoring that reduces false positives through:
        - Behavioral baselining
        - Contextual weighting
        - Risk-based thresholds
        
        Args:
            rule_fraud: Whether rule-based check flagged as fraud
            ml_score: ML model fraud score (0-1)
            transaction: Full transaction data for context
            
        Returns:
            (risk_score, context_info) - tuple of score and reasoning
        """
        context = {
            'rule_contribution': 0,
            'ml_contribution': 0,
            'context_multiplier': 1.0
        }
        
        # Rule-based contribution (40 points max)
        rule_score = 40 if rule_fraud else 0
        context['rule_contribution'] = rule_score
        
        # ML-based contribution (40 points max)
        ml_score_normalized = (ml_score if ml_score else 0.5) * 40
        context['ml_contribution'] = ml_score_normalized
        
        # Context-based adjustments (20 points)
        if transaction:
            context_score = 0
            
            # Contextual weighting: Multiple risk factors together
            if (transaction.get('is_new_device') == 1 and 
                transaction.get('distance_km', 0) > 10 and 
                transaction.get('amount', 0) > 100):
                context_score += 10  # New device + location + high amount
            
            if (transaction.get('is_night') == 1 and 
                transaction.get('is_new_device') == 1):
                context_score += 5  # Night transaction with new device
            
            if transaction.get('time_since_last_tx', 0) < 5:
                context_score += 3  # Rapid transactions
            
            context['context_multiplier'] = 1 + (context_score / 20)
        
        # Total risk score (0-100)
        base_score = rule_score + ml_score_normalized
        final_score = min(100, base_score * context['context_multiplier'])
        
        return round(final_score, 1), context
    
    def classify_risk_level_by_score(self, risk_score: float) -> str:
        """
        Classify risk level based on RISK SCORE (0-100)
        
        Production thresholds to reduce false positives:
        - 0-30: NORMAL (auto-approve)
        - 30-50: LOW (log and allow)
        - 50-70: MEDIUM (require SMS OTP confirmation)
        - 70-85: HIGH (require advanced verification)
        - 85-100: CRITICAL (block immediately)
        """
        
        if risk_score >= 85:
            return 'CRITICAL'
        elif risk_score >= 70:
            return 'HIGH'
        elif risk_score >= 50:
            return 'MEDIUM'
        elif risk_score >= 30:
            return 'LOW'
        else:
            return 'NORMAL'
    
    def classify_risk_level(self, fraud_probability: float) -> str:
        """Legacy method - kept for backward compatibility"""
        
        if fraud_probability >= self.risk_thresholds['critical']:
            return 'CRITICAL'
        elif fraud_probability >= self.risk_thresholds['high']:
            return 'HIGH'
        elif fraud_probability >= self.risk_thresholds['medium']:
            return 'MEDIUM'
        elif fraud_probability >= self.risk_thresholds['low']:
            return 'LOW'
        else:
            return 'NORMAL'
    
    def get_recommended_action(self, risk_level: str, reasons: List[str]) -> str:
        """Get recommended fraud prevention action - production-ready"""
        
        action_map = {
            'CRITICAL': 'BLOCK_IMMEDIATELY - Contact user for verification',
            'HIGH': 'REQUIRE_VERIFICATION - Send SMS OTP or call for confirmation',
            'MEDIUM': 'SOFT_CHALLENGE - Send SMS confirmation (can retry)',
            'LOW': 'MONITOR - Log transaction but allow',
            'NORMAL': 'AUTO_APPROVE - Process immediately'
        }
        
        return action_map.get(risk_level, 'UNKNOWN_ACTION')

    def get_decision_label(self, risk_level: str) -> str:
        """Map internal risk levels to production decision labels"""
        decision_map = {
            'CRITICAL': 'BLOCK',
            'HIGH': 'VERIFY',
            'MEDIUM': 'CHALLENGE',
            'LOW': 'MONITOR',
            'NORMAL': 'APPROVE'
        }
        return decision_map.get(risk_level, 'APPROVE')
    
    def batch_score_transactions(self, transactions: List[Dict]) -> List[Dict]:
        """
        Score multiple transactions efficiently
        
        Args:
            transactions: List of transaction dictionaries
            
        Returns:
            List of scoring results
        """
        results = []
        for tx in transactions:
            results.append(self.score_transaction(tx))
        
        return results
    
    def get_performance_metrics(self, test_transactions: List[Dict], 
                               true_labels: List[int]) -> Dict:
        """
        Calculate performance metrics on test set
        
        Args:
            test_transactions: List of test transactions
            true_labels: True fraud labels (0/1)
            
        Returns:
            Performance metrics
        """
        from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
        
        predictions = []
        scores = []
        
        for tx in test_transactions:
            result = self.score_transaction(tx)
            # Use risk_score normalized to 0-1 for AUC
            predictions.append(1 if result['risk_score'] >= 50 else 0)
            scores.append(result['risk_score'] / 100.0)
        
        return {
            'precision': precision_score(true_labels, predictions),
            'recall': recall_score(true_labels, predictions),
            'f1': f1_score(true_labels, predictions),
            'roc_auc': roc_auc_score(true_labels, scores)
        }


# Example usage
if __name__ == "__main__":
    # Initialize engine
    engine = TAPnPAYRiskEngine()
    
    # Example normal transaction (Zimbabwe context)
    normal_tx = {
        'amount': 15.50,
        'is_new_device': 0,
        'distance_km': 0.5,
        'time_since_last_tx': 300,
        'tx_count_last_10s': 1,
        'tx_count_last_1min': 2,
        'token_age': 5,
        'geo_speed': 0.1,
        'merchant_type': 0,  # vendor
        'is_night': 0,
        'transaction_hour': 14,
        'merchant_risk_score': 0.15
    }
    
    # Example fraudulent transaction
    fraud_tx = {
        'amount': 500.0,
        'is_new_device': 1,
        'distance_km': 800.0,
        'time_since_last_tx': 10,
        'tx_count_last_10s': 5,
        'tx_count_last_1min': 15,
        'token_age': 45,
        'geo_speed': 620.0,
        'merchant_type': 1,
        'is_night': 1,
        'transaction_hour': 23,
        'merchant_risk_score': 0.85
    }
    
    print("="*60)
    print("NORMAL TRANSACTION ANALYSIS")
    print("="*60)
    normal_result = engine.score_transaction(normal_tx)
    print(json.dumps(normal_result, indent=2))
    
    print("\n" + "="*60)
    print("FRAUDULENT TRANSACTION ANALYSIS")
    print("="*60)
    fraud_result = engine.score_transaction(fraud_tx)
    print(json.dumps(fraud_result, indent=2))
