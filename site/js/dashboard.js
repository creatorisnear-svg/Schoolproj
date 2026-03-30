var API_BASE = 'https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
var SITE_URL = 'https://roleplaymanager.xyz';

var app = document.getElementById('app');
var toastEl = document.getElementById('toast');

var currentUser = null;
var currentGuild = null;
var guilds = [];
var pendingChanges = {};

function getToken() { return localStorage.getItem('dash_token'); }
function setToken(t) { localStorage.setItem('dash_token', t); }
function clearToken() { localStorage.removeItem('dash_token'); }

function toast(msg, type) {
  type = type || 'success';
  toastEl.textContent = msg;
  toastEl.className = 'toast ' + type + ' show';
  setTimeout(function() { toastEl.classList.remove('show'); }, 3000);
}

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

function esc(str) {
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

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

function init() {
  var hash = window.location.hash;
  if (hash && hash.indexOf('#token=') === 0) {
    setToken(hash.substring(7));
    history.replaceState(null, '', window.location.pathname);
  }
  var token = getToken();
  if (!token) { showLogin(); return; }

  app.innerHTML = '<div class="login-page"><div style="color:var(--text-muted);font-size:14px;">Loading...</div></div>';

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
        '<a href="#" onclick="logout();return false;" class="btn btn-ghost btn-sm" style="gap:6px;">' +
        (avatar ? '<img src="' + avatar + '" style="width:20px;height:20px;border-radius:50%;">' : '') +
        esc(currentUser.username) + '</a>';
    }
    renderServerSelect();
  });
}

function logout() { clearToken(); showLogin(); }

