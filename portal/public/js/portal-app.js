/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let me = null;

/* ══════════════════════════════════════════════════════
   SKELETON LOADERS
══════════════════════════════════════════════════════ */
function skelCard(lines = [65, 100, 45]) {
  return `<div class="skel-card">${lines.map(w => `<div class="skel skel-line" style="width:${w}%"></div>`).join('')}</div>`;
}
function showSkeletons(el, n = 3, lines) {
  if (!el) return;
  el.innerHTML = Array.from({length: n}, () => skelCard(lines)).join('');
}

/* ══════════════════════════════════════════════════════
   NOTIFICATIONS (LEO only)
══════════════════════════════════════════════════════ */
const notif = {
  enabled: localStorage.getItem('leoNotif') === '1',
  seenCalls: new Set(),
  seenPanics: new Set(),
  callPollTimer: null,
  panicPollTimer: null,
  primed: false,

  get isLeo() {
    return (localStorage.getItem('portalMode') === 'leo') && !!me?.isLeo;
  },

  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  },

  async toggle() {
    if (!this.isLeo) return;
    if (!this.enabled) {
      const granted = await this.requestPermission();
      if (!granted) {
        toast('Notifications are blocked - enable them in browser settings then try again.', 'error');
        return;
      }
      this.enabled = true;
      localStorage.setItem('leoNotif', '1');
      this.start();
      toast('Notifications enabled', 'success');
    } else {
      this.enabled = false;
      localStorage.setItem('leoNotif', '0');
      this.stop();
      toast('Notifications disabled', 'info');
    }
    this.updateUI();
  },

  start() {
    this.stop();
    this.primed = false;
    this._prime().then(() => {
      this.primed = true;
      this.callPollTimer  = setInterval(() => this._pollCalls(),  20000);
      this.panicPollTimer = setInterval(() => this._pollPanics(), 15000);
    });
  },

  stop() {
    if (this.callPollTimer)  { clearInterval(this.callPollTimer);  this.callPollTimer  = null; }
    if (this.panicPollTimer) { clearInterval(this.panicPollTimer); this.panicPollTimer = null; }
    this.primed = false;
  },

  async _prime() {
    try {
      const [calls, officers] = await Promise.all([
        api('/leo/calls').catch(() => []),
        api('/officers/overview').catch(() => ({ officers: [] })),
      ]);
      (calls || []).forEach(c => this.seenCalls.add(c.callId));
      (officers?.officers || [])
        .filter(o => o.tenCode === '10-99')
        .forEach(o => this.seenPanics.add(o.username));
    } catch {}
  },

  async _pollCalls() {
    if (!this.primed || !this.enabled || !this.isLeo) return;
    try {
      const calls = await api('/leo/calls');
      for (const call of (calls || [])) {
        if (!this.seenCalls.has(call.callId)) {
          this.seenCalls.add(call.callId);
          this._fire(
            'New 911 Call',
            `${call.issue}${call.location ? ' - ' + call.location : ''}`,
            { tag: 'call-' + call.callId }
          );
        }
      }
    } catch {}
  },

  async _pollPanics() {
    if (!this.primed || !this.enabled || !this.isLeo) return;
    try {
      const d = await api('/officers/overview');
      const active = new Set(
        (d?.officers || []).filter(o => o.tenCode === '10-99').map(o => o.username)
      );
      for (const username of active) {
        if (!this.seenPanics.has(username)) {
          this.seenPanics.add(username);
          const officer = d.officers.find(o => o.username === username);
          this._fire(
            '10-99 - OFFICER DOWN',
            `${username}${officer?.location ? ' at ' + officer.location : ''} - respond immediately`,
            { tag: 'panic-' + username, requireInteraction: true }
          );
        }
      }
      for (const username of this.seenPanics) {
        if (!active.has(username)) this.seenPanics.delete(username);
      }
    } catch {}
  },

  _fire(title, body, opts = {}) {
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', ...opts });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  },

  updateUI() {
    const isOn = this.enabled && ('Notification' in window) && Notification.permission === 'granted';
    document.querySelectorAll('.leo-only-el.notif-bell-btn, .btn-sidebar-notif.leo-only-el').forEach(el => {
      el.classList.toggle('notif-on', isOn);
    });
    document.querySelectorAll('.notif-bell-dot').forEach(dot => {
      dot.classList.toggle('notif-dot-active', isOn);
    });
    const label = document.getElementById('notif-sidebar-label');
    if (label) label.textContent = isOn ? 'Notifications On' : 'Notifications';
  },

  onModeChange(mode) {
    const isLeo = mode === 'leo' && !!me?.isLeo;
    document.querySelectorAll('.leo-only-el').forEach(el => {
      el.classList.toggle('hidden', !isLeo);
    });
    if (isLeo) {
      if (this.enabled && ('Notification' in window) && Notification.permission === 'granted') {
        this.start();
      }
      this.updateUI();
    } else {
      this.stop();
    }
  },

  init() {
    this.updateUI();
  },
};
let shopItems = [];
let shopCurrency = '$';
let currentBuyItem = null;
let selectedRoleTypeId = null;
let selectedApproverId = null;
const loaded = {};

/* ══════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════ */
(async () => {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  try {
    const res = await fetch('/api/portal/me', { credentials: 'include' });
    if (!res.ok) throw new Error('not_authed');
    me = await res.json();
    showApp();
  } catch {
    showLogin(error);
  }
})();

function showLogin(error) {
  document.getElementById('login-screen').classList.remove('hidden');
  const errMap = {
    not_member: 'You are not a member of this server.',
    bot_not_in_server: 'The bot is not in this server.',
    auth_failed: 'Authentication failed. Please try again.',
    invalid_state: 'Security check failed. Please try again.',
  };
  if (error && errMap[error]) {
    const el = document.getElementById('login-error');
    el.textContent = errMap[error];
    el.classList.remove('hidden');
  }
}

function showApp() {
  const serverName = me.serverName || 'Member Portal';
  ['login-server-name','sidebar-server-name','topbar-server-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = serverName;
  });

  if (me.serverIcon) {
    ['sidebar-server-icon','topbar-server-icon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.src = me.serverIcon; el.style.display = 'block'; }
    });
    ['sidebar-server-icon-placeholder','topbar-server-icon-placeholder'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const loginLogo = document.getElementById('login-logo');
    if (loginLogo) { loginLogo.src = me.serverIcon; loginLogo.style.display = 'block'; }
    const modeImg = document.getElementById('mode-logo-img');
    if (modeImg) { modeImg.src = me.serverIcon; modeImg.style.display = 'block'; }
    const modePh = document.getElementById('mode-logo-placeholder');
    if (modePh) modePh.style.display = 'none';
  }

  const displayName = me.displayName || me.username;
  ['sidebar-avatar','topbar-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.src = me.avatar;
  });
  const unEl = document.getElementById('sidebar-username');
  if (unEl) unEl.textContent = displayName;
  const tbun = document.getElementById('topbar-username');
  if (tbun) tbun.textContent = displayName;
  const sub = document.getElementById('sidebar-server-sub');
  if (sub) sub.textContent = serverName;

  const rolesEl = document.getElementById('sidebar-roles');
  if (me.roles?.length && rolesEl) {
    rolesEl.innerHTML = me.roles.map(r => {
      const color = r.color && r.color !== '#000000' ? r.color : '#666688';
      return `<span class="role-badge" style="color:${color};border-color:${color}40;background:${color}18">${r.name}</span>`;
    }).join('');
  } else if (rolesEl) {
    rolesEl.style.display = 'none';
  }

  const modeGreeting = document.getElementById('mode-greeting');
  if (modeGreeting) modeGreeting.textContent = `Welcome, ${displayName}`;

  if (me.isLeo) {
    const btn = document.getElementById('mode-btn-leo');
    if (btn) btn.removeAttribute('disabled');
    const badge = document.getElementById('mode-leo-badge');
    if (badge) badge.style.display = 'none';
  }

  document.querySelectorAll('.nav-item[data-tab], .bnav-item[data-tab]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  const savedMode = localStorage.getItem('portalMode');
  const validMode = (savedMode === 'leo' && !me.isLeo) ? null : savedMode;
  if (validMode) {
    document.getElementById('app').classList.remove('hidden');
    applyModeNav(validMode);
    loadOverview();
    startGlobalPriorityPoll();
  } else {
    document.getElementById('mode-screen').classList.remove('hidden');
  }
  notif.init();
}

