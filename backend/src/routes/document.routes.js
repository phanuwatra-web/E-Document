const router = require('express').Router();
const {
  uploadDocument, getDocuments, getDocument,
  getDocumentFile, getDocumentStatus, deleteDocument,
} = require('../controllers/document.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/',         authenticate,               getDocuments);
router.get('/:id',      authenticate,               getDocument);
router.get('/:id/file', authenticate,               getDocumentFile);
router.get('/:id/status', authenticate, requireAdmin, getDocumentStatus);
router.post('/',        authenticate, requireAdmin, upload.single('file'), uploadDocument);
router.delete('/:id',   authenticate, requireAdmin, deleteDocument);

module.exports = router;
