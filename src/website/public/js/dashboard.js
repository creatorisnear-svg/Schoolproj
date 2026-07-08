var app = document.getElementById('app');
var toastEl = document.getElementById('toast');

var currentUser = null;
var currentGuild = null;
var guilds = [];
var pendingChanges = {};
var sidebarOpen = false;
var featureFlags = {};

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
  var headers = { 'Content-Type': 'application/json' };
  if (opts.headers) { for (var k in opts.headers) headers[k] = opts.headers[k]; }
  opts.headers = headers;
  return fetch('/api' + path, opts).then(function(res) {
    if (res.status === 401) { window.location.href = '/dashboard/login'; return null; }
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

/* ── Session persistence helpers ── */
function saveSession(guildId, section) {
  try {
    if (guildId) sessionStorage.setItem('rpm_guild_id', guildId);
    if (section) sessionStorage.setItem('rpm_section', section);
    else sessionStorage.removeItem('rpm_section');
  } catch(e) {}
}
function clearSession() {
  try { sessionStorage.removeItem('rpm_guild_id'); sessionStorage.removeItem('rpm_section'); } catch(e) {}
}
function getSavedGuildId() { try { return sessionStorage.getItem('rpm_guild_id'); } catch(e) { return null; } }
function getSavedSection() { try { return sessionStorage.getItem('rpm_section'); } catch(e) { return null; } }

/* ── Init ── */
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
    var html = '<div class="skeleton-section"><div class="skeleton-header">' +
      '<div class="sk-line skeleton" style="width:90px;"></div></div>';
    rows.forEach(function(r) { html += skRow(r[0], r[1]); });
    return html + '</div>';
  }
  return skSection([['55%','38px'],['40%','120px'],['65%','38px']]) +
    skSection([['45%','120px'],['60%','38px'],['50%','120px']]);
}

