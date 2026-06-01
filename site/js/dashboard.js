var API_BASE = 'https://severe-daryl-officialplaystation5-0f1738f5.koyeb.app';
var SITE_URL = 'https://roleplaymanager.xyz';

var app = document.getElementById('app');
var toastEl = document.getElementById('toast');

var currentUser = null;
var currentGuild = null;
var guilds = [];
var pendingChanges = {};
var featureFlags = { dispatch: true };

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

function loadFeatureFlags(callback) {
  fetch(API_BASE + '/api/public/features').then(function(r) { return r.json(); }).then(function(flags) {
    featureFlags = flags || { dispatch: true };
    callback();
  }).catch(function() {
    callback();
  });
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
      renderServerSelect();
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

function logout() { clearToken(); window.location.href = '/'; }
function switchAccount() { clearToken(); showLogin(); }

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
  { key: 'roleRequestEnabled', feature: 'rolerequest', name: 'Role Request', icon: 'RR', desc: 'Self-serve role requests', mod: 'rolerequest' },
  { key: 'verifyEnabled', feature: 'verification', name: 'Verification', icon: 'ID', desc: 'Member verification gate', mod: 'verification' },
  { key: 'welcomeEnabled', feature: 'welcome', name: 'Welcome System', icon: 'W', desc: 'New member messages', mod: 'welcome' },
  { key: 'dispatchEnabled', feature: 'dispatch', name: 'AI Voice Dispatch', icon: 'AI', desc: 'AI-powered dispatch (Premium)', mod: 'dispatch', premium: true },
  { key: 'economyEnabled', feature: 'economy', name: 'Economy', icon: '$', desc: 'Currency, work, crime, gambling', mod: 'economy' },
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
  { id: 'economy', label: 'Economy' },
  { id: 'rolerequest', label: 'Role Request' },
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
          '<span class="config-label">Key released successfully. Copy your key below to activate it on another server.</span>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
          '<code style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;letter-spacing:1px;">' + result.key + '</code>' +
          '<button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(\'' + result.key + '\').then(function(){toast(\'Key copied!\')})">Copy</button>' +
          '</div></div>';
      }
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Transfer Key'; }
    }
  });
}

