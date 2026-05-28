/* ── State ──────────────────────────────────────────────────────────────── */
let me = null;
let shopItems = [];
let currentBuyItem = null;
let selectedRoleTypeId = null;
let selectedApproverId = null;

/* ── Boot ───────────────────────────────────────────────────────────────── */
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
  const loginScreen = document.getElementById('login-screen');
  loginScreen.classList.remove('hidden');

  const errMap = {
    not_member: 'You are not a member of this server.',
    bot_not_in_server: 'The bot is not present in this server.',
    auth_failed: 'Authentication failed. Please try again.',
    invalid_state: 'Login state mismatch. Please try again.',
  };

  if (error && errMap[error]) {
    const el = document.getElementById('login-error');
    el.textContent = errMap[error];
    el.classList.remove('hidden');
  }
}

function showApp() {
  document.getElementById('app').classList.remove('hidden');

  document.getElementById('user-avatar').src = me.avatar;
  document.getElementById('user-name').textContent = me.displayName || me.username;
  document.getElementById('user-server').textContent = me.serverName || 'Member Portal';

  if (me.serverIcon) {
    document.querySelector('.login-logo')?.setAttribute('src', me.serverIcon);
  }

  // Roles
  const rolesEl = document.getElementById('user-roles');
  if (me.roles?.length) {
    rolesEl.innerHTML = me.roles.slice(0, 6).map(r => {
      const color = r.color && r.color !== '#000000' ? r.color : '#555';
      return `<span class="role-badge" style="color:${color};border-color:${color}20;background:${color}15">${r.name}</span>`;
    }).join('');
  }

  // LEO tab
  if (me.isLeo) {
    document.getElementById('nav-leo').classList.remove('hidden');
    document.getElementById('qa-leo').classList.remove('hidden');
  }

  // Nav click
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => switchTab(el.dataset.tab));
  });

  // Load overview
  loadOverview();
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */
const loaded = {};

function switchTab(tab) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pane = document.getElementById(`tab-${tab}`);
  if (pane) pane.classList.remove('hidden');

  const nav = document.querySelector(`[data-tab="${tab}"]`);
  if (nav) nav.classList.add('active');

  if (!loaded[tab]) {
    loaded[tab] = true;
    if (tab === 'cad') loadCad();
    if (tab === 'economy') loadEconomy();
    if (tab === 'rolerequest') loadRoleRequest();
    if (tab === 'leo') loadLeo();
  }
}

/* ── Overview ───────────────────────────────────────────────────────────── */
async function loadOverview() {
  try {
    const [cadRes, ecoRes, rrRes] = await Promise.all([
      api('/cad'),
      api('/economy'),
      api('/rolerequest/mine'),
    ]);

    const stats = [
      { label: 'Characters', value: cadRes?.length ?? 0, sub: 'in CAD' },
      { label: 'Cash', value: fmt(ecoRes?.cash ?? 0, ecoRes?.currency), sub: 'in hand' },
      { label: 'Bank', value: fmt(ecoRes?.bank ?? 0, ecoRes?.currency), sub: 'balance' },
      { label: 'Requests', value: rrRes?.length ?? 0, sub: 'submitted' },
    ];

    document.getElementById('overview-cards').innerHTML = stats.map(s => `
      <div class="stat-card">
        <div class="stat-label">${s.label}</div>
        <div class="stat-value">${s.value}</div>
        <div class="stat-sub">${s.sub}</div>
      </div>
    `).join('');
  } catch {
    document.getElementById('overview-cards').innerHTML = '<p class="loading-text">Could not load stats.</p>';
  }
}

/* ── CAD ────────────────────────────────────────────────────────────────── */
async function loadCad() {
  const list = document.getElementById('cad-list');
  try {
    const chars = await api('/cad');
    if (!chars?.length) {
      list.innerHTML = '<p class="loading-text">No characters found. Create one to get started.</p>';
      return;
    }
    list.innerHTML = chars.map(c => renderCharCard(c)).join('');
    list.querySelectorAll('.char-header').forEach(h => {
      h.addEventListener('click', () => {
        h.closest('.char-card').classList.toggle('open');
      });
    });
    list.querySelectorAll('.btn-add-vehicle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openAddVehicleModal(btn.dataset.charId);
      });
    });
  } catch {
    list.innerHTML = '<p class="loading-text">Failed to load characters.</p>';
  }
}

