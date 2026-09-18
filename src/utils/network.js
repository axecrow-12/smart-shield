const os = require("os");

// Adapter names that are almost never the right network to hand a phone
// (virtualization/tunnel software often creates its own private-looking
// IPv4 interfaces). We deprioritize these when guessing the LAN address.
const DEPRIORITIZE = /virtualbox|vmware|hyper-v|vethernet|docker|wsl|tailscale|zerotier|loopback/i;
const PREFER = /wi-?fi|wireless|ethernet|^en\d|^wlan/i;

/**
 * Best-effort base URL a phone on the same network can use to reach this
 * server (for the QR "scan to pay" link). Override with PUBLIC_BASE_URL
 * in .env if auto-detection picks the wrong network adapter (common on
 * machines with VPN/virtualization software installed).
 */
function getLanUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  const port = process.env.PORT || 5050;
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const [name, addrs] of Object.entries(nets)) {
    for (const net of addrs || []) {
      if (net.family === "IPv4" && !net.internal) {
        candidates.push({ name, address: net.address });
      }
    }
  }

  const score = (c) => (PREFER.test(c.name) ? 2 : DEPRIORITIZE.test(c.name) ? 0 : 1);
  candidates.sort((a, b) => score(b) - score(a));

  if (candidates.length) {
    return `http://${candidates[0].address}:${port}`;
  }

  // Fallback: whatever host the requester used to reach us.
  return `${req.protocol}://${req.get("host")}`;
}

/**
 * Base URL for the Vendor Tap fast-lane link. WebAuthn requires a secure
 * context (HTTPS, or localhost/127.0.0.1) — the plain-LAN-HTTP address
 * getLanUrl() returns does NOT qualify, so this deliberately does not
 * fall back to it. Set PUBLIC_HTTPS_URL in .env to your HTTPS tunnel's
 * URL (e.g. `ngrok http 5050` prints one) to enable Vendor Tap links.
 * Returns null if unset, so callers can show an explicit "not configured"
 * state instead of silently handing out a link that will fail on the phone.
 */
function getVendorTapUrl() {
  if (!process.env.PUBLIC_HTTPS_URL) return null;
  return process.env.PUBLIC_HTTPS_URL.replace(/\/$/, "");
}

module.exports = { getLanUrl, getVendorTapUrl };
