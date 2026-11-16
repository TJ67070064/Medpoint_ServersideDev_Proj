const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'MEDPOINT API Documentation',
    version: '1.0.0',
    description: 'ระบบนัดหมายแพทย์และคลินิกออนไลน์ - Server-Side Web Development',
  },
  servers: [{ url: 'http://localhost:5000' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  paths: {
    '/api/v1/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'สมัครสมาชิกใหม่ (Public)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  full_name: { type: 'string', example: 'สมหมาย ใจดี' },
                  email: { type: 'string', example: 'user@medpoint.com' },
                  password: { type: 'string', example: '123456' },
                  phone: { type: 'string', example: '0899998888' },
                  role: { type: 'string', example: 'PATIENT' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'เข้าสู่ระบบเพื่อรับ JWT Token (Public)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', example: 'admin@medpoint.com' },
                  password: { type: 'string', example: '123456' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/v1/services': {
      get: {
        tags: ['Services'],
        summary: 'ดูรายการบริการ/แพ็กเกจและราคา (Public)',
        responses: { 200: { description: 'OK' } },
      },
      post: {
        tags: ['Services'],
        summary: 'เพิ่มรายการบริการใหม่ (Admin)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  serviceName: { type: 'string', example: 'ตรวจสุขภาพประจำปี Basic' },
                  docName: { type: 'string', example: 'นพ. สมชาย ใจดี' },
                  durationMinutes: { type: 'integer', example: 60 },
                  price: { type: 'number', example: 2500 },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/v1/services/{id}': {
      patch: {
        tags: ['Services'],
        summary: 'แก้ไขรายละเอียดหรือราคาบริการ (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  serviceName: { type: 'string', example: 'ตรวจสุขภาพประจำปี Plus' },
                  price: { type: 'number', example: 3200 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'OK' } },
      },
      delete: {
        tags: ['Services'],
        summary: 'ปิดใช้งานบริการแบบ Soft Delete (Admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'No Content' } },
      },
    },
    '/api/v1/screenings/rules': {
      get: {
        tags: ['Screenings'],
        summary: 'ดูรายการคำถามคัดกรองอาการ (Public)',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/v1/screenings': {
      post: {
        tags: ['Screenings'],
        summary: 'ส่งแบบฟอร์มคัดกรองอาการเบื้องต้น (Patient)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  complaint: { type: 'string', example: 'เจ็บหน้าอก' },
                  answerYes: { type: 'boolean', example: true },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/v1/screenings': {
      post: {
        tags: ['Screenings'],
        summary: 'ส่งแบบฟอร์มคัดกรองอาการแบบละเอียด (Patient)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  complaint: { type: 'string', example: 'เจ็บแน่นหน้าอก / หายใจลำบาก' },
                  answerYes: { type: 'boolean', example: true },
                  painLevel: { type: 'integer', example: 8 },
                  duration: { type: 'string', example: 'เพิ่งเป็นวันนี้' },
                  additionalSymptoms: {
                    type: 'array',
                    items: { type: 'string' },
                    example: ['หายใจเหนื่อยหอบ'],
                  },
                  note: { type: 'string', example: 'เริ่มเจ็บช่วงเช้าหลังเดินขึ้นบันได' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/v1/screenings/history': {
      get: {
        tags: ['Screenings'],
        summary: 'ดูประวัติการคัดกรองอาการย้อนหลังของตนเอง (Patient)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'ตรวจสอบ Token และดูข้อมูลผู้ใช้ปัจจุบัน (Authenticated)',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
      },
    },
  },
};

module.exports = swaggerDocument;