const prisma = require('../prisma');

// Admin Doctor/Schedule management. Uses existing Doctor, Schedule, Appointment tables.
// No Prisma migrations are required. All date boundaries use Bangkok time (UTC+7).
const DAY_MS = 86_400_000;
const NON_BLOCKING = ['cancelled', 'canceled', 'completed', 'done'];
const fail = (res, status, message) => res.status(status).json({ message });
const textValue = (value) => typeof value === 'string' ? value.trim() : '';

function dayBounds(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  const from = new Date(`${date}T00:00:00+07:00`);
  return { from, until: new Date(from.getTime() + DAY_MS) };
}

function bangkokDate(d) {
  return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function clockMinutes(s) {
  if (typeof s !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function parseScheduleBody(body) {
  const { doctorId, date, startTime, endTime } = body || {};
  const bounds = dayBounds(date);
  const fromMinutes = clockMinutes(startTime);
  const untilMinutes = clockMinutes(endTime);
  if (!textValue(doctorId) || !bounds || fromMinutes === null || untilMinutes === null || fromMinutes >= untilMinutes) {
    return { error: 'โปรดระบุแพทย์ วันที่ และเวลาเริ่ม/สิ้นสุดให้ถูกต้อง' };
  }
  if (bounds.until.getTime() <= Date.now()) return { error: 'ไม่สามารถกำหนดตารางออกตรวจย้อนหลังได้' };
  return { doctorId, date, startTime, endTime, bounds, fromMinutes, untilMinutes };
}

// See whether a Schedule window already contains any active appointment.
// Appointment has no scheduleId; this must match by doctor/date/time range.
async function hasExistingAppointments(schedule) {
  const date = bangkokDate(schedule.availableDate);
  const bounds = dayBounds(date);
  if (!bounds) return true;
  const matches = await prisma.appointment.findMany({
    where: {
      doctorId: schedule.doctorId,
      appointmentDate: { gte: bounds.from, lt: bounds.until },
      status: { notIn: NON_BLOCKING },
    },
    select: { appointmentDate: true, service: { select: { durationMinutes: true } } },
  });
  const start = clockMinutes(schedule.startTime);
  const end = clockMinutes(schedule.endTime);
  if (start === null || end === null) return true;
  return matches.some((appt) => {
    const ms = appt.appointmentDate.getTime() + 7 * 60 * 60 * 1000;
    const dt = new Date(ms);
    const mins = dt.getUTCHours() * 60 + dt.getUTCMinutes();
    const length = Number(appt.service?.durationMinutes) || 30;
    return mins < end && (mins + length) > start;
  });
}

async function listDoctors(req, res) {
  try {
    const doctors = await prisma.doctor.findMany({
      select: {
        id: true, docName: true, specialization: true, department: true,
        phone: true, status: true, createdAt: true,
        _count: { select: { schedules: true } },
      },
      orderBy: { docName: 'asc' },
    });
    res.json(doctors);
  } catch (err) {
    console.error('listDoctors', err);
    fail(res, 500, 'โหลดรายชื่อแพทย์ไม่สำเร็จ');
  }
}

async function createDoctor(req, res) {
  const { docName, specialization, department, phone } = req.body || {};
  if (![docName, specialization, department, phone].every(v => textValue(v))) {
    return fail(res, 400, 'กรุณากรอกชื่อ สาขา แผนก และเบอร์โทรศัพท์ให้ครบ');
  }
  if (!/^0\d{8,9}$/.test(textValue(phone))) return fail(res, 400, 'เบอร์โทรศัพท์ไม่ถูกต้อง');
  try {
    const doctor = await prisma.doctor.create({
      data: { docName: textValue(docName), specialization: textValue(specialization), department: textValue(department), phone: textValue(phone), status: 'active' },
    });
    res.status(201).json({ message: 'เพิ่มแพทย์สำเร็จ', doctor });
  } catch (err) {
    console.error('createDoctor', err);
    fail(res, 500, 'เพิ่มแพทย์ไม่สำเร็จ');
  }
}

async function updateDoctor(req, res) {
  const { id } = req.params;
  const { docName, specialization, department, phone, status } = req.body || {};
  const changes = {};
  for (const [key, v] of Object.entries({ docName, specialization, department, phone })) {
    if (v !== undefined) {
      if (!textValue(v)) return fail(res, 400, `${key} ต้องไม่ว่าง`);
      changes[key] = textValue(v);
    }
  }
  if (phone !== undefined && !/^0\d{8,9}$/.test(changes.phone)) return fail(res, 400, 'เบอร์โทรศัพท์ไม่ถูกต้อง');
  if (status !== undefined) {
    if (!['active', 'inactive', 'archived'].includes(status)) return fail(res, 400, 'สถานะต้องเป็น active หรือ inactive');
    changes.status = status;
  }
  if (!Object.keys(changes).length) return fail(res, 400, 'ไม่พบข้อมูลที่ต้องการแก้ไข');
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id } });
    if (!doctor) return fail(res, 404, 'ไม่พบแพทย์');
    // Existing Service.docName is plain text (not a doctorId FK). Renaming would
    // break the booking-side service/doctor match. Coordinate it with services first.
    if (changes.docName && changes.docName !== doctor.docName) {
      const linkedServices = await prisma.service.count({ where: { docName: doctor.docName, status: 'active' } });
      if (linkedServices > 0) return fail(res, 409, 'ยังมีบริการที่ผูกด้วยชื่อแพทย์เดิม กรุณาประสานการแก้ชื่อในระบบบริการก่อน');
    }

    if (
      ['inactive', 'archived'].includes(changes.status) &&
      doctor.status !== changes.status
    ) {

      const upcoming = await prisma.appointment.count({
        where: { doctorId: id, appointmentDate: { gte: new Date() }, status: { notIn: NON_BLOCKING } },
      });
      if (upcoming) return fail(res, 409, 'ยังมีนัดหมายในอนาคต กรุณาจัดการนัดหมายก่อนปิดรับนัดแพทย์ท่านนี้');
    }
    const updated = await prisma.doctor.update({ where: { id }, data: changes });
    res.json({ message: 'บันทึกข้อมูลแพทย์แล้ว', doctor: updated });
  } catch (err) {
    console.error('updateDoctor', err);
    fail(res, 500, 'แก้ไขข้อมูลแพทย์ไม่สำเร็จ');
  }
}

