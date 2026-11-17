const prisma = require('../prisma');


function getLinkedDoctorId(req) {
  if (req.user?.role !== 'DOCTOR_STAFF') {
    return null;
  }

  let doctorMap;

  try {
    doctorMap = JSON.parse(process.env.DOCTOR_USER_MAP || '{}');
  } catch {
    return null;
  }

  if (!doctorMap || typeof doctorMap !== 'object' ||
    Array.isArray(doctorMap)) {
    return null;
  }

  const doctorId = doctorMap[req.user.id];

  return typeof doctorId === 'string' && doctorId.trim()
    ? doctorId
    : null;
}


const DISPLAY = { confirmed: 'waiting', in_progress: 'in_progress', completed: 'completed' };
const APPOINTMENT_SELECT = {
  id: true, appointmentDate: true, createdAt: true, status: true,
  patient: { select: { id: true, full_name: true } },
  doctor: { select: { id: true, docName: true, department: true } },
  service: { select: { id: true, serviceName: true } },
};
const clinicDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

function dateRange(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime()) || clinicDate(start) !== value) return null;
  return { gte: start, lt: new Date(start.getTime() + 86400000) };
}

function positiveInt(value, fallback, max) {
  if (value === undefined) return fallback;
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number(value) <= max
    ? Number(value) : null;
}