function renderPremiumSection(g) {
  if (g.premium) {
    var d = g.premiumDetails || {};
    var planLabel = d.plan === 'monthly' ? 'Monthly' : d.plan === 'lifetime' ? 'Lifetime' : 'Manual';
    var isCancelling = d.subscriptionStatus === 'cancelling';
    var isCancelled = d.subscriptionStatus === 'canceled' || d.subscriptionStatus === 'cancelled';
    var statusColor = isCancelling ? 'var(--amber)' : isCancelled ? 'var(--red)' : 'var(--green)';
    var statusLabel = isCancelling ? 'Cancels at period end' : isCancelled ? 'Cancelled' : 'Active';

    var renewalLine = '';
    if (d.plan === 'monthly' && d.subscriptionCurrentPeriodEnd) {
      var endDate = new Date(d.subscriptionCurrentPeriodEnd);
      var formatted = endDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      renewalLine = '<div style="font-size:12px;color:var(--text-muted);margin-top:4px;">' +
        (isCancelling ? 'Access ends' : 'Renews') + ' on <strong style="color:var(--text);">' + formatted + '</strong></div>';
    }

    var cancelBtn = '';
    if (d.plan === 'monthly' && d.hasStripeSubscription && !isCancelling && !isCancelled) {
      cancelBtn = '<button id="cancel-sub-btn" class="btn btn-sm" style="background:transparent;border:1px solid var(--red);color:var(--red);font-size:11px;" onclick="cancelSubscription()">Cancel Subscription</button>';
    }

    return '<div class="config-section" id="premium-section" style="margin-top:20px;">' +
      '<div class="config-section-header"><h3>Premium</h3>' +
      '<span class="status-badge enabled"><span class="status-dot"></span>Active</span>' +
      '</div>' +
      '<div style="padding:16px 20px;display:flex;flex-direction:column;gap:16px;">' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">' +
      '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px 14px;">' +
      '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Plan</div>' +
      '<div style="font-size:14px;font-weight:700;color:var(--text);">' + planLabel + '</div>' +
      '</div>' +
      '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px 14px;">' +
      '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">Status</div>' +
      '<div style="font-size:14px;font-weight:700;color:' + statusColor + ';">' + statusLabel + '</div>' +
      '</div>' +
      (d.plan === 'monthly' && d.subscriptionCurrentPeriodEnd ? (
        '<div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:12px 14px;">' +
        '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">' + (isCancelling ? 'Access Ends' : 'Next Renewal') + '</div>' +
        '<div style="font-size:13px;font-weight:600;color:var(--text);">' + new Date(d.subscriptionCurrentPeriodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + '</div>' +
        '</div>'
      ) : '') +
      '</div>' +
      (isCancelling ? '<div style="background:rgba(250,166,26,0.08);border:1px solid rgba(250,166,26,0.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--amber);">Subscription is set to cancel. Premium features remain active until the period ends.</div>' : '') +
      (isCancelled ? '<div style="background:rgba(240,71,71,0.08);border:1px solid rgba(240,71,71,0.2);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--red);">Subscription cancelled. Premium features will stop working. Transfer your key or purchase a new subscription.</div>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button id="transfer-btn" class="btn btn-secondary btn-sm" onclick="transferPremium()">Transfer Key</button>' +
      cancelBtn +
      '</div>' +
      '</div></div>';
  }
  return '<div class="config-section" id="premium-section" style="margin-top:20px;border-color:rgba(88,101,242,0.4);">' +
    '<div class="config-section-header" style="background:rgba(88,101,242,0.04);">' +
    '<h3 style="color:#7b8cec;">Premium — Unlock More</h3>' +
    '<span class="status-badge disabled"><span class="status-dot"></span>Inactive</span>' +
    '</div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:12px;">' +
    '<p style="font-size:12px;color:var(--text-muted);margin:0;">Get a premium key from the pricing page, then enter it below to unlock AI Voice Dispatch and all premium features.</p>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<a href="' + API_BASE + '/pricing" target="_blank" class="btn btn-primary btn-sm">View Pricing &amp; Get a Key</a>' +
    '<a href="https://discord.gg/cSdhfGPeV2" target="_blank" class="btn btn-discord btn-sm" style="font-size:11px;">Support</a>' +
    '</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<input type="text" id="premium-key-input" class="config-input" placeholder="XXXX-XXXX-XXXX-XXXX" style="flex:1;min-width:180px;max-width:280px;">' +
    '<button class="btn btn-primary btn-sm" onclick="activatePremium()">Activate Key</button>' +
    '</div></div></div>';
}

function cancelSubscription() {
  if (!confirm('Cancel your monthly subscription? You will keep premium access until the end of the current billing period, then it will stop. This cannot be undone.')) return;
  var btn = document.getElementById('cancel-sub-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cancelling...'; }
  api('/guild/' + currentGuild.id + '/premium/cancel', { method: 'POST' }).then(function(result) {
    if (result && result.success) {
      if (currentGuild.premiumDetails) {
        currentGuild.premiumDetails.subscriptionStatus = 'cancelling';
      }
      toast('Subscription cancelled. Access continues until the billing period ends.');
      renderDashboard();
    } else {
      if (btn) { btn.disabled = false; btn.textContent = 'Cancel Subscription'; }
    }
  });
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
    var isPremium = featureFlags[f.feature] === true || (featureFlags[f.feature] === undefined && f.premium);
    html += '<div class="module-card">' +
      '<div class="module-info">' +
      '<div class="module-icon">' + f.icon + '</div>' +
      '<div><div class="module-name">' + f.name +
      (isPremium ? ' <span class="premium-tag">Premium</span>' : '') +
      '</div><div class="module-desc">' + f.desc + '</div></div>' +
      '</div>' +
      '<div class="module-actions">' +
      (f.mod ? '<button class="configure-btn" onclick="renderSettings(\'' + f.mod + '\')">Configure</button>' : '') +
      '<div class="toggle ' + (enabled ? 'active' : '') + '" data-feature="' + f.feature + '" data-key="' + f.key + '" onclick="toggleFeature(this)"></div>' +
      '</div></div>';
  });
  html += '</div></div>';

  html += renderPremiumSection(g);

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

function activatePremium() {
  var input = document.getElementById('premium-key-input');
  if (!input) return;
  var key = input.value.trim();
  if (!key) { toast('Please enter a premium key', 'error'); return; }

  var btn = input.nextElementSibling;
  btn.disabled = true;
  btn.textContent = 'Activating...';

  api('/guild/' + currentGuild.id + '/premium', {
    method: 'POST',
    body: JSON.stringify({ key: key })
  }).then(function(result) {
    btn.disabled = false;
    btn.textContent = 'Activate';
    if (result && result.success) {
      currentGuild.premium = true;
      toast('Premium activated!');
      renderDashboard();
    }
  });
}

function toggleFeature(el) {
  if (el.classList.contains('loading')) return;

  var feature = el.getAttribute('data-feature');
  var key = el.getAttribute('data-key');
  var newVal = !el.classList.contains('active');

  el.classList.add('loading');
  el.classList.toggle('active');

  var token = getToken();
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  fetch(API_BASE + '/api/guild/' + currentGuild.id + '/feature/' + feature, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ enabled: newVal })
  }).then(function(res) {
    el.classList.remove('loading');
    if (res.status === 401) { clearToken(); showLogin(); return; }
    if (res.status === 403) {
      el.classList.toggle('active');
      res.json().then(function(err) {
        if (err && err.error === 'premium_required') {
          toast('Premium required — activate a key in the Premium section below.', 'error');
        } else {
          toast(err.error || 'Access denied', 'error');
        }
      }).catch(function() { toast('Access denied', 'error'); });
      return;
    }
    if (!res.ok) {
      el.classList.toggle('active');
      res.json().catch(function() { return {}; }).then(function(err) {
        toast(err.error || 'Something went wrong', 'error');
      });
      return;
    }
    res.json().then(function(result) {
      if (result && result.success) {
        if (!currentGuild.config) currentGuild.config = {};
        currentGuild.config[key] = newVal;
        toast(newVal ? 'Feature enabled' : 'Feature disabled');
      } else {
        el.classList.toggle('active');
        toast('Something went wrong', 'error');
      }
    });
  }).catch(function() {
    el.classList.remove('loading');
    el.classList.toggle('active');
    toast('Connection error. Please try again.', 'error');
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

    if (mod === 'economy') {
      html += renderEconomySettings(data);
    } else if (mod === 'rolerequest') {
      html += renderRoleRequestSettings(data);
    } else {
      html += renderSettingsFields(data, mod);
    }

    if (mod === 'dispatch') {
      html += renderDispatchExtras(data);
    }

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

    if (data.roleIncomeList && data.roleIncomeList.length > 0) {
      html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Role Income</h3></div>';
      html += '<div class="config-row"><span class="config-sublabel" style="font-size:12px;">Use <code>/economysetup roleincome</code> in Discord to add or remove role income entries.</span></div>';
      data.roleIncomeList.forEach(function(r) {
        html += '<div class="config-row"><div class="config-left"><span class="config-label">@' + esc(r.roleName) + '</span>' +
          '<div class="config-sublabel">Earns ' + esc(String(r.amount)) + ' every ' + esc(String(r.cooldown)) + 'h</div></div></div>';
      });
      html += '</div>';
    } else if (mod === 'economy') {
      html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Role Income</h3></div>' +
        '<div class="config-row"><span class="config-sublabel" style="font-size:12px;">No role income configured. Use <code>/economysetup roleincome</code> in Discord to set up periodic income for roles.</span></div>' +
        '</div>';
    }

    html += '</div></div>';
    app.innerHTML = html;
  });
}

