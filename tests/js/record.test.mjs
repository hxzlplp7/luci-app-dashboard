import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../../htdocs/luci-static/dashboard/sections-record.js', import.meta.url);

function installDashboardApp(apiBase, sessionToken = '') {
  const originalDocument = globalThis.document;

  globalThis.document = {
    getElementById(id) {
      if (id === 'dashboard-app') {
        return {
          dataset: {
            apiBase,
            sessionToken,
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

test('record section helpers target expected endpoints', async () => {
  const originalFetch = globalThis.fetch;
  const restoreDocument = installDashboardApp('/proxy/base/admin/dashboard/api', 'csrf-token');
  const requests = [];

  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          data: {
            enable: '1',
            record_time: '7',
            app_valid_time: '5',
            history_data_size: '128',
            history_data_path: '/tmp/dashboard/history',
            cleared: true,
          },
        };
      },
    };
  };

  try {
    const { loadRecordSettings, saveRecordSettings, runRecordAction } = await import(moduleUrl);

    await loadRecordSettings();
    await saveRecordSettings({
      enable: '1',
      record_time: '9',
      app_valid_time: '6',
      history_data_size: '256',
      history_data_path: '/tmp/dashboard/history',
    });
    await runRecordAction('clear_history');

    assert.equal(requests[0].url, '/proxy/base/admin/dashboard/api/record/base');
    assert.equal(requests[0].options.method, 'GET');

    assert.equal(requests[1].url, '/proxy/base/admin/dashboard/api/record/base');
    assert.equal(requests[1].options.method, 'POST');
    assert.match(requests[1].options.body, /enable=1/);
    assert.match(requests[1].options.body, /record_time=9/);
    assert.equal(requests[1].options.headers['X-Dashboard-CSRF-Token'], 'csrf-token');

    assert.equal(requests[2].url, '/proxy/base/admin/dashboard/api/record/action');
    assert.equal(requests[2].options.method, 'POST');
    assert.match(requests[2].options.body, /name=clear_history/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDocument();
  }
});
