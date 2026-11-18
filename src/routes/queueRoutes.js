const express = require('express');
const prisma = require('../prisma');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { listQueue, updateQueueStatus } = require('../controllers/queueController');
const router = express.Router();
router.use(authenticateToken, authorizeRoles('ADMIN', 'DOCTOR_STAFF'));
// Recheck current role so a revoked/stale JWT cannot read patient queues.
router.use(async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    if (!user || !['ADMIN', 'DOCTOR_STAFF'].includes(user.role)) {
      return res.status(403).json({ message: 'เฉพาะแพทย์ เจ้าหน้าที่ และผู้ดูแลระบบเท่านั้น' });
    }
    next();
  } catch { return res.status(503).json({ message: 'ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองใหม่' }); }
});
router.get('/', listQueue);
router.patch('/:id/status', authorizeRoles('DOCTOR_STAFF'), updateQueueStatus);
module.exports = router;
