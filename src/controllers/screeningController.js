const prisma = require('../prisma');

// 1. ดึงรายการคำถาม/กฎคัดกรองอาการทั้งหมด (Public - 200 OK)
const getScreeningRules = async (req, res) => {
  try {
    const rules = await prisma.symptomRule.findMany({
      orderBy: { ruleId: 'asc' },
    });
    res.status(200).json(rules);
  } catch (error) {
    res.status(500).json({ message: 'ดึงข้อมูลกฎคัดกรองไม่สำเร็จ', error: error.message });
  }
};

// 2. ส่งแบบฟอร์มคัดกรองอาการแบบละเอียด (Patient - 201 Created)
const createScreening = async (req, res) => {
  try {
    const {
      complaint,
      answerYes,
      painLevel = 5,
      duration = '1-2 วัน',
      additionalSymptoms = [],
      note = '',
    } = req.body;

    const patientId = req.user.id;

    if (!complaint) {
      return res.status(400).json({ message: 'กรุณาระบุกลุ่มอาการหลัก (complaint)' });
    }

    const numericPain = Math.min(10, Math.max(1, Number(painLevel) || 5));
    const hasRedFlagAnswer = answerYes === true || answerYes === 'true';

    // ค้นหากฎคัดกรองจากฐานข้อมูล
    const matchedRule = await prisma.symptomRule.findFirst({
      where: { complaint: { contains: complaint } },
    });

    // เช็กอาการร่วมที่มีความเสี่ยงสูง
    const criticalExtras = ['หายใจเหนื่อยหอบ', 'หน้ามืด/วูบ', 'อาเจียนรุนแรง'];
    const hasCriticalExtra = Array.isArray(additionalSymptoms)
      ? additionalSymptoms.some((item) => criticalExtras.includes(item))
      : false;

    // ประเมินระดับความเร่งด่วน (EMERGENCY / URGENT / NORMAL)
    let isRedFlag = false;
    let triageLevel = 'NORMAL';
    let recommendedDepartment = 'แผนกอายุรกรรมทั่วไป';
    let advice = 'อาการอยู่ในเกณฑ์ทั่วไป สามารถเลือกวันและเวลาที่สะดวกเพื่อจองคิวพบแพทย์ได้';

    if ((matchedRule && matchedRule.is_red_flag && hasRedFlagAnswer) || numericPain >= 8 || hasCriticalExtra) {
      isRedFlag = true;
      triageLevel = 'EMERGENCY';
      recommendedDepartment = matchedRule
        ? matchedRule.recommended_department
        : 'แผนกฉุกเฉิน (ER)';
      advice = 'พบสัญญาณอาการที่ต้องได้รับการประเมินเร่งด่วน กรุณาติดต่อแผนกฉุกเฉินหรือเข้ารับการตรวจทันที';
    } else if (hasRedFlagAnswer || numericPain >= 5) {
      isRedFlag = false;
      triageLevel = 'URGENT';
      recommendedDepartment = matchedRule
        ? matchedRule.recommended_department.replace('แผนกฉุกเฉิน / ', '')
        : 'แผนกอายุรกรรม';
      advice = 'ควรเข้ารับการตรวจกับแพทย์เฉพาะทางภายใน 24 ชั่วโมง เพื่อวินิจฉัยและรับการรักษาที่เหมาะสม';
    } else {
      isRedFlag = false;
      triageLevel = 'NORMAL';
      recommendedDepartment = matchedRule
        ? matchedRule.recommended_department.replace('แผนกฉุกเฉิน / ', '')
        : 'แผนกอายุรกรรมทั่วไป';
    }

    // รวมรายละเอียดอาการที่ประเมินเพื่อบันทึกเก็บไว้ดูย้อนหลัง
    const extraText = Array.isArray(additionalSymptoms) && additionalSymptoms.length > 0
      ? ` | อาการร่วม: ${additionalSymptoms.join(', ')}`
      : '';
    const noteText = note.trim() ? ` | หมายเหตุ: ${note.trim()}` : '';
    const detailedComplaint = `${complaint} (ความรุนแรง ${numericPain}/10, ระยะเวลา: ${duration}${extraText}${noteText})`;

    // บันทึกผลลงตาราง Screening
    const screening = await prisma.screening.create({
      data: {
        patientId,
        complaint: detailedComplaint,
        isRedFlag,
        recommendedDepartment,
      },
    });

    // สร้างการแจ้งเตือนลงตาราง Notification อัตโนมัติ
    await prisma.notification.create({
      data: {
        patientId,
        message: isRedFlag
          ? `[ด่วน] ผลคัดกรอง "${complaint}" แนะนำให้พบแพทย์ที่ ${recommendedDepartment} ทันที`
          : `บันทึกผลคัดกรอง "${complaint}" เรียบร้อย แผนกที่แนะนำ: ${recommendedDepartment}`,
      },
    });

    res.status(201).json({
      message: isRedFlag
        ? 'พบสัญญาณอาการเร่งด่วน แนะนำให้ติดต่อแผนกฉุกเฉินทันที'
        : triageLevel === 'URGENT'
        ? 'ควรนัดหมายพบแพทย์เฉพาะทางโดยเร็ว'
        : 'บันทึกผลการคัดกรองอาการสำเร็จ',
      triageLevel,
      advice,
      painLevel: numericPain,
      duration,
      additionalSymptoms,
      screening,
    });
  } catch (error) {
    res.status(500).json({ message: 'บันทึกแบบฟอร์มคัดกรองไม่สำเร็จ', error: error.message });
  }
};

// 3. ดูประวัติการคัดกรองอาการย้อนหลังของคนไข้ (Patient - 200 OK)
const getMyScreenings = async (req, res) => {
  try {
    const patientId = req.user.id;
    const history = await prisma.screening.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ message: 'ดึงประวัติการคัดกรองไม่สำเร็จ', error: error.message });
  }
};

module.exports = { getScreeningRules, createScreening, getMyScreenings };