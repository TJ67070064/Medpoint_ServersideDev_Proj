const prisma = require('../prisma');

// ประวัติการนัดหมายเฉพาะบัญชีผู้ป่วยที่เข้าสู่ระบบ (อ่านอย่างเดียว)
const getMyAppointments = async (req, res) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: req.user.id },
      select: {
        id: true,
        appointmentDate: true,
        status: true,
        createdAt: true,
        doctor: {
          select: {
            id: true,
            docName: true,
            department: true,
            specialization: true,
          },
        },
        service: {
          select: {
            id: true,
            serviceName: true,
            durationMinutes: true,
            price: true,
          },
        },
      },
      orderBy: { appointmentDate: 'desc' },
    });

    return res.status(200).json(appointments);
  } catch (error) {
    console.error('Error loading patient appointment history:', error);
    return res.status(500).json({ message: 'ไม่สามารถโหลดประวัติการนัดหมายได้' });
  }
};


// ยกเลิกนัดหมายของผู้ป่วยที่เข้าสู่ระบบเท่านั้น
// ไม่ลบประวัติ และไม่แก้ Schedule.isBooked เพราะระบบจองนับนัดที่ status != cancelled
// การใช้ updateMany พร้อมเงื่อนไข ทำให้การยกเลิกเป็น atomic และไม่ทับสถานะที่ Staff เปลี่ยนไปแล้ว
const cancelMyAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).json({ message: 'รูปแบบรหัสนัดหมายไม่ถูกต้อง' });
    }

    // จำกัดให้เจ้าของนัดยกเลิกได้เฉพาะรอยืนยัน/ยืนยันแล้ว และก่อนเวลานัดเท่านั้น
    const result = await prisma.appointment.updateMany({
      where: {
        id,
        patientId: req.user.id,
        status: { in: ['pending', 'confirmed', 'approved'] },
        appointmentDate: { gt: new Date() },
      },
      data: { status: 'cancelled' },
    });

    if (result.count === 0) {
      const ownAppointment = await prisma.appointment.findFirst({
        where: { id, patientId: req.user.id },
        select: { status: true, appointmentDate: true },
      });
      if (!ownAppointment) return res.status(404).json({ message: 'ไม่พบนัดหมายของคุณ' });
      return res.status(409).json({
        message: 'ยกเลิกนัดหมายนี้ไม่ได้แล้ว (สถานะไม่รองรับหรือเลยเวลานัดหมาย)',
      });
    }

    return res.status(200).json({
      message: 'ยกเลิกนัดหมายเรียบร้อยแล้ว',
      appointment: { id, status: 'cancelled' },
    });
  } catch (error) {
    console.error('Error cancelling patient appointment:', error);
    return res.status(500).json({ message: 'ไม่สามารถยกเลิกนัดหมายได้ กรุณาลองใหม่' });
  }
};

module.exports = { getMyAppointments, cancelMyAppointment };
