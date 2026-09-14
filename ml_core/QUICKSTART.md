# ML Core Quick Start (v4)

> Full project setup (backend + emulator + dashboard) is in the [root README](../README.md). This covers the ML service alone.

## Run the scoring API

```bash
pip install -r requirements.txt
python api/app.py
```

- API: `http://127.0.0.1:8000` — Swagger docs at `/docs`
- Endpoints: `POST /score`, `POST /batch-score`, `POST /check-rules`, `POST /analyze`, `GET /model-info`, `GET /health`

`POST /score` takes the 19 v4 features (all optional except `amount`; see the `ZimbabweTransaction` model in `api/app.py`) and returns a 0–100 `risk_score`, a decision (`APPROVE`/`MONITOR`/`CHALLENGE`/`VERIFY`/`BLOCK`), triggered rule reasons, and `top_features` — per-feature SHAP contributions explaining the model's view.

## Retrain the model

```bash
python scripts/train_model.py
```

Reproducible pipeline: explicit categorical encodings (kept in sync with serving in `utils/risk_engine.py`), stratified 80/20 split, SMOTE-Tomek balancing on the training set only, LightGBM with early stopping. Writes the model plus metadata with real held-out metrics (AUC, F1, precision/recall, confusion matrix) that `/model-info` serves.

The notebook `notebooks/TAPnPAY_Fraud_Detection_v4_Production.ipynb` is the same pipeline with EDA and plots.

## Tests

```bash
python -m pytest tests/ -q
```

## Layout

| Path | Purpose |
|---|---|
| `api/app.py` | FastAPI scoring service |
| `utils/risk_engine.py` | Hybrid rules + ML risk engine |
| `scripts/train_model.py` | Headless training pipeline |
| `scripts/test_api_v4.py` | Manual API exercise script (needs a running server) |
| `model/` | Trained LightGBM model + metadata (metrics, threshold, encodings) |
| `data/TAPnPAY_fraud_enhanced.csv` | 10k synthetic Zimbabwe transactions |
| `tests/` | pytest suite |

⚠️ `model/*.lgb` is line-ending-sensitive text; `.gitattributes` protects it from CRLF conversion.
