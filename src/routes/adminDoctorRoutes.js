const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const controller = require('../controllers/adminDoctorController');

// All endpoints require a valid ADMIN token; the page's role check alone is not security.
router.use(authenticateToken, authorizeRoles('ADMIN'));
router.get('/doctors', controller.listDoctors);
router.post('/doctors', controller.createDoctor);
router.patch('/doctors/:id', controller.updateDoctor);
router.get('/schedules', controller.listSchedules);
router.post('/schedules', controller.createSchedule);
router.patch('/schedules/:id', controller.updateSchedule);
router.delete('/schedules/:id', controller.deleteSchedule);
module.exports = router;
