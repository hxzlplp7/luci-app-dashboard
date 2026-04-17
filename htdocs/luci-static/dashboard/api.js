const DEFAULT_API_BASE = '/cgi-bin/luci/admin/dashboard/api';

function readErrorMessage(error, fallbackMessage) {
  if (typeof error === 'string' && error) {
    return error;
  }

  if (error && typeof error === 'object') {
    if (typeof error.message === 'string' && error.message) {
      return error.message;
    }

    if (typeof error.code === 'string' && error.code) {
      return error.code;
    }
  }

  return fallbackMessage;
}

function resolveApiBase() {
  if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
    const mount = document.getElementById('dashboard-app');
    if (mount && mount.dataset && mount.dataset.apiBase) {
      return mount.dataset.apiBase;
    }
  }

  return DEFAULT_API_BASE;
}

export async function dashboardApi(path, options = {}) {
  const requestPath = path.startsWith('/') ? path : `/${path}`;
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(`${resolveApiBase()}${requestPath}`, {
    credentials: 'same-origin',
    ...options,
    headers,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    if (!response.ok) {
      throw new Error(`Dashboard API request failed with HTTP ${response.status}`);
    }
    throw new Error('Dashboard API returned invalid JSON');
  }

  if (!response.ok) {
    const message = readErrorMessage(
      payload && payload.error,
      `Dashboard API request failed with HTTP ${response.status}`
    );
    throw new Error(message);
  }

  if (!payload || payload.ok === false) {
    throw new Error(readErrorMessage(payload && payload.error, 'Dashboard API request failed'));
  }

  return payload.data;
}
