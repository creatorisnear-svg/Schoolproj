var API_BASE = 'https://roleplaymanager.tail6dd18c.ts.net';
var SITE_URL = 'https://roleplaymanager.xyz';
var BILLING_PORTAL_URL = 'https://billing.stripe.com/p/login/3cIdR9aKdaXpgnA9vs33W00';

var app = document.getElementById('app');
var toastEl = document.getElementById('toast');

var currentUser = null;
var currentGuild = null;
/* Servers the user runs that do not have the bot yet: offered an Add button. */
var addableGuilds = [];

/* Premium or a running trial: what the dashboard should unlock. */
function hasPremiumAccess() {
  return !!(currentGuild && (currentGuild.premium || currentGuild.premiumAccess));
}

/* Pricing links carry where they came from and which server, so the pricing
   page can count the visit and switch Premium on for that server after payment. */
function pricingHref(from) {
  return '/pricing?from=' + from + (currentGuild && currentGuild.id ? '&guild=' + currentGuild.id : '');
}
var guilds = [];
var pendingChanges = {};
var _currentSettingsData = null;
var sidebarOpen = false;
var featureFlags = { dispatch: true, priority: true, appys: true };
var TOPGG_VOTE_URL = '';
var featureStatus = {};
var featureSummary = null;

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

/* ── Failure handling ──────────────────────────────────────────────────────────
 * Requests had no timeout, so a sleeping Koyeb instance left the page on a
 * skeleton loader indefinitely. And when a request did fail, callers did
 * `if (!data) return;` - the loader stayed on screen forever and the only
 * signal was a toast that vanished after 3.5 seconds, with no way to retry
 * short of reloading the page.
 */
var REQUEST_TIMEOUT_MS = 20000;
var lastView = null;

/** Remember how to re-render the current view, so Retry and reconnect can. */
function rememberView(fn) { lastView = fn; }

function retryLastView() {
  if (typeof lastView === 'function') lastView();
  else window.location.reload();
}

/** A recoverable error panel. Replaces a stuck loader with something actionable. */
function errorState(title, message) {
  return '<div class="dashboard-content" style="padding-top:20px;">' +
    '<div class="error-panel">' +
      '<div class="error-panel-title">' + esc(title) + '</div>' +
      '<div class="error-panel-msg">' + esc(message) + '</div>' +
      '<button class="btn btn-primary btn-sm" onclick="retryLastView()">Try Again</button>' +
    '</div></div>';
}

function renderErrorView(title, message) {
  var sidebar = '';
  try { sidebar = renderSidebar(''); } catch (e) { sidebar = ''; }
  app.innerHTML = '<div class="dashboard-layout">' + sidebar + errorState(title, message) + '</div>';
}

/* ── Offline awareness ── */
function offlineBannerHtml() {
  return '<div id="offline-banner" class="offline-banner">' +
    'You are offline. Changes cannot be saved until the connection returns.</div>';
}

function setOffline(off) {
  var existing = document.getElementById('offline-banner');
  if (off && !existing) {
    document.body.insertAdjacentHTML('afterbegin', offlineBannerHtml());
  } else if (!off && existing) {
    existing.parentNode.removeChild(existing);
    toast('Back online', 'success');
    retryLastView();
  }
}

if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('offline', function() { setOffline(true); });
  window.addEventListener('online', function() { setOffline(false); });

  // Without this a thrown exception leaves a blank or half-drawn page with no
  // explanation at all. Now it says so and offers a way back.
  window.addEventListener('error', function(e) {
    console.error('[dashboard] uncaught', e && e.error);
    try { toast('Something broke on this page.', 'error'); } catch (_) {}
  });
  window.addEventListener('unhandledrejection', function(e) {
    console.error('[dashboard] unhandled rejection', e && e.reason);
    try { toast('Something broke on this page.', 'error'); } catch (_) {}
  });
}

