/**
 * Minimal structured logging (JSON lines, no dependencies).
 */

function log(level, message, extra) {
  const entry = { ts: new Date().toISOString(), level, message, ...extra };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.log(line);
}

const info = (message, extra) => log("info", message, extra);
const warn = (message, extra) => log("warn", message, extra);

// Server-side error record; the client only ever sees a generic message.
function logError(message, error, extra) {
  log("error", message, { error: error?.message, stack: error?.stack, ...extra });
}

// Express middleware: one line per request with status + duration.
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      info("request", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
      });
    }
  });
  next();
}

module.exports = { info, warn, logError, requestLogger };
