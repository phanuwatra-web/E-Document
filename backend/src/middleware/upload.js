const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const { v4: uuidv4 } = require('uuid');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, _file, cb) => cb(null, `${uuidv4()}-${Date.now()}.pdf`),
});

// Multer (per RFC 7578) reads the multipart filename header as latin1, so any
// non-ASCII filename (Thai, Chinese, accents…) comes back as mojibake bytes.
// Re-decode as UTF-8 so the original name survives into the database / UI.
const fixFilenameEncoding = (raw) => {
  if (!raw) return raw;
  try {
    return Buffer.from(raw, 'latin1').toString('utf8');
  } catch {
    return raw;
  }
};

const fileFilter = (_req, file, cb) => {
  // Patch the originalname BEFORE handing it to controller code or storage.
  file.originalname = fixFilenameEncoding(file.originalname);

  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});