/* ── API wrapper ── */
function api(path, opts) {
  opts = opts || {};
  var token = getToken();
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (opts.headers) { for (var k in opts.headers) headers[k] = opts.headers[k]; }
  opts.headers = headers;

  // Abort a request that hangs, so the UI can show an error instead of a
  // loader that never resolves.
  var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timedOut = false;
  var timer = null;
  if (controller) {
    opts.signal = controller.signal;
    timer = setTimeout(function() { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  }
  function done(value) {
    if (timer) { clearTimeout(timer); timer = null; }
    return value;
  }

  return fetch(API_BASE + '/api' + path, opts).then(function(res) {
    if (res.status === 401) { clearToken(); showLogin(); return done(null); }
    if (!res.ok) {
      return res.json().catch(function() { return {}; }).then(function(err) {
        if (err.error === 'premium_required') {
          toast('Premium required. Start the free trial or get Premium in the Premium section below.', 'error');
          var premSection = document.getElementById('premium-section');
          if (premSection) {
            premSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            premSection.style.outline = '2px solid #5865f2';
            setTimeout(function() { premSection.style.outline = ''; }, 2500);
          }
          return done({ __premium_required: true });
        }
        toast(err.error || 'Something went wrong', 'error');
        return done(null);
      });
    }
    return res.json().then(done);
  }).catch(function() {
    done();
    if (timedOut) {
      toast('That took too long. The bot may be starting up. Try again in a moment.', 'error');
    } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOffline(true);
      toast('You are offline.', 'error');
    } else {
      toast('Connection error. Please try again.', 'error');
    }
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
function showLogin(errorCode) {
  var clientId = '1441306995641683978';
  var redirectUri = encodeURIComponent(API_BASE + '/auth/site/callback');
  var state = encodeURIComponent(SITE_URL + '/dashboard/');
  var loginUrl = 'https://discord.com/api/oauth2/authorize?client_id=' + clientId +
    '&redirect_uri=' + redirectUri + '&response_type=code&scope=identify%20guilds&state=' + state;

  var errorMessages = {
    'auth_failed': 'Sign-in failed. This is usually caused by an expired link or a configuration issue. Please try again.',
    'no_domain': 'Server configuration error. Please contact the bot owner.',
  };
  var errorHtml = errorCode
    ? '<p style="color:#f04747;font-size:0.85rem;margin-bottom:12px;">' + (errorMessages[errorCode] || 'Authentication error: ' + esc(errorCode) + '. Please try again.') + '</p>'
    : '';

  app.innerHTML =
    '<div class="login-page"><div class="login-box">' +
    '<img src="/img/logo.png" alt="RPM">' +
    '<h2>Dashboard</h2>' +
    '<p>Sign in with Discord to manage your servers.</p>' +
    errorHtml +
    '<a href="' + loginUrl + '" class="btn btn-primary" style="width:100%;justify-content:center;">Sign in with Discord</a>' +
    '</div></div>';
}

function loadFeatureFlags(callback) {
  fetch(API_BASE + '/api/public/features').then(function(r) { return r.json(); }).then(function(flags) {
    featureFlags = flags || { dispatch: true, priority: true, appys: true };
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
  if (hash && hash.length > 1) {
    var hashParams = new URLSearchParams(hash.slice(1));
    var hashToken = hashParams.get('token');
    var hashError = hashParams.get('error');
    history.replaceState(null, '', window.location.pathname);
    if (hashToken) {
      setToken(hashToken);
    } else if (hashError) {
      showLogin(hashError);
      return;
    }
  }
  var token = getToken();
  if (!token) { showLogin(); return; }

  app.innerHTML = fullPageLoader('Loading');

  loadRegistry(function() { loadFeatureFlags(function() {
    api('/me').then(function(data) {
      if (!data || !data.user) { clearToken(); showLogin(); return; }
      currentUser = data.user;
      guilds = data.guilds || [];
      addableGuilds = data.addable || [];
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
      // Links from the bot, such as /directory, open a given server and page.
      try {
        var qp = new URLSearchParams(window.location.search);
        if (/^\d{17,20}$/.test(qp.get('guild') || '')) {
          saveSession(qp.get('guild'), qp.get('section') || null);
          history.replaceState({}, '', window.location.pathname);
        }
      } catch (e) {}
      var savedGuildId = getSavedGuildId();
      var savedSection = getSavedSection();
      if (savedGuildId && guilds.some(function(g) { return g.id === savedGuildId; })) {
        selectServer(savedGuildId, savedSection);
      } else {
        renderServerSelect();
      }
    });
  }); });
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
    '</div>' +
    (addableGuilds.length
      ? '<div class="dash-header" style="margin-top:24px;"><h1 style="font-size:18px;">Add it to another server</h1><p>Servers you run that do not have RolePlayManager yet.</p></div>' +
        '<div class="server-list">' + addableGuilds.map(function(g) {
          return '<a class="server-card" style="text-decoration:none;color:inherit;" target="_blank" rel="noopener" href="https://discord.com/oauth2/authorize?client_id=1441306995641683978&permissions=8&scope=bot%20applications.commands&guild_id=' + encodeURIComponent(g.id) + '&disable_guild_select=true">' +
            '<div class="server-icon">' + (g.icon ? '<img src="https://cdn.discordapp.com/icons/' + g.id + '/' + g.icon + '.png?size=64" alt="">' : esc(g.name.charAt(0))) + '</div>' +
            '<div style="flex:1;min-width:0;"><div class="server-name">' + esc(g.name) + '</div><div class="server-members">Not added yet</div></div>' +
            '<span class="btn btn-primary btn-sm">Add bot</span></a>';
        }).join('') + '</div>'
      : '') +
    '</div>';
}

// Premium state comes from the registry, which the API resolves per feature
// (a dev-panel FeatureFlag row, else the feature's premiumDefault). The old
// version hardcoded dispatch/priority/appys here - a fourth copy of that list.
function isFlagPremium(featureKey) {
  for (var i = 0; i < REGISTRY.length; i++) {
    if (REGISTRY[i].key === featureKey) return REGISTRY[i].premium === true;
  }
  if (featureKey in featureFlags) return featureFlags[featureKey] === true;
  return false;
}

function selectServer(guildId, section) {
  saveSession(guildId, section || null);
  app.innerHTML = fullPageLoader('Loading server');
  Promise.all([
    api('/guild/' + guildId),
    fetch(API_BASE + '/api/public/features').then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }),
    fetch(API_BASE + '/api/public/registry').then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }),
    api('/guild/' + guildId + '/status').catch(function() { return null; })
  ]).then(function(results) {
    var data = results[0];
    featureFlags = results[1] || { dispatch: true, priority: true, appys: true };
    applyRegistry(results[2]);
    // Real readiness per feature, not just which toggles are on.
    featureStatus = (results[3] && results[3].statuses) || {};
    featureSummary = (results[3] && results[3].summary) || null;
    if (!data) {
      renderErrorView('Could not load this server', 'The bot did not respond, or it is no longer in this server.');
      return;
    }
    currentGuild = data;
    pendingChanges = {};
    if (section === 'directory') { renderDirectory(); } else if (section === 'branding') { renderBranding(); } else if (section) { renderSettings(section); } else { renderDashboard(); }
  });
}

/* ── Feature definitions ──────────────────────────────────────────────────────
 * These used to be three hand-maintained arrays in this file - FEATURES,
 * SIDEBAR_GROUPS and a FEATURE_SECTIONS local inside renderDashboard - which had
 * drifted apart from each other and from the bot. They are now derived from
 * GET /api/public/registry, which serves src/config/features.js. site/ is static
 * and cannot import the bot's modules, so the API is the bridge.
 *
 * Everything below is rebuilt by applyRegistry(). Until that resolves the arrays
 * are empty, which renders an empty list rather than a wrong one.
 */
var REGISTRY = [];
var FEATURES = [];
var SIDEBAR_GROUPS = [];
var FEATURE_SECTIONS = [];

function applyRegistry(payload) {
  var features = (payload && payload.features) || [];
  if (!features.length) return;
  REGISTRY = features.slice().sort(function(a, b) { return a.order - b.order; });
  if (payload.topggVoteUrl) TOPGG_VOTE_URL = payload.topggVoteUrl;

  // Only features with a config toggle can be counted or switched on.
  FEATURES = REGISTRY.filter(function(f) { return f.configKey; }).map(function(f) {
    return {
      key: f.configKey,
      feature: f.key,
      name: f.label,
      desc: f.short,
      mod: f.mod,
      premium: f.premium,
    };
  });

  var groups = [];
  REGISTRY.forEach(function(f) {
    var last = groups[groups.length - 1];
    if (last && last.title === f.group) { last.items.push(f); return; }
    groups.push({ title: f.group, items: [f] });
  });

  SIDEBAR_GROUPS = groups.map(function(g) {
    return {
      title: g.title,
      items: g.items.map(function(f) {
        return { id: f.mod, label: f.label, premium: f.premium, freeTier: f.freeTier || null };
      }),
    };
  });

  FEATURE_SECTIONS = groups.map(function(g) {
    return {
      title: g.title,
      items: g.items.map(function(f) {
        return {
          id: f.mod,
          label: f.label,
          desc: f.short,
          long: f.long,
          feature: f.key,
          featureKey: f.configKey || null,
          premium: f.premium,
        };
      }),
    };
  });
}

function loadRegistry(callback) {
  fetch(API_BASE + '/api/public/registry')
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(payload) { applyRegistry(payload); callback(); })
    .catch(function() { callback(); });
}

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
        return '<div class="sidebar-item ' + (active === m.id ? 'active' : '') + '" onclick="closeSidebar();renderSettings(\'' + m.id + '\')">' + m.label + (m.premium ? ' <span title="' + (m.freeTier ? 'Free servers get ' + esc(m.freeTier) : 'Premium only') + '" style="font-size:9px;background:' + (m.freeTier ? 'var(--blue, #5865f2)' : 'var(--accent)') + ';color:#fff;padding:1px 5px;border-radius:3px;vertical-align:middle;font-weight:700;letter-spacing:0.3px;margin-left:2px;">' + (m.freeTier ? 'PART' : 'PRO') + '</span>' : '') + '</div>';
      }).join('') +
      '</div>';
  }).join('');
  return '<div class="sidebar" id="main-sidebar">' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Server</div>' +
    '<div class="sidebar-item ' + (active === 'overview' ? 'active' : '') + '" onclick="closeSidebar();renderDashboard()">Overview</div>' +
    '<div class="sidebar-item" onclick="closeSidebar();renderServerSelect()">Switch Server</div>' +
    '</div>' +
    '<div class="sidebar-section"><div class="sidebar-section-title">Grow</div>' +
    '<div class="sidebar-item ' + (active === 'directory' ? 'active' : '') + '" onclick="closeSidebar();renderDirectory()">Server Directory</div>' +
    '<div class="sidebar-item ' + (active === 'branding' ? 'active' : '') + '" onclick="closeSidebar();renderBranding()">Bot Branding <span style="font-size:9px;background:var(--accent);color:#fff;padding:1px 5px;border-radius:3px;vertical-align:middle;font-weight:700;letter-spacing:0.3px;margin-left:2px;">PRO</span></div>' +
    '<div class="sidebar-item" onclick="closeSidebar();exportServerData()">Export Data</div>' +
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
  rememberView(renderDashboard);
  if (currentGuild) saveSession(currentGuild.id, null);
  var g = currentGuild;
  var config = g.config || {};

  // Readiness, not toggle count. "12 / 15 active" used to count enabled flags,
  // and ensureEnabled sets those the moment a menu is opened - so a server could
  // read 12/15 with nothing actually configured.
  var readyCount = 0, incompleteCount = 0, offCount = 0;
  var incompleteNames = [];
  var firstIncompleteMod = null;
  for (var _k in featureStatus) {
    if (!Object.prototype.hasOwnProperty.call(featureStatus, _k)) continue;
    var _s = featureStatus[_k].status;
    if (_s === 'ready') { readyCount++; continue; }
    if (_s === 'off') { offCount++; continue; }
    if (_s !== 'incomplete') continue;
    incompleteCount++;
    for (var _i = 0; _i < REGISTRY.length; _i++) {
      if (REGISTRY[_i].key !== _k) continue;
      incompleteNames.push(REGISTRY[_i].label);
      if (!firstIncompleteMod) firstIncompleteMod = REGISTRY[_i].mod;
      break;
    }
  }
  var haveStatus = featureSummary !== null;
  var enabledCount = FEATURES.filter(function(f) { return !!config[f.key]; }).length;
  var totalCount = FEATURES.length;
  var hasLogChannel = !!config.logChannelId;

  var html = '<div class="dashboard-layout">' + renderSidebar('overview') +
    '<div class="dashboard-content">' +
    sidebarToggleBtn('Menu') +
    '<div class="mobile-back" onclick="closeSidebar();renderServerSelect()">&#8249; Switch Server</div>' +
    '<div class="dash-header"><h1>' + esc(g.name) + '</h1><p>' +
    (haveStatus
      ? (readyCount + ' ready' +
         (incompleteCount ? ' · ' + incompleteCount + ' need finishing' : '') +
         (offCount ? ' · ' + offCount + ' off' : ''))
      : (enabledCount > 0
          ? enabledCount + ' feature' + (enabledCount !== 1 ? 's' : '') + ' active'
          : 'No features enabled yet. Follow the guide below.')) +
    '</p></div>';

  // Recruiting is what owners care about most, and the directory is free.
  if (!g.directoryListed) {
    html += '<div class="config-section" style="margin-bottom:16px;border-color:rgba(96,165,250,0.35);"><div class="config-row" style="gap:12px;flex-wrap:wrap;">' +
      '<div style="flex:1;min-width:220px;"><div style="font-weight:700;font-size:14px;margin-bottom:4px;">Get new members</div>' +
      '<div style="font-size:12.5px;color:var(--text-muted);line-height:1.5;">List ' + esc(g.name) + ' in the free server directory at roleplaymanager.xyz/servers, where PS5 and Xbox players look for a GTA RP server to join.</div></div>' +
      '<button class="btn btn-primary btn-sm" onclick="renderDirectory()">List your server</button></div></div>';
  }

  // ── Stats row ──────────────────────────────────────────────────────────────
  html += '<div class="dash-grid" style="margin-bottom:16px;">' +
    '<div class="dash-card"><div class="dash-label">Members</div><div class="dash-value">' + (g.memberCount || 0).toLocaleString() + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">Premium</div><div class="dash-value" style="font-size:15px;color:' + (g.premium ? 'var(--green)' : 'var(--text-dim)') + '">' + (g.premium ? 'Active' : 'Inactive') + '</div></div>' +
    '<div class="dash-card"><div class="dash-label">' + (haveStatus ? 'Features Ready' : 'Active Features') + '</div><div class="dash-value">' + (haveStatus ? readyCount : enabledCount) + ' / ' + totalCount + '</div>' + (haveStatus && incompleteCount ? '<div class="dash-sub" style="font-size:11px;color:var(--text-dim);margin-top:2px;">' + incompleteCount + ' need finishing</div>' : '') + '</div>' +
    '</div>';

  // ── Getting started ────────────────────────────────────────────────────────
  // Previously gated on !hasLogChannel alone, so it vanished forever the moment
  // a log channel was set - even with every feature still unconfigured - and its
  // third step had no button. It now stays while there is something to act on.
  if (!hasLogChannel || incompleteCount > 0) {
    html +=
      '<div class="setup-guide" style="margin-bottom:16px;">' +
        '<div class="setup-guide-title">Getting Started</div>' +
        '<div class="setup-guide-sub">' +
          (hasLogChannel
            ? 'You have features switched on that are not finished yet. Members cannot use those until they are.'
            : 'Complete these steps to get the bot working on your server') +
        '</div>' +
        '<div class="setup-steps">' +
          (!hasLogChannel
            ? '<div class="setup-step">' +
                '<div class="setup-step-num">1</div>' +
                '<div class="setup-step-body">' +
                  '<div class="setup-step-title">Set a log channel</div>' +
                  '<div class="setup-step-desc">Pick a private text channel where the bot records everything: strikes, verifications, tickets. Staff-only channels work best.</div>' +
                '</div>' +
                '<button class="btn btn-primary btn-sm" onclick="renderSettings(\'general\')">Set Channel &rsaquo;</button>' +
              '</div>' +
              '<div class="setup-step">' +
                '<div class="setup-step-num">2</div>' +
                '<div class="setup-step-body">' +
                  '<div class="setup-step-title">Add staff members</div>' +
                  '<div class="setup-step-desc">Give trusted members access to bot commands without handing out Administrator.</div>' +
                '</div>' +
                '<button class="btn btn-secondary btn-sm" onclick="renderSettings(\'staff\')">Manage Staff &rsaquo;</button>' +
              '</div>'
            : '') +
          (incompleteCount > 0
            ? '<div class="setup-step">' +
                '<div class="setup-step-num">' + (hasLogChannel ? '1' : '3') + '</div>' +
                '<div class="setup-step-body">' +
                  '<div class="setup-step-title">Finish ' + incompleteCount + ' feature' + (incompleteCount !== 1 ? 's' : '') + '</div>' +
                  '<div class="setup-step-desc">' + esc(incompleteNames.slice(0, 3).join(', ')) +
                    (incompleteNames.length > 3 ? ' and ' + (incompleteNames.length - 3) + ' more' : '') +
                    '. Each is switched on but still missing something.</div>' +
                '</div>' +
                '<button class="btn btn-primary btn-sm" onclick="renderSettings(\'' + esc(firstIncompleteMod || 'general') + '\')">Finish Setup &rsaquo;</button>' +
              '</div>'
            : '<div class="setup-step">' +
                '<div class="setup-step-num">3</div>' +
                '<div class="setup-step-body">' +
                  '<div class="setup-step-title">Turn on the features you want</div>' +
                  '<div class="setup-step-desc">Everything below is off by default. Each one explains what it does. Switch on whatever fits your server.</div>' +
                '</div>' +
              '</div>') +
        '</div>' +
      '</div>';
  }

  // ── Features, grouped by what you need to do about them ────────────────────
  // Ordered needs-setup first, then ready, then off. The off list carries the
  // full description: an owner who has never heard of Civilian Jobs or Sticky
  // Messages learns what they are here rather than from a 10-word fragment.
  var buckets = { incomplete: [], ready: [], off: [] };
  FEATURE_SECTIONS.forEach(function(section) {
    section.items.forEach(function(m) {
      var st = (m.feature && featureStatus[m.feature]) || null;
      var key = st && buckets[st.status] ? st.status : (m.featureKey && config[m.featureKey] ? 'ready' : 'off');
      buckets[key].push({ item: m, st: st, group: section.title });
    });
  });

  function featureRow(entry, showLong) {
    var m = entry.item;
    var st = entry.st;
    var enabled = m.featureKey ? !!config[m.featureKey] : true;
    var isPremium = m.feature ? isFlagPremium(m.feature) : false;

    var badge = '';
    if (st && st.status === 'ready') badge = ' <span class="status-tag ready">Ready</span>';
    else if (st && st.status === 'incomplete') badge = ' <span class="status-tag incomplete">Needs setup</span>';

    var missingNote = '';
    if (st && st.status === 'incomplete' && st.missing && st.missing.length) {
      missingNote = '<div class="feature-missing">Still needs: ' +
        st.missing.map(function(x) {
          return esc(x.replace(/Ids?$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase());
        }).join(', ') + '</div>';
    }

    return '<div class="feature-row">' +
      '<div class="feature-row-info">' +
        '<div class="feature-row-name">' + m.label +
          ' <span class="feature-group-tag">' + esc(entry.group) + '</span>' +
          (isPremium ? ' <span class="premium-tag">Premium</span>' : '') + badge +
        '</div>' +
        '<div class="feature-row-desc">' + esc(showLong && m.long ? m.long : m.desc) + '</div>' +
        missingNote +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
        (m.featureKey
          ? '<div class="toggle ' + (enabled ? 'active' : '') + '" data-feature="' + (m.feature || '') + '" data-key="' + m.featureKey + '" data-mod="' + m.id + '" onclick="toggleFeature(this)" title="' + (enabled ? 'Disable' : 'Enable') + ' ' + m.label + '"></div>'
          : '') +
        '<button class="btn btn-secondary btn-sm feature-configure-btn" onclick="renderSettings(\'' + m.id + '\')" title="Configure ' + m.label + '">Configure</button>' +
      '</div>' +
      '</div>';
  }

  function bucketSection(title, sub, entries, showLong) {
    if (!entries.length) return '';
    return '<div class="feature-category">' +
      '<div class="feature-category-title">' + title + ' (' + entries.length + ')</div>' +
      (sub ? '<div class="feature-category-sub">' + sub + '</div>' : '') +
      entries.map(function(e) { return featureRow(e, showLong); }).join('') +
      '</div>';
  }

  html += '<div class="overview-section">' +
    '<div class="overview-section-header">' +
    '<h2 class="overview-section-title">Features</h2>' +
    '<p class="overview-section-sub">Everything the bot can do for this server</p>' +
    '</div><div class="feature-groups">';

  html += bucketSection('Needs setup', 'Switched on, but members cannot use these until the missing pieces are filled in.', buckets.incomplete, false);
  html += bucketSection('Ready', 'Set up and working.', buckets.ready, false);
  html += bucketSection('Not enabled', 'Off right now. Switch on anything that fits your server.', buckets.off, true);

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
      toast('7-day trial activated. Every Premium feature is now unlocked.');
      renderDashboard();
    } else {
      // Any failure now means the server already used its trial, or the request
      // itself failed - api() has already surfaced the reason as a toast. Just
      // re-enable the button so it is not left stuck.
      if (btn) btn.disabled = false;
    }
  });
}