/* ══════════════════════════════════════════════════════
   MODE PICKER
══════════════════════════════════════════════════════ */
function setPortalMode(mode) {
  if (mode === 'leo' && !me?.isLeo) return;
  localStorage.setItem('portalMode', mode);
  document.getElementById('mode-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  applyModeNav(mode);
  delete loaded['overview'];
  loadOverview();
  startGlobalPriorityPoll();
}

function showModeScreen() {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('mode-screen').classList.remove('hidden');
}

function openModePrompt(requiredMode, msg) {
  document.getElementById('mode-prompt-overlay')?.remove();
  const label = requiredMode === 'leo' ? 'Law Enforcement' : 'Civilian';
  const el = document.createElement('div');
  el.id = 'mode-prompt-overlay';
  el.className = 'mode-prompt-overlay';
  el.innerHTML = `<div class="mode-prompt-modal">
    <div class="mode-prompt-icon">${requiredMode === 'leo'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    }</div>
    <div class="mode-prompt-title">Mode Switch Required</div>
    <div class="mode-prompt-body">${msg}</div>
    <div class="mode-prompt-actions">
      <button class="btn btn-secondary" onclick="document.getElementById('mode-prompt-overlay').remove()">Stay</button>
      <button class="btn btn-primary" onclick="setPortalMode('${requiredMode}');document.getElementById('mode-prompt-overlay').remove()">Switch to ${label}</button>
    </div>
  </div>`;
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  document.body.appendChild(el);
}

const CIV_ONLY_TABS = ['cad', 'dispatch', 'fines', 'tickets'];
const LEO_ONLY_TABS = ['leo'];

function applyModeNav(mode) {
  const isCiv = mode === 'civilian';
  const isLeo = mode === 'leo';

  CIV_ONLY_TABS.forEach(tab => {
    document.querySelectorAll(`[data-tab="${tab}"]`).forEach(el => {
      if (isCiv) el.classList.remove('hidden');
      else el.classList.add('hidden');
    });
  });

  document.querySelectorAll('.bnav-civ').forEach(el => {
    if (isCiv) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });

  const leoBnav = document.querySelector('.bnav-leo');
  const leoSection = document.getElementById('nav-leo-section');
  const moreLeo = document.getElementById('more-leo');
  if (isLeo && me?.isLeo) {
    document.getElementById('nav-leo')?.classList.remove('hidden');
    leoSection?.classList.remove('hidden');
    moreLeo?.classList.remove('hidden');
    leoBnav?.classList.remove('hidden');
  } else {
    document.getElementById('nav-leo')?.classList.add('hidden');
    leoSection?.classList.add('hidden');
    moreLeo?.classList.add('hidden');
    leoBnav?.classList.add('hidden');
  }

  const modeLabel = document.getElementById('topbar-mode-label');
  if (modeLabel) modeLabel.textContent = isLeo ? 'LEO' : 'Civilian';

  notif.onModeChange(mode);

  if (isLeo) {
    switchTab('leo');
  } else if (isCiv) {
    const pane = document.getElementById('tab-overview');
    if (pane && !pane.classList.contains('active')) switchTab('overview');
  }
}

/* ══════════════════════════════════════════════════════
   TABS
══════════════════════════════════════════════════════ */
const secondaryTabs = new Set(['fines','tickets','calendar','rolerequest','leo','priority']);

function switchTab(tab) {
  // Mode guard: prevent cross-mode tab access
  if (me) {
    const _mode = localStorage.getItem('portalMode') || 'civilian';
    const _isLeo = _mode === 'leo' && !!me.isLeo;
    if (CIV_ONLY_TABS.includes(tab) && _isLeo) {
      openModePrompt('civilian', 'This feature is only available in Civilian mode. Switch modes to access your characters, 911 dispatch, fines, and tickets.');
      return;
    }
    if (LEO_ONLY_TABS.includes(tab) && !_isLeo) {
      if (me.isLeo) openModePrompt('leo', 'Switch to LEO mode to access the officer dashboard, status board, and patrol tools.');
      else toast('LEO access is required for this feature.', 'error');
      return;
    }
  }
  const leavingLeo = document.getElementById('tab-leo')?.classList.contains('active');
  if (leavingLeo && tab !== 'leo') stopBoardRefresh();

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bnav-item').forEach(n => n.classList.remove('active'));

  const pane = document.getElementById(`tab-${tab}`);
  if (pane) pane.classList.add('active');

  document.querySelectorAll(`[data-tab="${tab}"]`).forEach(n => n.classList.add('active'));

  if (secondaryTabs.has(tab)) {
    document.getElementById('bnav-more')?.classList.add('active');
  }

  document.getElementById('main').scrollTop = 0;

  if (tab === 'priority') { loadPriority(); schedulePriorityRefresh(); }

  if (!loaded[tab]) {
    loaded[tab] = true;
    if (tab === 'cad') loadCad();
    if (tab === 'economy') loadEconomy();
    if (tab === 'dispatch') loadDispatch();
    if (tab === 'fines') loadTrafficFines();
    if (tab === 'tickets') loadTickets();
    if (tab === 'calendar') loadCalendar();
    if (tab === 'rolerequest') loadRoleRequest();
    if (tab === 'leo') loadLeo();
  }

  startTabRefresh(tab);
}

/* ══════════════════════════════════════════════════════
   TAB AUTO-REFRESH
   LEO (board/intel) and priority have their own timers.
   All other tabs poll here while active.
══════════════════════════════════════════════════════ */
const TAB_REFRESH_MS = {
  overview:    30000,
  dispatch:    20000,
  fines:       45000,
  tickets:     30000,
  economy:     60000,
  cad:         45000,
  calendar:   120000,
  rolerequest: 45000,
};

const TAB_REFRESH_FN = {
  overview:    () => loadOverview(),
  dispatch:    () => loadDispatch(),
  fines:       () => loadTrafficFines(),
  tickets:     () => loadTickets(),
  economy:     () => loadEconomy(),
  cad:         () => loadCad(),
  calendar:    () => loadCalendar(),
  rolerequest: () => loadRoleRequest(),
};

let activeTabRefreshTimer = null;

function startTabRefresh(tab) {
  stopTabRefresh();
  const ms = TAB_REFRESH_MS[tab];
  const fn = TAB_REFRESH_FN[tab];
  if (!ms || !fn) return;
  activeTabRefreshTimer = setInterval(() => fn(), ms);
}

function stopTabRefresh() {
  if (activeTabRefreshTimer) { clearInterval(activeTabRefreshTimer); activeTabRefreshTimer = null; }
}

/* ══════════════════════════════════════════════════════
   MORE DRAWER
══════════════════════════════════════════════════════ */
function toggleMoreDrawer() {
  const drawer = document.getElementById('more-drawer');
  const overlay = document.getElementById('more-overlay');
  if (drawer.classList.contains('hidden')) {
    drawer.classList.remove('hidden');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => { drawer.classList.add('open'); overlay.classList.add('open'); });
  } else {
    closeMoreDrawer();
  }
}

function closeMoreDrawer() {
  const drawer = document.getElementById('more-drawer');
  const overlay = document.getElementById('more-overlay');
  drawer.classList.remove('open');
  overlay.classList.remove('open');
  setTimeout(() => { drawer.classList.add('hidden'); overlay.classList.add('hidden'); }, 260);
}

function moreNav(tab) {
  closeMoreDrawer();
  setTimeout(() => switchTab(tab), 100);
}

/* ══════════════════════════════════════════════════════
   OVERVIEW
══════════════════════════════════════════════════════ */
let homePriorityCountdownTimer = null;

async function loadOverview() {
  const isLeoMode = (localStorage.getItem('portalMode') === 'leo') && me?.isLeo;

  const pill = document.getElementById('overview-mode-pill');
  if (pill) {
    pill.textContent = isLeoMode ? 'LEO' : 'Civilian';
    pill.className = 'mode-pill ' + (isLeoMode ? 'mode-pill-leo' : 'mode-pill-civ');
  }

  try {
    const [cadRes, ecoRes, ticketsRes, priorityRes, strikeRes, finesRes] = await Promise.all([
      api('/cad').catch(() => []),
      api('/economy').catch(() => ({ cash: 0, bank: 0, currency: '$' })),
      api('/tickets').catch(() => []),
      api('/priority').catch(() => ({ active: false, cooldown: false })),
      api('/strikes').catch(() => ({ level: 0 })),
      api('/traffic-tickets').catch(() => []),
    ]);

    renderHomePriorityWidget(priorityRes);

    const voiceWidget = document.getElementById('home-voice-widget');
    if (voiceWidget) voiceWidget.classList.remove('hidden');
    loadVoiceChannels();

    if (!isLeoMode) loadHomeOfficers();

    const openTickets = (ticketsRes || []).filter(t => t.status === 'open').length;
    const strikeLevel = strikeRes?.level ?? 0;
    const unpaidFines = (finesRes || []).filter(f => !f.paid).length;
    const cur = ecoRes?.currency || '$';

    let statsHtml = [
      { label: 'Characters', value: cadRes?.length ?? 0, sub: 'in CAD' },
      { label: 'Cash', value: fmt(ecoRes?.cash ?? 0, cur), sub: 'on hand' },
      { label: 'Bank', value: fmt(ecoRes?.bank ?? 0, cur), sub: 'balance' },
      { label: 'Open Tickets', value: openTickets, sub: 'support' },
    ].map(s => `
      <div class="stat-card">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-sub">${s.sub}</div>
      </div>`).join('');

    if (unpaidFines > 0) {
      statsHtml += `<div class="stat-card">
        <div class="stat-label">Unpaid Fines</div>
        <div class="stat-value" style="color:var(--warning)">${unpaidFines}</div>
        <div class="stat-sub">traffic violations</div>
      </div>`;
    }
    if (strikeLevel > 0) {
      const col = strikeLevel >= 3 ? 'var(--danger)' : 'var(--warning)';
      statsHtml += `<div class="stat-card">
        <div class="stat-label">Strikes</div>
        <div class="stat-value" style="color:${col}">${strikeLevel}/4</div>
        <div class="stat-sub">active</div>
      </div>`;
    }

    document.getElementById('overview-stats').innerHTML = statsHtml;

    const SVG = {
      cad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      dispatch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.45 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 21.73 16.92z"/></svg>',
      economy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      fines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>',
      tickets: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>',
      calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      rolerequest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      leo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      priority: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    };

    const actions = isLeoMode ? [
      { tab: 'leo', label: 'LEO Dashboard' },
      { tab: 'economy', label: 'Economy' },
      { tab: 'calendar', label: 'RP Calendar' },
      { tab: 'rolerequest', label: 'Role Requests' },
      { tab: 'priority', label: 'Priority' },
    ] : [
      { tab: 'cad', label: 'CAD System' },
      { tab: 'dispatch', label: 'Dispatch / 911' },
      { tab: 'economy', label: 'Economy' },
      { tab: 'fines', label: 'Traffic Fines' },
      { tab: 'tickets', label: 'Tickets' },
      { tab: 'calendar', label: 'RP Calendar' },
      { tab: 'rolerequest', label: 'Role Requests' },
    ];

    document.getElementById('quick-actions').innerHTML = actions.map(a => `
      <button class="quick-btn" onclick="switchTab('${a.tab}')">
        <span class="quick-btn-icon">${SVG[a.tab] || ''}</span>${a.label}
      </button>`).join('');

  } catch {
    document.getElementById('overview-stats').innerHTML = '<p style="color:var(--text-muted);font-size:13px">Could not load overview.</p>';
  }
}

function renderHomePriorityWidget(d) {
  updateGlobalPriorityBar(d);
  const inner = document.getElementById('home-priority-inner');
  if (!inner) return;
  if (homePriorityCountdownTimer) { clearInterval(homePriorityCountdownTimer); homePriorityCountdownTimer = null; }

  // Always render BOTH sections: priority status + cooldown status
  inner.innerHTML = _hpwPriorityHTML(d) + '<div class="hpw-divider"></div>' + _hpwCooldownHTML(d);

  // Single interval ticks both countdowns simultaneously
  const hasTick = (d?.active && (d.expiresAt || d.activatedAt)) || (d?.cooldown && d.cooldownEndsAt);
  if (hasTick) {
    const tick = () => {
      if (d?.active) {
        const el = document.getElementById('hpw-p-timer');
        if (el) {
          if (d.expiresAt) {
            const diff = Math.max(0, Math.floor((new Date(d.expiresAt).getTime() - Date.now()) / 1000));
            el.textContent = `${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,'0')}`;
          } else if (d.activatedAt) {
            el.textContent = elapsedSince(d.activatedAt);
          }
        }
      }
      if (d?.cooldown && d.cooldownEndsAt) {
        const el = document.getElementById('hpw-cd-timer');
        if (el) {
          const diff = Math.max(0, Math.floor((new Date(d.cooldownEndsAt).getTime() - Date.now()) / 1000));
          el.textContent = `${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,'0')}`;
        }
      }
    };
    tick();
    homePriorityCountdownTimer = setInterval(tick, 1000);
  }
}

function _hpwPriorityHTML(d) {
  if (d?.active) {
    return `<div class="hpw-row hpw-active">
      <div class="hpw-left">
        <span class="hpw-dot hpw-dot-active"></span>
        <div class="hpw-text">
          <div class="hpw-label">PRIORITY</div>
          <div class="hpw-title">Active</div>
          ${d.issuedBy ? `<div class="hpw-sub">Hosted by ${esc(d.issuedBy)}</div>` : ''}
          ${d.customMessage ? `<div class="hpw-msg">${esc(d.customMessage)}</div>` : ''}
        </div>
      </div>
      <div class="hpw-right">
        <div class="hpw-countdown" id="hpw-p-timer">--:--</div>
        <div class="hpw-countdown-label">${d.expiresAt ? 'remaining' : 'elapsed'}</div>
      </div>
    </div>`;
  }
  return `<div class="hpw-row hpw-inactive">
    <div class="hpw-left">
      <span class="hpw-dot hpw-dot-inactive"></span>
      <div class="hpw-text">
        <div class="hpw-label">PRIORITY</div>
        <div class="hpw-title hpw-title-inactive">Inactive</div>
        <div class="hpw-sub">Server open</div>
      </div>
    </div>
  </div>`;
}

function _hpwCooldownHTML(d) {
  if (d?.cooldown) {
    return `<div class="hpw-row hpw-cooldown">
      <div class="hpw-left">
        <span class="hpw-dot hpw-dot-cooldown"></span>
        <div class="hpw-text">
          <div class="hpw-label">COOLDOWN</div>
          <div class="hpw-title hpw-title-cd">Active</div>
          ${d.cooldownIssuedBy ? `<div class="hpw-sub">Last host: ${esc(d.cooldownIssuedBy)}</div>` : ''}
        </div>
      </div>
      ${d.cooldownEndsAt ? `<div class="hpw-right">
        <div class="hpw-countdown hpw-countdown-cd" id="hpw-cd-timer">--:--</div>
        <div class="hpw-countdown-label">remaining</div>
      </div>` : ''}
    </div>`;
  }
  return `<div class="hpw-row hpw-no-cd">
    <div class="hpw-left">
      <span class="hpw-dot" style="background:var(--text-sub)"></span>
      <div class="hpw-text">
        <div class="hpw-label">COOLDOWN</div>
        <div class="hpw-title hpw-title-inactive">None</div>
        <div class="hpw-sub">No cooldown in effect</div>
      </div>
    </div>
  </div>`;
}