/* ── Role Request Settings ── */
function renderRoleRequestSettings(data) {
  var roles = data.requestableRoles || [];
  var html = '<div class="config-section"><div class="config-section-header">' +
    '<h3>Requestable Roles</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + roles.length + ' configured</span>' +
    '</div>';
  if (roles.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No requestable roles set up yet. Use <code>/rolerequestadd</code> in Discord to add roles members can request.</span></div>';
  } else {
    roles.forEach(function(r) {
      var approvers = [];
      if (r.approverRoleCount > 0) approvers.push(r.approverRoleCount + ' approver role' + (r.approverRoleCount === 1 ? '' : 's'));
      if (r.approverMemberCount > 0) approvers.push(r.approverMemberCount + ' approver member' + (r.approverMemberCount === 1 ? '' : 's'));
      html += '<div class="config-row"><div class="config-left">' +
        '<span class="config-label">@' + esc(r.roleName) + '</span>' +
        '<div class="config-sublabel">' + (approvers.length ? approvers.join(' · ') : 'No approvers set') + '</div>' +
        '</div></div>';
    });
    html += '<div class="config-row"><span class="config-sublabel" style="font-size:11px;">Use <code>/rolerequestadd</code> in Discord to add roles or update approvers.</span></div>';
  }
  html += '</div><div id="save-bar-container"></div>';
  return html;
}

