const router = require('express').Router();
const { signDocument, unsignDocument, updateSignaturePosition, getMySignature, getDocumentSignatures } = require('../controllers/signature.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.post('/',                      authenticate,               signDocument);
router.delete('/me/:documentId',      authenticate,               unsignDocument);
router.patch('/me/:documentId',       authenticate,               updateSignaturePosition);
router.get('/me/:documentId',         authenticate,               getMySignature);
router.get('/document/:documentId',   authenticate, requireAdmin, getDocumentSignatures);

module.exports = router;
