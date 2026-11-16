const jwt = require('jsonwebtoken');

// 1. ตรวจสอบว่าล็อกอินและแนบ Token มาถูกต้องหรือไม่
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // รูปแบบ: Bearer <token>

  if (!token) {
    return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (ไม่พบ Token)' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    }
    req.user = user; // เก็บข้อมูล { id, email, role } ไว้ใช้ต่อ
    next();
  });
};

// 2. ตรวจสอบสิทธิ์ตาม Role (PATIENT, DOCTOR_STAFF, ADMIN)
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `สิทธิ์ของคุณ (${req.user?.role || 'Public'}) ไม่สามารถเข้าถึงส่วนนี้ได้` 
      });
    }
    next();
  };
};

module.exports = { authenticateToken, authorizeRoles };