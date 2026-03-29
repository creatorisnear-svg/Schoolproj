var API_BASE = 'https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
var SITE_URL = 'https://roleplaymanager.xyz';

var app = document.getElementById('app');
var toastEl = document.getElementById('toast');

var currentUser = null;
var currentGuild = null;
var guilds = [];
var pendingChanges = {};

function getToken() {
  return localStorage.getItem('dash_token');
}

function setToken(token) {
  localStorage.setItem('dash_token', token);
}

function clearToken() {
  localStorage.removeItem('dash_token');
}

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
  if (opts.headers) {
    for (var k in opts.headers) headers[k] = opts.headers[k];
  }
  opts.headers = headers;
  return fetch(API_BASE + '/api' + path, opts).then(function(res) {
    if (res.status === 401) {
      clearToken();
      showLogin();
      return null;
    }
    if (!res.ok) {
      return res.json().catch(function() { return {}; }).then(function(err) {
        toast(err.error || 'Something went wrong', 'error');
        return null;
      });
    }
    return res.json();
  });
}

function showLogin() {
  var clientId = '1441306995641683978';
  var redirectUri = encodeURIComponent(API_BASE + '/auth/site/callback');
  var state = encodeURIComponent(SITE_URL + '/dashboard/');
  var loginUrl = 'https://discord.com/api/oauth2/authorize?client_id=' + clientId + '&redirect_uri=' + redirectUri + '&response_type=code&scope=identify%20guilds&state=' + state;

  app.innerHTML = '<div class="login-page"><div class="login-box">' +
    '<img src="/img/logo.png" alt="RM">' +
    '<h2>Dashboard</h2>' +
    '<p>Sign in with Discord to manage your servers.</p>' +
    '<a href="' + loginUrl + '" class="btn btn-primary" style="width:100%;justify-content:center;">Sign in with Discord</a>' +
    '</div></div>';
}

function init() {
  var hash = window.location.hash;
  if (hash && hash.indexOf('#token=') === 0) {
    var token = hash.substring(7);
    setToken(token);
    history.replaceState(null, '', window.location.pathname);
  }

  var token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  api('/me').then(function(data) {
    if (!data || !data.user) {
      clearToken();
      showLogin();
      return;
    }
    currentUser = data.user;
    guilds = data.guilds || [];

    var avatar = currentUser.avatar
      ? 'https://cdn.discordapp.com/avatars/' + currentUser.id + '/' + currentUser.avatar + '.png?size=32'
      : null;

    document.getElementById('nav-user').innerHTML =
      '<a href="#" onclick="logout();return false;" style="display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:13px;">' +
      (avatar ? '<img src="' + avatar + '" style="width:24px;height:24px;border-radius:50%;">' : '') +
      escapeHtml(currentUser.username) +
      '</a>';

    renderServerSelect();
  });
}

function logout() {
  clearToken();
  showLogin();
}

function renderServerSelect() {
  currentGuild = null;
  pendingChanges = {};
  app.innerHTML =
    '<div style="padding-top:96px;max-width:900px;margin:0 auto;padding-left:24px;padding-right:24px;">' +
    '<div class="dash-header"><h1>Select a Server</h1>' +
    '<p>Choose a server to manage. Only servers where you have admin permissions and the bot is present are shown.</p></div>' +
    '<div class="server-list">' +
    (guilds.length === 0 ? '<p style="color:var(--text-muted);">No servers found.</p>' : '') +
    guilds.map(function(g) {
      return '<div class="server-card" onclick="selectServer(\'' + g.id + '\')">' +
        '<div class="server-icon">' +
        (g.icon ? '<img src="https://cdn.discordapp.com/icons/' + g.id + '/' + g.icon + '.png?size=64" alt="">' : escapeHtml(g.name.charAt(0))) +
        '</div><div><div class="server-name">' + escapeHtml(g.name) + '</div>' +
        '<div class="server-members">' + (g.memberCount || '\u2014') + ' members</div></div></div>';
    }).join('') +
    '</div></div>';
}

function selectServer(guildId) {
  api('/guild/' + guildId).then(function(data) {
    if (!data) return;
    currentGuild = data;
    pendingChanges = {};
    renderDashboard();
  });
}

