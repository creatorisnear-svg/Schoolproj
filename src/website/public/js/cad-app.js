/*
 * Web CAD.
 *
 * Three screens: sign in, pick a server, use the CAD. State lives in one object
 * and every screen is a pure render of it, so there is no way for two parts of
 * the page to disagree about which server you are looking at.
 *
 * Everything rendered here - character names, 911 text, officer names, BOLO
 * reasons - was typed by a user of the server. It is escaped on the way into the
 * DOM without exception. `esc()` is not optional politeness; skipping it once
 * turns a character name into script that runs for every officer who looks the
 * person up - and since the access token lives in localStorage, that is exactly
 * what an attacker would be reaching for.
 *
 * The page is served both from roleplaymanager.xyz and from the API host itself,
 * so the API origin is injected by the page as window.CAD_API rather than
 * guessed from the URL.
 */
(function () {
  'use strict';

  var REQUEST_TIMEOUT_MS = 20000;
  var LAST_SERVER_KEY = 'rpm_cad_server';
  var LAST_MODE_KEY = 'rpm_cad_mode';
  var TOKEN_KEY = 'rpm_cad_token';

  // Empty string when the page and API share an origin; the absolute API origin
  // when the page is served from Cloudflare Pages.
  var API = (typeof window !== 'undefined' && window.CAD_API) || '';
  var CLIENT_ID = (typeof window !== 'undefined' && window.CAD_CLIENT_ID) || '1441306995641683978';

  var state = {
    user: null,
    servers: [],
    guildId: null,
    context: null,
    mode: 'civilian',
    view: null,
    data: {},
    loading: false,
    stream: null,
  };

  // ── Utilities ────────────────────────────────────────────────────────────

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(id) { return document.getElementById(id); }

  function show(viewId) {
    ['view-login', 'view-servers', 'view-cad'].forEach(function (id) {
      $(id).hidden = id !== viewId;
    });
  }

  function timeAgo(value) {
    if (!value) return 'unknown';
    var seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
  }

  function money(amount) {
    return '$' + Number(amount || 0).toLocaleString('en-US');
  }

  function store(key, value) {
    // Private browsing and blocked site data both throw here. Remembering the
    // last server is a convenience, so losing it must never break the page.
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* not important enough to handle */ }
  }

  function recall(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  /**
   * The Discord access token.
   *
   * Arrives in the URL fragment after sign-in, which never reaches the server,
   * then moves to localStorage so a refresh does not sign the user out again.
   */
  function captureToken() {
    var hash = location.hash || '';
    if (!hash) return null;

    var token = /[#&]token=([^&]+)/.exec(hash);
    var error = /[#&]error=([^&]+)/.exec(hash);

    // Clear it either way - a token in the address bar outlives the tab in
    // browser history, and a stale error would reappear on every refresh.
    if (token || error) history.replaceState({}, '', location.pathname);

    if (token) { store(TOKEN_KEY, decodeURIComponent(token[1])); return null; }
    return error ? decodeURIComponent(error[1]) : null;
  }

  function token() { return recall(TOKEN_KEY); }

  function signOut() {
    store(TOKEN_KEY, null);
    store(LAST_SERVER_KEY, null);
    if (state.stream) { state.stream.close(); state.stream = null; }
    state.user = null;
    showLogin();
  }

  function toast(message, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = message;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 5000);
  }

  // ── API ──────────────────────────────────────────────────────────────────

  function api(path, options) {
    options = options || {};
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);

    var init = {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {},
    };
    var bearer = token();
    if (bearer) init.headers.Authorization = 'Bearer ' + bearer;
    if (options.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    return fetch(API + '/api/cad' + path, init)
      .then(function (res) {
        clearTimeout(timer);
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.ok) return body;

          // A dead token must send the user back to sign in rather than
          // showing an error they cannot act on. Clearing it matters: otherwise
          // every later request retries with the same rejected token.
          if (res.status === 401) {
            store(TOKEN_KEY, null);
            state.user = null;
            show('view-login');
            throw { handled: true };
          }
          var err = new Error(body.message || body.error || 'Request failed');
          err.status = res.status;
          err.code = body.error;
          err.body = body;
          throw err;
        });
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (err && err.handled) throw err;
        if (err && err.name === 'AbortError') {
          var t = new Error('That took too long. Check your connection and try again.');
          t.code = 'timeout';
          throw t;
        }
        if (err instanceof TypeError) {
          var n = new Error('Could not reach the server.');
          n.code = 'offline';
          throw n;
        }
        throw err;
      });
  }

  function fail(err) {
    if (err && err.handled) return;
    if (err && err.code === 'limit_reached') {
      toast(err.message + ' Upgrade for unlimited.', 'error');
      return;
    }
    toast((err && err.message) || 'Something went wrong.', 'error');
  }

  // ── Sign in ──────────────────────────────────────────────────────────────

  var LOGIN_ERRORS = {
    auth_failed: 'Discord sign-in failed. Please try again.',
    no_domain: 'The server is not configured for sign-in yet.',
  };

  /**
   * Signs in through the same callback the dashboard uses.
   *
   * That callback is already registered with Discord and already asks for the
   * `guilds` scope the server picker needs, so the CAD adds no new setup. It
   * hands the token back in the fragment of whatever URL is passed as state.
   */
  function loginUrl() {
    return 'https://discord.com/api/oauth2/authorize'
      + '?client_id=' + encodeURIComponent(CLIENT_ID)
      // API is empty when the page and API share an origin, but Discord
      // requires an absolute redirect_uri, so fall back to this page's origin.
      + '&redirect_uri=' + encodeURIComponent((API || location.origin) + '/auth/site/callback')
      + '&response_type=code&scope=identify%20guilds'
      + '&state=' + encodeURIComponent(location.origin + location.pathname);
  }

  function showLogin(errorCode) {
    var box = $('login-error');
    if (errorCode) {
      box.textContent = LOGIN_ERRORS[errorCode] || 'Sign-in failed. Please try again.';
      box.hidden = false;
    } else {
      box.hidden = true;
    }
    var link = $('login-link');
    if (link) link.href = loginUrl();
    show('view-login');
  }

  function whoHtml(user) {
    var avatar = user.avatar
      ? 'https://cdn.discordapp.com/avatars/' + esc(user.id) + '/' + esc(user.avatar) + '.png?size=64'
      : null;
    return (avatar ? '<img src="' + avatar + '" alt="">' : '')
      + '<span>' + esc(user.username) + '</span>';
  }

  // ── Server picker ────────────────────────────────────────────────────────

  function serverIcon(server, size) {
    if (server.icon) {
      return '<img class="server-icon" src="https://cdn.discordapp.com/icons/'
        + esc(server.id) + '/' + esc(server.icon) + '.png?size=' + (size || 64)
        + '" alt="" onerror="this.remove()">';
    }
    var initials = String(server.name || '?').trim().slice(0, 2).toUpperCase();
    return '<span class="server-icon">' + esc(initials) + '</span>';
  }

  function renderServers() {
    var body = $('servers-body');

    if (!state.servers.length) {
      body.innerHTML = '<div class="empty">'
        + 'None of your servers have the CAD switched on yet.<br><br>'
        + 'A server admin turns it on with <span class="mono">/setup</span> in Discord, '
        + 'under Roleplay Commands.'
        + '</div>';
      return;
    }

    body.innerHTML = '<div class="server-grid">' + state.servers.map(function (s) {
      var meta = [];
      if (s.memberCount) meta.push(esc(s.memberCount.toLocaleString()) + ' members');
      if (s.leoConfigured) meta.push('LEO available');

      return '<button class="server-card" data-id="' + esc(s.id) + '">'
        + serverIcon(s)
        + '<span class="server-body">'
        + '<span class="server-name">' + esc(s.name) + '</span>'
        + '<span class="server-meta">' + meta.map(esc).join(' · ') + '</span>'
        + '</span>'
        + (s.premium ? '<span class="badge badge-premium">Premium</span>' : '')
        + '</button>';
    }).join('') + '</div>';

    Array.prototype.forEach.call(body.querySelectorAll('.server-card'), function (card) {
      card.addEventListener('click', function () { openServer(card.dataset.id); });
    });
  }

  function showServers() {
    $('picker-who').innerHTML = whoHtml(state.user);
    show('view-servers');
    renderServers();
  }

  // ── The CAD ──────────────────────────────────────────────────────────────

  var CIVILIAN_NAV = [
    { id: 'characters', label: 'My Characters' },
    { id: 'call911', label: 'Call 911' },
    { id: 'fines', label: 'My Fines' },
    { id: 'social', label: 'Social' },
    { id: 'board', label: 'On Duty' },
    { id: 'alerts', label: 'Public Alerts' },
  ];

  var LEO_NAV = [
    { id: 'calls', label: 'Active Calls', badge: 'calls' },
    { id: 'search', label: 'Records' },
    { id: 'bolos', label: 'BOLOs' },
    { id: 'tickets', label: 'Ticket Book' },
    { id: 'units', label: 'Units' },
  ];

  // The fire department works the same 911 queue as law enforcement and keeps
  // its own characters, but has no records access, no ticket book and no
  // 10-code board - matching what /firedepartmentdatabase offers.
  var FIRE_NAV = [
    { id: 'calls', label: 'Active Calls', badge: 'calls' },
    { id: 'characters', label: 'My Characters' },
    { id: 'board', label: 'On Duty' },
  ];

  function nav() {
    if (state.mode === 'leo') return LEO_NAV;
    if (state.mode === 'fire') return FIRE_NAV;
    return CIVILIAN_NAV;
  }

  /**
   * Which modes this member may switch into on this server.
   *
   * Each carries a short label as well as a full one. On a narrow screen the CSS
   * swaps to the short form rather than truncating, because "Law Enforce..."
   * reads worse than "LEO" to the people who actually use it.
   */
  function availableModes() {
    var member = (state.context && state.context.member) || {};
    var modes = [{ id: 'civilian', label: 'Civilian', short: 'Civ' }];
    if (member.isLeo) modes.push({ id: 'leo', label: 'Law Enforcement', short: 'LEO' });
    if (member.isFd) modes.push({ id: 'fire', label: 'Fire / EMS', short: 'Fire' });
    return modes;
  }

  function renderNav() {
    var items = nav().map(function (item) {
      var count = '';
      if (item.badge === 'calls') {
        var open = (state.data.calls || []).length;
        if (open) count = '<span class="count alert">' + open + '</span>';
      }
      return '<button data-view="' + item.id + '" aria-current="'
        + (state.view === item.id ? 'true' : 'false') + '">'
        + '<span>' + esc(item.label) + '</span>' + count + '</button>';
    }).join('');

    var extra = '';
    if (state.mode === 'leo') {
      extra = '<span class="spacer"></span>'
        + '<button data-action="panic" style="color:var(--red)">Panic 10-99</button>';
    }

    var el = $('sidenav');
    el.innerHTML = items + extra;

    Array.prototype.forEach.call(el.querySelectorAll('[data-view]'), function (btn) {
      btn.addEventListener('click', function () { go(btn.dataset.view); });
    });
    var panic = el.querySelector('[data-action="panic"]');
    if (panic) panic.addEventListener('click', confirmPanic);
  }

  function renderTopbar() {
    var server = state.servers.filter(function (s) { return s.id === state.guildId; })[0] || {};
    // Written as innerHTML of a stable wrapper: the icon img carries an onerror
    // that removes itself, so it must not be the element the next render targets.
    $('switch-icon').innerHTML = serverIcon(server, 32);
    $('switch-name').textContent = server.name || 'Server';
    $('cad-who').innerHTML = whoHtml(state.user);

    var ctx = state.context || {};
    $('premium-badge').hidden = !ctx.premium;
    $('dispatch-badge').hidden = !ctx.hasDispatch;

    // Built from the member's roles rather than hard-coded, so somebody with no
    // second role sees one plain label instead of a control they cannot use.
    var modes = availableModes();
    var toggle = $('mode-toggle');
    toggle.hidden = modes.length < 2;
    toggle.innerHTML = modes.map(function (m) {
      return '<button type="button" data-mode="' + esc(m.id) + '" aria-pressed="'
        + (m.id === state.mode ? 'true' : 'false') + '" title="' + esc(m.label) + '">'
        + '<span class="full">' + esc(m.label) + '</span>'
        + '<span class="short">' + esc(m.short) + '</span>'
        + '</button>';
    }).join('');

    Array.prototype.forEach.call(toggle.querySelectorAll('button'), function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
    });
  }

  function loading(message) {
    $('main').innerHTML = '<div class="loading"><span class="spinner"></span> '
      + esc(message || 'Loading') + '</div>';
  }

  function go(view) {
    state.view = view;
    renderNav();
    var handler = VIEWS[view];
    if (!handler) return;

    state.loading = true;
    loading();
    handler().catch(function (err) {
      if (err && err.handled) return;
      $('main').innerHTML = '<div class="panel"><div class="notice error">'
        + esc((err && err.message) || 'Could not load this section.')
        + '</div><button class="btn" id="retry">Try again</button></div>';
      var retry = $('retry');
      if (retry) retry.addEventListener('click', function () { go(view); });
    }).then(function () { state.loading = false; });
  }

  function setMode(mode) {
    var allowed = availableModes().some(function (m) { return m.id === mode; });
    if (!allowed) return;
    state.mode = mode;
    store(LAST_MODE_KEY, mode);
    renderTopbar();
    go(nav()[0].id);
  }

  function openServer(guildId) {
    state.guildId = guildId;
    store(LAST_SERVER_KEY, guildId);
    show('view-cad');
    loading('Opening the CAD');

    api('/' + guildId + '/context').then(function (ctx) {
      state.context = ctx;
      state.data = {};

      var wanted = recall(LAST_MODE_KEY);
      var canUse = availableModes().some(function (m) { return m.id === wanted; });
      state.mode = canUse ? wanted : 'civilian';

      renderTopbar();
      connectStream(guildId);
      go(nav()[0].id);
    }).catch(function (err) {
      if (err && err.handled) return;
      // The server is gone, the CAD was switched off, or membership lapsed -
      // none of which the user can fix from inside the CAD.
      store(LAST_SERVER_KEY, null);
      toast(err.message || 'That server is not available.', 'error');
      showServers();
    });
  }

  // ── Live updates ─────────────────────────────────────────────────────────

  function connectStream(guildId) {
    if (state.stream) { state.stream.close(); state.stream = null; }
    if (typeof EventSource === 'undefined') return;

    // EventSource cannot send an Authorization header, so ask for a one-shot
    // ticket and put that in the query string. Putting the access token there
    // would write a real credential into every access log.
    api('/' + guildId + '/events/ticket')
      .then(function (res) { openStream(guildId, res.ticket); })
      .catch(function () { /* the CAD still works, just without live updates */ });
  }

  function openStream(guildId, ticket) {
    if (state.guildId !== guildId) return;

    var stream = new EventSource(API + '/api/cad/' + guildId + '/events?ticket=' + encodeURIComponent(ticket));
    state.stream = stream;

    stream.addEventListener('changed', function (event) {
      // Ignore anything that arrives after the user moved on.
      if (state.guildId !== guildId) return;

      var changed;
      try { changed = JSON.parse(event.data).changed || []; } catch (e) { return; }

      // Only refresh the section being looked at. A quiet redraw of a form the
      // user is halfway through typing into is worse than a stale number.
      var refresh = {
        calls: ['calls'],
        officers: ['units', 'board'],
        bolos: ['bolos', 'alerts'],
      };
      var shouldRefresh = changed.some(function (key) {
        return (refresh[key] || []).indexOf(state.view) !== -1;
      });

      if (changed.indexOf('calls') !== -1) refreshCallCount();
      if (shouldRefresh && !state.loading) go(state.view);
    });

    // A ticket is single use, so the browser's own retry would reconnect with a
    // spent one and loop. Close it and fetch a fresh ticket instead.
    stream.onerror = function () {
      stream.close();
      if (state.stream === stream) state.stream = null;
      setTimeout(function () {
        if (state.guildId === guildId && !state.stream) connectStream(guildId);
      }, 5000);
    };
  }

  function refreshCallCount() {
    if (state.mode === 'civilian') return;
    api('/' + state.guildId + '/calls').then(function (res) {
      state.data.calls = res.calls || [];
      renderNav();
    }).catch(function () { /* the badge is not worth an error */ });
  }

  // ── Dialog ───────────────────────────────────────────────────────────────

  function dialog(options) {
    var root = $('dialog-root');

    var fields = (options.fields || []).map(function (f) {
      var id = 'f_' + f.name;
      var input;
      if (f.type === 'textarea') {
        input = '<textarea id="' + id + '" maxlength="' + (f.max || 1000) + '"'
          + (f.required ? ' required' : '') + '>' + esc(f.value) + '</textarea>';
      } else if (f.type === 'select') {
        input = '<select id="' + id + '">' + (f.options || []).map(function (o) {
          return '<option value="' + esc(o.value) + '"'
            + (o.value === f.value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
        }).join('') + '</select>';
      } else {
        input = '<input id="' + id + '" type="' + esc(f.type || 'text')
          + '" maxlength="' + (f.max || 200) + '" value="' + esc(f.value) + '"'
          + (f.required ? ' required' : '') + '>';
      }
      return '<div class="field"><label for="' + id + '">' + esc(f.label)
        + (f.required ? ' *' : '') + '</label>' + input + '</div>';
    }).join('');

    root.innerHTML = '<div class="overlay"><div class="dialog" role="dialog" aria-modal="true">'
      + '<h3>' + esc(options.title) + '</h3>'
      + (options.sub ? '<p class="sub">' + esc(options.sub) + '</p>' : '')
      + '<div class="fields">' + fields + '</div>'
      + '<div class="actions">'
      + '<button class="btn" id="dlg-cancel">Cancel</button>'
      + '<button class="btn ' + (options.danger ? 'btn-danger' : 'btn-primary') + '" id="dlg-ok">'
      + esc(options.confirm || 'Save') + '</button>'
      + '</div></div></div>';

    function close() {
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);

    $('dlg-cancel').addEventListener('click', close);
    root.querySelector('.overlay').addEventListener('click', function (e) {
      if (e.target === root.querySelector('.overlay')) close();
    });

    var ok = $('dlg-ok');
    ok.addEventListener('click', function () {
      var values = {};
      var missing = null;
      (options.fields || []).forEach(function (f) {
        var el = $('f_' + f.name);
        values[f.name] = el ? el.value.trim() : '';
        if (f.required && !values[f.name] && !missing) missing = f.label;
      });
      if (missing) return toast(missing + ' is required.', 'error');

      ok.disabled = true;
      ok.textContent = 'Working';
      Promise.resolve(options.onSubmit(values)).then(function () {
        close();
      }).catch(function (err) {
        ok.disabled = false;
        ok.textContent = options.confirm || 'Save';
        fail(err);
      });
    });

    var firstInput = root.querySelector('input, textarea, select');
    if (firstInput) firstInput.focus();
  }

  function panelHead(title, subtitle, actions) {
    return '<div class="panel-head"><div><h2>' + esc(title) + '</h2>'
      + (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') + '</div>'
      + '<span class="spacer"></span>' + (actions || '') + '</div>';
  }

  function bind(selector, handler) {
    Array.prototype.forEach.call($('main').querySelectorAll(selector), function (el) {
      el.addEventListener('click', function () { handler(el); });
    });
  }

  // ── Civilian views ───────────────────────────────────────────────────────

  var VIEWS = {};

  VIEWS.characters = function () {
    return api('/' + state.guildId + '/characters').then(function (res) {
      state.data.characters = res.characters || [];
      var limits = (state.context && state.context.limits) || {};

      var body = state.data.characters.length
        ? state.data.characters.map(characterCard).join('')
        : '<div class="empty">You have not registered a character yet. '
          + 'Your character is the record law enforcement sees when they run your name or plate.</div>';

      $('main').innerHTML = '<div class="panel">'
        + panelHead('My Characters',
            limits.characters
              ? 'This server allows ' + limits.characters + ' characters in total.'
              : 'Unlimited characters on this server.',
            '<button class="btn btn-primary" id="new-character">New Character</button>')
        + body + '</div>';

      $('new-character').addEventListener('click', newCharacter);
      bind('[data-add-vehicle]', function (el) { addVehicle(el.dataset.addVehicle); });
      bind('[data-add-gun]', function (el) { addFirearm(el.dataset.addGun); });
      bind('[data-edit]', function (el) { editCharacter(el.dataset.edit); });
      bind('[data-del-char]', function (el) { deleteCharacter(el.dataset.delChar); });
      bind('[data-del-vehicle]', function (el) {
        removeSub('vehicles', el.dataset.char, el.dataset.delVehicle);
      });
      bind('[data-del-gun]', function (el) {
        removeSub('firearms', el.dataset.char, el.dataset.delGun);
      });
    });
  };

  function characterCard(c) {
    var facts = [
      ['Age', c.age], ['Gender', c.gender], ['Height', c.height], ['Build', c.build],
      ['Hair', c.hairColor], ['Eyes', c.eyeColor], ['Occupation', c.occupation],
      ['Address', c.address], ['Phone', c.phoneNumber], ['Plate', c.licensePlate],
      ["Driver's Licence", c.driversLicense],
    ].filter(function (pair) { return pair[1]; });

    var vehicles = (c.vehicles || []).map(function (v) {
      return '<div class="row"><span>' + esc([v.year, v.color, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle') + '</span>'
        + (v.licensePlate ? '<span class="mono muted">' + esc(v.licensePlate) + '</span>' : '')
        + '<span class="spacer"></span>'
        + '<button class="btn btn-sm" data-del-vehicle="' + esc(v._id) + '" data-char="' + esc(c._id) + '">Remove</button>'
        + '</div>';
    }).join('');

    var guns = (c.guns || []).map(function (g) {
      return '<div class="row"><span>' + esc(g.name) + '</span>'
        + (g.serialNumber ? '<span class="mono muted">' + esc(g.serialNumber) + '</span>' : '')
        + '<span class="spacer"></span>'
        + '<button class="btn btn-sm" data-del-gun="' + esc(g._id) + '" data-char="' + esc(c._id) + '">Remove</button>'
        + '</div>';
    }).join('');

    return '<div class="card">'
      + '<div class="card-head"><h3>' + esc(c.characterName) + '</h3>'
      + (c.status === 'wanted' ? '<span class="badge" style="background:var(--red-bg);border-color:var(--red-border);color:var(--red)">Wanted</span>' : '')
      + '<span class="spacer"></span>'
      + '<button class="btn btn-sm" data-edit="' + esc(c._id) + '">Edit</button>'
      + '<button class="btn btn-sm btn-danger" data-del-char="' + esc(c._id) + '">Delete</button>'
      + '</div>'
      + (facts.length
        ? '<dl class="kv">' + facts.map(function (p) {
            return '<div><dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd></div>';
          }).join('') + '</dl>'
        : '')
      + (c.status === 'wanted' && c.wantedReason
        ? '<div class="notice error" style="margin-top:12px">Wanted: ' + esc(c.wantedReason) + '</div>' : '')
      + '<div class="subhead">Vehicles</div>'
      + (vehicles || '<div class="row muted">No vehicles registered.</div>')
      + '<button class="btn btn-sm" style="margin-top:8px" data-add-vehicle="' + esc(c._id) + '">Add Vehicle</button>'
      + '<div class="subhead">Firearms</div>'
      + (guns || '<div class="row muted">No firearms registered.</div>')
      + '<button class="btn btn-sm" style="margin-top:8px" data-add-gun="' + esc(c._id) + '">Add Firearm</button>'
      + '</div>';
  }

  var CHARACTER_FIELDS = [
    { name: 'characterName', label: 'Full name', required: true, max: 100 },
    { name: 'age', label: 'Age', type: 'number' },
    { name: 'gender', label: 'Gender', max: 40 },
    { name: 'height', label: 'Height', max: 40 },
    { name: 'build', label: 'Build', max: 40 },
    { name: 'hairColor', label: 'Hair colour', max: 40 },
    { name: 'eyeColor', label: 'Eye colour', max: 40 },
    { name: 'occupation', label: 'Occupation', max: 100 },
    { name: 'address', label: 'Address', max: 200 },
    { name: 'phoneNumber', label: 'Phone number', max: 40 },
    { name: 'distinguishingFeatures', label: 'Distinguishing features', type: 'textarea', max: 500 },
    { name: 'scarsAndTattoos', label: 'Scars and tattoos', type: 'textarea', max: 500 },
    { name: 'medicalInfo', label: 'Medical information', type: 'textarea', max: 500 },
    { name: 'emergencyContact', label: 'Emergency contact', max: 200 },
    {
      name: 'veteranStatus', label: 'Status', type: 'select',
      options: [
        { value: 'none', label: 'None' },
        { value: 'veteran', label: 'Veteran' },
        { value: 'organ_donor', label: 'Organ donor' },
      ],
    },
    // Left last and left blank on purpose: leaving it empty issues one. Nobody
    // should have to invent a plate, and a blank plate is what the database
    // index used to collide on.
    { name: 'licensePlate', label: 'License plate (leave blank to be issued one)', max: 16 },
  ];

  function withValues(fields, source) {
    return fields.map(function (f) {
      var copy = {};
      for (var key in f) copy[key] = f[key];
      copy.value = source ? (source[f.name] === null || source[f.name] === undefined ? '' : source[f.name]) : '';
      return copy;
    });
  }

  function newCharacter() {
    dialog({
      title: 'New character',
      sub: 'This is the record law enforcement sees when they run your name or plate.',
      fields: withValues(CHARACTER_FIELDS, null),
      confirm: 'Create',
      onSubmit: function (values) {
        return api('/' + state.guildId + '/characters', { method: 'POST', body: values })
          .then(function () { toast('Character created.', 'ok'); go('characters'); });
      },
    });
  }

  function editCharacter(id) {
    var character = (state.data.characters || []).filter(function (c) { return c._id === id; })[0];
    if (!character) return;

    dialog({
      title: 'Edit ' + character.characterName,
      fields: withValues(CHARACTER_FIELDS, character),
      onSubmit: function (values) {
        return api('/' + state.guildId + '/characters/' + id, { method: 'PATCH', body: values })
          .then(function () { toast('Saved.', 'ok'); go('characters'); });
      },
    });
  }

  function deleteCharacter(id) {
    var character = (state.data.characters || []).filter(function (c) { return c._id === id; })[0];
    dialog({
      title: 'Delete this character?',
      sub: 'Deleting ' + ((character && character.characterName) || 'this character')
        + ' also removes their vehicles and firearms. This cannot be undone.',
      fields: [],
      confirm: 'Delete',
      danger: true,
      onSubmit: function () {
        return api('/' + state.guildId + '/characters/' + id, { method: 'DELETE' })
          .then(function () { toast('Character deleted.', 'ok'); go('characters'); });
      },
    });
  }

  function addVehicle(characterId) {
    dialog({
      title: 'Add vehicle',
      fields: [
        { name: 'make', label: 'Make', max: 60 },
        { name: 'model', label: 'Model', max: 60 },
        { name: 'year', label: 'Year', max: 10 },
        { name: 'color', label: 'Colour', max: 40 },
        { name: 'licensePlate', label: 'License plate', max: 16 },
        { name: 'condition', label: 'Condition', max: 60 },
      ],
      confirm: 'Add',
      onSubmit: function (values) {
        return api('/' + state.guildId + '/characters/' + characterId + '/vehicles',
          { method: 'POST', body: values })
          .then(function () { toast('Vehicle added.', 'ok'); go('characters'); });
      },
    });
  }

  function addFirearm(characterId) {
    dialog({
      title: 'Add firearm',
      fields: [
        { name: 'name', label: 'Firearm', required: true, max: 100 },
        { name: 'serialNumber', label: 'Serial number', max: 60 },
      ],
      confirm: 'Add',
      onSubmit: function (values) {
        return api('/' + state.guildId + '/characters/' + characterId + '/firearms',
          { method: 'POST', body: values })
          .then(function () { toast('Firearm added.', 'ok'); go('characters'); });
      },
    });
  }

  function removeSub(kind, characterId, subId) {
    api('/' + state.guildId + '/characters/' + characterId + '/' + kind + '/' + subId,
      { method: 'DELETE' })
      .then(function () { go('characters'); })
      .catch(fail);
  }

  VIEWS.call911 = function () {
    return api('/' + state.guildId + '/911/mine').then(function (res) {
      var calls = res.calls || [];
      var open = calls.filter(function (c) { return c.status === 'active'; })[0];
      var ctx = state.context || {};

      var history = calls.length
        ? calls.slice(0, 10).map(function (c) {
            return '<div class="row">'
              + '<span class="mono muted">' + esc(String(c.callId).split('-').pop()) + '</span>'
              + '<span>' + esc(c.issue) + '</span>'
              + '<span class="spacer"></span>'
              + '<span class="muted">' + esc(timeAgo(c.timestamp)) + '</span>'
              + '<span class="status-pill' + (c.status === 'active' ? ' busy' : '') + '">'
              + esc(c.status === 'active' ? 'Open' : 'Closed') + '</span>'
              + '</div>';
          }).join('')
        : '<div class="empty">You have not called 911 from here yet.</div>';

      var form = open
        ? '<div class="card"><div class="card-head"><h3>Your call is open</h3>'
          + '<span class="spacer"></span>'
          + '<button class="btn btn-sm btn-danger" id="cancel-call">Cancel call</button></div>'
          + '<dl class="kv">'
          + '<div><dt>Call</dt><dd class="mono">' + esc(String(open.callId).split('-').pop()) + '</dd></div>'
          + '<div><dt>Emergency</dt><dd>' + esc(open.issue) + '</dd></div>'
          + '<div><dt>Location</dt><dd>' + esc(open.location) + '</dd></div>'
          + '<div><dt>Responding</dt><dd>' + esc(open.respondingLeoUsername || 'Waiting for a unit') + '</dd></div>'
          + '</dl></div>'
        : '<div class="card"><div class="card-head"><h3>Report an emergency</h3></div>'
          + '<div class="fields" style="display:flex;flex-direction:column;gap:12px">'
          + '<div class="field"><label for="c-issue">What is the emergency? *</label>'
          + '<textarea id="c-issue" maxlength="1000"></textarea></div>'
          + '<div class="field"><label for="c-location">Where are you? *</label>'
          + '<input id="c-location" maxlength="300"></div>'
          + '<div class="field"><label for="c-suspects">Suspect or vehicle description</label>'
          + '<input id="c-suspects" maxlength="500"></div>'
          + '<div class="field-row">'
          + '<div class="field"><label for="c-lastseen">Last seen</label><input id="c-lastseen" maxlength="300"></div>'
          + '<div class="field"><label for="c-contact">Contact info</label><input id="c-contact" maxlength="200"></div>'
          + '</div>'
          + '<button class="btn btn-danger btn-block" id="submit-911">Call 911</button>'
          + '</div></div>';

      $('main').innerHTML = '<div class="panel">'
        + panelHead('911', ctx.hasDispatch
            ? 'Dispatch will read your call out over the radio within a few seconds.'
            : 'Your call is sent to the server’s 911 channel in Discord.')
        + form
        + '<div class="subhead">Your recent calls</div>' + history
        + '</div>';

      var submit = $('submit-911');
      if (submit) submit.addEventListener('click', function () {
        var body = {
          issue: $('c-issue').value.trim(),
          location: $('c-location').value.trim(),
          suspectsDescription: $('c-suspects').value.trim(),
          lastSeen: $('c-lastseen').value.trim(),
          contact: $('c-contact').value.trim(),
        };
        if (!body.issue || !body.location) {
          return toast('Tell us what happened and where you are.', 'error');
        }
        submit.disabled = true;
        submit.textContent = 'Calling';
        api('/' + state.guildId + '/911', { method: 'POST', body: body })
          .then(function (res) {
            toast(res.postedToDiscord
              ? 'Call sent. Units have been notified.'
              : 'Call logged, but this server has no 911 channel set.',
              res.postedToDiscord ? 'ok' : 'error');
            go('call911');
          })
          .catch(function (err) {
            submit.disabled = false;
            submit.textContent = 'Call 911';
            fail(err);
          });
      });

      var cancel = $('cancel-call');
      if (cancel) cancel.addEventListener('click', function () {
        api('/' + state.guildId + '/911/' + open.callId, { method: 'DELETE' })
          .then(function () { toast('Call cancelled.', 'ok'); go('call911'); })
          .catch(fail);
      });
    });
  };

  VIEWS.fines = function () {
    return api('/' + state.guildId + '/fines').then(function (res) {
      var fines = res.fines || [];
      var rows = fines.length
        ? fines.map(function (f) {
            return '<div class="card" style="padding:12px">'
              + '<div class="card-head" style="margin-bottom:6px">'
              + '<h3 style="font-size:14px">' + esc(f.violation) + '</h3>'
              + '<span class="spacer"></span>'
              + '<span>' + esc(money(f.fine)) + '</span>'
              + (f.paid
                ? '<span class="status-pill available">Paid</span>'
                : '<button class="btn btn-sm btn-primary" data-pay="' + esc(f.ticketId) + '">Pay</button>')
              + '</div>'
              + '<div class="server-meta">' + esc(f.characterName) + ' · '
              + esc(f.ticketId) + ' · ' + esc(timeAgo(f.createdAt))
              + (f.paid && f.paidAt ? ' · paid ' + esc(timeAgo(f.paidAt)) : '') + '</div>'
              + (f.description
                ? '<p style="font-size:13px;color:var(--text-muted);margin-top:6px">' + esc(f.description) + '</p>'
                : '')
              + '</div>';
          }).join('')
        : '<div class="empty">No fines on record. Keep it that way.</div>';

      $('main').innerHTML = '<div class="panel">'
        + panelHead('My Fines', res.outstanding
            ? money(res.outstanding) + ' outstanding'
            : 'Nothing outstanding')
        // Paying comes out of the bank, as it does in Discord, so say so before
        // somebody clicks Pay expecting it to be free.
        + (res.outstanding
          ? '<div class="notice">Fines are paid from your bank balance.</div>'
          : '')
        + rows + '</div>';

      bind('[data-pay]', function (el) {
        el.disabled = true;
        api('/' + state.guildId + '/fines/' + el.dataset.pay + '/pay', { method: 'POST' })
          .then(function (r) {
            toast('Paid ' + money(r.paid) + '. Bank: ' + (r.symbol || '$') + Number(r.bank).toLocaleString(), 'ok');
            go('fines');
          })
          .catch(function (err) {
            el.disabled = false;
            // These two are the whole reason a payment gets refused, and a bare
            // "something went wrong" would leave people stuck.
            if (err && err.code === 'insufficient_funds') return toast(err.message, 'error');
            if (err && err.code === 'no_economy_account') {
              return toast('You have no economy account on this server yet.', 'error');
            }
            fail(err);
          });
      });
    });
  };

  VIEWS.board = function () {
    return api('/' + state.guildId + '/board').then(function (res) {
      $('main').innerHTML = '<div class="panel">'
        + panelHead('On Duty', 'Units active in the last eight hours.')
        + '<div class="card">' + officerRows(res.officers) + '</div></div>';
    });
  };

  VIEWS.alerts = function () {
    return api('/' + state.guildId + '/bolos').then(function (res) {
      var bolos = res.bolos || [];
      var body = bolos.length
        ? bolos.map(function (b) {
            return '<div class="card"><div class="card-head">'
              + '<h3>' + esc(b.characterName) + '</h3>'
              + '<span class="spacer"></span>'
              + '<span class="muted">' + esc(timeAgo(b.createdAt)) + '</span></div>'
              + '<p style="font-size:13px">' + esc(b.reason) + '</p>'
              + (b.description ? '<p style="font-size:13px;color:var(--text-muted);margin-top:6px">' + esc(b.description) + '</p>' : '')
              + vehicleLines(b.vehicles)
              + '</div>';
          }).join('')
        : '<div class="empty">No active alerts.</div>';

      $('main').innerHTML = '<div class="panel">'
        + panelHead('Public Alerts', 'People and vehicles law enforcement is looking for.')
        + body + '</div>';
    });
  };

  function vehicleLines(vehicles) {
    if (!vehicles || !vehicles.length) return '';
    return '<div class="subhead">Vehicles</div>' + vehicles.map(function (v) {
      return '<div class="row"><span>'
        + esc([v.year, v.color, v.make, v.model].filter(Boolean).join(' ') || 'Vehicle') + '</span>'
        + '<span class="spacer"></span>'
        + (v.licensePlate ? '<span class="mono muted">' + esc(v.licensePlate) + '</span>' : '')
        + '</div>';
    }).join('');
  }

  function officerRows(officers) {
    if (!officers || !officers.length) return '<div class="row muted">Nobody is on duty right now.</div>';
    return officers.map(function (o) {
      var cls = o.tenCode === '10-99' ? 'panic' : (o.tenCode === '10-8' ? 'available' : 'busy');
      return '<div class="row">'
        + '<span class="status-pill ' + cls + '">' + esc(o.tenCode) + '</span>'
        + '<span>' + esc(o.username) + '</span>'
        + (o.location ? '<span class="muted">' + esc(o.location) + '</span>' : '')
        + '<span class="spacer"></span>'
        + '<span class="muted">' + esc(timeAgo(o.updatedAt)) + '</span>'
        + '</div>';
    }).join('');
  }

  // ── LEO views ────────────────────────────────────────────────────────────

  VIEWS.calls = function () {
    return api('/' + state.guildId + '/calls').then(function (res) {
      state.data.calls = res.calls || [];
      renderNav();

      var body = state.data.calls.length
        ? state.data.calls.map(callCard).join('')
        : '<div class="empty">No active calls.</div>';

      $('main').innerHTML = '<div class="panel">'
        + panelHead('Active Calls', 'Calls close automatically once they are handled.')
        + body + '</div>';

      bind('[data-respond]', function (el) { callAction(el.dataset.respond, 'respond'); });
      bind('[data-attach]', function (el) { callAction(el.dataset.attach, 'attach'); });
      bind('[data-detach]', function (el) { callAction(el.dataset.detach, 'detach'); });
      bind('[data-close-call]', function (el) { callAction(el.dataset.closeCall, 'close'); });
      bind('[data-ticket-caller]', function (el) { ticketFromLookup(el.dataset.ticketCaller); });
    });
  };

  function callCard(c) {
    var me = state.context.member.id;
    var isPrimary = c.respondingLeoId === me;
    var isAttached = (c.attachedLeoIds || []).indexOf(me) !== -1;

    var facts = [
      ['Location', c.location], ['Caller', c.reporterUsername],
      ['Suspect / vehicle', c.suspectsDescription], ['Last seen', c.lastSeen],
      ['Contact', c.contact],
    ].filter(function (p) { return p[1]; });

    return '<div class="card call' + (c.respondingLeoId ? ' assigned' : '') + '">'
      + '<div class="card-head">'
      + '<span class="mono muted">#' + esc(String(c.callId).split('-').pop()) + '</span>'
      + '<h3>' + esc(c.issue) + '</h3>'
      + '<span class="spacer"></span>'
      + '<span class="muted">' + esc(timeAgo(c.timestamp)) + '</span></div>'
      + '<dl class="kv">' + facts.map(function (p) {
          return '<div><dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd></div>';
        }).join('') + '</dl>'
      // Names, not a count. "3 attached" tells an officer nothing about whether
      // they are needed on this call.
      + (c.respondingLeoId
        ? '<div class="notice" style="margin-top:12px">Primary: <strong>'
          + esc(c.respondingLeoUsername || 'Unknown unit') + '</strong>'
          + ((c.attachedNames || []).length
            ? '<br>Attached: ' + c.attachedNames.map(esc).join(', ')
            : '')
          + '</div>'
        : '')
      + '<div class="call-actions">'
      + (isPrimary
        ? '<button class="btn btn-sm" disabled>You are primary</button>'
        : '<button class="btn btn-sm btn-danger" data-respond="' + esc(c.callId) + '">Respond 10-76</button>')
      + (isAttached
        ? '<button class="btn btn-sm" data-detach="' + esc(c.callId) + '">Clear from call</button>'
        : '<button class="btn btn-sm" data-attach="' + esc(c.callId) + '">Attach 10-97</button>')
      + (state.mode === 'leo' && c.reporterUsername
        ? '<button class="btn btn-sm" data-ticket-caller="' + esc(c.reporterUsername) + '">Issue ticket</button>'
        : '')
      + '<button class="btn btn-sm" data-close-call="' + esc(c.callId) + '">Close call</button>'
      + '</div></div>';
  }

  function callAction(callId, action) {
    api('/' + state.guildId + '/calls/' + callId + '/' + action, { method: 'POST' })
      .then(function () { go('calls'); })
      .catch(fail);
  }

  VIEWS.search = function () {
    $('main').innerHTML = '<div class="panel">'
      + panelHead('Records', 'Run a plate or a name.')
      + '<div class="card"><div class="field-row">'
      + '<div class="field" style="flex:1"><label for="q">Plate or name</label>'
      + '<input id="q" placeholder="ABC123 or John Doe" maxlength="100"></div>'
      + '<div class="field" style="max-width:120px;justify-content:flex-end">'
      + '<button class="btn btn-primary" id="run-search">Search</button></div>'
      + '</div></div>'
      + '<div id="results"></div></div>';

    function run() {
      var query = $('q').value.trim();
      if (query.length < 2) return toast('Enter at least two characters.', 'error');

      $('results').innerHTML = '<div class="loading"><span class="spinner"></span> Searching</div>';
      api('/' + state.guildId + '/leo/search?q=' + encodeURIComponent(query))
        .then(function (res) {
          state.data.results = res.results || [];
          $('results').innerHTML = state.data.results.length
            ? state.data.results.map(recordCard).join('')
            : '<div class="empty">Nothing on file for that.</div>';

          bind('[data-bolo]', function (el) { newBolo(el.dataset.bolo); });
          bind('[data-ticket]', function (el) { newTicket(el.dataset.ticket); });
          bind('[data-arrest]', function (el) { newArrest(el.dataset.arrest); });
          bind('[data-wanted]', function (el) { toggleWanted(el.dataset.wanted); });
          bind('[data-licence]', function (el) { toggleLicence(el.dataset.licence); });
          bind('[data-revoke]', function (el) {
            revokeFirearm(el.dataset.char, el.dataset.revoke, el.dataset.gunName);
          });
        })
        .catch(function (err) {
          $('results').innerHTML = '<div class="notice error">' + esc(err.message) + '</div>';
        });
    }

    $('run-search').addEventListener('click', run);
    $('q').addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
    $('q').focus();
    return Promise.resolve();
  };

  function recordCard(r) {
    var c = r.character;
    var facts = [
      ['Age', c.age], ['Gender', c.gender], ['Height', c.height], ['Build', c.build],
      ['Hair', c.hairColor], ['Eyes', c.eyeColor], ['Address', c.address],
      ['Phone', c.phoneNumber], ['Plate', c.licensePlate],
      // Identifiers an officer runs, and which were not shown at all before.
      ['SSN', c.socialSecurityNumber],
      ['Licence', c.driversLicense], ['Licence status', c.driverLicenseStatus],
      ['Occupation', c.occupation],
      ['Veteran / donor', c.veteranStatus && c.veteranStatus !== 'none'
        ? c.veteranStatus.replace('_', ' ') : null],
      ['Distinguishing features', c.distinguishingFeatures],
      ['Scars and tattoos', c.scarsAndTattoos],
      ['Medical', c.medicalInfo],
      ['Emergency contact', c.emergencyContact],
    ].filter(function (p) { return p[1]; });

    var arrests = (c.arrestHistory || []).map(function (a) {
      return '<div class="row"><span>' + esc(a.charge) + '</span>'
        + '<span class="spacer"></span>'
        + '<span class="muted">' + esc(a.outcome || 'Pending') + '</span>'
        + '<span class="muted">' + esc(a.date ? new Date(a.date).toLocaleDateString() : '') + '</span>'
        + '</div>';
    }).join('');

    var tickets = (r.tickets || []).map(function (t) {
      return '<div class="row"><span>' + esc(t.violation) + '</span>'
        + '<span class="spacer"></span><span>' + esc(money(t.fine)) + '</span>'
        + '<span class="status-pill' + (t.paid ? ' available' : ' busy') + '">'
        + (t.paid ? 'Paid' : 'Unpaid') + '</span></div>';
    }).join('');

    var bolos = (r.bolos || []).map(function (b) {
      return '<div class="row"><span>' + esc(b.reason) + '</span>'
        + '<span class="spacer"></span>'
        + '<span class="muted">' + esc(timeAgo(b.createdAt)) + '</span></div>';
    }).join('');

    return '<div class="card">'
      + '<div class="card-head"><h3>' + esc(c.characterName) + '</h3>'
      + (c.status === 'wanted'
        ? '<span class="badge" style="background:var(--red-bg);border-color:var(--red-border);color:var(--red)">Wanted</span>'
        : '')
      + (r.bolos && r.bolos.length ? '<span class="badge badge-leo">' + r.bolos.length + ' BOLO</span>' : '')
      + (r.outstandingFines ? '<span class="badge">' + esc(money(r.outstandingFines)) + ' owed</span>' : '')
      + '<span class="spacer"></span></div>'
      + (c.status === 'wanted' && c.wantedReason
        ? '<div class="notice error">Wanted: ' + esc(c.wantedReason) + '</div>' : '')
      + '<dl class="kv">' + facts.map(function (p) {
          return '<div><dt>' + esc(p[0]) + '</dt><dd>' + esc(p[1]) + '</dd></div>';
        }).join('') + '</dl>'
      + vehicleLines(c.vehicles)
      + ((c.guns || []).length
        ? '<div class="subhead">Registered firearms</div>' + c.guns.map(function (g) {
            return '<div class="row"><span>' + esc(g.name) + '</span><span class="spacer"></span>'
              + '<span class="mono muted">' + esc(g.serialNumber || '') + '</span>'
              + '<button class="btn btn-sm btn-danger" data-revoke="' + esc(g._id) + '"'
              + ' data-char="' + esc(c._id) + '" data-gun-name="' + esc(g.name) + '">Revoke</button>'
              + '</div>';
          }).join('')
        : '')
      + (bolos ? '<div class="subhead">Active BOLOs</div>' + bolos : '')
      + (arrests ? '<div class="subhead">Arrest history</div>' + arrests : '')
      + (tickets ? '<div class="subhead">Tickets</div>' + tickets : '')
      + '<div class="call-actions">'
      + '<button class="btn btn-sm" data-ticket="' + esc(c._id) + '">Issue ticket</button>'
      + '<button class="btn btn-sm" data-arrest="' + esc(c._id) + '">Log arrest</button>'
      + '<button class="btn btn-sm" data-bolo="' + esc(c._id) + '">Create BOLO</button>'
      + '<button class="btn btn-sm ' + (c.status === 'wanted' ? '' : 'btn-danger') + '" data-wanted="' + esc(c._id) + '">'
      + (c.status === 'wanted' ? 'Clear wanted' : 'Flag wanted') + '</button>'
      + '<button class="btn btn-sm" data-licence="' + esc(c._id) + '">'
      + (c.driverLicenseStatus === 'invalid' ? 'Reinstate licence' : 'Suspend licence') + '</button>'
      + '</div></div>';
  }

  function findRecord(id) {
    return (state.data.results || []).filter(function (r) { return r.character._id === id; })[0];
  }

  function newTicket(characterId) {
    dialog({
      title: 'Issue ticket',
      fields: [
        { name: 'violation', label: 'Violation', required: true, max: 300 },
        { name: 'fine', label: 'Fine amount', type: 'number' },
        { name: 'description', label: 'Notes', type: 'textarea', max: 1000 },
      ],
      confirm: 'Issue',
      onSubmit: function (values) {
        values.characterId = characterId;
        return api('/' + state.guildId + '/leo/tickets', { method: 'POST', body: values })
          .then(function () { toast('Ticket issued.', 'ok'); rerunSearch(); });
      },
    });
  }

  function newArrest(characterId) {
    dialog({
      title: 'Log arrest',
      fields: [
        { name: 'charge', label: 'Charge', required: true, max: 300 },
        { name: 'outcome', label: 'Outcome', max: 200 },
      ],
      confirm: 'Log',
      onSubmit: function (values) {
        return api('/' + state.guildId + '/leo/records/' + characterId + '/arrests',
          { method: 'POST', body: values })
          .then(function () { toast('Arrest logged.', 'ok'); rerunSearch(); });
      },
    });
  }

  function newBolo(characterId) {
    dialog({
      title: 'Create BOLO',
      sub: 'Goes out to everyone on duty and lapses after 24 hours.',
      fields: [
        { name: 'reason', label: 'Reason', required: true, max: 300 },
        { name: 'description', label: 'Details', type: 'textarea', max: 1000 },
      ],
      confirm: 'Create',
      onSubmit: function (values) {
        values.characterId = characterId;
        return api('/' + state.guildId + '/leo/bolos', { method: 'POST', body: values })
          .then(function () { toast('BOLO created.', 'ok'); rerunSearch(); });
      },
    });
  }

  function toggleWanted(characterId) {
    var record = findRecord(characterId);
    if (!record) return;
    var wanted = record.character.status === 'wanted';

    if (wanted) {
      api('/' + state.guildId + '/leo/records/' + characterId,
        { method: 'PATCH', body: { status: 'clean' } })
        .then(function () { toast('Wanted flag cleared.', 'ok'); rerunSearch(); })
        .catch(fail);
      return;
    }

    dialog({
      title: 'Flag as wanted',
      fields: [{ name: 'wantedReason', label: 'Reason', required: true, max: 500 }],
      confirm: 'Flag',
      danger: true,
      onSubmit: function (values) {
        return api('/' + state.guildId + '/leo/records/' + characterId,
          { method: 'PATCH', body: { status: 'wanted', wantedReason: values.wantedReason } })
          .then(function () { toast('Flagged as wanted.', 'ok'); rerunSearch(); });
      },
    });
  }

  function revokeFirearm(characterId, gunId, gunName) {
    dialog({
      title: 'Revoke ' + (gunName || 'this firearm') + '?',
      sub: 'It is removed from the record entirely, the same as in Discord.',
      fields: [{ name: 'reason', label: 'Reason', max: 300 }],
      confirm: 'Revoke',
      danger: true,
      onSubmit: function (values) {
        return api('/' + state.guildId + '/leo/records/' + characterId + '/revoke-firearm', {
          method: 'POST', body: { gunId: gunId, reason: values.reason },
        }).then(function () { toast('Firearm revoked.', 'ok'); rerunSearch(); });
      },
    });
  }

  function toggleLicence(characterId) {
    var record = findRecord(characterId);
    if (!record) return;
    var suspended = record.character.driverLicenseStatus === 'invalid';

    api('/' + state.guildId + '/leo/records/' + characterId, {
      method: 'PATCH',
      body: { driverLicenseStatus: suspended ? 'valid' : 'invalid' },
    }).then(function () {
      toast(suspended ? 'Licence reinstated.' : 'Licence suspended.', 'ok');
      rerunSearch();
    }).catch(fail);
  }

  function rerunSearch() {
    var button = $('run-search');
    if (button) button.click();
  }

  VIEWS.bolos = function () {
    return api('/' + state.guildId + '/leo/bolos').then(function (res) {
      var bolos = res.bolos || [];
      var body = bolos.length
        ? bolos.map(function (b) {
            return '<div class="card"><div class="card-head">'
              + '<h3>' + esc(b.characterName) + '</h3>'
              + '<span class="spacer"></span>'
              + '<span class="muted">' + esc(timeAgo(b.createdAt)) + '</span>'
              + '<button class="btn btn-sm" data-resolve="' + esc(b.boloId) + '">Resolve</button>'
              + '</div>'
              + '<p style="font-size:13px">' + esc(b.reason) + '</p>'
              + (b.description ? '<p style="font-size:13px;color:var(--text-muted);margin-top:6px">' + esc(b.description) + '</p>' : '')
              + vehicleLines(b.vehicles) + '</div>';
          }).join('')
        : '<div class="empty">No active BOLOs.</div>';

      var limits = (state.context && state.context.limits) || {};
      $('main').innerHTML = '<div class="panel">'
        + panelHead('BOLOs', limits.bolos
            ? bolos.length + ' of ' + limits.bolos + ' active. BOLOs lapse after 24 hours.'
            : 'BOLOs lapse after 24 hours.')
        + body + '</div>';

      bind('[data-resolve]', function (el) {
        api('/' + state.guildId + '/leo/bolos/' + el.dataset.resolve + '/resolve', { method: 'POST' })
          .then(function () { toast('BOLO resolved.', 'ok'); go('bolos'); })
          .catch(fail);
      });
    });
  };

  VIEWS.units = function () {
    return Promise.all([
      api('/' + state.guildId + '/leo/status'),
      api('/' + state.guildId + '/leo/codes'),
    ]).then(function (results) {
      var status = results[0];
      var codes = (results[1].codes || []).filter(function (c) { return c.code !== '10-99'; });
      var mine = status.mine || {};

      var options = codes.map(function (c) {
        return '<option value="' + esc(c.code) + '"'
          + (c.code === mine.tenCode ? ' selected' : '') + '>' + esc(c.label) + '</option>';
      }).join('');

      $('main').innerHTML = '<div class="panel">'
        + panelHead('Units', 'Your status shows on the Discord status board too.')
        + '<div class="card"><div class="card-head"><h3>My status</h3>'
        + '<span class="spacer"></span>'
        + '<span class="status-pill' + (mine.tenCode === '10-8' ? ' available' : ' busy') + '">'
        + esc(mine.tenCode || 'Off duty') + '</span></div>'
        + '<div class="field-row">'
        + '<div class="field"><label for="s-code">10-code</label><select id="s-code">' + options + '</select></div>'
        + '<div class="field"><label for="s-location">Location</label>'
        + '<input id="s-location" maxlength="200" value="' + esc(mine.location || '') + '"></div>'
        + '<div class="field"><label for="s-subject">Subject</label>'
        + '<input id="s-subject" maxlength="200" value="' + esc(mine.subject || '') + '"></div>'
        + '</div>'
        + '<button class="btn btn-primary" style="margin-top:12px" id="save-status">Update status</button>'
        + '</div>'
        + '<div class="subhead">Everyone on duty</div>'
        + '<div class="card">' + officerRows(status.officers) + '</div></div>';

      $('save-status').addEventListener('click', function () {
        api('/' + state.guildId + '/leo/status', {
          method: 'POST',
          body: {
            tenCode: $('s-code').value,
            location: $('s-location').value.trim(),
            subject: $('s-subject').value.trim(),
          },
        }).then(function () { toast('Status updated.', 'ok'); go('units'); }).catch(fail);
      });
    });
  };

  VIEWS.tickets = function () {
    var outstandingOnly = state.data.ticketFilter === 'unpaid';
    var query = outstandingOnly ? '?paid=false' : '';

    return api('/' + state.guildId + '/leo/tickets' + query).then(function (res) {
      var tickets = res.tickets || [];

      var rows = tickets.length
        ? tickets.map(function (t) {
            return '<div class="row">'
              + '<span class="status-pill' + (t.paid ? ' available' : ' busy') + '">'
              + (t.paid ? 'Paid' : 'Unpaid') + '</span>'
              + '<span>' + esc(t.violation) + '</span>'
              + '<span class="muted">' + esc(t.characterName) + '</span>'
              + '<span class="spacer"></span>'
              + '<span>' + esc(money(t.fine)) + '</span>'
              + '<span class="muted">' + esc(timeAgo(t.createdAt)) + '</span>'
              + '</div>';
          }).join('')
        : '<div class="empty">No tickets have been issued on this server yet.</div>';

      $('main').innerHTML = '<div class="panel">'
        + panelHead('Ticket Book',
            money(res.outstanding) + ' outstanding across ' + tickets.length + ' ticket'
              + (tickets.length === 1 ? '' : 's'),
            '<button class="btn" id="filter-tickets">'
            + (outstandingOnly ? 'Show all' : 'Unpaid only') + '</button>'
            + '<button class="btn btn-primary" id="new-ticket">New ticket</button>')
        + '<div class="card">' + rows + '</div></div>';

      $('filter-tickets').addEventListener('click', function () {
        state.data.ticketFilter = outstandingOnly ? 'all' : 'unpaid';
        go('tickets');
      });
      // Issuing no longer depends on finding somebody by exact name first.
      $('new-ticket').addEventListener('click', function () { ticketFromLookup(''); });
    });
  };

  /**
   * Pick a person, then write the ticket.
   *
   * Tickets used to be reachable only from inside a successful Records search,
   * so an officer had to spell a character's name exactly before they could
   * write anything.
   */
  function ticketFromLookup(prefill) {
    dialog({
      title: 'Who is the ticket for?',
      sub: 'Search by name or plate.',
      fields: [{ name: 'q', label: 'Name or plate', required: true, max: 100, value: prefill || '' }],
      confirm: 'Search',
      onSubmit: function (values) {
        return api('/' + state.guildId + '/leo/lookup?q=' + encodeURIComponent(values.q))
          .then(function (res) {
            var matches = res.matches || [];
            if (!matches.length) { toast('Nobody found for "' + values.q + '".', 'error'); return; }
            if (matches.length === 1) { newTicket(matches[0]._id); return; }

            dialog({
              title: 'Which person?',
              fields: [{
                name: 'characterId', label: 'Match', type: 'select',
                options: matches.map(function (m) {
                  return {
                    value: m._id,
                    label: m.characterName + (m.licensePlate ? ' (' + m.licensePlate + ')' : ''),
                  };
                }),
              }],
              confirm: 'Continue',
              onSubmit: function (picked) { newTicket(picked.characterId); },
            });
          });
      },
    });
  }

  VIEWS.social = function () {
    var rp = (state.context && state.context.social) || {};

    function composer(kind, title, blurb, enabled) {
      if (!enabled) {
        return '<div class="card"><div class="card-head"><h3>' + esc(title) + '</h3></div>'
          + '<div class="empty" style="padding:18px">This server has not set up '
          + esc(title.toLowerCase()) + '.</div></div>';
      }
      return '<div class="card"><div class="card-head"><h3>' + esc(title) + '</h3></div>'
        + '<p class="server-meta" style="margin-bottom:10px">' + esc(blurb) + '</p>'
        + '<div class="field"><textarea id="msg-' + kind + '" maxlength="1000" '
        + 'placeholder="What do you want to say?"></textarea></div>'
        + '<button class="btn btn-primary" style="margin-top:10px" data-post="' + kind + '">Post</button>'
        + '</div>';
    }

    $('main').innerHTML = '<div class="panel">'
      + panelHead('Social', 'In-character posts, sent to your server.')
      + composer('tweet', 'Twitter', 'Posted publicly under your name.', rp.twitter)
      + composer('anon', 'Anonymous', 'Posted with no name attached. Nobody, including staff, can trace it back.', rp.anon)
      + '</div>';

    bind('[data-post]', function (el) {
      var kind = el.dataset.post;
      var box = $('msg-' + kind);
      var message = box ? box.value.trim() : '';
      if (!message) return toast('Write something first.', 'error');

      el.disabled = true;
      api('/' + state.guildId + '/social/' + (kind === 'tweet' ? 'tweet' : 'anon'), {
        method: 'POST', body: { message: message },
      }).then(function () {
        toast('Posted.', 'ok');
        if (box) box.value = '';
        el.disabled = false;
      }).catch(function (err) { el.disabled = false; fail(err); });
    });

    return Promise.resolve();
  };

  function confirmPanic() {
    dialog({
      title: 'Declare 10-99?',
      sub: 'This alerts every unit that you are in distress. Only use it if you mean it.',
      fields: [{ name: 'location', label: 'Your location', max: 200 }],
      confirm: 'Send 10-99',
      danger: true,
      onSubmit: function (values) {
        return api('/' + state.guildId + '/leo/panic', { method: 'POST', body: values })
          .then(function (res) {
            toast(res.voiceAlert
              ? '10-99 sent. Dispatch is calling it out now.'
              : '10-99 sent to the status board.', 'ok');
            go('units');
          });
      },
    });
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  function init() {
    var authError = captureToken();

    Array.prototype.forEach.call(document.querySelectorAll('[data-signout]'), function (el) {
      el.addEventListener('click', function (e) { e.preventDefault(); signOut(); });
    });

    if (authError || !token()) return showLogin(authError);

    $('btn-switch-server').addEventListener('click', function () {
      if (state.stream) { state.stream.close(); state.stream = null; }
      state.guildId = null;
      store(LAST_SERVER_KEY, null);
      showServers();
    });

    Array.prototype.forEach.call($('mode-toggle').querySelectorAll('button'), function (btn) {
      btn.addEventListener('click', function () { setMode(btn.dataset.mode); });
    });

    api('/me').then(function (res) {
      state.user = res.user;
      return api('/servers');
    }).then(function (res) {
      state.servers = res.servers || [];

      // Go straight back to the server they were last in, unless it is gone.
      var last = recall(LAST_SERVER_KEY);
      var known = state.servers.some(function (s) { return s.id === last; });
      if (last && known) {
        $('picker-who').innerHTML = whoHtml(state.user);
        openServer(last);
      } else {
        showServers();
      }
    }).catch(function (err) {
      if (err && err.handled) return;
      // Discord rejected the token even though our own check passed - the only
      // way out is a fresh sign-in.
      if (err && err.code === 'discord_token_expired') return signOut();

      showLogin();
      var box = $('login-error');
      box.textContent = err.message || 'Could not load the CAD.';
      box.hidden = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
