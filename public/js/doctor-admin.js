/* MEDPOINT: เพิ่ม Admin controls ใน doctors.html เดิม ไม่สร้างหน้าใหม่และไม่แก้ระบบจอง Patient */
(() => {
  const { token, user } = getAuth();
  if (!token || user?.role !== 'ADMIN') return;

  const $ = id => document.getElementById(id);
  const api = `${API_URL}/admin`;
  const ONE_DAY_MS = 86400000;
  let adminDoctorList = [];
  let schedules = [];
  let weekStart = monday(todayBangkok());
  let scheduleVisible = false;

  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = todayBangkok;
  function todayBangkok() { return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); }
  function dateBangkok(value) { return new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 10); }
  function addDays(date, n) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function monday(date) { const d = new Date(`${date}T12:00:00Z`); return addDays(date, -((d.getUTCDay() + 6) % 7)); }
  function thaiDate(date) { return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)); }
  function notify(message, isError = false) {
    const element = $('admin-message');
    element.className = `mb-5 rounded-xl px-4 py-3 text-sm border ${isError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`;
    element.textContent = message;
    element.classList.remove('hidden');
  }
  async function request(path, options = {}) {
    const res = await fetch(`${api}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (!res.ok) {
      let data = {}; try { data = await res.json(); } catch (_) { }
      throw new Error(data.message || `HTTP ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  }
  const findDoctor = id => adminDoctorList.find(doc => doc.id === id);
  function updateDoctorOptions() {
    const filter = $('admin-schedule-doctor-filter');
    const current = filter.value;
    filter.replaceChildren(new Option('แพทย์ทั้งหมด', ''));
    for (const d of adminDoctorList) filter.add(new Option(d.docName, d.id));
    if (adminDoctorList.some(d => d.id === current)) filter.value = current;
    const select = $('admin-schedule-doctor');
    const selected = select.value;
    select.replaceChildren(new Option('เลือกแพทย์', ''));
    for (const d of adminDoctorList.filter(d => d.status === 'active')) select.add(new Option(d.docName, d.id));
    if (adminDoctorList.some(d => d.id === selected && d.status === 'active')) select.value = selected;
  }
  async function loadAdminDoctors() {
    adminDoctorList = await request('/doctors');
    updateDoctorOptions();
  }
  async function refreshDoctors() {
    await loadAdminDoctors();
    await loadDoctors(); // ตัวโหลดเดิมของหน้า Patient; ไม่เปลี่ยน Logic ค้นหา/กรอง/จอง
    if (scheduleVisible) await loadSchedules();
  }
  function showSchedule(doctorId = '') {
    scheduleVisible = true;
    $('doctor-directory').classList.add('hidden');
    $('admin-schedule-panel').classList.remove('hidden');
    $('doctor-page-title').textContent = 'ตารางออกตรวจ';
    $('admin-add-doctor').classList.add('hidden');
    $('admin-view-label').textContent = 'กลับไปรายชื่อแพทย์';
    $('admin-switch-view').querySelector('i')?.setAttribute('data-lucide', 'arrow-left');
    if (doctorId) $('admin-schedule-doctor-filter').value = doctorId;
    if (window.lucide) window.lucide.createIcons();
    loadSchedules();
  }
  function showDirectory() {
    scheduleVisible = false;
    $('doctor-directory').classList.remove('hidden');
    $('admin-schedule-panel').classList.add('hidden');
    $('doctor-page-title').textContent = 'ค้นหาแพทย์';
    $('admin-add-doctor').classList.remove('hidden');
    $('admin-view-label').textContent = 'จัดการตารางออกตรวจ';
    $('admin-switch-view').querySelector('i')?.setAttribute('data-lucide', 'calendar-days');
    if (window.lucide) window.lucide.createIcons();
  }
  $('admin-switch-view').addEventListener('click', () => scheduleVisible ? showDirectory() : showSchedule());
  $('admin-add-doctor').addEventListener('click', () => openDoctorModal());
  $('admin-add-schedule').addEventListener('click', () => openScheduleModal());

  // ปุ่มแก้ไข/เปิด-ปิด/ตารางเวลาเพิ่มบนการ์ดเดิมของ Patient เฉพาะ Admin
  $('doctor-list').addEventListener('click', async e => {
    const button = e.target.closest('[data-admin-action]');
    if (!button) return;
    const doctorId = button.dataset.adminDoctorId;
    const doc = findDoctor(doctorId);
    if (!doc) { notify('ไม่พบข้อมูลแพทย์ในระบบ Admin กรุณารีเฟรชหน้า', true); return; }
    if (button.dataset.adminAction === 'edit') { openDoctorModal(doc); return; }
    if (button.dataset.adminAction === 'schedule') { showSchedule(doctorId); return; }
    if (button.dataset.adminAction === 'toggle') {
      const status = doc.status === 'active' ? 'inactive' : 'active';
      if (!confirm(`${status === 'inactive' ? 'ปิดรับนัด' : 'เปิดรับนัด'}แพทย์ ${doc.docName}?`)) return;
      try { await request(`/doctors/${encodeURIComponent(doctorId)}`, { method: 'PATCH', body: JSON.stringify({ status }) }); notify('อัปเดตสถานะแพทย์แล้ว'); await refreshDoctors(); }
      catch (err) { notify(err.message, true); }
    }

    if (button.dataset.adminAction === 'archive') {
      if (!confirm(`นำ ${doc.docName} ออกจากรายชื่อแพทย์?\nข้อมูลและประวัตินัดหมายจะยังถูกเก็บไว้`)) return;

      try {
        await request(`/doctors/${encodeURIComponent(doctorId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'archived' }),
        });

        notify('นำแพทย์ออกจากรายชื่อแล้ว');
        await refreshDoctors();
      } catch (err) {
        notify(err.message, true);
      }
    }

  });

  function openDoctorModal(doc = null) {
    $('admin-doctor-form').reset();
    $('admin-doctor-id').value = doc?.id || '';
    $('admin-doctor-modal-title').textContent = doc ? 'แก้ไขข้อมูลแพทย์' : 'เพิ่มแพทย์';
    $('admin-doctor-name').value = doc?.docName || '';
    $('admin-doctor-specialization').value = doc?.specialization || '';
    $('admin-doctor-department').value = doc?.department || '';
    $('admin-doctor-phone').value = doc?.phone || '';
    $('admin-doctor-modal').classList.remove('hidden');
    $('admin-doctor-name').focus();
  }
  const closeDoctorModal = () => $('admin-doctor-modal').classList.add('hidden');
  $('admin-close-doctor').addEventListener('click', closeDoctorModal);
  $('admin-cancel-doctor').addEventListener('click', closeDoctorModal);
  $('admin-doctor-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('admin-doctor-id').value;
    const payload = { docName: $('admin-doctor-name').value.trim(), specialization: $('admin-doctor-specialization').value.trim(), department: $('admin-doctor-department').value.trim(), phone: $('admin-doctor-phone').value.trim() };
    const button = $('admin-doctor-submit'); button.disabled = true;
    try {
      await request(id ? `/doctors/${encodeURIComponent(id)}` : '/doctors', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      closeDoctorModal(); notify(id ? 'แก้ไขข้อมูลแพทย์แล้ว' : 'เพิ่มแพทย์แล้ว'); await refreshDoctors();
    } catch (err) { notify(err.message, true); } finally { button.disabled = false; }
  });

  async function loadSchedules() {
    try {
      const params = new URLSearchParams({ week: weekStart });
      const selected = $('admin-schedule-doctor-filter').value;
      if (selected) params.set('doctorId', selected);
      schedules = await request(`/schedules?${params.toString()}`);
      renderScheduleGrid();
    } catch (err) { notify(err.message, true); }
  }
  const days = ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์', 'อาทิตย์'];
  function renderScheduleGrid() {
    $('admin-week-label').textContent = `${thaiDate(weekStart)} – ${thaiDate(addDays(weekStart, 6))}`;
    $('admin-schedule-count').textContent = `${schedules.length} ช่วงออกตรวจ`;
    $('admin-week-grid').innerHTML = days.map((day, i) => {
      const date = addDays(weekStart, i);
      const daySchedules = schedules.filter(s => dateBangkok(s.availableDate) === date);
      return `<div class="rounded-2xl border border-[#E4EDF4] bg-[#FCFEFF] p-3 min-h-48">
        <h4 class="font-semibold text-sm text-[#022F56]">${day}</h4>
        <p class="text-xs text-[#718497] mt-1 mb-3">${thaiDate(date)}</p>
        ${daySchedules.length ? daySchedules.map(s => `<div class="bg-[#EAF6FC] rounded-lg border-l-[3px] border-[#488DB4] p-2.5 text-xs mb-2">
          <div class="font-semibold text-[#165B7B]">${escape(s.startTime)}–${escape(s.endTime)}</div>
          <div class="text-slate-600 mt-1 break-words">${escape(s.doctor?.docName)}</div>
          <div class="flex flex-wrap gap-3 mt-2">
            <button type="button" data-schedule-action="edit" data-schedule-id="${escape(s.id)}" class="font-semibold text-[#165B7B] hover:underline">แก้ไข</button>
            <button type="button" data-schedule-action="delete" data-schedule-id="${escape(s.id)}" class="font-semibold text-rose-700 hover:underline">ลบ</button>
          </div></div>`).join('') : '<p class="text-xs text-[#718497]">ไม่มีช่วงออกตรวจ</p>'}</div>`;
    }).join('');
  }
  $('admin-schedule-doctor-filter').addEventListener('change', loadSchedules);
  $('admin-prev-week').addEventListener('click', () => { weekStart = addDays(weekStart, -7); loadSchedules(); });
  $('admin-next-week').addEventListener('click', () => { weekStart = addDays(weekStart, 7); loadSchedules(); });
  $('admin-week-grid').addEventListener('click', async e => {
    const button = e.target.closest('[data-schedule-action]');
    if (!button) return;
    const slot = schedules.find(s => s.id === button.dataset.scheduleId);
    if (!slot) return;
    if (button.dataset.scheduleAction === 'edit') { openScheduleModal(slot); return; }
    if (!confirm(`ลบช่วงออกตรวจ ${slot.startTime}–${slot.endTime} ของ ${slot.doctor?.docName}?\nรายการที่มีคนจองแล้วจะลบไม่ได้`)) return;
    try { await request(`/schedules/${encodeURIComponent(slot.id)}`, { method: 'DELETE' }); notify('ลบช่วงออกตรวจแล้ว'); await Promise.all([loadSchedules(), loadDoctors()]); }
    catch (err) { notify(err.message, true); }
  });
  function openScheduleModal(slot = null) {
    $('admin-schedule-form').reset();
    $('admin-schedule-id').value = slot?.id || '';
    $('admin-schedule-modal-title').textContent = slot ? 'แก้ไขช่วงออกตรวจ' : 'เพิ่มช่วงออกตรวจ';
    $('admin-schedule-date').min = today();
    $('admin-schedule-date').value = slot ? dateBangkok(slot.availableDate) : today();
    $('admin-schedule-start').value = slot?.startTime || '09:00';
    $('admin-schedule-end').value = slot?.endTime || '12:00';
    const preferred = slot?.doctorId || $('admin-schedule-doctor-filter').value;
    if (preferred && [...$('admin-schedule-doctor').options].some(o => o.value === preferred)) $('admin-schedule-doctor').value = preferred;
    $('admin-schedule-modal').classList.remove('hidden');
  }
  const closeScheduleModal = () => $('admin-schedule-modal').classList.add('hidden');
  $('admin-close-schedule').addEventListener('click', closeScheduleModal);
  $('admin-cancel-schedule').addEventListener('click', closeScheduleModal);
  $('admin-schedule-form').addEventListener('submit', async e => {
    e.preventDefault();
    const id = $('admin-schedule-id').value;
    const payload = { doctorId: $('admin-schedule-doctor').value, date: $('admin-schedule-date').value, startTime: $('admin-schedule-start').value, endTime: $('admin-schedule-end').value };
    if (payload.startTime >= payload.endTime) { notify('เวลาเริ่มต้องมาก่อนเวลาสิ้นสุด', true); return; }
    const button = $('admin-schedule-submit'); button.disabled = true;
    try {
      await request(id ? `/schedules/${encodeURIComponent(id)}` : '/schedules', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      closeScheduleModal(); weekStart = monday(payload.date); notify(id ? 'แก้ไขช่วงออกตรวจแล้ว' : 'เพิ่มช่วงออกตรวจแล้ว'); await Promise.all([loadSchedules(), loadDoctors()]);
    } catch (err) { notify(err.message, true); } finally { button.disabled = false; }
  });
  for (const id of ['admin-doctor-modal', 'admin-schedule-modal']) $(id).addEventListener('click', e => { if (e.target.id === id) $(id).classList.add('hidden'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDoctorModal(); closeScheduleModal(); } });

  // ห้ามเปิดเครื่องมือก่อนยืนยันสิทธิ์กับ Backend ด้วย JWT
  loadAdminDoctors().then(() => {
    $('admin-doctor-label').classList.remove('hidden');
    $('admin-doctor-actions').classList.remove('hidden');
    adminDoctorReady = true;
    renderDoctors();
    if (window.lucide) window.lucide.createIcons();
  }).catch(err => { notify(`โหลดข้อมูล Admin ไม่สำเร็จ: ${err.message} (ตรวจว่า Server โหลด adminDoctorRoutes แล้ว)`, true); });
})();
