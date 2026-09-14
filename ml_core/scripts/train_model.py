"""
TAPnPAY v4 training pipeline (headless, reproducible).

Mirrors notebooks/TAPnPAY_Fraud_Detection_v4_Production.ipynb but runs
end-to-end from the command line and writes evaluation metrics into the
model metadata so the API's /model-info reports real numbers.

Run:  python scripts/train_model.py   (from the ml_core directory)
"""

import json
import os
from datetime import datetime

import lightgbm as lgb
import numpy as np
import pandas as pd
from imblearn.combine import SMOTETomek
from sklearn.metrics import (
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(BASE, "data", "TAPnPAY_fraud_enhanced.csv")
MODEL_PATH = os.path.join(BASE, "model", "fraud_detection_model_v4_zimbabwe.lgb")
META_PATH = os.path.join(BASE, "model", "model_metadata_v4_zimbabwe.json")

FEATURES = [
    "sim_change_frequency", "network_type",
    "new_device_login", "time_since_login_seconds",
    "is_smurf_pattern", "recent_cashins_24h", "is_post_downtime",
    "receiver_risk_score", "is_legit_merchant", "is_mule_destination",
    "merchant_name_risk", "Token_latency_seconds", "geo_velocity_kmh",
    "distance_from_last_cashout_km", "transaction_hour", "is_night_transaction",
    "cashout_interval_hours", "amount", "transaction_type",
]

# Explicit, stable categorical encoding — MUST stay in sync with
# utils/risk_engine.py extract_features(). (Alphabetical, matching what
# sklearn LabelEncoder produced for the original v4 model.)
TRANSACTION_TYPE_MAP = {
    "airtime_topup": 0, "bill_payment": 1, "cash_in_agent": 2,
    "cash_out_agent": 3, "merchant_payment": 4, "p2p_transfer": 5,
}

SEED = 42
DECISION_THRESHOLD = 0.5


def load_data():
    df = pd.read_csv(DATA_PATH)
    X = df[FEATURES].copy()
    y = df["fraud_label"].copy()

    # Encode string categoricals explicitly (dtype-agnostic: works on
    # pandas 2 'object' and pandas 3 'str' columns alike).
    for col in X.columns:
        if not pd.api.types.is_numeric_dtype(X[col]):
            if col == "transaction_type":
                X[col] = X[col].map(TRANSACTION_TYPE_MAP)
                if X[col].isna().any():
                    unknown = df.loc[X[col].isna(), col].unique()
                    raise ValueError(f"Unknown transaction_type values: {unknown}")
            else:
                raise ValueError(f"Unexpected non-numeric column: {col}")
        X[col] = X[col].astype(float)

    return df, X, y


def main():
    df, X, y = load_data()
    print(f"Dataset: {len(df)} rows, fraud rate {y.mean():.4f}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y
    )

    print("Balancing training set with SMOTE-Tomek...")
    smt = SMOTETomek(random_state=SEED)
    X_res, y_res = smt.fit_resample(X_train, y_train)
    print(f"Train: {np.bincount(y_train)} -> balanced {np.bincount(y_res)}")

    lgb_train = lgb.Dataset(X_res, label=y_res)
    lgb_eval = lgb.Dataset(X_test, label=y_test, reference=lgb_train)

    params = {
        "objective": "binary",
        "metric": ["auc", "binary_logloss"],
        "num_leaves": 31,
        "learning_rate": 0.05,
        "feature_fraction": 0.9,
        "seed": SEED,
        "verbose": -1,
    }

    model = lgb.train(
        params,
        lgb_train,
        num_boost_round=1000,
        valid_sets=[lgb_eval],
        callbacks=[lgb.early_stopping(stopping_rounds=100, verbose=False)],
    )
    print(f"Trained {model.num_trees()} trees (early stopping on held-out AUC)")

    # ---- Evaluation on the untouched 20% test split ----
    y_proba = model.predict(X_test)
    y_pred = (y_proba >= DECISION_THRESHOLD).astype(int)

    auc_score = roc_auc_score(y_test, y_proba)
    f1 = f1_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    tn, fp, fn, tp = confusion_matrix(y_test, y_pred).ravel()

    print("\n=== Held-out test metrics (n=%d) ===" % len(y_test))
    print(f"ROC-AUC:   {auc_score:.4f}")
    print(f"F1:        {f1:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"Confusion: TN={tn} FP={fp} FN={fn} TP={tp}")

    importance = sorted(
        zip(FEATURES, model.feature_importance(importance_type="gain")),
        key=lambda t: -t[1],
    )
    print("\nTop features by gain:")
    for name, gain in importance[:8]:
        print(f"  {name:32s} {gain:12.1f}")

    # ---- Save model + metadata ----
    model.save_model(MODEL_PATH)

    metadata = {
        "version": "4.1.0",
        "model": "LightGBM",
        "focus": "Zimbabwe-Optimized",
        "trained_at": datetime.now().isoformat(),
        "dataset": os.path.basename(DATA_PATH),
        "dataset_size": int(len(df)),
        "fraud_rate": round(float(y.mean()), 4),
        "test_size": int(len(y_test)),
        "threshold": DECISION_THRESHOLD,
        "num_trees": int(model.num_trees()),
        "performance": {
            "roc_auc": round(float(auc_score), 4),
            "f1_score": round(float(f1), 4),
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        },
        "top_features_by_gain": [
            {"feature": name, "gain": round(float(gain), 1)} for name, gain in importance[:10]
        ],
        "features": FEATURES,
        "categorical_encodings": {"transaction_type": TRANSACTION_TYPE_MAP},
    }
    with open(META_PATH, "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nSaved model -> {MODEL_PATH}")
    print(f"Saved metadata -> {META_PATH}")


if __name__ == "__main__":
    main()
