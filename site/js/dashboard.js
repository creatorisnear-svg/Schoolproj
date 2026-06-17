var API_BASE = 'https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
var SITE_URL = 'https://roleplaymanager.xyz';
var BILLING_PORTAL_URL = 'https://billing.stripe.com/p/login/3cIdR9aKdaXpgnA9vs33W00';

var app = document.getElementById('app');
var toastEl = document.getElementById('toast');

var currentUser = null;
var currentGuild = null;
var guilds = [];
var pendingChanges = {};
var sidebarOpen = false;
var featureFlags = { dispatch: true };
var TOPGG_VOTE_URL = '';

function getToken() { return localStorage.getItem('dash_token'); }
function setToken(t) { localStorage.setItem('dash_token', t); }
function clearToken() { localStorage.removeItem('dash_token'); }

/* ── Toast ── */
function toast(msg, type) {
  type = type || 'success';
  toastEl.textContent = msg;
  toastEl.className = 'toast ' + type + ' show';
  setTimeout(function() { toastEl.classList.remove('show'); }, 3500);
}

/* ── API wrapper ── */
function api(path, opts) {
  opts = opts || {};
  var token = getToken();
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (opts.headers) { for (var k in opts.headers) headers[k] = opts.headers[k]; }
  opts.headers = headers;
  return fetch(API_BASE + '/api' + path, opts).then(function(res) {
    if (res.status === 401) { clearToken(); showLogin(); return null; }
    if (!res.ok) {
      return res.json().catch(function() { return {}; }).then(function(err) {
        if (err.error === 'premium_required') {
          toast('Premium required - activate a key in the Premium section below.', 'error');
          var premSection = document.getElementById('premium-section');
          if (premSection) {
            premSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            premSection.style.outline = '2px solid #5865f2';
            setTimeout(function() { premSection.style.outline = ''; }, 2500);
          }
          return { __premium_required: true };
        }
        toast(err.error || 'Something went wrong', 'error');
        return null;
      });
    }
    return res.json();
  }).catch(function() {
    toast('Connection error. Please try again.', 'error');
    return null;
  });
}

/* ── Escape HTML ── */
function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/* ── Login / Auth ── */
function showLogin() {
  var clientId = '1441306995641683978';
  var redirectUri = encodeURIComponent(API_BASE + '/auth/site/callback');
  var state = encodeURIComponent(SITE_URL + '/dashboard/');
  var loginUrl = 'https://discord.com/api/oauth2/authorize?client_id=' + clientId +
    '&redirect_uri=' + redirectUri + '&response_type=code&scope=identify%20guilds&state=' + state;

  app.innerHTML =
    '<div class="login-page"><div class="login-box">' +
    '<img src="/img/logo.png" alt="RPM">' +
    '<h2>Dashboard</h2>' +
    '<p>Sign in with Discord to manage your servers.</p>' +
    '<a href="' + loginUrl + '" class="btn btn-primary" style="width:100%;justify-content:center;">Sign in with Discord</a>' +
    '</div></div>';
}

function loadFeatureFlags(callback) {
  fetch(API_BASE + '/api/public/features').then(function(r) { return r.json(); }).then(function(flags) {
    featureFlags = flags || { dispatch: true };
    if (flags && flags._topggVoteUrl) TOPGG_VOTE_URL = flags._topggVoteUrl;
    callback();
  }).catch(function() {
    callback();
  });
}

function logout() { clearToken(); window.location.href = '/'; }
function switchAccount() { clearToken(); showLogin(); }

/* ── Session persistence (survives refresh + re-auth) ── */
function saveSession(guildId, section) {
  try {
    if (guildId) localStorage.setItem('rpm_guild_id', guildId);
    if (section) localStorage.setItem('rpm_section', section);
    else localStorage.removeItem('rpm_section');
  } catch(e) {}
}
function clearSession() {
  try { localStorage.removeItem('rpm_guild_id'); localStorage.removeItem('rpm_section'); } catch(e) {}
}
function getSavedGuildId() { try { return localStorage.getItem('rpm_guild_id'); } catch(e) { return null; } }
function getSavedSection()  { try { return localStorage.getItem('rpm_section');  } catch(e) { return null; } }

/* ── Loading helpers ── */
function fullPageLoader(msg) {
  return '<div class="rpm-loader"><div class="rpm-loader-inner">' +
    '<img src="/img/logo.png" class="rpm-loader-logo" alt="RPM">' +
    '<div class="rpm-spinner"></div>' +
    '<span class="rpm-loader-text">' + (msg || 'Loading') + '<span class="rpm-loader-dots"><span></span><span></span><span></span></span></span>' +
    '</div></div>';
}
function settingsSkeletonLoader() {
  function skRow(w1, w2) {
    return '<div class="skeleton-row">' +
      '<div class="config-left"><div class="sk-line skeleton" style="width:' + w1 + ';"></div>' +
      '<div class="sk-line skeleton" style="width:' + Math.round(parseInt(w1)*0.6) + 'px;margin-top:6px;opacity:0.5;"></div></div>' +
      '<div class="sk-box skeleton" style="width:' + w2 + ';"></div>' +
      '</div>';
  }
  function skSection(rows) {
    var html = '<div class="skeleton-section"><div class="skeleton-header"><div class="sk-line skeleton" style="width:90px;"></div></div>';
    rows.forEach(function(r) { html += skRow(r[0], r[1]); });
    return html + '</div>';
  }
  return skSection([['55%','38px'],['40%','120px'],['65%','38px']]) +
    skSection([['45%','120px'],['60%','38px'],['50%','120px']]);
}

/* ── Sidebar toggle (mobile) ── */
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  var sb = document.querySelector('.sidebar');
  var overlay = document.querySelector('.sidebar-overlay');
  if (sb) sb.classList.toggle('open', sidebarOpen);
  if (overlay) overlay.classList.toggle('open', sidebarOpen);
}
function closeSidebar() {
  sidebarOpen = false;
  var sb = document.querySelector('.sidebar');
  var overlay = document.querySelector('.sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

/* ── Init ── */
function init() {
  var hash = window.location.hash;
  if (hash && hash.indexOf('#token=') === 0) {
    setToken(hash.substring(7));
    history.replaceState(null, '', window.location.pathname);
  }
  var token = getToken();
  if (!token) { showLogin(); return; }

  app.innerHTML = fullPageLoader('Loading');

  loadFeatureFlags(function() {
    api('/me').then(function(data) {
      if (!data || !data.user) { clearToken(); showLogin(); return; }
      currentUser = data.user;
      guilds = data.guilds || [];
      var avatar = currentUser.avatar
        ? 'https://cdn.discordapp.com/avatars/' + currentUser.id + '/' + currentUser.avatar + '.png?size=32'
        : null;
      var navUser = document.getElementById('nav-user');
      if (navUser) {
        navUser.innerHTML =
          '<div class="user-menu" id="user-menu">' +
          '<button class="user-menu-trigger btn btn-ghost btn-sm" onclick="toggleUserMenu(event)">' +
          (avatar ? '<img src="' + avatar + '" style="width:24px;height:24px;border-radius:50%;margin-right:6px;">' : '') +
          esc(currentUser.username) +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:4px;"><path d="M6 9l6 6 6-6"/></svg>' +
          '</button>' +
          '<div class="user-menu-dropdown" id="user-menu-dropdown">' +
          '<a href="#" onclick="switchAccount();return false;" class="user-menu-item">Switch Account</a>' +
          '<a href="#" onclick="logout();return false;" class="user-menu-item user-menu-item-danger">Sign Out</a>' +
          '</div></div>';
      }
      var savedGuildId = getSavedGuildId();
      var savedSection = getSavedSection();
      if (savedGuildId && guilds.some(function(g) { return g.id === savedGuildId; })) {
        selectServer(savedGuildId, savedSection);
      } else {
        renderServerSelect();
      }
    });
  });
}

function toggleUserMenu(e) {
  e.stopPropagation();
  var dropdown = document.getElementById('user-menu-dropdown');
  if (dropdown) dropdown.classList.toggle('open');
}
document.addEventListener('click', function() {
  var dropdown = document.getElementById('user-menu-dropdown');
  if (dropdown) dropdown.classList.remove('open');
});

/* ── Server Select ── */
function renderServerSelect() {
  clearSession();
  currentGuild = null;
  pendingChanges = {};
  app.innerHTML =
    '<div style="padding-top:80px;max-width:800px;margin:0 auto;padding-left:24px;padding-right:24px;">' +
    '<div class="dash-header"><h1>Select a Server</h1>' +
    '<p>Choose a server to manage. Only servers where you have Admin permissions and the bot is present are shown.</p></div>' +
    '<div class="server-list">' +
    (guilds.length === 0
      ? '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:24px;text-align:center;">' +
        '<p style="color:var(--text-muted);font-size:13px;margin-bottom:8px;">No servers found.</p>' +
        '<p style="color:var(--text-dim);font-size:12px;">Make sure the bot is in your server and you have the <strong>Administrator</strong> permission, then refresh this page.</p>' +
        '</div>'
      : guilds.map(function(g) {
          return '<div class="server-card" onclick="selectServer(\'' + g.id + '\')">' +
            '<div class="server-icon">' +
            (g.icon ? '<img src="https://cdn.discordapp.com/icons/' + g.id + '/' + g.icon + '.png?size=64" alt="">' : esc(g.name.charAt(0))) +
            '</div><div style="flex:1;min-width:0;">' +
            '<div class="server-name">' + esc(g.name) + '</div>' +
            '<div class="server-members">' + (g.memberCount || 0) + ' members</div></div>' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-dim);flex-shrink:0;"><path d="M9 18l6-6-6-6"/></svg>' +
            '</div>';
        }).join('')) +
    '</div></div>';
}

function isFlagPremium(featureKey) {
  if (featureKey in featureFlags) return featureFlags[featureKey] === true;
  return featureKey === 'dispatch';
}

function selectServer(guildId, section) {
  saveSession(guildId, section || null);
  app.innerHTML = fullPageLoader('Loading server');
  Promise.all([
    api('/guild/' + guildId),
    fetch(API_BASE + '/api/public/features').then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; })
  ]).then(function(results) {
    var data = results[0];
    featureFlags = results[1] || {};
    if (!data) { clearSession(); renderServerSelect(); return; }
    currentGuild = data;
    pendingChanges = {};
    if (section) { renderSettings(section); } else { renderDashboard(); }
  });
}

/* ── Feature definitions ── */
var FEATURES = [
  { key: 'roleplayEnabled',     feature: 'roleplay',      name: 'Roleplay Commands', icon: 'RP',  desc: '911, Twitter, anon tips, CAD',   mod: 'roleplay' },
  { key: 'priorityEnabled',     feature: 'priority',      name: 'Priority Tracker',  icon: 'PRI', desc: 'Priority event tracking',         mod: 'priority' },
  { key: 'strikeEnabled',       feature: 'strike',        name: 'Strike System',     icon: 'STR', desc: 'Multi-level strike punishments',  mod: 'strikes' },
  { key: 'calendarEnabled',     feature: 'calendar',      name: 'RP Calendar',       icon: 'CAL', desc: 'Weekly event scheduling',         mod: 'calendar' },
  { key: 'ticketEnabled',       feature: 'ticket',        name: 'Ticket Support',    icon: 'TKT', desc: 'Support ticket system',           mod: 'tickets' },
  { key: 'antiPromotingEnabled',feature: 'antipromote',   name: 'Anti-Promoting',    icon: 'AP',  desc: 'Invite link filtering',           mod: 'antipromo' },
  { key: 'roleRequestEnabled',  feature: 'rolerequest',   name: 'Role Request',      icon: 'RR',  desc: 'Self-serve role requests',        mod: 'rolerequest' },
  { key: 'verifyEnabled',       feature: 'verification',  name: 'Verification',      icon: 'ID',  desc: 'Member verification gate',        mod: 'verification' },
  { key: 'welcomeEnabled',      feature: 'welcome',       name: 'Welcome System',    icon: 'WEL', desc: 'New member messages',             mod: 'welcome' },
  { key: 'dispatchEnabled',     feature: 'dispatch',      name: 'AI Voice Dispatch', icon: 'AI',  desc: 'AI-powered voice dispatch',       mod: 'dispatch' },
  { key: 'economyEnabled',      feature: 'economy',       name: 'Economy',           icon: '$',   desc: 'Currency, work, crime, gambling', mod: 'economy' },
  { key: 'movemeEnabled',       feature: 'moveme',        name: 'Voice Mover',       icon: 'VM',  desc: 'Member self-move between channels', mod: 'moveme' },
  { key: 'civjobsEnabled',      feature: 'civjobs',       name: 'Civilian Jobs',     icon: 'CJ',  desc: 'Job board with shift roles',        mod: 'civjobs' },
  { key: 'blacklistEnabled',    feature: 'blacklist',     name: 'Blacklist',         icon: 'BL',  desc: 'Server blacklist with IP protection', mod: 'blacklist' },
];

var SIDEBAR_GROUPS = [
  { title: 'Roleplay', items: [
    { id: 'roleplay',    label: 'Roleplay Commands' },
    { id: 'priority',    label: 'Priority Tracker' },
    { id: 'calendar',    label: 'RP Calendar' },
  ]},
  { title: 'Moderation', items: [
    { id: 'verification', label: 'Verification' },
    { id: 'strikes',      label: 'Strike System' },
    { id: 'antipromo',    label: 'Anti-Promoting' },
    { id: 'blacklist',    label: 'Blacklist' },
  ]},
  { title: 'Community', items: [
    { id: 'tickets',       label: 'Ticket Support' },
    { id: 'welcome',       label: 'Welcome System' },
    { id: 'rolerequest',   label: 'Role Request' },
    { id: 'moveme',        label: 'Voice Mover' },
    { id: 'sticky',        label: 'Sticky Messages' },
    { id: 'reactionroles', label: 'Reaction Roles' },
  ]},
  { title: 'Economy', items: [
    { id: 'economy',     label: 'Economy' },
    { id: 'civjobs',     label: 'Civilian Jobs' },
  ]},
  { title: 'Advanced', items: [
    { id: 'dispatch',    label: 'AI Voice Dispatch' },
    { id: 'staff',       label: 'Staff Management' },
    { id: 'general',     label: 'General Settings' },
  ]},
];