function renderServerSelect() {
  currentGuild = null;
  pendingChanges = {};
  app.innerHTML =
    '<div style="padding-top:80px;max-width:800px;margin:0 auto;padding-left:24px;padding-right:24px;">' +
    '<div class="dash-header"><h1>Select a Server</h1>' +
    '<p>Choose a server to manage. Only servers where you have admin permissions and the bot is present are shown.</p></div>' +
    '<div class="server-list">' +
    (guilds.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">No servers found. Make sure the bot is in your server and you have Administrator permission.</p>' : '') +
    guilds.map(function(g) {
      return '<div class="server-card" onclick="selectServer(\'' + g.id + '\')">' +
        '<div class="server-icon">' +
        (g.icon ? '<img src="https://cdn.discordapp.com/icons/' + g.id + '/' + g.icon + '.png?size=64" alt="">' : esc(g.name.charAt(0))) +
        '</div><div><div class="server-name">' + esc(g.name) + '</div>' +
        '<div class="server-members">' + (g.memberCount || 0) + ' members</div></div></div>';
    }).join('') +
    '</div></div>';
}

function selectServer(guildId) {
  app.innerHTML = '<div class="login-page"><div style="color:var(--text-muted);font-size:14px;">Loading server...</div></div>';
  api('/guild/' + guildId).then(function(data) {
    if (!data) { renderServerSelect(); return; }
    currentGuild = data;
    pendingChanges = {};
    renderDashboard();
  });
}

var FEATURES = [
  { key: 'roleplayEnabled', feature: 'roleplay', name: 'Roleplay Commands', icon: 'RP', desc: '911, Twitter, Anon tips, CAD', mod: 'roleplay' },
  { key: 'priorityEnabled', feature: 'priority', name: 'Priority Tracker', icon: 'P', desc: 'Priority event tracking', mod: 'priority' },
  { key: 'strikeEnabled', feature: 'strike', name: 'Strike System', icon: 'S', desc: 'Multi-level strike punishments', mod: 'strikes' },
  { key: 'calendarEnabled', feature: 'calendar', name: 'RP Calendar', icon: 'C', desc: 'Weekly event scheduling', mod: 'calendar' },
  { key: 'ticketEnabled', feature: 'ticket', name: 'Ticket Support', icon: 'T', desc: 'Support ticket system', mod: 'tickets' },
  { key: 'antiPromotingEnabled', feature: 'antipromote', name: 'Anti-Promoting', icon: 'AP', desc: 'Invite link filtering', mod: 'antipromo' },
  { key: 'roleRequestEnabled', feature: 'rolerequest', name: 'Role Request', icon: 'RR', desc: 'Self-serve role requests', mod: null },
  { key: 'verifyEnabled', feature: 'verification', name: 'Verification', icon: 'ID', desc: 'Member verification gate', mod: 'verification' },
  { key: 'welcomeEnabled', feature: 'welcome', name: 'Welcome System', icon: 'W', desc: 'New member messages', mod: 'welcome' },
  { key: 'dispatchEnabled', feature: 'dispatch', name: 'AI Voice Dispatch', icon: 'AI', desc: 'AI-powered dispatch (Premium)', mod: 'dispatch', premium: true },
];

var SIDEBAR_MODULES = [
  { id: 'general', label: 'General' },
  { id: 'roleplay', label: 'Roleplay Commands' },
  { id: 'verification', label: 'Verification' },
  { id: 'strikes', label: 'Strike System' },
  { id: 'tickets', label: 'Tickets' },
  { id: 'dispatch', label: 'Voice Dispatch' },
  { id: 'priority', label: 'Priority Tracker' },
  { id: 'antipromo', label: 'Anti-Promoting' },
  { id: 'welcome', label: 'Welcome System' },
  { id: 'calendar', label: 'RP Calendar' },
];

function renderSidebar(active) {
  return '<div class="sidebar">' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Server</div>' +
    '<div class="sidebar-item ' + (active === 'overview' ? 'active' : '') + '" onclick="renderDashboard()">Overview</div>' +
    '<div class="sidebar-item" onclick="renderServerSelect()">Switch Server</div>' +
    '</div>' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Modules</div>' +
    SIDEBAR_MODULES.map(function(m) {
      return '<div class="sidebar-item ' + (active === m.id ? 'active' : '') + '" onclick="renderSettings(\'' + m.id + '\')">' + m.label + '</div>';
    }).join('') +
    '</div></div>';
}

function renderDashboard() {
  var g = currentGuild;
  var config = g.config || {};

  var html = '<div class="dashboard-layout">' + renderSidebar('overview') +
    '<div class="dashboard-content">' +
    '<div class="dash-header"><h1>' + esc(g.name) + '</h1><p>Server overview and feature management</p></div>';

  html += '<div class="dash-grid">' +
    '<div class="dash-card"><div class="dash-label">Members</div><div class="dash-value">' + (g.memberCount || 0) + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Premium</div><div class="dash-value" style="color:' + (g.premium ? 'var(--green)' : 'var(--text-dim)') + '">' + (g.premium ? 'Active' : 'Inactive') + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Log Channel</div><div class="dash-value" style="font-size:14px;">' + (config.logChannelName ? '#' + esc(config.logChannelName) : 'Not Set') + '</div></div>' +
    '</div>';

  html += '<div style="margin-top:20px;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
    '<h2 style="font-size:16px;font-weight:700;">Features</h2>' +
    '<span style="font-size:11px;color:var(--text-dim);">Toggle features on or off</span></div>';

  html += '<div class="module-grid">';
  FEATURES.forEach(function(f) {
    var enabled = !!config[f.key];
    html += '<div class="module-card">' +
      '<div class="module-info">' +
      '<div class="module-icon">' + f.icon + '</div>' +
      '<div><div class="module-name">' + f.name +
      (f.premium ? ' <span class="premium-tag">Premium</span>' : '') +
      '</div><div class="module-desc">' + f.desc + '</div></div>' +
      '</div>' +
      '<div class="toggle ' + (enabled ? 'active' : '') + '" onclick="toggleFeature(this,\'' + f.feature + '\',\'' + f.key + '\',' + !enabled + ')"></div>' +
      '</div>';
  });
  html += '</div></div>';

  html += '<div class="mobile-modules" style="margin-top:20px;">' +
    '<div class="config-section"><div class="config-section-header"><h3>Configure Modules</h3></div>' +
    SIDEBAR_MODULES.map(function(m) {
      return '<div class="config-row" style="cursor:pointer;" onclick="renderSettings(\'' + m.id + '\')">' +
        '<span class="config-label">' + m.label + '</span>' +
        '<span style="color:var(--text-dim);font-size:18px;">&#8250;</span></div>';
    }).join('') +
    '</div></div>';

  html += '</div></div>';
  app.innerHTML = html;
}

function toggleFeature(el, feature, key, newVal) {
  el.classList.toggle('active');
  api('/guild/' + currentGuild.id + '/feature/' + feature, {
    method: 'POST',
    body: JSON.stringify({ enabled: newVal })
  }).then(function(result) {
    if (result && result.success) {
      currentGuild.config[key] = newVal;
      toast(newVal ? 'Feature enabled' : 'Feature disabled');
    } else {
      el.classList.toggle('active');
    }
  });
}

function renderSettings(mod) {
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar(mod) +
    '<div class="dashboard-content"><div style="color:var(--text-muted);font-size:13px;padding-top:20px;">Loading...</div></div></div>';

  api('/guild/' + currentGuild.id + '/settings/' + mod).then(function(data) {
    if (!data) return;
    pendingChanges = {};
    var html = '<div class="dashboard-layout">' + renderSidebar(mod) +
      '<div class="dashboard-content" id="settings-content">' +
      '<div class="mobile-back" onclick="renderDashboard()">&#8249; Back</div>' +
      '<div class="dash-header"><h1>' + esc(data.name) + '</h1><p>' + esc(data.description) + '</p></div>';

    if (data.premium) {
      html += '<div style="background:var(--amber-bg);border:1px solid rgba(251,191,36,0.2);border-radius:var(--radius);padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--amber);">' +
        'This is a premium feature. A premium key is required for this module to function.</div>';
    }

    html += renderSettingsFields(data, mod);

    if (data.stats && data.stats.length > 0) {
      html += '<div class="dash-grid" style="margin-top:14px;">';
      data.stats.forEach(function(s) {
        html += '<div class="dash-card"><div class="dash-label">' + esc(s.label) + '</div>' +
          '<div class="dash-value">' + esc(String(s.value)) + '</div></div>';
      });
      html += '</div>';
    }

    if (data.ticketTypes && data.ticketTypes.length > 0) {
      html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Ticket Types</h3></div>';
      data.ticketTypes.forEach(function(t) {
        html += '<div class="config-row"><span class="config-label">' + esc(t.label) + '</span>' +
          '<span class="config-value">' + (t.allowedRoleIds.length || 0) + ' staff roles</span></div>';
      });
      html += '</div>';
    }

    if (data.events && data.events.length > 0) {
      html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Scheduled Events</h3></div>';
      data.events.forEach(function(e) {
        html += '<div class="config-row"><div class="config-left"><span class="config-label">' + esc(e.day) + ' at ' + esc(e.time || 'TBD') + '</span>' +
          '<div class="config-sublabel">' + esc(e.description || 'No description') +
          (e.person ? ' (Host: ' + esc(e.person) + ')' : '') + '</div></div></div>';
      });
      html += '</div>';
    }

    if (data.whitelistedLinks && data.whitelistedLinks.length > 0) {
      html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Whitelisted Links</h3></div>';
      data.whitelistedLinks.forEach(function(l) {
        html += '<div class="config-row"><span class="config-label" style="font-family:monospace;font-size:12px;">' + esc(l) + '</span></div>';
      });
      html += '</div>';
    }

    html += '</div></div>';
    app.innerHTML = html;
  });
}

function renderSettingsFields(data, mod) {
  if (!data.fields || data.fields.length === 0) {
    return '<div class="config-section"><div class="config-section-header"><h3>Configuration</h3></div>' +
      '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">No configurable settings. Use Discord commands to set up this module.</span></div></div>';
  }

  var html = '<div class="config-section"><div class="config-section-header"><h3>Configuration</h3></div>';

  data.fields.forEach(function(field) {
    var isTextarea = field.type === 'textarea';
    html += '<div class="config-row' + (isTextarea ? ' textarea-row' : '') + '">';
    html += '<div class="config-left"><span class="config-label">' + esc(field.label) + '</span>';
    if (field.description) html += '<div class="config-sublabel">' + esc(field.description) + '</div>';
    html += '</div>';

    if (field.type === 'toggle') {
      html += '<div class="toggle ' + (field.value ? 'active' : '') + '" onclick="toggleField(this,\'' + mod + '\',\'' + field.key + '\')" data-key="' + field.key + '"></div>';
    } else if (field.type === 'select' || field.type === 'role') {
      html += '<select class="config-select" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '">';
      html += '<option value="">Not Set</option>';
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
      html += '<input type="number" class="config-input" value="' + (field.value || '') + '" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '" min="' + (field.min || 0) + '" max="' + (field.max || 999) + '">';
    } else if (field.type === 'textarea') {
      html += '<textarea class="config-textarea" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '" placeholder="' + esc(field.placeholder || '') + '">' + esc(String(field.value || '')) + '</textarea>';
    } else if (field.type === 'text') {
      html += '<input type="text" class="config-input" value="' + esc(String(field.value || '')) + '" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '" placeholder="' + esc(field.placeholder || '') + '">';
    } else {
      html += '<span class="config-value">' + esc(String(field.value != null ? field.value : 'Not Set')) + '</span>';
    }

    html += '</div>';
  });

  html += '</div>';
  html += '<div id="save-bar-container"></div>';
  return html;
}

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
    '<button class="btn btn-success btn-sm" onclick="saveSettings(\'' + mod + '\')">Save</button>' +
    '</div>';
}

function saveSettings(mod) {
  if (Object.keys(pendingChanges).length === 0) return;
  api('/guild/' + currentGuild.id + '/settings/' + mod, {
    method: 'POST',
    body: JSON.stringify(pendingChanges)
  }).then(function(result) {
    if (result && result.success) {
      toast('Settings saved');
      pendingChanges = {};
      api('/guild/' + currentGuild.id).then(function(refreshed) {
        if (refreshed) currentGuild = refreshed;
        renderSettings(mod);
      });
    }
  });
}

init();