function renderCharCard(c) {
  const details = [
    { label: 'Age', value: c.age || 'N/A' },
    { label: 'Gender', value: c.gender || 'N/A' },
    { label: 'Hair', value: c.hairColor || 'N/A' },
    { label: 'Eyes', value: c.eyeColor || 'N/A' },
    { label: 'Height', value: c.height || 'N/A' },
    { label: 'Occupation', value: c.occupation || 'N/A' },
    { label: 'Address', value: c.address || 'N/A' },
    { label: 'Phone', value: c.phoneNumber || 'N/A' },
    { label: 'License', value: c.driversLicense || 'N/A' },
    { label: 'License Status', value: c.driverLicenseStatus || 'N/A' },
    { label: 'Emergency Contact', value: c.emergencyContact || 'N/A' },
  ];

  const vehicles = c.vehicles?.length
    ? c.vehicles.map(v => `
        <div class="vehicle-item">
          <span>${v.year ? v.year + ' ' : ''}${v.color ? v.color + ' ' : ''}${v.make} ${v.model}</span>
          ${v.licensePlate ? `<span style="color:var(--text-muted);font-size:12px">${v.licensePlate}</span>` : ''}
        </div>
      `).join('')
    : '<p class="empty-notice">No vehicles registered.</p>';

  const guns = c.guns?.length
    ? c.guns.map(g => `
        <div class="gun-item">
          <span>${g.name}</span>
          <span style="color:var(--text-muted);font-size:12px">${g.serialNumber || ''}</span>
        </div>
      `).join('')
    : '<p class="empty-notice">No firearms registered.</p>';

  return `
    <div class="char-card" id="char-${c._id}">
      <div class="char-header">
        <div>
          <div class="char-name">${c.characterName}</div>
          <div class="char-meta">${c.occupation || 'No occupation'} &bull; SSN: ${c.socialSecurityNumber || 'N/A'}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="char-status ${c.status === 'wanted' ? 'status-wanted' : 'status-clean'}">${c.status === 'wanted' ? 'WANTED' : 'CLEAN'}</span>
          <span class="char-chevron">&#9654;</span>
        </div>
      </div>
      <div class="char-body">
        ${c.status === 'wanted' && c.wantedReason ? `<div style="background:rgba(240,71,71,0.1);border:1px solid var(--danger);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--danger);margin:10px 0">Wanted: ${c.wantedReason}</div>` : ''}
        <div class="char-details-grid">
          ${details.map(d => `<div class="detail-item"><div class="detail-label">${d.label}</div><div class="detail-value">${d.value}</div></div>`).join('')}
        </div>
        <div class="char-section-title">
          Vehicles (${c.vehicles?.length || 0})
          <button class="btn-primary btn-sm btn-add-vehicle" data-char-id="${c._id}">Add Vehicle</button>
        </div>
        <div class="vehicle-list">${vehicles}</div>
        <div class="char-section-title" style="margin-top:16px">Firearms (${c.guns?.length || 0})</div>
        <div class="gun-list">${guns}</div>
        ${c.arrestHistory?.length ? `
          <div class="char-section-title" style="margin-top:16px">Arrest History (${c.arrestHistory.length})</div>
          ${c.arrestHistory.map(a => `<div class="vehicle-item"><span>${a.charge}</span><span style="color:var(--text-muted);font-size:12px">${a.outcome || ''} ${a.date ? '&bull; ' + new Date(a.date).toLocaleDateString() : ''}</span></div>`).join('')}
        ` : ''}
      </div>
    </div>
  `;
}

