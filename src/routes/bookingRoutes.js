const express = require('express');
const router = express.Router();
const { getAvailability, createBooking } = require('../controllers/bookingController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

// Public: ค้นหาช่วงเวลาที่ว่างสำหรับแพทย์และบริการที่เลือก
router.get('/availability', getAvailability);

// Patient: บันทึกคำขอนัดหมายจริงลง Neon โดยใช้ patientId จาก JWT
router.post('/', authenticateToken, authorizeRoles('PATIENT'), createBooking);

module.exports = router;