function renderDashboard() {
  var g = currentGuild;
  var config = g.config || {};

  var modules = [
    { id: 'general', label: 'General Settings' },
    { id: 'verification', label: 'Verification' },
    { id: 'strikes', label: 'Strike System' },
    { id: 'tickets', label: 'Ticket Support' },
    { id: 'dispatch', label: 'Voice Dispatch' },
    { id: 'priority', label: 'Priority Tracker' },
    { id: 'antipromo', label: 'Anti-Promoting' },
    { id: 'welcome', label: 'Welcome System' }
  ];

  app.innerHTML =
    '<div class="dashboard-layout">' +
    renderSidebar('overview') +
    '<div class="dashboard-content">' +
    '<div class="dash-header"><h1>' + escapeHtml(g.name) + '</h1><p>Server overview and configuration</p></div>' +
    '<div class="dash-grid">' +
    '<div class="dash-card"><div class="dash-label">Members</div><div class="dash-value">' + (g.memberCount || '\u2014') + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Premium</div><div class="dash-value" style="color:' + (g.premium ? 'var(--green)' : 'var(--text-muted)') + '">' + (g.premium ? 'Active' : 'Inactive') + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Log Channel</div><div class="dash-value" style="font-size:15px;">' + (config.logChannelName ? '#' + escapeHtml(config.logChannelName) : 'Not Set') + '</div></div>' +
    '</div>' +
    '<div style="margin-top:20px;"><div class="config-section"><h3>Module Status</h3>' +
    moduleRow('Verification System', config.verifyEnabled) +
    moduleRow('Strike System', config.strikeEnabled) +
    moduleRow('Ticket Support', config.ticketEnabled) +
    moduleRow('Voice Dispatch', config.dispatchEnabled) +
    moduleRow('Priority Tracker', config.priorityEnabled) +
    moduleRow('Anti-Promoting', config.antiPromotingEnabled) +
    moduleRow('Welcome System', config.welcomeEnabled) +
    moduleRow('RP Calendar', config.calendarEnabled) +
    '</div></div>' +
    '<div class="mobile-modules" style="margin-top:20px;"><div class="config-section"><h3>Configure Modules</h3>' +
    modules.map(function(m) {
      return '<div class="config-row" style="cursor:pointer;" onclick="renderSettings(\'' + m.id + '\')">' +
        '<span class="config-label">' + m.label + '</span>' +
        '<span style="color:var(--text-muted);font-size:20px;">&#8250;</span></div>';
    }).join('') +
    '</div></div>' +
    '</div></div>';
}

function renderSidebar(active) {
  var items = [
    { id: 'overview', label: 'Overview', action: 'renderDashboard()' },
    { id: 'switch', label: 'Switch Server', action: 'renderServerSelect()' }
  ];
  var modules = [
    { id: 'general', label: 'General Settings', action: "renderSettings('general')" },
    { id: 'verification', label: 'Verification', action: "renderSettings('verification')" },
    { id: 'strikes', label: 'Strike System', action: "renderSettings('strikes')" },
    { id: 'tickets', label: 'Tickets', action: "renderSettings('tickets')" },
    { id: 'dispatch', label: 'Voice Dispatch', action: "renderSettings('dispatch')" },
    { id: 'priority', label: 'Priority Tracker', action: "renderSettings('priority')" },
    { id: 'antipromo', label: 'Anti-Promoting', action: "renderSettings('antipromo')" },
    { id: 'welcome', label: 'Welcome System', action: "renderSettings('welcome')" }
  ];

  return '<div class="sidebar">' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Server</div>' +
    items.map(function(i) {
      return '<div class="sidebar-item ' + (active === i.id ? 'active' : '') + '" onclick="' + i.action + '">' + i.label + '</div>';
    }).join('') +
    '</div>' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Settings</div>' +
    modules.map(function(i) {
      return '<div class="sidebar-item ' + (active === i.id ? 'active' : '') + '" onclick="' + i.action + '">' + i.label + '</div>';
    }).join('') +
    '</div></div>';
}

