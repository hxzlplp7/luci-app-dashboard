import { dashboardApi } from './api.js';

function cloneList(value) {
  return Array.isArray(value) ? [...value] : [];
}

function mergeObject(defaults, value) {
  return {
    ...defaults,
    ...(value && typeof value === 'object' ? value : {}),
  };
}

function normalizeTraffic(raw) {
  return mergeObject(
    {
      today_up_bytes: 0,
      today_down_bytes: 0,
      supported: false,
    },
    raw
  );
}

function normalizeUser(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    mac: String(source.mac || ''),
    ip: String(source.ip || ''),
    hostname: String(source.hostname || ''),
    nickname: String(source.nickname || ''),
    traffic: normalizeTraffic(source.traffic),
  };
}

export function normalizeUsers(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    page: Number.isFinite(source.page) ? source.page : 1,
    page_size: Number.isFinite(source.page_size) ? source.page_size : 20,
    total_num: Number.isFinite(source.total_num) ? source.total_num : 0,
    list: cloneList(source.list).map(normalizeUser),
  };
}

export function normalizeUserDetail(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};

  return {
    device: normalizeUser(source.device),
    traffic: normalizeTraffic(source.traffic),
    recent_domains: cloneList(source.recent_domains),
    history: cloneList(source.history),
  };
}

export async function loadUsers() {
  const raw = await dashboardApi('/users');
  return normalizeUsers(raw);
}

export async function loadUserDetail(mac) {
  const raw = await dashboardApi(`/users/detail?mac=${encodeURIComponent(mac)}`);
  return normalizeUserDetail(raw);
}

export async function saveUserRemark(mac, value) {
  return dashboardApi('/users/remark', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body: new URLSearchParams({
      mac,
      value: value ?? '',
    }).toString(),
  });
}
