/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let me = null;
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
  document.getElementById('app').classList.remove('hidden');

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

  if (me.isLeo) {
    document.getElementById('nav-leo')?.classList.remove('hidden');
    document.getElementById('nav-leo-section')?.classList.remove('hidden');
    document.getElementById('more-leo')?.classList.remove('hidden');
  }

  document.querySelectorAll('.nav-item[data-tab], .bnav-item[data-tab]').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  loadOverview();
}

/* ══════════════════════════════════════════════════════
   TABS
══════════════════════════════════════════════════════ */
const secondaryTabs = new Set(['fines','tickets','calendar','rolerequest','leo']);

function switchTab(tab) {
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
async function loadOverview() {
  try {
    const [cadRes, ecoRes, ticketsRes, priorityRes, strikeRes, finesRes] = await Promise.all([
      api('/cad'),
      api('/economy'),
      api('/tickets'),
      api('/priority'),
      api('/strikes'),
      api('/traffic-tickets'),
    ]);

    if (priorityRes?.active) {
      const banner = document.getElementById('priority-banner');
      banner.classList.remove('hidden');
      const sub = document.getElementById('priority-banner-sub');
      if (priorityRes.customMessage) sub.textContent = priorityRes.customMessage;
      else if (priorityRes.issuedBy) sub.textContent = `Issued by ${priorityRes.issuedBy}`;
    }

    const openTickets = (ticketsRes || []).filter(t => t.status === 'open').length;
    const strikeLevel = strikeRes?.level ?? 0;
    const unpaidFines = (finesRes || []).filter(f => !f.paid).length;
    const cur = ecoRes?.currency || '$';

    let statsHtml = [
      { label: 'Characters', value: cadRes?.length ?? 0, sub: 'in CAD' },
      { label: 'Cash', value: fmt(ecoRes?.cash ?? 0, cur), sub: 'on hand' },
      { label: 'Bank', value: fmt(ecoRes?.bank ?? 0, cur), sub: 'balance' },
      { label: 'Open Tickets', value: openTickets, sub: 'support tickets' },
    ].map(s => `
      <div class="stat-card">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-sub">${s.sub}</div>
      </div>
    `).join('');

    if (unpaidFines > 0) {
      statsHtml += `
        <div class="stat-card" style="--accent:var(--warning)">
          <div class="stat-label">Unpaid Fines</div>
          <div class="stat-value" style="color:var(--warning)">${unpaidFines}</div>
          <div class="stat-sub">traffic violations</div>
        </div>`;
    }

    if (strikeLevel > 0) {
      statsHtml += `
        <div class="stat-card" style="--accent:${strikeLevel >= 3 ? 'var(--danger)' : 'var(--warning)'}">
          <div class="stat-label">Strike Level</div>
          <div class="stat-value" style="color:${strikeLevel >= 3 ? 'var(--danger)' : 'var(--warning)'}">${strikeLevel}/4</div>
          <div class="stat-sub">active strikes</div>
        </div>`;
    }

    document.getElementById('overview-stats').innerHTML = statsHtml;

    const actions = [
      { icon: '👤', label: 'CAD', tab: 'cad' },
      { icon: '🚨', label: 'Dispatch', tab: 'dispatch' },
      { icon: '💰', label: 'Economy', tab: 'economy' },
      { icon: '📄', label: 'Traffic Fines', tab: 'fines' },
      { icon: '🎫', label: 'Tickets', tab: 'tickets' },
      { icon: '📅', label: 'RP Calendar', tab: 'calendar' },
      { icon: '📋', label: 'Role Requests', tab: 'rolerequest' },
    ];
    if (me.isLeo) actions.push({ icon: '🚔', label: 'LEO Dashboard', tab: 'leo' });

    document.getElementById('quick-actions').innerHTML = actions.map(a => `
      <button class="quick-btn" onclick="switchTab('${a.tab}')">
        <span class="quick-btn-icon">${a.icon}</span>${a.label}
      </button>
    `).join('');

  } catch (err) {
    document.getElementById('overview-stats').innerHTML = '<p style="color:var(--text-muted);font-size:13px">Could not load stats.</p>';
  }
}

/* ══════════════════════════════════════════════════════
   CAD
══════════════════════════════════════════════════════ */
async function loadCad() {
  const list = document.getElementById('cad-list');
  try {
    const chars = await api('/cad');
    if (!chars?.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👤</div>No characters yet. Create one to get started.</div>`;
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
            ${v.licensePlate ? `<div class="vehicle-item-plate">🚗 ${v.licensePlate}</div>` : ''}
          </div>
        </div>`).join('')
    : '<div style="color:var(--text-muted);font-size:12px;font-style:italic;padding:4px 0">No vehicles registered.</div>';

  const guns = c.guns?.length
    ? c.guns.map(g => `<div class="vehicle-item"><div class="vehicle-item-left"><div class="vehicle-item-name">${g.name}</div>${g.serialNumber ? `<div class="vehicle-item-plate">${g.serialNumber}</div>` : ''}</div></div>`).join('')
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
        ${c.status === 'wanted' && c.wantedReason ? `<div class="wanted-banner">⚠️ Wanted: ${c.wantedReason}</div>` : ''}
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
  try {
    const calls = await api('/dispatch/mine');
    const active = (calls || []).filter(c => c.status === 'active');
    const closed = (calls || []).filter(c => c.status === 'closed');

    document.getElementById('dispatch-active').innerHTML = active.length
      ? active.map(c => renderDispatchCall(c, true)).join('')
      : `<div class="empty-state" style="padding:20px 0"><div class="empty-state-icon">✅</div>No active calls.</div>`;

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
      <div class="dispatch-call-loc">📍 ${c.location}</div>
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
    btn.textContent = '🚨 Dispatch Now';
  }
}

/* ══════════════════════════════════════════════════════
   TRAFFIC FINES
══════════════════════════════════════════════════════ */
async function loadTrafficFines() {
  const list = document.getElementById('fines-list');
  const summary = document.getElementById('fines-summary');
  try {
    const [tickets, ecoRes] = await Promise.all([api('/traffic-tickets'), api('/economy')]);
    const cur = ecoRes?.currency || '$';

    if (!tickets?.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📄</div>No traffic violations on record.</div>`;
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
  try {
    const [ecoRes, shopRes, lbRes] = await Promise.all([
      api('/economy'),
      api('/economy/shop'),
      api('/economy/leaderboard'),
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

    shopItems = shopRes || [];
    renderShop(shopItems, cur);

    const inv = ecoRes.inventory || [];
    document.getElementById('inventory-list').innerHTML = inv.length
      ? inv.map(i => `<div class="inv-item"><span>${i.itemName}</span><span class="inv-qty">×${i.quantity}</span></div>`).join('')
      : '<div class="empty-state" style="padding:16px 0">Inventory is empty.</div>';

    const cur2 = lbRes.currency || cur;
    document.getElementById('leaderboard-list').innerHTML = (lbRes.entries || []).map(e => {
      const rc = e.rank === 1 ? 'gold' : e.rank === 2 ? 'silver' : e.rank === 3 ? 'bronze' : '';
      return `<div class="lb-row"><span class="lb-rank ${rc}">${e.rank}</span><span class="lb-name">${e.name}</span><span class="lb-amount">${fmt(e.total, cur2)}</span></div>`;
    }).join('') || '<div class="empty-state" style="padding:12px 0">No data yet.</div>';
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
   TICKETS
══════════════════════════════════════════════════════ */
async function loadTickets() {
  try {
    const tickets = await api('/tickets');
    const open = (tickets || []).filter(t => t.status === 'open');
    const closed = (tickets || []).filter(t => t.status === 'closed');

    document.getElementById('tickets-open').innerHTML = open.length
      ? open.map(t => renderTicket(t)).join('')
      : '<div class="empty-state" style="padding:20px 0"><div class="empty-state-icon">✅</div>No open tickets.</div>';

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
  try {
    const events = await api('/calendar');
    if (!events?.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div>No upcoming events scheduled.</div>`;
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
            ${e.timezone ? `<div class="cal-desc" style="margin-top:2px">🕐 ${e.timezone}</div>` : ''}
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
      <div class="rr-approver-option" data-id="${a.id}" onclick="selectApprover('${a.id}')">👤 ${a.name}</div>`).join('');
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
   LEO — STATUS UPDATE
══════════════════════════════════════════════════════ */
let boardRefreshTimer = null;
let boardCountdown = 30;

function startBoardRefresh() {
  stopBoardRefresh();
  boardCountdown = 30;
  updateCountdown();
  boardRefreshTimer = setInterval(() => {
    boardCountdown--;
    updateCountdown();
    if (boardCountdown <= 0) {
      boardCountdown = 30;
      refreshOfficerBoard();
    }
  }, 1000);
}

function stopBoardRefresh() {
  if (boardRefreshTimer) { clearInterval(boardRefreshTimer); boardRefreshTimer = null; }
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
          <div class="officer-name">${o.username}</div>
          <span class="officer-badge" style="background:${info.color}18;color:${info.color};border-color:${info.color}40">${info.label}</span>
        </div>
        ${o.location ? `<div class="officer-detail">📍 ${o.location}</div>` : ''}
        ${o.subject ? `<div class="officer-detail">👤 ${o.subject}</div>` : ''}
        ${o.rawCall ? `<div class="officer-detail">📻 ${o.rawCall}</div>` : ''}
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
    return;
  }
  const info = tenInfo(status.tenCode);
  const parts = [info.label];
  if (status.location) parts.push(`📍 ${status.location}`);
  if (sub) {
    sub.textContent = parts.join(' · ');
    const urgentCodes = new Set(['10-15','10-99']);
    const busyCodes = new Set(['10-6','10-50','10-97']);
    const offCodes = new Set(['10-7','10-10']);
    if (urgentCodes.has(status.tenCode)) sub.className = 'my-status-sub urgent';
    else if (busyCodes.has(status.tenCode)) sub.className = 'my-status-sub busy';
    else if (offCodes.has(status.tenCode)) sub.className = 'my-status-sub';
    else sub.className = 'my-status-sub on-duty';
  }
  if (offDutyBtn) offDutyBtn.style.display = '';
  const tcEl = document.getElementById('status-tencode');
  if (tcEl && status.tenCode) tcEl.value = status.tenCode;
  const locEl = document.getElementById('status-location');
  if (locEl) locEl.value = status.location || '';
  const subEl = document.getElementById('status-subject');
  if (subEl) subEl.value = status.subject || '';
}

async function updateOfficerStatus() {
  const tenCode = document.getElementById('status-tencode').value;
  const location = document.getElementById('status-location').value;
  const subject = document.getElementById('status-subject').value;
  const errEl = document.getElementById('status-error');
  const btn = document.getElementById('btn-update-status');
  errEl.classList.add('hidden');
  if (!tenCode) { errEl.textContent = 'Please select a ten-code.'; errEl.classList.remove('hidden'); return; }
  btn.disabled = true;
  btn.textContent = 'Updating...';
  try {
    const result = await apiPost('/leo/status', { tenCode, location, subject });
    applyMyStatusToUI(result.status);
    toast(`Status updated to ${tenCode}`, 'success');
    boardCountdown = 1;
    await refreshOfficerBoard();
    boardCountdown = 30;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Update Status';
  }
}

async function goOffDuty() {
  if (!confirm('Go off duty? Your status will be removed from the board.')) return;
  try {
    await apiDel('/leo/status');
    applyMyStatusToUI(null);
    document.getElementById('status-tencode').value = '';
    document.getElementById('status-location').value = '';
    document.getElementById('status-subject').value = '';
    toast('You are now off duty.', 'info');
    await refreshOfficerBoard();
  } catch (err) { toast(err.message, 'error'); }
}

/* ══════════════════════════════════════════════════════
   LEO
══════════════════════════════════════════════════════ */
const TEN_CODES = {
  '10-6': { label: '10-6 Busy', color: 'var(--warning)' },
  '10-7': { label: '10-7 Out of Service', color: 'var(--text-muted)' },
  '10-8': { label: '10-8 Available', color: 'var(--success)' },
  '10-10': { label: '10-10 Off Duty', color: 'var(--text-muted)' },
  '10-15': { label: '10-15 In Pursuit', color: 'var(--danger)' },
  '10-50': { label: '10-50 Traffic Stop', color: 'var(--accent)' },
  '10-97': { label: '10-97 On Scene', color: 'var(--accent)' },
  '10-99': { label: '10-99 Emergency', color: 'var(--danger)' },
};

function tenInfo(code) {
  return TEN_CODES[code] || { label: code || 'Unknown', color: 'var(--text-muted)' };
}

async function loadLeo() {
  const [boloEl, callEl] = [
    document.getElementById('leo-bolos'),
    document.getElementById('leo-calls'),
  ];
  try {
    const [bolos, calls, officers, myStatus] = await Promise.all([
      api('/leo/bolos'),
      api('/leo/calls'),
      api('/leo/officers'),
      api('/leo/mystatus'),
    ]);

    renderOfficerBoard(officers || []);
    applyMyStatusToUI(myStatus);
    startBoardRefresh();

    boloEl.innerHTML = bolos?.length
      ? bolos.map(b => `
          <div class="bolo-item">
            <div class="bolo-name">${b.characterName}</div>
            <div class="bolo-reason">${b.reason}</div>
            <div class="bolo-meta">${new Date(b.createdAt).toLocaleDateString()}</div>
          </div>`).join('')
      : '<div class="empty-state" style="padding:12px 0">No active BOLOs.</div>';

    callEl.innerHTML = calls?.length
      ? calls.map(c => `
          <div class="call-item">
            <div class="call-id">${c.callId}</div>
            <div class="call-issue">${c.issue}</div>
            ${c.location ? `<div class="call-loc">📍 ${c.location}</div>` : ''}
            <div class="call-meta">${timeAgo(new Date(c.timestamp))} ${c.respondingLeoUsername ? '• ' + c.respondingLeoUsername : '• No response'}</div>
          </div>`).join('')
      : '<div class="empty-state" style="padding:12px 0">No active calls.</div>';
  } catch {
    document.getElementById('leo-officers').innerHTML = '<div class="empty-state">Failed to load.</div>';
    boloEl.innerHTML = callEl.innerHTML = '<div class="empty-state">Failed to load.</div>';
  }
}

async function leoSearch() {
  const type = document.getElementById('leo-search-type').value;
  const query = document.getElementById('leo-search-input').value.trim();
  const results = document.getElementById('leo-results');
  if (!query) { results.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Enter a search query.</p>'; return; }
  results.innerHTML = '<p style="color:var(--text-muted);font-size:13px">Searching...</p>';
  try {
    const data = await api(`/leo/search?type=${type}&query=${encodeURIComponent(query)}`);
    const chars = data.results || [];
    if (!chars.length) { results.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No results found.</p>'; return; }
    results.innerHTML = chars.map(c => `
      <div class="leo-result-card">
        <div class="leo-result-name">${c.characterName} <span class="char-status ${c.status === 'wanted' ? 'status-wanted' : 'status-clean'}" style="font-size:10px">${c.status?.toUpperCase()}</span></div>
        <div class="leo-result-row">Age: <span>${c.age || 'N/A'}</span> · Gender: <span>${c.gender || 'N/A'}</span></div>
        <div class="leo-result-row">Address: <span>${c.address || 'N/A'}</span></div>
        <div class="leo-result-row">License: <span>${c.driversLicense || 'N/A'}</span> · Status: <span>${c.driverLicenseStatus || 'Valid'}</span></div>
        ${c.vehicles?.length ? `<div class="leo-result-row">Vehicles: <span>${c.vehicles.map(v => `${v.color || ''} ${v.make} ${v.model} (${v.licensePlate || 'no plate'})`).join(', ')}</span></div>` : ''}
        ${c.status === 'wanted' && c.wantedReason ? `<div class="leo-result-row" style="color:var(--danger)">Wanted: <span style="color:var(--danger)">${c.wantedReason}</span></div>` : ''}
      </div>`).join('');
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
