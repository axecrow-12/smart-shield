# ⚡ TAPnPAY Quick Start Guide

## 🚀 Get Running in 5 Minutes

### Step 1: Install Dependencies (1 min)
```bash
cd c:\Users\USER\Desktop\TAPnPAY
pip install -r requirements.txt
```

### Step 2: Review Training Notebook (2 min)
```bash
jupyter notebook model/train_model.ipynb
```
Run all cells to train the model. Expected time: 5-10 minutes.

### Step 3: Start API (1 min)
```bash
python api/app.py
```
Server starts at: `http://0.0.0.0:8000`  
**🔥 Swagger Docs**: `http://0.0.0.0:8000/docs`

### Step 4: Test API (1 min)
```bash
curl -X POST http://localhost:8000/api/v1/score-transaction \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50.0,
    "is_new_device": 0,
    "distance_km": 2.5,
    "time_since_last_tx": 300,
    "tx_count_last_10s": 1,
    "tx_count_last_1min": 2,
    "token_age": 10,
    "geo_speed": 0.5,
    "merchant_type": 0,
    "is_night": 0,
    "transaction_hour": 14,
    "merchant_risk_score": 0.2
  }'
```

---

## 📊 What You Have

### ✅ Complete ML Pipeline
- **Dataset**: 5000 realistic Zimbabwe transactions
- **Model**: LightGBM fraud detection (12 features)
- **API**: Production-ready REST endpoints
- **Risk Engine**: Rule-based + ML hybrid scoring

### ✅ 6 Fraud Detection Rules
1. High Amount (> $300)
2. Velocity Attack (3+ tx/10sec)
3. Location Jump (impossible speed)
4. New Device + High Amount
5. Expired Token (> 30 sec)
6. High Risk Merchant

### ✅ 12 Features
```
amount, is_new_device, distance_km, time_since_last_tx,
tx_count_last_10s, tx_count_last_1min, token_age, geo_speed,
merchant_type, is_night, transaction_hour, merchant_risk_score
```

---

## 📁 Project Structure

```
TAPnPAY/
├── data/
│   └── TAPnPAY_fraud_synthetic_dataset.csv    ✅ 5000 tx ready
│
├── model/
│   ├── train_model.ipynb                      ✅ Training pipeline
│   ├── fraud_detection_model.txt              ✅ Trained LightGBM model
│   └── model_metadata.json                    ✅ Configuration
│
├── api/
│   └── app.py                                 ✅ FastAPI server
│
├── utils/
│   └── risk_engine.py                         ✅ Core scoring engine
│
├── requirements.txt                           ✅ Dependencies
├── README.md                                  ✅ Full documentation
└── QUICKSTART.md                              ✅ This file
```

---

## 🔌 API Endpoints

### Check Health
```bash
GET /health
```

### Score One Transaction
```bash
POST /api/v1/score-transaction
```
**Required Fields** (12 total):
- amount, is_new_device, distance_km, time_since_last_tx
- tx_count_last_10s, tx_count_last_1min, token_age, geo_speed
- merchant_type, is_night, transaction_hour, merchant_risk_score

### Score Many Transactions
```bash
POST /api/v1/batch-score
```
Max 1000 transactions per request.

### Get Statistics
```bash
GET /api/v1/stats
```
Shows total requests, fraud detected, error rate.

### Get Model Info
```bash
GET /api/v1/model-info
```
Shows features, thresholds, rules implemented.

---

## 🧪 Test Transactions

### Normal Transaction (Should Pass)
```json
{
  "amount": 15.50,
  "is_new_device": 0,
  "distance_km": 0.5,
  "time_since_last_tx": 300,
  "tx_count_last_10s": 1,
  "tx_count_last_1min": 2,
  "token_age": 5,
  "geo_speed": 0.1,
  "merchant_type": 0,
  "is_night": 0,
  "transaction_hour": 14,
  "merchant_risk_score": 0.15
}
```
**Expected**: `risk_level: NORMAL` ✅

