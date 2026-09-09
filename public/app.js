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
        <!-- Logo (Top-Left Corner) -->
        <div class="site-logo-box" id="siteLogo" title="SiteBridge AI">
          <img src="Logo.jpeg" alt="SiteBridge AI Logo" class="site-logo-img" />
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

/**
 * Renders a 3-Color Donut / Pie Chart for Work Progress
 * Slices: Work Done (Green), Work On Going (Yellow/Amber), Work Not Started (Slate)
 */
function renderPieChartHTML(counts, options = {}) {
  const completed = counts.completed || 0;
  const inProgress = counts.in_progress || counts.inProgress || 0;
  const notStarted = counts.not_started || counts.notStarted || 0;
  const total = completed + inProgress + notStarted;

  const pctDone = total > 0 ? Math.round((completed / total) * 100) : 0;
  const pctInProgress = total > 0 ? Math.round((inProgress / total) * 100) : 0;
  const pctNotStarted = total > 0 ? Math.max(0, 100 - pctDone - pctInProgress) : 0;

  const radius = 65;
  const circumference = 2 * Math.PI * radius; // ~408.407

  const lenCompleted = total > 0 ? (completed / total) * circumference : 0;
  const lenInProgress = total > 0 ? (inProgress / total) * circumference : 0;
  const lenNotStarted = total > 0 ? (notStarted / total) * circumference : circumference;

  const offsetCompleted = 0;
  const offsetInProgress = lenCompleted;
  const offsetNotStarted = lenCompleted + lenInProgress;

  return `
    <div class="pie-chart-wrapper">
      <div class="pie-svg-container">
        <svg viewBox="0 0 200 200" class="pie-svg">
          <!-- Background ring -->
          <circle cx="100" cy="100" r="${radius}" fill="none" stroke="var(--border)" stroke-width="24" />
          
          ${total > 0 ? `
            <!-- Work Not Started Segment (Slate) -->
            <circle cx="100" cy="100" r="${radius}" fill="none" 
                    stroke="#64748b" stroke-width="24" 
                    stroke-dasharray="${lenNotStarted} ${circumference - lenNotStarted}" 
                    stroke-dashoffset="${-offsetNotStarted}" 
                    transform="rotate(-90 100 100)" class="pie-segment" />
            
            <!-- Work On Going Segment (Amber Yellow) -->
            <circle cx="100" cy="100" r="${radius}" fill="none" 
                    stroke="#f59e0b" stroke-width="24" 
                    stroke-dasharray="${lenInProgress} ${circumference - lenInProgress}" 
                    stroke-dashoffset="${-offsetInProgress}" 
                    transform="rotate(-90 100 100)" class="pie-segment" />

            <!-- Work Done Segment (Emerald Green) -->
            <circle cx="100" cy="100" r="${radius}" fill="none" 
                    stroke="#10b981" stroke-width="24" 
                    stroke-dasharray="${lenCompleted} ${circumference - lenCompleted}" 
                    stroke-dashoffset="${-offsetCompleted}" 
                    transform="rotate(-90 100 100)" class="pie-segment" />
          ` : ''}

          <!-- Center Hole Overlay Text -->
          <text x="100" y="93" text-anchor="middle" fill="var(--text)" font-size="24" font-weight="800">${pctDone}%</text>
          <text x="100" y="113" text-anchor="middle" fill="var(--muted)" font-size="11" font-weight="700" letter-spacing="0.5">WORK DONE</text>
          <text x="100" y="128" text-anchor="middle" fill="var(--muted)" font-size="10">${completed} / ${total} Tasks</text>
        </svg>
      </div>

      <!-- Pie Chart Legend & Status Breakdown -->
      <div class="pie-legend">
        <div class="pie-legend-item">
          <div class="pie-legend-header">
            <span class="dot" style="background:#10b981"></span>
            <span class="legend-title">Work Done (Completed)</span>
          </div>
          <span class="legend-val" style="color:#10b981"><b>${completed}</b> <small>(${pctDone}%)</small></span>
        </div>

        <div class="pie-legend-item">
          <div class="pie-legend-header">
            <span class="dot" style="background:#f59e0b"></span>
            <span class="legend-title">Work On Going (In Progress)</span>
          </div>
          <span class="legend-val" style="color:#f59e0b"><b>${inProgress}</b> <small>(${pctInProgress}%)</small></span>
        </div>

        <div class="pie-legend-item">
          <div class="pie-legend-header">
            <span class="dot" style="background:#64748b"></span>
            <span class="legend-title">Work Not Started</span>
          </div>
          <span class="legend-val" style="color:#94a3b8"><b>${notStarted}</b> <small>(${pctNotStarted}%)</small></span>
        </div>
      </div>
    </div>`;
}

/**
 * Renders an Expected vs Actual Task Comparison Bar Graph
 * Shows side-by-side or stacked comparison bars for tasks.
 * If actual > expected, the actual bar is higher/longer in RED (Late).
 * If actual <= expected, the actual bar is GREEN (On Time).
 */
