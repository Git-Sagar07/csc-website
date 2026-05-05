/**
 * db/create-admin.js
 * Run ONCE after setup:  node db/create-admin.js
 * Creates the initial admin user with bcrypt hashed password.
 */

require("dotenv").config({ path: "../.env" });
const bcrypt   = require("bcryptjs");
const Database = require("better-sqlite3");

const DB_PATH  = process.env.DB_PATH || "./csc.db";
const USERNAME = process.env.INITIAL_ADMIN_USER || "admin";
const PASSWORD = process.env.INITIAL_ADMIN_PASS;

if (!PASSWORD || PASSWORD === "ChangeMe@2025!") {
  console.error("❌ Please set INITIAL_ADMIN_PASS in .env to a strong, unique password!");
  console.error("   Must be at least 12 chars with uppercase, number, and symbol.");
  process.exit(1);
}

// Password strength check
const strong = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]).{12,}$/;
if (!strong.test(PASSWORD)) {
  console.error("❌ Weak password! Must have uppercase, lowercase, number, symbol, ≥12 chars.");
  process.exit(1);
}

(async () => {
  const db   = new Database(DB_PATH);
  const hash = await bcrypt.hash(PASSWORD, 12);

  const existing = db.prepare("SELECT id FROM admins WHERE username = ?").get(USERNAME);
  if (existing) {
    db.prepare("UPDATE admins SET password_hash = ? WHERE username = ?").run(hash, USERNAME);
    console.log(`✅ Password updated for admin: "${USERNAME}"`);
  } else {
    db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(USERNAME, hash);
    console.log(`✅ Admin created: "${USERNAME}"`);
  }

  console.log("⚠️  IMPORTANT: Remove INITIAL_ADMIN_USER and INITIAL_ADMIN_PASS from .env now!");
  db.close();
})();
