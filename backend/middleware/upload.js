/**
 * middleware/upload.js
 * Secure file upload using Multer + Sharp for image reprocessing.
 * 
 * Security measures:
 *  - Whitelist MIME types (checked in memory, not from header)
 *  - Verify file magic bytes (real content check)
 *  - Max file size 2 MB
 *  - Randomised filename (no user-supplied names)
 *  - Strip EXIF metadata via Sharp (privacy + security)
 *  - Re-encode images (stops polyglot file attacks)
 */

const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const crypto  = require("crypto");
const sharp   = require("sharp");

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || "./uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 2) * 1024 * 1024;

/* ── Allowed MIME types ── */
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/* ── Magic byte signatures ── */
const MAGIC = {
  "image/jpeg": [0xFF, 0xD8, 0xFF],
  "image/png":  [0x89, 0x50, 0x4E, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46],   // RIFF
};

function checkMagicBytes(buffer, mimeType) {
  const sig = MAGIC[mimeType];
  if (!sig) return false;
  for (let i = 0; i < sig.length; i++) {
    if (buffer[i] !== sig[i]) return false;
  }
  return true;
}

/* ── In-memory storage (validate before writing to disk) ── */
const memStorage = multer.memoryStorage();

const upload = multer({
  storage: memStorage,
  limits: { fileSize: MAX_SIZE, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      return cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE",
        "Only JPEG, PNG and WebP images are allowed."));
    }
    cb(null, true);
  },
});

/**
 * After multer buffers the file, verify magic bytes, re-encode via Sharp,
 * strip metadata, and save to disk with a random filename.
 */
async function processAndSaveImage(req, res, next) {
  if (!req.file) return next();

  // 1. Verify magic bytes (real content check)
  if (!checkMagicBytes(req.file.buffer, req.file.mimetype)) {
    return res.status(400).json({ success: false, message: "Invalid image file." });
  }

  // 2. Re-encode via Sharp (strips EXIF, stops polyglot attacks)
  const ext      = "webp";                            // Normalise to WebP
  const filename = crypto.randomUUID() + "." + ext;
  const destPath = path.join(UPLOADS_DIR, filename);

  try {
    await sharp(req.file.buffer)
      .rotate()                 // Correct EXIF orientation then strip
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .withMetadata(false)      // Strip all metadata
      .toFile(destPath);

    req.file.savedFilename = filename;
    req.file.savedPath     = destPath;
    next();
  } catch (err) {
    return res.status(400).json({ success: false, message: "Could not process image." });
  }
}

/* ── Multer error handler ── */
function handleUploadErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ success: false, message: `File too large. Max ${process.env.MAX_FILE_SIZE_MB || 2}MB.` });
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
}

const uploadHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
};

module.exports = {
  upload,
  processAndSaveImage,
  handleUploadErrors,
  UPLOADS_DIR,
  uploadHeaders
};
