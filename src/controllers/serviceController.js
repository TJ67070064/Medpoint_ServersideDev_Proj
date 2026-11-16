const prisma = require('../prisma');

// 1. ดูรายการบริการ/แพ็กเกจและราคา (Public - 200 OK)
const getAllServices = async (req, res) => {
  try {
    const services = await prisma.service.findMany({
      where: { status: 'active' }, // แสดงเฉพาะบริการที่ยังไม่ถูก Soft Delete
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(services);
  } catch (error) {
    res.status(500).json({ message: 'ดึงข้อมูลบริการไม่สำเร็จ', error: error.message });
  }
};

// 2. เพิ่มบริการ/แพ็กเกจใหม่ (Admin - 201 Created)
const createService = async (req, res) => {
  try {
    const { serviceName, docName, durationMinutes, price } = req.body;

    if (!serviceName || !durationMinutes || price === undefined) {
      return res.status(400).json({ message: 'กรุณากรอก serviceName, durationMinutes และ price ให้ครบถ้วน' });
    }

    const newService = await prisma.service.create({
      data: {
        serviceName,
        docName: docName || null,
        durationMinutes: Number(durationMinutes),
        price: Number(price),
        status: 'active',
      },
    });

    res.status(201).json({
      message: 'เพิ่มบริการใหม่สำเร็จ',
      service: newService,
    });
  } catch (error) {
    res.status(500).json({ message: 'เพิ่มบริการไม่สำเร็จ', error: error.message });
  }
};

// 3. แก้ไขรายละเอียดหรือราคาบริการ (Admin - 200 OK)
const updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { serviceName, docName, durationMinutes, price, status } = req.body;

    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'ไม่พบรหัสบริการนี้ในระบบ' });
    }

    const updatedService = await prisma.service.update({
      where: { id },
      data: {
        ...(serviceName !== undefined && { serviceName }),
        ...(docName !== undefined && { docName }),
        ...(durationMinutes !== undefined && { durationMinutes: Number(durationMinutes) }),
        ...(price !== undefined && { price: Number(price) }),
        ...(status !== undefined && { status }),
      },
    });

    res.status(200).json({
      message: 'อัปเดตข้อมูลบริการสำเร็จ',
      service: updatedService,
    });
  } catch (error) {
    res.status(500).json({ message: 'อัปเดตบริการไม่สำเร็จ', error: error.message });
  }
};

// 4. ปิดใช้งานบริการแบบ Soft Delete (Admin - 204 No Content)
const deleteService = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.service.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'ไม่พบรหัสบริการนี้ในระบบ' });
    }

    // Soft Delete: เปลี่ยน status เป็น inactive แทนการลบออกจากฐานข้อมูลจริง
    await prisma.service.update({
      where: { id },
      data: { status: 'inactive' },
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'ปิดใช้งานบริการไม่สำเร็จ', error: error.message });
  }
};

module.exports = {
  getAllServices,
  createService,
  updateService,
  deleteService,
};