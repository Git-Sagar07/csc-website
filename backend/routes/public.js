/**
 * routes/public.js
 * Public (unauthenticated) API endpoints:
 *  GET  /api/notices           — fetch active notices
 *  POST /api/contact           — submit contact form
 *  GET  /api/gallery           — fetch gallery photos
 *  GET  /api/health            — health check
 */

const express   = require("express");
const { body, validationResult, param, query } = require("express-validator");
const { contactSlowDown, hashIp } = require("../middleware/security");
const { getDb }  = require("../db");
const { logSecurity, appLogger } = require("../middleware/logger");

const router = express.Router();

/* ════════════════════════════════════════
   GET /api/health
════════════════════════════════════════ */
router.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/* ════════════════════════════════════════
   GET /api/notices
════════════════════════════════════════ */
router.get(
  "/notices",
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 20 })
      .toInt()
      .withMessage("limit must be 1–20"),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, errors: errors.array() });

    const limit = req.query.limit || 10;
    try {
      const db   = getDb();
      const rows = db
        .prepare(
          `SELECT id, title, title_mr, body, type, date
           FROM   notices
           WHERE  is_active = 1
           ORDER  BY date DESC, id DESC
           LIMIT  ?`
        )
        .all(limit);
      res.json({ success: true, data: rows });
    } catch (err) {
      appLogger.error("GET /notices error", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ════════════════════════════════════════
   GET /api/gallery
════════════════════════════════════════ */
router.get("/gallery", (req, res) => {
  try {
    const db   = getDb();
    const rows = db
      .prepare("SELECT id, filename, caption FROM gallery WHERE is_active = 1 ORDER BY id DESC")
      .all();
    res.json({ success: true, data: rows });
  } catch (err) {
    appLogger.error("GET /gallery error", { error: err.message });
    res.status(500).json({ success: false, message: "Server error." });
  }
});

/* ════════════════════════════════════════
   POST /api/contact
════════════════════════════════════════ */
const contactValidators = [
  body("name")
    .trim()
    .notEmpty().withMessage("नाव आवश्यक आहे.")
    .isLength({ min: 2, max: 100 }).withMessage("नाव 2–100 अक्षरांचे असावे.")
    .matches(/^[\p{L}\p{M}\s.'-]+$/u).withMessage("नाव अवैध आहे."),

  body("phone")
    .trim()
    .notEmpty().withMessage("मोबाईल नंबर आवश्यक आहे.")
    .matches(/^[6-9]\d{9}$/).withMessage("वैध भारतीय मोबाईल नंबर द्या (10 अंक)."),

  body("service")
    .optional({ checkFalsy: true })
    .isIn(["aadhaar","pan","passport","voter","banking","pmkisan","scholarship","bills","other",""])
    .withMessage("अवैध सेवा निवड."),

  body("message")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 }).withMessage("संदेश 1000 अक्षरांपेक्षा कमी असावा."),
];

router.post(
  "/contact",
  contactSlowDown,
  contactValidators,
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: errors.array()[0].msg,
        errors:  errors.array(),
      });
    }

    const { name, phone, service, message } = req.body;
    const ipHash = hashIp(req.ip || req.socket.remoteAddress || "unknown");

    try {
      // Duplicate submission guard — same phone within 1 hour
      const db   = getDb();
      const recent = db
        .prepare(
          `SELECT id FROM contacts
           WHERE phone = ? AND created_at > datetime('now', '-1 hour')`
        )
        .get(phone);

      if (recent) {
        logSecurity("CONTACT_DUPLICATE", { ipHash, phone: phone.slice(-4) });
        // Return success (don't leak throttle state to potential spammers)
        return res.json({ success: true, message: "संदेश नोंद झाला आहे. आम्ही लवकरच संपर्क करू." });
      }

      db.prepare(
        `INSERT INTO contacts (name, phone, service, message, ip_hash)
         VALUES (?, ?, ?, ?, ?)`
      ).run(name, phone, service || null, message || null, ipHash);

      appLogger.info("New contact submission", { phone: phone.slice(-4), service });
      res.json({ success: true, message: "✅ संदेश पाठवला! आम्ही लवकरच संपर्क करू." });
    } catch (err) {
      appLogger.error("POST /contact error", { error: err.message });
      res.status(500).json({ success: false, message: "Server error. Please try WhatsApp." });
    }
  }
);

module.exports = router;
