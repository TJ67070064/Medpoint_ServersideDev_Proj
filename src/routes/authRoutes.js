const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  createStaffAccount,
  getAllUsers,
} = require('../controllers/authController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Public
router.post('/register', register);
router.post('/login', login);

// Authenticated
router.get('/me', authenticateToken, getMe);

// Admin Only (ตรวจสอบและออกบัญชีให้แพทย์ / เจ้าหน้าที่ / Admin)
router.get('/users', authenticateToken, authorizeRoles('ADMIN'), getAllUsers);
router.post('/users', authenticateToken, authorizeRoles('ADMIN'), createStaffAccount);

module.exports = router;