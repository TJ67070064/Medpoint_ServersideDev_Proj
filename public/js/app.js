const API_URL = '/api/v1';

function getAuth() {
  const token = localStorage.getItem('medpoint_token');
  const userStr = localStorage.getItem('medpoint_user');
  const user = userStr ? JSON.parse(userStr) : null;
  return { token, user };
}

function logout() {
  localStorage.removeItem('medpoint_token');
  localStorage.removeItem('medpoint_user');
  window.location.href = '/auth.html';
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function toggleMobileDrawer() {
  const drawer = document.getElementById('nav-drawer');
  if (drawer) drawer.classList.toggle('hidden');
}

function toggleUserMenu() {
  const menu = document.getElementById('user-dropdown');
  if (menu) menu.classList.toggle('hidden');
}

async function verifySession() {
  const { token } = getAuth();
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 || res.status === 403) {
      localStorage.removeItem('medpoint_token');
      localStorage.removeItem('medpoint_user');
      if (window.location.pathname !== '/auth.html') {
        window.location.href = '/auth.html';
      }
    } else if (res.ok) {
      const data = await res.json();
      localStorage.setItem('medpoint_user', JSON.stringify(data.user));
    }
  } catch (err) {
    console.error('Session verify error:', err);
  }
}

function renderNavbar(activePage) {
  const { user } = getAuth();
  const nav = document.getElementById('navbar');
  if (!nav) return;

  const isAdmin = user && user.role === 'ADMIN';
  const isDoctor = user && user.role === 'DOCTOR_STAFF';
  const canManageQueue = user && ['ADMIN', 'DOCTOR_STAFF'].includes(user.role);

  const linkClass = (page) =>
    activePage === page
      ? 'text-[#134E6F] font-semibold'
      : 'text-slate-500 hover:text-[#134E6F] transition';

  const initial = user ? user.full_name.charAt(0).toUpperCase() : '';

  nav.innerHTML = `
    <div class="w-full max-w-none mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-4">
        <button onclick="toggleMobileDrawer()" class="p-2 rounded-lg text-[#1E3A5F] hover:bg-slate-100 transition" title="เมนูเพิ่มเติม">
          <i data-lucide="menu" class="w-6 h-6 stroke-[2.3]"></i>
        </button>
        <a href="/index.html" class="text-2xl font-bold tracking-tight text-slate-900">
          MedPoint
        </a>
      </div>

      <div class="flex items-center gap-6 md:gap-8">
        <nav class="hidden md:flex items-center gap-7 text-[15px]">
          ${!isDoctor ? `
            <a href="/index.html" class="${linkClass('home')}">หน้าหลัก</a>
            <a href="/doctors.html" class="${linkClass('doctors')}">ค้นหาแพทย์</a>
            <a href="/screening.html" class="${linkClass('screening')}">คัดกรองอาการ</a>
            <a href="/services.html" class="${linkClass('services')}">บริการและแพ็กเกจ</a>
          ` : ''}

          ${user && user.role === 'PATIENT' ? `
            <a href="/patient-queue.html" class="${linkClass('patient-queue')}">ติดตามคิวของฉัน</a>
          ` : ''}

          ${canManageQueue ? `
            <a href="/queue.html" class="${linkClass('queue')}">จัดการคิวตรวจ</a>
          ` : ''}

          ${isAdmin ? `
            <a href="/users.html" class="${linkClass('users')}">จัดการบุคลากร</a>
            <a href="/api-docs" target="_blank" class="text-slate-500 hover:text-[#134E6F] transition">API Docs</a>
          ` : ''}
        </nav>

        <div class="flex items-center gap-3.5 relative">
          <button onclick="alert('ระบบแจ้งเตือน: เชื่อมต่อฐานข้อมูล MedPoint พร้อมใช้งาน')" class="p-2 rounded-full text-slate-700 hover:bg-slate-100 transition relative" title="การแจ้งเตือน">
            <i data-lucide="bell" class="w-5 h-5 stroke-[2]"></i>
            <span class="w-2 h-2 rounded-full bg-rose-500 absolute top-2 right-2"></span>
          </button>

          ${user
            ? `
              <button onclick="toggleUserMenu()" class="w-10 h-10 rounded-full bg-[#4B8FB8] hover:bg-[#3B7CA3] text-white font-semibold text-base flex items-center justify-center shadow-sm transition">
                ${initial}
              </button>
              <div id="user-dropdown" class="hidden absolute right-0 top-14 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-50">
                <div class="pb-3 border-b border-slate-100">
                  <div class="font-semibold text-slate-900 text-sm">${user.full_name}</div>
                  <div class="text-xs text-slate-500">${user.email}</div>
                  <span class="inline-block mt-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                    isAdmin
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-[#DCEEF7] text-[#134E6F]'
                  }">${user.role}</span>
                </div>

                <div class="pt-2 space-y-1">
                  ${isDoctor ? `
                    <a href="/queue.html" class="block px-3 py-2 text-sm text-[#134E6F] font-medium hover:bg-slate-50 rounded-lg">
                      จัดการคิวตรวจ
                    </a>
                  ` : isAdmin ? `
                    <a href="/doctors.html" class="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                      จัดการข้อมูลแพทย์ / ตารางออกตรวจ
                    </a>
                    <a href="/services.html" class="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                      จัดการบริการและแพ็กเกจ
                    </a>
                    <a href="/queue.html" class="block px-3 py-2 text-sm text-[#134E6F] hover:bg-slate-50 rounded-lg">
                      จัดการคิวตรวจ (ดูสถานะ)
                    </a>
                    <a href="/users.html" class="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                      จัดการบัญชีแพทย์ / บุคลากร
                    </a>
                    <a href="/api-docs" target="_blank" class="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                      เปิด Swagger API Docs
                    </a>
                  ` : `
                    <a href="/services.html" class="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                      บริการและแพ็กเกจ
                    </a>
                    <a href="/screening.html" class="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                      แบบฟอร์มคัดกรอง
                    </a>
                    <a href="/patient-queue.html" class="block px-3 py-2 text-sm text-[#134E6F] hover:bg-slate-50 rounded-lg">
                      ติดตามคิวของฉัน
                    </a>
                    <a href="/appointments.html" class="block px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                      ประวัติการนัดหมาย
                    </a>
                  `}

                  <button onclick="logout()" class="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg font-medium">
                    ออกจากระบบ
                  </button>
                </div>
              </div>
            `
            : `
              <a href="/auth.html" class="bg-[#134E6F] hover:bg-[#0E3A53] text-white text-sm font-medium px-4 py-2 rounded-xl transition">
                เข้าสู่ระบบ
              </a>
            `
          }
        </div>
      </div>
    </div>

    <div id="nav-drawer" class="hidden bg-white border-t border-slate-100 px-6 py-4 shadow-md">
      <div class="max-w-6xl mx-auto flex flex-wrap gap-4 text-sm">
        ${isDoctor ? `
          <a href="/queue.html" class="px-3 py-1.5 rounded-lg bg-[#DCEEF7] text-[#134E6F] font-medium">
            จัดการคิวตรวจ
          </a>
        ` : isAdmin ? `
          <a href="/doctors.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
            ค้นหาแพทย์
          </a>
          <a href="/services.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
            บริการและแพ็กเกจ
          </a>
          <a href="/queue.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
            จัดการคิวตรวจ (ดูสถานะ)
          </a>
          <a href="/users.html" class="px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 font-medium">
            จัดการบุคลากร
          </a>
          <a href="/api-docs" target="_blank" class="px-3 py-1.5 rounded-lg bg-[#DCEEF7] text-[#134E6F] font-medium">
            เปิด Swagger API
          </a>
        ` : `
          <a href="/index.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
            หน้าหลัก
          </a>
          <a href="/doctors.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
            ค้นหาแพทย์
          </a>
          <a href="/screening.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
            คัดกรองอาการเบื้องต้น
          </a>
          <a href="/services.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
            บริการและแพ็กเกจ
          </a>
          ${user ? `
            <a href="/patient-queue.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
              ติดตามคิวของฉัน
            </a>
            <a href="/appointments.html" class="px-3 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700">
              ประวัติการนัดหมาย
            </a>
          ` : ''}
        `}

        ${user ? `
          <button type="button" onclick="logout()" class="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 font-medium">
            ออกจากระบบ
          </button>
        ` : `
          <a href="/auth.html" class="px-3 py-1.5 rounded-lg bg-[#DCEEF7] text-[#134E6F] font-medium">
            เข้าสู่ระบบ / สมัครสมาชิก
          </a>
        `}
      </div>
    </div>
  `;

  refreshIcons();
  verifySession();
}