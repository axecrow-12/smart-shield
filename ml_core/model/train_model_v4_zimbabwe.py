import pandas as pd
import numpy as np
import lightgbm as lgb
import os
import json
from sklearn.model_selection import train_test_split
from imblearn.over_sampling import SMOTE

# Configuration
DATA_PATH = '../data/TAPnPAY_fraud_enhanced.csv'
MODEL_DIR = '../model'
MODEL_NAME = 'fraud_detection_model_v4_zimbabwe.txt'
METADATA_NAME = 'model_metadata_v4_zimbabwe.json'

def train_v4_model():
    print("Re-generating TAPnPAY Fraud Detection Model v4.0...")
    
    # Check data
    full_data_path = os.path.join(os.path.dirname(__file__), DATA_PATH)
    if not os.path.exists(full_data_path):
        print(f"Error: Dataset not found at {full_data_path}")
        return

    # Load data
    df = pd.read_csv(full_data_path)
    
    # Zimbabwe-optimized features (as found in notebook)
    features = [
        'sim_change_frequency', 'network_type',
        'new_device_login', 'time_since_login_seconds',
        'is_smurf_pattern', 'recent_cashins_24h', 'is_post_downtime',
        'receiver_risk_score', 'is_legit_merchant', 'is_mule_destination',
        'merchant_name_risk', 'Token_latency_seconds', 'geo_velocity_kmh',
        'distance_from_last_cashout_km', 'transaction_hour', 'is_night_transaction',
        'cashout_interval_hours', 'amount', 'transaction_type'
    ]
    
    X = df[features].copy()
    y = df['fraud_label'].copy()
    
    # Handle categorical
    for col in X.select_dtypes(include='object').columns:
        X[col] = pd.factorize(X[col])[0]
        
    # Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Balance
    print("Applying SMOTE balancing...")
    smote = SMOTE(random_state=42)
    X_res, y_res = smote.fit_resample(X_train, y_train)
    
    # Train
    print("Boosted training started...")
    params = {
        'objective': 'binary',
        'metric': 'auc',
        'learning_rate': 0.03,
        'num_leaves': 63,
        'verbose': -1,
        'feature_fraction': 0.85,
        'bagging_fraction': 0.85,
        'bagging_freq': 3,
        'lambda_l1': 0.5,
        'lambda_l2': 0.5,
        'min_child_samples': 10,
        'min_child_weight': 50,
    }
    
    train_set = lgb.Dataset(X_res, label=y_res)
    model = lgb.train(params, train_set, num_boost_round=150)
    
    # Save
    model_path = os.path.join(os.path.dirname(__file__), MODEL_NAME)
    model.save_model(model_path)
    print(f"Model saved to {model_path}")
    
    # Metadata
    metadata = {
        "version": "4.0.0",
        "model_type": "LightGBM",
        "optimized_for": "Zimbabwe EcoCash Context",
        "features": features,
        "parameters": params,
        "trained_at": pd.Timestamp.now().isoformat()
    }
    
    meta_path = os.path.join(os.path.dirname(__file__), METADATA_NAME)
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=4)
    print(f"Metadata saved to {meta_path}")

if __name__ == "__main__":
    train_v4_model()
