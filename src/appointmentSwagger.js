const auth = [{ bearerAuth: [] }];

const json = (schema) => ({
  'application/json': { schema },
});

const error = (description) => ({
  description,
  content: json({
    type: 'object',
    properties: {
      message: { type: 'string' },
    },
  }),
});

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string' },
};

const dateSchema = {
  type: 'string',
  format: 'date',
  example: '2026-11-20',
};

const doctor = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    docName: {
      type: 'string',
      example: 'นพ. สมชาย ใจดี',
    },
    specialization: { type: 'string' },
    department: { type: 'string' },
    status: { type: 'string' },
  },
};

const schedule = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    doctorId: { type: 'string' },
    availableDate: {
      type: 'string',
      format: 'date-time',
    },
    startTime: {
      type: 'string',
      example: '09:00',
    },
    endTime: {
      type: 'string',
      example: '12:00',
    },
    isBooked: { type: 'boolean' },
  },
};

const scheduleInput = {
  type: 'object',
  required: [
    'doctorId',
    'date',
    'startTime',
    'endTime',
  ],
  properties: {
    doctorId: { type: 'string' },
    date: dateSchema,
    startTime: {
      type: 'string',
      example: '09:00',
    },
    endTime: {
      type: 'string',
      example: '12:00',
    },
  },
};

const doctorInput = {
  type: 'object',
  required: [
    'docName',
    'specialization',
    'department',
    'phone',
  ],
  properties: {
    docName: {
      type: 'string',
      example: 'นพ. สมชาย ใจดี',
    },
    specialization: {
      type: 'string',
      example: 'อายุรกรรม',
    },
    department: {
      type: 'string',
      example: 'อายุรกรรม',
    },
    phone: {
      type: 'string',
      example: '0891234567',
    },
  },
};

const patientAppointment = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    appointmentDate: {
      type: 'string',
      format: 'date-time',
    },
    status: {
      type: 'string',
      example: 'pending',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    doctor,
    service: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        serviceName: { type: 'string' },
        durationMinutes: { type: 'integer' },
        price: { type: 'number' },
      },
    },
  },
};