### Fraud Transaction (Should Block)
```json
{
  "amount": 500.0,
  "is_new_device": 1,
  "distance_km": 800.0,
  "time_since_last_tx": 10,
  "tx_count_last_10s": 5,
  "tx_count_last_1min": 15,
  "token_age": 45,
  "geo_speed": 620.0,
  "merchant_type": 1,
  "is_night": 1,
  "transaction_hour": 23,
  "merchant_risk_score": 0.85
}
```
**Expected**: `risk_level: CRITICAL` 🚨

### Medium Risk (Requires OTP)
```json
{
  "amount": 120.0,
  "is_new_device": 1,
  "distance_km": 5.0,
  "time_since_last_tx": 200,
  "tx_count_last_10s": 1,
  "tx_count_last_1min": 2,
  "token_age": 15,
  "geo_speed": 1.5,
  "merchant_type": 0,
  "is_night": 0,
  "transaction_hour": 16,
  "merchant_risk_score": 0.4
}
```
**Expected**: `risk_level: MEDIUM` 📊

---

## 📈 Risk Levels Explained

| Score | Level | Action |
|-------|-------|--------|
| 0.0-0.3 | NORMAL | Auto-approve |
| 0.3-0.5 | LOW | Allow + log |
| 0.5-0.7 | MEDIUM | Require OTP |
| 0.7-0.85 | HIGH | Block + verify |
| 0.85-1.0 | CRITICAL | Block immediately |

---

## 🔧 Customization Options

### Change Risk Thresholds
In `utils/risk_engine.py`, modify:
```python
self.risk_thresholds = {
    'low': 0.3,
    'medium': 0.5,
    'high': 0.7,
    'critical': 0.85
}
```

### Add New Rule
In `risk_engine.py`, add to `apply_rule_based_checks()`:
```python
if transaction.get('your_feature') > threshold:
    reasons.append("YOUR_RULE_NAME")
    is_fraud = True
```

### Retrain Model
```bash
jupyter notebook model/train_model.ipynb  # Retrain with existing data
```

---

## 🌍 Zimbabwe Context

This system is built specifically for:
- ✅ Informal market payments ($5-50 typical)
- ✅ Vendor networks (repeated small transactions)
- ✅ Mobile money patterns (< 5 devices per user)
- ✅ Time zones (Southern Africa Standard Time)
- ✅ Fraud patterns (velocity attacks, device swaps)

---

## 📊 Expected Performance

After training:
- **ROC-AUC**: ~92%
- **Precision**: ~85% (85% of fraud flags are true)
- **Recall**: ~80% (catches 80% of actual fraud)
- **F1-Score**: ~82%

---

## 🆘 Troubleshooting

### Port 5000 already in use
```bash
# Find and kill process
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

### Missing required fields error
Ensure all 12 features in your request:
1. amount
2. is_new_device
3. distance_km
4. time_since_last_tx
5. tx_count_last_10s
6. tx_count_last_1min
7. token_age
8. geo_speed
9. merchant_type
10. is_night
11. transaction_hour
12. merchant_risk_score

### Model not loading
Ensure you've run the training notebook:
```bash
jupyter notebook model/train_model.ipynb
```

---

## 📝 Key Files Explained

| File | Purpose |
|------|---------|
| `data/TAPnPAY_fraud_synthetic_dataset.csv` | Training dataset (5000 tx) |
| `model/train_model.ipynb` | Training pipeline (run this first) |
| `utils/risk_engine.py` | Fraud scoring engine |
| `api/app.py` | REST API server |
| `README.md` | Full documentation |

---

## 🚀 Next Steps

1. **Run Training Notebook**
   ```bash
   jupyter notebook model/train_model.ipynb
   ```

2. **Start API Server**
   ```bash
   python api/app.py
   ```

3. **Test with Sample Transactions**
   - Use curl or Postman
   - See test transactions above

4. **Monitor Performance**
   ```bash
   GET /api/v1/stats
   ```

---

## 💡 Pro Tips

- Save model predictions to database for monitoring
- Retrain monthly with new transaction patterns
- Track false positive rate as KPI
- A/B test threshold changes
- Monitor feature distributions for drift

---

## 📞 Support

For issues:
1. Check API logs: `GET /api/v1/stats`
2. Verify all 12 features in request
3. Review README.md for full documentation
4. Check model training notebook for issues

---

**Ready to detect fraud like a boss!** 🔥🇿🇼

Start with: `python api/app.py`
