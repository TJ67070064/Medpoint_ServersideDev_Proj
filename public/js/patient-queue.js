(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { waiting: 'รอตรวจ', in_progress: 'กำลังตรวจ', completed: 'เสร็จสิ้น', pending: 'รอยืนยันนัดหมาย', cancelled: 'ยกเลิกแล้ว', unknown: 'รอตรวจสอบสถานะ' };
  const messages = {
    waiting: 'นัดหมายได้รับการยืนยันแล้ว กรุณารอเจ้าหน้าที่เรียกตรวจ',
    in_progress: 'ถึงคิวของคุณแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อเข้ารับการตรวจ',
    completed: 'การตรวจของคุณเสร็จสิ้นแล้ว',
    pending: 'นัดหมายยังรอการยืนยัน จะแสดงเลขคิวเมื่อได้รับการยืนยันแล้ว หากมีข้อสงสัยกรุณาติดต่อเจ้าหน้าที่',
    cancelled: 'นัดหมายนี้ถูกยกเลิกแล้ว',
    unknown: 'กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบสถานะนัดหมาย',
  };
  const state = { scope: 'active', page: 1, data: null, sequence: 0, stopped: false, renderKey: '', statuses: new Map() };
  let controller, pollTimer, announcementTimer;
  const token = () => localStorage.getItem('medpoint_token');
  const format = (value, options) => new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', ...options }).format(new Date(value));
  function element(tag, className = '', text = '') {
    const node = document.createElement(tag);node.className = className;node.textContent = String(text ?? '');return node;
  }
  function access(message, staff = false) {
    state.stopped = true;state.sequence++;clearTimeout(pollTimer);clearTimeout(announcementTimer);controller?.abort();
    state.data = null;state.statuses.clear();$('my-queues').replaceChildren();$('queue-announcement').hidden = true;
    $('queue-workspace').hidden = true;$('queue-error').hidden = true;
    const link = element('a', 'mt-3 inline-block rounded-xl bg-[#134e6f] px-5 py-2 text-white', staff ? 'เปิดหน้าจัดการคิวของบุคลากร' : 'เข้าสู่ระบบผู้ป่วย');
    link.href = staff ? '/queue.html' : '/auth.html?tab=login';
    $('access-message').replaceChildren(element('p', '', message), link);$('access-message').hidden = false;
    $('refresh-queue').disabled = true;
  }
  function render(data) {
    const renderKey = JSON.stringify([data.ownAppointments, data.pagination, data.scope]);
    if (renderKey !== state.renderKey) {
      const cards = data.ownAppointments.map(item => {
        const rawStatus = item.queueStatus || item.appointmentStatus;
        const status = Object.hasOwn(labels, rawStatus) ? rawStatus : 'unknown';
        const card = element('article', 'overflow-hidden rounded-2xl border border-[#cbdfea] bg-white');
        const head = element('div', 'flex flex-wrap items-center justify-between gap-3 border-b border-[#e0edf5] bg-[#edf7fc] px-6 py-4');
        head.append(element('h2', 'text-lg font-medium', 'คิวของฉัน'), element('span', `badge badge-${status}`, labels[status]));
        const body = element('div', 'p-6 sm:p-8');
        body.append(element('p', 'text-sm text-[#688498]', 'เลขคิวของคุณ'));
        body.append(element('strong', 'queue-number mt-1 block font-semibold text-[#134e6f]', item.queueNumber || '—'));
        if (item.queueNumber) body.append(element('p', 'mt-1 text-sm text-[#688498]', 'เลขคิวสำหรับวันนัดนี้'));
        if (item.comparison && ['waiting', 'in_progress'].includes(status)) {
          const comparison = element('section', 'mt-6 rounded-xl border border-[#cbdfea] bg-[#f5fafc] p-4 sm:p-5');
          comparison.setAttribute('aria-label', 'เทียบคิวกับแพทย์ของคุณ');
          comparison.append(element('h3', 'font-medium', 'คิวของแพทย์ที่คุณนัด · วันนี้'));
          const boxes = element('div', 'mt-4 grid gap-4 sm:grid-cols-2');
          const current = element('div', 'min-w-0');
          const currentNumbers = item.comparison.currentQueueNumbers;
          current.append(element('p', 'text-sm text-[#688498]', 'กำลังตรวจคิว'),
            element('p', 'mt-1 break-words text-3xl font-semibold text-[#087b9a]', currentNumbers.length ? currentNumbers.join(', ') : '—'));
          if (!currentNumbers.length) current.append(element('p', 'mt-2 text-sm text-[#688498]', 'ยังไม่มีคิวกำลังตรวจ'));
          boxes.append(current);
          const ahead = element('div');
          ahead.append(element('p', 'text-sm text-[#688498]', status === 'in_progress' ? 'สถานะของคุณ' : 'คิวรอก่อนคุณ'));
          ahead.append(element('p', 'mt-1 text-3xl font-semibold text-[#134e6f]', status === 'in_progress' ? 'ถึงคิวแล้ว' : `${item.comparison.waitingBefore} คิว`));
          boxes.append(ahead);comparison.append(boxes);
          comparison.append(element('p', 'mt-4 text-sm leading-relaxed text-[#688498]', 'เทียบเฉพาะแพทย์และวันเดียวกัน จำนวนคิวรอไม่รวมคิวกำลังตรวจ เรียงตามเวลานัด ลำดับเรียกจริงอาจเปลี่ยนได้'));
          body.append(comparison);
        } else if (status === 'waiting') {
          body.append(element('p', 'mt-5 text-sm text-[#688498]', 'แสดงการเทียบคิวเมื่อถึงวันนัดของคุณ'));
        }
        const details = element('dl', 'mt-6 grid gap-4 border-t border-[#e6eef5] pt-5 sm:grid-cols-2');
        for (const [label, value] of [
          ['วันที่นัด', format(item.appointmentDate, { dateStyle: 'long' })],
          ['เวลานัด', format(item.appointmentDate, { hour: '2-digit', minute: '2-digit' }) + ' น.'],
          ['แพทย์', item.doctor.docName], ['แผนก', item.doctor.department],
        ]) {
          const group = element('div', 'min-w-0');group.append(element('dt', 'text-sm text-[#688498]', label), element('dd', 'mt-1 break-words font-medium', value));details.append(group);
        }
        body.append(details, element('p', 'mt-6 rounded-xl bg-[#f3f8fc] p-4 leading-relaxed', messages[status]));
        card.append(head, body);return card;
      });
      if (!cards.length) {
        const empty = element('div', 'rounded-2xl border border-[#d9e6ef] bg-white p-8 text-center leading-relaxed');
        empty.append(element('h2', 'text-xl font-medium', state.scope === 'active' ? 'ไม่มีคิววันนี้หรือนัดถัดไป' : 'ยังไม่มีนัดหมายของคุณ'),
          element('p', 'mt-3 text-[#688498]', state.scope === 'active' ? 'หากต้องการดูนัดเก่าหรือนัดที่ยกเลิก ให้เลือก “ทั้งหมดของฉัน”' : 'เมื่อจองนัดแล้ว สถานะนัดหมายจะแสดงที่หน้านี้'));
        cards.push(empty);
      }
      $('my-queues').replaceChildren(...cards);state.renderKey = renderKey;
    }
    for (const item of data.ownAppointments) {
      const previous = state.statuses.get(item.appointmentId);
      if (item.queueStatus === 'in_progress' && previous === 'waiting') {
        $('queue-announcement').textContent = `ถึงคิว ${item.queueNumber} ของคุณแล้ว กรุณาติดต่อเจ้าหน้าที่`;
        $('queue-announcement').hidden = false;clearTimeout(announcementTimer);
        announcementTimer = setTimeout(() => { $('queue-announcement').hidden = true; }, 12000);
      }
      state.statuses.set(item.appointmentId, item.queueStatus);
    }
    state.data = data;state.page = data.pagination.page;
    $('my-queues').setAttribute('aria-busy', 'false');$('queue-workspace').hidden = false;
    $('queue-error').hidden = true;
    $('sync-status').textContent = `อัปเดตล่าสุด ${format(data.updatedAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.`;
    for (const button of $('own-tabs').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.scope === state.scope));
    const p = data.pagination;
    $('pagination').hidden = p.totalPages <= 1;
    $('queue-page-summary').textContent = `นัดหมายของคุณ ${p.total} รายการ`;
    $('queue-page-number').textContent = `${p.page} / ${p.totalPages}`;
    $('queue-previous').disabled = p.page <= 1;$('queue-next').disabled = p.page >= p.totalPages;
  }
  async function load() {
    if (state.stopped) return;
    clearTimeout(pollTimer);controller?.abort();
    const request = ++state.sequence;const currentToken = token();
    if (!currentToken) { access('กรุณาเข้าสู่ระบบด้วยบัญชีผู้ป่วย เพื่อดูสถานะคิวของคุณ');return; }
    $('queue-workspace').hidden = false;
    const abort = new AbortController();controller = abort;
    const timeout = setTimeout(() => abort.abort(), 15000);
    $('refresh-queue').disabled = true;
    try {
      const query = new URLSearchParams({ scope: state.scope, page: String(state.page), limit: '10' });
      const response = await fetch(`/api/v1/patient-queue?${query}`, { headers: { Authorization: `Bearer ${currentToken}` }, cache: 'no-store', signal: abort.signal });
      const data = await response.json();
      if (request !== state.sequence || state.stopped) return;
      if (token() !== currentToken) { access('บัญชีที่เข้าสู่ระบบเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่');return; }
      if (response.status === 401 || response.status === 403) {
        access(data.message || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง', data.code === 'PATIENT_ONLY');return;
      }
      if (!response.ok) throw new Error(data.message || 'โหลดสถานะคิวไม่สำเร็จ');
      if (!Array.isArray(data.ownAppointments) || !data.pagination || data.scope !== state.scope) throw new Error('รูปแบบข้อมูลไม่ถูกต้อง กรุณาตรวจสอบไฟล์ที่ติดตั้ง');
      render(data);
    } catch (error) {
      if (request !== state.sequence || state.stopped) return;
      $('queue-error').textContent = (error.name === 'AbortError' ? 'การเชื่อมต่อใช้เวลานาน กรุณาลองใหม่' : error.message || 'เชื่อมต่อไม่สำเร็จ') + (state.data ? ' กำลังแสดงข้อมูลเดิม โปรดตรวจเวลาอัปเดตล่าสุด' : '');
      $('queue-error').hidden = false;
      $('sync-status').textContent = state.data ? 'ข้อมูลเดิม · ยังอัปเดตไม่ได้' : 'ยังโหลดข้อมูลไม่สำเร็จ';
    } finally {
      clearTimeout(timeout);
      if (request === state.sequence) {
        controller = null;$('refresh-queue').disabled = state.stopped;
        if (!state.stopped && !document.hidden) pollTimer = setTimeout(load, 5000);
      }
    }
  }
  try { renderNavbar('patient-queue'); } catch {
    const home = element('a', 'block p-5 text-2xl font-bold text-[#134e6f]', 'MedPoint');home.href = '/index.html';$('navbar').replaceChildren(home);
  }
  $('refresh-queue').addEventListener('click', load);
  $('own-tabs').addEventListener('click', event => {
    const button = event.target.closest('button[data-scope]');if (!button || state.scope === button.dataset.scope) return;
    state.scope = button.dataset.scope;state.page = 1;
    // Clear the old view when changing filters so a failed request cannot mislabel it.
    state.data = null;state.renderKey = '';state.statuses.clear();$('my-queues').replaceChildren();$('pagination').hidden = true;
    for (const tab of $('own-tabs').querySelectorAll('button')) tab.setAttribute('aria-pressed', String(tab === button));
    $('sync-status').textContent = 'กำลังโหลดสถานะคิว…';load();
  });
  $('queue-previous').addEventListener('click', () => { if (state.page > 1) { state.page--;load(); } });
  $('queue-next').addEventListener('click', () => { if (state.data && state.page < state.data.pagination.totalPages) { state.page++;load(); } });
  document.addEventListener('visibilitychange', () => { clearTimeout(pollTimer);if (!document.hidden) load(); });
  window.addEventListener('online', load);
  window.addEventListener('storage', event => { if (event.key === 'medpoint_token' || event.key === null) location.reload(); });
  window.addEventListener('pagehide', () => { state.stopped = true;state.sequence++;clearTimeout(pollTimer);clearTimeout(announcementTimer);controller?.abort(); });
  load();
})();