async function loadHomeOfficers() {
  const widget = document.getElementById('home-officers-widget');
  if (!widget) return;
  try {
    const d = await api('/officers/overview').catch(() => null);
    if (!d?.active) { widget.classList.add('hidden'); return; }

    const TEN_COLOR = { '10-8': '#4ade80', '10-6': '#facc15', '10-97': '#fb923c', '10-11': '#fb923c', '10-50': '#fb923c', '10-76': '#60a5fa', '10-78': '#f87171', '10-80': '#f87171', '10-15': '#f87171', '10-99': '#ef4444' };
    const TEN_LABELS = { '10-8': 'Available', '10-6': 'Busy', '10-97': 'On Scene', '10-11': 'Traffic Stop', '10-50': 'Accident', '10-76': 'En Route', '10-78': 'Need Assist', '10-80': 'Pursuit', '10-15': 'Prisoner', '10-99': 'EMERGENCY' };

    widget.innerHTML = `
      <div class="home-officers-header">
        <div class="home-officers-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          Officers On Duty
        </div>
        <span class="home-officers-count">${d.active} active</span>
      </div>
      <div class="home-officers-list">
        ${d.officers.map(o => {
          const col = TEN_COLOR[o.tenCode] || '#6b7280';
          const isPanic = o.tenCode === '10-99';
          return `<div class="home-officer-item${isPanic ? ' home-officer-panic' : ''}">
            <span class="home-officer-dot" style="background:${col};box-shadow:0 0 5px ${col}66"></span>
            <div class="home-officer-info">
              <span class="home-officer-name">${esc(o.username)}</span>
              <span class="home-officer-status" style="color:${col}">${TEN_LABELS[o.tenCode] || o.tenCode}${o.location ? ' &bull; ' + esc(o.location) : ''}</span>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    widget.classList.remove('hidden');
  } catch {
    widget.classList.add('hidden');
  }
}

async function loadVoiceChannels() {
  const list = document.getElementById('home-voice-list');
  if (!list) return;
  list.innerHTML = '<div style="display:flex;flex-direction:column;gap:6px;padding:4px">' + Array.from({length:3}, () => '<div class="skel skel-line skel-line-xl" style="width:100%;border-radius:8px"></div>').join('') + '</div>';
  try {
    const channels = await api('/voice/channels');
    if (!channels?.length) {
      list.innerHTML = '<div class="home-voice-empty">No voice channels available.</div>';
      return;
    }
    list.innerHTML = `<div class="home-voice-grid">${channels.map(c => `
      <button class="home-voice-item" onclick="moveToVoiceChannel('${c.id}','${c.name.replace(/'/g, "\\'")}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        <span class="home-voice-name">${esc(c.name)}</span>
        <svg class="home-voice-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>`).join('')}</div>`;
  } catch {
    list.innerHTML = '<div class="home-voice-empty">Could not load channels.</div>';
  }
}

