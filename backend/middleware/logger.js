/**
 * middleware/logger.js
 * Structured logging with Winston.
 * Keeps separate security.log for auth events.
 */

const winston = require("winston");
const path    = require("path");
const fs      = require("fs");

const LOG_DIR = process.env.LOG_DIR || "./logs";
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const fmt = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const appLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: fmt,
  transports: [
    new winston.transports.File({ filename: path.join(LOG_DIR, "error.log"),  level: "error", maxsize: 5_242_880, maxFiles: 5 }),
    new winston.transports.File({ filename: path.join(LOG_DIR, "combined.log"), maxsize: 10_485_760, maxFiles: 5 }),
  ],
});

const securityLogger = winston.createLogger({
  level: "info",
  format: fmt,
  transports: [
    new winston.transports.File({ filename: path.join(LOG_DIR, "security.log"), maxsize: 5_242_760, maxFiles: 10 }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  appLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }));
}

/** Log security-relevant events (auth, access, anomalies) */
function logSecurity(event, details = {}) {
  securityLogger.info({ event, ...details });
}

module.exports = { appLogger, logSecurity };