/* ── Economy ────────────────────────────────────────────────────────────── */
async function loadEconomy() {
  try {
    const [ecoRes, shopRes, lbRes] = await Promise.all([
      api('/economy'),
      api('/economy/shop'),
      api('/economy/leaderboard'),
    ]);

    // Balance
    const cur = ecoRes.currency || '$';
    document.getElementById('economy-balance').innerHTML = `
      <div class="balance-card">
        <div class="balance-label">Cash</div>
        <div class="balance-amount">${fmt(ecoRes.cash, cur)}</div>
        <div class="balance-total">Available to spend</div>
      </div>
      <div class="balance-card">
        <div class="balance-label">Bank</div>
        <div class="balance-amount">${fmt(ecoRes.bank, cur)}</div>
        <div class="balance-total">In the bank</div>
      </div>
      <div class="balance-card">
        <div class="balance-label">Total</div>
        <div class="balance-amount">${fmt(ecoRes.cash + ecoRes.bank, cur)}</div>
        <div class="balance-total">Combined wealth</div>
      </div>
    `;

    // Shop
    shopItems = shopRes || [];
    renderShop(shopItems, cur);

    // Inventory
    const inv = ecoRes.inventory || [];
    document.getElementById('inventory-list').innerHTML = inv.length
      ? inv.map(i => `<div class="inv-item"><span>${i.itemName}</span><span class="inv-item-qty">x${i.quantity}</span></div>`).join('')
      : '<p class="loading-text">Your inventory is empty.</p>';

    // Leaderboard
    const cur2 = lbRes.currency || cur;
    document.getElementById('leaderboard-list').innerHTML = (lbRes.entries || []).map(e => `
      <div class="lb-row">
        <span class="lb-rank ${e.rank <= 3 ? 'top' : ''}">${e.rank}</span>
        <span class="lb-name">${e.name}</span>
        <span class="lb-amount">${fmt(e.total, cur2)}</span>
      </div>
    `).join('') || '<p class="loading-text">No data yet.</p>';
  } catch {
    document.getElementById('economy-balance').innerHTML = '<p class="loading-text">Failed to load economy data.</p>';
  }
}

function renderShop(items, currency) {
  const shopList = document.getElementById('shop-list');
  if (!items.length) {
    shopList.innerHTML = '<p class="loading-text">No items in the shop.</p>';
    return;
  }
  shopList.innerHTML = items.map(item => `
    <div class="shop-item" data-name="${esc(item.name)}">
      <div class="shop-item-info">
        <div class="shop-item-name">${item.name}</div>
        ${item.description ? `<div class="shop-item-desc">${item.description}</div>` : ''}
      </div>
      <div class="shop-item-right">
        <span class="shop-item-price">${fmt(item.price, currency || '$')}</span>
        <button class="btn-primary btn-sm" onclick="openBuyModal(${JSON.stringify(item)})">Buy</button>
      </div>
    </div>
  `).join('');
}

function filterShop(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.shop-item').forEach(el => {
    const name = el.dataset.name.toLowerCase();
    el.style.display = name.includes(q) ? '' : 'none';
  });
}

function openBuyModal(item) {
  currentBuyItem = item;
  document.getElementById('buy-item-info').innerHTML = `
    <div>${item.name}</div>
    ${item.description ? `<div class="buy-desc">${item.description}</div>` : ''}
  `;
  document.getElementById('buy-qty').value = 1;
  updateBuyTotal();
  document.getElementById('form-buy-error').classList.add('hidden');
  openModal('modal-buy');
}

function updateBuyTotal() {
  if (!currentBuyItem) return;
  const qty = parseInt(document.getElementById('buy-qty').value) || 1;
  const total = currentBuyItem.price * qty;
  const cur = document.querySelector('.balance-amount')?.textContent?.[0] || '$';
  document.getElementById('buy-total').textContent = `Total: ${fmt(total, '$')}`;
}
document.getElementById?.('buy-qty')?.addEventListener?.('input', updateBuyTotal);
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('buy-qty')?.addEventListener('input', updateBuyTotal);
});