/* ── Sidebar HTML ── */
function renderSidebar(active) {
  var premiumSection = currentGuild && currentGuild.premium
    ? '<div class="sidebar-section"><div class="sidebar-section-title">Premium</div>' +
      '<div class="sidebar-item ' + (active === 'billing' ? 'active' : '') + '" onclick="closeSidebar();renderBilling()">Billing</div>' +
      '</div>'
    : '';
  var groupedSections = SIDEBAR_GROUPS.map(function(g) {
    return '<div class="sidebar-section"><div class="sidebar-section-title">' + g.title + '</div>' +
      g.items.map(function(m) {
        return '<div class="sidebar-item ' + (active === m.id ? 'active' : '') + '" onclick="closeSidebar();renderSettings(\'' + m.id + '\')">' + m.label + '</div>';
      }).join('') +
      '</div>';
  }).join('');
  return '<div class="sidebar" id="main-sidebar">' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Server</div>' +
    '<div class="sidebar-item ' + (active === 'overview' ? 'active' : '') + '" onclick="closeSidebar();renderDashboard()">Overview</div>' +
    '<div class="sidebar-item" onclick="closeSidebar();renderServerSelect()">Switch Server</div>' +
    '</div>' +
    groupedSections +
    premiumSection +
    '</div>' +
    '<div class="sidebar-overlay" onclick="closeSidebar()"></div>';
}

/* ── Sidebar toggle button (mobile) ── */
function sidebarToggleBtn(label) {
  return '<button class="sidebar-toggle-btn" onclick="toggleSidebar()">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>' +
    (label || 'Menu') +
    '</button>';
}

/* ── Overview / Dashboard ── */
function renderDashboard() {
  if (currentGuild) saveSession(currentGuild.id, null);
  var g = currentGuild;
  var config = g.config || {};

  var enabledCount = FEATURES.filter(function(f) { return !!config[f.key]; }).length;
  var totalCount = FEATURES.length;

  var html = '<div class="dashboard-layout">' + renderSidebar('overview') +
    '<div class="dashboard-content">' +
    sidebarToggleBtn('Menu') +
    '<div class="mobile-back" onclick="closeSidebar();renderServerSelect()">&#8249; Switch Server</div>' +
    '<div class="dash-header"><h1>' + esc(g.name) + '</h1><p>Overview and module management</p></div>';

  html += '<div class="dash-grid" style="margin-bottom:16px;">' +
    '<div class="dash-card"><div class="dash-label">Members</div><div class="dash-value">' + (g.memberCount || 0).toLocaleString() + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Premium</div><div class="dash-value" style="font-size:15px;color:' + (g.premium ? 'var(--green)' : 'var(--text-dim)') + '">' + (g.premium ? 'Active' : 'Inactive') + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Active Modules</div><div class="dash-value">' + enabledCount + ' / ' + totalCount + '</div></div>' +
    '</div>';

  /* ── Section 1: Enable / Disable ── */
  var FEATURE_CATEGORIES = [
    { title: 'Roleplay & Operations', keys: ['roleplay', 'priority', 'calendar'] },
    { title: 'Moderation',            keys: ['strike', 'verification', 'antipromote', 'blacklist'] },
    { title: 'Community',             keys: ['ticket', 'rolerequest', 'welcome', 'moveme'] },
    { title: 'Economy',               keys: ['economy', 'civjobs'] },
    { title: 'Advanced',              keys: ['dispatch'] },
  ];

  html += '<div class="overview-section">' +
    '<div class="overview-section-header">' +
    '<h2 class="overview-section-title">Enable / Disable Features</h2>' +
    '<p class="overview-section-sub">Toggle which modules are active on your server</p>' +
    '</div><div class="feature-groups">';

  FEATURE_CATEGORIES.forEach(function(cat) {
    var catFeatures = FEATURES.filter(function(f) { return cat.keys.indexOf(f.feature) !== -1; });
    if (!catFeatures.length) return;
    html += '<div class="feature-category">' +
      '<div class="feature-category-title">' + cat.title + '</div>';
    catFeatures.forEach(function(f) {
      var enabled = !!config[f.key];
      var isPremium = isFlagPremium(f.feature);
      html += '<div class="feature-row">' +
        '<div class="feature-row-info">' +
        '<div class="feature-row-name">' + f.name + (isPremium ? ' <span class="premium-tag">Premium</span>' : '') + '</div>' +
        '<div class="feature-row-desc">' + f.desc + '</div>' +
        '</div>' +
        '<div class="toggle ' + (enabled ? 'active' : '') + '" data-feature="' + f.feature + '" data-key="' + f.key + '" onclick="toggleFeature(this)" title="' + (enabled ? 'Disable' : 'Enable') + ' ' + f.name + '"></div>' +
        '</div>';
    });
    html += '</div>';
  });
  html += '</div></div>';

  /* ── Section 2: Configure ── */
  var CONFIGURE_CARDS = [
    { id: 'general',      label: 'General Settings',  desc: 'Log channel, general config',    featureKey: null },
    { id: 'roleplay',     label: 'Roleplay Commands',  desc: '911, CAD, Twitter, anon',        featureKey: 'roleplayEnabled' },
    { id: 'verification', label: 'Verification',       desc: 'Gate, roles, questions, panel',  featureKey: 'verifyEnabled' },
    { id: 'strikes',      label: 'Strike System',      desc: 'Levels, punishments',            featureKey: 'strikeEnabled' },
    { id: 'tickets',      label: 'Ticket Support',     desc: 'Types, channels, panel',         featureKey: 'ticketEnabled' },
    { id: 'welcome',      label: 'Welcome System',     desc: 'Join messages, DMs',             featureKey: 'welcomeEnabled' },
    { id: 'antipromo',    label: 'Anti-Promoting',     desc: 'Invite link filtering',          featureKey: 'antiPromotingEnabled' },
    { id: 'rolerequest',  label: 'Role Request',        desc: 'Self-serve role requests',       featureKey: 'roleRequestEnabled' },
    { id: 'priority',     label: 'Priority Tracker',   desc: 'Priority event tracking',        featureKey: 'priorityEnabled' },
    { id: 'calendar',     label: 'RP Calendar',         desc: 'Weekly events schedule',         featureKey: 'calendarEnabled' },
    { id: 'economy',      label: 'Economy',             desc: 'Currency, jobs, store',          featureKey: 'economyEnabled' },
    { id: 'civjobs',      label: 'Civilian Jobs',       desc: 'Job board, roles, shift hours',  featureKey: null },
    { id: 'moveme',        label: 'Voice Mover',        desc: 'Self-move panel for members',    featureKey: 'movemeEnabled' },
    { id: 'sticky',        label: 'Sticky Messages',   desc: 'Auto-reposting pinned messages', featureKey: null },
    { id: 'reactionroles', label: 'Reaction Roles',    desc: 'React to get a role',            featureKey: null },
    { id: 'dispatch',      label: 'AI Voice Dispatch', desc: 'Voice + AI (Premium)',           featureKey: 'dispatchEnabled' },
    { id: 'staff',         label: 'Staff Management',  desc: 'Assign staff roles and users',   featureKey: null },
    { id: 'blacklist',     label: 'Blacklist',          desc: 'IP + gamertag blacklist (Premium)', featureKey: 'blacklistEnabled' },
  ];

  html += '<div class="overview-section" style="margin-top:16px;">' +
    '<div class="overview-section-header">' +
    '<h2 class="overview-section-title">Configure Modules</h2>' +
    '<p class="overview-section-sub">Set up channels, roles, and options - click any card to open settings</p>' +
    '</div><div class="configure-module-grid">';

  CONFIGURE_CARDS.forEach(function(m) {
    var enabled = m.featureKey ? !!config[m.featureKey] : true;
    html += '<div class="configure-module-card" onclick="renderSettings(\'' + m.id + '\')">' +
      '<div class="configure-module-header">' +
      (m.featureKey ? '<span class="configure-status-dot ' + (enabled ? 'on' : 'off') + '"></span>' : '') +
      '<div class="configure-module-name">' + m.label + '</div>' +
      '</div>' +
      '<div class="configure-module-desc">' + m.desc + '</div>' +
      '<div class="configure-module-cta">Configure ›</div>' +
      '</div>';
  });
  html += '</div></div>';

  html += renderPremiumSection(g);
  html += '</div></div>';
  app.innerHTML = html;
}

/* ── Premium Section ── */
function transferPremium() {
  if (!confirm('This will release the premium key from this server. You will be shown the key to activate it on another server. Continue?')) return;
  var btn = document.getElementById('transfer-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Releasing...'; }
  api('/guild/' + currentGuild.id + '/premium/transfer', { method: 'POST' }).then(function(result) {
    if (result && result.success) {
      currentGuild.premium = false;
      var section = document.getElementById('premium-section');
      if (section) {
        section.innerHTML =
          '<div class="config-section-header"><h3>Premium</h3>' +
          '<span class="status-badge disabled"><span class="status-dot"></span>Released</span></div>' +
          '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
          '<span class="config-label">Key released successfully. Copy it below to activate on another server.</span>' +
          '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
          '<code style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;letter-spacing:1px;">' + result.key + '</code>' +
          '<button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\'' + result.key + '\').then(function(){toast(\'Key copied!\')})">Copy Key</button>' +
          '</div></div>';
      }
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Transfer Key'; }
    }
  });
}

function activatePremium() {
  var input = document.getElementById('premium-key-input');
  if (!input) return;
  var key = input.value.trim();
  if (!key) { toast('Please enter your premium key', 'error'); return; }
  var btn = document.getElementById('activate-premium-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Activating...'; }
  api('/guild/' + currentGuild.id + '/premium', {
    method: 'POST',
    body: JSON.stringify({ key: key })
  }).then(function(result) {
    if (btn) { btn.disabled = false; btn.textContent = 'Activate'; }
    if (result && result.success) {
      currentGuild.premium = true;
      toast('Premium activated! All features are now unlocked.');
      renderDashboard();
    }
  });
}

function redeemTrial(btn) {
  if (!currentGuild) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Redeeming...'; }
  api('/guild/' + currentGuild.id + '/trial/activate', { method: 'POST' }).then(function(result) {
    if (btn) { btn.disabled = false; btn.textContent = 'Redeem Trial'; }
    if (result && result.success) {
      var modal = document.getElementById('premium-modal-overlay');
      if (modal) modal.remove();
      currentGuild.onTrial = true;
      currentGuild.trialExpiresAt = result.expiresAt;
      toast('3-day trial activated! All premium features are now unlocked.');
      renderDashboard();
    } else if (result && result.error === 'no_vote') {
      toast('No vote credit found. Vote on Top.gg first, then try again.', 'error');
      if (btn) btn.disabled = false;
    }
  });
}

function cancelSubscription() {
  var plan = (currentGuild && currentGuild.premiumDetails && currentGuild.premiumDetails.plan) || 'monthly';
  var planLabel = plan === 'quarterly' ? '3-month' : 'monthly';
  if (!confirm('Cancel your ' + planLabel + ' subscription? Premium stays active until the end of the current billing period - no refunds are issued.')) return;
  var btn = document.getElementById('cancel-sub-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelling...'; }
  api('/guild/' + currentGuild.id + '/premium/cancel', { method: 'POST' }).then(function(result) {
    if (result && result.success) {
      if (currentGuild.premiumDetails) currentGuild.premiumDetails.subscriptionStatus = 'cancelling';
      toast('Subscription cancelled. Premium stays active until the billing period ends.');
      renderDashboard();
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Cancel Subscription'; }
    }
  });
}

function reactivateSubscription() {
  var btn = document.getElementById('reactivate-sub-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Reactivating...'; }
  api('/guild/' + currentGuild.id + '/premium/reactivate', { method: 'POST' }).then(function(result) {
    if (result && result.success) {
      if (currentGuild.premiumDetails) currentGuild.premiumDetails.subscriptionStatus = 'active';
      toast('Subscription reactivated! Billing will continue as normal.');
      renderDashboard();
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Reactivate'; }
    }
  });
}

