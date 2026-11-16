const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('123456', 10);

  // Admin และ Patient Demo
  await prisma.user.upsert({
    where: { email: 'admin@medpoint.com' },
    update: {},
    create: {
      full_name: 'Admin Medpoint',
      email: 'admin@medpoint.com',
      password: hashedPassword,
      phone: '0800000001',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { email: 'tj@medpoint.com' },
    update: {},
    create: {
      full_name: 'Tananan Jeendasawang',
      email: 'tj@medpoint.com',
      password: hashedPassword,
      phone: '0800000002',
      role: 'PATIENT',
    },
  });

  // สร้างแพทย์และบริการDemo
  const docCount = await prisma.doctor.count();
  if (docCount === 0) {
    const doc1 = await prisma.doctor.create({
      data: {
        docName: 'นพ. สมชาย ใจดี',
        specialization: 'อายุรศาสตร์โรคหัวใจ',
        department: 'แผนกอายุรกรรม',
        phone: '0811112222',
        schedules: {
          create: [
            { availableDate: new Date('2026-11-20T09:00:00Z'), startTime: '09:00', endTime: '12:00' },
            { availableDate: new Date('2026-11-20T13:00:00Z'), startTime: '13:00', endTime: '16:00' },
          ],
        },
      },
    });

    await prisma.service.create({
      data: {
        serviceName: 'ตรวจสุขภาพหัวใจเบื้องต้น (EKG)',
        docName: doc1.docName,
        durationMinutes: 45,
        price: 1500.00,
      },
    });
  }

  // 3. คัดกรองอาการให้ครบ 6 กลุ่มอาการ
  await prisma.symptomRule.deleteMany();
  await prisma.symptomRule.createMany({
    data: [
      {
        complaint: 'เจ็บแน่นหน้าอก / หายใจลำบาก',
        question_text: 'มีอาการเจ็บแน่นหน้าอกเหมือนมีของหนักทับ ร้าวไปที่แขนซ้าย คอ กราม หรือเหงื่อแตกใจสั่นร่วมด้วยหรือไม่?',
        is_red_flag: true,
        recommended_department: 'แผนกฉุกเฉิน / ศูนย์หัวใจ',
      },
      {
        complaint: 'ปวดศีรษะ / เวียนศีรษะ',
        question_text: 'มีอาการปวดศีรษะรุนแรงเฉียบพลัน แขนขาอ่อนแรงครึ่งซีก ปากเบี้ยว หรือพูดไม่ชัดร่วมด้วยหรือไม่?',
        is_red_flag: true,
        recommended_department: 'แผนกฉุกเฉิน / แผนกอายุรกรรมระบบประสาท',
      },
      {
        complaint: 'ปวดท้อง / ระบบทางเดินอาหาร',
        question_text: 'มีอาการปวดท้องรุนแรงมาก กดเจ็บที่ท้องน้อยด้านขวา อาเจียนเป็นเลือด หรือถ่ายดำร่วมด้วยหรือไม่?',
        is_red_flag: true,
        recommended_department: 'แผนกฉุกเฉิน / แผนกศัลยกรรม',
      },
      {
        complaint: 'ไข้สูง / ไอ / เจ็บคอ',
        question_text: 'มีไข้สูงเกิน 39°C ติดต่อกันเกิน 3 วัน หอบเหนื่อย หรือหายใจมีเสียงหวีดร่วมด้วยหรือไม่?',
        is_red_flag: false,
        recommended_department: 'แผนกอายุรกรรม / หู คอ จมูก',
      },
      {
        complaint: 'ปวดข้อ / ปวดหลัง / บาดเจ็บ',
        question_text: 'เกิดจากอุบัติเหตุรุนแรง ข้อบวมผิดรูป หรือมีอาการชาและอ่อนแรงร้าวลงขาร่วมด้วยหรือไม่?',
        is_red_flag: false,
        recommended_department: 'แผนกศัลยกรรมกระดูกและข้อ',
      },
      {
        complaint: 'ผื่นแพ้ / อาการทางผิวหนัง',
        question_text: 'มีผื่นลมพิษขึ้นทั่วตัวร่วมกับอาการปากบวม ตาบวม แน่นหน้าอก หรือหายใจติดขัดหรือไม่?',
        is_red_flag: true,
        recommended_department: 'แผนกฉุกเฉิน / แผนกผิวหนัง',
      },
    ],
  });

  console.log('Seed ข้อมูลระบบคัดกรองแบบเต็มรูปแบบสำเร็จเรียบร้อย!');
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());