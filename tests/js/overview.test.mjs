import test from 'node:test';
import assert from 'node:assert/strict';

const apiModuleUrl = new URL('../../htdocs/luci-static/dashboard/api.js', import.meta.url);
const overviewModuleUrl = new URL('../../htdocs/luci-static/dashboard/sections-overview.js', import.meta.url);

function installDashboardApp(apiBase) {
  const originalDocument = globalThis.document;

  globalThis.document = {
    getElementById(id) {
      if (id === 'dashboard-app') {
        return {
          dataset: {
            apiBase,
          },
        };
      }

      return null;
    },
  };

  return () => {
    if (typeof originalDocument === 'undefined') {
      delete globalThis.document;
      return;
    }

    globalThis.document = originalDocument;
  };
}

test('normalizeOverview fills missing nested defaults', async () => {
  const { normalizeOverview } = await import(overviewModuleUrl);

  const overview = normalizeOverview({
    system: { hostname: 'router' },
  });

  assert.equal(overview.system.hostname, 'router');
  assert.deepEqual(overview.network.dns, []);
  assert.equal(overview.capabilities.nlbwmon, false);
});

test('dashboardApi reads the runtime api base from dashboard-app', async () => {
  const originalFetch = globalThis.fetch;
  const restoreDocument = installDashboardApp('/proxy/base/admin/dashboard/api');
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });

    return {
      ok: true,
      async json() {
        return {
          ok: true,
          data: {
            source: 'ok',
          },
        };
      },
    };
  };

  try {
    const { dashboardApi } = await import(apiModuleUrl);
    const payload = await dashboardApi('/overview');

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/proxy/base/admin/dashboard/api/overview');
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.deepEqual(payload, { source: 'ok' });
  } finally {
    globalThis.fetch = originalFetch;
    restoreDocument();
  }
});

test('dashboardApi surfaces backend error messages from object envelopes', async () => {
  const originalFetch = globalThis.fetch;
  const restoreDocument = installDashboardApp('/proxy/base/admin/dashboard/api');

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    async json() {
      return {
        ok: false,
        error: {
          code: 'overview_failed',
          message: 'Overview exploded',
          details: {
            section: 'overview',
          },
        },
      };
    },
  });

  try {
    const { dashboardApi } = await import(apiModuleUrl);

    await assert.rejects(
      dashboardApi('/overview'),
      (error) => error instanceof Error && error.message === 'Overview exploded'
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreDocument();
  }
});

test('dashboardApi still supports string error envelopes', async () => {
  const originalFetch = globalThis.fetch;
  const restoreDocument = installDashboardApp('/proxy/base/admin/dashboard/api');

  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    async json() {
      return {
        ok: false,
        error: 'Legacy string error',
      };
    },
  });

  try {
    const { dashboardApi } = await import(apiModuleUrl);

    await assert.rejects(
      dashboardApi('/overview'),
      (error) => error instanceof Error && error.message === 'Legacy string error'
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreDocument();
  }
});

test('loadOverview requests overview endpoint and returns normalized data', async () => {
  const originalFetch = globalThis.fetch;
  const restoreDocument = installDashboardApp('/proxy/base/admin/dashboard/api');
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });

    return {
      ok: true,
      async json() {
        return {
          ok: true,
          data: {
            system: { hostname: 'edge-router' },
            network: {},
          },
        };
      },
    };
  };

  try {
    const { loadOverview } = await import(overviewModuleUrl);
    const overview = await loadOverview();

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/proxy/base/admin/dashboard/api/overview');
    assert.equal(requests[0].options.credentials, 'same-origin');
    assert.equal(requests[0].options.headers.Accept, 'application/json');
    assert.equal(overview.system.hostname, 'edge-router');
    assert.deepEqual(overview.network.dns, []);
    assert.equal(overview.capabilities.nlbwmon, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDocument();
  }
});
