const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const fraudRoutes = require("./routes/fraudRoutes");
const ecocashRoutes = require("./routes/ecocashRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "SmartPay Shield backend is running" });
});

app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/fraud", fraudRoutes);
app.use("/api/ecocash", ecocashRoutes);

module.exports = app;