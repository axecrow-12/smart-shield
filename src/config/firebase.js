const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const projectId = process.env.FIREBASE_PROJECT_ID || "smartpay-shield";

if (!admin.apps.length) {
  const keyPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, "..", "..", "serviceAccountKey.json");

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Demo mode: no cloud credentials needed, talks to the local emulator.
    admin.initializeApp({ projectId });
    console.log(
      `Firestore: using emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
    );
  } else if (fs.existsSync(keyPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
      projectId,
    });
    console.log(`Firestore: using service account key (${projectId})`);
  } else {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log("Firestore: using application default credentials");
  }
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