async function confirmBuy() {
  if (!currentBuyItem) return;
  const qty = parseInt(document.getElementById('buy-qty').value) || 1;
  const errEl = document.getElementById('form-buy-error');
  errEl.classList.add('hidden');

  try {
    const res = await apiPost('/economy/buy', { itemName: currentBuyItem.name, quantity: qty });
    closeModal('modal-buy');
    toast(`Purchased ${qty}x ${currentBuyItem.name}`, 'success');
    loaded['economy'] = false;
    loadEconomy();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

/* ── Role Requests ──────────────────────────────────────────────────────── */
async function loadRoleRequest() {
  try {
    const [typesRes, histRes] = await Promise.all([
      api('/rolerequest/types'),
      api('/rolerequest/mine'),
    ]);

    const area = document.getElementById('rr-form-area');

    if (!typesRes?.length) {
      area.innerHTML = '<p class="loading-text">No role types configured. Ask a staff member.</p>';
    } else {
      area.innerHTML = `
        <div id="rr-types">
          ${typesRes.map(rt => `
            <div class="rr-role-type" data-id="${rt.id}" onclick="selectRoleType('${rt.id}')">
              <div class="rr-role-name">${rt.roleName || rt.name}</div>
              <div class="rr-role-sub">Click to select</div>
            </div>
          `).join('')}
        </div>
        <div id="rr-approver-section" class="rr-approver-select">
          <div class="section-title" style="margin-top:14px">Select Approver</div>
          <div id="rr-approvers"></div>
          <div id="rr-submit-error" class="form-error hidden"></div>
          <div style="margin-top:12px">
            <button class="btn-primary" onclick="submitRoleRequest()">Submit Request</button>
          </div>
        </div>
      `;
    }

    // History
    const hist = histRes || [];
    document.getElementById('rr-history').innerHTML = hist.length
      ? hist.map(r => `
          <div class="rr-hist-item">
            <div class="rr-hist-role">${r.roleName}</div>
            <div class="rr-hist-meta">Approver: ${r.approverUsername} &bull; ${new Date(r.timestamp).toLocaleDateString()}</div>
            <span class="status-pill ${r.status === 'approved' ? 'pill-approved' : r.status === 'denied' ? 'pill-denied' : 'pill-pending'}">${r.status || 'pending'}</span>
          </div>
        `).join('')
      : '<p class="loading-text">No requests submitted yet.</p>';
  } catch {
    document.getElementById('rr-form-area').innerHTML = '<p class="loading-text">Failed to load role types.</p>';
  }
}

async function selectRoleType(id) {
  selectedRoleTypeId = id;
  selectedApproverId = null;

  document.querySelectorAll('.rr-role-type').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });

  const section = document.getElementById('rr-approver-section');
  section.classList.add('visible');

  const approversEl = document.getElementById('rr-approvers');
  approversEl.innerHTML = '<p class="loading-text">Loading approvers...</p>';

  try {
    const approvers = await api(`/rolerequest/approvers/${id}`);
    if (!approvers?.length) {
      approversEl.innerHTML = '<p class="loading-text">No approvers available.</p>';
      return;
    }
    approversEl.innerHTML = approvers.map(a => `
      <div class="rr-approver-option" data-id="${a.id}" onclick="selectApprover('${a.id}')">
        ${a.name}
      </div>
    `).join('');
  } catch {
    approversEl.innerHTML = '<p class="loading-text">Could not load approvers.</p>';
  }
}

function selectApprover(id) {
  selectedApproverId = id;
  document.querySelectorAll('.rr-approver-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === id);
  });
}

