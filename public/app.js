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

// Theme Management (Dark / Light Mode)
const Theme = {
  get current() {
    return localStorage.getItem('sitebridge_theme') || 'dark';
  },
  set current(val) {
    localStorage.setItem('sitebridge_theme', val);
    document.documentElement.setAttribute('data-theme', val);
    this.syncUI();
  },
  toggle() {
    const next = this.current === 'dark' ? 'light' : 'dark';
    this.current = next;
    return next;
  },
  init() {
    const cur = this.current;
    document.documentElement.setAttribute('data-theme', cur);
  },
  syncUI() {
    const isDark = this.current === 'dark';
    const label = document.getElementById('themeToggleLabel');
    const btn = document.getElementById('themeToggleBtn');
    if (label) {
      label.textContent = isDark ? 'Dark Mode' : 'Light Mode';
    }
    if (btn) {
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      btn.setAttribute('title', isDark ? 'Disable Dark Mode (Switch to Light Mode)' : 'Enable Dark Mode (Switch to Dark Mode)');
    }
  }
};

// Initialize theme immediately on script execution
Theme.init();

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
  const url = baseUrl + '/api' + path;
  let res;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (netErr) {
    console.error(`[API Network Error] URL: ${url}`, netErr);
    throw new Error(`Failed to fetch (${url}): ${netErr.message || 'Network connection failed'}. Please ensure Vercel backend function is running and check browser console (F12).`);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText || `Request failed with status ${res.status}` }));
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

  // Redirect admin away from supervisor pages to dedicated admin portal
  if (user && user.role === 'admin' && ['log.html', 'approval.html', 'dashboard.html'].includes(activePage)) {
    location.href = 'admin.html';
    return;
  }

  // Redirect non-admins away from admin portal
  if (user && user.role !== 'admin' && activePage === 'admin.html') {
    location.href = 'approval.html';
    return;
  }

  const links = [
    // Admin navigation
    { href: 'admin.html', label: 'Admin Portal', roles: ['admin'] },

    // Supervisor & Planner navigation
    { href: 'approval.html', label: 'Task Approval', roles: ['supervisor', 'planner'] },
    { href: 'log.html', label: 'Log Progress', roles: ['supervisor'] },
    { href: 'schedule.html', label: 'Schedule Baseline', roles: ['supervisor', 'planner'] },
    { href: 'dashboard.html', label: 'Dashboard', roles: ['supervisor', 'planner'] },
  ];

  const nav = user
    ? links
        .filter(l => l.roles.includes(user.role))
        .map(l => `<a href="${l.href}" class="${activePage === l.href ? 'active' : ''}">${l.label}</a>`)
        .join('')
    : '';

  const userBoxHtml = user
    ? `<div class="userbox">
        <span>Logged in as <b>${escapeHtml(user.name)}</b> 
          ${user.role === 'admin' 
            ? '<span class="badge" style="background:rgba(239,68,68,0.15); color:var(--bad); font-size:10px; font-weight:700;">ADMINISTRATOR</span>'
            : `<span class="badge" style="background:rgba(59,130,246,0.15); color:var(--accent); font-size:10px">${escapeHtml(user.role)}${user.discipline ? ' / ' + escapeHtml(user.discipline) : ''} <span style="color:var(--warn); font-weight:700;">[Proj: ${escapeHtml(user.project_id || 'P1')}]</span></span>`
          }
        </span>
        <button id="logoutBtn" class="secondary" style="padding:4px 10px; margin:0; font-size:12px; height:28px;">Logout</button>
       </div>`
    : `<div class="userbox">
        <span class="muted">Not logged in — <a href="index.html" style="color:var(--accent); font-weight:600; text-decoration:none;">Login from Homepage</a></span>
       </div>`;

  const isDark = Theme.current === 'dark';
  const themeToggleHtml = `
    <button id="themeToggleBtn" class="theme-toggle-btn" type="button" aria-label="Toggle dark mode" aria-pressed="${isDark ? 'true' : 'false'}" title="${isDark ? 'Disable Dark Mode (Switch to Light Mode)' : 'Enable Dark Mode (Switch to Dark Mode)'}">
      <span class="theme-toggle-track">
        <span class="theme-toggle-thumb">
          <svg class="theme-icon icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="4"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
          <svg class="theme-icon icon-moon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </span>
      </span>
      <span class="theme-toggle-label" id="themeToggleLabel">${isDark ? 'Dark Mode' : 'Light Mode'}</span>
    </button>
  `;

  bar.innerHTML = `
    <div class="topbar-left">
      <a href="index.html" class="brand-link-wrapper" title="SiteBridge AI Homepage">
        <!-- Logo Placeholder (Top-Left Corner) -->
        <div class="logo-placeholder" id="logoPlaceholder" title="SiteBridge AI Logo Placeholder">
          <div class="logo-placeholder-graphic">
            <svg class="logo-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="sbLogoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#2563eb" />
                  <stop offset="1" stop-color="#0284c7" />
                </linearGradient>
              </defs>
              <rect width="32" height="32" rx="8" fill="url(#sbLogoGrad)" />
              <path d="M5 22C9 15.5 12.5 13.5 16 13.5C19.5 13.5 23 15.5 27 22" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" />
              <path d="M8 22V17M16 22V13.5M24 22V17" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" />
              <circle cx="16" cy="8" r="2.5" fill="#a5f3fc" />
              <circle cx="9" cy="11" r="1.8" fill="#ffffff" />
              <circle cx="23" cy="11" r="1.8" fill="#ffffff" />
              <line x1="9" y1="11" x2="16" y2="8" stroke="#a5f3fc" stroke-width="1.2" stroke-dasharray="1.5 1.5" />
              <line x1="23" y1="11" x2="16" y2="8" stroke="#a5f3fc" stroke-width="1.2" stroke-dasharray="1.5 1.5" />
            </svg>
          </div>
          <span class="logo-placeholder-badge" title="Logo Placeholder">LOGO</span>
        </div>
        <div class="brand">
          <span class="brand-title">SiteBridge AI</span>
        </div>
      </a>
      <span class="pill">production</span>
    </div>
    <nav>${nav}</nav>
    <div class="topbar-right">
      ${userBoxHtml}
      ${themeToggleHtml}
    </div>`;

  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      Theme.toggle();
    });
  }

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
