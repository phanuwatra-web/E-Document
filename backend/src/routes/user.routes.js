const router = require('express').Router();
const {
  getUsers, getDepartments, createUser, toggleUserStatus, deleteUser,
  updateUser, resetUserPassword,
} = require('../controllers/user.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/departments',          authenticate,               getDepartments);
router.get('/',                     authenticate, requireAdmin, getUsers);
router.post('/',                    authenticate, requireAdmin, createUser);
router.patch('/:id',                authenticate, requireAdmin, updateUser);
router.patch('/:id/toggle',         authenticate, requireAdmin, toggleUserStatus);
router.post('/:id/reset-password',  authenticate, requireAdmin, resetUserPassword);
router.delete('/:id',               authenticate, requireAdmin, deleteUser);

module.exports = router;