function renderTaskComparisonBarChartHTML(tasksList) {
  if (!tasksList || !tasksList.length) {
    return `<div class="muted" style="padding:20px; text-align:center;">No task activities available for bar graph analysis.</div>`;
  }

  // Find max days to scale bars proportionally
  let maxDays = 1;
  const processed = tasksList.map((t, idx) => {
    const taskName = t.description || t.wbs_code || `Task ${idx + 1}`;
    const code = t.wbs_code || `T${idx+1}`;
    
    // Calculate expected days from planned_start and planned_end
    let expected = t.expected_days;
    if (!expected) {
      if (t.planned_start && t.planned_end) {
        const pStart = new Date(t.planned_start);
        const pEnd = new Date(t.planned_end);
        expected = Math.max(1, Math.round((pEnd - pStart) / 86400000) + 1);
      } else {
        expected = 5;
      }
    }
    
    // Calculate actual days from actual_start & actual_end, or elapsed schedule dates
    let actual = t.actual_days;
    if (actual === undefined || actual === null) {
      if (t.actual_start && t.actual_end) {
        const aStart = new Date(t.actual_start);
        const aEnd = new Date(t.actual_end);
        actual = Math.max(1, Math.round((aEnd - aStart) / 86400000) + 1);
      } else if (t.status === 'completed') {
        actual = t.is_late ? expected + (t.delay_days || 3) : expected;
      } else if (t.status === 'in_progress') {
        const pStart = new Date(t.planned_start || Date.now());
        const today = new Date();
        const elapsed = Math.max(1, Math.round((today - pStart) / 86400000) + 1);
        actual = (t.planned_end && today > new Date(t.planned_end)) ? Math.max(expected + 3, elapsed) : Math.min(expected, elapsed);
      } else if (t.planned_end && new Date(t.planned_end) < new Date() && t.status !== 'completed') {
        // Overdue task (Planned end passed)
        const pStart = new Date(t.planned_start || Date.now());
        const today = new Date();
        actual = Math.max(expected + 3, Math.round((today - pStart) / 86400000) + 1);
      } else {
        actual = 0;
      }
    }

    const isLate = actual > expected;
    maxDays = Math.max(maxDays, expected, actual);

    return {
      code,
      name: taskName,
      expected,
      actual,
      isLate,
      status: t.status || (isLate ? 'in_progress' : 'completed')
    };
  });

  return `
    <div class="bargraph-container">
      <div class="bargraph-header">
        <div>
          <b style="font-size:14px;">Task Progress & Schedule Compliance</b>
          <span class="sub" style="display:block; font-size:12px; margin-top:2px;">
            Compares <b>Expected (Planned)</b> vs <b>Actual Days</b>. Actual bar is <span style="color:var(--bad); font-weight:700;">HIGHER (RED)</span> if work is done late.
          </span>
        </div>
        <div class="bargraph-key">
          <span class="key-item"><span class="key-box" style="background:var(--accent)"></span> Expected</span>
          <span class="key-item"><span class="key-box" style="background:#10b981"></span> Actual (On Time)</span>
          <span class="key-item"><span class="key-box" style="background:#ef4444"></span> Actual (Late)</span>
        </div>
      </div>

      <div class="bargraph-list">
        ${processed.map(t => {
          const expPct = Math.round((t.expected / maxDays) * 100);
          const actPct = Math.round((t.actual / maxDays) * 100);

          let statusBadge = '';
          if (t.actual === 0) {
            statusBadge = `<span class="badge not_started">NOT STARTED</span>`;
          } else if (t.isLate) {
            const delay = t.actual - t.expected;
            statusBadge = `<span class="badge rejected">LATE (+${delay} ${delay === 1 ? 'day' : 'days'})</span>`;
          } else {
            statusBadge = `<span class="badge confirmed">ON TIME</span>`;
          }

          const actualColor = t.actual === 0 ? '#64748b' : (t.isLate ? '#ef4444' : '#10b981');

          return `
            <div class="bargraph-item">
              <div class="bargraph-item-info">
                <div class="bargraph-title" title="${escapeHtml(t.name)}">
                  <span class="pill" style="font-size:10px; padding:1px 6px; margin-right:6px;">${escapeHtml(t.code)}</span>
                  <b>${escapeHtml(t.name)}</b>
                </div>
                <div>${statusBadge}</div>
              </div>

              <div class="bargraph-dual-bars">
                <!-- Expected Bar -->
                <div class="bar-row">
                  <span class="bar-label">Expected</span>
                  <div class="bar-track">
                    <div class="bar-fill" style="width: ${expPct}%; background: var(--accent);">
                      <span class="bar-val">${t.expected}d</span>
                    </div>
                  </div>
                </div>

                <!-- Actual Bar -->
                <div class="bar-row">
                  <span class="bar-label">Actual</span>
                  <div class="bar-track">
                    <div class="bar-fill ${t.isLate ? 'bar-late-pulse' : ''}" style="width: ${actPct}%; background: ${actualColor};">
                      <span class="bar-val">${t.actual > 0 ? t.actual + 'd' : '0d'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