/* ── Economy Settings (grouped) ── */
function renderEconomySettings(data) {
  var fields = data.fields || [];
  var groups = {
    general:   { label: 'General',    keys: ['currencySymbol','startingBalance','maxBalance','logChannelId'] },
    work:      { label: 'Work',       keys: ['work_enabled','work_cooldown','work_minPayout','work_maxPayout'] },
    crime:     { label: 'Crime',      keys: ['crime_enabled','crime_cooldown','crime_successRate','crime_minPayout','crime_maxPayout','crime_fineRate'] },
    rob:       { label: 'Robbery',    keys: ['rob_enabled','rob_cooldown','rob_successRate','rob_maxStealPercent'] },
    gambling:  { label: 'Gambling',   keys: ['gambling_enabled','gambling_minBet','gambling_maxBet','gambling_cooldown'] },
    chatmoney: { label: 'Chat Money', keys: ['chatMoney_enabled','chatMoney_minAmount','chatMoney_maxAmount','chatMoney_cooldown'] },
  };
  var fieldMap = {};
  fields.forEach(function(f) { fieldMap[f.key] = f; });
  var html = '';
  ['general','work','crime','rob','gambling','chatmoney'].forEach(function(gKey) {
    var g = groups[gKey];
    var groupFields = g.keys.map(function(k) { return fieldMap[k]; }).filter(Boolean);
    if (groupFields.length === 0) return;
    html += '<div class="config-section" style="margin-bottom:12px;"><div class="config-section-header"><h3>' + g.label + '</h3></div>';
    groupFields.forEach(function(field) { html += renderOneField(field, 'economy'); });
    html += '</div>';
  });
  html += '<div id="save-bar-container"></div>';
  if (data.roleIncomeList && data.roleIncomeList.length > 0) {
    html += '<div class="config-section" style="margin-top:4px;"><div class="config-section-header"><h3>Role Income</h3></div>';
    data.roleIncomeList.forEach(function(r) {
      html += '<div class="config-row"><div class="config-left"><span class="config-label">@' + esc(r.roleName) + '</span>' +
        '<div class="config-sublabel">Earns ' + esc(String(r.amount)) + ' every ' + esc(String(r.cooldown)) + 'h</div></div></div>';
    });
    html += '<div class="config-row"><span class="config-sublabel" style="font-size:11px;">Use <code>/economysetup roleincome</code> in Discord to manage entries.</span></div></div>';
  } else {
    html += '<div class="config-section" style="margin-top:4px;"><div class="config-section-header"><h3>Role Income</h3></div>' +
      '<div class="config-row"><span class="config-sublabel">No role income set up. Use <code>/economysetup roleincome</code> in Discord.</span></div></div>';
  }
  return html;
}

/* ── Dispatch extras (voice channel management) ── */
window._dispatchState = {};
function renderDispatchExtras(data) {
  var html = '';
  var voiceOpts = (data.voiceChannels || []).map(function(c) {
    return '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>';
  }).join('');
  var roleOpts = (data.roles || []).map(function(r) {
    return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>';
  }).join('');

  function buildTags(ids, list, type) {
    if (!ids || ids.length === 0) return '<span style="font-size:12px;color:var(--text-dim);">None added yet.</span>';
    return ids.map(function(id) {
      var item = (list || []).find(function(x) { return x.value === id; });
      return '<span class="channel-tag">' + esc(item ? item.label : id) +
        '<button class="channel-tag-remove" onclick="removeDispatchChannel(\'' + type + '\',\'' + esc(id) + '\')" title="Remove">&#x2715;</button></span>';
    }).join('');
  }

  html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Patrol Voice Channels</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Bot listens here</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="patrol-tags">' + buildTags(data.currentPatrolChannels, data.voiceChannels, 'patrol') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;"><select class="config-select" id="patrol-channel-select"><option value="">Select voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addDispatchChannel(\'patrol\')">Add</button></div></div></div>';

  html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>Traffic Stop Channels</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Officers moved here on 10-11</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="traffic-tags">' + buildTags(data.currentTrafficChannels, data.voiceChannels, 'traffic') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;"><select class="config-select" id="traffic-channel-select"><option value="">Select voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addDispatchChannel(\'traffic\')">Add</button></div></div></div>';

  html += '<div class="config-section" style="margin-top:14px;"><div class="config-section-header"><h3>LEO Roles</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Roles that can trigger dispatch</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;">' +
    '<div class="channel-tags" id="leo-tags">' + buildTags(data.leoRoles, data.roles, 'leo') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;"><select class="config-select" id="leo-role-select"><option value="">Select role...</option>' + roleOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addDispatchChannel(\'leo\')">Add Role</button></div></div></div>';

  return html;
}