function init() {
  app.innerHTML = fullPageLoader('Loading');
  api('/me').then(function(data) {
    if (!data || !data.user) { window.location.href = '/dashboard/login'; return; }
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
        '<a href="/dashboard/logout?switch=1" class="user-menu-item">Switch Account</a>' +
        '<a href="/dashboard/logout" class="user-menu-item user-menu-item-danger">Sign Out</a>' +
        '</div></div>';
    }
    var savedGuildId = getSavedGuildId();
    if (savedGuildId && guilds.find(function(g) { return g.id === savedGuildId; })) {
      var savedSection = getSavedSection();
      selectServer(savedGuildId, savedSection);
    } else {
      clearSession();
      renderServerSelect();
    }
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
  currentGuild = null;
  pendingChanges = {};
  clearSession();
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
  app.innerHTML = fullPageLoader('Loading server');
  Promise.all([
    api('/guild/' + guildId),
    fetch('/api/public/features').then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; })
  ]).then(function(results) {
    var data = results[0];
    featureFlags = results[1] || {};
    if (!data) { clearSession(); renderServerSelect(); return; }
    currentGuild = data;
    pendingChanges = {};
    saveSession(guildId, section || null);
    if (section) {
      renderSettings(section);
    } else {
      renderDashboard();
    }
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
    { id: 'staff',        label: 'Staff Management' },
  ]},
  { title: 'Community', items: [
    { id: 'tickets',     label: 'Ticket Support' },
    { id: 'welcome',     label: 'Welcome System' },
    { id: 'rolerequest', label: 'Role Request' },
    { id: 'moveme',      label: 'Voice Mover' },
  ]},
  { title: 'Economy', items: [
    { id: 'economy',     label: 'Economy' },
    { id: 'civjobs',     label: 'Civilian Jobs' },
  ]},
  { title: 'Advanced', items: [
    { id: 'dispatch',    label: 'AI Voice Dispatch' },
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
    { title: 'Moderation',            keys: ['strike', 'verification', 'antipromote'] },
    { title: 'Community',             keys: ['ticket', 'rolerequest', 'welcome', 'moveme'] },
    { title: 'Economy',               keys: ['economy'] },
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
    { id: 'dispatch',     label: 'AI Voice Dispatch',  desc: 'Voice + AI (Premium)',           featureKey: 'dispatchEnabled' },
    { id: 'moveme',       label: 'Voice Mover',        desc: 'Self-move panel for members',    featureKey: 'movemeEnabled' },
    { id: 'civjobs',      label: 'Civilian Jobs',      desc: 'Job board, roles, shift hours',  featureKey: null },
    { id: 'staff',        label: 'Staff Management',   desc: 'Staff roles and users',          featureKey: null },
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

function cancelSubscription() {
  if (!confirm('Cancel your monthly subscription? Premium stays active until the end of the current billing period - no refunds are issued.')) return;
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
    '</div></div></div></div>';
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

    var planLabel = data.plan === 'monthly' ? 'Monthly' : data.plan === 'lifetime' ? 'Lifetime' : 'Manual / Gifted';
    var statusColor = data.status === 'active' ? 'var(--green)' : data.status === 'cancelling' ? '#fbbf24' : 'var(--text-muted)';
    var statusText = data.status === 'active' ? 'Active' : data.status === 'cancelling' ? 'Cancelling' : data.status || 'Active';

    var periodRow = '';
    if (data.currentPeriodEnd) {
      var pEnd = new Date(data.currentPeriodEnd);
      var pLabel = data.status === 'cancelling' ? 'Access ends' : (data.plan === 'monthly' ? 'Next renewal' : 'Valid through');
      periodRow = billingRow(pLabel, pEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    }

    var activatedRow = data.activatedAt
      ? billingRow('Activated on server', new Date(data.activatedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
      : '';

    var purchasedRow = data.purchasedAt
      ? billingRow('Purchase date', new Date(data.purchasedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
      : '';

    var cancelBtn = '';
    if (data.hasStripeSubscription && data.plan === 'monthly') {
      if (data.status === 'cancelling') {
        cancelBtn = '<button id="reactivate-sub-btn" class="btn btn-primary btn-sm" style="margin-top:16px;" onclick="reactivateSubscription()">Reactivate Subscription</button>';
      } else if (data.status === 'active') {
        cancelBtn = '<button id="cancel-sub-btn" class="btn btn-secondary btn-sm" style="margin-top:16px;color:var(--red);border-color:rgba(239,68,68,0.3);" onclick="cancelSubscription()">Cancel Subscription</button>';
      }
    }

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
      cancelBtn +
      '</div>' +
      invoiceHtml +
      '</div></div>';

    app.innerHTML = html;
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
    }
  });
}

/* ── Settings Page ── */
function renderSettings(mod) {
  if (currentGuild) saveSession(currentGuild.id, mod);
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar(mod) +
    '<div class="dashboard-content">' + settingsSkeletonLoader() + '</div></div>';

  api('/guild/' + currentGuild.id + '/settings/' + mod).then(function(data) {
    if (!data) { app.innerHTML = '<div class="dashboard-layout">' + renderSidebar(mod) + '<div class="dashboard-content"><div style="color:var(--text-muted);font-size:13px;padding-top:20px;">Failed to load settings. Please try again.</div><button class="btn btn-secondary btn-sm" style="margin-top:10px;" onclick="renderSettings(\'' + mod + '\')">Retry</button></div></div>'; return; }
    pendingChanges = {};

    var html = '<div class="dashboard-layout">' + renderSidebar(mod) +
      '<div class="dashboard-content" id="settings-content">' +
      sidebarToggleBtn('Menu') +
      '<div class="mobile-back" onclick="closeSidebar();renderDashboard()">&#8249; Back to Overview</div>' +
      '<div class="dash-header"><h1>' + esc(data.name) + '</h1><p>' + esc(data.description) + '</p></div>';

    if (data.premium) {
      html += '<div style="background:var(--amber-bg);border:1px solid rgba(251,191,36,0.2);border-radius:var(--radius);padding:12px 16px;margin-bottom:14px;font-size:13px;color:var(--amber);display:flex;align-items:center;gap:8px;">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        'Premium feature - requires an active premium key on this server.' +
        (!currentGuild.premium ? ' <a href="#" onclick="renderDashboard();setTimeout(function(){var s=document.getElementById(\'premium-section\');if(s)s.scrollIntoView({behavior:\'smooth\'})},200);return false;" style="color:var(--blue);text-decoration:underline;margin-left:4px;">Activate Premium</a>' : '') +
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
    } else if (mod === 'staff') {
      html += renderStaffSettings(data);
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
    else if (r && r.error) toast(r.error);
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
    html += '<div class="config-row"><span class="config-sublabel">No ticket types yet. Add one below \u2014 each type becomes a button on the ticket panel.</span></div>';
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
  html += '<div id="ticket-panel-picker" style="display:none;"></div>';
  return html;
}

function showTicketPanelPicker(types) {
  var picker = document.getElementById('ticket-panel-picker');
  if (!picker) return;
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
  document.querySelectorAll('.ticket-type-check').forEach(function(b) { b.checked = checked; });
}

function confirmSendTicketPanel() {
  var selectedIds = [];
  document.querySelectorAll('.ticket-type-check').forEach(function(b) { if (b.checked) selectedIds.push(b.value); });
  if (!selectedIds.length) { toast('Select at least one ticket type', 'error'); return; }
  var btn = document.getElementById('send-panel-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  api('/guild/' + currentGuild.id + '/settings/tickets/panel/send', {
    method: 'POST',
    body: JSON.stringify({ typeIds: selectedIds })
  }).then(function(r) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Panel'; }
    if (r && r.success) {
      toast('Panel sent with ' + selectedIds.length + ' type' + (selectedIds.length === 1 ? '' : 's'));
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
  api('/guild/' + currentGuild.id + '/settings/tickets/types', {
    method: 'POST',
    body: JSON.stringify({ label: label, buttonColor: color, allowedRoleIds: roleId ? [roleId] : [] })
  }).then(function(r) {
    if (r && r.success) { toast('Ticket type added'); renderSettings('tickets'); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteTicketType(typeId) {
  if (!confirm('Remove this ticket type?')) return;
  api('/guild/' + currentGuild.id + '/settings/tickets/types/' + typeId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Ticket type removed'); renderSettings('tickets'); }
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
  var roleId = document.getElementById('rr-role')?.value;
  var approverId = document.getElementById('rr-approver')?.value || null;
  if (!roleId) { toast('Select a role to make requestable', 'error'); return; }
  api('/guild/' + currentGuild.id + '/rolerequest/roles', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, approverRoleIds: approverId ? [approverId] : [] })
  }).then(function(r) {
    if (r && r.success) { toast('Role added'); renderSettings('rolerequest'); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteRoleRequest(roleId) {
  if (!confirm('Remove this role from the request list?')) return;
  api('/guild/' + currentGuild.id + '/rolerequest/roles/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role removed'); renderSettings('rolerequest'); }
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
  var day = document.getElementById('cal-day')?.value;
  var time = document.getElementById('cal-time')?.value?.trim() || '';
  var tz = document.getElementById('cal-tz')?.value?.trim() || 'ET';
  var desc = document.getElementById('cal-desc')?.value?.trim();
  var person = document.getElementById('cal-person')?.value?.trim() || '';
  if (!desc) { toast('Enter an event description', 'error'); return; }
  api('/guild/' + currentGuild.id + '/settings/calendar/events', {
    method: 'POST',
    body: JSON.stringify({ day: day, time: time, timezone: tz, description: desc, person: person })
  }).then(function(r) {
    if (r && r.success) { toast('Event added'); renderSettings('calendar'); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteCalendarEvent(eventId) {
  if (!confirm('Remove this event?')) return;
  api('/guild/' + currentGuild.id + '/settings/calendar/events/' + eventId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Event removed'); renderSettings('calendar'); }
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
  var link = document.getElementById('wl-link')?.value?.trim();
  if (!link) { toast('Enter an invite link', 'error'); return; }
  api('/guild/' + currentGuild.id + '/settings/antipromo/links', {
    method: 'POST',
    body: JSON.stringify({ link: link })
  }).then(function(r) {
    if (r && r.success) { toast('Link whitelisted'); renderSettings('antipromo'); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteWhitelistedLink(link) {
  if (!confirm('Remove "' + link + '" from whitelist?')) return;
  api('/guild/' + currentGuild.id + '/settings/antipromo/links', {
    method: 'DELETE',
    body: JSON.stringify({ link: link })
  }).then(function(r) {
    if (r && r.success) { toast('Link removed'); renderSettings('antipromo'); }
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
  var riLimit = currentGuild.premium ? Infinity : 2;
  var riLimitLabel = currentGuild.premium ? '∞' : '2';
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
      '<span class="config-sublabel">Role → amount earned → cooldown in hours</span>' +
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

  /* ── Business Accounts ── */
  var businesses = data.businessAccounts || [];
  if (businesses.length > 0) {
    html += '<div class="config-section" style="margin-top:4px;">' +
      '<div class="config-section-header"><h3>Business Accounts</h3>' +
      '<span style="font-size:11px;color:var(--text-dim);">' + businesses.length + ' account(s)</span></div>';
    businesses.forEach(function(b) {
      var sym = (data.fields || []).find(function(f) { return f.key === 'currencySymbol'; });
      var symVal = sym ? (sym.value || '
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

  return html;
}


function grantBusinessIncome(accountId, name) {
  if (!currentGuild) return;
  if (!confirm('Grant one period of passive income to ' + name + '? This does not affect the automatic cooldown.')) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/business/' + accountId + '/grant-income', { method: 'POST' }).then(function(r) {
    if (r && r.success) { toast('Income granted to ' + name); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}
function deleteRoleIncome(roleId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/roleincome/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role income removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

function addRoleIncome() {
  var roleId = document.getElementById('ri-role')?.value;
  var amount = document.getElementById('ri-amount')?.value;
  var cooldown = document.getElementById('ri-cooldown')?.value || '24';
  if (!roleId) { toast('Select a role'); return; }
  if (!amount || Number(amount) <= 0) { toast('Enter a valid amount'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/roleincome', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, amount: Number(amount), cooldown: Number(cooldown) })
  }).then(function(r) {
    if (r && r.success) { toast('Role income added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) { toast(r.error); }
  });
}

function deleteStoreItem(itemId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/store/' + itemId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Item removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

function addStoreItem() {
  var name = document.getElementById('store-name')?.value?.trim();
  var price = document.getElementById('store-price')?.value;
  var desc = document.getElementById('store-desc')?.value?.trim() || '';
  var roleId = document.getElementById('store-role')?.value || null;
  var requiredRoleId = document.getElementById('store-required-role')?.value || null;
  var usable = document.getElementById('store-usable')?.checked || false;
  var sellable = document.getElementById('store-sellable') ? document.getElementById('store-sellable').checked : true;
  if (!name) { toast('Item name is required'); return; }
  if (price === '' || price === undefined || isNaN(Number(price))) { toast('Enter a valid price'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/store', {
    method: 'POST',
    body: JSON.stringify({ name: name, price: Number(price), description: desc, usable: usable, sellable: sellable, roleId: roleId || null, requiredRoleId: requiredRoleId || null })
  }).then(function(r) {
    if (r && r.success) { toast('Item added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) { toast(r.error); }
  });
}

function addRoleDeduction() {
  var roleId = document.getElementById('rd-role')?.value;
  var amount = document.getElementById('rd-amount')?.value;
  var label = document.getElementById('rd-label')?.value?.trim() || 'Deduction';
  if (!roleId) { toast('Select a role'); return; }
  if (!amount || Number(amount) <= 0) { toast('Enter a valid amount'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/rolededuction', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, amount: Number(amount), label: label })
  }).then(function(r) {
    if (r && r.success) { toast('Role deduction added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error);
  });
}

function deleteRoleDeduction(roleId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/rolededuction/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role deduction removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

/* ── Voice Mover Settings ── */
window._movemeState = { allowedChannelIds: [] };

function renderMovemeSettings(data) {
  var fields = data.fields || [];
  window._movemeState.allowedChannelIds = (data.allowedChannelIds || []).slice();

  var html = '<div class="config-section"><div class="config-section-header"><h3>Settings</h3></div>';
  fields.forEach(function(field) { html += renderOneField(field, 'moveme'); });
  html += '</div>';

  html += '<div id="save-bar-container"></div>';

  var voiceOpts = (data.voiceChannels || []).map(function(c) {
    return '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>';
  }).join('');

  var allowedTags = (data.allowedChannelIds || []).map(function(id) {
    var ch = (data.voiceChannels || []).find(function(c) { return c.value === id; });
    var name = ch ? ch.label : id;
    return '<span class="channel-tag">' + esc(name) +
      '<button class="channel-tag-remove" onclick="removeMovemeChannel(\'' + esc(id) + '\')" title="Remove">&#x2715;</button></span>';
  }).join('');

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Allowed Voice Channels</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Only these channels appear in the mover panel</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="moveme-channel-tags">' +
    (allowedTags || '<span style="font-size:12px;color:var(--text-dim);">No channels added - all voice channels will show if left empty.</span>') +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="moveme-channel-select"><option value="">Select a voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addMovemeChannel()">Add</button>' +
    '</div>' +
    '</div>' +
    '</div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Voice Mover Panel</h3>' +
    '<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="sendMovemePanel(event)">Send Panel to Discord</button>' +
    '</div>' +
    '<div class="config-row"><span class="config-sublabel">Posts a voice channel selector embed to the configured Panel Channel. Members must already be in a voice channel to use it. Run this after setting and saving the channel above.</span></div>' +
    (data.panelChannelId
      ? '<div class="config-row"><span style="font-size:12px;color:var(--text-dim);">Current panel channel: <code>' + esc(data.panelChannelId) + '</code>' + (data.panelMessageId ? ' - panel exists' : ' - no panel sent yet') + '</span></div>'
      : '<div class="config-row"><span style="font-size:12px;color:var(--amber);">Save a Panel Channel above before sending the panel.</span></div>') +
    '</div>';

  return html;
}

function addMovemeChannel() {
  var sel = document.getElementById('moveme-channel-select');
  if (!sel || !sel.value) { toast('Select a voice channel first', 'error'); return; }
  var id = sel.value;
  var label = sel.options[sel.selectedIndex].text;
  if (window._movemeState.allowedChannelIds.indexOf(id) !== -1) { toast('Already added', 'error'); return; }
  window._movemeState.allowedChannelIds.push(id);
  pendingChanges['allowedChannelIds'] = window._movemeState.allowedChannelIds.slice();
  var tagsEl = document.getElementById('moveme-channel-tags');
  if (tagsEl) {
    var emptySpan = tagsEl.querySelector('span[style]');
    if (emptySpan) tagsEl.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'channel-tag';
    span.innerHTML = esc(label) + '<button class="channel-tag-remove" onclick="removeMovemeChannel(\'' + esc(id) + '\')" title="Remove">&#x2715;</button>';
    tagsEl.appendChild(span);
  }
  sel.value = '';
  showSaveBar('moveme');
}

function removeMovemeChannel(id) {
  window._movemeState.allowedChannelIds = window._movemeState.allowedChannelIds.filter(function(x) { return x !== id; });
  pendingChanges['allowedChannelIds'] = window._movemeState.allowedChannelIds.slice();
  var tagsEl = document.getElementById('moveme-channel-tags');
  if (tagsEl) {
    var tags = tagsEl.querySelectorAll('.channel-tag');
    tags.forEach(function(tag) {
      var btn = tag.querySelector('.channel-tag-remove');
      if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf('\'' + id + '\'') !== -1) {
        tag.remove();
      }
    });
    if (tagsEl.querySelectorAll('.channel-tag').length === 0) {
      tagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">No channels added - all voice channels will show if left empty.</span>';
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
  });
}

/* ── Civilian Jobs Settings ── */
function renderCivJobsSettings(data) {
  var fields = data.fields || [];
  var html = '<div class="config-section"><div class="config-section-header"><h3>Job Board Channel</h3></div>';
  fields.forEach(function(field) { html += renderOneField(field, 'civjobs'); });
  html += '</div>';
  html += '<div id="save-bar-container"></div>';

  var roles = data.roles || [];
  var jobs = data.jobs || [];

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Civilian Jobs</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + jobs.length + ' job(s)</span></div>';

  if (jobs.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No jobs configured yet. Add one below.</span></div>';
  } else {
    jobs.forEach(function(j) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(j.name) + ' - @' + esc(j.roleName) + '</span>' +
        '<div class="config-sublabel">' +
        (j.description ? esc(j.description) + ' | ' : '') +
        'Shift: ' + esc(String(j.durationHours)) + 'h' +
        '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteCivJob(\'' + esc(j.jobId) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<input id="cj-name" type="text" class="config-input" placeholder="Job name" style="flex:2;min-width:120px;">' +
    '<select id="cj-role" class="config-select" style="flex:1;min-width:140px;"><option value="">Assign role...</option>' +
    roles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<input id="cj-hours" type="number" class="config-input" placeholder="Hours" min="0.1" step="0.5" style="width:90px;">' +
    '</div>' +
    '<input id="cj-desc" type="text" class="config-input" placeholder="Description (optional)" style="width:100%;">' +
    '<button class="btn btn-success btn-sm" onclick="addCivJob()">Add Job</button>' +
    '</div>' +
    '</div>';

  return html;
}

function addCivJob() {
  if (!currentGuild) return;
  var name = document.getElementById('cj-name')?.value?.trim();
  var roleId = document.getElementById('cj-role')?.value;
  var hours = document.getElementById('cj-hours')?.value;
  var desc = document.getElementById('cj-desc')?.value?.trim() || '';
  if (!name) { toast('Job name is required', 'error'); return; }
  if (!roleId) { toast('Select a role', 'error'); return; }
  if (!hours || Number(hours) <= 0) { toast('Enter a valid shift duration', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/civjobs/job', {
    method: 'POST',
    body: JSON.stringify({ name: name, description: desc, roleId: roleId, durationHours: Number(hours) })
  }).then(function(r) {
    if (r && r.success) { toast('Job added'); renderSettings('civjobs'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteCivJob(jobId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/civjobs/job/' + jobId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Job removed'); renderSettings('civjobs'); restoreDashScrollPos(scrollPos); }
  });
}

/* ── Staff Management Settings ── */
function renderStaffSettings(data) {
  var roles = data.roles || [];
  var staffRoles = data.staffRoles || [];
  var staffUsers = data.staffUsers || [];

  var html = '';

  html += '<div class="config-section">' +
    '<div class="config-section-header"><h3>Staff Roles</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + staffRoles.length + ' role(s)</span></div>';

  if (staffRoles.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No staff roles added. Members with these roles will have staff-level bot permissions.</span></div>';
  } else {
    staffRoles.forEach(function(s) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">@' + esc(s.roleName) + '</span>' +
        '<div class="config-sublabel">' + (s.position === 'manager' ? 'Manager' : 'Staff') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteStaffEntry(\'' + esc(s.id) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<select id="sr-role" class="config-select" style="flex:2;min-width:160px;"><option value="">Select role to add...</option>' +
    roles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<select id="sr-pos" class="config-select" style="width:130px;">' +
    '<option value="staff">Staff</option>' +
    '<option value="manager">Manager</option>' +
    '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addStaffRole()">Add Role</button>' +
    '</div>' +
    '<span class="config-sublabel">Staff can use moderation commands. Managers inherit all staff permissions.</span>' +
    '</div>' +
    '</div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Staff Users</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + staffUsers.length + ' user(s)</span></div>';

  if (staffUsers.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No staff users added. Add individual users by their Discord user ID.</span></div>';
  } else {
    staffUsers.forEach(function(s) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(s.username) + '</span>' +
        '<div class="config-sublabel">User ID: ' + esc(s.userId) + ' - ' + (s.position === 'manager' ? 'Manager' : 'Staff') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteStaffEntry(\'' + esc(s.id) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<input id="su-id" type="text" class="config-input" placeholder="Discord user ID" style="flex:2;min-width:160px;">' +
    '<select id="su-pos" class="config-select" style="width:130px;">' +
    '<option value="staff">Staff</option>' +
    '<option value="manager">Manager</option>' +
    '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addStaffUser()">Add User</button>' +
    '</div>' +
    '<span class="config-sublabel">Right-click a Discord user and copy their User ID (Developer Mode must be enabled in Discord settings).</span>' +
    '</div>' +
    '</div>';

  return html;
}

function addStaffRole() {
  if (!currentGuild) return;
  var roleId = document.getElementById('sr-role')?.value;
  var position = document.getElementById('sr-pos')?.value || 'staff';
  if (!roleId) { toast('Select a role', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/add', {
    method: 'POST',
    body: JSON.stringify({ type: 'role', roleId: roleId, position: position })
  }).then(function(r) {
    if (r && r.success) { toast('Staff role added'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function addStaffUser() {
  if (!currentGuild) return;
  var userId = document.getElementById('su-id')?.value?.trim();
  var position = document.getElementById('su-pos')?.value || 'staff';
  if (!userId) { toast('Enter a user ID', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/add', {
    method: 'POST',
    body: JSON.stringify({ type: 'user', userId: userId, position: position })
  }).then(function(r) {
    if (r && r.success) { toast('Staff user added'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteStaffEntry(entryId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/' + entryId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Staff entry removed'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
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

function saveSettings(mod) {
  if (Object.keys(pendingChanges).length === 0) return;
  var saveBtn = document.querySelector('.save-bar .btn-success');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  var scrollPos = getDashScrollPos();
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
        restoreDashScrollPos(scrollPos);
      });
    } else {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
  });
}

init();
) : '
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

  return html;
}

function deleteRoleIncome(roleId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/roleincome/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role income removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

function addRoleIncome() {
  var roleId = document.getElementById('ri-role')?.value;
  var amount = document.getElementById('ri-amount')?.value;
  var cooldown = document.getElementById('ri-cooldown')?.value || '24';
  if (!roleId) { toast('Select a role'); return; }
  if (!amount || Number(amount) <= 0) { toast('Enter a valid amount'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/roleincome', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, amount: Number(amount), cooldown: Number(cooldown) })
  }).then(function(r) {
    if (r && r.success) { toast('Role income added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) { toast(r.error); }
  });
}

function deleteStoreItem(itemId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/store/' + itemId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Item removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

function addStoreItem() {
  var name = document.getElementById('store-name')?.value?.trim();
  var price = document.getElementById('store-price')?.value;
  var desc = document.getElementById('store-desc')?.value?.trim() || '';
  var roleId = document.getElementById('store-role')?.value || null;
  var requiredRoleId = document.getElementById('store-required-role')?.value || null;
  var usable = document.getElementById('store-usable')?.checked || false;
  var sellable = document.getElementById('store-sellable') ? document.getElementById('store-sellable').checked : true;
  if (!name) { toast('Item name is required'); return; }
  if (price === '' || price === undefined || isNaN(Number(price))) { toast('Enter a valid price'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/store', {
    method: 'POST',
    body: JSON.stringify({ name: name, price: Number(price), description: desc, usable: usable, sellable: sellable, roleId: roleId || null, requiredRoleId: requiredRoleId || null })
  }).then(function(r) {
    if (r && r.success) { toast('Item added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) { toast(r.error); }
  });
}

function addRoleDeduction() {
  var roleId = document.getElementById('rd-role')?.value;
  var amount = document.getElementById('rd-amount')?.value;
  var label = document.getElementById('rd-label')?.value?.trim() || 'Deduction';
  if (!roleId) { toast('Select a role'); return; }
  if (!amount || Number(amount) <= 0) { toast('Enter a valid amount'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/rolededuction', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, amount: Number(amount), label: label })
  }).then(function(r) {
    if (r && r.success) { toast('Role deduction added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error);
  });
}

function deleteRoleDeduction(roleId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/rolededuction/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role deduction removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

/* ── Voice Mover Settings ── */
window._movemeState = { allowedChannelIds: [] };

function renderMovemeSettings(data) {
  var fields = data.fields || [];
  window._movemeState.allowedChannelIds = (data.allowedChannelIds || []).slice();

  var html = '<div class="config-section"><div class="config-section-header"><h3>Settings</h3></div>';
  fields.forEach(function(field) { html += renderOneField(field, 'moveme'); });
  html += '</div>';

  html += '<div id="save-bar-container"></div>';

  var voiceOpts = (data.voiceChannels || []).map(function(c) {
    return '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>';
  }).join('');

  var allowedTags = (data.allowedChannelIds || []).map(function(id) {
    var ch = (data.voiceChannels || []).find(function(c) { return c.value === id; });
    var name = ch ? ch.label : id;
    return '<span class="channel-tag">' + esc(name) +
      '<button class="channel-tag-remove" onclick="removeMovemeChannel(\'' + esc(id) + '\')" title="Remove">&#x2715;</button></span>';
  }).join('');

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Allowed Voice Channels</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Only these channels appear in the mover panel</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="moveme-channel-tags">' +
    (allowedTags || '<span style="font-size:12px;color:var(--text-dim);">No channels added - all voice channels will show if left empty.</span>') +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="moveme-channel-select"><option value="">Select a voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addMovemeChannel()">Add</button>' +
    '</div>' +
    '</div>' +
    '</div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Voice Mover Panel</h3>' +
    '<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="sendMovemePanel(event)">Send Panel to Discord</button>' +
    '</div>' +
    '<div class="config-row"><span class="config-sublabel">Posts a voice channel selector embed to the configured Panel Channel. Members must already be in a voice channel to use it. Run this after setting and saving the channel above.</span></div>' +
    (data.panelChannelId
      ? '<div class="config-row"><span style="font-size:12px;color:var(--text-dim);">Current panel channel: <code>' + esc(data.panelChannelId) + '</code>' + (data.panelMessageId ? ' - panel exists' : ' - no panel sent yet') + '</span></div>'
      : '<div class="config-row"><span style="font-size:12px;color:var(--amber);">Save a Panel Channel above before sending the panel.</span></div>') +
    '</div>';

  return html;
}

function addMovemeChannel() {
  var sel = document.getElementById('moveme-channel-select');
  if (!sel || !sel.value) { toast('Select a voice channel first', 'error'); return; }
  var id = sel.value;
  var label = sel.options[sel.selectedIndex].text;
  if (window._movemeState.allowedChannelIds.indexOf(id) !== -1) { toast('Already added', 'error'); return; }
  window._movemeState.allowedChannelIds.push(id);
  pendingChanges['allowedChannelIds'] = window._movemeState.allowedChannelIds.slice();
  var tagsEl = document.getElementById('moveme-channel-tags');
  if (tagsEl) {
    var emptySpan = tagsEl.querySelector('span[style]');
    if (emptySpan) tagsEl.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'channel-tag';
    span.innerHTML = esc(label) + '<button class="channel-tag-remove" onclick="removeMovemeChannel(\'' + esc(id) + '\')" title="Remove">&#x2715;</button>';
    tagsEl.appendChild(span);
  }
  sel.value = '';
  showSaveBar('moveme');
}

function removeMovemeChannel(id) {
  window._movemeState.allowedChannelIds = window._movemeState.allowedChannelIds.filter(function(x) { return x !== id; });
  pendingChanges['allowedChannelIds'] = window._movemeState.allowedChannelIds.slice();
  var tagsEl = document.getElementById('moveme-channel-tags');
  if (tagsEl) {
    var tags = tagsEl.querySelectorAll('.channel-tag');
    tags.forEach(function(tag) {
      var btn = tag.querySelector('.channel-tag-remove');
      if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf('\'' + id + '\'') !== -1) {
        tag.remove();
      }
    });
    if (tagsEl.querySelectorAll('.channel-tag').length === 0) {
      tagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">No channels added - all voice channels will show if left empty.</span>';
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
  });
}

/* ── Civilian Jobs Settings ── */
function renderCivJobsSettings(data) {
  var fields = data.fields || [];
  var html = '<div class="config-section"><div class="config-section-header"><h3>Job Board Channel</h3></div>';
  fields.forEach(function(field) { html += renderOneField(field, 'civjobs'); });
  html += '</div>';
  html += '<div id="save-bar-container"></div>';

  var roles = data.roles || [];
  var jobs = data.jobs || [];

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Civilian Jobs</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + jobs.length + ' job(s)</span></div>';

  if (jobs.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No jobs configured yet. Add one below.</span></div>';
  } else {
    jobs.forEach(function(j) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(j.name) + ' - @' + esc(j.roleName) + '</span>' +
        '<div class="config-sublabel">' +
        (j.description ? esc(j.description) + ' | ' : '') +
        'Shift: ' + esc(String(j.durationHours)) + 'h' +
        '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteCivJob(\'' + esc(j.jobId) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<input id="cj-name" type="text" class="config-input" placeholder="Job name" style="flex:2;min-width:120px;">' +
    '<select id="cj-role" class="config-select" style="flex:1;min-width:140px;"><option value="">Assign role...</option>' +
    roles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<input id="cj-hours" type="number" class="config-input" placeholder="Hours" min="0.1" step="0.5" style="width:90px;">' +
    '</div>' +
    '<input id="cj-desc" type="text" class="config-input" placeholder="Description (optional)" style="width:100%;">' +
    '<button class="btn btn-success btn-sm" onclick="addCivJob()">Add Job</button>' +
    '</div>' +
    '</div>';

  return html;
}

function addCivJob() {
  if (!currentGuild) return;
  var name = document.getElementById('cj-name')?.value?.trim();
  var roleId = document.getElementById('cj-role')?.value;
  var hours = document.getElementById('cj-hours')?.value;
  var desc = document.getElementById('cj-desc')?.value?.trim() || '';
  if (!name) { toast('Job name is required', 'error'); return; }
  if (!roleId) { toast('Select a role', 'error'); return; }
  if (!hours || Number(hours) <= 0) { toast('Enter a valid shift duration', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/civjobs/job', {
    method: 'POST',
    body: JSON.stringify({ name: name, description: desc, roleId: roleId, durationHours: Number(hours) })
  }).then(function(r) {
    if (r && r.success) { toast('Job added'); renderSettings('civjobs'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteCivJob(jobId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/civjobs/job/' + jobId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Job removed'); renderSettings('civjobs'); restoreDashScrollPos(scrollPos); }
  });
}

/* ── Staff Management Settings ── */
function renderStaffSettings(data) {
  var roles = data.roles || [];
  var staffRoles = data.staffRoles || [];
  var staffUsers = data.staffUsers || [];

  var html = '';

  html += '<div class="config-section">' +
    '<div class="config-section-header"><h3>Staff Roles</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + staffRoles.length + ' role(s)</span></div>';

  if (staffRoles.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No staff roles added. Members with these roles will have staff-level bot permissions.</span></div>';
  } else {
    staffRoles.forEach(function(s) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">@' + esc(s.roleName) + '</span>' +
        '<div class="config-sublabel">' + (s.position === 'manager' ? 'Manager' : 'Staff') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteStaffEntry(\'' + esc(s.id) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<select id="sr-role" class="config-select" style="flex:2;min-width:160px;"><option value="">Select role to add...</option>' +
    roles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<select id="sr-pos" class="config-select" style="width:130px;">' +
    '<option value="staff">Staff</option>' +
    '<option value="manager">Manager</option>' +
    '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addStaffRole()">Add Role</button>' +
    '</div>' +
    '<span class="config-sublabel">Staff can use moderation commands. Managers inherit all staff permissions.</span>' +
    '</div>' +
    '</div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Staff Users</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + staffUsers.length + ' user(s)</span></div>';

  if (staffUsers.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No staff users added. Add individual users by their Discord user ID.</span></div>';
  } else {
    staffUsers.forEach(function(s) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(s.username) + '</span>' +
        '<div class="config-sublabel">User ID: ' + esc(s.userId) + ' - ' + (s.position === 'manager' ? 'Manager' : 'Staff') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteStaffEntry(\'' + esc(s.id) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<input id="su-id" type="text" class="config-input" placeholder="Discord user ID" style="flex:2;min-width:160px;">' +
    '<select id="su-pos" class="config-select" style="width:130px;">' +
    '<option value="staff">Staff</option>' +
    '<option value="manager">Manager</option>' +
    '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addStaffUser()">Add User</button>' +
    '</div>' +
    '<span class="config-sublabel">Right-click a Discord user and copy their User ID (Developer Mode must be enabled in Discord settings).</span>' +
    '</div>' +
    '</div>';

  return html;
}

function addStaffRole() {
  if (!currentGuild) return;
  var roleId = document.getElementById('sr-role')?.value;
  var position = document.getElementById('sr-pos')?.value || 'staff';
  if (!roleId) { toast('Select a role', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/add', {
    method: 'POST',
    body: JSON.stringify({ type: 'role', roleId: roleId, position: position })
  }).then(function(r) {
    if (r && r.success) { toast('Staff role added'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function addStaffUser() {
  if (!currentGuild) return;
  var userId = document.getElementById('su-id')?.value?.trim();
  var position = document.getElementById('su-pos')?.value || 'staff';
  if (!userId) { toast('Enter a user ID', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/add', {
    method: 'POST',
    body: JSON.stringify({ type: 'user', userId: userId, position: position })
  }).then(function(r) {
    if (r && r.success) { toast('Staff user added'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteStaffEntry(entryId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/' + entryId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Staff entry removed'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
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

function saveSettings(mod) {
  if (Object.keys(pendingChanges).length === 0) return;
  var saveBtn = document.querySelector('.save-bar .btn-success');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  var scrollPos = getDashScrollPos();
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
        restoreDashScrollPos(scrollPos);
      });
    } else {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
  });
}

init();
;
      html += '<div class="config-row" style="justify-content:space-between;flex-wrap:wrap;gap:8px;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(b.name) + '</span>' +
        '<div class="config-sublabel">' +
        'Balance: ' + symVal + esc(Number(b.balance).toLocaleString()) +
        (b.incomeAmount ? ' &mdash; Passive income: ' + symVal + esc(Number(b.incomeAmount).toLocaleString()) + ' every ' + esc(String(b.incomeCooldownHours)) + 'h' : '') +
        '</div>' +
        '</div>' +
        (b.incomeAmount
          ? '<button class="btn btn-secondary btn-sm" onclick="grantBusinessIncome(\'' + esc(b.accountId) + '\',\'' + esc(b.name) + '\')">Grant Income</button>'
          : '') +
        '</div>';
    });
    html += '</div>';
  }

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

  return html;
}

function deleteRoleIncome(roleId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/roleincome/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role income removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

function addRoleIncome() {
  var roleId = document.getElementById('ri-role')?.value;
  var amount = document.getElementById('ri-amount')?.value;
  var cooldown = document.getElementById('ri-cooldown')?.value || '24';
  if (!roleId) { toast('Select a role'); return; }
  if (!amount || Number(amount) <= 0) { toast('Enter a valid amount'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/roleincome', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, amount: Number(amount), cooldown: Number(cooldown) })
  }).then(function(r) {
    if (r && r.success) { toast('Role income added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) { toast(r.error); }
  });
}

function deleteStoreItem(itemId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/store/' + itemId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Item removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

function addStoreItem() {
  var name = document.getElementById('store-name')?.value?.trim();
  var price = document.getElementById('store-price')?.value;
  var desc = document.getElementById('store-desc')?.value?.trim() || '';
  var roleId = document.getElementById('store-role')?.value || null;
  var requiredRoleId = document.getElementById('store-required-role')?.value || null;
  var usable = document.getElementById('store-usable')?.checked || false;
  var sellable = document.getElementById('store-sellable') ? document.getElementById('store-sellable').checked : true;
  if (!name) { toast('Item name is required'); return; }
  if (price === '' || price === undefined || isNaN(Number(price))) { toast('Enter a valid price'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/store', {
    method: 'POST',
    body: JSON.stringify({ name: name, price: Number(price), description: desc, usable: usable, sellable: sellable, roleId: roleId || null, requiredRoleId: requiredRoleId || null })
  }).then(function(r) {
    if (r && r.success) { toast('Item added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) { toast(r.error); }
  });
}

function addRoleDeduction() {
  var roleId = document.getElementById('rd-role')?.value;
  var amount = document.getElementById('rd-amount')?.value;
  var label = document.getElementById('rd-label')?.value?.trim() || 'Deduction';
  if (!roleId) { toast('Select a role'); return; }
  if (!amount || Number(amount) <= 0) { toast('Enter a valid amount'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/rolededuction', {
    method: 'POST',
    body: JSON.stringify({ roleId: roleId, amount: Number(amount), label: label })
  }).then(function(r) {
    if (r && r.success) { toast('Role deduction added'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error);
  });
}

function deleteRoleDeduction(roleId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/economy/rolededuction/' + roleId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Role deduction removed'); renderSettings('economy'); restoreDashScrollPos(scrollPos); }
  });
}

/* ── Voice Mover Settings ── */
window._movemeState = { allowedChannelIds: [] };

function renderMovemeSettings(data) {
  var fields = data.fields || [];
  window._movemeState.allowedChannelIds = (data.allowedChannelIds || []).slice();

  var html = '<div class="config-section"><div class="config-section-header"><h3>Settings</h3></div>';
  fields.forEach(function(field) { html += renderOneField(field, 'moveme'); });
  html += '</div>';

  html += '<div id="save-bar-container"></div>';

  var voiceOpts = (data.voiceChannels || []).map(function(c) {
    return '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>';
  }).join('');

  var allowedTags = (data.allowedChannelIds || []).map(function(id) {
    var ch = (data.voiceChannels || []).find(function(c) { return c.value === id; });
    var name = ch ? ch.label : id;
    return '<span class="channel-tag">' + esc(name) +
      '<button class="channel-tag-remove" onclick="removeMovemeChannel(\'' + esc(id) + '\')" title="Remove">&#x2715;</button></span>';
  }).join('');

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Allowed Voice Channels</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Only these channels appear in the mover panel</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="moveme-channel-tags">' +
    (allowedTags || '<span style="font-size:12px;color:var(--text-dim);">No channels added - all voice channels will show if left empty.</span>') +
    '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="moveme-channel-select"><option value="">Select a voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addMovemeChannel()">Add</button>' +
    '</div>' +
    '</div>' +
    '</div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Voice Mover Panel</h3>' +
    '<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="sendMovemePanel(event)">Send Panel to Discord</button>' +
    '</div>' +
    '<div class="config-row"><span class="config-sublabel">Posts a voice channel selector embed to the configured Panel Channel. Members must already be in a voice channel to use it. Run this after setting and saving the channel above.</span></div>' +
    (data.panelChannelId
      ? '<div class="config-row"><span style="font-size:12px;color:var(--text-dim);">Current panel channel: <code>' + esc(data.panelChannelId) + '</code>' + (data.panelMessageId ? ' - panel exists' : ' - no panel sent yet') + '</span></div>'
      : '<div class="config-row"><span style="font-size:12px;color:var(--amber);">Save a Panel Channel above before sending the panel.</span></div>') +
    '</div>';

  return html;
}

function addMovemeChannel() {
  var sel = document.getElementById('moveme-channel-select');
  if (!sel || !sel.value) { toast('Select a voice channel first', 'error'); return; }
  var id = sel.value;
  var label = sel.options[sel.selectedIndex].text;
  if (window._movemeState.allowedChannelIds.indexOf(id) !== -1) { toast('Already added', 'error'); return; }
  window._movemeState.allowedChannelIds.push(id);
  pendingChanges['allowedChannelIds'] = window._movemeState.allowedChannelIds.slice();
  var tagsEl = document.getElementById('moveme-channel-tags');
  if (tagsEl) {
    var emptySpan = tagsEl.querySelector('span[style]');
    if (emptySpan) tagsEl.innerHTML = '';
    var span = document.createElement('span');
    span.className = 'channel-tag';
    span.innerHTML = esc(label) + '<button class="channel-tag-remove" onclick="removeMovemeChannel(\'' + esc(id) + '\')" title="Remove">&#x2715;</button>';
    tagsEl.appendChild(span);
  }
  sel.value = '';
  showSaveBar('moveme');
}

function removeMovemeChannel(id) {
  window._movemeState.allowedChannelIds = window._movemeState.allowedChannelIds.filter(function(x) { return x !== id; });
  pendingChanges['allowedChannelIds'] = window._movemeState.allowedChannelIds.slice();
  var tagsEl = document.getElementById('moveme-channel-tags');
  if (tagsEl) {
    var tags = tagsEl.querySelectorAll('.channel-tag');
    tags.forEach(function(tag) {
      var btn = tag.querySelector('.channel-tag-remove');
      if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf('\'' + id + '\'') !== -1) {
        tag.remove();
      }
    });
    if (tagsEl.querySelectorAll('.channel-tag').length === 0) {
      tagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">No channels added - all voice channels will show if left empty.</span>';
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
  });
}

/* ── Civilian Jobs Settings ── */
function renderCivJobsSettings(data) {
  var fields = data.fields || [];
  var html = '<div class="config-section"><div class="config-section-header"><h3>Job Board Channel</h3></div>';
  fields.forEach(function(field) { html += renderOneField(field, 'civjobs'); });
  html += '</div>';
  html += '<div id="save-bar-container"></div>';

  var roles = data.roles || [];
  var jobs = data.jobs || [];

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Civilian Jobs</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + jobs.length + ' job(s)</span></div>';

  if (jobs.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No jobs configured yet. Add one below.</span></div>';
  } else {
    jobs.forEach(function(j) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(j.name) + ' - @' + esc(j.roleName) + '</span>' +
        '<div class="config-sublabel">' +
        (j.description ? esc(j.description) + ' | ' : '') +
        'Shift: ' + esc(String(j.durationHours)) + 'h' +
        '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteCivJob(\'' + esc(j.jobId) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<input id="cj-name" type="text" class="config-input" placeholder="Job name" style="flex:2;min-width:120px;">' +
    '<select id="cj-role" class="config-select" style="flex:1;min-width:140px;"><option value="">Assign role...</option>' +
    roles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<input id="cj-hours" type="number" class="config-input" placeholder="Hours" min="0.1" step="0.5" style="width:90px;">' +
    '</div>' +
    '<input id="cj-desc" type="text" class="config-input" placeholder="Description (optional)" style="width:100%;">' +
    '<button class="btn btn-success btn-sm" onclick="addCivJob()">Add Job</button>' +
    '</div>' +
    '</div>';

  return html;
}

function addCivJob() {
  if (!currentGuild) return;
  var name = document.getElementById('cj-name')?.value?.trim();
  var roleId = document.getElementById('cj-role')?.value;
  var hours = document.getElementById('cj-hours')?.value;
  var desc = document.getElementById('cj-desc')?.value?.trim() || '';
  if (!name) { toast('Job name is required', 'error'); return; }
  if (!roleId) { toast('Select a role', 'error'); return; }
  if (!hours || Number(hours) <= 0) { toast('Enter a valid shift duration', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/civjobs/job', {
    method: 'POST',
    body: JSON.stringify({ name: name, description: desc, roleId: roleId, durationHours: Number(hours) })
  }).then(function(r) {
    if (r && r.success) { toast('Job added'); renderSettings('civjobs'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteCivJob(jobId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/civjobs/job/' + jobId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Job removed'); renderSettings('civjobs'); restoreDashScrollPos(scrollPos); }
  });
}

/* ── Staff Management Settings ── */
function renderStaffSettings(data) {
  var roles = data.roles || [];
  var staffRoles = data.staffRoles || [];
  var staffUsers = data.staffUsers || [];

  var html = '';

  html += '<div class="config-section">' +
    '<div class="config-section-header"><h3>Staff Roles</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + staffRoles.length + ' role(s)</span></div>';

  if (staffRoles.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No staff roles added. Members with these roles will have staff-level bot permissions.</span></div>';
  } else {
    staffRoles.forEach(function(s) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">@' + esc(s.roleName) + '</span>' +
        '<div class="config-sublabel">' + (s.position === 'manager' ? 'Manager' : 'Staff') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteStaffEntry(\'' + esc(s.id) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<select id="sr-role" class="config-select" style="flex:2;min-width:160px;"><option value="">Select role to add...</option>' +
    roles.map(function(r) { return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>'; }).join('') +
    '</select>' +
    '<select id="sr-pos" class="config-select" style="width:130px;">' +
    '<option value="staff">Staff</option>' +
    '<option value="manager">Manager</option>' +
    '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addStaffRole()">Add Role</button>' +
    '</div>' +
    '<span class="config-sublabel">Staff can use moderation commands. Managers inherit all staff permissions.</span>' +
    '</div>' +
    '</div>';

  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Staff Users</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + staffUsers.length + ' user(s)</span></div>';

  if (staffUsers.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No staff users added. Add individual users by their Discord user ID.</span></div>';
  } else {
    staffUsers.forEach(function(s) {
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">' + esc(s.username) + '</span>' +
        '<div class="config-sublabel">User ID: ' + esc(s.userId) + ' - ' + (s.position === 'manager' ? 'Manager' : 'Staff') + '</div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteStaffEntry(\'' + esc(s.id) + '\')">Remove</button>' +
        '</div>';
    });
  }

  html += '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;">' +
    '<input id="su-id" type="text" class="config-input" placeholder="Discord user ID" style="flex:2;min-width:160px;">' +
    '<select id="su-pos" class="config-select" style="width:130px;">' +
    '<option value="staff">Staff</option>' +
    '<option value="manager">Manager</option>' +
    '</select>' +
    '<button class="btn btn-success btn-sm" onclick="addStaffUser()">Add User</button>' +
    '</div>' +
    '<span class="config-sublabel">Right-click a Discord user and copy their User ID (Developer Mode must be enabled in Discord settings).</span>' +
    '</div>' +
    '</div>';

  return html;
}

function addStaffRole() {
  if (!currentGuild) return;
  var roleId = document.getElementById('sr-role')?.value;
  var position = document.getElementById('sr-pos')?.value || 'staff';
  if (!roleId) { toast('Select a role', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/add', {
    method: 'POST',
    body: JSON.stringify({ type: 'role', roleId: roleId, position: position })
  }).then(function(r) {
    if (r && r.success) { toast('Staff role added'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function addStaffUser() {
  if (!currentGuild) return;
  var userId = document.getElementById('su-id')?.value?.trim();
  var position = document.getElementById('su-pos')?.value || 'staff';
  if (!userId) { toast('Enter a user ID', 'error'); return; }
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/add', {
    method: 'POST',
    body: JSON.stringify({ type: 'user', userId: userId, position: position })
  }).then(function(r) {
    if (r && r.success) { toast('Staff user added'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
    else if (r && r.error) toast(r.error, 'error');
  });
}

function deleteStaffEntry(entryId) {
  if (!currentGuild) return;
  var scrollPos = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/staff/' + entryId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Staff entry removed'); renderSettings('staff'); restoreDashScrollPos(scrollPos); }
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

function saveSettings(mod) {
  if (Object.keys(pendingChanges).length === 0) return;
  var saveBtn = document.querySelector('.save-bar .btn-success');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  var scrollPos = getDashScrollPos();
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
        restoreDashScrollPos(scrollPos);
      });
    } else {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
  });
}

init();
