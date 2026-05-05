/**
 * routes/admin.js
 * Protected admin API (all routes require JWT via requireAuth):
 *  POST   /api/admin/login
 *  POST   /api/admin/logout
 *  GET    /api/admin/messages
 *  PATCH  /api/admin/messages/:id/read
 *  DELETE /api/admin/messages/:id
 *  POST   /api/admin/notices
 *  DELETE /api/admin/notices/:id
 *  POST   /api/admin/gallery
 *  DELETE /api/admin/gallery/:id
 *  POST   /api/admin/change-password
 */

const express   = require("express");
const bcrypt    = require("bcryptjs");
const path      = require("path");
const fs        = require("fs");
const { body, param, validationResult } = require("express-validator");
const {
  requireAuth, signToken, authRateLimiter, noCache, uploadHeaders, hashIp,
} = require("../middleware/security");
const { upload, processAndSaveImage, handleUploadErrors, UPLOADS_DIR } = require("../middleware/upload");
const { getDb }     = require("../db");
const { appLogger, logSecurity } = require("../middleware/logger");

const router = express.Router();

/* Apply no-cache to all admin routes */
router.use(noCache);

/* ════════════════════════════════════════
   POST /api/admin/login
════════════════════════════════════════ */
router.post(
  "/login",
  authRateLimiter,
  [
    body("username").trim().notEmpty().isLength({ max: 60 }).escape(),
    body("password").notEmpty().isLength({ max: 128 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ success: false, message: "Invalid input." });

    const { username, password } = req.body;
    const ipHash = hashIp(req.ip || "unknown");

    try {
      const db    = getDb();
      const admin = db.prepare("SELECT * FROM admins WHERE username = ? AND is_active = 1").get(username);

      // Constant-time comparison to prevent timing attacks
      const dummyHash = "$2b$12$invalidhashfortimingnormalization";
      const hashToCheck = admin ? admin.password_hash : dummyHash;
      const match = await bcrypt.compare(password, hashToCheck);

      if (!admin || !match) {
        // Log failed attempt
        db.prepare("INSERT INTO login_logs (username, ip_hash, success) VALUES (?, ?, 0)").run(username, ipHash);
        logSecurity("LOGIN_FAILED", { username, ipHash });

        // Generic message — don't reveal which field was wrong
        return res.status(401).json({ success: false, message: "Invalid username or password." });
      }

      // Successful login
      db.prepare("UPDATE admins SET last_login = datetime('now') WHERE id = ?").run(admin.id);
      db.prepare("INSERT INTO login_logs (username, ip_hash, success) VALUES (?, ?, 1)").run(username, ipHash);
      logSecurity("LOGIN_SUCCESS", { username, ipHash });

      const token = signToken({ id: admin.id, username: admin.username });
      res.json({ success: true, token, username: admin.username });
    } catch (err) {
      appLogger.error("Login error", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ════════════════════════════════════════
   POST /api/admin/logout
════════════════════════════════════════ */
router.post("/logout", requireAuth, (req, res) => {
  logSecurity("LOGOUT", { username: req.admin?.username });
  // JWT is stateless — client deletes the token.
  // For production, maintain a token blocklist in Redis.
  res.json({ success: true, message: "Logged out." });
});

/* ════════════════════════════════════════
   GET /api/admin/messages
════════════════════════════════════════ */
router.get("/messages", requireAuth, (req, res) => {
  try {
    const db    = getDb();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const rows  = db.prepare(
      `SELECT id, name, phone, service, message, status, created_at
       FROM contacts ORDER BY created_at DESC LIMIT ?`
    ).all(limit);
    const total  = db.prepare("SELECT COUNT(*) AS c FROM contacts").get().c;
    const unread = db.prepare("SELECT COUNT(*) AS c FROM contacts WHERE status = 'new'").get().c;
    res.json({ success: true, data: rows, total, unread });
  } catch (err) {
    appLogger.error("GET /admin/messages error", { error: err.message });
    res.status(500).json({ success: false, message: "Server error." });
  }
});

/* ════════════════════════════════════════
   PATCH /api/admin/messages/:id/read
════════════════════════════════════════ */
router.patch(
  "/messages/:id/read",
  requireAuth,
  [param("id").isInt({ min: 1 }).toInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Invalid ID." });
    try {
      const db = getDb();
      const r  = db.prepare("UPDATE contacts SET status = 'read' WHERE id = ?").run(req.params.id);
      if (!r.changes) return res.status(404).json({ success: false, message: "Not found." });
      res.json({ success: true });
    } catch (err) {
      appLogger.error("PATCH /messages/:id/read", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ════════════════════════════════════════
   DELETE /api/admin/messages/:id
════════════════════════════════════════ */
router.delete(
  "/messages/:id",
  requireAuth,
  [param("id").isInt({ min: 1 }).toInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Invalid ID." });
    try {
      const db = getDb();
      const r  = db.prepare("DELETE FROM contacts WHERE id = ?").run(req.params.id);
      if (!r.changes) return res.status(404).json({ success: false, message: "Not found." });
      logSecurity("MSG_DELETED", { admin: req.admin.username, msgId: req.params.id });
      res.json({ success: true });
    } catch (err) {
      appLogger.error("DELETE /messages/:id", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ════════════════════════════════════════
   POST /api/admin/notices
════════════════════════════════════════ */
router.post(
  "/notices",
  requireAuth,
  [
    body("title").trim().notEmpty().isLength({ max: 200 }).escape(),
    body("title_mr").trim().notEmpty().isLength({ max: 200 }),
    body("body").optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
    body("type").isIn(["normal","new","urgent"]),
    body("date").isISO8601().toDate(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ success: false, message: errors.array()[0].msg });
    try {
      const { title, title_mr, body: noticeBody, type, date } = req.body;
      const db = getDb();
      const r  = db.prepare(
        `INSERT INTO notices (title, title_mr, body, type, date) VALUES (?, ?, ?, ?, ?)`
      ).run(title, title_mr, noticeBody || null, type, date.toISOString().split("T")[0]);
      res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) {
      appLogger.error("POST /admin/notices", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ════════════════════════════════════════
   DELETE /api/admin/notices/:id
════════════════════════════════════════ */
router.delete(
  "/notices/:id",
  requireAuth,
  [param("id").isInt({ min: 1 }).toInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Invalid ID." });
    try {
      const db = getDb();
      // Soft-delete (keep audit trail)
      const r  = db.prepare("UPDATE notices SET is_active = 0 WHERE id = ?").run(req.params.id);
      if (!r.changes) return res.status(404).json({ success: false, message: "Not found." });
      res.json({ success: true });
    } catch (err) {
      appLogger.error("DELETE /notices/:id", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ════════════════════════════════════════
   POST /api/admin/gallery  (photo upload)
════════════════════════════════════════ */
router.post(
  "/gallery",
  requireAuth,
  upload.single("photo"),
  handleUploadErrors,
  processAndSaveImage,
  [body("caption").optional({ checkFalsy: true }).trim().isLength({ max: 200 })],
  (req, res) => {
    if (!req.file?.savedFilename)
      return res.status(400).json({ success: false, message: "No valid image uploaded." });

    const caption = (req.body.caption || "").slice(0, 200);
    try {
      const db = getDb();
      const r  = db.prepare("INSERT INTO gallery (filename, caption) VALUES (?, ?)").run(
        req.file.savedFilename, caption || null
      );
      res.status(201).json({ success: true, id: r.lastInsertRowid, filename: req.file.savedFilename });
    } catch (err) {
      appLogger.error("POST /admin/gallery", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ════════════════════════════════════════
   DELETE /api/admin/gallery/:id
════════════════════════════════════════ */
router.delete(
  "/gallery/:id",
  requireAuth,
  [param("id").isInt({ min: 1 }).toInt()],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: "Invalid ID." });
    try {
      const db   = getDb();
      const row  = db.prepare("SELECT filename FROM gallery WHERE id = ?").get(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: "Not found." });

      // Delete file from disk
      const filePath = path.join(UPLOADS_DIR, row.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      // Hard-delete gallery record (it's just a photo)
      db.prepare("DELETE FROM gallery WHERE id = ?").run(req.params.id);
      logSecurity("PHOTO_DELETED", { admin: req.admin.username, file: row.filename });
      res.json({ success: true });
    } catch (err) {
      appLogger.error("DELETE /gallery/:id", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

/* ════════════════════════════════════════
   POST /api/admin/change-password
════════════════════════════════════════ */
const PASS_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]).{8,128}$/;

router.post(
  "/change-password",
  requireAuth,
  [
    body("currentPassword").notEmpty(),
    body("newPassword")
      .isLength({ min: 8, max: 128 })
      .matches(PASS_REGEX)
      .withMessage("Password must have uppercase, lowercase, number and symbol (min 8 chars)."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(422).json({ success: false, message: errors.array()[0].msg });

    const { currentPassword, newPassword } = req.body;
    try {
      const db    = getDb();
      const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.admin.id);
      if (!admin) return res.status(404).json({ success: false, message: "Admin not found." });

      const match = await bcrypt.compare(currentPassword, admin.password_hash);
      if (!match) {
        logSecurity("PASS_CHANGE_FAILED", { username: admin.username });
        return res.status(401).json({ success: false, message: "Current password is incorrect." });
      }

      // Prevent reuse of same password
      const same = await bcrypt.compare(newPassword, admin.password_hash);
      if (same)
        return res.status(400).json({ success: false, message: "New password must be different from current." });

      const newHash = await bcrypt.hash(newPassword, 12);
      db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(newHash, admin.id);
      logSecurity("PASS_CHANGED", { username: admin.username });
      res.json({ success: true, message: "Password changed. Please login again." });
    } catch (err) {
      appLogger.error("POST /change-password", { error: err.message });
      res.status(500).json({ success: false, message: "Server error." });
    }
  }
);

module.exports = router;
