const prisma = require('../prisma');
const { clinicDate, dateRange } = require('./queueController');
const DISPLAY = { confirmed: 'waiting', in_progress: 'in_progress', completed: 'completed' };
function positiveInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number(value) <= maximum ? Number(value) : null;
}

// The authenticated account is the ONLY source of patient identity.
async function listPatientQueue(req, res) {
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  const { scope = 'active' } = req.query;
  const page = positiveInteger(req.query.page, 1, 1000000);
  const limit = positiveInteger(req.query.limit, 10, 20);
  if (!page || !limit || !['active', 'all'].includes(scope) ||
      Object.keys(req.query).some(key => !['scope', 'page', 'limit'].includes(key))) {
    return res.status(400).json({ code: 'INVALID_FILTER', message: 'ตัวกรองไม่ถูกต้อง รองรับเฉพาะ scope, page และ limit' });
  }
  try {
    const today = clinicDate();
    const where = { patientId: req.user.id };
    if (scope === 'active') {
      where.status = { in: ['pending', 'confirmed', 'in_progress', 'completed'] };
      where.appointmentDate = { gte: dateRange(today).gte };
    }
    const result = await prisma.$transaction(async tx => {
      const total = await tx.appointment.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const actualPage = Math.min(page, totalPages);
      const appointments = await tx.appointment.findMany({
        where, skip: (actualPage - 1) * limit, take: limit,
        orderBy: [{ appointmentDate: scope === 'active' ? 'asc' : 'desc' }, { id: 'asc' }],
        select: { id: true, doctorId: true, appointmentDate: true, status: true,
          doctor: { select: { docName: true, department: true } } },
      });
      const numbers = new Map();
      const dailyQueues = new Map();
      const days = [...new Set(appointments.filter(item => DISPLAY[item.status]).map(item => clinicDate(item.appointmentDate)))];
      for (const day of days) {
        // Staff assigns numbers to ALL appointments of the day before filtering.
        // Read minimal queue metadata for numbering and same-doctor comparison; no patient identities.
        const dailyIds = await tx.appointment.findMany({
          where: { appointmentDate: dateRange(day) },
          select: { id: true, doctorId: true, appointmentDate: true, status: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        dailyIds.forEach((item, index) => numbers.set(item.id, `A${String(index + 1).padStart(3, '0')}`));
        dailyQueues.set(day, dailyIds);
      }
      function comparison(item) {
        const day = clinicDate(item.appointmentDate);
        if (day !== today || !['confirmed', 'in_progress'].includes(item.status)) return null;
        const sameDoctor = (dailyQueues.get(day) || []).filter(row => row.doctorId === item.doctorId);
        return {
          currentQueueNumbers: sameDoctor.filter(row => row.status === 'in_progress')
            .sort((a, b) => a.appointmentDate - b.appointmentDate || a.id.localeCompare(b.id))
            .map(row => numbers.get(row.id)),
          // Count waiting records only, in staff display order; queue numbers may have gaps.
          waitingBefore: item.status === 'confirmed' ? sameDoctor.filter(row => row.status === 'confirmed' &&
            (row.appointmentDate < item.appointmentDate ||
             (+row.appointmentDate === +item.appointmentDate && row.id.localeCompare(item.id) < 0))).length : null,
        };
      }
      return {
        ownAppointments: appointments.map(item => ({
          appointmentId: item.id, appointmentDate: item.appointmentDate,
          appointmentStatus: item.status, queueStatus: DISPLAY[item.status] || null,
          queueNumber: DISPLAY[item.status] ? numbers.get(item.id) : null,
          doctor: { docName: item.doctor.docName, department: item.doctor.department },
          comparison: comparison(item),
        })),
        pagination: { page: actualPage, limit, total, totalPages },
      };
    }, { isolationLevel: 'RepeatableRead' });
    return res.json({ ...result, scope, today, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Patient queue read failed:', error.code || error.name);
    return res.status(503).json({ code: 'QUEUE_UNAVAILABLE', message: 'โหลดสถานะคิวไม่สำเร็จ กรุณาลองใหม่ ข้อมูลเดิมอาจยังไม่ใช่สถานะล่าสุด' });
  }
}
module.exports = { listPatientQueue };
