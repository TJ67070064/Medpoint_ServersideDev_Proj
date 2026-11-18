module.exports = {
  '/api/v1/patient-queue': {
    get: {
      tags: ['Patient Queue'], summary: 'ผู้ป่วยดูคิวตนเองและเทียบคิวปัจจุบันของแพทย์ที่นัด',
      description: 'PATIENT เท่านั้น ตรวจ role ปัจจุบันในฐานข้อมูล อ้างอิงเจ้าของนัดจาก JWT ไม่รับ patientId และไม่ส่งรายละเอียดนัดของผู้อื่น ส่งเพียงเลขคิวกำลังตรวจของแพทย์เดียวกันและจำนวนคิวรอก่อนตนเอง เลขคิวเริ่มนับรายวันตรงกับหน้าบุคลากร ไม่ใช่เลขคิวถาวร',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'scope', in: 'query', schema: { type: 'string', enum: ['active', 'all'], default: 'active' }, description: 'active = วันนี้และนัดถัดไปที่ไม่ยกเลิก รวมตรวจเสร็จวันนี้; all = นัดทั้งหมดของบัญชีนี้' },
        { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000000, default: 1 } },
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 20, default: 10 } },
      ],
      responses: {
        200: { description: 'ownAppointments: นัดของบัญชีนี้เท่านั้น (appointmentId, appointmentDate, appointmentStatus, queueStatus, queueNumber, doctor: docName/department, comparison), pagination, scope, today, updatedAt. comparison: currentQueueNumbers และ waitingBefore เฉพาะ confirmed/in_progress ของวันนี้ แพทย์เดียวกัน waitingBefore ไม่นับกำลังตรวจ ไม่ลบเลขคิว ไม่ใช่คำรับประกันลำดับเรียก ส่วน pending/cancelled ไม่มีเลขคิว ไม่มีรายละเอียดนัดของบัญชีอื่น' },
        400: { description: 'พารามิเตอร์ไม่ถูกต้องหรือไม่รองรับ' },
        401: { description: 'ไม่มี Token หรือบัญชีถูกลบ' },
        403: { description: 'Token หมดอายุ/ไม่ถูกต้อง หรือบัญชีปัจจุบันไม่ใช่ PATIENT' },
        503: { description: 'ตรวจบัญชีหรืออ่านฐานข้อมูลไม่สำเร็จ' },
      },
    },
  },
};
