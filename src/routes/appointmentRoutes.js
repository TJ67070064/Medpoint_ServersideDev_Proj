const express = require('express');
const router = express.Router();
const { getMyAppointments, cancelMyAppointment } = require('../controllers/appointmentController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Patient: ดูเฉพาะรายการของตัวเอง ไม่รับ patientId จาก client
router.get('/my', authenticateToken, authorizeRoles('PATIENT'), getMyAppointments);

// Patient: ยกเลิกนัดหมายของตนเอง (soft cancel)
router.patch('/:id/cancel', authenticateToken, authorizeRoles('PATIENT'), cancelMyAppointment);

module.exports = router;
