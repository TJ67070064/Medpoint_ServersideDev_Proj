const express = require('express');
const router = express.Router();
const {
  getAllServices,
  createService,
  updateService,
  deleteService,
} = require('../controllers/serviceController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Public: ทุกคนดูรายการบริการได้
router.get('/', getAllServices);

// Admin Only: เพิ่ม แก้ไข และ Soft Delete บริการ
router.post('/', authenticateToken, authorizeRoles('ADMIN'), createService);
router.patch('/:id', authenticateToken, authorizeRoles('ADMIN'), updateService);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), deleteService);

module.exports = router;