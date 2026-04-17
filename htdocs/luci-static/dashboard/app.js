import { buildSectionState } from './shell.js';
import { loadOverview } from './sections-overview.js';
import { loadUserDetail, loadUsers, saveUserRemark } from './sections-users.js';

const SECTION_META = {
  overview: {
    title: 'Overview',
    subtitle: 'Primary data source: /overview',
  },
  users: {
    title: 'Users',
    subtitle: 'Primary data source: /users',
  },
  network: {
    title: 'Network',
    subtitle: 'Waiting for module wiring',
  },
  system: {
    title: 'System',
    subtitle: 'Waiting for module wiring',
  },
  record: {
    title: 'Record',
    subtitle: 'Waiting for module wiring',
  },
  feature: {
    title: 'Feature',
    subtitle: 'Waiting for module wiring',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Waiting for module wiring',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value, suffix = '') {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }

  return `${value}${suffix}`;
}

function formatBytes(value) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let index = 0;

  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }

  const precision = current >= 10 || index === 0 ? 0 : 1;
  return `${current.toFixed(precision)} ${units[index]}`;
}

function getUserDisplayName(user) {
  return user.nickname || user.hostname || user.mac || '-';
}

function createUserDrawerState() {
  return {
    open: false,
    mac: '',
    loading: false,
    saving: false,
    detailError: null,
    saveError: null,
    detail: null,
  };
}

export function applySavedRemarkResult(dashboard, targetMac, targetValue) {
  if (!dashboard || !targetMac) {
    return dashboard;
  }

  if (dashboard.users && Array.isArray(dashboard.users.list)) {
    dashboard.users.list = dashboard.users.list.map((item) =>
      item.mac === targetMac ? { ...item, nickname: targetValue } : item
    );
  }

  if (
    dashboard.userDrawer &&
    dashboard.userDrawer.open &&
    dashboard.userDrawer.mac === targetMac &&
    dashboard.userDrawer.detail
  ) {
    dashboard.userDrawer.detail = {
      ...dashboard.userDrawer.detail,
      device: {
        ...dashboard.userDrawer.detail.device,
        nickname: targetValue,
      },
    };
  }

  return dashboard;
}

function renderSectionFrame(sectionName, bodyHtml, badgeHtml = '') {
  const mount = document.querySelector(`[data-section="${sectionName}"]`);
  if (!mount) {
    return;
  }

  const meta = SECTION_META[sectionName];
  mount.innerHTML = `
    <div class="dashboard-panel-header">
      <div>
        <h2 class="dashboard-panel-title">${escapeHtml(meta.title)}</h2>
        <p class="dashboard-panel-subtitle">${escapeHtml(meta.subtitle)}</p>
      </div>
      ${badgeHtml}
    </div>
    <div class="dashboard-panel-body">${bodyHtml}</div>
  `;
}

function renderOverviewLoading() {
  renderSectionFrame(
    'overview',
    '<p class="dashboard-note">Loading overview from <code>/overview</code>...</p>',
    '<span class="dashboard-status-badge">Loading</span>'
  );
}

function renderOverviewError(error) {
  renderSectionFrame(
    'overview',
    `<p class="dashboard-note">Overview failed to load.</p><p class="dashboard-note is-muted">${escapeHtml(error.message || 'Unknown error')}</p>`,
    '<span class="dashboard-status-badge is-error">Error</span>'
  );
}

