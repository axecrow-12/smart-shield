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

module.exports = { verifyFirebaseToken };