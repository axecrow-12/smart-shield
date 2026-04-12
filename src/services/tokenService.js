const { v4: uuidv4 } = require("uuid");

function generatePaymentId() {
  return uuidv4().replace(/-/g, "");
}

function generatePaymentToken() {
  return uuidv4().replace(/-/g, "");
}

function getExpiryTime(minutes = 10) {
  return Date.now() + minutes * 60 * 1000;
}

function isExpired(expiresAt) {
  return Date.now() > expiresAt;
}

module.exports = {
  generatePaymentId,
  generatePaymentToken,
  getExpiryTime,
  isExpired,
};