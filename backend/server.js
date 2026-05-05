/**
 * server.js — CSC Seva Kendra Backend
 * =====================================================
 * Security Stack (layered):
 *   1. Helmet      — HTTP security headers
 *   2. CORS        — Origin whitelist
 *   3. Rate limit  — Global + per-route
 *   4. Compression — gzip responses
 *   5. Morgan      — HTTP request logging
 *   6. Body parser — Size-limited JSON
 *   7. Sanitizer   — XSS strip on req.body
 *   8. JWT         — Protects /api/admin/*
 *   9. Validators  — express-validator on every route
 *  10. Error handler — Never leaks stack traces
 */

require("dotenv").config();
const express     = require("express");
const path        = require("path");
const compression = require("compression");
const morgan      = require("morgan");
const fs          = require("fs");

const {
  helmetMiddleware,
  corsMiddleware,
  globalRateLimiter,
  sanitizeBody,
} = require("./middleware/security");
const { appLogger } = require("./middleware/logger");
const { UPLOADS_DIR, uploadHeaders } = require("./middleware/upload");

const publicRoutes = require("./routes/public");
const adminRoutes  = require("./routes/admin");

const app  = express();
const PORT = parseInt(process.env.PORT) || 3000;

/* ══════════════════════════════════════════
   TRUST PROXY (needed for rate-limiter IPs behind Nginx/Cloudflare)
══════════════════════════════════════════ */
app.set("trust proxy", 1);

/* ══════════════════════════════════════════
   SECURITY MIDDLEWARE (ORDER MATTERS)
══════════════════════════════════════════ */
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.options("*", corsMiddleware);          // Pre-flight for all routes

/* ══════════════════════════════════════════
   PERFORMANCE
══════════════════════════════════════════ */
app.use(compression());

/* ══════════════════════════════════════════
   REQUEST LOGGING (redact sensitive fields)
══════════════════════════════════════════ */
const LOG_DIR  = process.env.LOG_DIR || "./logs";
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

morgan.token("remote-addr-anon", (req) => {
  // Log only first 3 octets of IP (privacy compliance)
  const ip = req.ip || req.socket.remoteAddress || "";
  return ip.split(".").slice(0, 3).join(".") + ".xxx";
});
const morganFormat = ':remote-addr-anon :method :url :status :res[content-length] - :response-time ms';

if (process.env.NODE_ENV === "production") {
  const accessLog = fs.createWriteStream(path.join(LOG_DIR, "access.log"), { flags: "a" });
  app.use(morgan(morganFormat, { stream: accessLog }));
} else {
  app.use(morgan("dev"));
}

/* ══════════════════════════════════════════
   BODY PARSING (size-limited)
══════════════════════════════════════════ */
app.use(express.json({ limit: "64kb" }));            // Limit JSON body size
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

/* ══════════════════════════════════════════
   GLOBAL RATE LIMITER
══════════════════════════════════════════ */
app.use("/api/", globalRateLimiter);

/* ══════════════════════════════════════════
   XSS BODY SANITIZATION
══════════════════════════════════════════ */
app.use(sanitizeBody);

/* ══════════════════════════════════════════
   SERVE UPLOADED IMAGES (with security headers)
   - Served from /uploads/* path
   - No directory listing
   - Content-Type must match image/*
══════════════════════════════════════════ */
app.use("/uploads", uploadHeaders, express.static(UPLOADS_DIR, {
  dotfiles:   "deny",
  index:      false,          // No directory listing
  maxAge:     "7d",
  setHeaders(res, filePath) {
    // Only allow serving known image types
    const ext = path.extname(filePath).toLowerCase();
    const typeMap = { ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png" };
    if (typeMap[ext]) {
      res.setHeader("Content-Type", typeMap[ext]);
    } else {
      // Block anything else
      res.status(403).end();
    }
  },
}));

/* ══════════════════════════════════════════
   SERVE FRONTEND (static files)
══════════════════════════════════════════ */
const FRONTEND_DIR = path.resolve(__dirname, "../frontend");
app.use(express.static(FRONTEND_DIR, {
  dotfiles: "deny",
  index:    "index.html",
  maxAge:   process.env.NODE_ENV === "production" ? "1d" : "0",
  setHeaders(res, filePath) {
    // Admin panel: no cache, no index by search engines
    if (filePath.includes("admin.html")) {
      res.setHeader("Cache-Control",  "no-store");
      res.setHeader("X-Robots-Tag",   "noindex, nofollow");
    }
  },
}));

/* ══════════════════════════════════════════
   API ROUTES
══════════════════════════════════════════ */
app.use("/api",       publicRoutes);
app.use("/api/admin", adminRoutes);

/* 404 for unknown API routes */
app.use("/api/*", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found." });
});

/* SPA fallback for frontend pages */
app.get("*", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

/* ══════════════════════════════════════════
   GLOBAL ERROR HANDLER
   NEVER leak stack traces in production
══════════════════════════════════════════ */
app.use((err, req, res, next) => {
  appLogger.error("Unhandled error", {
    error:  err.message,
    stack:  err.stack,
    path:   req.path,
    method: req.method,
  });

  // CORS error
  if (err.message?.includes("CORS")) {
    return res.status(403).json({ success: false, message: "CORS error." });
  }

  // JSON parse error
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON body." });
  }

  // Request too large
  if (err.status === 413) {
    return res.status(413).json({ success: false, message: "Request body too large." });
  }

  const status  = err.status || err.statusCode || 500;
  const message = process.env.NODE_ENV === "production"
    ? "An unexpected error occurred."
    : err.message;

  res.status(status).json({ success: false, message });
});

/* ══════════════════════════════════════════
   PROCESS SAFETY
══════════════════════════════════════════ */
process.on("uncaughtException", (err) => {
  appLogger.error("Uncaught Exception", { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  appLogger.error("Unhandled Rejection", { reason: String(reason) });
});

/* ══════════════════════════════════════════
   START SERVER
══════════════════════════════════════════ */
app.listen(PORT, "127.0.0.1", () => {        // Bind to localhost only — Nginx proxies externally
  appLogger.info(`CSC Backend running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
  console.log(`✅ Server: http://127.0.0.1:${PORT}`);
});

module.exports = app;
