const express = require("express");
const router = express.Router();
const { verifyFirebaseToken } = require("../middleware/authMiddleware");

router.get("/", (req, res) => {
  res.json({ message: "Auth route working" });
});

router.get("/me", verifyFirebaseToken, (req, res) => {
  res.json({
    message: "Authenticated user",
    user: req.user,
  });
});

module.exports = router;