function addDispatchChannel(type) {
  var selectId = type === 'leo' ? 'leo-role-select' : (type === 'patrol' ? 'patrol-channel-select' : 'traffic-channel-select');
  var tagsId   = type === 'leo' ? 'leo-tags' : (type === 'patrol' ? 'patrol-tags' : 'traffic-tags');
  var fieldKey = type === 'leo' ? 'leoRoleIds' : (type === 'patrol' ? 'patrolChannelIds' : 'trafficStopChannelIds');
  var sel = document.getElementById(selectId);
  if (!sel || !sel.value) { toast('Select a ' + (type === 'leo' ? 'role' : 'channel') + ' first', 'error'); return; }
  var id = sel.value;
  var label = sel.options[sel.selectedIndex].text;
  if (!window._dispatchState[fieldKey]) window._dispatchState[fieldKey] = (pendingChanges[fieldKey] || []).slice();
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
  if (!window._dispatchState[fieldKey]) window._dispatchState[fieldKey] = (pendingChanges[fieldKey] || []).slice();
  window._dispatchState[fieldKey] = window._dispatchState[fieldKey].filter(function(x) { return x !== id; });
  pendingChanges[fieldKey] = window._dispatchState[fieldKey].slice();
  var tagsEl = document.getElementById(tagsId);
  if (tagsEl) {
    tagsEl.querySelectorAll('.channel-tag').forEach(function(tag) {
      var btn = tag.querySelector('.channel-tag-remove');
      if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf('\'' + id + '\'') !== -1) tag.remove();
    });
    if (tagsEl.querySelectorAll('.channel-tag').length === 0) {
      tagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">None added yet.</span>';
    }
  }
  showSaveBar('dispatch');
}

function renderOneField(field, mod) {
  var isTextarea = field.type === 'textarea';
  var html = '<div class="config-row' + (isTextarea ? ' textarea-row' : '') + '">';
  html += '<div class="config-left"><span class="config-label">' + esc(field.label) + '</span>';
  if (field.description) html += '<div class="config-sublabel">' + esc(field.description) + '</div>';
  html += '</div>';
  if (field.type === 'toggle') {
    html += '<div class="toggle ' + (field.value ? 'active' : '') + '" onclick="toggleField(this,\'' + mod + '\',\'' + field.key + '\')" data-key="' + field.key + '"></div>';
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

function renderSettingsFields(data, mod) {
  if (!data.fields || data.fields.length === 0) {
    return '<div class="config-section"><div class="config-section-header"><h3>Configuration</h3></div>' +
      '<div class="config-row"><span style="color:var(--text-dim);font-size:13px;">No configurable settings. Use Discord commands to set up this module.</span></div></div>' +
      '<div id="save-bar-container"></div>';
  }
  var html = '<div class="config-section"><div class="config-section-header"><h3>Settings</h3></div>';
  data.fields.forEach(function(field) { html += renderOneField(field, mod); });
  html += '</div><div id="save-bar-container"></div>';
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
  var saveBtn = document.querySelector('.save-bar .btn-success');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  api('/guild/' + currentGuild.id + '/settings/' + mod, {
    method: 'POST',
    body: JSON.stringify(pendingChanges)
  }).then(function(result) {
    if (result && result.success) {
      toast('Settings saved');
      pendingChanges = {};
      window._dispatchState = {};
      api('/guild/' + currentGuild.id).then(function(refreshed) {
        if (refreshed) currentGuild = refreshed;
        renderSettings(mod);
      });
    } else {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    }
  });
}

init();
