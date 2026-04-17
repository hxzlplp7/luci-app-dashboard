import { dashboardApi } from './api.js';

function normalizeRecordSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    enable: String(source.enable || '0'),
    record_time: String(source.record_time || ''),
    app_valid_time: String(source.app_valid_time || ''),
    history_data_size: String(source.history_data_size || ''),
    history_data_path: String(source.history_data_path || ''),
  };
}

function encodeBody(fields) {
  return new URLSearchParams(fields).toString();
}

export async function loadRecordSettings() {
  return normalizeRecordSettings(await dashboardApi('/record/base'));
}

export async function saveRecordSettings(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};

  return normalizeRecordSettings(
    await dashboardApi('/record/base', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: encodeBody({
        enable: source.enable || '0',
        record_time: source.record_time || '',
        app_valid_time: source.app_valid_time || '',
        history_data_size: source.history_data_size || '',
        history_data_path: source.history_data_path || '',
      }),
    })
  );
}

export async function runRecordAction(name) {
  return dashboardApi('/record/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: encodeBody({
      name: name || '',
    }),
  });
}
