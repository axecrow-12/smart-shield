const { auth } = require("../config/firebase");

async function verifyFirebaseToken(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Missing or invalid authorization header",
      });
    }

    const idToken = header.split("Bearer ")[1];
    const decodedToken = await auth.verifyIdToken(idToken);

    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Unauthorized",
      details: error.message,
    });
  }
}

/**
 * Auth for payment/fraud/ecocash routes. Enforced by default; set
 * ALLOW_ANON_DEMO=1 (demo mode) to allow unauthenticated access, in
 * which case a Bearer token is still verified when one is supplied.
 */
function requireAuthUnlessDemo(req, res, next) {
  if (process.env.ALLOW_ANON_DEMO === "1") {
    if (req.headers.authorization) return verifyFirebaseToken(req, res, next);
    req.user = { uid: "demo-anon", demo: true };
    return next();
  }
  return verifyFirebaseToken(req, res, next);
}

module.exports = { verifyFirebaseToken, requireAuthUnlessDemo };