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
          toast('Premium required — activate a key in the Premium section below.', 'error');
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

/* ── Init ── */
function init() {
  app.innerHTML = '<div class="login-page"><div style="color:var(--text-muted);font-size:14px;">Loading...</div></div>';
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
    renderServerSelect();
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

function selectServer(guildId) {
  app.innerHTML = '<div class="login-page"><div style="color:var(--text-muted);font-size:14px;">Loading server...</div></div>';
  Promise.all([
    api('/guild/' + guildId),
    fetch('/api/public/features').then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; })
  ]).then(function(results) {
    var data = results[0];
    featureFlags = results[1] || {};
    if (!data) { renderServerSelect(); return; }
    currentGuild = data;
    pendingChanges = {};
    renderDashboard();
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
  { key: 'roleRequestEnabled',  feature: 'rolerequest',   name: 'Role Request',      icon: 'RR',  desc: 'Self-serve role requests',        mod: null },
  { key: 'verifyEnabled',       feature: 'verification',  name: 'Verification',      icon: 'ID',  desc: 'Member verification gate',        mod: 'verification' },
  { key: 'welcomeEnabled',      feature: 'welcome',       name: 'Welcome System',    icon: 'WEL', desc: 'New member messages',             mod: 'welcome' },
  { key: 'dispatchEnabled',     feature: 'dispatch',      name: 'AI Voice Dispatch', icon: 'AI',  desc: 'AI-powered voice dispatch',       mod: 'dispatch' },
  { key: 'economyEnabled',      feature: 'economy',       name: 'Economy',           icon: '$',   desc: 'Currency, work, crime, gambling', mod: 'economy' },
];

var SIDEBAR_MODULES = [
  { id: 'general',       label: 'General Settings' },
  { id: 'roleplay',      label: 'Roleplay Commands' },
  { id: 'verification',  label: 'Verification' },
  { id: 'strikes',       label: 'Strike System' },
  { id: 'tickets',       label: 'Ticket Support' },
  { id: 'dispatch',      label: 'AI Voice Dispatch' },
  { id: 'priority',      label: 'Priority Tracker' },
  { id: 'antipromo',     label: 'Anti-Promoting' },
  { id: 'welcome',       label: 'Welcome System' },
  { id: 'calendar',      label: 'RP Calendar' },
  { id: 'economy',       label: 'Economy' },
];

/* ── Sidebar HTML ── */
function renderSidebar(active) {
  return '<div class="sidebar" id="main-sidebar">' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Server</div>' +
    '<div class="sidebar-item ' + (active === 'overview' ? 'active' : '') + '" onclick="closeSidebar();renderDashboard()">Overview</div>' +
    '<div class="sidebar-item" onclick="closeSidebar();renderServerSelect()">Switch Server</div>' +
    '</div>' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Modules</div>' +
    SIDEBAR_MODULES.map(function(m) {
      return '<div class="sidebar-item ' + (active === m.id ? 'active' : '') + '" onclick="closeSidebar();renderSettings(\'' + m.id + '\')">' + m.label + '</div>';
    }).join('') +
    '</div></div>' +
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
  var g = currentGuild;
  var config = g.config || {};

  var enabledCount = 0;
  var totalCount = FEATURES.filter(function(f) { return !isFlagPremium(f.feature); }).length;
  FEATURES.forEach(function(f) { if (!isFlagPremium(f.feature) && config[f.key]) enabledCount++; });

  var html = '<div class="dashboard-layout">' + renderSidebar('overview') +
    '<div class="dashboard-content">' +
    sidebarToggleBtn('Menu') +
    '<div class="dash-header"><h1>' + esc(g.name) + '</h1><p>Overview and module management</p></div>';

  html += '<div class="dash-grid" style="margin-bottom:12px;">' +
    '<div class="dash-card"><div class="dash-label">Members</div><div class="dash-value">' + (g.memberCount || 0).toLocaleString() + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Premium</div><div class="dash-value" style="font-size:15px;color:' + (g.premium ? 'var(--green)' : 'var(--text-dim)') + '">' + (g.premium ? 'Active' : 'Inactive') + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Modules On</div><div class="dash-value">' + enabledCount + ' / ' + totalCount + '</div></div>' +
    '</div>';

  var progressPct = totalCount > 0 ? Math.round((enabledCount / totalCount) * 100) : 0;
  html += '<div class="setup-progress-bar">' +
    '<span class="setup-progress-label" style="font-weight:600;color:var(--text);">Setup Progress</span>' +
    '<div class="setup-progress-track"><div class="setup-progress-fill" style="width:' + progressPct + '%"></div></div>' +
    '<span class="setup-progress-label">' + progressPct + '% configured</span>' +
    '</div>';

  html += '<div style="margin-top:16px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
    '<h2 style="font-size:15px;font-weight:700;">Modules</h2>' +
    '<span style="font-size:11px;color:var(--text-dim);">Toggle on/off · Click Configure to set up</span></div>';

  html += '<div class="module-grid">';
  FEATURES.forEach(function(f) {
    var enabled = !!config[f.key];
    html += '<div class="module-card">' +
      '<div class="module-info">' +
      '<div class="module-icon">' + f.icon + '</div>' +
      '<div style="min-width:0;">' +
      '<div class="module-name">' + f.name +
      (isFlagPremium(f.feature) ? ' <span class="premium-tag">Premium</span>' : '') +
      '</div><div class="module-desc">' + f.desc + '</div></div>' +
      '</div>' +
      '<div class="module-actions">' +
      (f.mod ? '<button class="configure-btn" onclick="renderSettings(\'' + f.mod + '\')">Configure</button>' : '') +
      '<div class="toggle ' + (enabled ? 'active' : '') + '" data-feature="' + f.feature + '" data-key="' + f.key + '" onclick="toggleFeature(this)" title="' + (enabled ? 'Disable' : 'Enable') + ' ' + f.name + '"></div>' +
      '</div>' +
      '</div>';
  });
  html += '</div></div>';

  html += renderPremiumSection(g);

  html += '<div style="margin-top:16px;">' +
    '<div class="config-section"><div class="config-section-header"><h3>Quick Setup Guide</h3></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:6px;">' +
    '<p style="font-size:13px;color:var(--text-muted);line-height:1.7;">' +
    'Use the <strong style="color:var(--text);">sidebar</strong> or the <strong style="color:var(--text);">Configure</strong> buttons above to set up each module. ' +
    'After saving a setting, the bot updates immediately — no restart needed.' +
    '</p>' +
    '<ol style="margin:8px 0 0 18px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--text-muted);">' +
    '<li>Enable the modules you want using the toggles above</li>' +
    '<li>Click <strong style="color:var(--text);">Configure</strong> on each module to assign channels, roles, and options</li>' +
    '<li>Hit <strong style="color:var(--text);">Save</strong> — changes take effect right away</li>' +
    '<li>Run <code style="background:var(--bg-secondary);padding:1px 5px;border-radius:3px;">/verifysystemsetup</code>, <code style="background:var(--bg-secondary);padding:1px 5px;border-radius:3px;">/ticketsupportsetup</code>, or other slash commands to post panels in Discord</li>' +
    '</ol></div></div></div>';

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

function renderPremiumSection(g) {
  var premiumItems = [];
  if (isFlagPremium('dispatch')) premiumItems.push('AI Voice Dispatch — officers talk, bot responds');
  premiumItems.push('Blackjack & Roulette gambling games');
  premiumItems.push('Top-25 leaderboard (free: top 10)');
  premiumItems.push('Unlimited ticket types (free: 3)');
  premiumItems.push('Unlimited role income entries (free: 2)');
  premiumItems.push('Unlimited CAD, vehicles, BOLOs & stickies');

  if (g.premium) {
    return '<div class="config-section" id="premium-section" style="margin-top:16px;border-color:rgba(52,211,153,0.3);">' +
      '<div class="config-section-header"><h3>Premium</h3>' +
      '<span class="status-badge enabled"><span class="status-dot"></span>Active</span>' +
      '</div>' +
      '<div class="config-row" style="justify-content:space-between;flex-wrap:wrap;gap:10px;">' +
      '<div><span class="config-label">Premium is active on this server.</span>' +
      '<div class="config-sublabel">' + premiumItems.join(', ') + ' — all unlocked.</div></div>' +
      '<button id="transfer-btn" class="btn btn-secondary btn-sm" onclick="transferPremium()">Transfer Key</button>' +
      '</div></div>';
  }
  return '<div class="config-section" id="premium-section" style="margin-top:16px;border-color:rgba(88,101,242,0.4);">' +
    '<div class="config-section-header" style="background:rgba(88,101,242,0.04);">' +
    '<h3 style="color:#7b8cec;">Premium — Unlock More</h3>' +
    '<span class="status-badge disabled"><span class="status-dot"></span>Inactive</span>' +
    '</div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:12px;">' +
    (premiumItems.length > 0
      ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px;width:100%;">' +
        premiumItems.map(function(t) { return premFeatureItem(t); }).join('') +
        '</div>'
      : '') +
    '<div style="border-top:1px solid var(--border);padding-top:12px;width:100%;">' +
    '<p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Get a premium key by joining our Discord support server, then enter it below.</p>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<a href="https://discord.gg/cSdhfGPeV2" target="_blank" class="btn btn-discord btn-sm">Join Support Server to Get a Key</a>' +
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
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar(mod) +
    '<div class="dashboard-content"><div style="color:var(--text-muted);font-size:13px;padding-top:20px;">Loading...</div></div></div>';

  api('/guild/' + currentGuild.id + '/settings/' + mod).then(function(data) {
    if (!data) return;
    pendingChanges = {};

    var html = '<div class="dashboard-layout">' + renderSidebar(mod) +
      '<div class="dashboard-content" id="settings-content">' +
      sidebarToggleBtn('Menu') +
      '<div class="mobile-back" onclick="closeSidebar();renderDashboard()">&#8249; Back to Overview</div>' +
      '<div class="dash-header"><h1>' + esc(data.name) + '</h1><p>' + esc(data.description) + '</p></div>';

    if (data.premium) {
      html += '<div style="background:var(--amber-bg);border:1px solid rgba(251,191,36,0.2);border-radius:var(--radius);padding:12px 16px;margin-bottom:14px;font-size:13px;color:var(--amber);display:flex;align-items:center;gap:8px;">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        'Premium feature — requires an active premium key on this server.' +
        (!currentGuild.premium ? ' <a href="#" onclick="renderDashboard();setTimeout(function(){var s=document.getElementById(\'premium-section\');if(s)s.scrollIntoView({behavior:\'smooth\'})},200);return false;" style="color:var(--blue);text-decoration:underline;margin-left:4px;">Activate Premium</a>' : '') +
        '</div>';
    }

    if (mod === 'economy') {
      html += renderEconomySettings(data);
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

    if (data.events && data.events.length > 0) {
      html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Scheduled Events</h3></div>';
      data.events.forEach(function(e) {
        html += '<div class="config-row"><div class="config-left">' +
          '<span class="config-label">' + esc(e.day) + ' at ' + esc(e.time || 'TBD') + '</span>' +
          '<div class="config-sublabel">' + esc(e.description || 'No description') +
          (e.person ? ' · Host: ' + esc(e.person) : '') + '</div></div></div>';
      });
      html += '<div class="config-row"><span class="config-sublabel" style="font-size:11px;">Use <code>/roleplaycalendersetup</code> in Discord to add, edit, or remove events.</span></div></div>';
    }

    if (data.whitelistedLinks && data.whitelistedLinks.length > 0) {
      html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Whitelisted Invite Links</h3></div>';
      data.whitelistedLinks.forEach(function(l) {
        html += '<div class="config-row"><span class="config-label" style="font-family:monospace;font-size:12px;">' + esc(l) + '</span></div>';
      });
      html += '<div class="config-row"><span class="config-sublabel" style="font-size:11px;">Use <code>/antipromotingsetup</code> in Discord to manage whitelisted links.</span></div></div>';
    }

    if (mod === 'dispatch') {
      html += renderDispatchExtras(data);
    }

    html += '</div></div>';
    app.innerHTML = html;
  });
}

/* ── Dispatch extras (voice channel management) ── */
function renderDispatchExtras(data) {
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
    'Officers speak 10-codes (e.g. "10-11 traffic stop") into patrol voice channels — the bot transcribes the audio, ' +
    'generates an AI dispatcher reply, and reads it back in the channel. On a 10-11, the officer is automatically moved to a traffic stop channel.' +
    '</div>' +
    '</div></div>';

  var statusItems = [
    { label: 'Patrol channels', count: patrolCount, ok: patrolCount > 0 },
    { label: 'Traffic stop channels', count: trafficCount, ok: true },
    { label: 'LEO roles', count: leoCount, ok: leoCount > 0 },
  ];
  html += '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Configuration Status</h3></div>' +
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
    '<div class="channel-tags" id="patrol-tags">' + (patrolTags || '<span style="font-size:12px;color:var(--text-dim);">No channels added yet — add at least one so the bot can listen.</span>') + '</div>' +
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
    '<div class="channel-tags" id="traffic-tags">' + (trafficTags || '<span style="font-size:12px;color:var(--text-dim);">Optional — officers move here when they call a 10-11.</span>') + '</div>' +
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
    '<div class="channel-tags" id="leo-tags">' + (leoTags || '<span style="font-size:12px;color:var(--text-dim);">No roles added — add at least one LEO role to restrict who can use dispatch.</span>') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="leo-role-select"><option value="">Select a role...</option>' + roleOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addDispatchChannel(\'leo\')">Add Role</button>' +
    '</div></div></div>';

  return html;
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
  var limit = currentGuild.premium ? '∞' : '3';
  var count = data.ticketTypes ? data.ticketTypes.length : 0;
  var html = '<div class="config-section" style="margin-top:14px;">' +
    '<div class="config-section-header"><h3>Ticket Types</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + count + ' / ' + limit + ' types</span>' +
    '</div>';

  if (!data.ticketTypes || data.ticketTypes.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No ticket types configured yet. Use <code>/ticketsupportsetup</code> in Discord to add ticket types.</span></div>';
  } else {
    data.ticketTypes.forEach(function(t) {
      html += '<div class="config-row">' +
        '<div class="config-left"><span class="config-label">' + esc(t.label) + '</span>' +
        '<div class="config-sublabel">' + (t.allowedRoleIds.length || 0) + ' staff role' + (t.allowedRoleIds.length === 1 ? '' : 's') + ' assigned</div></div></div>';
    });
    html += '<div class="config-row"><span class="config-sublabel" style="font-size:11px;">To add, edit, or remove ticket types, use <code>/ticketsupportsetup</code> in Discord.</span></div>';
  }

  if (!currentGuild.premium && count >= 3) {
    html += '<div class="config-row" style="background:var(--amber-bg);">' +
      '<span style="font-size:12px;color:var(--amber);">Free limit reached (3 types). Upgrade to Premium for unlimited ticket types.</span></div>';
  }

  html += '</div>';
  return html;
}

/* ── Economy Settings (grouped) ── */
function renderEconomySettings(data) {
  var fields = data.fields || [];
  var groups = {
    general:   { label: 'General', keys: ['currencySymbol','startingBalance','maxBalance','logChannelId'] },
    work:      { label: 'Work',    keys: ['work_enabled','work_cooldown','work_minPayout','work_maxPayout'] },
    crime:     { label: 'Crime',   keys: ['crime_enabled','crime_cooldown','crime_successRate','crime_minPayout','crime_maxPayout','crime_fineRate'] },
    rob:       { label: 'Robbery', keys: ['rob_enabled','rob_cooldown','rob_successRate','rob_maxStealPercent'] },
    gambling:  { label: 'Gambling', keys: ['gambling_enabled','gambling_minBet','gambling_maxBet','gambling_cooldown'] },
    chatmoney: { label: 'Chat Money', keys: ['chatMoney_enabled','chatMoney_minAmount','chatMoney_maxAmount','chatMoney_cooldown'] },
  };

  var fieldMap = {};
  fields.forEach(function(f) { fieldMap[f.key] = f; });

  var html = '';
  var groupOrder = ['general','work','crime','rob','gambling','chatmoney'];
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

  if (data.roleIncomeList && data.roleIncomeList.length > 0) {
    var riLimit = currentGuild.premium ? '∞' : '2';
    html += '<div class="config-section" style="margin-top:4px;">' +
      '<div class="config-section-header"><h3>Role Income</h3>' +
      '<span style="font-size:11px;color:var(--text-dim);">' + data.roleIncomeList.length + ' / ' + riLimit + ' entries</span></div>';
    data.roleIncomeList.forEach(function(r) {
      html += '<div class="config-row"><div class="config-left">' +
        '<span class="config-label">@' + esc(r.roleName) + '</span>' +
        '<div class="config-sublabel">Earns ' + esc(String(r.amount)) + ' every ' + esc(String(r.cooldown)) + 'h</div></div></div>';
    });
    if (!currentGuild.premium && data.roleIncomeList.length >= 2) {
      html += '<div class="config-row" style="background:var(--amber-bg);">' +
        '<span style="font-size:12px;color:var(--amber);">Free limit reached (2 entries). Upgrade to Premium for unlimited role income.</span></div>';
    }
    html += '<div class="config-row"><span class="config-sublabel" style="font-size:11px;">Use <code>/economysetup roleincome</code> in Discord to manage entries.</span></div></div>';
  } else {
    html += '<div class="config-section" style="margin-top:4px;">' +
      '<div class="config-section-header"><h3>Role Income</h3></div>' +
      '<div class="config-row"><span class="config-sublabel">No role income set up. Use <code>/economysetup roleincome</code> in Discord to give roles periodic income.</span></div>' +
      '</div>';
  }

  return html;
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
    html += '<option value="">— Not Set —</option>';
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
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
    }
  });
}

init();
