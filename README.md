# smart-shield
a smart fraud detection application

---

# 🇿🇼 TAPnPAY Fraud Detection System (ML Part)

**Optimized for Zimbabwe Mobile Money (EcoCash/OneMoney) - v4.0**

This section contains the Machine Learning components of the TAPnPAY project, designed to detect and block fraudulent transactions in real-time.

## 🚀 Key Features (v4.0)
- **Hybrid Scoring**: Combines 9 deterministic Zimbabwe-specific fraud rules with a high-performance LightGBM model.
- **Social Engineering Detection**: Specifically tuned to catch OTP interception and session hijacking.
- **Offline Vulnerability Protection**: Patterns for identifying fraud during/after network downtimes.
- **Explainable AI**: Every block/score comes with clear reasoning (e.g., "Velocity Attack", "Mule Network Risk").

## 📁 ML Structure
- `api/`: FastAPI REST server (`/score`, `/analyze`, `/batch-score`).
- `model/`: Trained LightGBM model and metadata.
- `utils/`: Core `RiskEngine` logic.
- `notebooks/`: Detailed research, EDA, and training pipeline.
- `data/`: Zimbabwe-specific synthetic & enhanced datasets.

## 🛠 Setup & Usage
1. **Install Dependencies**: `pip install -r requirements.txt`
2. **Start API**: `python api/app.py`
3. **Docs**: `http://localhost:8000/docs`

---
*For original application details, see the root folders (`src/`, etc.)*