async function refreshVoiceChannels() {
  const btn = document.getElementById('voice-refresh-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  await loadVoiceChannels();
  if (btn) { btn.disabled = false; btn.textContent = 'Refresh'; }
}

async function moveToVoiceChannel(channelId, channelName) {
  try {
    await apiPost('/voice/move', { channelId });
    toast(`Moved to ${channelName}`, 'success');
  } catch (err) {
    toast(err.message || 'Must be in a voice channel to be moved', 'error');
  }
}

/* ══════════════════════════════════════════════════════
   CAD
══════════════════════════════════════════════════════ */
async function loadCad() {
  const list = document.getElementById('cad-list');
  showSkeletons(list, 2, [55, 100, 40, 70, 30]);
  try {
    const chars = await api('/cad');
    if (!chars?.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>No characters yet. Create one to get started.</div>`;
      return;
    }
    list.innerHTML = chars.map(c => renderCharCard(c)).join('');
    list.querySelectorAll('.char-header').forEach(h => {
      h.addEventListener('click', () => h.closest('.char-card').classList.toggle('open'));
    });
    list.querySelectorAll('.btn-add-vehicle').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openAddVehicleModal(btn.dataset.charId); });
    });
    list.querySelectorAll('.btn-delete-char').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); deleteChar(btn.dataset.charId); });
    });
    list.querySelectorAll('.btn-add-firearm').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openAddFirearmModal(btn.dataset.charId); });
    });
    list.querySelectorAll('.btn-remove-gun').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); removeFirearm(btn.dataset.charId, btn.dataset.gunIndex); });
    });
  } catch {
    list.innerHTML = `<div class="empty-state">Failed to load characters.</div>`;
  }
}

function renderCharCard(c) {
  const initials = c.characterName?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const details = [
    ['Age', c.age || 'N/A'], ['Gender', c.gender || 'N/A'],
    ['Hair', c.hairColor || 'N/A'], ['Eyes', c.eyeColor || 'N/A'],
    ['Height', c.height || 'N/A'], ['Occupation', c.occupation || 'N/A'],
    ['Address', c.address || 'N/A'], ['Phone', c.phoneNumber || 'N/A'],
    ['License', c.driversLicense || 'N/A'], ['License Status', c.driverLicenseStatus || 'Valid'],
    ['SSN', c.socialSecurityNumber || 'N/A'], ['Emergency Contact', c.emergencyContact || 'N/A'],
  ];

  const vehicles = c.vehicles?.length
    ? c.vehicles.map(v => `
        <div class="vehicle-item">
          <div class="vehicle-item-left">
            <div class="vehicle-item-name">${v.year ? v.year + ' ' : ''}${v.color ? v.color + ' ' : ''}${v.make} ${v.model}</div>
            ${v.licensePlate ? `<div class="vehicle-item-plate">${v.licensePlate}</div>` : ''}
          </div>
        </div>`).join('')
    : '<div style="color:var(--text-muted);font-size:12px;font-style:italic;padding:4px 0">No vehicles registered.</div>';

  const guns = c.guns?.length
    ? c.guns.map((g, i) => `<div class="vehicle-item"><div class="vehicle-item-left"><div class="vehicle-item-name">${g.name}</div>${g.serialNumber ? `<div class="vehicle-item-plate">${g.serialNumber}</div>` : ''}</div><button class="btn btn-danger btn-xs btn-remove-gun" data-char-id="${c._id}" data-gun-index="${i}">Remove</button></div>`).join('')
    : '<div style="color:var(--text-muted);font-size:12px;font-style:italic;padding:4px 0">No firearms registered.</div>';

  const arrests = c.arrestHistory?.length
    ? c.arrestHistory.map(a => `<div class="vehicle-item"><div class="vehicle-item-left"><div class="vehicle-item-name">${a.charge}</div><div class="vehicle-item-plate">${a.outcome || ''} ${a.date ? '• ' + new Date(a.date).toLocaleDateString() : ''}</div></div></div>`).join('')
    : '';

  return `
    <div class="char-card" id="char-${c._id}">
      <div class="char-header">
        <div class="char-header-left">
          <div class="char-avatar">${initials}</div>
          <div>
            <div class="char-name">${c.characterName}</div>
            <div class="char-meta">${c.occupation || 'No occupation'}</div>
          </div>
        </div>
        <div class="char-header-right">
          <span class="char-status ${c.status === 'wanted' ? 'status-wanted' : 'status-clean'}">${c.status === 'wanted' ? 'Wanted' : 'Clean'}</span>
          <span class="char-chevron">▶</span>
        </div>
      </div>
      <div class="char-body">
        ${c.status === 'wanted' && c.wantedReason ? `<div class="wanted-banner">Wanted: ${c.wantedReason}</div>` : ''}
        <div class="char-details-grid">
          ${details.map(([l, v]) => `<div class="detail-item"><div class="detail-label">${l}</div><div class="detail-value">${v}</div></div>`).join('')}
        </div>
        <div class="char-section-header">
          <span class="char-section-label">Vehicles (${c.vehicles?.length || 0})</span>
          <button class="btn btn-primary btn-sm btn-add-vehicle" data-char-id="${c._id}">+ Add</button>
        </div>
        <div class="vehicle-list">${vehicles}</div>
        <div class="char-section-header" style="margin-top:14px">
          <span class="char-section-label">Firearms (${c.guns?.length || 0})</span>
          <button class="btn btn-primary btn-sm btn-add-firearm" data-char-id="${c._id}">+ Register</button>
        </div>
        <div class="gun-list">${guns}</div>
        ${arrests ? `<div class="char-section-header" style="margin-top:14px"><span class="char-section-label">Arrest History (${c.arrestHistory.length})</span></div>${arrests}` : ''}
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
          <button class="btn btn-danger btn-sm btn-delete-char" data-char-id="${c._id}">Delete Character</button>
        </div>
      </div>
    </div>
  `;
}

async function deleteChar(charId) {
  if (!confirm('Delete this character? This cannot be undone.')) return;
  try {
    await apiDel(`/cad/${charId}`);
    loaded['cad'] = false;
    loadCad();
    toast('Character deleted.', 'info');
  } catch (err) { toast(err.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   DISPATCH / 911
══════════════════════════════════════════════════════ */
async function loadDispatch() {
  showSkeletons(document.getElementById('dispatch-active'), 2, [40, 100, 60, 30]);
  try {
    const calls = await api('/dispatch/mine');
    const active = (calls || []).filter(c => c.status === 'active');
    const closed = (calls || []).filter(c => c.status === 'closed');

    document.getElementById('dispatch-active').innerHTML = active.length
      ? active.map(c => renderDispatchCall(c, true)).join('')
      : `<div class="empty-state" style="padding:20px 0">No active calls.</div>`;

    document.getElementById('dispatch-history').innerHTML = closed.length
      ? closed.slice(0, 8).map(c => renderDispatchCall(c, false)).join('')
      : `<div class="empty-state" style="padding:16px 0">No previous calls.</div>`;

    document.querySelectorAll('.btn-cancel-call').forEach(btn => {
      btn.addEventListener('click', () => cancelCall(btn.dataset.callId));
    });
  } catch {
    document.getElementById('dispatch-active').innerHTML = '<div class="empty-state">Failed to load calls.</div>';
  }
}

function renderDispatchCall(c, isActive) {
  const time = new Date(c.timestamp);
  const ago = timeAgo(time);
  return `
    <div class="dispatch-call ${isActive ? 'dispatch-call-active' : 'dispatch-call-closed'}">
      <div class="dispatch-call-header">
        <div>
          <div class="dispatch-call-id">${c.callId}</div>
          <div class="dispatch-call-issue">${c.issue}</div>
        </div>
        ${isActive ? `<button class="btn btn-sm btn-secondary btn-cancel-call" data-call-id="${c.callId}">Cancel</button>` : `<span class="status-pill ${c.status === 'active' ? 'ticket-status-open' : 'ticket-status-closed'}">${c.status}</span>`}
      </div>
      <div class="dispatch-call-loc">${c.location}</div>
      ${c.suspectsDescription ? `<div class="dispatch-call-detail">Suspect: ${c.suspectsDescription}</div>` : ''}
      ${c.lastSeen ? `<div class="dispatch-call-detail">Last seen: ${c.lastSeen}</div>` : ''}
      <div class="dispatch-call-meta">
        ${ago}
        ${isActive && c.respondingLeoUsername ? ` • Responding: <strong>${c.respondingLeoUsername}</strong>` : ''}
        ${isActive && !c.respondingLeoUsername ? ' • <span style="color:var(--warning)">No officer responding yet</span>' : ''}
        ${!isActive ? (c.closedBy ? ` • Closed by ${c.closedBy}` : '') : ''}
      </div>
    </div>
  `;
}

async function cancelCall(callId) {
  if (!confirm('Cancel this 911 call?')) return;
  try {
    await apiDel(`/dispatch/${callId}/cancel`);
    toast('Call cancelled.', 'info');
    loaded['dispatch'] = false;
    loadDispatch();
  } catch (err) { toast(err.message, 'error'); }
}

async function submit911(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const errEl = document.getElementById('form-911-error');
  const btn = document.getElementById('btn-submit-911');
  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Dispatching...';
  try {
    const result = await apiPost('/dispatch/submit', data);
    closeModal('modal-911');
    e.target.reset();
    toast(`Call ${result.callId} dispatched to officers.`, 'success');
    loaded['dispatch'] = false;
    if (document.getElementById('tab-dispatch').classList.contains('active')) loadDispatch();
    loaded['overview'] = false;
    loadOverview();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Dispatch Now';
  }
}

/* ══════════════════════════════════════════════════════
   TRAFFIC FINES
══════════════════════════════════════════════════════ */
async function loadTrafficFines() {
  const list = document.getElementById('fines-list');
  const summary = document.getElementById('fines-summary');
  showSkeletons(list, 3, [45, 100, 70, 30]);
  try {
    const [tickets, ecoRes] = await Promise.all([api('/traffic-tickets'), api('/economy')]);
    const cur = ecoRes?.currency || '$';

    if (!tickets?.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>No traffic violations on record.</div>`;
      return;
    }

    const unpaid = tickets.filter(t => !t.paid);
    const totalOwed = unpaid.reduce((s, t) => s + (t.fine || 0), 0);

    if (unpaid.length) {
      summary.innerHTML = `
        <div class="fines-owed">
          <div class="fines-owed-label">Total Outstanding</div>
          <div class="fines-owed-amount">${fmt(totalOwed, cur)}</div>
          <div class="fines-owed-sub">${unpaid.length} unpaid violation${unpaid.length > 1 ? 's' : ''}</div>
        </div>`;
      summary.classList.remove('hidden');
    }

    list.innerHTML = tickets.map(t => `
      <div class="fine-item ${t.paid ? 'fine-paid' : 'fine-unpaid'}">
        <div class="fine-item-left">
          <div class="fine-id">#${t.ticketId}</div>
          <div class="fine-char">${t.characterName || 'Unknown character'}</div>
          <div class="fine-violation">${t.violation}</div>
          ${t.description ? `<div class="fine-desc">${t.description}</div>` : ''}
          <div class="fine-meta">
            Issued by ${t.issuedBy || 'officer'} • ${new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            ${t.paid && t.paidAt ? ` • Paid ${new Date(t.paidAt).toLocaleDateString()}` : ''}
          </div>
        </div>
        <div class="fine-item-right">
          <div class="fine-amount ${t.paid ? 'fine-amount-paid' : 'fine-amount-owed'}">${fmt(t.fine || 0, cur)}</div>
          ${!t.paid ? `<button class="btn btn-primary btn-sm" onclick="payFine('${t.ticketId}', ${t.fine}, '${cur}')">Pay Fine</button>` : '<span class="fine-paid-badge">✓ Paid</span>'}
        </div>
      </div>
    `).join('');
  } catch {
    list.innerHTML = '<div class="empty-state">Failed to load traffic fines.</div>';
  }
}

async function payFine(ticketId, amount, cur) {
  if (!confirm(`Pay ${fmt(amount, cur)} from your bank balance?`)) return;
  try {
    const result = await apiPost(`/traffic-tickets/${ticketId}/pay`, {});
    toast(`Fine paid. New bank balance: ${fmt(result.newBank, cur)}`, 'success');
    loaded['fines'] = false;
    loadTrafficFines();
    loaded['economy'] = false;
    if (document.getElementById('tab-economy').classList.contains('active')) loadEconomy();
  } catch (err) { toast(err.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   ECONOMY
══════════════════════════════════════════════════════ */
async function loadEconomy() {
  const isLeoMode = localStorage.getItem('portalMode') === 'leo';
  const _balEl = document.getElementById('economy-balance');
  if (_balEl) showSkeletons(_balEl, 3, [50, 80]);

  const ecoActionsRow = document.getElementById('eco-actions-row') || document.querySelector('.eco-actions-row');
  const ecoMsgEl = document.getElementById('eco-action-msg');
  const economyGrid = document.querySelector('#tab-economy .economy-grid');

  if (isLeoMode) {
    if (ecoActionsRow) ecoActionsRow.style.display = 'none';
    if (ecoMsgEl) ecoMsgEl.style.display = 'none';
    if (economyGrid) economyGrid.style.display = 'none';
  } else {
    if (ecoActionsRow) ecoActionsRow.style.display = '';
    if (economyGrid) economyGrid.style.display = '';
  }

  try {
    const [ecoRes, shopRes, lbRes] = await Promise.all([
      api('/economy'),
      isLeoMode ? Promise.resolve([]) : api('/economy/shop'),
      isLeoMode ? Promise.resolve({ entries: [] }) : api('/economy/leaderboard'),
    ]);

    const cur = ecoRes.currency || '$';
    shopCurrency = cur;

    document.getElementById('economy-balance').innerHTML = [
      { label: 'Cash', value: fmt(ecoRes.cash, cur), sub: 'on hand' },
      { label: 'Bank', value: fmt(ecoRes.bank, cur), sub: 'saved' },
      { label: 'Total', value: fmt(ecoRes.cash + ecoRes.bank, cur), sub: 'wealth' },
    ].map(c => `
      <div class="balance-card">
        <div class="balance-label">${c.label}</div>
        <div class="balance-amount">${c.value}</div>
        <div class="balance-sub">${c.sub}</div>
      </div>
    `).join('');

    if (isLeoMode) return;

    shopItems = shopRes || [];
    renderShop(shopItems, cur);

    const inv = ecoRes.inventory || [];
    document.getElementById('inventory-list').innerHTML = inv.length
      ? inv.map(i => `
        <div class="inv-item">
          <span class="inv-name">${i.itemName}</span>
          <span class="inv-qty">x${i.quantity}</span>
          <div class="inv-actions">
            <button class="btn btn-secondary btn-xs" onclick="sellItem(${JSON.stringify(i.itemName)}, 1)">Sell</button>
            <button class="btn btn-primary btn-xs" onclick="useItem(${JSON.stringify(i.itemName)})">Use</button>
          </div>
        </div>`).join('')
      : '<div class="empty-state" style="padding:16px 0">Inventory is empty.</div>';

    const cur2 = lbRes.currency || cur;
    const lbEntries = lbRes.entries || [];
    document.getElementById('leaderboard-list').innerHTML = lbEntries.length
      ? lbEntries.map(e => {
          const medals = ['🥇', '🥈', '🥉'];
          const rcClass = e.rank <= 3 ? ` lb-row-${['gold','silver','bronze'][e.rank-1]}` : '';
          return `<div class="lb-row${rcClass}">
            <div class="lb-rank-wrap">
              ${e.rank <= 3 ? `<span class="lb-medal">${medals[e.rank-1]}</span>` : `<span class="lb-rank">${e.rank}</span>`}
            </div>
            <div class="lb-info">
              <div class="lb-name">${esc(e.name)}</div>
              <div class="lb-breakdown">${fmt(e.cash, cur2)} cash &middot; ${fmt(e.bank, cur2)} bank</div>
            </div>
            <div class="lb-total">${fmt(e.total, cur2)}</div>
          </div>`;
        }).join('')
      : '<div class="empty-state" style="padding:12px 0">No data yet.</div>';
  } catch {
    document.getElementById('economy-balance').innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0">Failed to load economy data.</p>';
  }
}

function renderShop(items, currency) {
  const shopList = document.getElementById('shop-list');
  if (!items.length) { shopList.innerHTML = '<div class="empty-state" style="padding:20px 0">No items in the shop.</div>'; return; }
  shopList.innerHTML = items.map(item => `
    <div class="shop-item" data-name="${esc(item.name).toLowerCase()}">
      <div>
        <div class="shop-item-name">${item.name}</div>
        ${item.description ? `<div class="shop-item-desc">${item.description}</div>` : ''}
      </div>
      <div class="shop-item-right">
        <span class="shop-item-price">${fmt(item.price, currency)}</span>
        <button class="btn btn-primary btn-sm" onclick='openBuyModal(${JSON.stringify(item)})'>Buy</button>
      </div>
    </div>
  `).join('');
}

function filterShop(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.shop-item').forEach(el => {
    el.style.display = el.dataset.name.includes(q) ? '' : 'none';
  });
}

function openBuyModal(item) {
  currentBuyItem = item;
  document.getElementById('buy-item-name').textContent = item.name;
  document.getElementById('buy-item-desc').textContent = item.description || '';
  document.getElementById('buy-qty').value = 1;
  document.getElementById('form-buy-error').classList.add('hidden');
  updateBuyTotal();
  openModal('modal-buy');
}

function updateBuyTotal() {
  if (!currentBuyItem) return;
  const qty = parseInt(document.getElementById('buy-qty').value) || 1;
  document.getElementById('buy-total').textContent = `Total: ${fmt(currentBuyItem.price * qty, shopCurrency)}`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('buy-qty')?.addEventListener('input', updateBuyTotal);
});

async function confirmBuy() {
  if (!currentBuyItem) return;
  const qty = parseInt(document.getElementById('buy-qty').value) || 1;
  const errEl = document.getElementById('form-buy-error');
  errEl.classList.add('hidden');
  try {
    await apiPost('/economy/buy', { itemName: currentBuyItem.name, quantity: qty });
    closeModal('modal-buy');
    toast(`Purchased ${qty}× ${currentBuyItem.name}`, 'success');
    loaded['economy'] = false;
    loadEconomy();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

/* ══════════════════════════════════════════════════════
   ECONOMY ACTIONS
══════════════════════════════════════════════════════ */
function showEcoMsg(text, type = 'info') {
  const el = document.getElementById('eco-action-msg');
  if (!el) return;
  el.textContent = text;
  el.className = `eco-action-msg eco-msg-${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), 4000);
}

async function doDeposit() {
  const amount = document.getElementById('deposit-input').value.trim();
  if (!amount) return showEcoMsg('Enter an amount to deposit.', 'error');
  try {
    const r = await apiPost('/economy/deposit', { amount });
    document.getElementById('deposit-input').value = '';
    showEcoMsg(`Deposited. Cash: ${r.cash.toLocaleString()} | Bank: ${r.bank.toLocaleString()}`, 'success');
    loaded['economy'] = false; loadEconomy();
  } catch (err) { showEcoMsg(err.message, 'error'); }
}

async function doWithdraw() {
  const amount = document.getElementById('withdraw-input').value.trim();
  if (!amount) return showEcoMsg('Enter an amount to withdraw.', 'error');
  try {
    const r = await apiPost('/economy/withdraw', { amount });
    document.getElementById('withdraw-input').value = '';
    showEcoMsg(`Withdrawn. Cash: ${r.cash.toLocaleString()} | Bank: ${r.bank.toLocaleString()}`, 'success');
    loaded['economy'] = false; loadEconomy();
  } catch (err) { showEcoMsg(err.message, 'error'); }
}

async function doWork() {
  const btn = document.getElementById('btn-work');
  if (btn) btn.disabled = true;
  try {
    const r = await apiPost('/economy/work', {});
    showEcoMsg(`Worked and earned ${r.earned.toLocaleString()}. Cash: ${r.cash.toLocaleString()}`, 'success');
    loaded['economy'] = false; loadEconomy();
  } catch (err) {
    showEcoMsg(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function sellItem(itemName, qty) {
  try {
    const r = await apiPost('/economy/sell', { itemName, quantity: qty });
    const msg = r.refund > 0 ? `Sold ${r.sold}x ${itemName} for ${r.currency}${r.refund.toLocaleString()}.` : `Sold ${r.sold}x ${itemName}.`;
    showEcoMsg(msg, 'success');
    loaded['economy'] = false; loadEconomy();
  } catch (err) { showEcoMsg(err.message, 'error'); }
}

async function useItem(itemName) {
  try {
    await apiPost('/economy/use', { itemName });
    showEcoMsg(`Used ${itemName}.`, 'info');
    loaded['economy'] = false; loadEconomy();
  } catch (err) { showEcoMsg(err.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   TICKETS
══════════════════════════════════════════════════════ */
async function loadTickets() {
  showSkeletons(document.getElementById('tickets-open'), 3);
  try {
    const tickets = await api('/tickets');
    const open = (tickets || []).filter(t => t.status === 'open');
    const closed = (tickets || []).filter(t => t.status === 'closed');

    document.getElementById('tickets-open').innerHTML = open.length
      ? open.map(t => renderTicket(t)).join('')
      : '<div class="empty-state" style="padding:20px 0">No open tickets.</div>';

    document.getElementById('tickets-closed').innerHTML = closed.length
      ? closed.slice(0, 5).map(t => renderTicket(t)).join('')
      : '<div class="empty-state" style="padding:16px 0">No closed tickets.</div>';
  } catch {
    document.getElementById('tickets-open').innerHTML = '<div class="empty-state">Failed to load tickets.</div>';
  }
}

function renderTicket(t) {
  const sc = t.status === 'open' ? 'ticket-status-open' : 'ticket-status-closed';
  return `
    <div class="ticket-item">
      <div class="ticket-item-left">
        <div class="ticket-id">#${t.ticketId}</div>
        <div class="ticket-type">${t.ticketType || 'Support Ticket'}</div>
        ${t.description ? `<div class="ticket-desc">${t.description}</div>` : ''}
        <div class="ticket-date">${new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
      <span class="status-pill ${sc}">${t.status === 'open' ? 'Open' : 'Closed'}</span>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════
   CALENDAR
══════════════════════════════════════════════════════ */
async function loadCalendar() {
  const list = document.getElementById('calendar-list');
  showSkeletons(list, 3, [60, 100, 40]);
  try {
    const events = await api('/calendar');
    if (!events?.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>No upcoming events scheduled.</div>`;
      return;
    }
    list.innerHTML = events.map(e => {
      const [hh, mm] = (e.time || '').split(':');
      const h = parseInt(hh);
      const formatted = hh && mm ? `${h > 12 ? h - 12 : h || 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}` : e.time;
      const platforms = [];
      if (e.psn) platforms.push(`PSN: ${e.psn}`);
      if (e.xbox) platforms.push(`Xbox: ${e.xbox}`);
      return `
        <div class="cal-item">
          <div class="cal-day-badge">
            <div class="cal-day">${(e.day || '').slice(0, 3)}</div>
            <div class="cal-time">${formatted}</div>
          </div>
          <div class="cal-info">
            <div class="cal-host">${e.person || 'TBA'}</div>
            ${e.description ? `<div class="cal-desc">${e.description}</div>` : ''}
            ${e.timezone ? `<div class="cal-desc" style="margin-top:2px">${e.timezone}</div>` : ''}
            ${platforms.length ? `<div class="cal-platform">${platforms.map(p => `<span class="cal-tag">${p}</span>`).join('')}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<div class="empty-state">Failed to load calendar.</div>';
  }
}

/* ══════════════════════════════════════════════════════
   ROLE REQUESTS
══════════════════════════════════════════════════════ */
async function loadRoleRequest() {
  showSkeletons(document.getElementById('rr-form-area'), 3, [70, 100]);
  try {
    const [typesRes, histRes] = await Promise.all([api('/rolerequest/types'), api('/rolerequest/mine')]);
    const area = document.getElementById('rr-form-area');

    if (!typesRes?.length) {
      area.innerHTML = '<div class="empty-state">No role types configured.<br>Ask a staff member.</div>';
    } else {
      area.innerHTML = `
        <div id="rr-types">${typesRes.map(rt => `
          <div class="rr-role-type" data-id="${rt.id}" onclick="selectRoleType('${rt.id}')">
            <div class="rr-role-name">${rt.roleName || rt.name}</div>
            <div class="rr-role-sub">Tap to select</div>
          </div>`).join('')}
        </div>
        <div id="rr-approver-section" class="rr-approver-section">
          <div class="section-label">Select Approver</div>
          <div id="rr-approvers"></div>
          <div id="rr-submit-error" class="form-error hidden"></div>
          <button class="btn btn-primary" style="margin-top:10px;width:100%" onclick="submitRoleRequest()">Submit Request</button>
        </div>`;
    }

    document.getElementById('rr-history').innerHTML = (histRes || []).length
      ? histRes.map(r => `
          <div class="rr-hist-item">
            <div class="rr-hist-role">${r.roleName}</div>
            <div class="rr-hist-meta">Approver: ${r.approverUsername} • ${new Date(r.timestamp).toLocaleDateString()}</div>
            <span class="status-pill ${r.status === 'approved' ? 'pill-approved' : r.status === 'denied' ? 'pill-denied' : 'pill-pending'}">${r.status || 'pending'}</span>
          </div>`).join('')
      : '<div class="empty-state" style="padding:16px 0">No requests yet.</div>';
  } catch {
    document.getElementById('rr-form-area').innerHTML = '<div class="empty-state">Failed to load.</div>';
  }
}

async function selectRoleType(id) {
  selectedRoleTypeId = id;
  selectedApproverId = null;
  document.querySelectorAll('.rr-role-type').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
  const section = document.getElementById('rr-approver-section');
  section.classList.add('visible');
  const approversEl = document.getElementById('rr-approvers');
  approversEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Loading approvers...</div>';
  try {
    const approvers = await api(`/rolerequest/approvers/${id}`);
    if (!approvers?.length) { approversEl.innerHTML = '<div class="empty-state" style="padding:8px 0">No approvers available.</div>'; return; }
    approversEl.innerHTML = approvers.map(a => `
      <div class="rr-approver-option" data-id="${a.id}" onclick="selectApprover('${a.id}')">${a.name}</div>`).join('');
  } catch {
    approversEl.innerHTML = '<div class="empty-state" style="padding:8px 0">Could not load approvers.</div>';
  }
}

function selectApprover(id) {
  selectedApproverId = id;
  document.querySelectorAll('.rr-approver-option').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
}

async function submitRoleRequest() {
  const errEl = document.getElementById('rr-submit-error');
  errEl.classList.add('hidden');
  if (!selectedRoleTypeId) { errEl.textContent = 'Select a role type.'; errEl.classList.remove('hidden'); return; }
  if (!selectedApproverId) { errEl.textContent = 'Select an approver.'; errEl.classList.remove('hidden'); return; }
  try {
    await apiPost('/rolerequest/submit', { roleTypeId: selectedRoleTypeId, approverId: selectedApproverId });
    toast('Role request submitted. Approver notified by DM.', 'success');
    loaded['rolerequest'] = false;
    loadRoleRequest();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

/* ══════════════════════════════════════════════════════
   LEO - INNER TABS
══════════════════════════════════════════════════════ */
function switchLeoTab(tab) {
  document.querySelectorAll('.leo-innertab').forEach(b => b.classList.toggle('active', b.dataset.leotab === tab));
  document.querySelectorAll('.leo-innerpane').forEach(p => p.classList.add('hidden'));
  const pane = document.getElementById(`leo-innerpane-${tab}`);
  if (pane) pane.classList.remove('hidden');
  if (tab === 'officers') {
    document.getElementById('board-refresh-label')?.classList.remove('hidden');
    stopIntelRefresh();
  } else {
    document.getElementById('board-refresh-label')?.classList.add('hidden');
    if (tab === 'intel') {
      loadLeoIntel();
      startIntelRefresh();
    } else {
      stopIntelRefresh();
    }
  }
}

/* ══════════════════════════════════════════════════════
   LEO - QUICK STATUS
══════════════════════════════════════════════════════ */
let pendingTenCode = null;
const STATUS_NEEDS_DETAILS = new Set(['10-76','10-97','10-11','10-80','10-15','10-99']);

function selectQuickStatus(code) {
  pendingTenCode = code;
  document.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.code === code));
  const errEl = document.getElementById('status-error');
  if (errEl) errEl.classList.add('hidden');

  const detailRow = document.getElementById('status-detail-row');
  if (STATUS_NEEDS_DETAILS.has(code)) {
    detailRow.classList.remove('hidden');
    document.getElementById('status-location').value = '';
    document.getElementById('status-subject').value = '';
    document.getElementById('status-location').focus();
  } else {
    detailRow.classList.add('hidden');
    updateOfficerStatus();
  }
}

function confirmStatusUpdate() {
  if (!pendingTenCode) {
    const errEl = document.getElementById('status-error');
    if (errEl) { errEl.textContent = 'Select a status first.'; errEl.classList.remove('hidden'); }
    return;
  }
  updateOfficerStatus();
}

/* ══════════════════════════════════════════════════════
   LEO - STATUS UPDATE
══════════════════════════════════════════════════════ */
let boardRefreshTimer = null;
let boardCountdown = 8;
let _dispatchEvtSrc = null;

function startBoardRefresh() {
  stopBoardRefresh();
  boardCountdown = 8;
  updateCountdown();
  boardRefreshTimer = setInterval(() => {
    boardCountdown--;
    updateCountdown();
    if (boardCountdown <= 0) {
      boardCountdown = 8;
      refreshOfficerBoard();
    }
  }, 1000);
}

function stopBoardRefresh() {
  if (boardRefreshTimer) { clearInterval(boardRefreshTimer); boardRefreshTimer = null; }
  if (_dispatchEvtSrc) { _dispatchEvtSrc.close(); _dispatchEvtSrc = null; }
}

function startDispatchStream() {
  if (_dispatchEvtSrc) { _dispatchEvtSrc.close(); _dispatchEvtSrc = null; }
  try {
    const es = new EventSource('/api/portal/dispatch/events');
    es.onmessage = () => {
      boardCountdown = 1;
      refreshOfficerBoard().then(() => { boardCountdown = 8; });
    };
    es.onerror = () => { es.close(); _dispatchEvtSrc = null; };
    _dispatchEvtSrc = es;
  } catch { /* EventSource not supported - polling fallback still active */ }
}

function updateCountdown() {
  const el = document.getElementById('board-countdown');
  if (el) el.textContent = boardCountdown;
}

async function refreshOfficerBoard() {
  try {
    const officers = await api('/leo/officers');
    renderOfficerBoard(officers || []);
  } catch { /* silent refresh failure */ }
}

function renderOfficerBoard(officers) {
  const el = document.getElementById('leo-officers');
  if (!el) return;
  if (!officers.length) {
    el.innerHTML = '<div class="empty-state" style="padding:16px 0">No officers currently on duty.</div>';
    return;
  }
  el.innerHTML = officers.map(o => {
    const info = tenInfo(o.tenCode);
    const isMe = me && o.userId === me.userId;
    return `
      <div class="officer-card${isMe ? ' is-me' : ''}">
        <div class="officer-header">
          <div class="officer-name">${o.username}${isMe ? ' <span class="officer-you-badge">You</span>' : ''}</div>
          <span class="officer-badge" style="background:${info.color}18;color:${info.color};border-color:${info.color}40">${info.label}</span>
        </div>
        ${o.location ? `<div class="officer-detail"><span class="officer-detail-label">Loc</span>${o.location}</div>` : ''}
        ${o.subject ? `<div class="officer-detail"><span class="officer-detail-label">Subj</span>${o.subject}</div>` : ''}
        ${o.rawCall ? `<div class="officer-detail officer-dispatch-line"><span class="officer-detail-label">Dispatch</span>${o.rawCall}</div>` : ''}
        <div class="officer-time">Updated ${timeAgo(new Date(o.updatedAt))}</div>
      </div>`;
  }).join('');
}

function applyMyStatusToUI(status) {
  const sub = document.getElementById('my-status-sub');
  const offDutyBtn = document.getElementById('btn-go-offduty');
  if (!status) {
    if (sub) { sub.textContent = 'Not on duty'; sub.className = 'my-status-sub'; }
    if (offDutyBtn) offDutyBtn.style.display = 'none';
    pendingTenCode = null;
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('status-detail-row')?.classList.add('hidden');
    panicActive = false;
    document.getElementById('panic-idle')?.classList.remove('hidden');
    document.getElementById('panic-active')?.classList.add('hidden');
    const panicBtn = document.getElementById('btn-panic');
    if (panicBtn) panicBtn.disabled = false;
    return;
  }
  if (status.tenCode === '10-99') {
    panicActive = true;
    document.getElementById('panic-idle')?.classList.add('hidden');
    document.getElementById('panic-active')?.classList.remove('hidden');
  }
  const info = tenInfo(status.tenCode);
  const parts = [info.label];
  if (status.location) parts.push(status.location);
  if (sub) {
    sub.textContent = parts.join(' · ');
    const urgentCodes = new Set(['10-15','10-99','10-80']);
    const busyCodes = new Set(['10-6','10-97','10-11','10-76']);
    const offCodes = new Set(['10-7','10-10']);
    if (urgentCodes.has(status.tenCode)) sub.className = 'my-status-sub urgent';
    else if (busyCodes.has(status.tenCode)) sub.className = 'my-status-sub busy';
    else if (offCodes.has(status.tenCode)) sub.className = 'my-status-sub';
    else sub.className = 'my-status-sub on-duty';
  }
  if (offDutyBtn) offDutyBtn.style.display = '';
  pendingTenCode = status.tenCode;
  document.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('active', b.dataset.code === status.tenCode));
}

let panicActive = false;

async function triggerPanic() {
  const locRaw = prompt('Panic - 10-99\n\nEnter your current location (or leave blank):');
  if (locRaw === null) return;
  const location = locRaw.trim();

  const btn = document.getElementById('btn-panic');
  const btnOrigHTML = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

  try {
    await apiPost('/leo/panic', { location });
    panicActive = true;
    document.getElementById('panic-idle')?.classList.add('hidden');
    document.getElementById('panic-active')?.classList.remove('hidden');
    applyMyStatusToUI({ tenCode: '10-99', location: location || null, subject: 'PANIC - Officer needs immediate assistance' });
    toast('10-99 sent - dispatch alerted', 'error');
    boardCountdown = 1;
    await refreshOfficerBoard();
    boardCountdown = 30;
  } catch (err) {
    toast(err.message || 'Failed to send panic', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = btnOrigHTML || 'PANIC 10-99'; }
  }
}

async function clearPanic() {
  const clearBtn = document.getElementById('btn-clear-panic');
  if (clearBtn) { clearBtn.disabled = true; clearBtn.textContent = 'Clearing...'; }
  try {
    await apiDel('/leo/status');
    applyMyStatusToUI(null);
    toast('Panic cleared - 10-99 cancelled', 'info');
    await refreshOfficerBoard();
  } catch (err) {
    toast(err.message || 'Failed to clear panic', 'error');
  } finally {
    if (clearBtn) { clearBtn.disabled = false; clearBtn.textContent = 'Clear Panic'; }
  }
}

async function updateOfficerStatus() {
  const tenCode = pendingTenCode;
  const location = document.getElementById('status-location')?.value?.trim() || '';
  const subject = document.getElementById('status-subject')?.value?.trim() || '';
  const errEl = document.getElementById('status-error');
  const btn = document.getElementById('btn-update-status');
  if (errEl) errEl.classList.add('hidden');
  if (!tenCode) {
    if (errEl) { errEl.textContent = 'Select a status first.'; errEl.classList.remove('hidden'); }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }
  try {
    const result = await apiPost('/leo/status', { tenCode, location, subject });
    applyMyStatusToUI(result.status);
    document.getElementById('status-detail-row')?.classList.add('hidden');
    toast(`Status updated to ${tenCode}`, 'success');
    boardCountdown = 1;
    await refreshOfficerBoard();
    boardCountdown = 30;
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm'; }
  }
}

async function goOffDuty() {
  if (!confirm('Go off duty? Your status will be removed from the board.')) return;
  try {
    await apiDel('/leo/status');
    applyMyStatusToUI(null);
    toast('You are now off duty.', 'info');
    await refreshOfficerBoard();
  } catch (err) { toast(err.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   LEO
══════════════════════════════════════════════════════ */
const TEN_CODES = {
  '10-6':  { label: '10-6 Busy',                 color: 'var(--warning)' },
  '10-7':  { label: '10-7 Out of Service',        color: 'var(--text-muted)' },
  '10-8':  { label: '10-8 Available',             color: 'var(--success)' },
  '10-10': { label: '10-10 Off Duty',             color: 'var(--text-muted)' },
  '10-11': { label: '10-11 Traffic Stop',         color: 'var(--accent)' },
  '10-15': { label: '10-15 Prisoner in Custody',  color: 'var(--warning)' },
  '10-50': { label: '10-50 Accident',             color: 'var(--accent)' },
  '10-76': { label: '10-76 En Route',             color: 'var(--accent)' },
  '10-78': { label: '10-78 Need Assistance',      color: 'var(--danger)' },
  '10-80': { label: '10-80 Pursuit',              color: 'var(--danger)' },
  '10-97': { label: '10-97 On Scene',             color: 'var(--accent)' },
  '10-99': { label: '10-99 Officer Down',         color: 'var(--danger)' },
};

function tenInfo(code) {
  return TEN_CODES[code] || { label: code || 'Unknown', color: 'var(--text-muted)' };
}

async function loadLeo() {
  try {
    const [officers, myStatus, priority] = await Promise.all([
      api('/leo/officers'),
      api('/leo/mystatus'),
      api('/priority').catch(() => null),
    ]);
    renderOfficerBoard(officers || []);
    applyMyStatusToUI(myStatus);
    updateLeoCooldownBar(priority);
    startBoardRefresh();
    startDispatchStream();
    await loadLeoIntel();
  } catch {
    document.getElementById('leo-officers').innerHTML = '<div class="empty-state">Failed to load.</div>';
  }
}

let leoCdTimer = null;

function updateLeoCooldownBar(d) {
  const bar = document.getElementById('leo-cooldown-bar');
  if (!bar) return;
  if (leoCdTimer) { clearInterval(leoCdTimer); leoCdTimer = null; }

  if (!d?.cooldown) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');

  const subEl = document.getElementById('leo-cd-sub');
  if (subEl) subEl.textContent = d.cooldownIssuedBy ? `Last host: ${esc(d.cooldownIssuedBy)}` : 'Cooldown in effect';

  if (d.cooldownEndsAt) {
    const timerEl = document.getElementById('leo-cd-timer');
    const tick = () => {
      if (!timerEl) return;
      const diff = Math.max(0, Math.floor((new Date(d.cooldownEndsAt).getTime() - Date.now()) / 1000));
      timerEl.textContent = `${Math.floor(diff/60)}:${(diff%60).toString().padStart(2,'0')}`;
      if (diff === 0) { clearInterval(leoCdTimer); leoCdTimer = null; bar.classList.add('hidden'); }
    };
    tick();
    leoCdTimer = setInterval(tick, 1000);
  }
}

/* ── Intel auto-refresh ── */
let intelRefreshTimer = null;
let intelCountdown = 15;

function startIntelRefresh() {
  stopIntelRefresh();
  intelCountdown = 15;
  updateIntelCountdown();
  intelRefreshTimer = setInterval(() => {
    intelCountdown--;
    updateIntelCountdown();
    if (intelCountdown <= 0) {
      intelCountdown = 15;
      loadLeoIntel();
    }
  }, 1000);
}

function stopIntelRefresh() {
  if (intelRefreshTimer) { clearInterval(intelRefreshTimer); intelRefreshTimer = null; }
}

function updateIntelCountdown() {
  const el = document.getElementById('intel-countdown');
  if (el) el.textContent = intelCountdown;
}

async function loadLeoIntel() {
  try {
    const [bolos, calls] = await Promise.all([api('/leo/bolos'), api('/leo/calls')]);

    const callEl = document.getElementById('leo-calls');
    const boloEl = document.getElementById('leo-bolos');

    if (callEl) {
      callEl.innerHTML = calls?.length
        ? calls.map(c => renderCallCard(c)).join('')
        : '<div class="empty-state" style="padding:12px 0">No active calls.</div>';
    }
    if (boloEl) {
      boloEl.innerHTML = bolos?.length
        ? bolos.map(b => renderBoloItem(b)).join('')
        : '<div class="empty-state" style="padding:12px 0">No active BOLOs.</div>';
    }

    const unresponded = (calls || []).filter(c => !c.respondingLeoId).length;
    const dot = document.getElementById('intel-dot');
    const badge = document.getElementById('intel-unresponded');
    if (dot) dot.classList.toggle('hidden', unresponded === 0);
    if (badge) {
      badge.textContent = `${unresponded} unresponded`;
      badge.classList.toggle('hidden', unresponded === 0);
    }
    intelCountdown = 15;
  } catch {
    const callEl = document.getElementById('leo-calls');
    const boloEl = document.getElementById('leo-bolos');
    if (callEl) callEl.innerHTML = '<div class="empty-state">Failed to load.</div>';
    if (boloEl) boloEl.innerHTML = '<div class="empty-state">Failed to load.</div>';
  }
}

function renderCallCard(call) {
  const hasResponder = !!call.respondingLeoId;
  const myId = me?.userId;
  const isResponder = call.respondingLeoId === myId;
  const isAttached = (call.attachedLeoIds || []).includes(myId);
  const attachedCount = (call.attachedLeoIds || []).length;

  const actions = [];
  if (!hasResponder) actions.push(`<button class="btn btn-primary btn-sm" onclick="respondToCall('${call.callId}')">Respond 10-76</button>`);
  if (!isAttached && !isResponder) actions.push(`<button class="btn btn-secondary btn-sm" onclick="attachToCall('${call.callId}')">Attach 10-97</button>`);
  if (isResponder || isAttached) actions.push(`<button class="btn btn-danger btn-sm" onclick="dismissCall('${call.callId}')">Dismiss</button>`);

  return `<div class="dcc ${hasResponder ? 'dcc-ok' : 'dcc-alert'}">
    <div class="dcc-top">
      <span class="dcc-id">${call.callId}</span>
      <span class="dcc-status-badge ${hasResponder ? 'badge-responding' : 'badge-none'}">${hasResponder ? call.respondingLeoUsername : 'No Response'}</span>
    </div>
    <div class="dcc-issue">${call.issue}</div>
    ${call.location ? `<div class="dcc-loc">${call.location}</div>` : ''}
    <div class="dcc-meta">${timeAgo(new Date(call.timestamp))}${attachedCount ? ` · ${attachedCount} attached` : ''}</div>
    ${actions.length ? `<div class="dcc-actions">${actions.join('')}</div>` : ''}
  </div>`;
}

function renderBoloItem(b) {
  const typeLabel = b.type === 'vehicle' ? 'VEHICLE' : 'WANTED';
  const vehicleDesc = b.type === 'vehicle'
    ? [b.vehicleColor, b.vehicleMake, b.vehicleModel, b.licensePlate ? `(${b.licensePlate})` : ''].filter(Boolean).join(' ')
    : null;
  return `<div class="bolo-item-v2">
    <div class="bolo-v2-top">
      <span class="bolo-v2-name">${b.characterName || b.licensePlate || 'Unknown'}</span>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span class="bolo-v2-type bolo-type-${b.type === 'vehicle' ? 'vehicle' : 'wanted'}">${typeLabel}</span>
        <button class="btn btn-danger btn-xs" onclick="removeBolo('${b.boloId}')">Remove</button>
      </div>
    </div>
    ${vehicleDesc ? `<div class="bolo-v2-sub">${vehicleDesc}</div>` : ''}
    ${b.reason ? `<div class="bolo-v2-reason">${b.reason}</div>` : ''}
    <div class="bolo-v2-meta">Added ${timeAgo(new Date(b.createdAt))}${b.issuedBy ? ` · by ${b.issuedBy}` : ''}</div>
  </div>`;
}

async function removeBolo(boloId) {
  if (!confirm('Remove this BOLO? It will be marked inactive.')) return;
  try {
    await apiDel(`/leo/bolos/${boloId}`);
    toast('BOLO removed.', 'info');
    await loadLeoIntel();
  } catch (err) { toast(err.message || 'Failed to remove BOLO', 'error'); }
}

/* ── Dispatch call actions ── */
async function respondToCall(callId) {
  try {
    await apiPost(`/leo/calls/${callId}/respond`, {});
    toast('Responding - status set to 10-76 En Route', 'success');
    const [, , myStatus] = await Promise.all([loadLeoIntel(), refreshOfficerBoard(), api('/leo/mystatus')]);
    applyMyStatusToUI(myStatus);
  } catch (err) { toast(err.message || 'Failed to respond to call', 'error'); }
}

async function attachToCall(callId) {
  try {
    await apiPost(`/leo/calls/${callId}/attach`, {});
    toast('Attached - status set to 10-97 On Scene', 'success');
    const [, , myStatus] = await Promise.all([loadLeoIntel(), refreshOfficerBoard(), api('/leo/mystatus')]);
    applyMyStatusToUI(myStatus);
  } catch (err) { toast(err.message || 'Failed to attach to call', 'error'); }
}

async function dismissCall(callId) {
  if (!confirm('Dismiss this call? It will be closed and removed from the board.')) return;
  try {
    await apiDel(`/leo/calls/${callId}`);
    toast('Call dismissed', 'info');
    await Promise.all([loadLeoIntel(), refreshOfficerBoard()]);
  } catch (err) { toast(err.message || 'Failed to dismiss call', 'error'); }
}

let leoSearchType = 'plate';

function setSearchType(type) {
  leoSearchType = type;
  document.querySelectorAll('.search-type-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`srch-btn-${type}`)?.classList.add('active');
  const inp = document.getElementById('leo-search-input');
  if (inp) inp.placeholder = type === 'plate' ? 'Search by plate...' : 'Search by name...';
}

async function leoSearch() {
  const type = leoSearchType;
  const query = document.getElementById('leo-search-input').value.trim();
  const results = document.getElementById('leo-results');
  if (!query) { results.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Enter a search query.</p>'; return; }
  results.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Searching...</p>';
  try {
    const data = await api(`/leo/search?type=${type}&query=${encodeURIComponent(query)}`);
    const chars = data.results || [];
    if (!chars.length) { results.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No results found.</p>'; return; }
    results.innerHTML = chars.map(c => {
      const bolos = c.activeBolos || [];
      const tickets = c.trafficTickets || [];

      const matchedVehicle = type === 'plate'
        ? (c.vehicles || []).find(v => v.licensePlate?.toLowerCase().includes(query.toLowerCase()))
        : null;

      const vehicleSection = (() => {
        if (type === 'plate' && matchedVehicle) {
          const mv = matchedVehicle;
          return `<div style="margin:6px 0 4px;padding:8px 10px;background:var(--elevated);border:1px solid var(--border);border-radius:6px">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-sub);margin-bottom:4px">Matched Vehicle</div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">${mv.color || ''} ${mv.make} ${mv.model}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
              Plate: <strong style="color:var(--accent)">${mv.licensePlate || 'N/A'}</strong>
              ${mv.year ? ` · ${mv.year}` : ''}
              ${mv.stolen ? ' · <span style="color:var(--danger);font-weight:700">STOLEN</span>' : ''}
            </div>
          </div>`;
        }
        if (c.vehicles?.length) {
          return `<div class="leo-result-row">Vehicles: <span>${c.vehicles.map(v => `${v.color || ''} ${v.make} ${v.model} (${v.licensePlate || 'no plate'})`).join(', ')}</span></div>`;
        }
        return '';
      })();

      const boloWarning = bolos.length > 0
        ? `<div style="margin:6px 0 4px;padding:6px 10px;background:var(--danger-dim);border:1px solid rgba(242,87,87,0.3);border-radius:6px;font-size:11px;font-weight:700;color:var(--danger)">
            BOLO ACTIVE (${bolos.length}) - ${bolos.map(b => b.reason || 'No reason given').join(' · ')}
           </div>`
        : '';
      const ticketRows = tickets.length > 0
        ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-sub);margin-bottom:4px">Traffic Tickets (${tickets.length})</div>
            ${tickets.slice(0, 5).map(t => `
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px">
                <span style="color:var(--text);font-weight:600">${t.violation}</span>
                ${t.fine ? ` · $${t.fine}` : ''}
                · <span style="${t.paid ? 'color:var(--success)' : 'color:var(--warning)'}">${t.paid ? 'Paid' : 'Unpaid'}</span>
                · ${timeAgo(new Date(t.createdAt))}
              </div>`).join('')}
            ${tickets.length > 5 ? `<div style="font-size:11px;color:var(--text-sub)">&hellip; and ${tickets.length - 5} more</div>` : ''}
           </div>`
        : '';
      return `<div class="leo-result-card">
        <div class="leo-result-name">
          ${c.characterName}
          <span class="char-status ${c.status === 'wanted' ? 'status-wanted' : 'status-clean'}" style="font-size:10px">${(c.status || 'clean').toUpperCase()}</span>
          ${bolos.length > 0 ? '<span style="font-size:10px;font-weight:800;color:var(--danger);background:var(--danger-dim);border:1px solid rgba(242,87,87,0.25);padding:1px 7px;border-radius:10px">BOLO</span>' : ''}
        </div>
        ${boloWarning}
        ${vehicleSection}
        <div class="leo-result-row">Age: <span>${c.age || 'N/A'}</span> · Gender: <span>${c.gender || 'N/A'}</span></div>
        <div class="leo-result-row">Address: <span>${c.address || 'N/A'}</span></div>
        <div class="leo-result-row">License: <span>${c.driversLicense || 'N/A'}</span> · Status: <span>${c.driverLicenseStatus || 'Valid'}</span></div>
        ${c.status === 'wanted' && c.wantedReason ? `<div class="leo-result-row" style="color:var(--danger)">Wanted: <span style="color:var(--danger)">${c.wantedReason}</span></div>` : ''}
        ${ticketRows}
      </div>`;
    }).join('');
  } catch (err) {
    results.innerHTML = `<p style="color:var(--danger);font-size:13px">${err.message}</p>`;
  }
}

/* ══════════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════════ */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); document.body.style.overflow = ''; }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
});