module.exports = {
  // 1. ค้นหาแพทย์
  '/api/v1/doctors': {
    get: {
      tags: ['Doctors'],
      summary: 'ค้นหาแพทย์และตารางออกตรวจ (Public)',
      description:
        'ไม่ต้องเข้าสู่ระบบ สามารถกรองตารางออกตรวจด้วยวันที่ตามเวลาไทย',
      parameters: [{
        name: 'date',
        in: 'query',
        schema: dateSchema,
        description: 'วันที่ที่ต้องการดู YYYY-MM-DD',
      }],
      responses: {
        200: {
          description: 'รายชื่อแพทย์พร้อมตารางออกตรวจ',
          content: json({
            type: 'array',
            items: {
              ...doctor,
              properties: {
                ...doctor.properties,
                schedules: {
                  type: 'array',
                  items: schedule,
                },
              },
            },
          }),
        },
        400: error('วันที่ไม่ถูกต้อง'),
        500: error('โหลดรายชื่อแพทย์ไม่สำเร็จ'),
      },
    },
  },

  // 2. ตรวจสอบเวลาว่าง
  '/api/v1/appointments/availability': {
    get: {
      tags: ['Appointments'],
      summary: 'ตรวจสอบช่วงเวลาว่างสำหรับจอง (Public)',
      description:
        'ระบบคำนวณช่วงเวลาจองทุก 30 นาที และตรวจสอบเวลาที่ถูกจองไปแล้ว',
      parameters: [
        {
          name: 'doctorId',
          in: 'query',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'date',
          in: 'query',
          required: true,
          schema: dateSchema,
        },
        {
          name: 'serviceId',
          in: 'query',
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: {
          description: 'รายการช่วงเวลาที่จองได้',
          content: json({
            type: 'object',
            properties: {
              date: dateSchema,
              doctor,
              service: {
                type: 'object',
                nullable: true,
              },
              durationMinutes: {
                type: 'integer',
              },
              slots: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    scheduleId: { type: 'string' },
                    startTime: {
                      type: 'string',
                      example: '09:00',
                    },
                    endTime: {
                      type: 'string',
                      example: '09:30',
                    },
                  },
                },
              },
            },
          }),
        },
        400: error('ข้อมูลที่ใช้ค้นหาไม่ถูกต้อง'),
        404: error('ไม่พบแพทย์'),
        409: error('แพทย์ไม่เปิดรับนัดหมาย'),
        500: error('เกิดข้อผิดพลาดในระบบจอง'),
      },
    },
  },

  // 3. จองนัดหมาย
  '/api/v1/appointments': {
    post: {
      tags: ['Appointments'],
      summary: 'จองนัดหมายแพทย์ (PATIENT)',
      description:
        'ใช้ patientId จาก JWT โดยนัดหมายใหม่เริ่มต้นที่สถานะ pending และรอ Doctor ยืนยัน',
      security: auth,
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          required: [
            'doctorId',
            'date',
            'time',
          ],
          properties: {
            doctorId: {
              type: 'string',
            },
            date: dateSchema,
            time: {
              type: 'string',
              example: '13:00',
            },
            serviceId: {
              type: 'string',
              nullable: true,
            },
          },
        }),
      },
      responses: {
        201: {
          description: 'บันทึกนัดหมายแล้ว รอการยืนยัน',
          content: json({
            type: 'object',
            properties: {
              message: {
                type: 'string',
              },
              appointment: patientAppointment,
              referenceCode: {
                type: 'string',
                description: 'Appointment UUID',
              },
            },
          }),
        },
        400: error('ข้อมูลจองไม่ถูกต้อง'),
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ PATIENT'),
        404: error('ไม่พบแพทย์'),
        409: error('ช่วงเวลาไม่ว่างหรือแพทย์ไม่รับนัด'),
        500: error('จองนัดหมายไม่สำเร็จ'),
      },
    },
  },

  // 4. ประวัตินัดหมายผู้ป่วย
  '/api/v1/appointments/my': {
    get: {
      tags: ['Appointments'],
      summary: 'ดูประวัตินัดหมายของตนเอง (PATIENT)',
      description:
        'ดึงประวัติจากบัญชีผู้ป่วยที่เข้าสู่ระบบ ไม่รับ patientId จาก Client',
      security: auth,
      responses: {
        200: {
          description: 'ประวัตินัดหมาย',
          content: json({
            type: 'array',
            items: patientAppointment,
          }),
        },
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ PATIENT'),
        500: error('โหลดประวัติไม่สำเร็จ'),
      },
    },
  },

  // 5. ยกเลิกนัดหมาย
  '/api/v1/appointments/{id}/cancel': {
    patch: {
      tags: ['Appointments'],
      summary: 'ยกเลิกนัดหมายของตนเอง (PATIENT)',
      description:
        'ยกเลิกได้เฉพาะนัดหมายของตนเอง ก่อนเวลานัด และในสถานะ pending, confirmed หรือ approved',
      security: auth,
      parameters: [idParam],
      responses: {
        200: {
          description: 'ยกเลิกสำเร็จ',
          content: json({
            type: 'object',
            properties: {
              message: {
                type: 'string',
              },
              appointment: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: {
                    type: 'string',
                    example: 'cancelled',
                  },
                },
              },
            },
          }),
        },
        400: error('รหัสนัดหมายไม่ถูกต้อง'),
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ PATIENT'),
        404: error('ไม่พบนัดหมายของคุณ'),
        409: error('ไม่สามารถยกเลิกนัดหมายนี้ได้'),
        500: error('ยกเลิกนัดหมายไม่สำเร็จ'),
      },
    },
  },

  // 6. จัดการข้อมูลแพทย์ของ Admin
  '/api/v1/admin/doctors': {
    get: {
      tags: ['Admin Doctors'],
      summary: 'ดูข้อมูลแพทย์ทั้งหมด (ADMIN)',
      security: auth,
      responses: {
        200: {
          description: 'รายชื่อแพทย์ทั้งหมด',
          content: json({
            type: 'array',
            items: doctor,
          }),
        },
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ ADMIN'),
        500: error('โหลดข้อมูลแพทย์ไม่สำเร็จ'),
      },
    },
    post: {
      tags: ['Admin Doctors'],
      summary: 'เพิ่มข้อมูลแพทย์ (ADMIN)',
      security: auth,
      requestBody: {
        required: true,
        content: json(doctorInput),
      },
      responses: {
        201: {
          description: 'เพิ่มแพทย์สำเร็จ',
        },
        400: error('ข้อมูลแพทย์ไม่ถูกต้อง'),
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ ADMIN'),
        500: error('เพิ่มแพทย์ไม่สำเร็จ'),
      },
    },
  },

  // 7. แก้ข้อมูลแพทย์
  '/api/v1/admin/doctors/{id}': {
    patch: {
      tags: ['Admin Doctors'],
      summary: 'แก้ไขข้อมูลแพทย์ (ADMIN)',
      description:
        'การเปลี่ยนชื่อหรือปิดรับนัดอาจถูกปฏิเสธ หากยังมีบริการหรือนัดหมายที่เกี่ยวข้อง',
      security: auth,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: json({
          type: 'object',
          properties: {
            ...doctorInput.properties,
            status: {
              type: 'string',
              enum: [
                'active',
                'inactive',
                'archived',
              ],
            },
          },
        }),
      },
      responses: {
        200: { description: 'แก้ไขสำเร็จ' },
        400: error('ข้อมูลไม่ถูกต้อง'),
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ ADMIN'),
        404: error('ไม่พบแพทย์'),
        409: error('มีข้อมูลที่เกี่ยวข้องกับแพทย์อยู่'),
        500: error('แก้ไขข้อมูลแพทย์ไม่สำเร็จ'),
      },
    },
  },

  // 8. ดูและเพิ่มตารางออกตรวจ
  '/api/v1/admin/schedules': {
    get: {
      tags: ['Admin Schedules'],
      summary: 'ดูตารางออกตรวจรายสัปดาห์ (ADMIN)',
      description:
        'week คือวันเริ่มต้นของช่วง 7 วัน ตามเวลาไทย',
      security: auth,
      parameters: [
        {
          name: 'week',
          in: 'query',
          schema: dateSchema,
        },
        {
          name: 'doctorId',
          in: 'query',
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: {
          description: 'ตารางออกตรวจ',
          content: json({
            type: 'array',
            items: {
              ...schedule,
              properties: {
                ...schedule.properties,
                doctor,
              },
            },
          }),
        },
        400: error('วันที่ไม่ถูกต้อง'),
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ ADMIN'),
        500: error('โหลดตารางไม่สำเร็จ'),
      },
    },
    post: {
      tags: ['Admin Schedules'],
      summary: 'เพิ่มช่วงเวลาออกตรวจ (ADMIN)',
      security: auth,
      requestBody: {
        required: true,
        content: json(scheduleInput),
      },
      responses: {
        201: { description: 'เพิ่มตารางออกตรวจสำเร็จ' },
        400: error('วันที่หรือเวลาไม่ถูกต้อง'),
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ ADMIN'),
        404: error('ไม่พบแพทย์'),
        409: error('ช่วงเวลาออกตรวจทับซ้อน'),
        500: error('เพิ่มตารางไม่สำเร็จ'),
      },
    },
  },

  // 9. แก้ไขและลบตารางออกตรวจ
  '/api/v1/admin/schedules/{id}': {
    patch: {
      tags: ['Admin Schedules'],
      summary: 'แก้ไขตารางออกตรวจ (ADMIN)',
      description:
        'ไม่สามารถแก้ช่วงที่มีการจองแล้ว หรือช่วงที่ทับซ้อนกับตารางอื่น',
      security: auth,
      parameters: [idParam],
      requestBody: {
        required: true,
        content: json(scheduleInput),
      },
      responses: {
        200: { description: 'แก้ไขตารางสำเร็จ' },
        400: error('ข้อมูลไม่ถูกต้อง'),
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ ADMIN'),
        404: error('ไม่พบตารางออกตรวจ'),
        409: error('มีการจองหรือช่วงเวลาทับซ้อน'),
        500: error('แก้ไขตารางไม่สำเร็จ'),
      },
    },
    delete: {
      tags: ['Admin Schedules'],
      summary: 'ลบช่วงออกตรวจ (ADMIN)',
      description:
        'ลบได้เฉพาะช่วงที่ไม่มีนัดหมายใช้งานอยู่',
      security: auth,
      parameters: [idParam],
      responses: {
        204: {
          description: 'ลบตารางสำเร็จ',
        },
        401: error('กรุณาเข้าสู่ระบบ'),
        403: error('เฉพาะ ADMIN'),
        404: error('ไม่พบตารางออกตรวจ'),
        409: error('ช่วงนี้มีการจองอยู่แล้ว'),
        500: error('ลบตารางไม่สำเร็จ'),
      },
    },
  },
};