async function listQueue(req, res) {
  const date = req.query.date === undefined ? clinicDate() : req.query.date;
  const range = dateRange(date);
  const page = positiveInt(req.query.page, 1, 1000000);
  const limit = positiveInt(req.query.limit, 5, 50);
  const { status, q, doctorId, department } = req.query;
  const isDoctor = req.user.role === 'DOCTOR_STAFF';
  const linkedDoctorId = isDoctor ? getLinkedDoctorId(req) : null;

  if (isDoctor && !linkedDoctorId) {
    return res.status(403).json({
      message: 'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลแพทย์'
    });
  }

  const effectiveDoctorId = isDoctor ? linkedDoctorId : doctorId;

  if (!range || !page || !limit || Object.keys(req.query).some(k => !['date', 'page', 'limit', 'status', 'q', 'doctorId', 'department'].includes(k)) ||
    [q, doctorId, department].some(v => v !== undefined && (typeof v !== 'string' || v.length > 200)) ||
    (status !== undefined && !['all', 'waiting', 'in_progress', 'completed'].includes(status))) {
    return res.status(400).json({ message: 'ตัวกรองไม่ถูกต้อง กรุณาระบุวันที่ YYYY-MM-DD และเลขหน้าที่ถูกต้อง' });
  }
  try {
    const [appointments, doctors] = await prisma.$transaction([
      prisma.appointment.findMany({
        where: { appointmentDate: range }, select: APPOINTMENT_SELECT,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      prisma.doctor.findMany({ select: { id: true, docName: true, department: true }, orderBy: { docName: 'asc' } }),
    ]);
    // Display numbers include all daily appointments before filters. Database IDs remain authoritative.
    const rows = appointments.map((a, i) => ({
      ...a, queueNumber: `A${String(i + 1).padStart(3, '0')}`, queueStatus: DISPLAY[a.status] || null,
    }));
    const scoped = rows.filter(a => (!effectiveDoctorId || a.doctor.id === effectiveDoctorId) &&
      (!department || a.doctor.department === department));
    const eligible = scoped.filter(a => a.queueStatus);
    const counts = { all: eligible.length, waiting: 0, in_progress: 0, completed: 0 };
    eligible.forEach(a => counts[a.queueStatus]++);
    const search = (q || '').trim().toLocaleLowerCase('th');
    const filtered = eligible.filter(a => (!status || status === 'all' || a.queueStatus === status) &&
      (!search || [a.queueNumber, a.id, a.patient.full_name, a.doctor.docName]
        .some(v => v.toLocaleLowerCase('th').includes(search))));
    filtered.sort((a, b) => a.appointmentDate - b.appointmentDate || a.id.localeCompare(b.id));
    const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
    const actualPage = Math.min(page, totalPages);
    const focusDoctorId = effectiveDoctorId || eligible.find(a => a.queueStatus === 'in_progress')?.doctor.id ||
      eligible.find(a => a.queueStatus === 'waiting')?.doctor.id || '';
    const focused = eligible.filter(a => a.doctor.id === focusDoctorId)
      .sort((a, b) => a.appointmentDate - b.appointmentDate || a.id.localeCompare(b.id));
    res.set('Cache-Control', 'no-store');
    return res.json({
      date, today: clinicDate(), updatedAt: new Date().toISOString(),
      items: filtered.slice((actualPage - 1) * limit, actualPage * limit), counts,
      pendingCount: scoped.filter(a => a.status === 'pending').length,
      pendingItems: scoped
        .filter(a => a.status === 'pending')
        .sort((a, b) =>
          a.appointmentDate - b.appointmentDate ||
          a.id.localeCompare(b.id)
        )
        .slice(0, 50),
      busyDoctorIds: [...new Set(scoped.filter(a => a.status === 'in_progress').map(a => a.doctor.id))],
      pagination: { page: actualPage, limit, total: filtered.length, totalPages },
      doctors: isDoctor
        ? doctors.filter(d => d.id === linkedDoctorId)
        : doctors,
      focusDoctor: doctors.find(d => d.id === focusDoctorId) || null,
      current: focused.find(a => a.queueStatus === 'in_progress') || null,
      next: focused.find(a => a.queueStatus === 'waiting') || null,
    });
  } catch (error) {
    console.error('Queue list failed:', error.code || error.name);
    return res.status(503).json({ message: 'โหลดข้อมูลคิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
  }
}

class QueueError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function updateQueueStatus(req, res) {
  const linkedDoctorId = getLinkedDoctorId(req);
  if (!linkedDoctorId) {
    return res.status(403).json({
      message: 'บัญชีนี้ยังไม่ได้ผูกกับข้อมูลแพทย์'
    });
  }
  const target = req.body?.status;
  if (!['confirmed', 'in_progress', 'completed'].includes(target) ||
    typeof req.params.id !== 'string' || req.params.id.length > 100) {
    return res.status(400).json({
      message: 'สถานะที่ส่งได้คือ confirmed, in_progress หรือ completed เท่านั้น'
    });

  }
  try {
    const found = await prisma.appointment.findUnique({ where: { id: req.params.id }, select: { doctorId: true } });
    if (!found) throw new QueueError(404, 'ไม่พบนัดหมายนี้');
    if (found.doctorId !== linkedDoctorId) {
      throw new QueueError(
        403,
        'คุณไม่มีสิทธิ์เปลี่ยนสถานะคิวของแพทย์ท่านอื่น'
      );
    }
    const item = await prisma.$transaction(async tx => {
      // A transaction-scoped PostgreSQL lock works across server processes without schema changes.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${found.doctorId}))::text`;
      const current = await tx.appointment.findUnique({ where: { id: req.params.id }, select: APPOINTMENT_SELECT });
      if (!current) throw new QueueError(404, 'ไม่พบนัดหมายนี้');
      if (current.doctor.id !== found.doctorId) throw new QueueError(409, 'แพทย์ของนัดหมายเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่');
      if (target === 'confirmed') {
        if (current.appointmentDate < new Date()) {
          throw new QueueError(
            409,
            'ไม่สามารถยืนยันนัดหมายที่เลยเวลาแล้ว'
          );
        }
      } else if (clinicDate(current.appointmentDate) !== clinicDate()) {
        throw new QueueError(
          409,
          'เปลี่ยนสถานะได้เฉพาะคิวของวันนี้ตามเวลาไทย'
        );
      }
      // Duplicate requests are safe; do not send another notification.
      if (current.status === target) return current;
      const expected = target === 'confirmed'
        ? 'pending'
        : target === 'in_progress'
          ? 'confirmed'
          : 'in_progress';
      if (current.status !== expected) throw new QueueError(409, 'สถานะคิวเปลี่ยนแล้ว หรือยังไม่ยืนยันนัดหมาย กรุณาโหลดข้อมูลใหม่');
      if (target === 'in_progress') {
        const busy = await tx.appointment.findFirst({
          where: { doctorId: found.doctorId, status: 'in_progress', id: { not: current.id } }, select: { id: true },
        });
        if (busy) throw new QueueError(409, 'แพทย์ท่านนี้กำลังตรวจคิวอื่น กรุณาตรวจเสร็จสิ้นก่อนเรียกคิวถัดไป');
      }
      const changed = await tx.appointment.updateMany({
        where: { id: current.id, doctorId: found.doctorId, status: expected }, data: { status: target },
      });
      if (changed.count !== 1) throw new QueueError(409, 'มีผู้ใช้อื่นเปลี่ยนคิวนี้แล้ว กรุณาโหลดข้อมูลใหม่');
      await tx.notification.create({
        data: {
          patientId: current.patient.id,
          message: target === 'confirmed'
            ? `นัดหมายของคุณกับ ${current.doctor.docName} ได้รับการยืนยันแล้ว (นัดหมาย ${current.id})`
            : target === 'in_progress'
              ? `ถึงคิวเข้าตรวจกับ ${current.doctor.docName} แล้ว (นัดหมาย ${current.id})`
              : `การตรวจของคุณกับ ${current.doctor.docName} เสร็จสิ้นแล้ว (นัดหมาย ${current.id})`,
        }
      });
      return { ...current, status: target };
    }, { maxWait: 5000, timeout: 10000 });
    return res.json({
      message: target === 'confirmed'
        ? 'ยืนยันนัดหมายเรียบร้อยแล้ว'
        : target === 'in_progress'
          ? 'เรียกเข้าตรวจแล้ว'
          : 'บันทึกตรวจเสร็จสิ้นแล้ว',
      item
    });
  } catch (error) {
    if (error instanceof QueueError) return res.status(error.status).json({ message: error.message });
    console.error('Queue update failed:', error.code || error.name);
    return res.status(503).json({ message: 'บันทึกสถานะไม่สำเร็จ กรุณาโหลดข้อมูลใหม่ก่อนลองอีกครั้ง' });
  }
}

module.exports = { listQueue, updateQueueStatus, clinicDate, dateRange };
