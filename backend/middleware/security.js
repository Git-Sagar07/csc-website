/**
 * middleware/security.js
 * Centralised security middleware stack:
 *  - Helmet HTTP headers
 *  - CORS with whitelist
 *  - Rate limiting (global + auth-specific)
 *  - Slow-down on repeated requests
 *  - JWT authentication
 *  - Input sanitisation helpers
 */

const helmet        = require("helmet");
const cors          = require("cors");
const rateLimit     = require("express-rate-limit");
const slowDown      = require("express-slow-down");
const jwt           = require("jsonwebtoken");
const crypto        = require("crypto");
const xss           = require("xss");
const { logSecurity } = require("./logger");

/* ── Helpers ── */
const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || "8h";

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("FATAL: JWT_SECRET not set or too short (min 32 chars). Exiting.");
  process.exit(1);
}

/** One-way hash of IP for logging without storing raw IPs (privacy) */
function hashIp(ip) {
  return crypto.createHash("sha256").update(ip + process.env.JWT_SECRET).digest("hex").slice(0, 16);
}

/** Recursively sanitise an object's string values against XSS */
function sanitizeObject(obj) {
  if (typeof obj === "string") return xss(obj.trim());
  if (Array.isArray(obj))     return obj.map(sanitizeObject);
  if (obj && typeof obj === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) clean[k] = sanitizeObject(v);
    return clean;
  }
  return obj;
}

/* ══════════════════════════════════════════
   1. HELMET — Secure HTTP Headers
══════════════════════════════════════════ */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", "data:", "blob:"],
      connectSrc:     ["'self'"],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy:  false,   // needed for map embeds in frontend
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: {
    maxAge:            31_536_000,    // 1 year
    includeSubDomains: true,
    preload:           true,
  },
  frameguard:         { action: "deny" },
  noSniff:            true,
  xssFilter:          true,
  hidePoweredBy:      true,
});

/* ══════════════════════════════════════════
   2. CORS
══════════════════════════════════════════ */
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow server-to-server (no origin) or whitelisted origins
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logSecurity("CORS_REJECTED", { origin });
      callback(new Error("CORS: origin not allowed"));
    }
  },
  methods:     ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  maxAge:      86400,    // Cache preflight 24h
});

/* ══════════════════════════════════════════
   3. RATE LIMITER — Global (100 req/15min)
══════════════════════════════════════════ */
const globalRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: "Too many requests. Please try again later." },
  handler(req, res, next, options) {
    logSecurity("RATE_LIMIT_HIT", { ip: hashIp(req.ip), path: req.path });
    res.status(429).json(options.message);
  },
  // Skip rate limiting for static files
  skip: (req) => req.path.match(/\.(css|js|png|jpg|svg|ico|woff2?)$/),
});

/* ══════════════════════════════════════════
   4. RATE LIMITER — Auth routes (10 req/15min)
══════════════════════════════════════════ */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,   // Only count failures
  message: { success: false, message: "Too many login attempts. Locked for 15 minutes." },
  handler(req, res, next, options) {
    logSecurity("AUTH_RATE_LIMIT", { ip: hashIp(req.ip), username: req.body?.username });
    res.status(429).json(options.message);
  },
});

/* ══════════════════════════════════════════
   5. SLOW-DOWN — Contact form (progressive delay)
══════════════════════════════════════════ */
const contactSlowDown = slowDown({
  windowMs:         10 * 60 * 1000,  // 10 min
  delayAfter:       3,               // Start slowing after 3 requests
  delayMs:          (hits) => (hits - 3) * 500,  // +500ms each
  maxDelayMs:       5000,
});

/* ══════════════════════════════════════════
   6. JWT MIDDLEWARE
══════════════════════════════════════════ */
function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication required." });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
      issuer:     "csc-backend",
      audience:   "csc-admin",
    });
    req.admin = payload;
    next();
  } catch (err) {
    logSecurity("JWT_INVALID", { ip: hashIp(req.ip), error: err.message });
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Session expired. Please login again." });
    }
    return res.status(401).json({ success: false, message: "Invalid token." });
  }
}

/** Generate signed JWT for admin */
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES,
    algorithm: "HS256",
    issuer:    "csc-backend",
    audience:  "csc-admin",
  });
}

/* ══════════════════════════════════════════
   7. BODY SANITIZER MIDDLEWARE
══════════════════════════════════════════ */
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  next();
}

/* ══════════════════════════════════════════
   8. NO CACHE (admin routes)
══════════════════════════════════════════ */
function noCache(req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma",        "no-cache");
  res.setHeader("Expires",       "0");
  next();
}

/* ══════════════════════════════════════════
   9. SECURITY HEADERS FOR UPLOADS
══════════════════════════════════════════ */
function uploadHeaders(req, res, next) {
  // Prevent uploaded files from being executed as scripts
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
}

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  globalRateLimiter,
  authRateLimiter,
  contactSlowDown,
  requireAuth,
  signToken,
  sanitizeBody,
  noCache,
  uploadHeaders,
  hashIp,
};
