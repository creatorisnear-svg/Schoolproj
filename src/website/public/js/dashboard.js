const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

let currentUser = null;
let currentGuild = null;
let guilds = [];

function toast(msg, type = 'success') {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type} show`;
  setTimeout(() => toastEl.classList.remove('show'), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = '/dashboard/login';
    return null;
  }
  return res.json();
}

async function init() {
  try {
    const data = await api('/me');
    if (!data || !data.user) {
      window.location.href = '/dashboard/login';
      return;
    }
    currentUser = data.user;
    guilds = data.guilds || [];

    document.getElementById('nav-user').innerHTML = `
      <span style="color: var(--text-muted); font-size: 14px;">${currentUser.username}</span>
    `;

    renderServerSelect();
  } catch {
    window.location.href = '/dashboard/login';
  }
}

function renderServerSelect() {
  app.innerHTML = `
    <div style="padding-top: 96px; max-width: 900px; margin: 0 auto; padding-left: 24px; padding-right: 24px;">
      <div class="dash-header">
        <h1>Select a Server</h1>
        <p>Choose a server to manage. You can only configure servers where you have admin permissions and where the bot is present.</p>
      </div>
      <div class="server-list">
        ${guilds.length === 0 ? '<p style="color: var(--text-muted);">No servers found. Make sure the bot is in your server and you have admin permissions.</p>' : ''}
        ${guilds.map(g => `
          <div class="server-card" onclick="selectServer('${g.id}')">
            <div class="server-icon">
              ${g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64" alt="">` : g.name.charAt(0)}
            </div>
            <div>
              <div class="server-name">${escapeHtml(g.name)}</div>
              <div class="server-members">${g.memberCount || '—'} members</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function selectServer(guildId) {
  const data = await api(`/guild/${guildId}`);
  if (!data) return;
  currentGuild = data;
  renderDashboard();
}

function renderDashboard() {
  const g = currentGuild;
  const config = g.config || {};

  app.innerHTML = `
    <div class="dashboard-layout">
      <div class="sidebar">
        <div class="sidebar-section">
          <div class="sidebar-section-title">Server</div>
          <div class="sidebar-item active" onclick="renderDashboard()">Overview</div>
          <div class="sidebar-item" onclick="renderServerSelect()">Switch Server</div>
        </div>
        <div class="sidebar-section">
          <div class="sidebar-section-title">Modules</div>
          <div class="sidebar-item" onclick="renderModule('verification')">Verification</div>
          <div class="sidebar-item" onclick="renderModule('strikes')">Strike System</div>
          <div class="sidebar-item" onclick="renderModule('tickets')">Tickets</div>
          <div class="sidebar-item" onclick="renderModule('dispatch')">Voice Dispatch</div>
          <div class="sidebar-item" onclick="renderModule('priority')">Priority Tracker</div>
          <div class="sidebar-item" onclick="renderModule('antipromo')">Anti-Promoting</div>
        </div>
      </div>
      <div class="dashboard-content">
        <div class="dash-header">
          <h1>${escapeHtml(g.name)}</h1>
          <p>Server overview and configuration</p>
        </div>
        <div class="dash-grid">
          <div class="dash-card">
            <div class="dash-label">Members</div>
            <div class="dash-value">${g.memberCount || '—'}</div>
          </div>
          <div class="dash-card">
            <div class="dash-label">Premium</div>
            <div class="dash-value">${g.premium ? 'Active' : 'Inactive'}</div>
          </div>
          <div class="dash-card">
            <div class="dash-label">Log Channel</div>
            <div class="dash-value" style="font-size: 16px;">${config.logChannelId ? '#' + (config.logChannelName || config.logChannelId) : 'Not Set'}</div>
          </div>
        </div>

        <div style="margin-top: 24px;">
          <div class="config-section">
            <h3>Module Status</h3>
            ${moduleRow('Verification System', config.verifyEnabled)}
            ${moduleRow('Strike System', config.strikeEnabled)}
            ${moduleRow('Ticket Support', config.ticketEnabled)}
            ${moduleRow('Voice Dispatch', config.dispatchEnabled)}
            ${moduleRow('Priority Tracker', config.priorityEnabled)}
            ${moduleRow('Anti-Promoting', config.antiPromotingEnabled)}
            ${moduleRow('Welcome System', config.welcomeEnabled)}
            ${moduleRow('RP Calendar', config.calendarEnabled)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function moduleRow(name, enabled) {
  return `
    <div class="config-row">
      <span class="config-label">${name}</span>
      <span class="status-badge ${enabled ? 'enabled' : 'disabled'}">
        <span class="status-dot"></span>
        ${enabled ? 'Enabled' : 'Disabled'}
      </span>
    </div>
  `;
}

async function renderModule(mod) {
  const data = await api(`/guild/${currentGuild.id}/module/${mod}`);
  if (!data) return;

  const content = document.querySelector('.dashboard-content');
  if (!content) return;

  let html = `
    <div class="dash-header">
      <h1>${data.name}</h1>
      <p>${data.description}</p>
    </div>
  `;

  if (data.settings && data.settings.length > 0) {
    html += `<div class="config-section"><h3>Configuration</h3>`;
    for (const s of data.settings) {
      html += `
        <div class="config-row">
          <span class="config-label">${s.label}</span>
          <span class="config-value">${escapeHtml(String(s.value ?? 'Not Set'))}</span>
        </div>
      `;
    }
    html += `</div>`;
  }

  if (data.stats && data.stats.length > 0) {
    html += `<div class="dash-grid" style="margin-top: 16px;">`;
    for (const s of data.stats) {
      html += `
        <div class="dash-card">
          <div class="dash-label">${s.label}</div>
          <div class="dash-value">${s.value}</div>
        </div>
      `;
    }
    html += `</div>`;
  }

  content.innerHTML = html;

  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(el => {
    if (el.textContent.trim().toLowerCase().includes(mod.substring(0, 5))) {
      el.classList.add('active');
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