function renderOverviewContent(overview) {
  const dnsMarkup = overview.network.dns.length
    ? `<ul class="dashboard-list">${overview.network.dns.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="dashboard-note is-muted">No DNS servers reported.</p>';

  renderSectionFrame(
    'overview',
    `
      <div class="dashboard-overview-grid">
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">WAN</p>
          <p class="dashboard-metric-value">${escapeHtml(overview.network.wanIp || '-')}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">LAN</p>
          <p class="dashboard-metric-value">${escapeHtml(overview.network.lanIp || '-')}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Model</p>
          <p class="dashboard-metric-value">${escapeHtml(overview.system.model || '-')}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Firmware</p>
          <p class="dashboard-metric-value">${escapeHtml(overview.system.firmware || '-')}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">CPU</p>
          <p class="dashboard-metric-value">${formatNumber(overview.system.cpuUsage, '%')}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Memory</p>
          <p class="dashboard-metric-value">${formatNumber(overview.system.memUsage, '%')}</p>
        </article>
      </div>
      <div class="dashboard-overview-grid" style="margin-top: 12px;">
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">DNS</p>
          ${dnsMarkup}
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Traffic</p>
          <p class="dashboard-metric-value">RX ${formatNumber(overview.traffic.rx_bytes)} / TX ${formatNumber(overview.traffic.tx_bytes)}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Devices</p>
          <p class="dashboard-metric-value">${formatNumber(overview.devices.length)}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Capabilities</p>
          <p class="dashboard-metric-value">${overview.capabilities.nlbwmon ? 'nlbwmon enabled' : 'nlbwmon unavailable'}</p>
        </article>
      </div>
    `,
    '<span class="dashboard-status-badge">Live</span>'
  );
}

function renderPlaceholder(sectionName) {
  renderSectionFrame(
    sectionName,
    '<p class="dashboard-note">Pending integration.</p><p class="dashboard-note is-muted">This section is scaffolded and ready for its dedicated module.</p>'
  );
}

function renderUsersLoading() {
  renderSectionFrame(
    'users',
    '<p class="dashboard-note">Loading users from <code>/users</code>...</p>',
    '<span class="dashboard-status-badge">Loading</span>'
  );
}

function renderUsersError(error) {
  renderSectionFrame(
    'users',
    `<p class="dashboard-note">Users failed to load.</p><p class="dashboard-note is-muted">${escapeHtml(error.message || 'Unknown error')}</p>`,
    '<span class="dashboard-status-badge is-error">Error</span>'
  );
}

function attachUserListEvents() {
  const mount = document.querySelector('[data-section="users"]');
  if (!mount) {
    return;
  }

  const buttons = mount.querySelectorAll('[data-user-mac]');
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const mac = button.getAttribute('data-user-mac');
      if (mac) {
        openUserDrawer(mac);
      }
    });
  }
}

function renderUsersContent(users) {
  const rows = users.list.length
    ? users.list
        .map(
          (user) => `
            <button
              type="button"
              data-user-mac="${escapeHtml(user.mac)}"
              style="display:flex;width:100%;justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 0;border:0;border-bottom:1px solid #e2e8f0;background:transparent;text-align:left;cursor:pointer;"
            >
              <span style="display:block;min-width:0;">
                <strong style="display:block;color:#0f172a;">${escapeHtml(getUserDisplayName(user))}</strong>
                <span class="dashboard-note is-muted" style="display:block;margin-top:4px;">${escapeHtml(user.ip || 'No IP')} · ${escapeHtml(user.mac)}</span>
              </span>
              <span style="display:block;text-align:right;color:#475569;flex-shrink:0;">
                <span style="display:block;">Down ${escapeHtml(formatBytes(user.traffic.today_down_bytes))}</span>
                <span style="display:block;margin-top:4px;">Up ${escapeHtml(formatBytes(user.traffic.today_up_bytes))}</span>
              </span>
            </button>
          `
        )
        .join('')
    : '<p class="dashboard-note is-muted">No active users detected.</p>';

  renderSectionFrame(
    'users',
    `
      <div class="dashboard-overview-grid">
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Users</p>
          <p class="dashboard-metric-value">${formatNumber(users.total_num)}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Page</p>
          <p class="dashboard-metric-value">${formatNumber(users.page)}</p>
        </article>
      </div>
      <div style="margin-top: 12px;">
        ${rows}
      </div>
    `,
    '<span class="dashboard-status-badge">Live</span>'
  );

  attachUserListEvents();
}

function ensureUserDrawerRoot() {
  let root = document.getElementById('dashboard-user-drawer-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'dashboard-user-drawer-root';
    document.body.appendChild(root);
  }

  return root;
}

function attachUserDrawerEvents() {
  const root = document.getElementById('dashboard-user-drawer-root');
  if (!root) {
    return;
  }

  const backdrop = root.querySelector('[data-drawer-backdrop]');
  const closeButton = root.querySelector('[data-drawer-close]');
  const saveButton = root.querySelector('[data-drawer-save]');

  if (backdrop) {
    backdrop.addEventListener('click', closeUserDrawer);
  }

  if (closeButton) {
    closeButton.addEventListener('click', closeUserDrawer);
  }

  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      const dashboard = window.dashboardState;
      if (!dashboard || !dashboard.userDrawer.open || dashboard.userDrawer.saving) {
        return;
      }

      const input = root.querySelector('[data-drawer-remark]');
      const targetMac = dashboard.userDrawer.mac;
      const targetValue = input ? input.value : '';

      dashboard.userDrawer.saving = true;
      dashboard.userDrawer.saveError = null;
      renderUserDrawer();

      try {
        await saveUserRemark(targetMac, targetValue);
        applySavedRemarkResult(dashboard, targetMac, targetValue);

        if (dashboard.users) {
          renderUsersContent(dashboard.users);
        }
      } catch (error) {
        if (dashboard.userDrawer && dashboard.userDrawer.open && dashboard.userDrawer.mac === targetMac) {
          dashboard.userDrawer.saveError = error;
        }
      } finally {
        if (dashboard.userDrawer && dashboard.userDrawer.open && dashboard.userDrawer.mac === targetMac) {
          dashboard.userDrawer.saving = false;
          renderUserDrawer();
        }
      }
    });
  }
}

function renderUserDrawer() {
  if (typeof document === 'undefined') {
    return;
  }

  const dashboard = window.dashboardState;
  const drawerState = dashboard && dashboard.userDrawer;
  const root = ensureUserDrawerRoot();

  if (!drawerState || !drawerState.open) {
    root.innerHTML = '';
    return;
  }

  let content = '<p class="dashboard-note">Loading user detail...</p>';

  if (drawerState.detailError) {
    content = `<p class="dashboard-note">Failed to load detail.</p><p class="dashboard-note is-muted">${escapeHtml(drawerState.detailError.message || 'Unknown error')}</p>`;
  } else if (!drawerState.loading && drawerState.detail) {
    const detail = drawerState.detail;
    const device = detail.device;
    const traffic = detail.traffic;
    const saveErrorMarkup = drawerState.saveError
      ? `<p class="dashboard-note is-muted" style="margin:12px 0 0;color:#b91c1c;">${escapeHtml(drawerState.saveError.message || 'Unknown error')}</p>`
      : '';

    content = `
      <div class="dashboard-overview-grid">
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Display</p>
          <p class="dashboard-metric-value">${escapeHtml(getUserDisplayName(device))}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">IP</p>
          <p class="dashboard-metric-value">${escapeHtml(device.ip || '-')}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Down Today</p>
          <p class="dashboard-metric-value">${escapeHtml(formatBytes(traffic.today_down_bytes))}</p>
        </article>
        <article class="dashboard-metric">
          <p class="dashboard-metric-label">Up Today</p>
          <p class="dashboard-metric-value">${escapeHtml(formatBytes(traffic.today_up_bytes))}</p>
        </article>
      </div>
      <div style="margin-top:16px;">
        <label class="dashboard-metric-label" for="dashboard-user-remark-input" style="display:block;margin-bottom:8px;">Remark</label>
        <input
          id="dashboard-user-remark-input"
          data-drawer-remark
          type="text"
          value="${escapeHtml(device.nickname || '')}"
          style="width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px;box-sizing:border-box;"
        />
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;">
          <p class="dashboard-note is-muted" style="margin:0;">${escapeHtml(device.mac)}</p>
          <button
            type="button"
            data-drawer-save
            style="padding:10px 14px;border:0;border-radius:999px;background:#2563eb;color:#fff;font-weight:700;cursor:pointer;"
          >
            ${drawerState.saving ? 'Saving...' : 'Save Remark'}
          </button>
        </div>
        ${saveErrorMarkup}
      </div>
      <div style="margin-top:16px;">
        <p class="dashboard-metric-label">Recent Domains</p>
        <p class="dashboard-note is-muted">${detail.recent_domains.length ? escapeHtml(detail.recent_domains.join(', ')) : 'No recent domain data yet.'}</p>
        <p class="dashboard-metric-label" style="margin-top:12px;">History</p>
        <p class="dashboard-note is-muted">${detail.history.length ? escapeHtml(detail.history.join(', ')) : 'No history data yet.'}</p>
      </div>
    `;
  }

  root.innerHTML = `
    <div data-drawer-backdrop style="position:fixed;inset:0;background:rgba(15,23,42,0.35);z-index:1000;"></div>
    <aside style="position:fixed;top:0;right:0;height:100vh;width:min(420px,100vw);padding:24px;background:#ffffff;box-shadow:-12px 0 32px rgba(15,23,42,0.16);z-index:1001;overflow:auto;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
        <div>
          <h2 class="dashboard-panel-title">User Detail</h2>
          <p class="dashboard-panel-subtitle">${escapeHtml(drawerState.mac)}</p>
        </div>
        <button
          type="button"
          data-drawer-close
          style="padding:8px 12px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;cursor:pointer;"
        >
          Close
        </button>
      </div>
      <div style="margin-top:16px;">
        ${content}
      </div>
    </aside>
  `;

  attachUserDrawerEvents();
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
}

export async function openUserDrawer(mac) {
  const dashboard = window.dashboardState;
  if (!dashboard) {
    return;
  }

  dashboard.userDrawer = {
    ...dashboard.userDrawer,
    open: true,
    mac,
    loading: true,
    saving: false,
    detailError: null,
    saveError: null,
    detail: null,
  };

  renderUserDrawer();

  try {
    const detail = await loadUserDetail(mac);
    if (!window.dashboardState.userDrawer.open || window.dashboardState.userDrawer.mac !== mac) {
      return;
    }

    dashboard.userDrawer.detail = detail;
  } catch (error) {
    if (!window.dashboardState.userDrawer.open || window.dashboardState.userDrawer.mac !== mac) {
      return;
    }

    dashboard.userDrawer.detailError = error;
  } finally {
    if (window.dashboardState.userDrawer.mac === mac) {
      dashboard.userDrawer.loading = false;
      renderUserDrawer();
    }
  }
}

export function closeUserDrawer() {
  const dashboard = window.dashboardState;
  if (!dashboard) {
    return;
  }

  dashboard.userDrawer = {
    ...createUserDrawerState(),
  };

  renderUserDrawer();
}

async function bootstrapDashboard() {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') {
    return;
  }

  const container = document.getElementById('dashboard-app');
  if (!container) {
    return;
  }

  const state = buildSectionState();
  window.dashboardState = {
    state,
    overview: null,
    users: null,
    userDrawer: createUserDrawerState(),
  };

  for (const sectionName of ['network', 'system', 'record', 'feature', 'settings']) {
    renderPlaceholder(sectionName);
  }

  renderOverviewLoading();
  renderUsersLoading();
  refreshIcons();

  state.overview.loading = true;
  state.users.loading = true;

  const overviewTask = (async () => {
    try {
      const overview = await loadOverview();
      state.overview.loaded = true;
      window.dashboardState.overview = overview;
      renderOverviewContent(overview);
    } catch (error) {
      state.overview.error = error;
      renderOverviewError(error);
    } finally {
      state.overview.loading = false;
      refreshIcons();
    }
  })();

  const usersTask = (async () => {
    try {
      const users = await loadUsers();
      state.users.loaded = true;
      window.dashboardState.users = users;
      renderUsersContent(users);
    } catch (error) {
      state.users.error = error;
      renderUsersError(error);
    } finally {
      state.users.loading = false;
      refreshIcons();
    }
  })();

  await Promise.allSettled([overviewTask, usersTask]);
}

bootstrapDashboard();