async function submitRoleRequest() {
  const errEl = document.getElementById('rr-submit-error');
  errEl.classList.add('hidden');

  if (!selectedRoleTypeId) { errEl.textContent = 'Select a role type.'; errEl.classList.remove('hidden'); return; }
  if (!selectedApproverId) { errEl.textContent = 'Select an approver.'; errEl.classList.remove('hidden'); return; }

  try {
    await apiPost('/rolerequest/submit', { roleTypeId: selectedRoleTypeId, approverId: selectedApproverId });
    toast('Role request submitted. Your approver has been notified via DM.', 'success');
    loaded['rolerequest'] = false;
    loadRoleRequest();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

/* ── LEO ────────────────────────────────────────────────────────────────── */
async function loadLeo() {
  loadBolos();
  loadCalls();
}

async function loadBolos() {
  const el = document.getElementById('leo-bolos');
  try {
    const bolos = await api('/leo/bolos');
    el.innerHTML = bolos?.length
      ? bolos.map(b => `
          <div class="bolo-card">
            <div class="bolo-name">${b.characterName}</div>
            <div class="bolo-reason">${b.reason}</div>
            ${b.description ? `<div class="bolo-reason" style="color:var(--text-muted)">${b.description}</div>` : ''}
            <div class="bolo-meta">Issued: ${new Date(b.createdAt).toLocaleString()} &bull; Expires: ${new Date(b.expiresAt).toLocaleString()}</div>
          </div>
        `).join('')
      : '<p class="loading-text">No active BOLOs.</p>';
  } catch {
    el.innerHTML = '<p class="loading-text">Failed to load BOLOs.</p>';
  }
}

async function loadCalls() {
  const el = document.getElementById('leo-calls');
  try {
    const calls = await api('/leo/calls');
    el.innerHTML = calls?.length
      ? calls.map(c => `
          <div class="call-card">
            <div class="call-id">${c.callId}</div>
            <div class="call-issue">${c.issue}</div>
            ${c.location ? `<div class="call-loc">${c.location}</div>` : ''}
            <div class="bolo-meta">${new Date(c.timestamp).toLocaleString()} &bull; ${c.respondingLeoUsername ? 'Responding: ' + c.respondingLeoUsername : 'No response yet'}</div>
          </div>
        `).join('')
      : '<p class="loading-text">No active calls.</p>';
  } catch {
    el.innerHTML = '<p class="loading-text">Failed to load calls.</p>';
  }
}

async function leoSearch() {
  const type = document.getElementById('leo-search-type').value;
  const query = document.getElementById('leo-search-input').value.trim();
  const results = document.getElementById('leo-results');

  if (!query) { results.innerHTML = '<p class="loading-text">Enter a search query.</p>'; return; }
  results.innerHTML = '<p class="loading-text">Searching...</p>';

  try {
    const data = await api(`/leo/search?type=${type}&query=${encodeURIComponent(query)}`);
    const chars = data.results || [];
    if (!chars.length) { results.innerHTML = '<p class="loading-text">No results found.</p>'; return; }

    results.innerHTML = chars.map(c => `
      <div class="leo-result-card">
        <div class="leo-result-name">${c.characterName} <span class="char-status ${c.status === 'wanted' ? 'status-wanted' : 'status-clean'}" style="font-size:10px">${c.status?.toUpperCase()}</span></div>
        <div class="leo-result-row">DOB / Age: <span>${c.age || 'N/A'}</span> &bull; Gender: <span>${c.gender || 'N/A'}</span></div>
        <div class="leo-result-row">Address: <span>${c.address || 'N/A'}</span></div>
        <div class="leo-result-row">License: <span>${c.driversLicense || 'N/A'}</span> &bull; Status: <span>${c.driverLicenseStatus || 'valid'}</span></div>
        <div class="leo-result-row">Plate: <span>${c.licensePlate || 'N/A'}</span></div>
        ${c.status === 'wanted' && c.wantedReason ? `<div class="leo-result-row" style="color:var(--danger)">Wanted: <span style="color:var(--danger)">${c.wantedReason}</span></div>` : ''}
        ${c.vehicles?.length ? `<div class="leo-result-row">Vehicles: <span>${c.vehicles.map(v => `${v.color || ''} ${v.make} ${v.model} (${v.licensePlate || 'no plate'})`).join(', ')}</span></div>` : ''}
        ${c.medicalInfo ? `<div class="leo-result-row">Medical: <span>${c.medicalInfo}</span></div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    results.innerHTML = `<p class="loading-text">${err.message}</p>`;
  }
}

/* ── Modals ─────────────────────────────────────────────────────────────── */
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

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
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const errEl = document.getElementById('form-char-error');
  errEl.classList.add('hidden');

  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    await apiPost('/cad/create', data);
    closeModal('modal-create-char');
    toast('Character created.', 'success');
    loaded['cad'] = false;
    loadCad();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
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
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const charId = data.charId;
  delete data.charId;

  const errEl = document.getElementById('form-vehicle-error');
  errEl.classList.add('hidden');

  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    await apiPost(`/cad/${charId}/vehicle`, data);
    closeModal('modal-add-vehicle');
    toast('Vehicle added.', 'success');
    loaded['cad'] = false;
    loadCad();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
}

/* ── API Helpers ────────────────────────────────────────────────────────── */
async function api(path) {
  const res = await fetch(`/api/portal${path}`, { credentials: 'include' });
  if (res.status === 401) { window.location.href = '/'; return null; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`/api/portal${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ── Toast ──────────────────────────────────────────────────────────────── */
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
  setTimeout(() => el.remove(), 4000);
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n, cur = '$') {
  return `${cur}${Number(n || 0).toLocaleString()}`;
}

function esc(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
