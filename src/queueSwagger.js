const appointment = {
  type: 'object', properties: {
    id: { type: 'string' }, queueNumber: { type: 'string', example: 'A001', description: 'Display sequence per clinic date; use id for writes' },
    appointmentDate: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['confirmed', 'in_progress', 'completed'] },
    queueStatus: { type: 'string', enum: ['waiting', 'in_progress', 'completed'] },
    patient: { type: 'object', properties: { id: { type: 'string' }, full_name: { type: 'string' } } },
    doctor: { type: 'object', properties: { id: { type: 'string' }, docName: { type: 'string' }, department: { type: 'string' } } },
    service: { type: 'object', nullable: true, properties: { id: { type: 'string' }, serviceName: { type: 'string' } } },
  },
};
const error = description => ({ description, content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' } } } } } });
module.exports = {
  '/api/v1/queue': { get: {
    tags: ['Queue'], summary: 'รายการคิวและสถิติ (ADMIN / DOCTOR_STAFF)',
    description: 'Asia/Bangkok clinic dates. confirmed = waiting; pending/cancelled appointments do not enter the queue. All staff can manage all doctors because the existing schema has no staff-to-doctor mapping. Statistics ignore search/status/page but respect date/department/doctor. current/next ignore search/status/page. No cache.',
    security: [{ bearerAuth: [] }],
    parameters: [
      { name: 'date', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Defaults to today in Asia/Bangkok' },
      ...['doctorId', 'department', 'q'].map(name => ({ name, in: 'query', schema: { type: 'string', maxLength: 200 } })),
      { name: 'status', in: 'query', schema: { type: 'string', enum: ['all', 'waiting', 'in_progress', 'completed'], default: 'all' } },
      { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 5 } },
    ],
    responses: {
      200: { description: 'Daily queue snapshot', content: { 'application/json': { schema: { type: 'object', properties: {
        date: { type: 'string', format: 'date' }, today: { type: 'string', format: 'date' }, updatedAt: { type: 'string', format: 'date-time' },
        items: { type: 'array', items: appointment },
        counts: { type: 'object', properties: Object.fromEntries(['all', 'waiting', 'in_progress', 'completed'].map(k => [k, { type: 'integer' }])) },
        pendingCount: { type: 'integer' }, busyDoctorIds: { type: 'array', items: { type: 'string' } },
        pagination: { type: 'object', properties: Object.fromEntries(['page', 'limit', 'total', 'totalPages'].map(k => [k, { type: 'integer' }])) },
        doctors: { type: 'array', items: appointment.properties.doctor }, focusDoctor: { ...appointment.properties.doctor, nullable: true },
        current: { ...appointment, nullable: true }, next: { ...appointment, nullable: true },
      } } } } },
      400: error('Invalid filters/date'), 401: error('Missing JWT'), 403: error('Expired JWT, denied or revoked role'), 503: error('Database unavailable'),
    },
  } },
  '/api/v1/queue/{id}/status': { patch: {
    tags: ['Queue'], summary: 'เรียกเข้าตรวจ / ตรวจเสร็จสิ้น (ADMIN / DOCTOR_STAFF)',
    description: 'Only today in Bangkok. confirmed → in_progress → completed. One active examination per doctor, protected by PostgreSQL transaction advisory lock. Writes use a status compare-and-set. Creates one patient Notification in the same transaction. Repeating the current target status is idempotent. On network timeout reload the queue before retrying.',
    security: [{ bearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { required: true, content: { 'application/json': { schema: {
      type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['in_progress', 'completed'] } },
    } } } },
    responses: {
      200: { description: 'Status persisted', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string' }, item: appointment } } } } },
      400: error('Invalid target'), 401: error('Missing JWT'), 403: error('Denied role or token'), 404: error('Appointment not found'),
      409: error('Doctor busy, wrong day or invalid/stale status transition'), 503: error('Update failed; reload before retry'),
    },
  } },
};