function openCreateCharModal() {
  document.getElementById('form-create-char').reset();
  document.getElementById('form-char-error').classList.add('hidden');
  openModal('modal-create-char');
}

async function submitCreateChar(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const errEl = document.getElementById('form-char-error');
  const btn = e.target.querySelector('[type="submit"]');
  errEl.classList.add('hidden');
  btn.disabled = true;
  try {
    await apiPost('/cad/create', data);
    closeModal('modal-create-char');
    toast('Character created.', 'success');
    loaded['cad'] = false;
    loadCad();
    loaded['overview'] = false;
    loadOverview();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  finally { btn.disabled = false; }
}

function openAddFirearmModal(charId) {
  document.getElementById('form-add-firearm').reset();
  document.getElementById('firearm-char-id').value = charId;
  document.getElementById('form-firearm-error').classList.add('hidden');
  openModal('modal-add-firearm');
}

async function submitAddFirearm(e) {
  e.preventDefault();
  const charId = document.getElementById('firearm-char-id').value;
  const data = Object.fromEntries(new FormData(e.target));
  const errEl = document.getElementById('form-firearm-error');
  const btn = e.target.querySelector('[type="submit"]');
  errEl.classList.add('hidden');
  btn.disabled = true;
  try {
    await apiPost(`/cad/${charId}/gun`, data);
    closeModal('modal-add-firearm');
    toast('Firearm registered.', 'success');
    loaded['cad'] = false;
    loadCad();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  finally { btn.disabled = false; }
}

async function removeFirearm(charId, gunIndex) {
  if (!confirm('Remove this firearm registration? This cannot be undone.')) return;
  try {
    await apiDel(`/cad/${charId}/gun/${gunIndex}`);
    toast('Firearm removed.', 'info');
    loaded['cad'] = false;
    loadCad();
  } catch (err) { toast(err.message, 'error'); }
}

function openAddVehicleModal(charId) {
  document.getElementById('vehicle-char-id').value = charId;
  document.getElementById('form-add-vehicle').reset();
  document.getElementById('vehicle-char-id').value = charId;
  document.getElementById('form-vehicle-error').classList.add('hidden');
  openModal('modal-add-vehicle');
}

async function submitAddVehicle(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  const charId = data.charId;
  delete data.charId;
  const errEl = document.getElementById('form-vehicle-error');
  const btn = e.target.querySelector('[type="submit"]');
  errEl.classList.add('hidden');
  btn.disabled = true;
  try {
    await apiPost(`/cad/${charId}/vehicle`, data);
    closeModal('modal-add-vehicle');
    toast('Vehicle added.', 'success');
    loaded['cad'] = false;
    loadCad();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
  finally { btn.disabled = false; }
}

/* ══════════════════════════════════════════════════════
   PRIORITY TRACKER
══════════════════════════════════════════════════════ */
let priorityRefreshTimer = null;

async function loadPriority() {
  const hero = document.getElementById('priority-status-hero');
  const detail = document.getElementById('priority-detail-card');
  if (!hero) return;

  if (priorityRefreshTimer) { clearInterval(priorityRefreshTimer); priorityRefreshTimer = null; }
  if (priorityCooldownTimer) { clearInterval(priorityCooldownTimer); priorityCooldownTimer = null; }

  try {
    const d = await api('/priority');

    if (d.active) {
      hero.innerHTML = `
        <div class="priority-hero-state priority-hero-active">
          <div class="priority-state-dot priority-dot-active"></div>
          <div class="priority-state-label">PRIORITY ACTIVE</div>
        </div>`;

      const elapsed = d.activatedAt ? elapsedSince(d.activatedAt) : null;
      const rows = [
        d.issuedBy ? `<div class="priority-row"><span class="priority-row-key">Issued By</span><span class="priority-row-val">${d.issuedBy}</span></div>` : '',
        elapsed ? `<div class="priority-row"><span class="priority-row-key">Duration</span><span class="priority-row-val" id="priority-timer">${elapsed}</span></div>` : '',
        d.customMessage ? `<div class="priority-row"><span class="priority-row-key">Message</span><span class="priority-row-val">${d.customMessage}</span></div>` : '',
        d.expiresAt ? `<div class="priority-row"><span class="priority-row-key">Expires</span><span class="priority-row-val">${formatRelativeTime(d.expiresAt)}</span></div>` : '',
      ].filter(Boolean).join('');

      detail.innerHTML = rows || '<div class="priority-row-empty">No additional details.</div>';
      detail.classList.remove('hidden');
      startPriorityElapsedTimer(d.activatedAt);

    } else if (d.cooldown) {
      hero.innerHTML = `
        <div class="priority-hero-state priority-hero-cooldown">
          <div class="priority-state-dot priority-dot-cooldown"></div>
          <div class="priority-state-label">ON COOLDOWN</div>
        </div>`;

      const rows = [
        d.cooldownIssuedBy ? `<div class="priority-row"><span class="priority-row-key">Last Host</span><span class="priority-row-val">${d.cooldownIssuedBy}</span></div>` : '',
        d.cooldownMinutes ? `<div class="priority-row"><span class="priority-row-key">Duration</span><span class="priority-row-val">${d.cooldownMinutes} min cooldown</span></div>` : '',
        d.cooldownEndsAt ? `<div class="priority-row"><span class="priority-row-key">Time Remaining</span><span class="priority-row-val" id="priority-cooldown-timer">--:--</span></div>` : '',
      ].filter(Boolean).join('');

      detail.innerHTML = rows || '<div class="priority-row-empty">Cooldown in progress.</div>';
      detail.classList.remove('hidden');

      if (d.cooldownEndsAt) startCooldownTimer(d.cooldownEndsAt);

    } else {
      hero.innerHTML = `
        <div class="priority-hero-state priority-hero-inactive">
          <div class="priority-state-dot priority-dot-inactive"></div>
          <div class="priority-state-label">Priority: Inactive</div>
          <div class="priority-state-sub">Server open</div>
        </div>`;
      detail.innerHTML = '';
      detail.classList.add('hidden');
    }
  } catch {
    hero.innerHTML = `<div class="priority-hero-loading">Unable to load priority status.</div>`;
  }
}

function elapsedSince(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60), s = diff % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `${h}h ${rm}m`;
}

function formatRelativeTime(dateStr) {
  const diff = Math.floor((new Date(dateStr).getTime() - Date.now()) / 1000);
  if (diff <= 0) return 'now';
  if (diff < 60) return `in ${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60), rm = m % 60;
  return `in ${h}h ${rm}m`;
}

function startPriorityElapsedTimer(activatedAt) {
  if (priorityRefreshTimer) clearInterval(priorityRefreshTimer);
  priorityRefreshTimer = setInterval(() => {
    const el = document.getElementById('priority-timer');
    if (!el) { clearInterval(priorityRefreshTimer); return; }
    el.textContent = elapsedSince(activatedAt);
  }, 1000);
}

/* ── Global Priority Bar ── */
let globalBarTimer = null;

function updateGlobalPriorityBar(d) {
  const bar = document.getElementById('global-priority-bar');
  if (!bar) return;
  if (globalBarTimer) { clearInterval(globalBarTimer); globalBarTimer = null; }

  const title = document.getElementById('gpb-title');
  const sub = document.getElementById('gpb-sub');
  const timer = document.getElementById('gpb-timer');

  if (d?.active) {
    bar.className = 'gpb-active';
    title.textContent = 'PRIORITY ACTIVE';
    sub.textContent = d.issuedBy ? `Hosted by ${esc(d.issuedBy)}` : '';
    timer.textContent = '';
    if (d.expiresAt) {
      const endsMs = new Date(d.expiresAt).getTime();
      const tick = () => {
        const diff = Math.max(0, Math.floor((endsMs - Date.now()) / 1000));
        const m = Math.floor(diff / 60), s = diff % 60;
        timer.textContent = `${m}:${s.toString().padStart(2, '0')} remaining`;
      };
      tick(); globalBarTimer = setInterval(tick, 1000);
    } else if (d.activatedAt) {
      const tick = () => { timer.textContent = elapsedSince(d.activatedAt); };
      tick(); globalBarTimer = setInterval(tick, 1000);
    }
  } else if (d?.cooldown) {
    bar.className = 'gpb-cooldown';
    title.textContent = 'COOLDOWN';
    sub.textContent = d.cooldownIssuedBy ? `Last host: ${esc(d.cooldownIssuedBy)}` : '';
    timer.textContent = '';
    if (d.cooldownEndsAt) {
      const endsMs = new Date(d.cooldownEndsAt).getTime();
      const tick = () => {
        const diff = Math.max(0, Math.floor((endsMs - Date.now()) / 1000));
        if (diff === 0) { timer.textContent = 'Ending...'; clearInterval(globalBarTimer); globalBarTimer = null; return; }
        const m = Math.floor(diff / 60), s = diff % 60;
        timer.textContent = `${m}m ${s.toString().padStart(2, '0')}s`;
      };
      tick(); globalBarTimer = setInterval(tick, 1000);
    }
  } else {
    bar.className = 'gpb-hidden';
  }
}

let globalPriorityPollTimer = null;
function startGlobalPriorityPoll() {
  if (globalPriorityPollTimer) clearInterval(globalPriorityPollTimer);
  const poll = () => api('/priority').catch(() => null).then(d => { if (d) updateGlobalPriorityBar(d); });
  poll();
  globalPriorityPollTimer = setInterval(poll, 30000);
}

let priorityCooldownTimer = null;
function startCooldownTimer(endsAt) {
  if (priorityCooldownTimer) clearInterval(priorityCooldownTimer);
  const endsMs = new Date(endsAt).getTime();
  const tick = () => {
    const el = document.getElementById('priority-cooldown-timer');
    if (!el) { clearInterval(priorityCooldownTimer); priorityCooldownTimer = null; return; }
    const diff = Math.max(0, Math.floor((endsMs - Date.now()) / 1000));
    if (diff === 0) {
      el.textContent = 'Ending...';
      clearInterval(priorityCooldownTimer);
      priorityCooldownTimer = null;
      setTimeout(() => loadPriority(), 3000);
      return;
    }
    const m = Math.floor(diff / 60), s = diff % 60;
    el.textContent = `${m}m ${s.toString().padStart(2, '0')}s`;
  };
  tick();
  priorityCooldownTimer = setInterval(tick, 1000);
}

let priorityAutoRefresh = null;
function schedulePriorityRefresh() {
  if (priorityAutoRefresh) clearInterval(priorityAutoRefresh);
  priorityAutoRefresh = setInterval(() => {
    const pane = document.getElementById('tab-priority');
    if (pane?.classList.contains('active')) loadPriority();
    else clearInterval(priorityAutoRefresh);
  }, 30000);
}

/* ══════════════════════════════════════════════════════
   LEO ACTIONS - BOLO & TICKET
══════════════════════════════════════════════════════ */
async function searchForBolo() {
  const q = document.getElementById('bolo-char-search').value.trim();
  const results = document.getElementById('bolo-char-results');
  if (!q) { results.innerHTML = ''; return; }
  results.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:6px 0">Searching...</div>';
  try {
    const data = await api(`/leo/search?type=character&query=${encodeURIComponent(q)}`);
    if (!data.results?.length) { results.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:6px 0">No characters found.</div>'; return; }
    results.innerHTML = data.results.map(c => `
      <div class="leo-char-result-item" onclick="selectBoloChar('${c._id}','${c.characterName.replace(/'/g,"\\'")}')">
        <div class="leo-char-result-name">${c.characterName}</div>
        <div class="leo-char-result-sub">${c.occupation || 'No occupation'} &bull; ${c.status === 'wanted' ? '<span style="color:var(--danger)">Wanted</span>' : 'Clean'}</div>
      </div>`).join('');
  } catch (err) { results.innerHTML = `<div style="color:var(--danger);font-size:12px;padding:6px 0">${err.message}</div>`; }
}

function selectBoloChar(charId, charName) {
  document.getElementById('bolo-char-id').value = charId;
  document.getElementById('bolo-selected-info').innerHTML = `<span class="leo-selected-tag">Selected: <strong>${charName}</strong></span>`;
  document.getElementById('bolo-char-results').innerHTML = '';
  document.getElementById('bolo-details').classList.remove('hidden');
  document.getElementById('bolo-reason').focus();
}

function cancelBoloSearch() {
  document.getElementById('bolo-char-id').value = '';
  document.getElementById('bolo-char-search').value = '';
  document.getElementById('bolo-char-results').innerHTML = '';
  document.getElementById('bolo-reason').value = '';
  document.getElementById('bolo-description').value = '';
  document.getElementById('bolo-error').classList.add('hidden');
  document.getElementById('bolo-details').classList.add('hidden');
}

async function submitCreateBolo() {
  const charId = document.getElementById('bolo-char-id').value;
  const reason = document.getElementById('bolo-reason').value.trim();
  const description = document.getElementById('bolo-description').value.trim();
  const errEl = document.getElementById('bolo-error');
  if (!charId || !reason) { errEl.textContent = 'Character and reason are required.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  try {
    await apiPost('/leo/bolos/create', { characterId: charId, reason, description });
    toast('BOLO issued.', 'success');
    cancelBoloSearch();
    loaded['leo'] = false;
    switchLeoTab('intel');
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

async function searchForTicket() {
  const q = document.getElementById('ticket-char-search').value.trim();
  const results = document.getElementById('ticket-char-results');
  if (!q) { results.innerHTML = ''; return; }
  results.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:6px 0">Searching...</div>';
  try {
    const data = await api(`/leo/search?type=character&query=${encodeURIComponent(q)}`);
    if (!data.results?.length) { results.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:6px 0">No characters found.</div>'; return; }
    results.innerHTML = data.results.map(c => `
      <div class="leo-char-result-item" onclick="selectTicketChar('${c._id}','${c.characterName.replace(/'/g,"\\'")}')">
        <div class="leo-char-result-name">${c.characterName}</div>
        <div class="leo-char-result-sub">${c.occupation || 'No occupation'} &bull; ${c.driversLicense ? 'DL: ' + c.driversLicense : 'No DL on file'}</div>
      </div>`).join('');
  } catch (err) { results.innerHTML = `<div style="color:var(--danger);font-size:12px;padding:6px 0">${err.message}</div>`; }
}

function selectTicketChar(charId, charName) {
  document.getElementById('ticket-char-id').value = charId;
  document.getElementById('ticket-selected-info').innerHTML = `<span class="leo-selected-tag">Issuing to: <strong>${charName}</strong></span>`;
  document.getElementById('ticket-char-results').innerHTML = '';
  document.getElementById('ticket-details').classList.remove('hidden');
  document.getElementById('ticket-violation').focus();
}

function cancelTicketSearch() {
  document.getElementById('ticket-char-id').value = '';
  document.getElementById('ticket-char-search').value = '';
  document.getElementById('ticket-char-results').innerHTML = '';
  document.getElementById('ticket-violation').value = '';
  document.getElementById('ticket-description').value = '';
  document.getElementById('ticket-fine').value = '';
  document.getElementById('ticket-error').classList.add('hidden');
  document.getElementById('ticket-details').classList.add('hidden');
}

async function submitIssueLeoTicket() {
  const charId = document.getElementById('ticket-char-id').value;
  const violation = document.getElementById('ticket-violation').value.trim();
  const description = document.getElementById('ticket-description').value.trim();
  const fine = document.getElementById('ticket-fine').value;
  const errEl = document.getElementById('ticket-error');
  if (!charId || !violation) { errEl.textContent = 'Character and violation are required.'; errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');
  try {
    await apiPost('/leo/ticket', { characterId: charId, violation, description, fine });
    toast('Traffic ticket issued.', 'success');
    cancelTicketSearch();
  } catch (err) { errEl.textContent = err.message; errEl.classList.remove('hidden'); }
}

/* ══════════════════════════════════════════════════════
   API HELPERS
══════════════════════════════════════════════════════ */
async function api(path) {
  const res = await fetch(`/api/portal${path}`, { credentials: 'include' });
  if (res.status === 401) { window.location.href = '/'; return null; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`/api/portal${path}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiDel(path) {
  const res = await fetch(`/api/portal${path}`, { method: 'DELETE', credentials: 'include' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ══════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════ */
let toastContainer;
function toast(msg, type = 'success') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
function fmt(n, cur = '$') { return `${cur}${Number(n || 0).toLocaleString()}`; }
function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function timeAgo(date) {
  const secs = Math.floor((Date.now() - date) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}