function cancelSubscription() {
  var plan = (currentGuild && currentGuild.premiumDetails && currentGuild.premiumDetails.plan) || 'monthly';
  var planLabel = plan === 'quarterly' ? '3-month' : plan === 'yearly' ? 'yearly' : 'monthly';
  if (!confirm('Cancel your ' + planLabel + ' subscription? Premium stays active until the end of the current billing period. No refunds are issued.')) return;
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
  if (isFlagPremium('dispatch')) premiumItems.push('AI Voice Dispatch: officers talk, the bot answers');
  if (isFlagPremium('appys')) premiumItems.push('Applications: unlimited custom application panels');
  premiumItems.push('Blackjack & Roulette gambling games');
  premiumItems.push('Top-25 leaderboard (free: top 10)');
  premiumItems.push('Unlimited ticket types (free: 5)');
  premiumItems.push('Unlimited role income entries (free: 2)');
  premiumItems.push('Unlimited CAD, vehicles, BOLOs & stickies');

  if (g.premium) {
    var pd = g.premiumDetails || {};
    var subStatus = pd.subscriptionStatus || null;
    var isCancelling = subStatus === 'cancelling';
    var isSubscription = pd.hasStripeSubscription && (pd.plan === 'monthly' || pd.plan === 'quarterly' || pd.plan === 'yearly');
    var periodEnd = pd.subscriptionCurrentPeriodEnd ? new Date(pd.subscriptionCurrentPeriodEnd) : null;
    var periodEndStr = periodEnd ? periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

    var statusBadge = isCancelling
      ? '<span class="status-badge" style="background:rgba(251,191,36,0.12);color:#fbbf24;border:1px solid rgba(251,191,36,0.25);"><span class="status-dot" style="background:#fbbf24;"></span>Cancelling</span>'
      : '<span class="status-badge enabled"><span class="status-dot"></span>Active</span>';

    var isFund = pd.plan === 'fund';
    var fundEndStr = isFund && pd.expiresAt ? new Date(pd.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
    var sublabel = isCancelling && periodEndStr
      ? 'Subscription ends <strong>' + periodEndStr + '</strong>. Premium stays active until then.'
      : fundEndStr
        ? 'Paid for by your members until <strong>' + fundEndStr + '</strong>. Every $5 they chip in adds a month.'
        : premiumItems.join(', ') + ': all unlocked.';

    var planLabel = pd.plan === 'monthly'
      ? '<span style="font-size:11px;color:var(--text-dim);margin-left:6px;">Monthly</span>'
      : pd.plan === 'yearly'
        ? '<span style="font-size:11px;color:var(--text-dim);margin-left:6px;">Yearly</span>'
      : pd.plan === 'quarterly'
        ? '<span style="font-size:11px;color:var(--text-dim);margin-left:6px;">3-Month</span>'
      : isFund
        ? '<span style="font-size:11px;color:var(--text-dim);margin-left:6px;">Paid by members</span>'
        : (pd.subscriptionStatus === null && !isSubscription ? '<span style="font-size:11px;color:var(--text-dim);margin-left:6px;">Lifetime</span>' : '');

    var actionBtns = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">';
    if (!isFund) actionBtns += '<button id="transfer-btn" class="btn btn-secondary btn-sm" onclick="transferPremium()">Transfer Key</button>';
    if (isSubscription) {
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
      '<div><span class="config-label">Free trial is active on this server.</span>' +
      '<div class="config-sublabel">All premium features are unlocked until <strong>' + trialExpiresStr + '</strong>. Consider upgrading before it expires.</div></div>' +
      '<a href="' + pricingHref('dashboard') + '" target="_blank" class="btn btn-primary btn-sm">Upgrade to Premium</a>' +
      '</div></div>';
  }

  return '<div class="config-section" id="premium-section" style="margin-top:16px;border-color:rgba(88,101,242,0.4);">' +
    '<div class="config-section-header" style="background:rgba(88,101,242,0.04);">' +
    '<h3 style="color:#7b8cec;">Premium: Unlock More</h3>' +
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
    '<a href="' + pricingHref('dashboard') + '" target="_blank" class="btn btn-primary btn-sm">View Pricing &amp; Get a Key</a>' +
    '<a href="https://discord.gg/cSdhfGPeV2" target="_blank" class="btn btn-discord btn-sm" style="font-size:11px;">Support Server</a>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:10px;align-items:center;flex-wrap:wrap;">' +
    '<input type="text" id="premium-key-input" class="config-input" placeholder="XXXX-XXXX-XXXX-XXXX" style="flex:1;min-width:180px;max-width:280px;">' +
    '<button id="activate-premium-btn" class="btn btn-primary btn-sm" onclick="activatePremium()">Activate Key</button>' +
    '</div>' +
    (currentGuild && currentGuild.trialUsed
      ? '<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;font-size:12px;color:var(--text-muted);line-height:1.5;">' +
        'This server has had its free trial. Premium switches on the moment the payment goes through, and everything you set up is still saved.</div>'
      : '<div style="border-top:1px solid var(--border);margin-top:14px;padding-top:12px;">' +
        '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);margin-bottom:8px;">Free 7-Day Trial</div>' +
        '<p style="font-size:12px;color:var(--text-muted);margin:0 0 10px;line-height:1.5;">Unlock every Premium feature for 7 days. No card, no signup.</p>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
        '<button class="btn btn-primary btn-sm" onclick="redeemTrial(this)">Start Free Trial</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text-dim);margin-top:6px;">One trial per server, ever.</div>' +
        '</div>') +
    '</div></div></div>';
}

function premFeatureItem(text) {
  return '<div style="display:flex;align-items:flex-start;gap:7px;font-size:12px;color:var(--text-muted);">' +
    '<span style="color:#7b8cec;margin-top:1px;flex-shrink:0;">✦</span>' + esc(text) + '</div>';
}

/* ── Billing Page ── */
function renderBilling() {
  rememberView(renderBilling);
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar('billing') +
    '<div class="dashboard-content"><div style="color:var(--text-muted);font-size:13px;padding-top:20px;">Loading billing info...</div></div></div>';

  api('/guild/' + currentGuild.id + '/premium/billing').then(function(data) {
    if (!data) {
      app.innerHTML = '<div class="dashboard-layout">' + renderSidebar('billing') +
        errorState('Could not load billing', 'The bot did not respond. It may still be starting up.') + '</div>';
      return;
    }

    var planLabel = data.plan === 'monthly' ? 'Monthly ($5 a month)' : data.plan === 'yearly' ? 'Yearly ($39.99 a year)' : data.plan === 'quarterly' ? '3-Month ($14 every 3 months)' : data.plan === 'lifetime' ? 'Lifetime (one payment)' : 'Manual or gifted';
    var statusColor = data.status === 'active' ? 'var(--green)' : data.status === 'cancelling' ? 'var(--amber)' : data.status === 'past_due' ? '#f97316' : 'var(--text-muted)';
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

    var isSubscription = data.hasStripeSubscription && (data.plan === 'monthly' || data.plan === 'quarterly' || data.plan === 'yearly');
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
  var modId = el.getAttribute('data-mod');
  var featureName = el.closest('.feature-row') ? (el.closest('.feature-row').querySelector('.feature-row-name') || {}).textContent : feature;
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
      if (newVal && modId) {
        // Auto-navigate to the configure page so the user can finish setup
        toast('Enabled. Configure it now.');
        setTimeout(function() { renderSettings(modId); }, 700);
      } else {
        toast(newVal ? 'Feature enabled' : 'Feature disabled');
      }
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
        '<a href="https://roleplaymanager.xyz' + pricingHref('dashboard') + '" target="_blank" class="btn btn-primary" style="text-align:center;text-decoration:none;">Purchase Premium</a>' +
        '<div style="border-top:1px solid var(--border);padding-top:10px;">' +
          '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);margin-bottom:8px;">Or try it free for 7 days</div>' +
          '<p style="font-size:13px;color:var(--text-muted);margin:0 0 10px;line-height:1.5;">Unlock every Premium feature for 7 days. No card, no signup.</p>' +
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
  rememberView(function() { renderSettings(mod); });
  if (currentGuild) saveSession(currentGuild.id, mod);
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar(mod) +
    '<div class="dashboard-content" style="padding-top:20px;">' + settingsSkeletonLoader() + '</div></div>';

  api('/guild/' + currentGuild.id + '/settings/' + mod).then(function(data) {
    if (!data) {
      app.innerHTML = '<div class="dashboard-layout">' + renderSidebar(mod) +
        errorState('Could not load these settings', 'The bot did not respond. It may still be starting up.') + '</div>';
      return;
    }
    pendingChanges = {};
    _currentSettingsData = data;

    var html = '<div class="dashboard-layout">' + renderSidebar(mod) +
      '<div class="dashboard-content" id="settings-content">' +
      sidebarToggleBtn('Menu') +
      '<div class="mobile-back" onclick="closeSidebar();renderDashboard()">&#8249; Back to Overview</div>' +
      '<div class="dash-header"><h1>' + esc(data.name) + '</h1><p>' + esc(data.description) + '</p></div>';

    // A trial unlocks everything while it lasts, and a partly free feature
    // keeps its free part usable: only its paid fields are locked.
    var hasAccess = hasPremiumAccess();
    var isPartial = !!data.partial;
    var isPremiumLocked = data.premium && !hasAccess && !isPartial;
    var showPremiumLinks = isPremiumLocked || (isPartial && !hasAccess);

    if (data.premium) {
      html += '<div style="background:var(--amber-bg);border:1px solid rgba(251,191,36,0.2);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--amber);">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        (isPremiumLocked
          ? 'Premium required. Start the free trial or get Premium to configure this feature.'
          : (isPartial && !hasAccess)
            ? 'Partly free: ' + esc(data.freeTier || 'the basics') + ' is free. The locked settings below need Premium.'
            : (currentGuild.onTrial && !currentGuild.premium)
              ? 'Premium feature, unlocked by your free trial.'
              : 'Premium feature, active on this server.') +
        '</div>' +
        (showPremiumLinks
          ? '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
            '<a href="https://roleplaymanager.xyz' + pricingHref('dashboard') + '" target="_blank" style="color:var(--blue);text-decoration:underline;font-size:12px;">Get Premium</a>' +
            '<span style="color:var(--amber-dim);">·</span>' +
            (currentGuild.trialUsed ? '' :
              '<a href="#" onclick="redeemTrial(this);return false;" style="color:var(--blue);text-decoration:underline;font-size:12px;">Start the free trial</a>' +
              '<span style="color:var(--amber-dim);">·</span>') +
            '<a href="#" onclick="renderDashboard();setTimeout(function(){var s=document.getElementById(\'premium-section\');if(s)s.scrollIntoView({behavior:\'smooth\'})},200);return false;" style="color:var(--blue);text-decoration:underline;font-size:12px;">Activate Key</a>' +
            '</div>'
          : '') +
        '</div>';
    }

    if (isPremiumLocked) {
      html += '<div style="position:relative;">' +
        '<div style="pointer-events:none;opacity:0.35;user-select:none;">';
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
    } else if (mod === 'appys') {
      html += renderAppySettings(data);
    } else {
      html += renderSettingsFields(data, mod);
    }

    if (isPremiumLocked) {
      html += '</div>' +
        '<div style="position:absolute;inset:0;cursor:not-allowed;" title="Premium required to configure this feature."></div>' +
        '</div>';
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
    '<p class="config-section-desc">Blacklist a member by Discord ID, gamertag, or both. IPs are never stored here. IP banning activates when a blacklisted member tries to verify again.</p>' +
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
    'IP Ban: block future verifications from the same IP address</label>' +
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
    'Officers speak 10-codes into patrol voice channels, and the bot transcribes the audio, ' +
    'generates an AI dispatcher reply, and reads it back in the channel. Traffic stop channels are part of RPM CyberCom: set them in /setup under RPM CyberCom in Discord.' +
    '</div>' +
    '</div></div>';

  var statusItems = [
    { label: 'Patrol channels', count: patrolCount, ok: patrolCount > 0 },
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
    '<div class="channel-tags" id="patrol-tags">' + (patrolTags || '<span style="font-size:12px;color:var(--text-dim);">No channels added yet. Add at least one so the bot can listen.</span>') + '</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<select class="config-select" id="patrol-channel-select"><option value="">Select a voice channel...</option>' + voiceOpts + '</select>' +
    '<button class="btn btn-secondary btn-sm" onclick="addDispatchChannel(\'patrol\')">Add</button>' +
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
    '<div class="channel-tags" id="leo-tags">' + (leoTags || '<span style="font-size:12px;color:var(--text-dim);">No roles added. Add at least one LEO role to restrict who can use dispatch.</span>') + '</div>' +
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
    leoRoleIds: (data.leoRoles || []).slice()
  };
}

function addDispatchChannel(type) {
  var selectId = type === 'leo' ? 'leo-role-select' : 'patrol-channel-select';
  var tagsId   = type === 'leo' ? 'leo-tags' : 'patrol-tags';
  var fieldKey = type === 'leo' ? 'leoRoleIds' : 'patrolChannelIds';
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
  var tagsId   = type === 'leo' ? 'leo-tags' : 'patrol-tags';
  var fieldKey = type === 'leo' ? 'leoRoleIds' : 'patrolChannelIds';
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
  var limit = hasPremiumAccess() ? '\u221e' : String(freeLimit);
  var count = (data.ticketTypes || []).length;
  var atLimit = !hasPremiumAccess() && count >= freeLimit;
  var roleOpts = (data.roles || []).map(function(r) {
    return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>';
  }).join('');

  var html = '<div class="config-section" style="margin-top:14px;" id="ticket-types-section">' +
    '<div class="config-section-header"><h3>Ticket Types</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + count + ' / ' + limit + ' types</span>' +
    (count > 0 ? '<button class="btn btn-success btn-sm" style="margin-left:auto;" onclick="showTicketPanelPicker(' + JSON.stringify(data.ticketTypes) + ')">Send Panel to Discord</button>' : '') +
    '</div>';

  if (count === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No ticket types yet. Add one below. Each type becomes a button on the ticket panel.</span></div>';
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
      '<select id="tt-role" class="config-select" style="width:100%;"><option value="">Staff role (optional, leave blank for all staff)</option>' + roleOpts + '</select>' +
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
    html += '<div class="config-row"><span class="config-sublabel">No requestable roles yet. Add one below. Members can then request it and staff approve via DM.</span></div>';
  } else {
    roles.forEach(function(r) {
      var approverNames = (r.approverRoleNames || []).join(', ');
      html += '<div class="config-row" style="justify-content:space-between;">' +
        '<div class="config-left">' +
        '<span class="config-label">@' + esc(r.roleName) + '</span>' +
        '<div class="config-sublabel">Approvers: ' + (approverNames ? esc(approverNames) : 'None set, so any staff can approve') + '</div>' +
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
    (tags || '<span style="font-size:12px;color:var(--text-dim);">No channels set, so every voice channel is allowed.</span>') +
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
      tagsEl.innerHTML = '<span style="font-size:12px;color:var(--text-dim);">No channels set, so every voice channel is allowed.</span>';
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
    html += '<div class="config-row"><span class="config-sublabel">No jobs yet. Add a job below. Each job appears in the civ portal job board. Role and shift duration are required.</span></div>';
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

/* ── Applications (Appys) Settings ── */
window._appyEditState = {};

function renderAppySettings(data) {
  var types = data.appyTypes || [];
  var allRoles = data.roles || [];
  var allChannels = data.channels || [];
  var activeTypeIds = data.activeTypeIds || [];

  var roleOpts = allRoles.map(function(r) {
    return '<option value="' + esc(r.value) + '">' + esc(r.label) + '</option>';
  }).join('');
  var channelOpts = allChannels.map(function(c) {
    return '<option value="' + esc(c.value) + '">' + esc(c.label) + '</option>';
  }).join('');

  var html = renderSettingsFields(data, 'appys');

  html += '<div style="display:flex;gap:10px;margin:18px 0 12px;">' +
    '<button id="appy-btn-send" class="btn btn-secondary" style="flex:1;padding:10px 6px;font-size:13px;" onclick="showAppyAction(\'send\')">Send Panel</button>' +
    '<button id="appy-btn-create" class="btn btn-secondary" style="flex:1;padding:10px 6px;font-size:13px;" onclick="showAppyAction(\'create\')">Make Application</button>' +
    '<button id="appy-btn-edit" class="btn btn-secondary" style="flex:1;padding:10px 6px;font-size:13px;" onclick="showAppyAction(\'edit\')">Edit Application</button>' +
    '</div>';

  var panelLastChannel = data.panelChannelId ? (allChannels.find(function(c) { return c.value === data.panelChannelId; }) || null) : null;
  var typeCheckboxes = types.length === 0
    ? '<span class="config-sublabel">No application types created yet.</span>'
    : types.map(function(t) {
        var isChecked = activeTypeIds.length === 0 || activeTypeIds.indexOf(t.typeId) !== -1;
        return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer;">' +
          '<input type="checkbox" value="' + esc(t.typeId) + '" class="appy-type-check"' + (isChecked ? ' checked' : '') + '> ' +
          esc(t.name) + '</label>';
      }).join('');

  html += '<div id="appy-action-send" style="display:none;border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--card);flex-direction:column;gap:12px;">' +
    '<div style="font-size:13px;font-weight:600;color:var(--text);">Send Panel</div>' +
    '<span class="config-sublabel">Configure the embed, choose which application types are included, then send to a channel.</span>' +
    '<div class="config-row"><label class="config-label">Panel Title</label>' +
    '<input id="appy-panel-header" type="text" class="config-input" placeholder="Applications" value="' + esc(data.panelHeader || 'Applications') + '"></div>' +
    '<div class="config-row"><label class="config-label">Panel Description</label>' +
    '<input id="appy-panel-body" type="text" class="config-input" placeholder="Click the button below to apply." value="' + esc(data.panelBody || '') + '"></div>' +
    '<div class="config-row"><label class="config-label">Banner Image URL</label>' +
    '<input id="appy-panel-image" type="text" class="config-input" placeholder="https://i.imgur.com/..." value="' + esc(data.panelImageUrl || '') + '"></div>' +
    '<div style="font-size:12px;color:var(--text-dim);margin-bottom:2px;">Application Types to Include</div>' +
    '<div style="display:flex;flex-direction:column;gap:8px;">' + typeCheckboxes + '</div>' +
    '<div class="config-row"><label class="config-label">Panel Channel</label>' +
    '<select id="appy-send-channel" class="config-select" style="min-width:200px;"><option value="">Where the panel button is posted...</option>' +
    allChannels.map(function(c) { return '<option value="' + esc(c.value) + '"' + (c.value === data.panelChannelId ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') +
    '</select></div>' +
    (panelLastChannel ? '<span class="config-sublabel">Last sent to: <code>#' + esc(panelLastChannel.label) + '</code></span>' : '') +
    '<div class="config-row"><label class="config-label">Applications Go To</label>' +
    '<select id="appy-review-channel" class="config-select" style="min-width:200px;"><option value="">Where staff review submissions...</option>' +
    allChannels.map(function(c) { return '<option value="' + esc(c.value) + '"' + (c.value === data.reviewChannelId ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') +
    '</select></div>' +
    '<div style="display:flex;gap:8px;margin-top:4px;">' +
    '<button class="btn btn-primary btn-sm" onclick="sendAppyPanel()">Send Panel to Discord</button>' +
    '</div></div>';

  html += '<div id="appy-action-create" style="display:none;border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--card);flex-direction:column;gap:12px;">' +
    '<div style="font-size:13px;font-weight:600;color:var(--text);">Make Application</div>' +
    '<input id="appy-name" type="text" class="config-input" placeholder="Application name (e.g. LEO Application)">' +
    '<input id="appy-desc" type="text" class="config-input" placeholder="Short description shown in the select menu (optional)">' +
    '<div style="font-size:12px;color:var(--text-dim);">Accept Role (optional, given when accepted)</div>' +
    '<select id="appy-role" class="config-select"><option value="">No role on accept</option>' + roleOpts + '</select>' +
    '<div style="font-size:12px;color:var(--text-dim);">Review Channel (where submissions for this application go)</div>' +
    '<select id="appy-review-ch" class="config-select" style="min-width:200px;"><option value="">Use global review channel</option>' + channelOpts + '</select>' +
    '<div style="font-size:12px;color:var(--text-dim);">Review Ping Roles (optional, pinged on new submissions; only these roles can accept or deny)</div>' +
    '<div id="appy-ping-role-list" style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;background:var(--bg-input);">' +
    allRoles.map(function(r) {
      return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer;">' +
        '<input type="checkbox" class="appy-ping-role-check" value="' + esc(r.value) + '"> ' + esc(r.label) + '</label>';
    }).join('') +
    (allRoles.length === 0 ? '<span class="config-sublabel">No roles found.</span>' : '') +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-dim);">Acceptance Message (optional, sent to the applicant when accepted)</div>' +
    '<textarea id="appy-accept-msg" class="config-input" placeholder="e.g. Welcome to the team! Please read #rules and introduce yourself." rows="3" style="resize:vertical;min-height:60px;"></textarea>' +
    '<div style="font-size:12px;color:var(--text-dim);">Questions</div>' +
    '<div id="appy-questions-list" style="display:flex;flex-direction:column;gap:6px;"></div>' +
    '<button class="btn btn-secondary btn-sm" style="align-self:flex-start;" onclick="addAppyQuestion(null,\'appy-questions-list\')">+ Add Question</button>' +
    '<div style="display:flex;gap:8px;margin-top:4px;">' +
    '<button class="btn btn-success btn-sm" onclick="saveAppyType(false)">Save Application</button>' +
    '</div></div>';

  var editTypeList = types.length === 0
    ? '<span class="config-sublabel">No application types created yet.</span>'
    : types.map(function(t) {
        return '<div class="config-row" style="justify-content:space-between;">' +
          '<div class="config-left">' +
          '<span class="config-label" style="font-size:13px;">' + esc(t.name) + '</span>' +
          (t.description ? '<div class="config-sublabel">' + esc(t.description) + '</div>' : '') +
          '<div class="config-sublabel">' + t.questions.length + ' question' + (t.questions.length === 1 ? '' : 's') +
          (t.acceptRoleName ? ' | Accept role: @' + esc(t.acceptRoleName) : '') +
          (t.reviewChannelName ? ' | Review: #' + esc(t.reviewChannelName) : ' | Review: global') +
          (t.reviewPingRoleNames && t.reviewPingRoleNames.length ? ' | Ping roles: ' + t.reviewPingRoleNames.map(function(n) { return '@' + esc(n); }).join(', ') : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;gap:6px;">' +
          '<button class="btn btn-secondary btn-sm" onclick="loadAppyEditForm(\'' + esc(t.typeId) + '\')">Edit</button>' +
          '<button class="btn btn-danger btn-sm" onclick="deleteAppyType(\'' + esc(t.typeId) + '\')">Remove</button>' +
          '</div></div>';
      }).join('');

  html += '<div id="appy-action-edit" style="display:none;border:1px solid var(--border);border-radius:8px;padding:16px;background:var(--card);flex-direction:column;gap:4px;">' +
    '<div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px;">Edit Application</div>' +
    '<div id="appy-edit-type-list" style="display:flex;flex-direction:column;gap:4px;">' + editTypeList + '</div>' +
    '<div id="appy-edit-form" style="display:none;border-top:1px solid var(--border);padding-top:14px;margin-top:10px;flex-direction:column;gap:10px;">' +
    '<div style="font-size:13px;font-weight:600;color:var(--accent);">Editing: <span id="appy-edit-title-label"></span></div>' +
    '<input id="appy-edit-name" type="text" class="config-input" placeholder="Application name">' +
    '<input id="appy-edit-desc" type="text" class="config-input" placeholder="Short description (optional)">' +
    '<div style="font-size:12px;font-weight:600;color:var(--text);">Review Channel</div>' +
    '<div style="font-size:12px;color:var(--text-dim);">Where submissions for THIS application type are posted for staff review.</div>' +
    '<select id="appy-edit-review-ch" class="config-select" style="min-width:200px;"><option value="">Use global review channel</option>' + channelOpts + '</select>' +
    '<div style="font-size:12px;color:var(--text-dim);">Accept Role (optional, given when accepted)</div>' +
    '<select id="appy-edit-role" class="config-select"><option value="">No role on accept</option>' + roleOpts + '</select>' +
    '<div style="font-size:12px;color:var(--text-dim);">Review Ping Roles (optional, pinged on new submissions; only these roles can accept or deny)</div>' +
    '<div id="appy-edit-ping-role-list" style="display:flex;flex-direction:column;gap:6px;max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;background:var(--bg-input);">' +
    allRoles.map(function(r) {
      return '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer;">' +
        '<input type="checkbox" class="appy-edit-ping-role-check" value="' + esc(r.value) + '"> ' + esc(r.label) + '</label>';
    }).join('') +
    (allRoles.length === 0 ? '<span class="config-sublabel">No roles found.</span>' : '') +
    '</div>' +
    '<div style="font-size:12px;color:var(--text-dim);">Acceptance Message (optional, sent to the applicant when accepted)</div>' +
    '<textarea id="appy-edit-accept-msg" class="config-input" placeholder="e.g. Welcome to the team! Please read #rules and introduce yourself." rows="3" style="resize:vertical;min-height:60px;"></textarea>' +
    '<div style="font-size:12px;color:var(--text-dim);">Questions</div>' +
    '<div id="appy-edit-questions-list" style="display:flex;flex-direction:column;gap:6px;"></div>' +
    '<button class="btn btn-secondary btn-sm" style="align-self:flex-start;" onclick="addAppyQuestion(null,\'appy-edit-questions-list\')">+ Add Question</button>' +
    '<input type="hidden" id="appy-edit-id" value="">' +
    '<div style="display:flex;gap:8px;margin-top:4px;">' +
    '<button class="btn btn-success btn-sm" onclick="saveAppyType(true)">Save Changes</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="closeAppyEditForm()">Cancel</button>' +
    '</div></div></div>';

  return html;
}

function showAppyAction(which) {
  ['send', 'create', 'edit'].forEach(function(k) {
    var el = document.getElementById('appy-action-' + k);
    var btn = document.getElementById('appy-btn-' + k);
    var isActive = k === which;
    if (el) el.style.display = isActive ? 'flex' : 'none';
    if (btn) {
      btn.style.borderColor = isActive ? 'var(--accent)' : '';
      btn.style.color = isActive ? 'var(--accent)' : '';
    }
  });
  if (which === 'create') {
    var list = document.getElementById('appy-questions-list');
    if (list && list.children.length === 0) addAppyQuestion(null, 'appy-questions-list');
  }
}

function addAppyQuestion(val, listId) {
  var list = document.getElementById(listId || 'appy-questions-list');
  if (!list) return;
  var idx = list.children.length;
  var qClass = listId === 'appy-edit-questions-list' ? 'appy-edit-question-input' : 'appy-question-input';
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;align-items:flex-start;';
  var ta = document.createElement('textarea');
  ta.className = 'config-input ' + qClass;
  ta.placeholder = 'Question ' + (idx + 1);
  ta.rows = 2;
  ta.style.cssText = 'flex:1;resize:vertical;min-height:40px;';
  ta.value = val || '';
  var btn = document.createElement('button');
  btn.className = 'btn btn-danger btn-sm';
  btn.style.cssText = 'flex-shrink:0;margin-top:2px;';
  btn.textContent = 'Remove';
  btn.setAttribute('onclick', 'this.parentElement.remove()');
  row.appendChild(ta);
  row.appendChild(btn);
  list.appendChild(row);
}

function loadAppyEditForm(typeId) {
  api('/guild/' + currentGuild.id + '/settings/appys').then(function(data) {
    var t = (data.appyTypes || []).find(function(x) { return x.typeId === typeId; });
    if (!t) { toast('Application type not found', 'error'); return; }
    document.getElementById('appy-edit-name').value = t.name || '';
    document.getElementById('appy-edit-desc').value = t.description || '';
    document.getElementById('appy-edit-role').value = t.acceptRoleId || '';
    document.getElementById('appy-edit-accept-msg').value = t.acceptMessage || '';
    document.getElementById('appy-edit-review-ch').value = t.reviewChannelId || '';
    var titleLabel = document.getElementById('appy-edit-title-label');
    if (titleLabel) titleLabel.textContent = t.name || '';
    document.querySelectorAll('.appy-edit-ping-role-check').forEach(function(cb) {
      cb.checked = (t.reviewPingRoleIds || []).indexOf(cb.value) !== -1;
    });
    document.getElementById('appy-edit-id').value = typeId;
    var list = document.getElementById('appy-edit-questions-list');
    list.innerHTML = '';
    (t.questions || []).forEach(function(q) { addAppyQuestion(q, 'appy-edit-questions-list'); });
    if (!list.children.length) addAppyQuestion(null, 'appy-edit-questions-list');
    var editForm = document.getElementById('appy-edit-form');
    editForm.style.display = 'flex';
    editForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function closeAppyEditForm() {
  var editForm = document.getElementById('appy-edit-form');
  if (editForm) editForm.style.display = 'none';
}

function saveAppyType(isEdit) {
  var prefix = isEdit ? 'appy-edit-' : 'appy-';
  var name = (document.getElementById(prefix + 'name').value || '').trim();
  var desc = (document.getElementById(prefix + 'desc').value || '').trim();
  var roleId = document.getElementById(prefix + 'role').value || null;
  var acceptMsg = (document.getElementById(isEdit ? 'appy-edit-accept-msg' : 'appy-accept-msg').value || '').trim();
  var reviewChId = document.getElementById(prefix + 'review-ch').value || null;
  var pingCheckClass = isEdit ? '.appy-edit-ping-role-check' : '.appy-ping-role-check';
  var pingRoleIds = Array.from(document.querySelectorAll(pingCheckClass + ':checked')).map(function(cb) { return cb.value; }).filter(Boolean);
  var typeId = isEdit ? (document.getElementById('appy-edit-id').value || '') : '';
  var qClass = isEdit ? '.appy-edit-question-input' : '.appy-question-input';
  var questions = Array.from(document.querySelectorAll(qClass)).map(function(i) { return i.value.trim(); }).filter(Boolean);
  if (!name) { toast('Enter an application name', 'error'); return; }
  if (!questions.length) { toast('Add at least one question', 'error'); return; }
  var url = isEdit ? '/guild/' + currentGuild.id + '/appys/type/' + typeId : '/guild/' + currentGuild.id + '/appys/type';
  var method = isEdit ? 'PUT' : 'POST';
  _pendingScrollRestore = getDashScrollPos();
  api(url, { method: method, body: JSON.stringify({ name: name, description: desc, questions: questions, acceptRoleId: roleId, acceptMessage: acceptMsg, reviewChannelId: reviewChId, reviewPingRoleIds: pingRoleIds }) }).then(function(r) {
    if (r && r.success) { toast(isEdit ? 'Application updated' : 'Application created'); renderSettings('appys'); }
    else { _pendingScrollRestore = null; if (r && r.error) toast(r.error, 'error'); }
  });
}

function deleteAppyType(typeId) {
  if (!confirm('Remove this application type? Existing submissions will not be deleted.')) return;
  _pendingScrollRestore = getDashScrollPos();
  api('/guild/' + currentGuild.id + '/appys/type/' + typeId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Application type removed'); renderSettings('appys'); }
    else _pendingScrollRestore = null;
  });
}

function sendAppyPanel() {
  var channelId = document.getElementById('appy-send-channel') && document.getElementById('appy-send-channel').value;
  if (!channelId) { toast('Select a panel channel first', 'error'); return; }
  var reviewChannelId = document.getElementById('appy-review-channel') && document.getElementById('appy-review-channel').value;
  if (!reviewChannelId) { toast('Select a channel for applications to go to', 'error'); return; }
  var header = document.getElementById('appy-panel-header') ? document.getElementById('appy-panel-header').value : '';
  var body = document.getElementById('appy-panel-body') ? document.getElementById('appy-panel-body').value : '';
  var imageUrl = document.getElementById('appy-panel-image') ? document.getElementById('appy-panel-image').value : '';
  var activeTypeIds = Array.from(document.querySelectorAll('.appy-type-check:checked')).map(function(c) { return c.value; });
  api('/guild/' + currentGuild.id + '/appys/panel/send', {
    method: 'POST',
    body: JSON.stringify({ channelId: channelId, reviewChannelId: reviewChannelId, panelHeader: header, panelBody: body, panelImageUrl: imageUrl, activeTypeIds: activeTypeIds })
  }).then(function(r) {
    if (r && r.success) { toast('Panel sent to Discord'); renderSettings('appys'); }
    else if (r && r.error) toast(r.error, 'error');
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
        '<div class="config-sublabel">' + esc(e.description || 'No description') + (e.person ? ' · Host: ' + esc(e.person) : '') + '</div>' +
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
  var riLimitLabel = hasPremiumAccess() ? '\u221e' : '2';
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
  if (!hasPremiumAccess() && riList.length >= 2) {
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

  /* ── Business Accounts ── */
  var bizList = data.businessAccounts || [];
  html += '<div class="config-section" style="margin-top:4px;">' +
    '<div class="config-section-header"><h3>Business Accounts</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">' + bizList.length + ' account(s)</span></div>';
  if (bizList.length === 0) {
    html += '<div class="config-row"><span class="config-sublabel">No business accounts yet. Create one below.</span></div>';
  } else {
    bizList.forEach(function(b) {
      var roleBadge = b.roleName
        ? '<span style="font-size:11px;color:var(--text-dim);background:var(--bg-secondary);border:1px solid var(--border);border-radius:4px;padding:1px 6px;margin-left:6px;">' + esc(b.roleName) + '</span>'
        : '<span style="font-size:11px;color:var(--text-dim);font-style:italic;margin-left:6px;">no role</span>';
      html += '<div class="config-row" style="justify-content:space-between;align-items:flex-start;">' +
        '<div class="config-left">' +
        '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">' +
        '<span class="config-label">' + esc(b.name) + '</span>' + roleBadge +
        '</div>' +
        '<div class="config-sublabel">Balance: ' + esc(String(b.balance)) +
        (b.incomeAmount ? ' | Passive: +' + esc(String(b.incomeAmount)) + ' every ' + esc(String(b.incomeCooldownHours)) + 'h' : '') +
        '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        '<button class="btn btn-secondary btn-sm" onclick="loadBizLedger(\'' + esc(b.accountId) + '\',\'' + esc(b.name) + '\')">Ledger</button>' +
        (b.incomeAmount ? '<button class="btn btn-secondary btn-sm" onclick="grantBizIncome(\'' + esc(b.accountId) + '\',\'' + esc(b.name) + '\')" title="Credit one passive income cycle without resetting the cooldown timer">Send Income</button>' : '') +
        '<button class="btn btn-secondary btn-sm" onclick="showBizEditForm(\'' + esc(b.accountId) + '\')">Edit</button>' +
        '<button class="btn btn-danger btn-sm" onclick="deleteBizAccount(\'' + esc(b.accountId) + '\')">Remove</button>' +
        '</div></div>';
    });
  }
  html += '<div id="biz-ledger-panel" style="display:none;border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--card);flex-direction:column;gap:8px;margin-top:8px;">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
    '<div style="font-size:13px;font-weight:600;color:var(--accent);">Ledger: <span id="biz-ledger-title"></span></div>' +
    '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'biz-ledger-panel\').style.display=\'none\'">Close</button>' +
    '</div>' +
    '<div id="biz-ledger-body" style="font-size:12px;color:var(--text-dim);">Loading...</div>' +
    '</div>';
  html += '<div id="biz-edit-form" style="display:none;border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--card);flex-direction:column;gap:8px;margin-top:8px;">' +
    '<div style="font-size:13px;font-weight:600;color:var(--accent);">Editing: <span id="biz-edit-label"></span></div>' +
    '<input id="biz-edit-name" type="text" class="config-input" placeholder="Business name">' +
    '<input id="biz-edit-password" type="password" class="config-input" placeholder="New password (leave blank to keep current)">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<input id="biz-edit-income" type="number" class="config-input" placeholder="Passive income amount (0 = none)" min="0" style="flex:1;min-width:160px;">' +
    '<input id="biz-edit-cooldown" type="number" class="config-input" placeholder="Hours between income" min="1" max="720" style="width:100px;">' +
    '</div>' +
    '<input type="hidden" id="biz-edit-id">' +
    '<div style="display:flex;gap:8px;">' +
    '<button class="btn btn-primary btn-sm" onclick="saveBizAccount()">Save</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'biz-edit-form\').style.display=\'none\'">Cancel</button>' +
    '</div></div>' +
    '<div style="border:1px solid var(--border);border-radius:8px;padding:14px;background:var(--card);display:flex;flex-direction:column;gap:8px;margin-top:8px;">' +
    '<div style="font-size:12px;font-weight:600;color:var(--text);">Create Business Account</div>' +
    '<input id="biz-name" type="text" class="config-input" placeholder="Business name (e.g. Maze Bank)">' +
    '<input id="biz-password" type="password" class="config-input" placeholder="Access password">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
    '<input id="biz-income" type="number" class="config-input" placeholder="Passive income amount (optional)" min="0" style="flex:1;min-width:160px;">' +
    '<input id="biz-cooldown" type="number" class="config-input" placeholder="Hours (default 24)" min="1" max="720" value="24" style="width:100px;">' +
    '</div>' +
    '<span class="config-sublabel">Passive income is automatically credited each cycle when anyone accesses the account via /business.</span>' +
    '<button class="btn btn-success btn-sm" style="align-self:flex-start;" onclick="createBizAccount()">Create Account</button>' +
    '</div>' +
    '</div>';

  /* ── Business Balance Management ── */
  html += '<div class="config-section" style="margin-top:4px;">' +
    '<div class="config-section-header"><h3>Business Balance Management</h3>' +
    '<span style="font-size:11px;color:var(--text-dim);">Add, remove, or set a business account\'s balance</span></div>' +
    '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:10px;">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;width:100%;align-items:center;">' +
    '<select id="biz-adj-select" class="config-select" style="flex:2;min-width:180px;">' +
    '<option value="">Select a business...</option>' +
    bizList.map(function(b) { return '<option value="' + esc(b.accountId) + '">' + esc(b.name) + '</option>'; }).join('') +
    '</select>' +
    '<input id="biz-adj-amount" type="number" class="config-input" placeholder="Amount" min="0" style="width:110px;">' +
    '<button class="btn btn-success btn-sm" onclick="bizAdjust(\'add\')">Add</button>' +
    '<button class="btn btn-danger btn-sm" onclick="bizAdjust(\'remove\')">Remove</button>' +
    '<button class="btn btn-secondary btn-sm" onclick="bizAdjust(\'set\')">Set</button>' +
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

function loadBizLedger(accountId, name) {
  var panel = document.getElementById('biz-ledger-panel');
  var title = document.getElementById('biz-ledger-title');
  var body = document.getElementById('biz-ledger-body');
  if (title) title.textContent = name;
  if (body) body.innerHTML = 'Loading...';
  if (panel) panel.style.display = 'flex';
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  api('/guild/' + currentGuild.id + '/economy/business/' + accountId + '/transactions?limit=50').then(function(txns) {
    if (!body) return;
    if (!txns || txns.length === 0) {
      body.innerHTML = '<span style="color:var(--text-dim);">No transactions yet.</span>';
      return;
    }
    var typeLabel = { deposit: 'Deposit', withdraw: 'Withdraw', pay: 'Payment', income: 'Passive Income' };
    var typeColor = { deposit: '#57f287', withdraw: '#ed4245', pay: '#5865f2', income: '#faa61a' };
    var rows = txns.map(function(t) {
      var sign = (t.type === 'withdraw') ? '-' : '+';
      var color = typeColor[t.type] || 'var(--text)';
      var who = t.username ? esc(t.username) : (t.note ? esc(t.note) : '');
      var dt = new Date(t.createdAt);
      var dateStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">' +
        '<div style="display:flex;flex-direction:column;gap:2px;">' +
        '<span style="color:' + color + ';font-weight:600;">' + esc(typeLabel[t.type] || t.type) + '</span>' +
        (who ? '<span style="color:var(--text-dim);font-size:11px;">' + who + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">' +
        '<span style="color:' + color + ';font-weight:700;">' + sign + t.amount.toLocaleString() + '</span>' +
        '<span style="color:var(--text-dim);font-size:10px;">' + dateStr + '</span>' +
        '</div></div>';
    });
    body.innerHTML = rows.join('');
  }).catch(function() {
    if (body) body.innerHTML = '<span style="color:#ed4245;">Failed to load ledger.</span>';
  });
}

function createBizAccount() {
  var name = (document.getElementById('biz-name').value || '').trim();
  var password = (document.getElementById('biz-password').value || '').trim();
  var income = parseInt(document.getElementById('biz-income').value) || 0;
  var cooldown = parseInt(document.getElementById('biz-cooldown').value) || 24;
  if (!name) { toast('Enter a business name', 'error'); return; }
  if (!password) { toast('Enter a password', 'error'); return; }
  api('/guild/' + currentGuild.id + '/economy/business', {
    method: 'POST',
    body: JSON.stringify({ name: name, password: password, incomeAmount: income, incomeCooldownHours: cooldown }),
  }).then(function(r) {
    if (r && r.success) { toast('Business account created'); renderSettings('economy'); }
    else { toast((r && r.error) || 'Failed to create', 'error'); }
  });
}

function showBizEditForm(accountId) {
  api('/guild/' + currentGuild.id + '/settings/economy').then(function(data) {
    var b = (data.businessAccounts || []).find(function(x) { return x.accountId === accountId; });
    if (!b) { toast('Account not found', 'error'); return; }
    document.getElementById('biz-edit-name').value = b.name || '';
    document.getElementById('biz-edit-password').value = '';
    document.getElementById('biz-edit-income').value = b.incomeAmount || 0;
    document.getElementById('biz-edit-cooldown').value = b.incomeCooldownHours || 24;
    document.getElementById('biz-edit-id').value = accountId;
    var lbl = document.getElementById('biz-edit-label');
    if (lbl) lbl.textContent = b.name;
    var form = document.getElementById('biz-edit-form');
    form.style.display = 'flex';
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function saveBizAccount() {
  var accountId = document.getElementById('biz-edit-id').value;
  var name = (document.getElementById('biz-edit-name').value || '').trim();
  var password = (document.getElementById('biz-edit-password').value || '').trim();
  var income = parseInt(document.getElementById('biz-edit-income').value) || 0;
  var cooldown = parseInt(document.getElementById('biz-edit-cooldown').value) || 24;
  if (!name) { toast('Enter a business name', 'error'); return; }
  api('/guild/' + currentGuild.id + '/economy/business/' + accountId, {
    method: 'PUT',
    body: JSON.stringify({ name: name, password: password || undefined, incomeAmount: income, incomeCooldownHours: cooldown }),
  }).then(function(r) {
    if (r && r.success) { toast('Business account updated'); renderSettings('economy'); }
    else { toast((r && r.error) || 'Failed to update', 'error'); }
  });
}

function deleteBizAccount(accountId) {
  api('/guild/' + currentGuild.id + '/economy/business/' + accountId, { method: 'DELETE' }).then(function(r) {
    if (r && r.success) { toast('Business account removed'); renderSettings('economy'); }
    else { toast((r && r.error) || 'Failed to remove', 'error'); }
  });
}

function grantBizIncome(accountId, name) {
  api('/guild/' + currentGuild.id + '/economy/business/' + accountId + '/grant-income', { method: 'POST' }).then(function(r) {
    if (r && r.success) { toast('Income sent to ' + name + ' (cooldown unaffected)'); renderSettings('economy'); }
    else { toast((r && r.error) || 'Failed to send income', 'error'); }
  });
}

function bizAdjust(action) {
  var accountId = document.getElementById('biz-adj-select') && document.getElementById('biz-adj-select').value;
  var amount = parseInt(document.getElementById('biz-adj-amount') && document.getElementById('biz-adj-amount').value);
  if (!accountId) { toast('Select a business first', 'error'); return; }
  if (isNaN(amount) || amount < 0) { toast('Enter a valid amount', 'error'); return; }
  api('/guild/' + currentGuild.id + '/economy/business/' + accountId + '/adjust-balance', {
    method: 'POST',
    body: JSON.stringify({ action: action, amount: amount }),
  }).then(function(r) {
    if (r && r.success) { toast('Balance ' + action + ' applied. New balance: ' + (r.newBalance !== undefined ? r.newBalance.toLocaleString() : '')); renderSettings('economy'); }
    else { toast((r && r.error) || 'Failed to adjust balance', 'error'); }
  });
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
      if (infoEl && r.newBalance !== undefined) infoEl.textContent = 'Selected: ' + _mmSelectedUser.username + ' · New balance: ' + r.newBalance;
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
  html += '<div class="config-left"><span class="config-label">' + esc(field.label) +
    (field.locked ? ' <span style="font-size:10px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;color:var(--amber);border:1px solid rgba(251,191,36,0.3);border-radius:4px;padding:1px 5px;margin-left:4px;">Premium</span>' : '') +
    '</span>';
  if (field.description) html += '<div class="config-sublabel">' + esc(field.description) + '</div>';
  html += '</div>';
  // A paid field of a partly free feature: shown, so it is clear what
  // Premium adds, but not usable until then.
  if (field.locked) html += '<div style="pointer-events:none;opacity:0.4;user-select:none;" title="Needs Premium">';

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

  if (field.locked) html += '</div>';
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
    '<button class="btn btn-secondary btn-sm" onclick="discardChanges(\'' + mod + '\')">Discard</button>' +
    '<button class="btn btn-success btn-sm" onclick="saveSettings(\'' + mod + '\')">Save Changes</button>' +
    '</div>';
}

function discardChanges(mod) {
  pendingChanges = {};
  // Modules with complex client-side tag state need a full re-render to restore correctly
  if (mod === 'dispatch' || mod === 'moveme') {
    renderSettings(mod);
    return;
  }
  // All other modules: restore in-place from the stored server snapshot
  var content = document.getElementById('settings-content');
  if (content && _currentSettingsData) {
    content.querySelectorAll('[data-key]').forEach(function(el) {
      var key = el.getAttribute('data-key');
      var orig = _currentSettingsData[key];
      if (el.classList.contains('toggle')) {
        // Toggle div — restore active state
        if (orig) { el.classList.add('active'); } else { el.classList.remove('active'); }
      } else if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.value = (orig != null) ? orig : '';
      }
    });
  }
  showSaveBar(mod);
}

function saveSettings(mod) {
  if (Object.keys(pendingChanges).length === 0) return;
  var saveBtn = document.querySelector('.save-bar .btn-success');
  var discardBtn = document.querySelector('.save-bar .btn-secondary');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  if (discardBtn) { discardBtn.disabled = true; }
  // Snapshot now so concurrent edits/discards mid-flight don't corrupt the merge
  var snapshot = Object.assign({}, pendingChanges);
  api('/guild/' + currentGuild.id + '/settings/' + mod, {
    method: 'POST',
    body: JSON.stringify(snapshot)
  }).then(function(result) {
    if (result && result.success) {
      toast('Settings saved');
      // Merge the sent snapshot (not live pendingChanges) into the stored server snapshot
      if (_currentSettingsData) {
        Object.keys(snapshot).forEach(function(k) {
          _currentSettingsData[k] = snapshot[k];
        });
      }
      pendingChanges = {};
      // Rebuild module-specific client state from the just-saved snapshot
      if (mod === 'dispatch' && _currentSettingsData) {
        // The API returns currentPatrolChannels/leoRoles but saves use
        // patrolChannelIds/leoRoleIds — keep alias keys in sync after merge.
        // Traffic stop channels are set in RPM CyberCom, not here.
        if (snapshot.patrolChannelIds !== undefined)
          _currentSettingsData.currentPatrolChannels = snapshot.patrolChannelIds;
        if (snapshot.leoRoleIds !== undefined)
          _currentSettingsData.leoRoles = snapshot.leoRoleIds;
        window._dispatchState = {
          patrolChannelIds: (_currentSettingsData.currentPatrolChannels || []).slice(),
          leoRoleIds: (_currentSettingsData.leoRoles || []).slice()
        };
      } else if (mod === 'moveme' && _currentSettingsData) {
        window._movemeState = {
          allowedChannelIds: (_currentSettingsData.allowedChannelIds || []).slice()
        };
      } else {
        window._dispatchState = {};
      }
      showSaveBar(mod); // hides bar; no page re-render
      // Refresh guild data silently in background
      api('/guild/' + currentGuild.id).then(function(refreshed) {
        if (refreshed) currentGuild = refreshed;
      });
    } else {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
      if (discardBtn) { discardBtn.disabled = false; }
    }
  });
}

init();

/* ── Server Directory ──
   The owner's side of roleplaymanager.xyz/servers: list the server, describe
   it, bump it, see what it gets, and buy a featured spot. */
var directoryState = null;

function renderDirectory() {
  rememberView(renderDirectory);
  saveSession(currentGuild && currentGuild.id, 'directory');
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar('directory') +
    '<div class="dashboard-content">' + sidebarToggleBtn('Menu') +
    '<div class="dash-header"><h1>Server Directory</h1><p>Loading...</p></div></div></div>';

  api('/directory/manage/' + currentGuild.id).then(function(data) {
    if (!data) return;
    directoryState = data;
    var l = data.listing || { listed: false, description: '', platforms: [], region: 'na', tags: [], inviteChannelId: null };
    var o = data.options;
    var listed = l.listed && !l.hidden;
    var now = Date.now();
    var featuredUntil = l.featuredUntil ? new Date(l.featuredUntil) : null;
    var featured = featuredUntil && featuredUntil.getTime() > now;
    var nextBump = l.bumpedAt ? new Date(new Date(l.bumpedAt).getTime() + data.bumpCooldownHours * 3600000) : null;
    var canBump = listed && (!nextBump || nextBump.getTime() <= now);
    var publicUrl = 'https://roleplaymanager.xyz/servers/?q=' + encodeURIComponent(data.name);

    function checks(name, map, selected) {
      return '<div style="display:flex;flex-wrap:wrap;gap:8px;">' + Object.keys(map).map(function(k) {
        return '<label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;cursor:pointer;">' +
          '<input type="checkbox" name="' + name + '" value="' + esc(k) + '"' + (selected.indexOf(k) >= 0 ? ' checked' : '') + '> ' + esc(map[k]) + '</label>';
      }).join('') + '</div>';
    }

    var status = l.hidden
      ? '<span class="status-badge disabled"><span class="status-dot"></span>Removed</span>'
      : listed
        ? '<span class="status-badge"><span class="status-dot"></span>Listed</span>'
        : '<span class="status-badge disabled"><span class="status-dot"></span>Not listed</span>';

    var html = '<div class="dashboard-layout">' + renderSidebar('directory') +
      '<div class="dashboard-content">' + sidebarToggleBtn('Menu') +
      '<div class="mobile-back" onclick="closeSidebar();renderDashboard()">&#8249; Back to Overview</div>' +
      '<div class="dash-header"><h1>Server Directory</h1><p>Get new members. List ' + esc(data.name) +
      ' in the public directory of console GTA RP servers at roleplaymanager.xyz/servers, where PS5 and Xbox players look for a server to join. Listing is free.</p></div>';

    if (l.hidden) {
      html += '<div class="config-section" style="border-color:rgba(248,113,113,0.3);"><div class="config-row"><span style="font-size:13px;color:var(--red, #f87171);">This listing was removed from the directory' +
        (l.hiddenReason ? ': ' + esc(l.hiddenReason) : '') + '. Contact support if you think that was a mistake.</span></div></div>';
    }

    // What it is doing for the server.
    html += '<div class="config-section"><div class="config-section-header"><h3>Your listing</h3>' + status + '</div>' +
      '<div class="config-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">' +
      dirStat('Votes', data.stats.votes, 'last 30 days') +
      dirStat('Join clicks', data.stats.joinClicks, 'last 30 days') +
      dirStat('Rank', data.stats.rank ? '#' + data.stats.rank : 'n/a', data.stats.total ? 'of ' + data.stats.total + ' servers' : '') +
      dirStat('Featured', featured ? 'Yes' : 'No', featured ? 'until ' + featuredUntil.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '') +
      '</div>' +
      (listed
        ? '<div class="config-row" style="gap:8px;flex-wrap:wrap;justify-content:flex-start;">' +
          '<button class="btn btn-primary btn-sm" id="dir-bump" ' + (canBump ? '' : 'disabled') + ' onclick="bumpDirectory(this)">Bump to the top</button>' +
          '<a class="btn btn-secondary btn-sm" href="' + publicUrl + '" target="_blank">See it in the directory</a>' +
          '<span style="font-size:12px;color:var(--text-muted);">' +
          (canBump ? 'Bumping moves you to the top of Recently Bumped. ' : 'Next bump ' + (nextBump ? nextBump.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'soon') + '. ') +
          'Every ' + data.bumpCooldownHours + ' hours' + (data.premium ? ' with Premium.' : '. Premium servers can bump every 2 hours.') + '</span></div>'
        : '') +
      '</div>';

    // The listing itself.
    html += '<div class="config-section"><div class="config-section-header"><h3>Listing details</h3></div>' +
      '<div class="config-row"><div class="config-left"><span class="config-label">Show in the directory</span>' +
      '<div class="config-sublabel">Needs a description, a platform and at least ' + data.minMembers + ' members.</div></div>' +
      '<div class="toggle ' + (l.listed ? 'active' : '') + '" id="dir-listed" onclick="this.classList.toggle(\'active\')"></div></div>' +
      '<div class="config-row textarea-row"><div class="config-left"><span class="config-label">Description</span>' +
      '<div class="config-sublabel">What kind of RP, departments, what makes it good. Up to 500 characters.</div></div>' +
      '<textarea class="config-textarea" id="dir-description" maxlength="500" placeholder="Serious PS5 roleplay with LSPD, BCSO, Fire and EMS. Weekly sessions, active staff, training for new members.">' + esc(l.description || '') + '</textarea></div>' +
      '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;"><span class="config-label">Platforms</span>' + checks('dir-platform', o.platforms, l.platforms || []) + '</div>' +
      '<div class="config-row"><div class="config-left"><span class="config-label">Region</span></div>' +
      '<select class="config-select" id="dir-region">' + Object.keys(o.regions).map(function(k) {
        return '<option value="' + esc(k) + '"' + (l.region === k ? ' selected' : '') + '>' + esc(o.regions[k]) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:8px;"><span class="config-label">Tags <span style="font-weight:400;color:var(--text-muted);font-size:12px;">(up to ' + o.maxTags + ')</span></span>' + checks('dir-tag', o.tags, l.tags || []) + '</div>' +
      '<div class="config-row"><div class="config-left"><span class="config-label">Invite channel</span>' +
      '<div class="config-sublabel">Where people land when they press Join. The bot makes a permanent invite there.</div></div>' +
      '<select class="config-select" id="dir-channel"><option value="">Pick for me</option>' + (data.channels || []).map(function(c) {
        return '<option value="' + esc(c.id) + '"' + (l.inviteChannelId === c.id ? ' selected' : '') + '>#' + esc(c.name) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="config-row" style="justify-content:flex-end;"><button class="btn btn-primary" onclick="saveDirectory(this)">Save listing</button></div>' +
      '</div>';

    // Paid promotion.
    html += '<div class="config-section" style="border-color:rgba(251,191,36,0.3);"><div class="config-section-header" style="background:rgba(251,191,36,0.04);"><h3 style="color:#fbbf24;">Get featured</h3></div>' +
      '<div class="config-row" style="flex-direction:column;align-items:flex-start;gap:10px;">' +
      '<p style="font-size:13px;color:var(--text-muted);margin:0;line-height:1.6;">Featured servers sit at the very top of the directory and on the RolePlayManager home page, above every other server, with a highlighted card. ' +
      'Only ' + o.maxFeatured + ' servers can be featured at once. ' +
      (data.featuredSlotsLeft > 0 || featured
        ? (featured ? 'Buying again adds the time on.' : data.featuredSlotsLeft + ' of ' + o.maxFeatured + ' spots are open right now.')
        : 'All spots are taken right now' + (data.nextFeaturedOpening ? '; the next one opens ' + new Date(data.nextFeaturedOpening).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '') + '.') +
      '</p>' +
      (listed
        ? '<div style="display:flex;gap:8px;flex-wrap:wrap;">' + o.promotions.map(function(p) {
            return '<button class="btn ' + (p.days === 30 ? 'btn-primary' : 'btn-secondary') + ' btn-sm" onclick="promoteDirectory(' + p.days + ', this)"' +
              (data.featuredSlotsLeft > 0 || featured ? '' : ' disabled') + '>Feature for ' + esc(p.label) + ' · $' + (p.amount / 100).toFixed(2) + '</button>';
          }).join('') + '</div>' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted);"><input type="checkbox" id="dir-tos"> I agree to the <a href="/tos" target="_blank" style="color:var(--blue);">Terms of Service</a>.</label>'
        : '<span style="font-size:12px;color:var(--text-muted);">List the server first, then you can feature it.</span>') +
      '</div></div>';

    if (!data.premium) {
      html += '<div class="config-section"><div class="config-row" style="font-size:13px;color:var(--text-muted);line-height:1.6;">' +
        'Premium servers get a Premium badge in the directory, are listed above free servers, and can bump every 2 hours instead of every ' + data.bumpCooldownHours + '. ' +
        '<a href="https://roleplaymanager.xyz' + pricingHref('directory') + '" target="_blank" style="color:var(--blue);">See Premium</a></div></div>';
    }

    html += '</div></div>';
    app.innerHTML = html;
  });
}

function dirStat(label, value, hint) {
  return '<div style="background:var(--bg-secondary, #111318);border:1px solid var(--border);border-radius:8px;padding:10px 12px;">' +
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-dim);">' + esc(label) + '</div>' +
    '<div style="font-size:20px;font-weight:700;margin:2px 0;">' + esc(String(value)) + '</div>' +
    '<div style="font-size:11px;color:var(--text-muted);">' + esc(hint || '') + '</div></div>';
}

function checkedValues(name) {
  return Array.prototype.map.call(document.querySelectorAll('input[name="' + name + '"]:checked'), function(el) { return el.value; });
}

function saveDirectory(btn) {
  var body = {
    listed: document.getElementById('dir-listed').classList.contains('active'),
    description: document.getElementById('dir-description').value,
    platforms: checkedValues('dir-platform'),
    region: document.getElementById('dir-region').value,
    tags: checkedValues('dir-tag'),
    inviteChannelId: document.getElementById('dir-channel').value || null,
  };
  if (directoryState && body.tags.length > directoryState.options.maxTags) {
    toast('Pick up to ' + directoryState.options.maxTags + ' tags.', 'error');
    return;
  }
  btn.disabled = true;
  api('/directory/manage/' + currentGuild.id, { method: 'PUT', body: JSON.stringify(body) }).then(function(res) {
    btn.disabled = false;
    if (!res) return;
    toast(res.listed ? 'Saved. Your server is in the directory.' : 'Saved.');
    renderDirectory();
  });
}

function bumpDirectory(btn) {
  btn.disabled = true;
  api('/directory/manage/' + currentGuild.id + '/bump', { method: 'POST' }).then(function(res) {
    if (!res) { btn.disabled = false; return; }
    toast('Bumped to the top.');
    renderDirectory();
  });
}

function promoteDirectory(days, btn) {
  var tos = document.getElementById('dir-tos');
  if (!tos || !tos.checked) { toast('Tick the Terms of Service box first.', 'error'); return; }
  btn.disabled = true;
  fetch(API_BASE + '/checkout/promote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
    body: JSON.stringify({ guildId: currentGuild.id, days: days, tosAccepted: true })
  }).then(function(r) { return r.json(); }).then(function(d) {
    if (d && d.url) { window.location.href = d.url; return; }
    btn.disabled = false;
    toast((d && d.error) || 'Could not start the payment.', 'error');
  }).catch(function() {
    btn.disabled = false;
    toast('Could not reach the server. Try again in a moment.', 'error');
  });
}

/* ── Bot Branding (Premium) ──
   The bot under the server's own name, picture, banner and profile text, on
   this server only. Reset puts the normal RolePlayManager look back. */
var brandingImages = { avatar: undefined, banner: undefined };

function renderBranding() {
  rememberView(renderBranding);
  saveSession(currentGuild && currentGuild.id, 'branding');
  brandingImages = { avatar: undefined, banner: undefined };
  app.innerHTML = '<div class="dashboard-layout">' + renderSidebar('branding') +
    '<div class="dashboard-content">' + sidebarToggleBtn('Menu') +
    '<div class="dash-header"><h1>Bot Branding</h1><p>Loading...</p></div></div></div>';

  api('/guild/' + currentGuild.id + '/branding').then(function(data) {
    if (!data) return;
    var b = data.branding || {};
    var locked = !data.premium;
    var html = '<div class="dashboard-layout">' + renderSidebar('branding') +
      '<div class="dashboard-content">' + sidebarToggleBtn('Menu') +
      '<div class="mobile-back" onclick="closeSidebar();renderDashboard()">&#8249; Back to Overview</div>' +
      '<div class="dash-header"><h1>Bot Branding</h1><p>Make the bot look like part of ' + esc(currentGuild.name) +
      ': your own name, picture, banner and profile text for the bot, on this server only. Everywhere else it stays RolePlayManager.</p></div>';

    if (locked) {
      html += '<div style="background:var(--amber-bg);border:1px solid rgba(251,191,36,0.2);border-radius:var(--radius);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--amber);">' +
        'Bot branding is a Premium feature. ' +
        (currentGuild.trialUsed ? '' : '<a href="#" onclick="redeemTrial(this);return false;" style="color:var(--blue);text-decoration:underline;">Start the free trial</a> or ') +
        '<a href="https://roleplaymanager.xyz' + pricingHref('branding') + '" target="_blank" style="color:var(--blue);text-decoration:underline;">get Premium</a> to use it.</div>';
    }

    html += '<div class="config-section"' + (locked ? ' style="pointer-events:none;opacity:0.45;"' : '') + '><div class="config-section-header"><h3>How the bot looks here</h3></div>' +
      '<div class="config-row"><div class="config-left"><span class="config-label">Name</span><div class="config-sublabel">Shown instead of ' + esc(data.botName) + ' on this server. Up to 32 characters.</div></div>' +
      '<input type="text" class="config-input" id="br-nick" maxlength="32" value="' + esc(b.nick || '') + '" placeholder="LSPD Dispatch"></div>' +
      '<div class="config-row textarea-row"><div class="config-left"><span class="config-label">Profile text</span><div class="config-sublabel">What members see when they open the bot\'s profile here. Up to 190 characters.</div></div>' +
      '<textarea class="config-textarea" id="br-bio" maxlength="190" placeholder="Official dispatch for Los Santos RP.">' + esc(b.bio || '') + '</textarea></div>' +
      '<div class="config-row"><div class="config-left"><span class="config-label">Picture</span><div class="config-sublabel">' + (b.hasAvatar ? 'A custom picture is set. ' : '') + 'Square PNG, JPG, GIF or WebP, under 2 MB.</div></div>' +
      '<input type="file" id="br-avatar" accept="image/png,image/jpeg,image/gif,image/webp" onchange="brandingFile(this,\'avatar\')"></div>' +
      '<div class="config-row"><div class="config-left"><span class="config-label">Banner</span><div class="config-sublabel">' + (b.hasBanner ? 'A custom banner is set. ' : '') + 'Wide image shown at the top of the profile, under 2 MB.</div></div>' +
      '<input type="file" id="br-banner" accept="image/png,image/jpeg,image/gif,image/webp" onchange="brandingFile(this,\'banner\')"></div>' +
      '<div class="config-row" style="justify-content:flex-end;gap:8px;">' +
      '<button class="btn btn-secondary" onclick="resetBrandingClick(this)">Reset to RolePlayManager</button>' +
      '<button class="btn btn-primary" onclick="saveBranding(this)">Save branding</button></div>' +
      '</div>';

    html += '</div></div>';
    app.innerHTML = html;
  });
}

function brandingFile(input, which) {
  var file = input.files && input.files[0];
  if (!file) { brandingImages[which] = undefined; return; }
  if (file.size > 2 * 1024 * 1024) { toast('That image is over 2 MB.', 'error'); input.value = ''; return; }
  var reader = new FileReader();
  reader.onload = function() { brandingImages[which] = reader.result; };
  reader.readAsDataURL(file);
}

function saveBranding(btn) {
  var body = {
    nick: document.getElementById('br-nick').value.trim() || null,
    bio: document.getElementById('br-bio').value.trim() || null,
  };
  if (brandingImages.avatar) body.avatar = brandingImages.avatar;
  if (brandingImages.banner) body.banner = brandingImages.banner;
  btn.disabled = true;
  api('/guild/' + currentGuild.id + '/branding', { method: 'PUT', body: JSON.stringify(body) }).then(function(res) {
    btn.disabled = false;
    if (!res) return;
    toast('Saved. Discord can take a minute to show the new look.');
    renderBranding();
  });
}

function resetBrandingClick(btn) {
  if (!confirm('Put the bot back to the normal RolePlayManager name and picture on this server?')) return;
  btn.disabled = true;
  api('/guild/' + currentGuild.id + '/branding', { method: 'DELETE' }).then(function(res) {
    btn.disabled = false;
    if (!res) return;
    toast('Back to the normal look.');
    renderBranding();
  });
}

/* ── Export Data ──
   Everything the bot stores for this server, as one JSON file. */
function exportServerData() {
  toast('Preparing your export...');
  fetch(API_BASE + '/api/guild/' + currentGuild.id + '/export', { headers: { 'Authorization': 'Bearer ' + getToken() } })
    .then(function(r) { if (!r.ok) throw new Error('export failed'); return r.blob(); })
    .then(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'RolePlayManager-' + currentGuild.id + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    })
    .catch(function() { toast('Could not export right now. Try again in a moment.', 'error'); });
}
