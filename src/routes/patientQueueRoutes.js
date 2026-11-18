const express = require('express');
const prisma = require('../prisma');
const { authenticateToken } = require('../middlewares/authMiddleware');
const { listPatientQueue } = require('../controllers/patientQueueController');
const router = express.Router();

router.use((req, res, next) => { res.set('Cache-Control', 'private, no-store'); res.vary('Authorization'); next(); });
router.use(authenticateToken);
// The current database role is authoritative, including when an old JWT still contains another role.
router.use(async (req, res, next) => {
  if (typeof req.user?.id !== 'string' || !req.user.id || req.user.id.length > 100) {
    return res.status(401).json({ code: 'INVALID_SESSION', message: 'ข้อมูลเซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบอีกครั้ง' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { role: true } });
    if (!user) return res.status(401).json({ code: 'SESSION_GONE', message: 'ไม่พบบัญชีผู้ใช้ กรุณาเข้าสู่ระบบอีกครั้ง' });
    if (user.role !== 'PATIENT') {
      return res.status(403).json({ code: 'PATIENT_ONLY', message: 'หน้านี้สำหรับบัญชีผู้ป่วย แพทย์และเจ้าหน้าที่ใช้หน้าจัดการคิวตรวจ' });
    }
    return next();
  } catch {
    return res.status(503).json({ code: 'AUTH_UNAVAILABLE', message: 'ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่' });
  }
});
router.get('/', listPatientQueue);
router.all('/', (req, res) => res.set('Allow', 'GET, HEAD').status(405).json({ message: 'หน้าคนไข้ดูคิวได้อย่างเดียว ไม่สามารถแก้สถานะคิว' }));

module.exports = router;
