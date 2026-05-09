const router = require('express').Router();
const { getMyNotifications } = require('../controllers/notification.controller');
const { authenticate } = require('../middleware/auth');

router.get('/me', authenticate, getMyNotifications);

module.exports = router;
