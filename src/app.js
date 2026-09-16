const path = require("path");
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const fraudRoutes = require("./routes/fraudRoutes");
const ecocashRoutes = require("./routes/ecocashRoutes");
const ecocashEipRoutes = require("./routes/ecocashEipRoutes");

const { requestLogger } = require("./utils/logger");

const app = express();

app.use(requestLogger);
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api", (req, res) => {
  res.json({ message: "SmartPay Shield backend is running" });
});

// Clean URL for the customer-facing "scan to pay" page (the QR code
// encodes /pay?token=..., which express.static alone wouldn't resolve
// since the file on disk is pay.html).
app.get("/pay", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "pay.html"));
});

app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/fraud", fraudRoutes);
app.use("/api/ecocash", ecocashRoutes);
app.use("/api/ecocash-eip", ecocashEipRoutes);

module.exports = app;