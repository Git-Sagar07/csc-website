/**
 * db/setup.js
 * Run once:  node db/setup.js
 * Creates all SQLite tables with proper constraints.
 */

require("dotenv").config({ path: "../.env" });
const path   = require("path");
const fs     = require("fs");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || "./csc.db";
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Create Tables ──
db.exec(`
  -- Admin users
  CREATE TABLE IF NOT EXISTS admins (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT   NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login   TEXT,
    is_active    INTEGER NOT NULL DEFAULT 1
  );

  -- Contact form submissions
  CREATE TABLE IF NOT EXISTS contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    phone      TEXT NOT NULL,
    service    TEXT,
    message    TEXT,
    ip_hash    TEXT,
    status     TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','read','replied')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Notice board entries
  CREATE TABLE IF NOT EXISTS notices (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL,
    title_mr TEXT NOT NULL,
    body     TEXT,
    type     TEXT NOT NULL DEFAULT 'normal' CHECK(type IN ('normal','new','urgent')),
    date     TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Gallery photos
  CREATE TABLE IF NOT EXISTS gallery (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT NOT NULL UNIQUE,
    caption    TEXT,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Login attempt log (for audit trail)
  CREATE TABLE IF NOT EXISTS login_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT,
    ip_hash    TEXT,
    success    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- Indexes for common queries
  CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
  CREATE INDEX IF NOT EXISTS idx_contacts_created ON contacts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notices_active  ON notices(is_active, date DESC);
  CREATE INDEX IF NOT EXISTS idx_gallery_active  ON gallery(is_active);
`);

console.log("✅ Database tables created at:", DB_PATH);
db.close();
