const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');

// MEDPOINT ใช้เวลาประจำประเทศไทย (UTC+7) และแบ่งต้นเวลาเป็นช่วงละ 30 นาที
// หมายเหตุ: Schedule คือ "ช่วงออกตรวจ" ไม่ใช่ 1 คิวต่อ 1 row
const TIME_ZONE_OFFSET = '+07:00';
const SLOT_STEP_MINUTES = 30;
const DEFAULT_DURATION_MINUTES = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = ['cancelled', 'canceled'];

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, 'กรุณาระบุวันที่รูปแบบ YYYY-MM-DD');
  }
  const [year, month, day] = date.split('-').map(Number);
  const test = new Date(Date.UTC(year, month - 1, day));
  if (test.getUTCFullYear() !== year || test.getUTCMonth() !== month - 1 || test.getUTCDate() !== day) {
    throw new ApiError(400, 'วันที่ที่เลือกไม่ถูกต้อง');
  }
  const from = new Date(`${date}T00:00:00${TIME_ZONE_OFFSET}`);
  return { from, until: new Date(from.getTime() + DAY_MS) };
}

function parseClock(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatClock(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function slotDate(date, clock) {
  return new Date(`${date}T${clock}:00${TIME_ZONE_OFFSET}`);
}

function overlaps(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

async function findAvailability(db, { doctorId, date, serviceId }, now = new Date()) {
  if (typeof doctorId !== 'string' || !doctorId.trim()) {
    throw new ApiError(400, 'กรุณาระบุแพทย์');
  }
  const { from, until } = parseDate(date);

  const doctor = await db.doctor.findUnique({
    where: { id: doctorId },
    select: { id: true, docName: true, specialization: true, department: true, status: true },
  });
  if (!doctor) throw new ApiError(404, 'ไม่พบแพทย์ที่เลือก');
  if (String(doctor.status).toLowerCase() !== 'active') {
    throw new ApiError(409, 'แพทย์ท่านนี้งดรับนัดหมายในขณะนี้');
  }

  let service = null;
  if (serviceId !== undefined && serviceId !== null && serviceId !== '') {
    if (typeof serviceId !== 'string') throw new ApiError(400, 'รหัสบริการไม่ถูกต้อง');
    service = await db.service.findUnique({
      where: { id: serviceId },
      select: { id: true, serviceName: true, docName: true, status: true, durationMinutes: true, price: true },
    });
    if (!service || service.status !== 'active') throw new ApiError(400, 'ไม่พบบริการที่เปิดใช้งาน');
    if (service.docName && service.docName !== doctor.docName) {
      throw new ApiError(400, 'บริการนี้ไม่ได้เปิดให้จองกับแพทย์ที่เลือก');
    }
  }

  const durationMinutes = service ? Number(service.durationMinutes) : DEFAULT_DURATION_MINUTES;
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    throw new ApiError(400, 'ระยะเวลาบริการไม่รองรับการจอง');
  }

  const [schedules, appointments] = await Promise.all([
    db.schedule.findMany({
      where: { doctorId, availableDate: { gte: from, lt: until }, isBooked: false },
      select: { id: true, startTime: true, endTime: true },
      orderBy: [{ startTime: 'asc' }, { endTime: 'asc' }],
    }),
    db.appointment.findMany({
      where: {
        doctorId,
        appointmentDate: { gte: from, lt: until },
        status: { notIn: CLOSED_STATUSES },
      },
      select: { appointmentDate: true, service: { select: { durationMinutes: true } } },
    }),
  ]);

  const busyIntervals = appointments.map((appointment) => {
    const start = appointment.appointmentDate.getTime();
    const length = Number(appointment.service?.durationMinutes) || DEFAULT_DURATION_MINUTES;
    return [start, start + length * 60_000];
  });
  const results = new Map();

  for (const schedule of schedules) {
    const fromMinutes = parseClock(schedule.startTime);
    const untilMinutes = parseClock(schedule.endTime);
    if (fromMinutes === null || untilMinutes === null || untilMinutes <= fromMinutes) continue;

    for (let minute = fromMinutes; minute + durationMinutes <= untilMinutes; minute += SLOT_STEP_MINUTES) {
      const startTime = formatClock(minute);
      const start = slotDate(date, startTime).getTime();
      const end = start + durationMinutes * 60_000;
      if (start <= now.getTime()) continue; // งดจองเวลาที่ผ่านไปแล้ว
      if (busyIntervals.some(([busyFrom, busyUntil]) => overlaps(start, end, busyFrom, busyUntil))) continue;
      if (!results.has(startTime)) {
        results.set(startTime, {
          scheduleId: schedule.id,
          startTime,
          endTime: formatClock(minute + durationMinutes),
        });
      }
    }
  }

  return {
    date,
    doctor,
    service,
    durationMinutes,
    slots: [...results.values()].sort((a, b) => a.startTime.localeCompare(b.startTime)),
  };
}

function replyError(res, error, action) {
  if (error instanceof ApiError) return res.status(error.status).json({ message: error.message });
  console.error(action, error);
  return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการติดต่อระบบนัดหมาย' });
}

const getAvailability = async (req, res) => {
  try {
    const data = await findAvailability(prisma, {
      doctorId: req.query.doctorId,
      date: req.query.date,
      serviceId: req.query.serviceId,
    });
    return res.status(200).json(data);
  } catch (error) {
    return replyError(res, error, 'getAvailability error:');
  }
};

// ข้อมูลที่มาจาก Client มีเพียง doctorId, date, time, serviceId; patientId ใช้จาก JWT เท่านั้น
const createBooking = async (req, res) => {
  const { doctorId, date, time, serviceId = null } = req.body || {};
  try {
    parseDate(date);
    if (parseClock(time) === null) throw new ApiError(400, 'เวลาไม่ถูกต้อง (ใช้ HH:mm)');
    if (typeof doctorId !== 'string' || !doctorId) throw new ApiError(400, 'กรุณาเลือกแพทย์');

    let booked;
    // Serializable + retry ลดปัญหากดจองพร้อมกัน (Prisma P2034)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        booked = await prisma.$transaction(async (tx) => {
          const availability = await findAvailability(tx, { doctorId, date, serviceId });
          const slot = availability.slots.find((item) => item.startTime === time);
          if (!slot) {
            throw new ApiError(409, 'ช่วงเวลานี้ไม่ว่างแล้ว กรุณาเลือกช่วงเวลาใหม่');
          }
          return tx.appointment.create({
            data: {
              patientId: req.user.id,
              doctorId,
              ...(availability.service ? { serviceId: availability.service.id } : {}),
              appointmentDate: slotDate(date, time),
              status: 'pending',
            },
            select: {
              id: true,
              status: true,
              appointmentDate: true,
              doctor: { select: { id: true, docName: true, specialization: true, department: true } },
              service: { select: { id: true, serviceName: true, durationMinutes: true, price: true } },
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 12000 });
        break;
      } catch (error) {
        if (error.code === 'P2034' && attempt < 2) continue;
        throw error;
      }
    }

    // ใช้ UUID เต็มเป็นรหัสอ้างอิงที่ไม่ซ้ำ; เลขคิว A012 ต้องตกลงกับฝั่ง Staff ก่อน
    return res.status(201).json({
      message: 'บันทึกนัดหมายแล้ว รอเจ้าหน้าที่ยืนยัน',
      appointment: booked,
      referenceCode: booked.id,
    });
  } catch (error) {
    return replyError(res, error, 'createBooking error:');
  }
};

module.exports = { getAvailability, createBooking };