function renderPremiumSection(g) {
  var premiumItems = [];
  if (isFlagPremium('dispatch')) premiumItems.push('AI Voice Dispatch - officers talk, bot responds');
  premiumItems.push('Blackjack & Roulette gambling games');
  premiumItems.push('Top-25 leaderboard (free: top 10)');
  premiumItems.push('Unlimited ticket types (free: 5)');
  premiumItems.push('Unlimited role income entries (free: 2)');
  premiumItems.push('Unlimited CAD, vehicles, BOLOs & stickies');

  if (g.premium) {
    var pd = g.premiumDetails || {};
    var subStatus = pd.subscriptionStatus || null;
    var isCancelling = subStatus === 'cancelling';
    var isMonthly = pd.hasStripeSubscription;
    var periodEnd = pd.subscriptionCurrentPeriodEnd ? new Date(pd.subscriptionCurrentPeriodEnd) : null;
    var periodEndStr = periodEnd ? periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

    var statusBadge = isCancelling
      ? '<span class="status-badge" style="background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.25);"><span class="status-dot" style="background:#fbbf24;"></span>Cancelling</span>'
      : '<span class="status-badge enabled"><span class="status-dot"></span>Active</span>';

    var sublabel = isCancelling && periodEndStr
      ? 'Subscription ends <strong>' + periodEndStr + '</strong>. Premium stays active until then.'
      : premiumItems.join(', ') + ' - all unlocked.';

    var planLabel = isMonthly
      ? '<span style="font-size:11px;color:var(--text-dim);margin-left:6px;">Monthly</span>'
      : (pd.subscriptionStatus === null && !isMonthly ? '<span style="font-size:11px;color:var(--text-dim);margin-left:6px;">Lifetime</span>' : '');

    var actionBtns = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';
    actionBtns += '<button id="transfer-btn" class="btn btn-secondary btn-sm" onclick="transferPremium()">Transfer Key</button>';
    if (isMonthly) {
      if (isCancelling) {
        actionBtns += '<button id="reactivate-sub-btn" class="btn btn-primary btn-sm" onclick="reactivateSubscription()">Reactivate</button>';
      } else {
        actionBtns += '<button id="cancel-sub-btn" class="btn btn-secondary btn-sm" style="color:var(--red);border-color:rgba(239,68,68,0.3);" onclick="cancelSubscription()">Cancel Subscription</button>';
      }
    }
    actionBtns += '</div>';

    return '<div class="config-section" id="premium-section" style="margin-top:16px;border-color:' + (isCancelling ? 'rgba(251,191,36,0.3)' : 'rgba(52,211,153,0.3)') + ';">' +
      '<div class="config-section-header"><h3>Premium' + planLabel + '</h3>' + statusBadge + '</div>' +
      '<div class="config-row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">' +
      '<div><span class="config-label">' + (isCancelling ? 'Subscription is set to cancel.' : 'Premium is active on this server.') + '</span>' +
      '<div class="config-sublabel">' + sublabel + '</div></div>' +
      actionBtns +
      '</div></div>';
  }

  if (g.onTrial && !g.premium) {
    var trialExpires = g.trialExpiresAt ? new Date(g.trialExpiresAt) : null;
    var trialExpiresStr = trialExpires ? trialExpires.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'soon';
    return '<div class="config-section" id="premium-section" style="margin-top:16px;border-color:rgba(251,191,36,0.3);">' +
      '<div class="config-section-header" style="background:rgba(251,191,36,0.04);">' +
      '<h3 style="color:#fbbf24;">Free Trial</h3>' +
      '<span class="status-badge" style="background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.25);"><span class="status-dot" style="background:#fbbf24;"></span>Active</span>' +
      '</div>' +
      '<div class="config-row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">' +
      '<div><span class="config-label">3-day trial is active on this server.</span>' +
      '<div class="config-sublabel">All premium features are unlocked until <strong>' + trialExpiresStr + '</strong>. Consider upgrading before it expires.</div></div>' +
      '<a href="/pricing" target="_blank" class="btn btn-primary btn-sm">Upgrade to Premium</a>' +
      '</div></div>';
  }

  return '<div class="config-section" id="premium-section" style="margin-top:16px;border-color:rgba(88,101,242,0.4);">' +
    '<div class="config-section-header" style="background:rgba(88,101,242,0.04);">' +
    '<h3 style="color:#7b8cec;">Premium - Unlock More</h3>' +
    '<span class="status-badge disabled"><span class="status-dot"></span>Inactive</span>' +
    '</div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:12px;">' +
    (premiumItems.length > 0
      ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;width:100%;">' +
        premiumItems.map(function(t) { return premFeatureItem(t); }).join('') +
        '</div>'
      : '') +
    '<div style="border-top:1px solid var(--border);padding-top:12px;width:100%;">' +
    '<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Get a premium key from the pricing page, then enter it below to unlock all premium features.</p>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<a href="/pricing" target="_blank" class="btn btn-primary btn-sm">View Pricing &amp; Get a Key</a>' +
    '<a href="https://discord.gg/cSdhfGPeV2" target="_blank" class="btn btn-discord btn-sm" style="font-size:11px;">Support Server</a>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">' +
    '<input type="text" id="premium-key-input" class="config-input" placeholder="XXXX-XXXX-XXXX-XXXX" style="flex:1;min-width:180px;max-width:280px;">' +
    '<button id="activate-premium-btn" class="btn btn-primary btn-sm" onclick="activatePremium()">Activate Key</button>' +
    '</div>' +
    '<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;">' +
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);margin-bottom:8px;">Free 3-Day Trial</div>' +
    '<p style="font-size:12px;color:var(--text-muted);margin:0 0 10px;line-height:1.5;">Vote for the bot on Top.gg, then redeem your trial below - no Discord command needed.</p>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<a href="' + (TOPGG_VOTE_URL || 'https://top.gg') + '" target="_blank" class="btn btn-secondary btn-sm">Vote on Top.gg</a>' +
    '<button class="btn btn-secondary btn-sm" onclick="redeemTrial(this)">Redeem Trial</button>' +
    '</div>' +
    '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">One trial per server, ever. Vote credit valid for 7 days.</div>' +
    '</div>' +
    '</div></div></div>';
}

function premFeatureItem(text) {
  return '<div style="display:flex;align-items:flex-start;gap:7px;font-size:12px;color:var(--text-muted);">' +
    '<span style="color:#7b8cec;margin-top:1px;flex-shrink:0;">✦</span>' + esc(text) + '</div>';
}