function moduleRow(name, enabled) {
  return '<div class="config-row"><span class="config-label">' + name + '</span>' +
    '<span class="status-badge ' + (enabled ? 'enabled' : 'disabled') + '">' +
    '<span class="status-dot"></span>' + (enabled ? 'Enabled' : 'Disabled') + '</span></div>';
}

function renderSettings(mod) {
  api('/guild/' + currentGuild.id + '/settings/' + mod).then(function(data) {
    if (!data) return;
    pendingChanges = {};

    app.innerHTML =
      '<div class="dashboard-layout">' +
      renderSidebar(mod) +
      '<div class="dashboard-content" id="settings-content">' +
      '<div class="mobile-back" onclick="renderDashboard()">&#8249; Back to Overview</div>' +
      '<div class="dash-header"><h1>' + escapeHtml(data.name) + '</h1><p>' + escapeHtml(data.description) + '</p></div>' +
      renderSettingsFields(data, mod) +
      (data.stats && data.stats.length > 0 ?
        '<div class="dash-grid" style="margin-top:16px;">' +
        data.stats.map(function(s) {
          return '<div class="dash-card"><div class="dash-label">' + escapeHtml(s.label) + '</div>' +
            '<div class="dash-value">' + escapeHtml(String(s.value)) + '</div></div>';
        }).join('') + '</div>' : '') +
      '</div></div>';
  });
}

function renderSettingsFields(data, mod) {
  if (!data.fields || data.fields.length === 0) {
    return '<div class="config-section"><h3>Configuration</h3><p style="color:var(--text-muted);font-size:14px;">No configurable settings available. Use Discord commands to set up this module.</p></div>';
  }

  var html = '<div class="config-section"><h3>Configuration</h3>';

  data.fields.forEach(function(field) {
    html += '<div class="config-row"><div><span class="config-label">' + escapeHtml(field.label) + '</span>';
    if (field.description) html += '<div class="config-sublabel">' + escapeHtml(field.description) + '</div>';
    html += '</div>';

    if (field.type === 'toggle') {
      var active = field.value ? 'active' : '';
      html += '<div class="toggle ' + active + '" onclick="toggleField(this,\'' + mod + '\',\'' + field.key + '\')" data-key="' + field.key + '"></div>';
    } else if (field.type === 'select') {
      html += '<select class="config-select" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '">';
      html += '<option value="">Not Set</option>';
      (field.options || []).forEach(function(opt) {
        var selected = opt.value === field.value ? 'selected' : '';
        html += '<option value="' + escapeHtml(opt.value) + '" ' + selected + '>' + escapeHtml(opt.label) + '</option>';
      });
      html += '</select>';
    } else if (field.type === 'number') {
      html += '<input type="number" class="config-input" style="width:100px;" value="' + (field.value || '') + '" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '" min="' + (field.min || 0) + '" max="' + (field.max || 999) + '">';
    } else if (field.type === 'text') {
      html += '<input type="text" class="config-input" value="' + escapeHtml(String(field.value || '')) + '" onchange="changeField(\'' + mod + '\',\'' + field.key + '\',this.value)" data-key="' + field.key + '" placeholder="' + escapeHtml(field.placeholder || '') + '">';
    } else {
      html += '<span class="config-value">' + escapeHtml(String(field.value != null ? field.value : 'Not Set')) + '</span>';
    }

    html += '</div>';
  });

  html += '</div>';
  html += '<div id="save-bar-container"></div>';
  return html;
}

function toggleField(el, mod, key) {
  el.classList.toggle('active');
  var val = el.classList.contains('active');
  pendingChanges[key] = val;
  showSaveBar(mod);
}

function changeField(mod, key, value) {
  pendingChanges[key] = value;
  showSaveBar(mod);
}

function showSaveBar(mod) {
  var container = document.getElementById('save-bar-container');
  if (!container) return;

  if (Object.keys(pendingChanges).length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML =
    '<div class="save-bar">' +
    '<span style="color:var(--text-muted);font-size:13px;margin-right:auto;">You have unsaved changes</span>' +
    '<button class="btn btn-secondary btn-sm" onclick="renderSettings(\'' + mod + '\')">Discard</button>' +
    '<button class="btn btn-success btn-sm" onclick="saveSettings(\'' + mod + '\')">Save Changes</button>' +
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

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
