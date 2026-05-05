/**
 * db/index.js
 * Singleton SQLite connection used throughout the app.
 */

const path     = require("path");
const Database = require("better-sqlite3");

const DB_PATH = path.resolve(process.env.DB_PATH || "./db/csc.db");

let _db;
function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    _db.pragma("foreign_keys = ON");
    // Auto-vacuum to keep file size small
    _db.pragma("auto_vacuum = INCREMENTAL");
  }
  return _db;
}

module.exports = { getDb };
