// Shared client logic and session management
const State = {
  get user() {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  },
  set user(u) {
    if (u == null) localStorage.removeItem('user');
    else localStorage.setItem('user', JSON.stringify(u));
  },
};

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getApiBaseUrl() {
  if (location.protocol === 'file:') return 'http://localhost:3000';
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isLocal && location.port && location.port !== '3000') {
    return `http://${location.hostname}:3000`;
  }
  return '';
}

async function api(path, opts = {}) {
  const user = State.user;
  const isFormData = opts.body instanceof FormData;
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  if (opts.headers) Object.assign(headers, opts.headers);
  if (user && user.id) headers['x-user-id'] = user.id;

  const baseUrl = getApiBaseUrl();
  const res = await fetch(baseUrl + '/api' + path, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed with status ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function renderTopbar(activePage) {
  const bar = document.getElementById('topbar');
  if (!bar) return;

  const user = State.user;

  // Protect authenticated pages
  if (!user && activePage && activePage !== 'index.html') {
    location.href = 'index.html';
    return;
  }

  const links = [
    { href: 'log.html', label: 'Log Progress', roles: ['supervisor', 'planner', 'admin'] },
    { href: 'approval.html', label: 'Task Approval', roles: ['supervisor', 'planner', 'admin'] },
    { href: 'schedule.html', label: 'Schedule Baseline', roles: ['supervisor', 'planner', 'admin'] },
    { href: 'dashboard.html', label: 'Dashboard', roles: ['supervisor', 'planner', 'admin'] },
  ];

  const nav = user
    ? links
        .filter(l => l.roles.includes(user.role))
        .map(l => `<a href="${l.href}" class="${activePage === l.href ? 'active' : ''}">${l.label}</a>`)
        .join('')
    : '';

  const userBoxHtml = user
    ? `<div class="userbox">
        <span>Logged in as <b>${escapeHtml(user.name)}</b> <span class="badge" style="background:rgba(59,130,246,0.15); color:var(--accent); font-size:10px">${escapeHtml(user.role)}${user.discipline ? ' / ' + escapeHtml(user.discipline) : ''}</span></span>
        <button id="logoutBtn" class="secondary" style="padding:4px 10px; margin:0; font-size:12px; height:28px;">Logout</button>
       </div>`
    : `<div class="userbox">
        <span class="muted">Not logged in — <a href="index.html" style="color:var(--accent); font-weight:600; text-decoration:none;">Login from Homepage</a></span>
       </div>`;

  bar.innerHTML = `
    <div class="brand"><a href="index.html" style="color:inherit; text-decoration:none;">Progress Tracker</a> <span class="pill">production</span></div>
    <nav>${nav}</nav>
    ${userBoxHtml}`;

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      State.user = null;
      toast('Logged out');
      setTimeout(() => { location.href = 'index.html'; }, 300);
    });
  }
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

function scoreColor(score) {
  if (score >= 0.75) return 'var(--good)';
  if (score >= 0.35) return 'var(--warn)';
  return 'var(--bad)';
}
