const express = require('express');
const router = express.Router();
const {
  getScreeningRules,
  createScreening,
  getMyScreenings,
} = require('../controllers/screeningController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Public: ดูรายการคำถามคัดกรองอาการทั้งหมด
router.get('/rules', getScreeningRules);

// Patient Only: ส่งแบบฟอร์มคัดกรองอาการ และดูประวัติย้อนหลังของตนเอง
router.post('/', authenticateToken, authorizeRoles('PATIENT'), createScreening);
router.get('/history', authenticateToken, authorizeRoles('PATIENT'), getMyScreenings);

module.exports = router;