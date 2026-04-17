import { dashboardApi } from './api.js';

function normalizeSystemSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    lan_ifname: String(source.lan_ifname || ''),
  };
}

export async function loadSystemSettings() {
  return normalizeSystemSettings(await dashboardApi('/system/config'));
}

export async function saveSystemSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};

  return normalizeSystemSettings(
    await dashboardApi('/system/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({
        lan_ifname: source.lan_ifname || '',
      }).toString(),
    })
  );
}
