const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^0[0-9]{8,9}$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

// 1. สมัครสมาชิกสาธารณะ — บังคับเฉพาะสิทธิ์ PATIENT เท่านั้น (POST /api/v1/auth/register)
const register = async (req, res) => {
  try {
    const { full_name, email, password, confirmPassword, phone, role } = req.body;

    // ป้องกันการยิง API แอบสมัครเป็น ADMIN หรือ DOCTOR_STAFF โดยตรง
    if (role && role.toUpperCase() !== 'PATIENT') {
      return res.status(403).json({
        message: 'ไม่อนุญาตให้สมัครสิทธิ์ ADMIN หรือ DOCTOR_STAFF ผ่านหน้าสาธารณะ กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบและออกบัญชี',
      });
    }

    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json({ message: 'กรุณากรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร' });
    }

    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: 'รูปแบบอีเมลไม่ถูกต้อง (ตัวอย่าง: name@example.com)' });
    }

    const normalizedPhone = phone ? phone.trim().replace(/-/g, '') : '';
    if (!normalizedPhone || !PHONE_REGEX.test(normalizedPhone)) {
      return res.status(400).json({ message: 'กรุณากรอกเบอร์โทรศัพท์มือถือ 9-10 หลัก (ขึ้นต้นด้วย 0)' });
    }

    if (!password || !STRONG_PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวอักษรภาษาอังกฤษกับตัวเลข',
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ message: 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ message: 'อีเมลนี้ถูกใช้งานในระบบแล้ว กรุณาใช้อีเมลอื่น' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        full_name: full_name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        phone: normalizedPhone,
        role: 'PATIENT', // ล็อกเป็น PATIENT เสมอ
      },
    });

    res.status(201).json({
      message: 'สมัครสมาชิกสำเร็จ',
      user: {
        id: newUser.id,
        full_name: newUser.full_name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสมัครสมาชิก', error: error.message });
  }
};

// 2. เข้าสู่ระบบ (POST /api/v1/auth/login)
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: 'กรุณากรอกอีเมลให้ถูกต้อง' });
    }

    if (!password) {
      return res.status(400).json({ message: 'กรุณากรอกรหัสผ่าน' });
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.status(200).json({
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ', error: error.message });
  }
};

// 3. ตรวจสอบ Token และดึงข้อมูลผู้ใช้งานปัจจุบัน (GET /api/v1/auth/me)
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        full_name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งานในระบบ' });
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: 'ตรวจสอบข้อมูลผู้ใช้งานไม่สำเร็จ', error: error.message });
  }
};

// 4. [ADMIN ONLY] ตรวจสอบและสร้างบัญชีให้ แพทย์ / เจ้าหน้าที่ หรือ Admin (POST /api/v1/auth/users)
const createStaffAccount = async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      phone,
      role,
      licenseNumber,
      verified,
      specialization,
      department,
    } = req.body;

    if (!verified) {
      return res.status(400).json({
        message: 'กรุณายืนยันการตรวจสอบประวัติและเอกสารประจำตัวบุคลากรก่อนสร้างบัญชี',
      });
    }

    const targetRole = role ? role.toUpperCase() : '';
    if (!['DOCTOR_STAFF', 'ADMIN'].includes(targetRole)) {
      return res.status(400).json({
        message: 'สิทธิ์ที่สร้างได้ในส่วนนี้ต้องเป็น DOCTOR_STAFF หรือ ADMIN เท่านั้น',
      });
    }

    if (!full_name || full_name.trim().length < 2) {
      return res.status(400).json({ message: 'กรุณากรอกชื่อ-นามสกุลและคำนำหน้า (เช่น นพ. / พญ.)' });
    }

    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    if (!normalizedEmail || !EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ message: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }

    const normalizedPhone = phone ? phone.trim().replace(/-/g, '') : '';
    if (!normalizedPhone || !PHONE_REGEX.test(normalizedPhone)) {
      return res.status(400).json({ message: 'กรุณากรอกเบอร์โทรศัพท์มือถือ 9-10 หลัก' });
    }

    if (!password || !STRONG_PASSWORD_REGEX.test(password)) {
      return res.status(400).json({
        message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และประกอบด้วยตัวอักษรภาษาอังกฤษกับตัวเลข',
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(409).json({ message: 'อีเมลนี้ถูกใช้งานในระบบแล้ว' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const trimmedName = full_name.trim();

    // สร้างบัญชีในตาราง User และหากเป็น DOCTOR_STAFF ให้สร้างข้อมูลแพทย์ในตาราง Doctor ควบคู่กันทันที
    const newStaff = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          full_name: trimmedName,
          email: normalizedEmail,
          password: hashedPassword,
          phone: normalizedPhone,
          role: targetRole,
        },
      });

      if (targetRole === 'DOCTOR_STAFF') {
        const existingDoctor = await tx.doctor.findFirst({
          where: { docName: trimmedName },
        });

        if (!existingDoctor) {
          await tx.doctor.create({
            data: {
              id: createdUser.id, // ใช้ ID เดียวกันเพื่อให้เชื่อมกับหน้าคิวและหน้าแพทย์อัตโนมัติ
              docName: trimmedName,
              specialization: (specialization || 'อายุรกรรมทั่วไป').trim(),
              department: (department || 'แผนกอายุรกรรม').trim(),
              phone: normalizedPhone,
              status: 'active',
            },
          });
        }
      }

      return createdUser;
    });

    res.status(201).json({
      message: `ตรวจสอบและสร้างบัญชี ${targetRole} สำเร็จ`,
      licenseNumber: licenseNumber || '-',
      user: {
        id: newStaff.id,
        full_name: newStaff.full_name,
        email: newStaff.email,
        phone: newStaff.phone,
        role: newStaff.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'สร้างบัญชีบุคลากรไม่สำเร็จ', error: error.message });
  }
};

// 5. [ADMIN ONLY] ดูรายชื่อผู้ใช้งานทั้งหมดในระบบ (GET /api/v1/auth/users)
const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        full_name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'ดึงข้อมูลผู้ใช้งานไม่สำเร็จ', error: error.message });
  }
};

module.exports = { register, login, getMe, createStaffAccount, getAllUsers };