/**
 * Starts the Firestore emulator on port 8765.
 *
 * Prefers the bundled portable JDK + emulator jar in tools/ (needed on
 * machines where the system Java can't open NIO selectors — e.g. the
 * JDK 16+ Unix-domain-socket pipe bug some Windows installs hit).
 * Falls back to `firebase emulators:start` if tools/ is absent.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = 8765;
const root = path.join(__dirname, "..");
const toolsDir = path.join(root, "tools");

function findLocal() {
  if (!fs.existsSync(toolsDir)) return null;
  const entries = fs.readdirSync(toolsDir);
  const jdk = entries.find((e) => e.startsWith("jdk-"));
  const jar = entries.find((e) => e.startsWith("fs-emu-") && e.endsWith(".jar"));
  if (!jdk || !jar) return null;
  return {
    java: path.join(toolsDir, jdk, "bin", "java.exe"),
    jar: path.join(toolsDir, jar),
  };
}

const local = findLocal();
let child;

if (local) {
  console.log(`Starting Firestore emulator (portable JDK) on 127.0.0.1:${PORT}`);
  child = spawn(local.java, ["-jar", local.jar, "--host", "127.0.0.1", "--port", String(PORT)], {
    stdio: "inherit",
  });
} else {
  console.log("tools/ not found; falling back to firebase CLI emulator");
  child = spawn("firebase", ["emulators:start", "--only", "firestore", "--project", "smartpay-shield"], {
    stdio: "inherit",
    shell: true,
  });
}

child.on("exit", (code) => process.exit(code ?? 0));
