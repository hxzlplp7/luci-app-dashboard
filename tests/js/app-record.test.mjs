import test from 'node:test';
import assert from 'node:assert/strict';

const appModuleUrl = new URL('../../htdocs/luci-static/dashboard/app.js', import.meta.url);

function createSectionElement() {
  return {
    innerHTML: '',
    querySelector(selector) {
      if (selector === '[data-record-form]' && this.innerHTML.includes('data-record-form')) {
        return {
          addEventListener() {},
          querySelector() {
            return null;
          },
        };
      }

      if (selector === '[data-record-clear]' && this.innerHTML.includes('data-record-clear')) {
        return {
          addEventListener() {},
        };
      }

      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

function installDashboardDom() {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const sections = {
    overview: createSectionElement(),
    users: createSectionElement(),
    network: createSectionElement(),
    system: createSectionElement(),
    record: createSectionElement(),
    feature: createSectionElement(),
    settings: createSectionElement(),
  };

  globalThis.document = {
    getElementById(id) {
      if (id === 'dashboard-app') {
        return {
          dataset: {
            apiBase: '/proxy/base/admin/dashboard/api',
            sessionToken: 'csrf-token',
          },
        };
      }

      return null;
    },
    querySelector(selector) {
      const match = selector.match(/^\[data-section="([^"]+)"\]$/);
      if (match) {
        return sections[match[1]] || null;
      }

      return null;
    },
    createElement() {
      return createSectionElement();
    },
    body: {
      appendChild() {},
    },
  };

  globalThis.window = {
    lucide: {
      createIcons() {},
    },
  };

  return {
    sections,
    restore() {
      if (typeof originalDocument === 'undefined') {
        delete globalThis.document;
      } else {
        globalThis.document = originalDocument;
      }

      if (typeof originalWindow === 'undefined') {
        delete globalThis.window;
      } else {
        globalThis.window = originalWindow;
      }
    },
  };
}

test('app bootstrap wires record section into the dashboard shell', async () => {
  const originalFetch = globalThis.fetch;
  const { sections, restore } = installDashboardDom();

  globalThis.fetch = async (url) => {
    if (url.endsWith('/overview')) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              system: {
                model: 'Test Router',
                firmware: '1.0.0',
                cpuUsage: 10,
                memUsage: 20,
              },
              network: {
                wanIp: '1.1.1.1',
                lanIp: '192.168.1.1',
                dns: ['1.1.1.1'],
              },
              traffic: {
                rx_bytes: 100,
                tx_bytes: 50,
              },
              devices: [],
              domains: {},
              capabilities: {
                nlbwmon: false,
              },
            },
          };
        },
      };
    }

    if (url.includes('/users')) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            data: {
              page: 1,
              page_size: 20,
              total_num: 0,
              list: [],
            },
          };
        },
      };
    }

    if (url.endsWith('/record/base')) {
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
            },
          };
        },
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    await import(appModuleUrl);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.match(sections.record.innerHTML, /data-record-form/);
    assert.match(sections.record.innerHTML, /Save Settings/);
    assert.match(sections.record.innerHTML, /Clear History/);
    assert.doesNotMatch(sections.record.innerHTML, /Pending integration/);
  } finally {
    globalThis.fetch = originalFetch;
    restore();
  }
});
