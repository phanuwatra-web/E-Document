const router = require('express').Router();
const {
  login, loginValidation, getMe, getCsrfToken, logout, changePassword,
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

// Public: bootstrap a CSRF token before the first POST (login form).
router.get('/csrf-token', getCsrfToken);

// Public: login (CSRF-exempt — see middleware/csrf.js EXEMPT_PATHS).
router.post('/login', loginValidation, login);

// Authenticated.
router.get('/me',               authenticate, getMe);
router.post('/logout',          authenticate, logout);
router.post('/change-password', authenticate, changePassword);

module.exports = router;
