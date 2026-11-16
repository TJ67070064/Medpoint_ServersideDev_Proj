const prisma = require('../prisma');

// แสดงรายชื่อแพทย์และช่วงเวลาออกตรวจที่เปิดให้ดูได้ (Public)
// ?date=YYYY-MM-DD จะจำกัดตารางออกตรวจเฉพาะวันที่เลือก (เวลาไทย)
const getAllDoctors = async (req, res) => {
  try {
    const { date } = req.query;
    let fromDate;
    let untilDate;

    if (date !== undefined) {
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: 'รูปแบบวันที่ต้องเป็น YYYY-MM-DD' });
      }

      const [year, month, day] = date.split('-').map(Number);
      const calendarCheck = new Date(Date.UTC(year, month - 1, day));
      if (
        calendarCheck.getUTCFullYear() !== year ||
        calendarCheck.getUTCMonth() !== month - 1 ||
        calendarCheck.getUTCDate() !== day
      ) {
        return res.status(400).json({ message: 'วันที่ไม่ถูกต้อง' });
      }

      // midnight Bangkok (+07:00) ช่วยให้เลือกวันตามปฏิทินไทยได้ตรงกัน
      fromDate = new Date(`${date}T00:00:00+07:00`);
      untilDate = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
    } else {
      const thailandToday = new Date(Date.now() + 7 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      fromDate = new Date(`${thailandToday}T00:00:00+07:00`);
    }

    const doctors = await prisma.doctor.findMany({
      select: {
        id: true,
        docName: true,
        specialization: true,
        department: true,
        status: true,
        schedules: {
          where: {
            availableDate: {
              gte: fromDate,
              ...(untilDate ? { lt: untilDate } : {}),
            },
          },
          select: {
            id: true,
            availableDate: true,
            startTime: true,
            endTime: true,
            isBooked: true,
          },
          orderBy: [
            { availableDate: 'asc' },
            { startTime: 'asc' },
          ],
        },
      },
      orderBy: { docName: 'asc' },
    });

    return res.status(200).json(doctors);
  } catch (error) {
    console.error('getAllDoctors error:', error);
    return res.status(500).json({ message: 'ไม่สามารถดึงรายชื่อแพทย์ได้' });
  }
};

module.exports = { getAllDoctors };