/* ── Billing Page ── */
function renderBilling() {
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar('billing') +
    '<div class="dashboard-content"><div style="color:var(--text-muted);font-size:13px;padding-top:20px;">Loading billing info...</div></div></div>';

  api('/guild/' + currentGuild.id + '/premium/billing').then(function(data) {
    if (!data) return;

    var planLabel = data.plan === 'monthly' ? 'Monthly ($5/mo)' : data.plan === 'quarterly' ? '3-Month ($14/3mo)' : data.plan === 'lifetime' ? 'Lifetime ($48.99 one-time)' : 'Manual / Gifted';
    var statusColor = data.status === 'active' ? 'var(--green)' : data.status === 'cancelling' ? '#fbbf24' : data.status === 'past_due' ? '#f97316' : 'var(--text-muted)';
    var statusText = data.status === 'active' ? 'Active' : data.status === 'cancelling' ? 'Cancelling' : data.status === 'past_due' ? 'Past Due' : data.status || 'Active';

    var periodRow = '';
    if (data.currentPeriodEnd) {
      var pEnd = new Date(data.currentPeriodEnd);
      var pLabel = data.status === 'cancelling' ? 'Access ends' : 'Next renewal';
      periodRow = billingRow(pLabel, pEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    }

    var activatedRow = data.activatedAt
      ? billingRow('Activated on server', new Date(data.activatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
      : '';

    var purchasedRow = data.purchasedAt
      ? billingRow('Purchase date', new Date(data.purchasedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
      : '';

    var isSubscription = data.hasStripeSubscription && (data.plan === 'monthly' || data.plan === 'quarterly');
    var cancelBtn = '';
    if (isSubscription) {
      if (data.status === 'cancelling') {
        cancelBtn = '<button id="reactivate-sub-btn" class="btn btn-primary btn-sm" style="margin-top:16px;" onclick="reactivateSubscription()">Reactivate Subscription</button>';
      } else if (data.status === 'active' || data.status === 'past_due') {
        cancelBtn = '<button id="cancel-sub-btn" class="btn btn-secondary btn-sm" style="margin-top:16px;color:var(--red);border-color:rgba(239,68,68,0.3);" onclick="cancelSubscription()">Cancel Subscription</button>';
      }
    }

    var manageBillingBtn = data.hasStripeSubscription
      ? '<button class="btn btn-secondary btn-sm" style="margin-top:16px;margin-right:8px;" onclick="openBillingPortal()">Manage Billing</button>'
      : '';

    var invoiceHtml = '';
    if (data.invoices && data.invoices.length > 0) {
      invoiceHtml = '<div class="config-section" style="margin-top:16px;">' +
        '<div class="config-section-header"><h3>Payment History</h3></div>' +
        '<table style="width:100%;border-collapse:collapse;">' +
        '<thead><tr>' +
        '<th style="text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);padding:8px 0;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:.05em;">Date</th>' +
        '<th style="text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);padding:8px 0;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:.05em;">Amount</th>' +
        '<th style="text-align:left;font-size:11px;font-weight:600;color:var(--text-muted);padding:8px 0;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:.05em;">Status</th>' +
        '<th style="text-align:right;font-size:11px;font-weight:600;color:var(--text-muted);padding:8px 0;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:.05em;">Receipt</th>' +
        '</tr></thead><tbody>';

      data.invoices.forEach(function(inv) {
        var invDate = inv.date ? new Date(inv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
        var amount = inv.amount != null ? '$' + (inv.amount / 100).toFixed(2) : '-';
        var invStatus = inv.status === 'paid' ? '<span style="color:var(--green);font-size:12px;">Paid</span>' : '<span style="color:var(--text-muted);font-size:12px;">' + esc(inv.status || '-') + '</span>';
        var receipt = inv.receiptUrl
          ? '<a href="' + esc(inv.receiptUrl) + '" target="_blank" rel="noopener" style="font-size:12px;color:var(--blue);">View</a>'
          : '<span style="font-size:12px;color:var(--text-dim);">-</span>';
        invoiceHtml += '<tr>' +
          '<td style="font-size:13px;color:var(--text-muted);padding:10px 0;border-bottom:1px solid var(--border);">' + invDate + '</td>' +
          '<td style="font-size:13px;color:var(--text);padding:10px 0;border-bottom:1px solid var(--border);font-weight:600;">' + amount + '</td>' +
          '<td style="padding:10px 0;border-bottom:1px solid var(--border);">' + invStatus + '</td>' +
          '<td style="text-align:right;padding:10px 0;border-bottom:1px solid var(--border);">' + receipt + '</td>' +
          '</tr>';
      });
      invoiceHtml += '</tbody></table></div>';
    } else if (data.hasStripeSubscription) {
      invoiceHtml = '<div class="config-section" style="margin-top:16px;">' +
        '<div class="config-section-header"><h3>Payment History</h3></div>' +
        '<p style="font-size:13px;color:var(--text-muted);padding:12px 0;">No invoices found.</p></div>';
    }

    var html = '<div class="dashboard-layout">' + renderSidebar('billing') +
      '<div class="dashboard-content" id="billing-content">' +
      sidebarToggleBtn('Menu') +
      '<div class="mobile-back" onclick="closeSidebar();renderDashboard()">&#8249; Back to Overview</div>' +
      '<div class="dash-header"><h1>Billing</h1><p>Your premium plan and payment history</p></div>' +
      '<div class="config-section">' +
      '<div class="config-section-header"><h3>Current Plan</h3></div>' +
      billingRow('Plan', planLabel) +
      billingRow('Status', '<span style="color:' + statusColor + ';font-weight:600;">' + statusText + '</span>') +
      purchasedRow +
      activatedRow +
      periodRow +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' + manageBillingBtn + cancelBtn + '</div>' +
      '</div>' +
      invoiceHtml +
      '</div></div>';

    app.innerHTML = html;
  });
}

function openBillingPortal() {
  var btn = document.querySelector('[onclick="openBillingPortal()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Opening...'; }
  api('/guild/' + currentGuild.id + '/premium/billing-portal', { method: 'POST' }).then(function(result) {
    if (btn) { btn.disabled = false; btn.textContent = 'Manage Billing'; }
    if (result && result.url) {
      window.open(result.url, '_blank', 'noopener');
    } else {
      window.open(BILLING_PORTAL_URL, '_blank', 'noopener');
    }
  }).catch(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Manage Billing'; }
    window.open(BILLING_PORTAL_URL, '_blank', 'noopener');
  });
}

function billingRow(label, value) {
  return '<div class="config-row" style="padding:10px 0;">' +
    '<span class="config-label" style="min-width:160px;">' + esc(label) + '</span>' +
    '<span style="font-size:13px;color:var(--text);">' + value + '</span>' +
    '</div>';
}

/* ── Feature Toggle ── */
function toggleFeature(el) {
  if (el.classList.contains('loading')) return;
  var feature = el.getAttribute('data-feature');
  var key = el.getAttribute('data-key');
  var featureName = el.closest('.feature-item') ? (el.closest('.feature-item').querySelector('.feature-name') || {}).textContent : feature;
  var newVal = !el.classList.contains('active');
  el.classList.add('loading');
  el.classList.toggle('active');
  api('/guild/' + currentGuild.id + '/feature/' + feature, {
    method: 'POST',
    body: JSON.stringify({ enabled: newVal })
  }).then(function(result) {
    el.classList.remove('loading');
    if (result && result.success) {
      if (!currentGuild.config) currentGuild.config = {};
      currentGuild.config[key] = newVal;
      toast(newVal ? 'Module enabled' : 'Module disabled');
    } else {
      el.classList.toggle('active');
      if (result && result.error === 'premium_required') {
        showPremiumModal(featureName);
      }
    }
  });
}

function showPremiumModal(featureName) {
  var existing = document.getElementById('premium-modal-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'premium-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML =
    '<div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);max-width:440px;width:100%;padding:28px 28px 24px;">' +
      '<div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:16px;">Premium Required</div>' +
      '<p style="font-size:14px;color:var(--text);margin:0 0 20px;line-height:1.6;">' +
        (featureName ? '<strong>' + esc(String(featureName)) + '</strong> requires Premium on this server.' : 'This feature requires Premium on this server.') +
      '</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px;">' +
        '<a href="https://roleplaymanager.xyz/pricing" target="_blank" class="btn btn-primary" style="text-align:center;text-decoration:none;">Purchase Premium</a>' +
        '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);margin-bottom:8px;">Or get a free 3-day trial</div>' +
          '<p style="font-size:13px;color:var(--text-muted);margin:0 0 10px;line-height:1.5;">Vote for the bot on Top.gg to earn a trial credit, then redeem it here - no Discord command needed.</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<a href="' + (TOPGG_VOTE_URL || 'https://top.gg') + '" target="_blank" class="btn btn-secondary" style="text-align:center;text-decoration:none;flex:1;">Vote on Top.gg</a>' +
          '<button class="btn btn-secondary" style="flex:1;" onclick="redeemTrial(this)">Redeem Trial</button>' +
          '</div>' +
          '<div style="font-size:11px;color:var(--text-dim);margin-top:8px;">One trial per server, ever. Vote credit valid for 7 days.</div>' +
        '</div>' +
      '</div>' +
      '<button onclick="document.getElementById(\'premium-modal-overlay\').remove()" style="margin-top:18px;background:none;border:none;color:var(--text-dim);font-size:12px;cursor:pointer;padding:0;">Dismiss</button>' +
    '</div>';
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

/* ── Settings Page ── */
function renderSettings(mod) {
  if (currentGuild) saveSession(currentGuild.id, mod);
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar(mod) +
    '<div class="dashboard-content" style="padding-top:20px;">' + settingsSkeletonLoader() + '</div></div>';

  api('/guild/' + currentGuild.id + '/settings/' + mod).then(function(data) {
    if (!data) return;
    pendingChanges = {};

    var html = '<div class="dashboard-layout">' + renderSidebar(mod) +
      '<div class="dashboard-content" id="settings-content">' +
      sidebarToggleBtn('Menu') +
      '<div class="mobile-back" onclick="closeSidebar();renderDashboard()">&#8249; Back to Overview</div>' +
      '<div class="dash-header"><h1>' + esc(data.name) + '</h1><p>' + esc(data.description) + '</p></div>';

    if (data.premium) {
      html += '<div style="background:var(--amber-bg);border:1px solid rgba(251,191,36,0.2);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--amber);">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        'Premium feature - this server needs an active premium subscription.' +
        '</div>' +
        (!currentGuild.premium
          ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
            '<a href="https://roleplaymanager.xyz/pricing" target="_blank" style="color:var(--blue);text-decoration:underline;font-size:12px;">Purchase Premium</a>' +
            '<span style="color:var(--amber-dim);">·</span>' +
            '<a href="' + (TOPGG_VOTE_URL || 'https://top.gg') + '" target="_blank" style="color:var(--blue);text-decoration:underline;font-size:12px;">Vote on Top.gg</a>' +
            '<span style="color:var(--amber-dim);">·</span>' +
            '<a href="#" onclick="redeemTrial(this);return false;" style="color:var(--blue);text-decoration:underline;font-size:12px;">Redeem Trial</a>' +
            '<span style="color:var(--amber-dim);">·</span>' +
            '<a href="#" onclick="renderDashboard();setTimeout(function(){var s=document.getElementById(\'premium-section\');if(s)s.scrollIntoView({behavior:\'smooth\'})},200);return false;" style="color:var(--blue);text-decoration:underline;font-size:12px;">Activate Key</a>' +
            '</div>'
          : '') +
        '</div>';
    }

    if (mod === 'economy') {
      html += renderEconomySettings(data);
    } else if (mod === 'rolerequest') {
      html += renderRoleRequestSettings(data);
    } else if (mod === 'moveme') {
      html += renderMovemeSettings(data);
    } else if (mod === 'civjobs') {
      html += renderCivJobsSettings(data);
    } else if (mod === 'sticky') {
      html += renderStickySettings(data);
    } else if (mod === 'reactionroles') {
      html += renderReactionRolesSettings(data);
    } else if (mod === 'staff') {
      html += renderStaffSettings(data);
    } else if (mod === 'blacklist') {
      html += renderBlacklistSettings(data);
    } else {
      html += renderSettingsFields(data, mod);
    }

    if (data.stats && data.stats.length > 0) {
      html += '<div class="dash-grid" style="margin-top:14px;">';
      data.stats.forEach(function(s) {
        html += '<div class="dash-card"><div class="dash-label">' + esc(s.label) + '</div>' +
          '<div class="dash-value" style="font-size:18px;">' + esc(String(s.value)) + '</div></div>';
      });
      html += '</div>';
    }

    if (data.ticketTypes !== undefined) {
      html += renderTicketTypesSection(data);
    }

    if (data.events !== undefined) {
      html += renderCalendarEventsSection(data);
    }

    if (data.whitelistedLinks !== undefined) {
      html += renderWhitelistedLinksSection(data);
    }

    if (mod === 'dispatch') {
      html += renderDispatchExtras(data);
    }

    if (mod === 'verification') {
      html += renderVerifyPanelSection(data);
    }

    html += '</div></div>';
    app.innerHTML = html;
    if (_pendingScrollRestore !== null) {
      var pos = _pendingScrollRestore;
      _pendingScrollRestore = null;
      var content = document.getElementById('settings-content');
      if (content) content.scrollTop = pos;
    }
  });
}

/* ── Blacklist Settings ── */
function renderBlacklistSettings(data) {
  var channels = data.channels || [];
  var entries = data.blacklistEntries || [];
  var html = '';

  /* ── Section 1: Panel Configuration ── */
  html += '<div class="config-section">' +
    '<div class="config-section-header"><div><h3>Panel Configuration</h3>' +
    '<p class="config-section-desc">The live blacklist panel is auto-updated in Discord whenever an entry is added or removed.</p>' +
    '</div>' +
    '<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="postBlacklistPanel(this)">Post / Refresh Panel</button>' +
    '</div>';

  html += '<div class="config-row" style="justify-content:space-between;align-items:center;">' +
    '<div><span class="config-label">Panel Channel</span>' +
    '<p class="config-desc" style="margin:2px 0 0;">Channel where the live blacklist panel is posted</p></div>' +
    '<select class="config-select" style="width:220px;" onchange="changeField(\'blacklist\',\'panelChannelId\',this.value)" data-key="panelChannelId">' +
    '<option value="">Select a channel...</option>' +
    channels.map(function(c) { return '<option value="' + esc(c.value) + '"' + (c.value === (data.panelChannelId || '') ? ' selected' : '') + '>#' + esc(c.label) + '</option>'; }).join('') +
    '</select></div>';

  html += '</div>';
  html += '<div id="save-bar-container"></div>';

  /* ── Section 2: Add Blacklist Entry ── */
  html += '<div class="config-section" style="margin-top:10px;">' +
    '<div class="config-section-header"><div><h3>Add Entry</h3>' +
    '<p class="config-section-desc">Blacklist a member by Discord ID, gamertag, or both. IPs are never stored here - IP banning activates when a blacklisted member tries to verify again.</p>' +
    '</div></div>';

  html += '<div style="display:flex;flex-direction:column;gap:10px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<div style="flex:1;min-width:200px;"><label class="config-label" style="font-size:11px;margin-bottom:4px;display:block;">Member</label>' +
    '<div style="position:relative;">' +
    '<input type="text" id="bl-member-search" class="config-input" placeholder="Search members..." autocomplete="off" oninput="filterBlacklistMembers()" onfocus="showBlacklistDropdown()" style="width:100%;box-sizing:border-box;">' +
    '<div id="bl-member-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border);border-radius:0 0 var(--radius) var(--radius);max-height:200px;overflow-y:auto;z-index:100;"></div>' +
    '<input type="hidden" id="bl-discord-id" value="">' +
    '<input type="hidden" id="bl-discord-username" value="">' +
    '</div></div>' +
    '<div style="flex:1;min-width:160px;"><label class="config-label" style="font-size:11px;margin-bottom:4px;display:block;">Gamertag <span style="color:var(--text-dim);font-size:10px;">(PSN/Xbox/PC)</span></label>' +
    '<input type="text" id="bl-gamertag" class="config-input" placeholder="e.g. xX_Player_Xx" style="width:100%;box-sizing:border-box;"></div>' +
    '</div>' +
    '<div><label class="config-label" style="font-size:11px;margin-bottom:4px;display:block;">Reason <span style="color:var(--red);">*</span></label>' +
    '<input type="text" id="bl-reason" class="config-input" placeholder="Reason for blacklisting..." style="width:100%;box-sizing:border-box;"></div>' +
    '<div style="display:flex;align-items:center;gap:10px;">' +
    '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-muted);">' +
    '<input type="checkbox" id="bl-ip-ban" style="accent-color:var(--red);width:15px;height:15px;"> ' +
    'IP Ban - block future verifications from the same IP address</label>' +
    '</div>' +
    '<div><button class="btn btn-danger btn-sm" onclick="addBlacklistEntry(this)">Add to Blacklist</button></div>' +
    '</div>';

  setTimeout(function() { loadBlacklistMembers(); }, 0);

  html += '</div>';

  /* ── Section 3: Active Entries ── */
  html += '<div class="config-section" style="margin-top:10px;">' +
    '<div class="config-section-header"><div><h3>Active Entries</h3>' +
    '<p class="config-section-desc">IPs are stored privately and never displayed. Removing an entry automatically updates the Discord panel.</p>' +
    '</div></div>';

  if (!entries.length) {
    html += '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">No active blacklist entries.</span></div>';
  } else {
    html += '<div class="staff-list">';
    entries.forEach(function(e) {
      var who = e.discordUsername || e.discordId || '';
      var whoId = e.discordId || '';
      var tag = e.gamertag ? e.gamertag : '';
      var label = '';
      if (who && tag) label = '<code>' + esc(tag) + '</code> <span style="color:var(--text-muted);font-size:11px;">(' + esc(who) + ')</span>';
      else if (tag) label = '<code>' + esc(tag) + '</code>';
      else if (who) label = '<span style="font-weight:500;">' + esc(who) + (whoId && who !== whoId ? '</span> <span style="color:var(--text-dim);font-size:11px;font-family:monospace;">(' + esc(whoId) + ')' : '') + '</span>';
      var date = e.addedAt ? new Date(e.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      html += '<div class="staff-entry">' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;color:var(--text);">' + label +
        (e.ipBanned ? ' <span style="font-size:10px;background:rgba(248,113,113,0.12);color:var(--red);padding:1px 6px;border-radius:3px;margin-left:4px;">IP BAN</span>' : '') +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + esc(e.reason || '') + (date ? ' - ' + date : '') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="removeBlacklistEntry(\'' + esc(e._id) + '\',this)">Remove</button>' +
        '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  return html;
}

var _blacklistState = { members: [] };

function loadBlacklistMembers() {
  if (!currentGuild) return;
  api('/guild/' + currentGuild.id + '/members').then(function(r) {
    if (r && r.members) {
      _blacklistState.members = r.members;
    }
  });
}

function filterBlacklistMembers() {
  var input = document.getElementById('bl-member-search');
  var dropdown = document.getElementById('bl-member-dropdown');
  if (!input || !dropdown) return;
  var q = input.value.trim().toLowerCase();
  var list = _blacklistState.members;
  var filtered = q
    ? list.filter(function(m) { return m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q); })
    : list.slice(0, 50);
  if (!filtered.length) {
    dropdown.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--text-dim);">' + (q ? 'No members found.' : 'Start typing to search...') + '</div>';
  } else {
    dropdown.innerHTML = filtered.slice(0, 50).map(function(m) {
      return '<div class="staff-member-option" data-id="' + esc(m.id) + '" data-name="' + esc(m.displayName) + '" data-username="' + esc(m.displayName) + '" onclick="selectBlacklistMember(this)" style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);">' +
        '<img src="' + esc(m.avatar) + '" width="24" height="24" style="border-radius:50%;flex-shrink:0;" onerror="this.style.display=\'none\'">' +
        '<span>' + esc(m.displayName) + '</span>' +
        (m.displayName !== m.username ? '<span style="color:var(--text-dim);font-size:11px;margin-left:4px;">(' + esc(m.username) + ')</span>' : '') +
        '</div>';
    }).join('');
  }
  dropdown.style.display = 'block';
}

function showBlacklistDropdown() {
  var dd = document.getElementById('bl-member-dropdown');
  if (dd) { dd.style.display = 'block'; filterBlacklistMembers(); }
  document.addEventListener('click', hideBlacklistDropdownOutside, { once: true });
}

function hideBlacklistDropdownOutside(e) {
  var input = document.getElementById('bl-member-search');
  var dd = document.getElementById('bl-member-dropdown');
  if (input && dd && !input.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none';
}

function selectBlacklistMember(el) {
  var id       = el.getAttribute('data-id');
  var name     = el.getAttribute('data-name');
  var username = el.getAttribute('data-username') || name;
  var input    = document.getElementById('bl-member-search');
  var hidden   = document.getElementById('bl-discord-id');
  var hiddenUn = document.getElementById('bl-discord-username');
  var dd       = document.getElementById('bl-member-dropdown');
  if (input)    input.value    = name;
  if (hidden)   hidden.value   = id;
  if (hiddenUn) hiddenUn.value = username;
  if (dd)       dd.style.display = 'none';
}

function addBlacklistEntry(btn) {
  if (!currentGuild) return;
  var discordId       = (document.getElementById('bl-discord-id')       || {}).value || '';
  var discordUsername = (document.getElementById('bl-discord-username')  || {}).value || '';
  var gamertag        = (document.getElementById('bl-gamertag')          || {}).value || '';
  var reason          = (document.getElementById('bl-reason')            || {}).value || '';
  var ipBanned        = (document.getElementById('bl-ip-ban')            || {}).checked || false;
  if (!reason.trim()) { toast('Reason is required', 'error'); return; }
  if (!discordId.trim() && !gamertag.trim()) { toast('Select a member or enter a gamertag', 'error'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }
  api('/guild/' + currentGuild.id + '/blacklist/add', {
    method: 'POST',
    body: JSON.stringify({
      discordId: discordId.trim() || null,
      discordUsername: discordUsername.trim() || null,
      gamertag: gamertag.trim() || null,
      reason: reason.trim(),
      ipBanned,
    }),
  }).then(function(r) {
    if (r && r.success) { toast('Entry added'); renderSettings('blacklist'); }
    else { if (btn) { btn.disabled = false; btn.textContent = 'Add to Blacklist'; } toast(r && r.error ? r.error : 'Failed', 'error'); }
  });
}

function postBlacklistPanel(btn) {
  if (!currentGuild) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }
  api('/guild/' + currentGuild.id + '/blacklist/panel', { method: 'POST' }).then(function(r) {
    if (r && r.success) {
      toast(r.action === 'updated' ? 'Panel refreshed in Discord' : 'Panel posted to Discord');
    } else {
      toast(r && r.error ? r.error : 'Failed to post panel', 'error');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Post / Refresh Panel'; }
  });
}

function removeBlacklistEntry(id, btn) {
  if (!currentGuild) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Removing...'; }
  api('/guild/' + currentGuild.id + '/blacklist/' + id, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Entry removed'); renderSettings('blacklist'); }
    else { if (btn) { btn.disabled = false; btn.textContent = 'Remove'; } toast(r && r.error ? r.error : 'Failed', 'error'); }
  });
}

/* ── Verify Panel Section ── */
function renderVerifyPanelSection(data) {
  return '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Verification Panel</h3>' +
    '<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="sendVerifyPanel(event)">Send Panel to Discord</button>' +
    '</div>' +
    '<div class="config-row"><span class="config-sublabel">Posts a Verify button embed to the configured Verify Channel. Members click it to open the verification form. Run this whenever you want to (re)post the panel in Discord.</span></div>' +
    '</div>';
}

function sendVerifyPanel(e) {
  if (!currentGuild) return;
  var btn = e && e.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  api('/guild/' + currentGuild.id + '/settings/verification/panel/send', { method: 'POST' }).then(function(r) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Panel to Discord'; }
    if (r && r.success) toast('Verification panel sent to Discord');
    else if (r && r.error) toast(r.error, 'error');
  });
}

/* ── Dispatch extras (voice channel management) ── */
function renderDispatchExtras(data) {
  initDispatchState(data);
  var html = '';
  var voiceOpts = (data.voiceChannels || []).map(function(c) {
    return '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>';
  }).join('');

  var patrolCount = (data.currentPatrolChannels || []).length;
  var trafficCount = (data.currentTrafficChannels || []).length;
  var leoCount = (data.leoRoles || []).length;

  html += '<div class="config-section" style="margin-top:14px;background:rgba(88,101,242,0.03);">' +
    '<div class="config-section-header"><h3>How AI Dispatch Works</h3></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:10px;">' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;width:100%;">' +
    dispatchStep('1', 'Set patrol channels below', 'The bot joins these voice channels to listen to officers', patrolCount > 0 ? 'var(--green)' : 'var(--text-dim)') +
    dispatchStep('2', 'Assign LEO roles', 'Only members with these roles can trigger dispatch responses', leoCount > 0 ? 'var(--green)' : 'var(--text-dim)') +
    dispatchStep('3', 'Enable AI Responses', 'Toggle it on above so the bot generates realistic dispatcher replies', null) +
    dispatchStep('4', 'Set a dispatch channel', 'AI responses and logs are posted in this text channel', null) +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-dim);border-top:1px solid var(--border);padding-top:10px;width:100%;">' +
    'Officers speak 10-codes (e.g. "10-11 traffic stop") into patrol voice channels - the bot transcribes the audio, ' +
    'generates an AI dispatcher reply, and reads it back in the channel. On a 10-11, the officer is automatically moved to a traffic stop channel.' +
    '</div>' +
    '</div></div>';

  var statusItems = [
    { label: 'Patrol channels', count: patrolCount, ok: patrolCount > 0 },
    { label: 'Traffic stop channels', count: trafficCount, ok: true },
    { label: 'LEO roles', count: leoCount, ok: leoCount > 0 },
  ];
  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Configuration Status</h3>' +
    '<button class="btn btn-secondary btn-sm" style="margin-left:auto;" onclick="reloadDispatchBot()">Reload Bot Config</button>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;padding:0 16px 12px;">';
  statusItems.forEach(function(s) {
    html += '<div style="background:var(--bg-secondary);border:1px solid ' + (s.ok ? 'rgba(52,211,153,0.25)' : 'var(--border)') + ';border-radius:8px;padding:10px 12px;">' +
      '<div style="font-size:18px;font-weight:700;color:' + (s.ok ? 'var(--green)' : 'var(--text-dim)') + ';">' + s.count + '</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">' + esc(s.label) + '</div>' +
      '</div>';
  });
  html += '</div></div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Patrol Voice Channels</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Bot listens here for officer speech</span></div>';

  var patrolTags = (data.currentPatrolChannels || []).map(function(id) {
    var ch = (data.voiceChannels || []).find(function(c) { return c.value === id; });
    var name = ch ? ch.label : id;
    return '<span class="channel-tag">' + esc(name) +
      '<button class="channel-tag-remove" onclick="removeDispatchChannel(\'patrol\',\'' + esc(id) + '\')" title="Remove">&#x2715;</button></span>';
  }).join('');

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="patrol-tags">' + (patrolTags || '<span style="font-size:12px;color:var(--text-dim);">No channels added yet - add at least one so the bot can listen.</span>') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="patrol-channel-select"><option value="">Select a voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addDispatchChannel(\'patrol\')">Add</button>' +
    '</div></div></div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Traffic Stop Channels</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Officers auto-moved here on 10-11</span></div>';

  var trafficTags = (data.currentTrafficChannels || []).map(function(id) {
    var ch = (data.voiceChannels || []).find(function(c) { return c.value === id; });
    var name = ch ? ch.label : id;
    return '<span class="channel-tag">' + esc(name) +
      '<button class="channel-tag-remove" onclick="removeDispatchChannel(\'traffic\',\'' + esc(id) + '\')" title="Remove">&#x2715;</button></span>';
  }).join('');

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="traffic-tags">' + (trafficTags || '<span style="font-size:12px;color:var(--text-dim);">Optional - officers move here when they call a 10-11.</span>') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="traffic-channel-select"><option value="">Select a voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addDispatchChannel(\'traffic\')">Add</button>' +
    '</div></div></div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>LEO Roles</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Roles that can activate dispatch</span></div>';

  var roleOpts = (data.roles || []).map(function(r) {
    return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>';
  }).join('');

  var leoTags = (data.leoRoles || []).map(function(id) {
    var r = (data.roles || []).find(function(r) { return r.value === id; });
    var name = r ? r.label : id;
    return '<span class="channel-tag">' + esc(name) +
      '<button class="channel-tag-remove" onclick="removeDispatchChannel(\'leo\',\'' + esc(id) + '\')" title="Remove">&#x2715;</button></span>';
  }).join('');

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="leo-tags">' + (leoTags || '<span style="font-size:12px;color:var(--text-dim);">No roles added - add at least one LEO role to restrict who can use dispatch.</span>') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="leo-role-select"><option value="">Select a role...</option>' + roleOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addDispatchChannel(\'leo\')">Add Role</button>' +
    '</div></div></div>';

  return html;
}

function reloadDispatchBot() {
  if (!currentGuild) return;
  api('/guild/' + currentGuild.id + '/dispatch/reload', { method: 'POST' }).then(function(r) {
    if (r && r.success) toast('Dispatch bot config reloaded');
    else if (r && r.error) toast(r.error, 'error');
  });
}

function dispatchStep(num, title, desc, dotColor) {
  return '<div style="display:flex;align-items:flex-start;gap:10px;">' +
    '<div style="width:22px;height:22px;border-radius:50%;background:var(--bg-secondary);border:1px solid ' + (dotColor || 'var(--border)') + ';display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:' + (dotColor || 'var(--text-dim)') + ';flex-shrink:0;margin-top:1px;">' + num + '</div>' +
    '<div><div style="font-size:12px;font-weight:600;color:var(--text);">' + esc(title) + '</div>' +
    '<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">' + esc(desc) + '</div></div>' +
    '</div>';
}

/* Dispatch channel add/remove helpers */
window._dispatchState = {};

function initDispatchState(data) {
  window._dispatchState = {
    patrolChannelIds: (data.currentPatrolChannels || []).slice(),
    trafficStopChannelIds: (data.currentTrafficChannels || []).slice(),
    leoRoleIds: (data.leoRoles || []).slice()
  };
}

function addDispatchChannel(type) {
  var selectId = type === 'leo' ? 'leo-role-select' : (type === 'patrol' ? 'patrol-channel-select' : 'traffic-channel-select');
  var tagsId   = type === 'leo' ? 'leo-tags' : (type === 'patrol' ? 'patrol-tags' : 'traffic-tags');
  var fieldKey = type === 'leo' ? 'leoRoleIds' : (type === 'patrol' ? 'patrolChannelIds' : 'trafficStopChannelIds');
  var sel = document.getElementById(selectId);
  if (!sel || !sel.value) { toast('Please select a ' + (type === 'leo' ? 'role' : 'channel') + ' first', 'error'); return; }
  var id = sel.value;
  var label = sel.options[sel.selectedIndex].text;
  if (!window._dispatchState[fieldKey]) {
    window._dispatchState[fieldKey] = JSON.parse(JSON.stringify(pendingChanges[fieldKey] || []));
  }
  if (window._dispatchState[fieldKey].indexOf(id) !== -1) { toast('Already added', 'error'); return; }
  window._dispatchState[fieldKey].push(id);
  pendingChanges[fieldKey] = window._dispatchState[fieldKey].slice();
  var tagsEl = document.getElementById(tagsId);
  if (tagsEl) {
    var span = document.createElement('span');
    span.className = 'channel-tag';
    span.innerHTML = esc(label) + '<button class="channel-tag-remove" onclick="removeDispatchChannel(\'' + type + '\',\'' + esc(id) + '\')" title="Remove">&#x2715;</button>';
    if (tagsEl.querySelector('span[style]')) tagsEl.innerHTML = '';
    tagsEl.appendChild(span);
  }
  sel.value = '';
  showSaveBar('dispatch');
}

function removeDispatchChannel(type, id) {
  var tagsId   = type === 'leo' ? 'leo-tags' : (type === 'patrol' ? 'patrol-tags' : 'traffic-tags');
  var fieldKey = type === 'leo' ? 'leoRoleIds' : (type === 'patrol' ? 'patrolChannelIds' : 'trafficStopChannelIds');
  if (!window._dispatchState[fieldKey]) {
    window._dispatchState[fieldKey] = JSON.parse(JSON.stringify(pendingChanges[fieldKey] || []));
  }
  window._dispatchState[fieldKey] = window._dispatchState[fieldKey].filter(function(x) { return x !== id; });
  pendingChanges[fieldKey] = window._dispatchState[fieldKey].slice();
  var tagsEl = document.getElementById(tagsId);
  if (tagsEl) {
    var tags = tagsEl.querySelectorAll('.channel-tag');
    tags.forEach(function(tag) {
      var btn = tag.querySelector('.channel-tag-remove');
      if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf('\'' + id + '\'') !== -1) {
        tag.remove();
      }
    });
    if (tagsEl.querySelectorAll('.channel-tag').length === 0) {
      tagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">No channels added yet.</span>';
    }
  }
  showSaveBar('dispatch');
}

/* ── Ticket types section ── */
function renderTicketTypesSection(data) {
  var freeLimit = 5;
  var limit = currentGuild.premium ? '\u221e' : String(freeLimit);
  var count = (data.ticketTypes || []).length;
  var atLimit = !currentGuild.premium && count >= freeLimit;
  var roleOpts = (data.roles || []).map(function(r) {
    return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>';
  }).join('');

  var html = '<div class="config-section" style="margin-top:14px;" id="ticket-types-section">' +
    '<div class="config-section-header"><h3>Ticket Types</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + count + ' / ' + limit + ' types</span>' +
    (count > 0 ? '<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="showTicketPanelPicker(' + JSON.stringify(data.ticketTypes) + ')">Send Panel to Discord</button>' : '') +
    '</div>';

  if (count === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No ticket types yet. Add one below - each type becomes a button on the ticket panel.</span></div>';
  } else {
    var buttonColorLabels = { Primary: 'Blue', Secondary: 'Grey', Success: 'Green', Danger: 'Red' };
    (data.ticketTypes || []).forEach(function(t) {
      var roleNames = (t.allowedRoleIds || []).map(function(id) {
        var r = (data.roles || []).find(function(r) { return r.value === id; });
        return r ? r.label : id;
      }).join(', ');
      var colorDot = { Primary: '#5865f2', Secondary: '#4f545c', Success: '#57f287', Danger: '#ed4245' }[t.buttonColor] || '#5865f2';
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left" style="display:flex;align-items:center;gap:10px;">' +
        '<div style="width:10px;height:10px;border-radius:2px;background:' + colorDot + ';flex-shrink:0;"></div>' +
        '<div>' +
        '<span class="config-label">' + esc(t.label) + '</span>' +
        '<div class="config-sublabel">' + (roleNames ? 'Staff: ' + esc(roleNames) : 'All staff can see') + ' \u00b7 ' + esc(buttonColorLabels[t.buttonColor] || t.buttonColor || 'Blue') + ' button</div>' +
        '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteTicketType(\'' + esc(t.id) + '\')">Remove</button>' +
        '</div>';
    });
  }

  if (atLimit) {
    html += '<div class="config-row" style="background:var(--amber-bg);">' +
      '<span style="font-size:12px;color:var(--amber);">Free limit reached (' + freeLimit + ' types). Upgrade to Premium for unlimited ticket types.</span></div>';
  } else {
    html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
      '<input id="tt-label" type="text" class="config-input" placeholder="Type label (e.g. General Support)" style="flex:2;min-width:160px;">' +
      '<select id="tt-color" class="config-select" style="width:130px;">' +
      '<option value="Primary">Primary (Blue)</option>' +
      '<option value="Secondary">Secondary (Grey)</option>' +
      '<option value="Success">Success (Green)</option>' +
      '<option value="Danger">Danger (Red)</option>' +
      '</select>' +
      '</div>' +
      '<select id="tt-role" class="config-select" style="width:100%;"><option value="">Staff role (optional - leave blank for all staff)</option>' + roleOpts + '</select>' +
      '<button class="btn btn-success btn-sm" onclick="addTicketType()">Add Type</button>' +
      '</div>';
  }

  html += '</div>';

  /* ── Inline panel picker (hidden until showTicketPanelPicker is called) ── */
  html += '<div id="ticket-panel-picker" style="display:none;"></div>';

  return html;
}

function showTicketPanelPicker(types) {
  var picker = document.getElementById('ticket-panel-picker');
  if (!picker) return;
  var allIds = types.map(function(t) { return t.id; });

  var checkboxes = types.map(function(t) {
    var colorDot = { Primary: '#5865f2', Secondary: '#4f545c', Success: '#57f287', Danger: '#ed4245' }[t.buttonColor] || '#5865f2';
    return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 0;border-bottom:1px solid var(--border);">' +
      '<input type="checkbox" class="ticket-type-check" value="' + esc(t.id) + '" checked style="width:14px;height:14px;cursor:pointer;accent-color:#5865f2;">' +
      '<div style="width:10px;height:10px;border-radius:2px;background:' + colorDot + ';flex-shrink:0;"></div>' +
      '<span style="font-size:13px;color:var(--text);">' + esc(t.label) + '</span>' +
      '</label>';
  }).join('');

  picker.style.display = 'block';
  picker.innerHTML =
    '<div class="config-section" style="margin-top:8px;border-color:rgba(88,101,242,0.35);background:rgba(88,101,242,0.04);">' +
    '<div class="config-section-header" style="background:rgba(88,101,242,0.06);">' +
    '<h3 style="color:#7b8cec;">Choose Types to Include</h3>' +
    '<button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'ticket-panel-picker\').style.display=\'none\'">Cancel</button>' +
    '</div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:0;padding:8px 16px;">' +
    '<p style="font-size:12px;color:var(--text-dim);margin-bottom:10px;">Select which ticket types appear as buttons on the panel. At least one must be selected.</p>' +
    checkboxes +
    '</div>' +
    '<div class="config-row" style="gap:8px;justify-content:flex-end;">' +
    '<button class="btn btn-ghost btn-sm" onclick="toggleAllTicketTypes(true)">Select All</button>' +
    '<button class="btn btn-ghost btn-sm" onclick="toggleAllTicketTypes(false)">Deselect All</button>' +
    '<button class="btn btn-success btn-sm" id="send-panel-confirm-btn" onclick="confirmSendTicketPanel()">Send Panel</button>' +
    '</div></div>';
}

function toggleAllTicketTypes(checked) {
  var boxes = document.querySelectorAll('.ticket-type-check');
  boxes.forEach(function(b) { b.checked = checked; });
}

function confirmSendTicketPanel() {
  var boxes = document.querySelectorAll('.ticket-type-check');
  var selectedIds = [];
  boxes.forEach(function(b) { if (b.checked) selectedIds.push(b.value); });
  if (selectedIds.length === 0) { toast('Select at least one ticket type', 'error'); return; }
  var btn = document.getElementById('send-panel-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  api('/guild/' + currentGuild.id + '/settings/tickets/panel/send', {
    method: 'POST',
    body: JSON.stringify({ typeIds: selectedIds })
  }).then(function(r) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Panel'; }
    if (r && r.success) {
      toast('Panel sent to Discord with ' + selectedIds.length + ' type' + (selectedIds.length === 1 ? '' : 's'));
      var picker = document.getElementById('ticket-panel-picker');
      if (picker) picker.style.display = 'none';
    } else if (r && r.error) toast(r.error, 'error');
  });
}

function addTicketType() {
  var label = document.getElementById('tt-label') && document.getElementById('tt-label').value.trim();
  var color = document.getElementById('tt-color') && document.getElementById('tt-color').value || 'Primary';
  var roleId = document.getElementById('tt-role') && document.getElementById('tt-role').value || null;
  if (!label) { toast('Enter a ticket type label', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/tickets/types', {
    method: 'POST',
    body: JSON.stringify({ label: label, buttonColor: color, allowedRoleIds: roleId ? [roleId] : [] })
  }).then(function(r) {
    if (r && r.success) { toast('Ticket type added'); renderSettings('tickets'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteTicketType(typeId) {
  if (!confirm('Remove this ticket type?')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/tickets/types/' + typeId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Ticket type removed'); renderSettings('tickets'); }
    else _pendingScrollRestore = null;
  });
}

/* ── Role Request Settings ── */
function renderRoleRequestSettings(data) {
  var roles = data.requestableRoles || [];
  var allRoles = data.roles || [];
  var roleOpts = allRoles.map(function(r) {
    return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>';
  }).join('');

  var html = '<div class="config-section"><div class="config-section-header">' +
    '<h3>Requestable Roles</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + roles.length + ' configured</span>' +
    '</div>';

  if (roles.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No requestable roles yet. Add one below - members can then request it and staff approve via DM.</span></div>';
  } else {
    roles.forEach(function(r) {
      var approverNames = (r.approverRoleNames || []).join(', ');
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">@' + esc(r.roleName) + '</span>' +
        '<div class="config-sublabel">Approvers: ' + (approverNames ? esc(approverNames) : 'None set - any staff can approve') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteRoleRequest(\'' + esc(r.roleId) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<select id="rr-role" class="config-select" style="flex:1;min-width:160px;"><option value="">Select role to make requestable...</option>' + roleOpts + '</select>' +
    '<select id="rr-approver" class="config-select" style="flex:1;min-width:160px;"><option value="">Approver role (optional)</option>' + roleOpts + '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addRoleRequest()">Add</button>' +
    '</div>' +
    '<span class="config-sublabel">Members can request the selected role. The approver role gets DM notifications to approve or deny.</span>' +
    '</div>';

  html += '</div>';
  html += '<div id="save-bar-container"></div>';
  return html;
}

function addRoleRequest() {
  var roleId = document.getElementById('rr-role') && document.getElementById('rr-role').value;
  var approverId = document.getElementById('rr-approver') && document.getElementById('rr-approver').value || null;
  if (!roleId) { toast('Select a role to make requestable', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/rolerequest/roles', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, approverRoleIds: approverId ? [approverId] : [] })
  }).then(function(r) {
    if (r && r.success) { toast('Role added'); renderSettings('rolerequest'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteRoleRequest(roleId) {
  if (!confirm('Remove this role from the request list?')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/rolerequest/roles/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role removed'); renderSettings('rolerequest'); }
    else _pendingScrollRestore = null;
  });
}

/* ── Voice Mover Settings ── */
window._movemeState = {};

function renderMovemeSettings(data) {
  window._movemeState = {
    allowedChannelIds: (data.allowedChannelIds || []).slice()
  };

  var voiceOpts = (data.voiceChannels || []).map(function(c) {
    return '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>';
  }).join('');

  var tags = (data.allowedChannelIds || []).map(function(id) {
    var ch = (data.voiceChannels || []).find(function(c) { return c.value === id; });
    var name = ch ? ch.label : id;
    return '<span class="channel-tag">' + esc(name) +
      '<button class="channel-tag-remove" onclick="removeMovemeChannel(\'' + esc(id) + '\')" title="Remove">&#x2715;</button></span>';
  }).join('');

  var html = renderSettingsFields(data, 'moveme');

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Allowed Voice Channels</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Members can only move to these channels</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="moveme-channel-tags">' +
    (tags || '<span style="font-size:12px;color:var(--text-dim);">No channels set - all voice channels are allowed when empty.</span>') +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="moveme-channel-select"><option value="">Select a voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addMovemeChannel()">Add</button>' +
    '</div></div></div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Member Panel</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Post the self-move button embed to Discord</span></div>' +
    '<div class="config-row">' +
    '<span class="config-sublabel">Members click the panel button to see available voice channels and move themselves. Post this in a public channel.</span>' +
    '<button class="btn btn-success btn-sm" style="flex-shrink:0;" onclick="sendMovemePanel(event)">Send Panel to Discord</button>' +
    '</div></div>';

  return html;
}

function addMovemeChannel() {
  var sel = document.getElementById('moveme-channel-select');
  if (!sel || !sel.value) { toast('Select a channel first', 'error'); return; }
  var id = sel.value;
  var label = sel.options[sel.selectedIndex].text;
  if (!window._movemeState.allowedChannelIds) window._movemeState.allowedChannelIds = [];
  if (window._movemeState.allowedChannelIds.indexOf(id) !== -1) { toast('Already added', 'error'); return; }
  window._movemeState.allowedChannelIds.push(id);
  pendingChanges.allowedChannelIds = window._movemeState.allowedChannelIds.slice();
  var tagsEl = document.getElementById('moveme-channel-tags');
  if (tagsEl) {
    var span = document.createElement('span');
    span.className = 'channel-tag';
    span.innerHTML = esc(label) + '<button class="channel-tag-remove" onclick="removeMovemeChannel(\'' + esc(id) + '\')" title="Remove">&#x2715;</button>';
    if (tagsEl.querySelector('span[style]')) tagsEl.innerHTML = '';
    tagsEl.appendChild(span);
  }
  sel.value = '';
  showSaveBar('moveme');
}

function removeMovemeChannel(id) {
  if (!window._movemeState.allowedChannelIds) window._movemeState.allowedChannelIds = [];
  window._movemeState.allowedChannelIds = window._movemeState.allowedChannelIds.filter(function(x) { return x !== id; });
  pendingChanges.allowedChannelIds = window._movemeState.allowedChannelIds.slice();
  var tagsEl = document.getElementById('moveme-channel-tags');
  if (tagsEl) {
    var tags = tagsEl.querySelectorAll('.channel-tag');
    tags.forEach(function(tag) {
      var btn = tag.querySelector('.channel-tag-remove');
      if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf('\'' + id + '\'') !== -1) tag.remove();
    });
    if (!tagsEl.querySelectorAll('.channel-tag').length) {
      tagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">No channels set - all voice channels are allowed when empty.</span>';
    }
  }
  showSaveBar('moveme');
}

function sendMovemePanel(e) {
  if (!currentGuild) return;
  var btn = e && e.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  api('/guild/' + currentGuild.id + '/settings/moveme/panel/send', { method: 'POST' }).then(function(r) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Panel to Discord'; }
    if (r && r.success) toast('Voice Mover panel sent to Discord');
    else if (r && r.error) toast(r.error, 'error');
    else toast('Panel sent');
  });
}

/* ── Civilian Jobs Settings ── */
function renderCivJobsSettings(data) {
  var jobs = data.jobs || [];
  var allRoles = data.roles || [];
  var roleOpts = allRoles.map(function(r) {
    return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>';
  }).join('');

  var html = renderSettingsFields(data, 'civjobs');

  html += '<div class="config-section" style="margin-top:4px;">' +
    '<div class="config-section-header"><h3>Civilian Jobs</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + jobs.length + ' job' + (jobs.length === 1 ? '' : 's') + ' configured</span>' +
    '</div>';

  if (jobs.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No jobs yet. Add a job below - each job appears in the civ portal job board. Role and shift duration are required.</span></div>';
  } else {
    jobs.forEach(function(j) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(j.name) + '</span>' +
        '<div class="config-sublabel">' +
        (j.description ? esc(j.description) : 'No description') +
        (j.roleName ? ' | Role: @' + esc(j.roleName) : '') +
        (j.durationHours ? ' | Shift: ' + esc(String(j.durationHours)) + 'h' : '') +
        '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteCivJob(\'' + esc(j.jobId) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<input id="cj-name" type="text" class="config-input" placeholder="Job name (e.g. Mechanic)" style="flex:2;min-width:140px;">' +
    '<input id="cj-duration" type="number" class="config-input" placeholder="Shift hrs" min="1" max="72" style="width:100px;">' +
    '</div>' +
    '<input id="cj-desc" type="text" class="config-input" placeholder="Description (optional)" style="width:100%;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select id="cj-role" class="config-select" style="flex:1;min-width:160px;"><option value="">Select job role (required)...</option>' + roleOpts + '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addCivJob()">Add Job</button>' +
    '</div>' +
    '<span class="config-sublabel">Role and shift duration are required. Members check in/out via the portal.</span>' +
    '</div>' +
    '</div>';

  return html;
}

function addCivJob() {
  var name = document.getElementById('cj-name') && document.getElementById('cj-name').value.trim();
  var desc = document.getElementById('cj-desc') && document.getElementById('cj-desc').value.trim() || '';
  var duration = document.getElementById('cj-duration') && document.getElementById('cj-duration').value;
  var roleId = document.getElementById('cj-role') && document.getElementById('cj-role').value || null;
  if (!name) { toast('Enter a job name', 'error'); return; }
  if (!roleId) { toast('Select a role for this job', 'error'); return; }
  if (!duration || Number(duration) <= 0) { toast('Enter a shift duration in hours', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/civjobs/job', {
    method: 'POST',
    body: JSON.stringify({ name: name, description: desc, roleId: roleId, durationHours: Number(duration) })
  }).then(function(r) {
    if (r && r.success) { toast('Job added'); renderSettings('civjobs'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteCivJob(jobId) {
  if (!confirm('Remove this job?')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/civjobs/job/' + jobId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Job removed'); renderSettings('civjobs'); }
    else _pendingScrollRestore = null;
  });
}

/* ── Calendar Events Section ── */
function renderCalendarEventsSection(data) {
  var events = data.events || [];
  var days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  var dayOpts = days.map(function(d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');

  var html = '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Scheduled Events</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + events.length + ' event' + (events.length === 1 ? '' : 's') + '</span>' +
    '<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="postCalendar()">Post Calendar to Discord</button>' +
    '</div>';

  if (events.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No events scheduled yet. Add recurring weekly events below.</span></div>';
  } else {
    events.forEach(function(e) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(e.day) + (e.time ? ' at ' + esc(e.time) : '') + (e.timezone ? ' ' + esc(e.timezone) : '') + '</span>' +
        '<div class="config-sublabel">' + esc(e.description || 'No description') + (e.person ? ' - Host: ' + esc(e.person) : '') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteCalendarEvent(\'' + esc(e.id) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<select id="cal-day" class="config-select" style="width:130px;">' + dayOpts + '</select>' +
    '<input id="cal-time" type="text" class="config-input" placeholder="Time (e.g. 8:00 PM)" style="width:140px;">' +
    '<input id="cal-tz" type="text" class="config-input" placeholder="Timezone (e.g. ET)" style="width:90px;" value="ET">' +
    '</div>' +
    '<input id="cal-desc" type="text" class="config-input" placeholder="Event description" style="width:100%;">' +
    '<div style="display:flex;gap:8px;">' +
    '<input id="cal-person" type="text" class="config-input" placeholder="Host name (optional)" style="width:180px;">' +
    '<button class="btn btn-success btn-sm" onclick="addCalendarEvent()">Add Event</button>' +
    '</div></div>';

  html += '</div>';
  return html;
}

function addCalendarEvent() {
  var day = document.getElementById('cal-day') && document.getElementById('cal-day').value;
  var time = document.getElementById('cal-time') && document.getElementById('cal-time').value.trim() || '';
  var tz = document.getElementById('cal-tz') && document.getElementById('cal-tz').value.trim() || 'ET';
  var desc = document.getElementById('cal-desc') && document.getElementById('cal-desc').value.trim();
  var person = document.getElementById('cal-person') && document.getElementById('cal-person').value.trim() || '';
  if (!desc) { toast('Enter an event description', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/calendar/events', {
    method: 'POST',
    body: JSON.stringify({ day: day, time: time, timezone: tz, description: desc, person: person })
  }).then(function(r) {
    if (r && r.success) { toast('Event added'); renderSettings('calendar'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteCalendarEvent(eventId) {
  if (!confirm('Remove this event?')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/calendar/events/' + eventId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Event removed'); renderSettings('calendar'); }
    else _pendingScrollRestore = null;
  });
}

function postCalendar() {
  if (!currentGuild) return;
  var btn = event && event.target;
  if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }
  api('/guild/' + currentGuild.id + '/settings/calendar/post', { method: 'POST' }).then(function(r) {
    if (btn) { btn.disabled = false; btn.textContent = 'Post Calendar to Discord'; }
    if (r && r.success) toast('Calendar posted to Discord successfully');
    else if (r && r.error) toast(r.error, 'error');
  });
}

/* ── Whitelisted Links Section ── */
function renderWhitelistedLinksSection(data) {
  var links = data.whitelistedLinks || [];

  var html = '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Whitelisted Invite Links</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + links.length + ' link' + (links.length === 1 ? '' : 's') + '</span></div>';

  if (links.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No whitelisted links. Add invite links below that members are allowed to post.</span></div>';
  } else {
    links.forEach(function(l) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<span class="config-label" style="font-family:monospace;font-size:12px;">' + esc(l) + '</span>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteWhitelistedLink(\'' + esc(l) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="display:flex;gap:8px;">' +
    '<input id="wl-link" type="text" class="config-input" placeholder="discord.gg/yourserver or full invite URL" style="flex:1;">' +
    '<button class="btn btn-success btn-sm" onclick="addWhitelistedLink()">Add</button>' +
    '</div>';

  html += '</div>';
  return html;
}

function addWhitelistedLink() {
  var link = document.getElementById('wl-link') && document.getElementById('wl-link').value.trim();
  if (!link) { toast('Enter an invite link', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/antipromo/links', {
    method: 'POST',
    body: JSON.stringify({ link: link })
  }).then(function(r) {
    if (r && r.success) { toast('Link whitelisted'); renderSettings('antipromo'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteWhitelistedLink(link) {
  if (!confirm('Remove "' + link + '" from whitelist?')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/antipromo/links', {
    method: 'DELETE',
    body: JSON.stringify({ link: link })
  }).then(function(r) {
    if (r && r.success) { toast('Link removed'); renderSettings('antipromo'); }
    else _pendingScrollRestore = null;
  });
}

/* ── Economy Settings (grouped) ── */
function renderEconomySettings(data) {
  var fields = data.fields || [];
  var groups = {
    general:   { label: 'General', keys: ['enabled','currencySymbol','startingBalance','maxBalance','logChannelId'] },
    work:      { label: 'Work',    keys: ['work_enabled','work_cooldown','work_minPayout','work_maxPayout'] },
    crime:     { label: 'Crime',   keys: ['crime_enabled','crime_cooldown','crime_successRate','crime_minPayout','crime_maxPayout','crime_fineRate'] },
    rob:       { label: 'Robbery', keys: ['rob_enabled','rob_cooldown','rob_successRate','rob_maxStealPercent'] },
    gambling:  { label: 'Gambling', keys: ['gambling_enabled','gambling_minBet','gambling_maxBet','gambling_cooldown'] },
    chatmoney: { label: 'Chat Money', keys: ['chatMoney_enabled','chatMoney_minAmount','chatMoney_maxAmount','chatMoney_cooldown'] },
    store:     { label: 'Store Settings', keys: ['sellPercent'] },
    income:    { label: 'Income', keys: ['incomeTax','incomeChannelId'] },
  };

  var fieldMap = {};
  fields.forEach(function(f) { fieldMap[f.key] = f; });

  var html = '';
  var groupOrder = ['general','work','crime','rob','gambling','chatmoney','store','income'];
  groupOrder.forEach(function(gKey) {
    var g = groups[gKey];
    var groupFields = g.keys.map(function(k) { return fieldMap[k]; }).filter(Boolean);
    if (groupFields.length === 0) return;

    html += '<div class="config-section" style="margin-bottom:12px;">' +
      '<div class="config-section-header"><h3>' + g.label + '</h3></div>';
    groupFields.forEach(function(field) {
      html += renderOneField(field, 'economy');
    });
    html += '</div>';
  });

  html += '<div id="save-bar-container"></div>';

  /* ── Role Income ── */
  var riList = data.roleIncomeList || [];
  var riLimitLabel = currentGuild.premium ? '\u221e' : '2';
  var riRoles = data.roles || [];
  html += '<div class="config-section" style="margin-top:4px;">' +
    '<div class="config-section-header"><h3>Role Income</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + riList.length + ' / ' + riLimitLabel + ' entries</span></div>';
  if (riList.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No role income entries yet. Add one below.</span></div>';
  } else {
    riList.forEach(function(r) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">@' + esc(r.roleName) + '</span>' +
        '<div class="config-sublabel">Earns ' + esc(String(r.amount)) + ' every ' + esc(String(r.cooldown)) + 'h</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteRoleIncome(\'' + esc(r.roleId) + '\')">Remove</button>' +
        '</div>';
    });
  }
  if (!currentGuild.premium && riList.length >= 2) {
    html += '<div class="config-row" style="background:var(--amber-bg);">' +
      '<span style="font-size:12px;color:var(--amber);">Free limit reached (2 entries). Upgrade to Premium for unlimited.</span></div>';
  } else {
    html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
      '<select id="ri-role" class="config-select" style="flex:1;min-width:140px;"><option value="">Select role...</option>' +
      riRoles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
      '</select>' +
      '<input id="ri-amount" type="number" class="config-input" placeholder="Amount" min="1" style="width:100px;">' +
      '<input id="ri-cooldown" type="number" class="config-input" placeholder="Hours" min="1" max="720" style="width:80px;">' +
      '<button class="btn btn-success btn-sm" onclick="addRoleIncome()">Add</button>' +
      '</div>' +
      '<span class="config-sublabel">Role \u2192 amount earned \u2192 cooldown in hours</span>' +
      '</div>';
  }
  html += '</div>';

  /* ── Role Deductions ── */
  var rdList = data.roleDeductions || [];
  html += '<div class="config-section" style="margin-top:4px;">' +
    '<div class="config-section-header"><h3>Role Deductions</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + rdList.length + ' entries &mdash; deducted from income payouts</span></div>';
  if (rdList.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No deductions yet. Roles with deductions have a fixed fee taken from their income earnings.</span></div>';
  } else {
    rdList.forEach(function(r) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">@' + esc(r.roleName) + '</span>' +
        '<div class="config-sublabel">Deducts ' + esc(String(r.amount)) + ' &mdash; ' + esc(r.label || 'Deduction') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteRoleDeduction(\'' + esc(r.roleId) + '\')">Remove</button>' +
        '</div>';
    });
  }
  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<select id="rd-role" class="config-select" style="flex:1;min-width:140px;"><option value="">Select role...</option>' +
    riRoles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<input id="rd-amount" type="number" class="config-input" placeholder="Amount" min="1" style="width:100px;">' +
    '<input id="rd-label" type="text" class="config-input" placeholder="Label (e.g. Taxes)" style="width:140px;">' +
    '<button class="btn btn-success btn-sm" onclick="addRoleDeduction()">Add</button>' +
    '</div>' +
    '<span class="config-sublabel">Role &rarr; deduction amount &rarr; label shown to members</span>' +
    '</div>' +
    '</div>';

  /* ── Store Management ── */
  var storeItems = data.storeItems || [];
  html += '<div class="config-section" style="margin-top:4px;">' +
    '<div class="config-section-header"><h3>Store Items</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + storeItems.length + ' custom item(s)</span></div>';
  if (storeItems.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No custom store items yet. GTA V built-in vehicles are always available. Add custom items below.</span></div>';
  } else {
    storeItems.forEach(function(item) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(item.name) + ' - ' + esc(String(item.price)) + '</span>' +
        '<div class="config-sublabel">' +
        (item.description ? esc(item.description) : 'No description') +
        (item.roleName ? ' | Grants: @' + esc(item.roleName) : '') +
        (item.usable ? ' | Usable' : '') +
        '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteStoreItem(\'' + esc(item.id) + '\')">Remove</button>' +
        '</div>';
    });
  }
  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<input id="store-name" type="text" class="config-input" placeholder="Item name" style="flex:2;min-width:120px;">' +
    '<input id="store-price" type="number" class="config-input" placeholder="Price" min="0" style="width:100px;">' +
    '</div>' +
    '<input id="store-desc" type="text" class="config-input" placeholder="Description (optional)" style="width:100%;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
    '<select id="store-role" class="config-select" style="flex:1;min-width:140px;"><option value="">Grant role on buy (optional)</option>' +
    riRoles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<select id="store-required-role" class="config-select" style="flex:1;min-width:160px;"><option value="">Required role to buy (optional)</option>' +
    riRoles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
    '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">' +
    '<input id="store-usable" type="checkbox"> Usable item</label>' +
    '<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">' +
    '<input id="store-sellable" type="checkbox" checked> Sellable</label>' +
    '<button class="btn btn-success btn-sm" onclick="addStoreItem()">Add Item</button>' +
    '</div>' +
    '</div>' +
    '</div>';

  /* ── Member Money Management ── */
  html += '<div class="config-section" style="margin-top:4px;">' +
    '<div class="config-section-header"><h3>Member Money Management</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Add, remove, or reset a member\'s balance</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:10px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;align-items:center;">' +
    '<div style="position:relative;flex:2;min-width:180px;">' +
    '<input id="mm-search" type="text" class="config-input" placeholder="Search member by name..." oninput="searchMembersForMoney(this.value)" autocomplete="off" style="width:100%;">' +
    '<div id="mm-results" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--bg-2,#1e1e2e);border:1px solid var(--border,#333);border-radius:6px;z-index:100;max-height:200px;overflow-y:auto;"></div>' +
    '</div>' +
    '<input id="mm-amount" type="number" class="config-input" placeholder="Amount" min="1" style="width:110px;">' +
    '<button class="btn btn-success btn-sm" onclick="mmAction(\'add\')">Add Money</button>' +
    '<button class="btn btn-danger btn-sm" onclick="mmAction(\'remove\')">Remove Money</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="mmAction(\'reset\')">Reset Balance</button>' +
    '</div>' +
    '<div id="mm-selected-info" style="font-size:12px;color:var(--text-dim);min-height:16px;"></div>' +
    '</div>' +
    '</div>';

  return html;
}

var _mmSelectedUser = null;
var _mmSearchTimeout = null;
var _pendingScrollRestore = null;

function searchMembersForMoney(query) {
  clearTimeout(_mmSearchTimeout);
  var resultsEl = document.getElementById('mm-results');
  if (!query || query.length < 2) { if (resultsEl) resultsEl.style.display = 'none'; return; }
  _mmSearchTimeout = setTimeout(function() {
    api('/guild/' + currentGuild.id + '/economy/members?q=' + encodeURIComponent(query)).then(function(r) {
      if (!r || !r.members) return;
      var members = r.members;
      var resultsEl2 = document.getElementById('mm-results');
      if (!resultsEl2) return;
      if (members.length === 0) {
        resultsEl2.innerHTML = '<div style="padding:8px 12px;font-size:13px;color:var(--text-dim);">No members found</div>';
      } else {
        resultsEl2.innerHTML = members.map(function(m) {
          return '<div onclick="selectMemberForMoney(\'' + esc(m.id) + '\',\'' + esc(m.username) + '\')" ' +
            'style="padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid var(--border,#333);" ' +
            'onmouseover="this.style.background=\'var(--bg-3,#2a2a3e)\'" onmouseout="this.style.background=\'\'">' +
            esc(m.displayName || m.username) + ' <span style="color:var(--text-dim);font-size:11px;">@' + esc(m.username) + '</span>' +
            '</div>';
        }).join('');
      }
      resultsEl2.style.display = 'block';
    });
  }, 300);
}

function selectMemberForMoney(userId, username) {
  _mmSelectedUser = { id: userId, username: username };
  var searchEl = document.getElementById('mm-search');
  var resultsEl = document.getElementById('mm-results');
  var infoEl = document.getElementById('mm-selected-info');
  if (searchEl) searchEl.value = username;
  if (resultsEl) resultsEl.style.display = 'none';
  if (infoEl) infoEl.textContent = 'Selected: ' + username + ' (ID: ' + userId + ')';
}

function mmAction(action) {
  if (!_mmSelectedUser) { toast('Search and select a member first', 'error'); return; }
  var amount = document.getElementById('mm-amount') && parseInt(document.getElementById('mm-amount').value);
  if (action !== 'reset' && (!amount || amount < 1)) { toast('Enter a valid amount', 'error'); return; }
  var body = { userId: _mmSelectedUser.id };
  if (action !== 'reset') body.amount = amount;
  api('/guild/' + currentGuild.id + '/economy/' + action + 'money', {
    method: 'POST',
    body: JSON.stringify(body)
  }).then(function(r) {
    if (r && r.success) {
      toast(r.message || 'Done');
      var infoEl = document.getElementById('mm-selected-info');
      if (infoEl && r.newBalance !== undefined) infoEl.textContent = 'Selected: ' + _mmSelectedUser.username + ' - New balance: ' + r.newBalance;
    } else if (r && r.error) toast(r.error, 'error');
  });
}

function getDashScrollPos() {
  var content = document.querySelector('.dashboard-content');
  return content ? content.scrollTop : window.scrollY;
}

function restoreDashScrollPos(pos) {
  setTimeout(function() {
    var content = document.querySelector('.dashboard-content');
    if (content) content.scrollTop = pos;
    else window.scrollTo(0, pos);
  }, 30);
}

function addRoleIncome() {
  var roleId = document.getElementById('ri-role') && document.getElementById('ri-role').value;
  var amount = document.getElementById('ri-amount') && document.getElementById('ri-amount').value;
  var cooldown = document.getElementById('ri-cooldown') && document.getElementById('ri-cooldown').value || '24';
  if (!roleId) { toast('Select a role', 'error'); return; }
  if (!amount || Number(amount) <= 0) { toast('Enter a valid amount', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/roleincome', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, amount: Number(amount), cooldown: Number(cooldown) })
  }).then(function(r) {
    if (r && r.success) { toast('Role income added'); renderSettings('economy'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteRoleIncome(roleId) {
  if (!currentGuild) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/roleincome/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role income removed'); renderSettings('economy'); }
    else _pendingScrollRestore = null;
  });
}

function addRoleDeduction() {
  var roleId = document.getElementById('rd-role') && document.getElementById('rd-role').value;
  var amount = document.getElementById('rd-amount') && document.getElementById('rd-amount').value;
  var label = (document.getElementById('rd-label') && document.getElementById('rd-label').value.trim()) || 'Deduction';
  if (!roleId) { toast('Select a role', 'error'); return; }
  if (!amount || Number(amount) <= 0) { toast('Enter a valid amount', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/rolededuction', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, amount: Number(amount), label: label })
  }).then(function(r) {
    if (r && r.success) { toast('Role deduction added'); renderSettings('economy'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteRoleDeduction(roleId) {
  if (!currentGuild) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/rolededuction/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role deduction removed'); renderSettings('economy'); }
    else _pendingScrollRestore = null;
  });
}

function addStoreItem() {
  var name = document.getElementById('store-name') && document.getElementById('store-name').value.trim();
  var price = document.getElementById('store-price') && document.getElementById('store-price').value;
  var desc = document.getElementById('store-desc') && document.getElementById('store-desc').value.trim() || '';
  var roleId = document.getElementById('store-role') && document.getElementById('store-role').value || null;
  var requiredRoleId = document.getElementById('store-required-role') && document.getElementById('store-required-role').value || null;
  var usable = document.getElementById('store-usable') && document.getElementById('store-usable').checked || false;
  var sellable = document.getElementById('store-sellable') ? document.getElementById('store-sellable').checked : true;
  if (!name) { toast('Item name is required', 'error'); return; }
  if (price === '' || price === undefined || isNaN(Number(price))) { toast('Enter a valid price', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/store', {
    method: 'POST',
    body: JSON.stringify({ name: name, price: Number(price), description: desc, usable: usable, sellable: sellable, roleId: roleId || null, requiredRoleId: requiredRoleId || null })
  }).then(function(r) {
    if (r && r.success) { toast('Item added'); renderSettings('economy'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteStoreItem(itemId) {
  if (!currentGuild) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/store/' + itemId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Item removed'); renderSettings('economy'); }
    else _pendingScrollRestore = null;
  });
}

/* ── Staff Management Settings ── */
var _staffState = { members: [], position: 'staff' };

function renderStaffSettings(data) {
  var staffRoles = data.staffRoles || [];
  var staffUsers = data.staffUsers || [];
  var roles = data.roles || [];

  var html = '';

  /* Staff Roles */
  html += '<div class="config-section"><div class="config-section-header"><div><h3>Staff Roles</h3><p class="config-section-desc">Any member with one of these roles will have staff/manager access to the bot.</p></div></div>';
  if (staffRoles.length === 0) {
    html += '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">No staff roles added yet.</span></div>';
  } else {
    staffRoles.forEach(function(r) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div>' +
          '<span class="config-label">@' + esc(r.roleName) + '</span>' +
          '<span style="margin-left:10px;font-size:11px;color:var(--text-dim);background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:2px 7px;">' + esc(r.position) + '</span>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="removeStaffEntry(\'' + esc(r.id) + '\')">Remove</button>' +
        '</div>';
    });
  }
  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;margin-top:8px;">' +
    '<div style="display:flex;gap:8px;width:100%;flex-wrap:wrap;">' +
    '<select id="staff-role-select" class="config-select" style="flex:1;min-width:180px;">' +
    '<option value="">Select a role...</option>' +
    roles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<select id="staff-role-position" class="config-select" style="width:130px;">' +
    '<option value="staff">Staff</option>' +
    '<option value="manager">Manager</option>' +
    '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addStaffRole()">Add Role</button>' +
    '</div></div>';
  html += '</div>';

  /* Staff Users */
  html += '<div class="config-section" style="margin-top:10px;"><div class="config-section-header"><div><h3>Staff Users</h3><p class="config-section-desc">Individual members granted staff or manager access regardless of their roles.</p></div></div>';
  if (staffUsers.length === 0) {
    html += '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">No individual staff users added yet.</span></div>';
  } else {
    staffUsers.forEach(function(u) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div>' +
          '<span class="config-label">' + esc(u.username) + '</span>' +
          '<span style="margin-left:10px;font-size:11px;color:var(--text-dim);background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:2px 7px;">' + esc(u.position) + '</span>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="removeStaffEntry(\'' + esc(u.id) + '\')">Remove</button>' +
        '</div>';
    });
  }
  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;margin-top:8px;">' +
    '<div style="display:flex;gap:8px;width:100%;flex-wrap:wrap;">' +
    '<div style="flex:1;min-width:200px;position:relative;">' +
    '<input id="staff-user-search" type="text" class="config-input" placeholder="Search members..." autocomplete="off" oninput="filterStaffMembers()" onfocus="showStaffDropdown()" style="width:100%;box-sizing:border-box;">' +
    '<div id="staff-user-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--card);border:1px solid var(--border);border-radius:0 0 var(--radius) var(--radius);max-height:200px;overflow-y:auto;z-index:100;"></div>' +
    '<input id="staff-user-id" type="hidden" value="">' +
    '</div>' +
    '<select id="staff-user-position" class="config-select" style="width:130px;">' +
    '<option value="staff">Staff</option>' +
    '<option value="manager">Manager</option>' +
    '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addStaffUser()">Add User</button>' +
    '</div></div>';
  html += '</div>';

  html += '<div id="save-bar-container"></div>';

  /* Load members in background */
  setTimeout(function() { loadStaffMembers(); }, 0);

  return html;
}

function loadStaffMembers() {
  api('/guild/' + currentGuild.id + '/members').then(function(r) {
    if (r && r.members) {
      _staffState.members = r.members;
      filterStaffMembers();
    }
  });
}

function filterStaffMembers() {
  var input = document.getElementById('staff-user-search');
  var dropdown = document.getElementById('staff-user-dropdown');
  if (!input || !dropdown) return;
  var q = input.value.trim().toLowerCase();
  var filtered = q
    ? _staffState.members.filter(function(m) {
        return m.displayName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q);
      })
    : _staffState.members.slice(0, 50);
  if (filtered.length === 0) {
    dropdown.innerHTML = '<div style="padding:10px 14px;font-size:13px;color:var(--text-dim);">' + (q ? 'No members found.' : 'Start typing to search...') + '</div>';
  } else {
    dropdown.innerHTML = filtered.slice(0, 50).map(function(m) {
      return '<div class="staff-member-option" data-id="' + esc(m.id) + '" data-name="' + esc(m.displayName) + '" onclick="selectStaffMember(this)" style="display:flex;align-items:center;gap:10px;padding:8px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);">' +
        '<img src="' + esc(m.avatar) + '" width="24" height="24" style="border-radius:50%;flex-shrink:0;" onerror="this.style.display=\'none\'">' +
        '<span>' + esc(m.displayName) + '</span>' +
        (m.displayName !== m.username ? '<span style="color:var(--text-dim);font-size:11px;">(' + esc(m.username) + ')</span>' : '') +
        '</div>';
    }).join('');
  }
  dropdown.style.display = 'block';
}

function showStaffDropdown() {
  var dropdown = document.getElementById('staff-user-dropdown');
  if (dropdown) { dropdown.style.display = 'block'; filterStaffMembers(); }
  document.addEventListener('click', hideStaffDropdownOutside, { once: true });
}

function hideStaffDropdownOutside(e) {
  var wrap = document.getElementById('staff-user-search');
  var dd = document.getElementById('staff-user-dropdown');
  if (wrap && dd && !wrap.contains(e.target) && !dd.contains(e.target)) dd.style.display = 'none';
}

function selectStaffMember(el) {
  var id = el.getAttribute('data-id');
  var name = el.getAttribute('data-name');
  var input = document.getElementById('staff-user-search');
  var hiddenId = document.getElementById('staff-user-id');
  var dropdown = document.getElementById('staff-user-dropdown');
  if (input) input.value = name;
  if (hiddenId) hiddenId.value = id;
  if (dropdown) dropdown.style.display = 'none';
}

function addStaffRole() {
  var roleId = document.getElementById('staff-role-select') && document.getElementById('staff-role-select').value;
  var position = document.getElementById('staff-role-position') && document.getElementById('staff-role-position').value;
  if (!roleId) { toast('Select a role', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/add', {
    method: 'POST',
    body: JSON.stringify({ type: 'role', roleId: roleId, position: position || 'staff' })
  }).then(function(r) {
    if (r && r.success) { toast('Staff role added'); renderSettings('staff'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function addStaffUser() {
  var userId = document.getElementById('staff-user-id') && document.getElementById('staff-user-id').value;
  var position = document.getElementById('staff-user-position') && document.getElementById('staff-user-position').value;
  if (!userId) { toast('Select a member from the list', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/add', {
    method: 'POST',
    body: JSON.stringify({ type: 'user', userId: userId, position: position || 'staff' })
  }).then(function(r) {
    if (r && r.success) { toast('Staff member added'); renderSettings('staff'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function removeStaffEntry(entryId) {
  if (!confirm('Remove this staff entry?')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/' + entryId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Staff entry removed'); renderSettings('staff'); }
    else _pendingScrollRestore = null;
  });
}

/* ── Sticky Messages Settings ── */
function renderStickySettings(data) {
  var stickies = data.stickies || [];
  var html = '<div class="config-section"><div class="config-section-header"><h3>Active Sticky Messages</h3></div>';
  if (stickies.length === 0) {
    html += '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">No sticky messages configured. Use <code>/sticky create</code> in Discord to add one.</span></div>';
  } else {
    stickies.forEach(function(s) {
      html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:6px;padding:14px 0;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;">' +
        '<span class="config-label">#' + esc(s.channelName) + '</span>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteStickyMessage(\'' + esc(s.channelId) + '\')">Remove</button>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text-muted);background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 12px;width:100%;box-sizing:border-box;white-space:pre-wrap;word-break:break-word;">' + esc(s.messageContent) + '</div>' +
        '<div style="font-size:11px;color:var(--text-dim);">Reposted ' + s.messageCount + ' times</div>' +
        '</div>';
    });
  }
  html += '</div>';
  html += '<div class="config-section" style="margin-top:10px;"><div class="config-section-header"><h3>Add Sticky Message</h3></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<select id="sticky-channel-select" class="config-select" style="width:100%;">' +
    '<option value="">Select a channel...</option>' +
    (data.channels || []).map(function(c) { return '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>'; }).join('') +
    '</select>' +
    '<textarea id="sticky-content-input" class="config-textarea" placeholder="Enter the sticky message content..." style="width:100%;min-height:80px;box-sizing:border-box;"></textarea>' +
    '<button class="btn btn-success btn-sm" onclick="addStickyMessage()">Add Sticky</button>' +
    '</div></div>';
  html += '<div id="save-bar-container"></div>';
  return html;
}

function addStickyMessage() {
  var channelId = document.getElementById('sticky-channel-select') && document.getElementById('sticky-channel-select').value;
  var content = document.getElementById('sticky-content-input') && document.getElementById('sticky-content-input').value.trim();
  if (!channelId) { toast('Select a channel', 'error'); return; }
  if (!content) { toast('Enter a message', 'error'); return; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/sticky', {
    method: 'POST',
    body: JSON.stringify({ channelId: channelId, content: content })
  }).then(function(r) {
    if (r && r.success) { toast('Sticky message added'); renderSettings('sticky'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteStickyMessage(channelId) {
  if (!confirm('Remove the sticky message from this channel?')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/sticky/' + channelId, {
    method: 'DELETE'
  }).then(function(r) {
    if (r && r.success) { toast('Sticky removed'); renderSettings('sticky'); }
    else _pendingScrollRestore = null;
  });
}

/* ── Reaction Roles Settings ── */
function renderReactionRolesSettings(data) {
  var rrs = data.reactionRoles || [];
  var html = '<div class="config-section"><div class="config-section-header"><h3>Reaction Role Messages</h3></div>';
  if (rrs.length === 0) {
    html += '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">No reaction role messages configured. Use <code>/reactionrolemessage</code> in Discord to set one up.</span></div>';
  } else {
    rrs.forEach(function(r) {
      html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:6px;padding:14px 0;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;width:100%;">' +
        '<span class="config-label">#' + esc(r.channelName) + '</span>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteReactionRole(\'' + esc(r.messageId) + '\')">Remove</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-muted);">Message ID: <code style="font-size:11px;">' + esc(r.messageId) + '</code></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:2px;">' +
        r.pairs.map(function(p) {
          return '<span style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:12px;">' +
            esc(p.emoji) + ' &rarr; ' + esc(p.roleName) + '</span>';
        }).join('') +
        '</div></div>';
    });
  }
  html += '</div>';
  html += '<div class="config-section" style="margin-top:10px;"><div class="config-section-header"><h3>How to Add</h3></div>' +
    '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">Use <code>/reactionrolemessage</code> in your Discord server to create a new reaction role message. Up to 5 emoji-role pairs per message.</span></div>' +
    '</div>';
  html += '<div id="save-bar-container"></div>';
  return html;
}

function deleteReactionRole(messageId) {
  if (!confirm('Remove this reaction role message?')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/reactionroles/' + messageId, {
    method: 'DELETE'
  }).then(function(r) {
    if (r && r.success) { toast('Reaction role removed'); renderSettings('reactionroles'); }
    else _pendingScrollRestore = null;
  });
}

/* ── Generic settings fields ── */
function renderSettingsFields(data, mod) {
  if (!data.fields || data.fields.length === 0) {
    return '<div class="config-section"><div class="config-section-header"><h3>Configuration</h3></div>' +
      '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">No configurable settings for this module. Use Discord commands to set it up.</span></div></div>' +
      '<div id="save-bar-container"></div>';
  }
  var html = '<div class="config-section"><div class="config-section-header"><h3>Settings</h3></div>';
  data.fields.forEach(function(field) {
    html += renderOneField(field, mod);
  });
  html += '</div>';
  html += '<div id="save-bar-container"></div>';
  return html;
}

function renderOneField(field, mod) {
  var isTextarea = field.type === 'textarea';
  var html = '<div class="config-row' + (isTextarea ? ' textarea-row' : '') + '">';
  html += '<div class="config-left"><span class="config-label">' + esc(field.label) + '</span>';
  if (field.description) html += '<div class="config-sublabel">' + esc(field.description) + '</div>';
  html += '</div>';

  if (field.type === 'toggle') {
    html += '<div class="toggle ' + (field.value ? 'active' : '') + '" onclick="toggleField(this,\'' + mod + '\',\'' + field.key + '\')" data-key="' + field.key + '" title="' + esc(field.label) + '"></div>';
  } else if (field.type === 'select' || field.type === 'role') {
    html += '<select class="config-select" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '">';
    html += '<option value="">- Not Set -</option>';
    (field.options || []).forEach(function(opt) {
      html += '<option value="' + esc(opt.value) + '" ' + (opt.value === field.value ? 'selected' : '') + '>' + esc(opt.label) + '</option>';
    });
    html += '</select>';
  } else if (field.type === 'action') {
    html += '<select class="config-action" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '">';
    (field.options || []).forEach(function(opt) {
      html += '<option value="' + esc(opt.value) + '" ' + (opt.value === field.value ? 'selected' : '') + '>' + esc(opt.label) + '</option>';
    });
    html += '</select>';
  } else if (field.type === 'number') {
    html += '<input type="number" class="config-input" value="' + (field.value !== undefined ? field.value : '') + '" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '" min="' + (field.min || 0) + '" max="' + (field.max || 999999) + '">';
  } else if (field.type === 'textarea') {
    html += '<textarea class="config-textarea" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '" placeholder="' + esc(field.placeholder || '') + '">' + esc(String(field.value || '')) + '</textarea>';
  } else if (field.type === 'text') {
    html += '<input type="text" class="config-input" value="' + esc(String(field.value || '')) + '" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '" placeholder="' + esc(field.placeholder || '') + '">';
  } else {
    html += '<span class="config-value">' + esc(String(field.value != null ? field.value : 'Not Set')) + '</span>';
  }

  html += '</div>';
  return html;
}

/* ── Field change handlers ── */
function toggleField(el, mod, key) {
  el.classList.toggle('active');
  pendingChanges[key] = el.classList.contains('active');
  showSaveBar(mod);
}

function changeField(mod, key, value) {
  pendingChanges[key] = value;
  showSaveBar(mod);
}

function showSaveBar(mod) {
  var container = document.getElementById('save-bar-container');
  if (!container) return;
  if (Object.keys(pendingChanges).length === 0) { container.innerHTML = ''; return; }
  container.innerHTML =
    '<div class="save-bar">' +
    '<span style="color:var(--text-muted);font-size:12px;margin-right:auto;">Unsaved changes</span>' +
    '<button class="btn btn-secondary btn-sm" onclick="renderSettings(\'' + mod + '\')">Discard</button>' +
    '<button class="btn btn-success btn-sm" onclick="saveSettings(\'' + mod + '\')">Save Changes</button>' +
    '</div>';
}

function saveSettings(mod) {
  if (Object.keys(pendingChanges).length === 0) return;
  var saveBtn = document.querySelector('.save-bar .btn-success');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/settings/' + mod, {
    method: 'POST',
    body: JSON.stringify(pendingChanges)
  }).then(function(result) {
    if (result && result.success) {
      toast('Settings saved successfully');
      pendingChanges = {};
      window._dispatchState = {};
      api('/guild/' + currentGuild.id).then(function(refreshed) {
        if (refreshed) currentGuild = refreshed;
        renderSettings(mod);
      });
    } else {
      _pendingScrollRestore = null;
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
  });
}

init();