async function listSchedules(req, res) {
  const date = textValue(req.query.week) || bangkokDate(new Date());
  const bounds = dayBounds(date);
  if (!bounds) return fail(res, 400, 'กรุณาระบุวันที่เริ่มสัปดาห์ YYYY-MM-DD');
  const until = new Date(bounds.from.getTime() + 7 * DAY_MS);
  try {
    const schedules = await prisma.schedule.findMany({
      where: {
        availableDate: { gte: bounds.from, lt: until },
        ...(textValue(req.query.doctorId) ? { doctorId: textValue(req.query.doctorId) } : {}),
      },
      include: { doctor: { select: { id: true, docName: true, department: true, status: true } } },
      orderBy: [{ availableDate: 'asc' }, { startTime: 'asc' }],
    });
    res.json(schedules);
  } catch (err) {
    console.error('listSchedules', err);
    fail(res, 500, 'โหลดตารางออกตรวจไม่สำเร็จ');
  }
}

async function ensureNoScheduleOverlap(data, excludeId = null) {
  const matches = await prisma.schedule.findMany({
    where: {
      doctorId: data.doctorId,
      availableDate: { gte: data.bounds.from, lt: data.bounds.until },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, startTime: true, endTime: true },
  });
  return matches.some(s => data.fromMinutes < clockMinutes(s.endTime) && data.untilMinutes > clockMinutes(s.startTime));
}

async function createSchedule(req, res) {
  const input = parseScheduleBody(req.body);
  if (input.error) return fail(res, 400, input.error);
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: input.doctorId }, select: { status: true } });
    if (!doctor) return fail(res, 404, 'ไม่พบแพทย์');
    if (doctor.status !== 'active') return fail(res, 409, 'แพทย์ปิดรับนัดอยู่ ไม่สามารถเพิ่มช่วงออกตรวจ');
    if (await ensureNoScheduleOverlap(input)) return fail(res, 409, 'แพทย์มีช่วงเวลาออกตรวจทับซ้อนอยู่แล้ว');
    const schedule = await prisma.schedule.create({
      data: {
        doctorId: input.doctorId,
        availableDate: new Date(`${input.date}T12:00:00+07:00`),
        startTime: input.startTime, endTime: input.endTime, isBooked: false,
      },
    });
    res.status(201).json({ message: 'เพิ่มช่วงออกตรวจแล้ว', schedule });
  } catch (err) {
    console.error('createSchedule', err);
    fail(res, 500, 'เพิ่มช่วงออกตรวจไม่สำเร็จ');
  }
}

async function updateSchedule(req, res) {
  const input = parseScheduleBody(req.body);
  if (input.error) return fail(res, 400, input.error);
  try {
    const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
    if (!schedule) return fail(res, 404, 'ไม่พบช่วงออกตรวจ');
    if (schedule.isBooked || await hasExistingAppointments(schedule)) return fail(res, 409, 'ช่วงนี้ถูกจองหรือมีนัดหมายอยู่แล้ว ไม่สามารถย้ายหรือแก้เวลาได้');
    const doctor = await prisma.doctor.findUnique({ where: { id: input.doctorId }, select: { status: true } });
    if (!doctor || doctor.status !== 'active') return fail(res, 409, 'แพทย์ไม่พร้อมรับนัด');
    if (await ensureNoScheduleOverlap(input, schedule.id)) return fail(res, 409, 'ช่วงเวลาออกตรวจทับซ้อนกับรายการอื่น');
    const updated = await prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        doctorId: input.doctorId,
        availableDate: new Date(`${input.date}T12:00:00+07:00`),
        startTime: input.startTime, endTime: input.endTime,
      },
    });
    res.json({ message: 'แก้ไขตารางออกตรวจแล้ว', schedule: updated });
  } catch (err) {
    console.error('updateSchedule', err);
    fail(res, 500, 'แก้ไขตารางออกตรวจไม่สำเร็จ');
  }
}

async function deleteSchedule(req, res) {
  try {
    const schedule = await prisma.schedule.findUnique({ where: { id: req.params.id } });
    if (!schedule) return fail(res, 404, 'ไม่พบช่วงออกตรวจ');
    if (schedule.isBooked || await hasExistingAppointments(schedule)) return fail(res, 409, 'ช่วงนี้ถูกจองหรือมีนัดหมายแล้ว ไม่สามารถลบได้');
    await prisma.schedule.delete({ where: { id: schedule.id } });
    res.status(204).send();
  } catch (err) {
    console.error('deleteSchedule', err);
    fail(res, 500, 'ลบช่วงออกตรวจไม่สำเร็จ');
  }
}

module.exports = { listDoctors, createDoctor, updateDoctor, listSchedules, createSchedule, updateSchedule, deleteSchedule };
