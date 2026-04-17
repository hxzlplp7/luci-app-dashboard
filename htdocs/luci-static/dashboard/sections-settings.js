import { dashboardApi } from './api.js';

function normalizeDashboardSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    monitor_device: String(source.monitor_device || ''),
  };
}

export async function loadDashboardSettings() {
  return normalizeDashboardSettings(await dashboardApi('/settings/dashboard'));
}

export async function saveDashboardSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};

  return normalizeDashboardSettings(
    await dashboardApi('/settings/dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: new URLSearchParams({
        monitor_device: source.monitor_device || '',
      }).toString(),
    })
  );
}
