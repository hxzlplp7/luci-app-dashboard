# Dashboard Stage 1 Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `luci-app-dashboard` 中完成第一阶段“单页外壳 + 模块化内核”集成，覆盖 Dashboard、Dashboard 设置、用户、网络、系统、记录与特征库，并脱离 `fwxd/kmod-fwx` 依赖。

**Architecture:** 保留 `/admin/dashboard` 单页入口，把现有 [dashboard.lua](/d:/workspace/luci-app-dashboard/luasrc/controller/dashboard.lua) 重构为薄路由与鉴权层，并新增 `luasrc/dashboard/{api,services,sources}` 模块层。前端把 [main.htm](/d:/workspace/luci-app-dashboard/luasrc/view/dashboard/main.htm) 改成壳模板，实际逻辑拆到 `htdocs/luci-static/dashboard/*.js`，各模块按需加载并通过统一 `/admin/dashboard/api/` 协议通信。

**Tech Stack:** LuCI Lua 控制器/模块、UCI、ubus、`nixio`、纯静态 JavaScript、Node.js 内置测试器、Python 3、GitHub Actions OpenWrt SDK。

---

## Scope Check

虽然 spec 涵盖多个功能域，但这些功能共享同一入口页、同一 API 协议、同一 dashboard 自有配置、同一能力探测逻辑与同一前端壳层，因此保持为一个分阶段实施计划是合理的。任务内部仍按“基础设施 → 总览 → 单页外壳 → 用户 → 网络/系统/设置 → 记录 → 特征库 → 验收”拆分，确保每个任务都能独立验证。

## File Structure

### Existing Files To Modify

- `Makefile`
  责任：补充阶段一所需依赖与打包说明，确保静态资源和新模块打包正常。
- `.github/workflows/release.yml`
  责任：在 SDK 打包前增加 Host 侧校验步骤，先跑 Lua/JS 测试与语法检查。
- `luasrc/controller/dashboard.lua`
  责任：从“大一统控制器”改成薄路由、会话校验和 API 分发器。
- `luasrc/view/dashboard/main.htm`
  责任：从“巨型模板 + 内联业务 JS”改成单页壳模板。
- `po/templates/luci-app-dashboard.pot`
  责任：同步新增文案模板。
- `po/zh-cn/luci-app-dashboard.po`
  责任：补齐中文翻译。

### New Backend Shared Files

- `root/etc/config/dashboard`
  责任：提供 dashboard 自有 UCI 默认配置。
- `luasrc/dashboard/session.lua`
  责任：会话与 cookie 鉴权辅助。
- `luasrc/dashboard/response.lua`
  责任：统一 JSON 成功/失败返回格式。
- `luasrc/dashboard/validation.lua`
  责任：IP、掩码、网关、DNS、接口名、上传参数等校验。
- `luasrc/dashboard/capabilities.lua`
  责任：探测 `nlbwmon`、域名日志源、特征文件、历史目录等能力。

### New Backend API Files

- `luasrc/dashboard/api/overview.lua`
- `luasrc/dashboard/api/users.lua`
- `luasrc/dashboard/api/network.lua`
- `luasrc/dashboard/api/system.lua`
- `luasrc/dashboard/api/record.lua`
- `luasrc/dashboard/api/feature.lua`
- `luasrc/dashboard/api/settings.lua`

职责：解析请求、调用 service 层、使用统一响应格式输出 JSON。

### New Backend Service Files

- `luasrc/dashboard/services/overview.lua`
- `luasrc/dashboard/services/users.lua`
- `luasrc/dashboard/services/network.lua`
- `luasrc/dashboard/services/system.lua`
- `luasrc/dashboard/services/record.lua`
- `luasrc/dashboard/services/feature.lua`
- `luasrc/dashboard/services/settings.lua`

职责：聚合 source 层数据、表达页面业务语义、实现降级策略。

### New Backend Source Files

- `luasrc/dashboard/sources/config.lua`
- `luasrc/dashboard/sources/system.lua`
- `luasrc/dashboard/sources/network.lua`
- `luasrc/dashboard/sources/leases.lua`
- `luasrc/dashboard/sources/arp.lua`
- `luasrc/dashboard/sources/nlbwmon.lua`
- `luasrc/dashboard/sources/domains.lua`
- `luasrc/dashboard/sources/record_store.lua`
- `luasrc/dashboard/sources/feature_store.lua`

职责：读写系统状态、租约、ARP、UCI、历史快照与特征文件。

### New Frontend Files

- `htdocs/luci-static/dashboard/app.js`
  责任：单页启动、模块注册、全局状态。
- `htdocs/luci-static/dashboard/api.js`
  责任：统一 fetch 包装和错误处理。
- `htdocs/luci-static/dashboard/shell.js`
  责任：折叠区、抽屉、弹层和公共 UI 行为。
- `htdocs/luci-static/dashboard/sections-overview.js`
- `htdocs/luci-static/dashboard/sections-users.js`
- `htdocs/luci-static/dashboard/sections-network.js`
- `htdocs/luci-static/dashboard/sections-system.js`
- `htdocs/luci-static/dashboard/sections-record.js`
- `htdocs/luci-static/dashboard/sections-feature.js`
- `htdocs/luci-static/dashboard/sections-settings.js`
- `htdocs/luci-static/dashboard/app.css`

### New Test Files

- `tests/lua/run.lua`
- `tests/lua/test_response.lua`
- `tests/lua/test_validation.lua`
- `tests/lua/test_overview.lua`
- `tests/lua/test_users.lua`
- `tests/lua/test_network.lua`
- `tests/lua/test_record.lua`
- `tests/lua/test_feature.lua`
- `tests/js/overview.test.mjs`
- `tests/js/shell.test.mjs`
- `tests/js/users.test.mjs`
- `tests/fixtures/dhcp.leases`
- `tests/fixtures/proc_net_arp.txt`
- `tests/fixtures/openclash.log`
- `tests/fixtures/dnsmasq.log`

## Task 1: Bootstrap Shared Infrastructure and Validation Chain

**Files:**
- Create: `root/etc/config/dashboard`
- Create: `luasrc/dashboard/session.lua`
- Create: `luasrc/dashboard/response.lua`
- Create: `luasrc/dashboard/validation.lua`
- Create: `luasrc/dashboard/capabilities.lua`
- Create: `tests/lua/run.lua`
- Create: `tests/lua/test_response.lua`
- Create: `tests/lua/test_validation.lua`
- Modify: `Makefile`
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Write the failing Lua tests for shared helpers**

Create `tests/lua/run.lua`:

```lua
package.path = table.concat({
  "luasrc/?.lua",
  "luasrc/?/init.lua",
  "luasrc/?/?.lua",
  "tests/lua/?.lua",
  package.path
}, ";")

local test_file = assert(arg[1], "missing test file")
local ok, err = pcall(dofile, test_file)
if not ok then
  io.stderr:write(err .. "\n")
  os.exit(1)
end
io.stdout:write("PASS " .. test_file .. "\n")
```

Create `tests/lua/test_response.lua`:

```lua
local response = require("luci.dashboard.response")

local ok_payload = response.ok({ value = 1 }, { source = "unit" })
assert(ok_payload.ok == true, "ok payload should mark ok=true")
assert(ok_payload.data.value == 1, "ok payload should keep data")
assert(ok_payload.meta.source == "unit", "ok payload should keep meta")

local err_payload = response.fail("invalid_arg", "bad input", { field = "ip" })
assert(err_payload.ok == false, "fail payload should mark ok=false")
assert(err_payload.error.code == "invalid_arg", "error code mismatch")
assert(err_payload.error.message == "bad input", "error message mismatch")
assert(err_payload.error.details.field == "ip", "error details mismatch")
```

Create `tests/lua/test_validation.lua`:

```lua
local validation = require("luci.dashboard.validation")

assert(validation.is_ipv4("192.168.1.1") == true, "valid ip rejected")
assert(validation.is_ipv4("999.1.1.1") == false, "invalid ip accepted")
assert(validation.is_netmask("255.255.255.0") == true, "valid netmask rejected")
assert(validation.is_netmask("255.0.255.0") == false, "invalid netmask accepted")
assert(validation.is_iface_name("br-lan") == true, "valid iface rejected")
assert(validation.is_iface_name("lan/eth0") == false, "invalid iface accepted")
```

- [ ] **Step 2: Run the shared-helper tests and verify they fail**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_response.lua
lua tests/lua/run.lua tests/lua/test_validation.lua
```

Expected:

- `FAIL` because `luci.dashboard.response` and `luci.dashboard.validation` do not exist yet.

- [ ] **Step 3: Implement the shared helpers and default dashboard config**

Create `root/etc/config/dashboard`:

```conf
config core 'main'
	option monitor_device 'wan'
	option lan_ifname 'br-lan'
	option work_mode '0'

config record 'main'
	option enable '0'
	option record_time '7'
	option app_valid_time '5'
	option history_data_size '128'
	option history_data_path '/tmp/dashboard/history'
```

Create `luasrc/dashboard/response.lua`:

```lua
local M = {}

function M.ok(data, meta)
  return {
    ok = true,
    data = data or {},
    meta = meta or {}
  }
end

function M.fail(code, message, details)
  return {
    ok = false,
    error = {
      code = code or "unknown_error",
      message = message or "unknown error",
      details = details or {}
    }
  }
end

return M
```

Create `luasrc/dashboard/validation.lua`:

```lua
local M = {}

local function split_ipv4(value)
  local parts = {}
  for part in tostring(value or ""):gmatch("([^.]+)") do
    parts[#parts + 1] = tonumber(part)
  end
  if #parts ~= 4 then
    return nil
  end
  return parts
end

function M.is_ipv4(value)
  local parts = split_ipv4(value)
  if not parts then
    return false
  end
  for _, part in ipairs(parts) do
    if not part or part < 0 or part > 255 then
      return false
    end
  end
  return true
end

function M.is_netmask(value)
  local valid = {
    ["255.255.255.255"] = true,
    ["255.255.255.254"] = true,
    ["255.255.255.252"] = true,
    ["255.255.255.248"] = true,
    ["255.255.255.240"] = true,
    ["255.255.255.224"] = true,
    ["255.255.255.192"] = true,
    ["255.255.255.128"] = true,
    ["255.255.255.0"] = true,
    ["255.255.254.0"] = true,
    ["255.255.252.0"] = true,
    ["255.255.248.0"] = true,
    ["255.255.240.0"] = true,
    ["255.255.224.0"] = true,
    ["255.255.192.0"] = true,
    ["255.255.128.0"] = true,
    ["255.255.0.0"] = true,
    ["255.254.0.0"] = true,
    ["255.252.0.0"] = true,
    ["255.248.0.0"] = true,
    ["255.240.0.0"] = true,
    ["255.224.0.0"] = true,
    ["255.192.0.0"] = true,
    ["255.128.0.0"] = true,
    ["255.0.0.0"] = true
  }
  return valid[tostring(value or "")] == true
end

function M.is_iface_name(value)
  return tostring(value or ""):match("^[A-Za-z0-9%-_]+$") ~= nil
end

return M
```

Create `luasrc/dashboard/session.lua`:

```lua
local http = require("luci.http")
local util = require("luci.util")

local M = {}

function M.require_session()
  for _, key in ipairs({ "sysauth_https", "sysauth_http", "sysauth" }) do
    local sid = http.getcookie(key)
    if sid then
      local session = util.ubus("session", "get", { ubus_rpc_session = sid })
      if type(session) == "table" and type(session.values) == "table" then
        return sid, session.values
      end
    end
  end
  return nil, nil
end

return M
```

Create `luasrc/dashboard/capabilities.lua`:

```lua
local uci = require("luci.model.uci").cursor()

local M = {}

local function path_exists(path)
  local f = io.open(path, "r")
  if f then
    f:close()
    return true
  end
  return false
end

function M.detect()
  return {
    nlbwmon = path_exists("/usr/share/nlbwmon"),
    samba4 = path_exists("/etc/config/samba4") or path_exists("/usr/lib/lua/luci/controller/samba4.lua"),
    domain_logs = path_exists("/tmp/openclash.log"),
    feature_library = path_exists("/etc/dashboard/feature/feature.cfg"),
    history_store = path_exists(uci:get("dashboard", "main", "history_data_path") or "/tmp/dashboard/history")
  }
end

return M
```

- [ ] **Step 4: Update package and CI validation chain**

Modify `Makefile`:

```make
LUCI_DEPENDS:=+luci-lib-jsonc +luci-compat
```

Modify `.github/workflows/release.yml` by inserting host checks before SDK build:

```yaml
      - name: Install Host Validators
        run: |
          sudo apt-get update
          sudo apt-get install -y lua5.1

      - name: Run Host Checks
        run: |
          lua tests/lua/run.lua tests/lua/test_response.lua
          lua tests/lua/run.lua tests/lua/test_validation.lua
```

- [ ] **Step 5: Run the tests again and commit**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_response.lua
lua tests/lua/run.lua tests/lua/test_validation.lua
```

Expected:

- `PASS tests/lua/test_response.lua`
- `PASS tests/lua/test_validation.lua`

Commit:

```bash
git add Makefile .github/workflows/release.yml root/etc/config/dashboard luasrc/dashboard tests/lua
git commit -m "feat: add dashboard shared helpers and validation chain"
```

## Task 2: Refactor Controller and Add Overview Backend

**Files:**
- Modify: `luasrc/controller/dashboard.lua`
- Create: `luasrc/dashboard/sources/system.lua`
- Create: `luasrc/dashboard/sources/network.lua`
- Create: `luasrc/dashboard/sources/domains.lua`
- Create: `luasrc/dashboard/services/overview.lua`
- Create: `luasrc/dashboard/api/overview.lua`
- Create: `tests/lua/test_overview.lua`
- Create: `tests/fixtures/openclash.log`
- Create: `tests/fixtures/dnsmasq.log`

- [ ] **Step 1: Write the failing overview contract test**

Create `tests/lua/test_overview.lua`:

```lua
package.loaded["luci.dashboard.sources.system"] = {
  read = function()
    return { model = "Test Router", firmware = "OpenWrt", kernel = "6.6", uptime_raw = 12, cpuUsage = 3, memUsage = 4 }
  end
}

package.loaded["luci.dashboard.sources.network"] = {
  summary = function()
    return { wanStatus = "up", wanIp = "1.2.3.4", lanIp = "192.168.1.1", dns = { "8.8.8.8" }, network_uptime_raw = 10 }
  end,
  traffic = function()
    return { tx_bytes = 100, rx_bytes = 200 }
  end,
  devices = function()
    return { { mac = "AA:BB:CC:DD:EE:FF", ip = "192.168.1.10", name = "phone", active = true } }
  end
}

package.loaded["luci.dashboard.sources.domains"] = {
  summary = function()
    return { source = "dnsmasq", top = { { domain = "example.com", count = 3 } }, recent = {} }
  end
}

package.loaded["luci.dashboard.capabilities"] = {
  detect = function()
    return { nlbwmon = false, domain_logs = true, feature_library = false }
  end
}

local overview = require("luci.dashboard.services.overview")
local payload = overview.build()

assert(payload.system.model == "Test Router", "missing system payload")
assert(payload.network.wanIp == "1.2.3.4", "missing network payload")
assert(payload.traffic.rx_bytes == 200, "missing traffic payload")
assert(payload.devices[1].mac == "AA:BB:CC:DD:EE:FF", "missing devices payload")
assert(payload.domains.source == "dnsmasq", "missing domains payload")
assert(payload.capabilities.domain_logs == true, "missing capabilities payload")
```

- [ ] **Step 2: Run the overview test and verify it fails**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_overview.lua
```

Expected:

- `FAIL` because `luci.dashboard.services.overview` does not exist.

- [ ] **Step 3: Implement source modules and overview service**

Create `luasrc/dashboard/sources/system.lua`:

```lua
local util = require("luci.util")

local M = {}

local function read_line(path)
  local f = io.open(path, "r")
  if not f then
    return nil
  end
  local value = f:read("*l")
  f:close()
  return value
end

local function read_all(path)
  local f = io.open(path, "r")
  if not f then
    return nil
  end
  local value = f:read("*a")
  f:close()
  return value
end

local function exec_trim(cmd)
  local p = io.popen(cmd .. " 2>/dev/null")
  if not p then
    return ""
  end
  local output = p:read("*a") or ""
  p:close()
  return output:gsub("%s+$", "")
end

function M.read()
  local board = util.ubus("system", "board", {}) or {}
  local release = read_all("/etc/openwrt_release") or ""
  local model = board.model or exec_trim("cat /tmp/sysinfo/model") or "Generic Device"
  local uptime = tonumber((read_line("/proc/uptime") or "0"):match("^(%S+)")) or 0

  return {
    model = model,
    firmware = release:match("DISTRIB_DESCRIPTION='([^']*)'") or "OpenWrt",
    kernel = exec_trim("uname -r"),
    uptime_raw = math.floor(uptime),
    cpuUsage = 0,
    memUsage = 0,
    temp = 0,
    systime_raw = os.time()
  }
end

return M
```

Create `luasrc/dashboard/sources/network.lua`:

```lua
local util = require("luci.util")
local uci = require("luci.model.uci").cursor()

local M = {}

function M.summary()
  local wan = util.ubus("network.interface.wan", "status") or {}
  local wan_ip = ""
  if wan["ipv4-address"] and wan["ipv4-address"][1] then
    wan_ip = wan["ipv4-address"][1].address or ""
  end

  return {
    wanStatus = (wan.up == true or wan_ip ~= "") and "up" or "down",
    wanIp = wan_ip,
    lanIp = uci:get("network", "lan", "ipaddr") or "192.168.1.1",
    dns = wan["dns-server"] or {},
    network_uptime_raw = wan.uptime or 0
  }
end

function M.traffic()
  return { tx_bytes = 0, rx_bytes = 0 }
end

function M.devices()
  return {}
end

return M
```

Create `luasrc/dashboard/sources/domains.lua`:

```lua
local M = {}

function M.summary()
  return {
    source = "none",
    top = {},
    recent = {}
  }
end

return M
```

Create `luasrc/dashboard/services/overview.lua`:

```lua
local system = require("luci.dashboard.sources.system")
local network = require("luci.dashboard.sources.network")
local domains = require("luci.dashboard.sources.domains")
local capabilities = require("luci.dashboard.capabilities")

local M = {}

function M.build()
  return {
    system = system.read(),
    network = network.summary(),
    traffic = network.traffic(),
    devices = network.devices(),
    domains = domains.summary(),
    capabilities = capabilities.detect()
  }
end

return M
```

Create `luasrc/dashboard/api/overview.lua`:

```lua
local http = require("luci.http")
local jsonc = require("luci.jsonc")
local fs = require("nixio.fs")
local response = require("luci.dashboard.response")
local overview = require("luci.dashboard.services.overview")

local M = {}

function M.get()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(overview.build())))
end

return M
```

- [ ] **Step 4: Replace inline overview handlers with a route dispatcher**

Modify `luasrc/controller/dashboard.lua` near the top-level routing code:

```lua
local http = require("luci.http")
local dispatcher = require("luci.dispatcher")
local jsonc = require("luci.jsonc")
local session = require("luci.dashboard.session")

local PAGE_TEMPLATE = "dashboard/main"
local API_ROUTES = {
  ["GET:/overview"] = { "luci.dashboard.api.overview", "get" }
}

local function dispatch_api()
  local sid = session.require_session()
  if not sid then
    http.status(403, "Forbidden")
    http.prepare_content("application/json")
    http.write(jsonc.stringify({ ok = false, error = { code = "forbidden", message = "forbidden" } }))
    return
  end

  local request_uri = http.getenv("REQUEST_URI") or ""
  local method = http.getenv("REQUEST_METHOD") or "GET"
  local path = request_uri:match("/admin/dashboard/api(/.*)") or "/"
  local route = API_ROUTES[method .. ":" .. path]
  if not route then
    http.status(404, "Not Found")
    http.prepare_content("application/json")
    http.write(jsonc.stringify({ ok = false, error = { code = "not_found", message = "route not found" } }))
    return
  end

  local mod = require(route[1])
  return mod[route[2]]()
end

function dashboard_dispatch()
  local uri = http.getenv("REQUEST_URI") or ""
  if uri:match("/admin/dashboard/api") then
    return dispatch_api()
  end
  require("luci.template").render(PAGE_TEMPLATE, {
    prefix = dispatcher.build_url("admin", "dashboard")
  })
end
```

- [ ] **Step 5: Re-run the overview test and commit**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_overview.lua
```

Expected:

- `PASS tests/lua/test_overview.lua`

Commit:

```bash
git add luasrc/controller/dashboard.lua luasrc/dashboard/sources luasrc/dashboard/services/overview.lua luasrc/dashboard/api/overview.lua tests/lua/test_overview.lua tests/fixtures
git commit -m "feat: add modular overview backend and controller dispatch"
```

## Task 3: Extract the Single-Page Shell and Frontend App Scaffold

**Files:**
- Modify: `luasrc/view/dashboard/main.htm`
- Create: `htdocs/luci-static/dashboard/app.js`
- Create: `htdocs/luci-static/dashboard/api.js`
- Create: `htdocs/luci-static/dashboard/shell.js`
- Create: `htdocs/luci-static/dashboard/sections-overview.js`
- Create: `htdocs/luci-static/dashboard/app.css`
- Create: `tests/js/overview.test.mjs`
- Create: `tests/js/shell.test.mjs`

- [ ] **Step 1: Write the failing frontend tests**

Create `tests/js/overview.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOverview } from "../../htdocs/luci-static/dashboard/sections-overview.js";

test("normalizeOverview fills empty sections and capability defaults", () => {
  const normalized = normalizeOverview({
    system: { model: "Test Router" }
  });

  assert.equal(normalized.system.model, "Test Router");
  assert.deepEqual(normalized.network.dns, []);
  assert.equal(normalized.capabilities.nlbwmon, false);
});
```

Create `tests/js/shell.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildSectionState } from "../../htdocs/luci-static/dashboard/shell.js";

test("buildSectionState marks overview as eager and feature as collapsed", () => {
  const state = buildSectionState();
  assert.equal(state.overview.expanded, true);
  assert.equal(state.feature.expanded, false);
  assert.equal(state.users.loaded, false);
});
```

- [ ] **Step 2: Run the frontend tests and verify they fail**

Run:

```powershell
node --test tests/js/overview.test.mjs
node --test tests/js/shell.test.mjs
```

Expected:

- `ERR_MODULE_NOT_FOUND` because the new frontend modules do not exist yet.

- [ ] **Step 3: Create the app scaffold and shrink `main.htm` into a shell**

Create `htdocs/luci-static/dashboard/api.js`:

```js
export async function dashboardApi(path, options = {}) {
  const requestOptions = Object.assign({}, options);
  requestOptions.credentials = "same-origin";
  requestOptions.headers = Object.assign(
    { Accept: "application/json" },
    requestOptions.headers || {}
  );

  const response = await fetch(
    `/cgi-bin/luci/admin/dashboard/api${path}`,
    requestOptions
  );

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }
  return payload.data;
}
```

Create `htdocs/luci-static/dashboard/shell.js`:

```js
export function buildSectionState() {
  return {
    overview: { expanded: true, loaded: true },
    users: { expanded: false, loaded: false },
    network: { expanded: false, loaded: false },
    system: { expanded: false, loaded: false },
    record: { expanded: false, loaded: false },
    feature: { expanded: false, loaded: false },
    settings: { expanded: false, loaded: false }
  };
}
```

Create `htdocs/luci-static/dashboard/sections-overview.js`:

```js
import { dashboardApi } from "./api.js";

export function normalizeOverview(input = {}) {
  const network = Object.assign({ dns: [] }, input.network || {});
  const capabilities = Object.assign(
    {
      nlbwmon: false,
      domain_logs: false,
      feature_library: false
    },
    input.capabilities || {}
  );

  return {
    system: input.system || {},
    network,
    traffic: input.traffic || { tx_bytes: 0, rx_bytes: 0 },
    devices: input.devices || [],
    domains: input.domains || { source: "none", top: [], recent: [] },
    capabilities
  };
}

export async function loadOverview() {
  const payload = await dashboardApi("/overview");
  return normalizeOverview(payload);
}
```

Create `htdocs/luci-static/dashboard/app.js`:

```js
import { buildSectionState } from "./shell.js";
import { loadOverview } from "./sections-overview.js";

async function boot() {
  const state = buildSectionState();
  const overview = await loadOverview();
  window.dashboardState = { state, overview };
}

boot().catch((error) => {
  console.error("dashboard boot failed", error);
});
```

Create `htdocs/luci-static/dashboard/app.css`:

```css
.dashboard-shell {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dashboard-section {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
}
```

Replace the script-heavy body in `luasrc/view/dashboard/main.htm` with a shell:

```html
<%+header%>
<script src="/luci-static/dashboard/tailwindcss.js"></script>
<script src="/luci-static/dashboard/lucide.js"></script>
<script src="/luci-static/dashboard/echarts.js"></script>
<link rel="stylesheet" href="/luci-static/dashboard/app.css">

<div id="dashboard-app" class="dashboard-shell">
  <section id="dashboard-overview" class="dashboard-section"></section>
  <section id="dashboard-users" class="dashboard-section"></section>
  <section id="dashboard-network" class="dashboard-section"></section>
  <section id="dashboard-system" class="dashboard-section"></section>
  <section id="dashboard-record" class="dashboard-section"></section>
  <section id="dashboard-feature" class="dashboard-section"></section>
  <section id="dashboard-settings" class="dashboard-section"></section>
</div>

<script type="module" src="/luci-static/dashboard/app.js"></script>
<%+footer%>
```

- [ ] **Step 4: Run the frontend tests and syntax checks**

Run:

```powershell
node --test tests/js/overview.test.mjs
node --test tests/js/shell.test.mjs
node --check htdocs/luci-static/dashboard/app.js
node --check htdocs/luci-static/dashboard/api.js
node --check htdocs/luci-static/dashboard/shell.js
node --check htdocs/luci-static/dashboard/sections-overview.js
```

Expected:

- All `node --test` commands pass.
- All `node --check` commands exit successfully.

- [ ] **Step 5: Commit the frontend scaffold**

```bash
git add luasrc/view/dashboard/main.htm htdocs/luci-static/dashboard tests/js
git commit -m "feat: extract dashboard single-page shell and frontend scaffold"
```

## Task 4: Implement the Users Module and Detail Drawer

**Files:**
- Create: `luasrc/dashboard/sources/config.lua`
- Create: `luasrc/dashboard/sources/leases.lua`
- Create: `luasrc/dashboard/sources/arp.lua`
- Create: `luasrc/dashboard/sources/nlbwmon.lua`
- Modify: `luasrc/dashboard/sources/config.lua`
- Create: `luasrc/dashboard/services/users.lua`
- Create: `luasrc/dashboard/api/users.lua`
- Create: `htdocs/luci-static/dashboard/sections-users.js`
- Create: `tests/lua/test_users.lua`
- Create: `tests/js/users.test.mjs`
- Create: `tests/fixtures/dhcp.leases`
- Create: `tests/fixtures/proc_net_arp.txt`

- [ ] **Step 1: Write the failing backend and frontend user tests**

Create `tests/fixtures/dhcp.leases`:

```text
1713240000 aa:bb:cc:dd:ee:ff 192.168.1.10 phone *
1713240001 11:22:33:44:55:66 192.168.1.11 laptop *
```

Create `tests/fixtures/proc_net_arp.txt`:

```text
IP address       HW type     Flags       HW address            Mask     Device
192.168.1.10     0x1         0x2         aa:bb:cc:dd:ee:ff     *        br-lan
192.168.1.12     0x1         0x2         77:88:99:aa:bb:cc     *        br-lan
```

Create `tests/lua/test_users.lua`:

```lua
package.loaded["luci.dashboard.sources.leases"] = {
  read = function()
    return {
      { mac = "AA:BB:CC:DD:EE:FF", ip = "192.168.1.10", hostname = "phone" },
      { mac = "11:22:33:44:55:66", ip = "192.168.1.11", hostname = "laptop" }
    }
  end
}

package.loaded["luci.dashboard.sources.arp"] = {
  read = function()
    return {
      { mac = "AA:BB:CC:DD:EE:FF", ip = "192.168.1.10" },
      { mac = "77:88:99:AA:BB:CC", ip = "192.168.1.12" }
    }
  end
}

package.loaded["luci.dashboard.sources.nlbwmon"] = {
  list_users = function()
    return {
      ["AA:BB:CC:DD:EE:FF"] = { today_up_bytes = 100, today_down_bytes = 200 }
    }
  end
}

package.loaded["luci.dashboard.sources.config"] = {
  read_nicknames = function()
    return {
      ["AA:BB:CC:DD:EE:FF"] = "客厅手机"
    }
  end
}

package.loaded["luci.dashboard.sources.config"].write_nickname = function(mac, value)
  _G.saved_nickname = { mac = mac, value = value }
end

local users = require("luci.dashboard.services.users")
local payload = users.list({ page = 1, page_size = 20 })

local detail = users.detail("AA:BB:CC:DD:EE:FF")
assert(detail.device.mac == "AA:BB:CC:DD:EE:FF", "detail should return selected device")
assert(detail.traffic.today_down_bytes == 200, "detail should expose traffic summary")

local save_ok, save_err = users.save_remark("AA:BB:CC:DD:EE:FF", "media-box")
assert(save_ok == true, save_err or "remark save should succeed")
assert(_G.saved_nickname.value == "media-box", "remark should be persisted")

assert(payload.total_num == 3, "should merge lease and arp users")
assert(payload.list[1].nickname == "客厅手机", "nickname should be merged")
```

Create `tests/js/users.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeUserDetail,
  normalizeUsers
} from "../../htdocs/luci-static/dashboard/sections-users.js";

test("normalizeUsers fills empty paging defaults", () => {
  const payload = normalizeUsers({ list: [{ mac: "AA" }] });
  assert.equal(payload.page, 1);
  assert.equal(payload.total_num, 1);
  assert.equal(payload.list[0].mac, "AA");
});

test("normalizeUserDetail exposes safe defaults", () => {
  const detail = normalizeUserDetail({});
  assert.equal(detail.device.mac, "");
  assert.equal(detail.traffic.supported, false);
  assert.deepEqual(detail.recent_domains, []);
});
```

- [ ] **Step 2: Run the user tests and verify they fail**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_users.lua
node --test tests/js/users.test.mjs
```

Expected:

- Lua test fails because `luci.dashboard.services.users` does not exist.
- JS test fails because `sections-users.js` does not exist.

- [ ] **Step 3: Implement user sources, service and API**

Create `luasrc/dashboard/sources/config.lua`:

```lua
local uci = require("luci.model.uci").cursor()

local M = {}

function M.read_nicknames()
  local map = {}
  uci:foreach("dashboard", "nickname", function(section)
    map[(section.mac or ""):upper()] = section.value or ""
  end)
  return map
end

function M.write_nickname(mac, value)
  local target = nil
  uci:foreach("dashboard", "nickname", function(section)
    if (section.mac or ""):upper() == mac then
      target = section[".name"]
    end
  end)

  if not target then
    target = uci:section("dashboard", "nickname", nil, { mac = mac })
  end

  uci:set("dashboard", target, "value", value or "")
  uci:commit("dashboard")
end

return M
```

Create `luasrc/dashboard/sources/leases.lua`:

```lua
local M = {}

function M.read()
  local items = {}
  local file = io.open("/tmp/dhcp.leases", "r")
  if not file then
    return items
  end

  for line in file:lines() do
    local _, mac, ip, hostname = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
    if mac then
      items[#items + 1] = {
        mac = mac:upper(),
        ip = ip or "",
        hostname = (hostname ~= "*" and hostname) or ""
      }
    end
  end

  file:close()
  return items
end

return M
```

Create `luasrc/dashboard/sources/arp.lua`:

```lua
local M = {}

function M.read()
  local items = {}
  local file = io.open("/proc/net/arp", "r")
  if not file then
    return items
  end

  for line in file:lines() do
    local ip, _, flags, mac = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
    if ip and ip ~= "IP" and flags == "0x2" and mac ~= "00:00:00:00:00:00" then
      items[#items + 1] = {
        mac = mac:upper(),
        ip = ip
      }
    end
  end

  file:close()
  return items
end

return M
```

Create `luasrc/dashboard/sources/nlbwmon.lua`:

```lua
local util = require("luci.util")

local M = {}

function M.list_users()
  local result = {}
  local payload = util.ubus("nlbw", "list") or {}
  for _, item in ipairs(payload.devices or {}) do
    local mac = tostring(item.mac or ""):upper()
    if mac ~= "" then
      result[mac] = {
        today_up_bytes = item.tx_bytes or 0,
        today_down_bytes = item.rx_bytes or 0,
        supported = true
      }
    end
  end
  return result
end

return M
```

Create `luasrc/dashboard/services/users.lua`:

```lua
local leases = require("luci.dashboard.sources.leases")
local arp = require("luci.dashboard.sources.arp")
local nlbwmon = require("luci.dashboard.sources.nlbwmon")
local config = require("luci.dashboard.sources.config")

local M = {}

local function merge_users()
  local map = {}
  for _, item in ipairs(leases.read()) do
    map[item.mac] = {
      mac = item.mac,
      ip = item.ip,
      hostname = item.hostname,
      active = true
    }
  end

  for _, item in ipairs(arp.read()) do
    if not map[item.mac] then
      map[item.mac] = {
        mac = item.mac,
        ip = item.ip,
        hostname = "",
        active = true
      }
    end
  end

  local stats = nlbwmon.list_users()
  local nicknames = config.read_nicknames()
  local list = {}
  for _, item in pairs(map) do
    local stat = stats[item.mac] or {}
    item.nickname = nicknames[item.mac] or ""
    item.today_up_bytes = stat.today_up_bytes or 0
    item.today_down_bytes = stat.today_down_bytes or 0
    item.traffic_supported = stat.supported == true or stat.today_up_bytes ~= nil or stat.today_down_bytes ~= nil
    list[#list + 1] = item
  end

  table.sort(list, function(a, b)
    return a.mac < b.mac
  end)
  return list
end

function M.list(params)
  local page = tonumber(params.page or 1) or 1
  local page_size = tonumber(params.page_size or 20) or 20
  local list = merge_users()
  local start_index = ((page - 1) * page_size) + 1
  local sliced = {}
  for index = start_index, math.min(#list, start_index + page_size - 1) do
    sliced[#sliced + 1] = list[index]
  end

  return {
    page = page,
    page_size = page_size,
    total_num = #list,
    list = sliced
  }
end

function M.detail(mac)
  local target = tostring(mac or ""):upper()
  for _, item in ipairs(merge_users()) do
    if item.mac == target then
      return {
        device = item,
        traffic = {
          supported = item.traffic_supported,
          today_up_bytes = item.today_up_bytes,
          today_down_bytes = item.today_down_bytes
        },
        recent_domains = {},
        history = {}
      }
    end
  end
  return nil, "not found"
end

function M.save_remark(mac, value)
  local normalized = tostring(mac or ""):upper()
  if normalized:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") == nil then
    return false, "invalid mac"
  end
  config.write_nickname(normalized, value or "")
  return true
end

return M
```

Create `luasrc/dashboard/api/users.lua`:

```lua
local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local users = require("luci.dashboard.services.users")

local M = {}

function M.list()
  local page = tonumber(http.formvalue("page") or 1) or 1
  local page_size = tonumber(http.formvalue("page_size") or 20) or 20
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(users.list({
    page = page,
    page_size = page_size
  }))))
end

function M.detail()
  local payload, err = users.detail(http.formvalue("mac") or "")
  http.prepare_content("application/json")
  if not payload then
    http.write(jsonc.stringify(response.fail("not_found", err)))
    return
  end
  http.write(jsonc.stringify(response.ok(payload)))
end

function M.remark()
  local ok, err = users.save_remark(
    http.formvalue("mac") or "",
    http.formvalue("value") or ""
  )
  http.prepare_content("application/json")
  if not ok then
    http.write(jsonc.stringify(response.fail("invalid_arg", err)))
    return
  end
  http.write(jsonc.stringify(response.ok({ saved = true })))
end

return M
```

- [ ] **Step 4: Implement the users section frontend**

Create `htdocs/luci-static/dashboard/sections-users.js`:

```js
import { dashboardApi } from "./api.js";

export function normalizeUsers(payload = {}) {
  return {
    page: payload.page || 1,
    page_size: payload.page_size || payload.list?.length || 0,
    total_num: payload.total_num || payload.list?.length || 0,
    list: payload.list || []
  };
}

export function normalizeUserDetail(payload = {}) {
  return {
    device: payload.device || { mac: "", ip: "", hostname: "", nickname: "" },
    traffic: payload.traffic || {
      supported: false,
      today_up_bytes: 0,
      today_down_bytes: 0
    },
    recent_domains: payload.recent_domains || [],
    history: payload.history || []
  };
}

export async function loadUsers(page = 1, pageSize = 20) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize)
  });
  const payload = await dashboardApi(`/users?${params.toString()}`);
  return normalizeUsers(payload);
}

export async function loadUserDetail(mac) {
  const params = new URLSearchParams({ mac });
  const payload = await dashboardApi(`/users/detail?${params.toString()}`);
  return normalizeUserDetail(payload);
}

export async function saveUserRemark(mac, value) {
  const body = new URLSearchParams({ mac, value });
  return dashboardApi("/users/remark", {
    method: "POST",
    body
  });
}
```

Wire the users module into `htdocs/luci-static/dashboard/app.js`:

```js
import { loadUserDetail, loadUsers } from "./sections-users.js";

async function boot() {
  const state = buildSectionState();
  const overview = await loadOverview();
  const users = await loadUsers();
  window.dashboardState = {
    state,
    overview,
    users,
    userDrawer: { open: false, mac: "", detail: null }
  };
}

export async function openUserDrawer(mac) {
  const detail = await loadUserDetail(mac);
  window.dashboardState.userDrawer = { open: true, mac, detail };
  return detail;
}

export function closeUserDrawer() {
  if (window.dashboardState) {
    window.dashboardState.userDrawer = { open: false, mac: "", detail: null };
  }
}
```

- [ ] **Step 5: Re-run tests and commit**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_users.lua
node --test tests/js/users.test.mjs
node --check htdocs/luci-static/dashboard/sections-users.js
```

Expected:

- All commands pass.

Commit:

```bash
git add luasrc/dashboard/sources/config.lua luasrc/dashboard/sources/leases.lua luasrc/dashboard/sources/arp.lua luasrc/dashboard/sources/nlbwmon.lua luasrc/dashboard/services/users.lua luasrc/dashboard/api/users.lua htdocs/luci-static/dashboard/sections-users.js htdocs/luci-static/dashboard/app.js tests/lua/test_users.lua tests/js/users.test.mjs tests/fixtures
git commit -m "feat: add dashboard users module"
```

## Task 5: Implement Network, System and Dashboard Settings Modules

**Files:**
- Modify: `luasrc/dashboard/sources/config.lua`
- Modify: `luasrc/dashboard/sources/network.lua`
- Create: `luasrc/dashboard/services/network.lua`
- Create: `luasrc/dashboard/services/system.lua`
- Create: `luasrc/dashboard/services/settings.lua`
- Create: `luasrc/dashboard/api/network.lua`
- Create: `luasrc/dashboard/api/system.lua`
- Create: `luasrc/dashboard/api/settings.lua`
- Create: `htdocs/luci-static/dashboard/sections-network.js`
- Create: `htdocs/luci-static/dashboard/sections-system.js`
- Create: `htdocs/luci-static/dashboard/sections-settings.js`
- Create: `tests/lua/test_network.lua`

- [ ] **Step 1: Write the failing network validation test**

Create `tests/lua/test_network.lua`:

```lua
local validation = require("luci.dashboard.validation")
assert(validation.is_ipv4("192.168.8.1") == true)
assert(validation.is_netmask("255.255.255.0") == true)

local config = {
  proto = "static",
  ipaddr = "192.168.8.1",
  netmask = "255.255.255.0",
  gateway = "192.168.8.254",
  dns = { "223.5.5.5", "8.8.8.8" }
}

local network = require("luci.dashboard.services.network")
local ok, err = network.validate_lan_payload(config)
assert(ok == true, err or "validation should pass")

local bad_ok = network.validate_lan_payload({
  proto = "static",
  ipaddr = "999.8.8.8",
  netmask = "255.255.255.0"
})
assert(bad_ok == false, "invalid ip should fail")
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_network.lua
```

Expected:

- `FAIL` because `luci.dashboard.services.network` does not exist.

- [ ] **Step 3: Implement config source and network/system/settings services**

Create `luasrc/dashboard/sources/config.lua`:

```lua
local uci = require("luci.model.uci").cursor()

local M = {}

function M.read_core()
  return {
    monitor_device = uci:get("dashboard", "main", "monitor_device") or "wan",
    lan_ifname = uci:get("dashboard", "main", "lan_ifname") or "br-lan",
    work_mode = tonumber(uci:get("dashboard", "main", "work_mode") or "0") or 0
  }
end

function M.write_core(values)
  for key, value in pairs(values) do
    uci:set("dashboard", "main", key, tostring(value))
  end
  uci:commit("dashboard")
end

function M.read_nicknames()
  local map = {}
  uci:foreach("dashboard", "nickname", function(section)
    map[(section.mac or ""):upper()] = section.value or ""
  end)
  return map
end

function M.write_nickname(mac, value)
  local target = nil
  uci:foreach("dashboard", "nickname", function(section)
    if (section.mac or ""):upper() == mac then
      target = section[".name"]
    end
  end)

  if not target then
    target = uci:section("dashboard", "nickname", nil, { mac = mac })
  end

  uci:set("dashboard", target, "value", value or "")
  uci:commit("dashboard")
end

return M
```

Replace `luasrc/dashboard/sources/network.lua` with:

```lua
local util = require("luci.util")
local uci = require("luci.model.uci").cursor()
local config = require("luci.dashboard.sources.config")

local M = {}

local function split_words(value)
  local items = {}
  for token in tostring(value or ""):gmatch("%S+") do
    items[#items + 1] = token
  end
  return items
end

local function join_words(list)
  if type(list) ~= "table" then
    return ""
  end
  return table.concat(list, " ")
end

function M.summary()
  local wan = util.ubus("network.interface.wan", "status") or {}
  local wan_ip = ""
  if wan["ipv4-address"] and wan["ipv4-address"][1] then
    wan_ip = wan["ipv4-address"][1].address or ""
  end

  return {
    wanStatus = (wan.up == true or wan_ip ~= "") and "up" or "down",
    wanIp = wan_ip,
    lanIp = uci:get("network", "lan", "ipaddr") or "192.168.1.1",
    dns = wan["dns-server"] or {},
    network_uptime_raw = wan.uptime or 0
  }
end

function M.traffic()
  return { tx_bytes = 0, rx_bytes = 0 }
end

function M.devices()
  return {}
end

function M.read_lan()
  local dns = uci:get_list("network", "lan", "dns")
  if type(dns) ~= "table" or #dns == 0 then
    dns = split_words(uci:get("network", "lan", "dns"))
  end

  return {
    proto = uci:get("network", "lan", "proto") or "static",
    ipaddr = uci:get("network", "lan", "ipaddr") or "192.168.1.1",
    netmask = uci:get("network", "lan", "netmask") or "255.255.255.0",
    gateway = uci:get("network", "lan", "gateway") or "",
    dns = dns,
    lan_ifname = config.read_core().lan_ifname
  }
end

function M.write_lan(payload)
  uci:set("network", "lan", "proto", payload.proto or "static")

  for _, key in ipairs({ "ipaddr", "netmask", "gateway" }) do
    if payload[key] and payload[key] ~= "" then
      uci:set("network", "lan", key, payload[key])
    else
      uci:delete("network", "lan", key)
    end
  end

  if type(payload.dns) == "table" and #payload.dns > 0 then
    uci:set("network", "lan", "dns", join_words(payload.dns))
  else
    uci:delete("network", "lan", "dns")
  end

  uci:commit("network")
end

function M.read_wan()
  local dns = uci:get_list("network", "wan", "dns")
  if type(dns) ~= "table" or #dns == 0 then
    dns = split_words(uci:get("network", "wan", "dns"))
  end

  return {
    proto = uci:get("network", "wan", "proto") or "dhcp",
    username = uci:get("network", "wan", "username") or "",
    password = uci:get("network", "wan", "password") or "",
    ipaddr = uci:get("network", "wan", "ipaddr") or "",
    netmask = uci:get("network", "wan", "netmask") or "",
    gateway = uci:get("network", "wan", "gateway") or "",
    dns = dns
  }
end

function M.write_wan(payload)
  uci:set("network", "wan", "proto", payload.proto or "dhcp")

  for _, key in ipairs({ "username", "password", "ipaddr", "netmask", "gateway" }) do
    if payload[key] and payload[key] ~= "" then
      uci:set("network", "wan", key, payload[key])
    else
      uci:delete("network", "wan", key)
    end
  end

  if type(payload.dns) == "table" and #payload.dns > 0 then
    uci:set("network", "wan", "dns", join_words(payload.dns))
  else
    uci:delete("network", "wan", "dns")
  end

  uci:commit("network")
end

function M.read_work_mode()
  return {
    work_mode = config.read_core().work_mode
  }
end

function M.write_work_mode(value)
  config.write_core({ work_mode = tonumber(value or 0) or 0 })
end

return M
```

Create `luasrc/dashboard/services/network.lua`:

```lua
local source = require("luci.dashboard.sources.network")
local validation = require("luci.dashboard.validation")

local M = {}

local function validate_dns_list(items)
  for _, item in ipairs(items or {}) do
    if item ~= "" and not validation.is_ipv4(item) then
      return false, "invalid dns"
    end
  end
  return true
end

function M.validate_lan_payload(payload)
  if payload.proto ~= "static" and payload.proto ~= "dhcp" then
    return false, "invalid proto"
  end
  if payload.proto == "static" then
    if not validation.is_ipv4(payload.ipaddr) then
      return false, "invalid ipaddr"
    end
    if not validation.is_netmask(payload.netmask) then
      return false, "invalid netmask"
    end
    if payload.gateway and payload.gateway ~= "" and not validation.is_ipv4(payload.gateway) then
      return false, "invalid gateway"
    end
  end
  return validate_dns_list(payload.dns or {})
end

function M.validate_wan_payload(payload)
  if payload.proto ~= "dhcp" and payload.proto ~= "pppoe" and payload.proto ~= "static" then
    return false, "invalid proto"
  end

  if payload.proto == "pppoe" and (payload.username == "" or payload.password == "") then
    return false, "missing pppoe credentials"
  end

  if payload.proto == "static" then
    if not validation.is_ipv4(payload.ipaddr) then
      return false, "invalid ipaddr"
    end
    if not validation.is_netmask(payload.netmask) then
      return false, "invalid netmask"
    end
    if payload.gateway ~= "" and not validation.is_ipv4(payload.gateway) then
      return false, "invalid gateway"
    end
  end

  return validate_dns_list(payload.dns or {})
end

function M.get_lan()
  return source.read_lan()
end

function M.set_lan(payload)
  local ok, err = M.validate_lan_payload(payload)
  if not ok then
    return false, err
  end
  source.write_lan(payload)
  return true
end

function M.get_wan()
  return source.read_wan()
end

function M.set_wan(payload)
  local ok, err = M.validate_wan_payload(payload)
  if not ok then
    return false, err
  end
  source.write_wan(payload)
  return true
end

function M.get_work_mode()
  return source.read_work_mode()
end

function M.set_work_mode(payload)
  local mode = tonumber(payload.work_mode)
  if mode == nil or mode < 0 or mode > 2 then
    return false, "invalid work_mode"
  end
  source.write_work_mode(mode)
  return true
end

return M
```

Create `luasrc/dashboard/services/system.lua`:

```lua
local config = require("luci.dashboard.sources.config")
local validation = require("luci.dashboard.validation")

local M = {}

function M.get()
  return config.read_core()
end

function M.set(payload)
  if not validation.is_iface_name(payload.lan_ifname) then
    return false, "invalid lan_ifname"
  end
  config.write_core({ lan_ifname = payload.lan_ifname })
  return true
end

return M
```

Create `luasrc/dashboard/services/settings.lua`:

```lua
local config = require("luci.dashboard.sources.config")
local validation = require("luci.dashboard.validation")

local M = {}

function M.get_dashboard()
  return {
    monitor_device = config.read_core().monitor_device
  }
end

function M.set_dashboard(payload)
  if not validation.is_iface_name(payload.monitor_device) then
    return false, "invalid monitor_device"
  end
  config.write_core({ monitor_device = payload.monitor_device })
  return true
end

return M
```

- [ ] **Step 4: Implement the APIs and frontend sections**

Create `luasrc/dashboard/api/network.lua`:

```lua
local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local network = require("luci.dashboard.services.network")

local M = {}

local function csv_list(value)
  local items = {}
  for token in tostring(value or ""):gmatch("([^,]+)") do
    local trimmed = token:gsub("^%s+", ""):gsub("%s+$", "")
    if trimmed ~= "" then
      items[#items + 1] = trimmed
    end
  end
  return items
end

function M.get_lan()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(network.get_lan())))
end

function M.post_lan()
  local ok, err = network.set_lan({
    proto = http.formvalue("proto") or "static",
    ipaddr = http.formvalue("ipaddr") or "",
    netmask = http.formvalue("netmask") or "",
    gateway = http.formvalue("gateway") or "",
    dns = csv_list(http.formvalue("dns"))
  })
  http.prepare_content("application/json")
  if not ok then
    http.write(jsonc.stringify(response.fail("invalid_arg", err)))
    return
  end
  http.write(jsonc.stringify(response.ok({ saved = true })))
end

function M.get_wan()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(network.get_wan())))
end

function M.post_wan()
  local ok, err = network.set_wan({
    proto = http.formvalue("proto") or "dhcp",
    username = http.formvalue("username") or "",
    password = http.formvalue("password") or "",
    ipaddr = http.formvalue("ipaddr") or "",
    netmask = http.formvalue("netmask") or "",
    gateway = http.formvalue("gateway") or "",
    dns = csv_list(http.formvalue("dns"))
  })
  http.prepare_content("application/json")
  if not ok then
    http.write(jsonc.stringify(response.fail("invalid_arg", err)))
    return
  end
  http.write(jsonc.stringify(response.ok({ saved = true })))
end

function M.get_work_mode()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(network.get_work_mode())))
end

function M.post_work_mode()
  local ok, err = network.set_work_mode({
    work_mode = http.formvalue("work_mode") or "0"
  })
  http.prepare_content("application/json")
  if not ok then
    http.write(jsonc.stringify(response.fail("invalid_arg", err)))
    return
  end
  http.write(jsonc.stringify(response.ok({ saved = true })))
end

return M
```

Create `luasrc/dashboard/api/system.lua`:

```lua
local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local system = require("luci.dashboard.services.system")

local M = {}

function M.get()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(system.get())))
end

function M.post()
  local ok, err = system.set({
    lan_ifname = http.formvalue("lan_ifname") or ""
  })
  http.prepare_content("application/json")
  if not ok then
    http.write(jsonc.stringify(response.fail("invalid_arg", err)))
    return
  end
  http.write(jsonc.stringify(response.ok({ saved = true })))
end

return M
```

Create `luasrc/dashboard/api/settings.lua`:

```lua
local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local settings = require("luci.dashboard.services.settings")

local M = {}

function M.get_dashboard()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(settings.get_dashboard())))
end

function M.post_dashboard()
  local ok, err = settings.set_dashboard({
    monitor_device = http.formvalue("monitor_device") or ""
  })
  http.prepare_content("application/json")
  if not ok then
    http.write(jsonc.stringify(response.fail("invalid_arg", err)))
    return
  end
  http.write(jsonc.stringify(response.ok({ saved = true })))
end

return M
```

Create `htdocs/luci-static/dashboard/sections-network.js`:

```js
import { dashboardApi } from "./api.js";

function buildFormBody(payload = {}) {
  const body = new URLSearchParams();
  Object.entries(payload).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      body.set(key, value.join(","));
      return;
    }
    if (value !== undefined && value !== null) {
      body.set(key, String(value));
    }
  });
  return body;
}

export async function loadLanConfig() {
  return dashboardApi("/network/lan");
}

export async function saveLanConfig(payload) {
  return dashboardApi("/network/lan", {
    method: "POST",
    body: buildFormBody(payload)
  });
}

export async function loadWanConfig() {
  return dashboardApi("/network/wan");
}

export async function saveWanConfig(payload) {
  return dashboardApi("/network/wan", {
    method: "POST",
    body: buildFormBody(payload)
  });
}

export async function loadWorkMode() {
  return dashboardApi("/network/work-mode");
}

export async function saveWorkMode(payload) {
  return dashboardApi("/network/work-mode", {
    method: "POST",
    body: buildFormBody(payload)
  });
}
```

Create `htdocs/luci-static/dashboard/sections-system.js`:

```js
import { dashboardApi } from "./api.js";

export async function loadSystemSettings() {
  return dashboardApi("/system/config");
}

export async function saveSystemSettings(payload) {
  const body = new URLSearchParams(payload);
  return dashboardApi("/system/config", {
    method: "POST",
    body
  });
}
```

Create `htdocs/luci-static/dashboard/sections-settings.js`:

```js
import { dashboardApi } from "./api.js";

export async function loadDashboardSettings() {
  return dashboardApi("/settings/dashboard");
}

export async function saveDashboardSettings(payload) {
  const body = new URLSearchParams(payload);
  return dashboardApi("/settings/dashboard", {
    method: "POST",
    body
  });
}
```

- [ ] **Step 5: Re-run tests and commit**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_network.lua
node --check htdocs/luci-static/dashboard/sections-network.js
node --check htdocs/luci-static/dashboard/sections-system.js
node --check htdocs/luci-static/dashboard/sections-settings.js
```

Expected:

- Lua validation test passes.
- JS syntax checks pass.

Commit:

```bash
git add luasrc/dashboard/sources/config.lua luasrc/dashboard/sources/network.lua luasrc/dashboard/services/network.lua luasrc/dashboard/services/system.lua luasrc/dashboard/services/settings.lua luasrc/dashboard/api/network.lua luasrc/dashboard/api/system.lua luasrc/dashboard/api/settings.lua htdocs/luci-static/dashboard/sections-network.js htdocs/luci-static/dashboard/sections-system.js htdocs/luci-static/dashboard/sections-settings.js tests/lua/test_network.lua
git commit -m "feat: add dashboard network system and settings modules"
```

## Task 6: Implement the Record Module with Dashboard-Owned Persistence

**Files:**
- Create: `luasrc/dashboard/sources/record_store.lua`
- Create: `luasrc/dashboard/services/record.lua`
- Create: `luasrc/dashboard/api/record.lua`
- Create: `htdocs/luci-static/dashboard/sections-record.js`
- Create: `tests/lua/test_record.lua`

- [ ] **Step 1: Write the failing record validation test**

Create `tests/lua/test_record.lua`:

```lua
package.loaded["luci.dashboard.sources.record_store"] = {
  read = function()
    return {
      enable = 1,
      record_time = 7,
      app_valid_time = 5,
      history_data_size = 128,
      history_data_path = "/tmp/dashboard/history"
    }
  end,
  write = function(payload)
    _G.saved_record_payload = payload
  end,
  clear = function()
    _G.record_history_cleared = true
    return true
  end
}

local record = require("luci.dashboard.services.record")

local ok = record.validate({
  enable = 1,
  record_time = 7,
  app_valid_time = 5,
  history_data_size = 128,
  history_data_path = "/tmp/dashboard/history"
})
assert(ok == true, "valid record payload should pass")

local bad = record.validate({
  enable = 1,
  record_time = 7,
  app_valid_time = 5,
  history_data_size = 2048,
  history_data_path = "/"
})
assert(bad == false, "invalid history settings should fail")

local save_ok, save_err = record.set({
  enable = 1,
  record_time = 7,
  app_valid_time = 5,
  history_data_size = 128,
  history_data_path = "/tmp/dashboard/history"
})
assert(save_ok == true, save_err or "record save should succeed")
assert(_G.saved_record_payload.history_data_size == 128, "record store should receive payload")

local clear_ok, clear_err = record.clear_history()
assert(clear_ok == true, clear_err or "clear history should succeed")
assert(_G.record_history_cleared == true, "record clear should call store")
```

- [ ] **Step 2: Run the record test and verify it fails**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_record.lua
```

Expected:

- `FAIL` because `luci.dashboard.services.record` does not exist.

- [ ] **Step 3: Implement record storage and API**

Create `luasrc/dashboard/sources/record_store.lua`:

```lua
local uci = require("luci.model.uci").cursor()
local fs = require("nixio.fs")

local M = {}

local function is_safe_history_path(path)
  return type(path) == "string"
    and path ~= "/"
    and path:match("^/tmp/dashboard/[%w%._%-/]+$") ~= nil
end

function M.read()
  return {
    enable = tonumber(uci:get("dashboard", "main", "enable") or "0") or 0,
    record_time = tonumber(uci:get("dashboard", "main", "record_time") or "7") or 7,
    app_valid_time = tonumber(uci:get("dashboard", "main", "app_valid_time") or "5") or 5,
    history_data_size = tonumber(uci:get("dashboard", "main", "history_data_size") or "128") or 128,
    history_data_path = uci:get("dashboard", "main", "history_data_path") or "/tmp/dashboard/history"
  }
end

function M.write(payload)
  for key, value in pairs(payload) do
    uci:set("dashboard", "main", key, tostring(value))
  end
  uci:commit("dashboard")
end

function M.clear()
  local current = M.read()
  local history_path = current.history_data_path
  if not is_safe_history_path(history_path) then
    return false, "invalid history path"
  end
  if not fs.access(history_path) then
    return true
  end

  for entry in fs.dir(history_path) do
    fs.remove(history_path .. "/" .. entry)
  end
  return true
end

return M
```

Create `luasrc/dashboard/services/record.lua`:

```lua
local store = require("luci.dashboard.sources.record_store")

local M = {}

function M.validate(payload)
  local history_size = tonumber(payload.history_data_size or 0) or 0
  local record_time = tonumber(payload.record_time or 0) or 0
  local app_valid_time = tonumber(payload.app_valid_time or 0) or 0
  local history_path = tostring(payload.history_data_path or "")

  if history_size < 1 or history_size > 1024 then
    return false
  end
  if record_time < 1 or record_time > 30 then
    return false
  end
  if app_valid_time < 1 or app_valid_time > 30 then
    return false
  end
  if history_path == "" or history_path == "/" or history_path:match("^/tmp/dashboard/") == nil then
    return false
  end
  return true
end

function M.get()
  return store.read()
end

function M.set(payload)
  if not M.validate(payload) then
    return false, "invalid record payload"
  end
  store.write(payload)
  return true
end

function M.clear_history()
  return store.clear()
end

return M
```

Create `luasrc/dashboard/api/record.lua`:

```lua
local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local record = require("luci.dashboard.services.record")

local M = {}

function M.get()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(record.get())))
end

function M.post()
  local ok, err = record.set({
    enable = tonumber(http.formvalue("enable") or "0") or 0,
    record_time = tonumber(http.formvalue("record_time") or "7") or 7,
    app_valid_time = tonumber(http.formvalue("app_valid_time") or "5") or 5,
    history_data_size = tonumber(http.formvalue("history_data_size") or "128") or 128,
    history_data_path = http.formvalue("history_data_path") or "/tmp/dashboard/history"
  })
  http.prepare_content("application/json")
  if not ok then
    http.write(jsonc.stringify(response.fail("invalid_arg", err)))
    return
  end
  http.write(jsonc.stringify(response.ok({ saved = true })))
end

function M.action()
  local action = http.formvalue("name") or ""
  http.prepare_content("application/json")
  if action ~= "clear_history" then
    http.write(jsonc.stringify(response.fail("invalid_arg", "unsupported action")))
    return
  end

  local ok, err = record.clear_history()
  if not ok then
    http.write(jsonc.stringify(response.fail("runtime_error", err)))
    return
  end
  http.write(jsonc.stringify(response.ok({ cleared = true })))
end

return M
```

- [ ] **Step 4: Implement the record section frontend**

Create `htdocs/luci-static/dashboard/sections-record.js`:

```js
import { dashboardApi } from "./api.js";

export async function loadRecordSettings() {
  return dashboardApi("/record/base");
}

export async function saveRecordSettings(payload) {
  const body = new URLSearchParams(payload);
  return dashboardApi("/record/base", {
    method: "POST",
    body
  });
}

export async function runRecordAction(name) {
  const body = new URLSearchParams({ name });
  return dashboardApi("/record/action", {
    method: "POST",
    body
  });
}
```

- [ ] **Step 5: Re-run tests and commit**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_record.lua
node --check htdocs/luci-static/dashboard/sections-record.js
```

Expected:

- Lua test passes.
- JS syntax check passes.

Commit:

```bash
git add luasrc/dashboard/sources/record_store.lua luasrc/dashboard/services/record.lua luasrc/dashboard/api/record.lua htdocs/luci-static/dashboard/sections-record.js tests/lua/test_record.lua
git commit -m "feat: add dashboard record module"
```

## Task 7: Implement the Feature Library Module

**Files:**
- Create: `luasrc/dashboard/sources/feature_store.lua`
- Create: `luasrc/dashboard/services/feature.lua`
- Create: `luasrc/dashboard/api/feature.lua`
- Create: `htdocs/luci-static/dashboard/sections-feature.js`
- Create: `tests/lua/test_feature.lua`

- [ ] **Step 1: Write the failing feature test**

Create `tests/lua/test_feature.lua`:

```lua
package.loaded["luci.dashboard.sources.feature_store"] = {
  read_info = function()
    return {
      version = "2026.04.16",
      format = "v3.0",
      app_count = 12
    }
  end,
  read_classes = function()
    return {
      { id = 1, name = "社交", app_list = { "1001,微信,1", "1002,QQ,1" } }
    }
  end
}

package.loaded["luci.dashboard.sources.feature_store"].import_bundle = function(tmp_path, filename)
  _G.imported_feature_bundle = { tmp_path = tmp_path, filename = filename }
  return {
    version = "2026.04.16",
    format = "v3.0",
    app_count = 12
  }
end

local feature = require("luci.dashboard.services.feature")
local info = feature.get_info()
local classes = feature.get_classes()
local imported, import_err = feature.import_bundle(
  "/tmp/upload-feature.tar.gz",
  "feature-pack.tar.gz",
  1024
)
local too_big, too_big_err = feature.import_bundle(
  "/tmp/upload-feature.tar.gz",
  "feature-pack.tar.gz",
  25 * 1024 * 1024
)

assert(info.version == "2026.04.16", "feature info version mismatch")
assert(imported.version == "2026.04.16", import_err or "import should succeed")
assert(_G.imported_feature_bundle.filename == "feature-pack.tar.gz", "bundle filename mismatch")
assert(too_big == nil and too_big_err == "bundle too large", "oversized bundle should be rejected")
assert(classes[1].name == "社交", "feature class name mismatch")
```

- [ ] **Step 2: Run the feature test and verify it fails**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_feature.lua
```

Expected:

- `FAIL` because `luci.dashboard.services.feature` does not exist.

- [ ] **Step 3: Implement feature storage and API**

Create `luasrc/dashboard/sources/feature_store.lua`:

```lua
local jsonc = require("luci.jsonc")

local M = {}

local FEATURE_ROOT = "/etc/dashboard/feature"
local STAGING_ROOT = FEATURE_ROOT .. "/current"
local INFO_FILE = FEATURE_ROOT .. "/feature.info.json"
local CLASS_FILE = FEATURE_ROOT .. "/feature.classes.json"

local function read_json(path, fallback)
  local file = io.open(path, "r")
  if not file then
    return fallback
  end
  local content = file:read("*a")
  file:close()
  return jsonc.parse(content) or fallback
end

local function write_json(path, payload)
  local file = assert(io.open(path, "w"))
  file:write(jsonc.stringify(payload))
  file:close()
end

local function shell_quote(value)
  return "'" .. tostring(value or ""):gsub("'", "'\\''") .. "'"
end

local function ensure_roots()
  fs.mkdirr(FEATURE_ROOT)
  fs.mkdirr(STAGING_ROOT)
end

function M.read_info()
  return read_json(INFO_FILE, {
    version = "",
    format = "v3.0",
    app_count = 0
  })
end

function M.read_classes()
  return read_json(CLASS_FILE, {})
end

function M.import_bundle(tmp_path, filename)
  if tostring(filename or ""):match("%.tar%.gz$") == nil then
    return nil, "invalid bundle extension"
  end

  ensure_roots()
  local extract_code = os.execute(
    "tar -xzf " .. shell_quote(tmp_path) .. " -C " .. shell_quote(STAGING_ROOT)
  )
  if extract_code ~= true and extract_code ~= 0 then
    return nil, "extract failed"
  end

  local info = read_json(STAGING_ROOT .. "/feature.info.json", nil)
  local classes = read_json(STAGING_ROOT .. "/feature.classes.json", nil)
  if type(info) ~= "table" or type(classes) ~= "table" then
    return nil, "bundle metadata missing"
  end

  write_json(INFO_FILE, info)
  write_json(CLASS_FILE, classes)
  return info
end

return M
```

Create `luasrc/dashboard/services/feature.lua`:

```lua
local store = require("luci.dashboard.sources.feature_store")

local M = {}

function M.get_info()
  return store.read_info()
end

function M.get_classes()
  return store.read_classes()
end

function M.import_bundle(tmp_path, filename, size)
  if tonumber(size or 0) > 20 * 1024 * 1024 then
    return nil, "bundle too large"
  end
  return store.import_bundle(tmp_path, filename)
end

return M
```

Create `luasrc/dashboard/api/feature.lua`:

```lua
local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local feature = require("luci.dashboard.services.feature")

local M = {}

function M.info()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(feature.get_info())))
end

function M.classes()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(feature.get_classes())))
end

function M.upload()
  local upload = {
    path = nil,
    name = nil,
    size = 0
  }
  local temp_path = os.tmpname()
  local file_handle = nil

  http.setfilehandler(function(meta, chunk, eof)
    if meta and meta.name == "file" and not file_handle then
      upload.path = temp_path
      upload.name = meta.file or "feature-pack.tar.gz"
      file_handle = io.open(temp_path, "wb")
    end

    if file_handle and chunk and #chunk > 0 then
      file_handle:write(chunk)
      upload.size = upload.size + #chunk
    end

    if file_handle and eof then
      file_handle:close()
      file_handle = nil
    end
  end)

  http.formvalue("file")
  http.prepare_content("application/json")

  if not upload.path then
    http.write(jsonc.stringify(response.fail("invalid_arg", "missing file upload")))
    return
  end

  local info, err = feature.import_bundle(upload.path, upload.name, upload.size)
  os.remove(upload.path)
  if not info then
    http.write(jsonc.stringify(response.fail("invalid_arg", err)))
    return
  end

  http.write(jsonc.stringify(response.ok(info)))
end

return M
```

- [ ] **Step 4: Implement the feature section frontend**

Create `htdocs/luci-static/dashboard/sections-feature.js`:

```js
import { dashboardApi } from "./api.js";

export async function loadFeatureInfo() {
  return dashboardApi("/feature/info");
}

export async function loadFeatureClasses() {
  return dashboardApi("/feature/classes");
}

export async function uploadFeatureBundle(file) {
  const body = new FormData();
  body.append("file", file);
  return dashboardApi("/feature/upload", {
    method: "POST",
    body
  });
}
```

- [ ] **Step 5: Re-run tests and commit**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_feature.lua
node --check htdocs/luci-static/dashboard/sections-feature.js
```

Expected:

- Lua test passes.
- JS syntax check passes.

Commit:

```bash
git add luasrc/dashboard/sources/feature_store.lua luasrc/dashboard/services/feature.lua luasrc/dashboard/api/feature.lua htdocs/luci-static/dashboard/sections-feature.js tests/lua/test_feature.lua
git commit -m "feat: add dashboard feature library module"
```

## Task 8: Final Wiring, I18n and Acceptance Verification

**Files:**
- Modify: `luasrc/controller/dashboard.lua`
- Modify: `htdocs/luci-static/dashboard/app.js`
- Modify: `luasrc/view/dashboard/main.htm`
- Modify: `po/templates/luci-app-dashboard.pot`
- Modify: `po/zh-cn/luci-app-dashboard.po`
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Write the failing integration smoke tests**

Extend `tests/js/shell.test.mjs` with a section-registration smoke test:

```js
import { registeredSections } from "../../htdocs/luci-static/dashboard/app.js";

test("registeredSections exposes all stage1 modules", () => {
  assert.deepEqual(
    registeredSections.sort(),
    ["feature", "network", "overview", "record", "settings", "system", "users"].sort()
  );
});
```

- [ ] **Step 2: Run the integration smoke test and verify it fails**

Run:

```powershell
node --test tests/js/shell.test.mjs
```

Expected:

- `FAIL` because `registeredSections` is not exported yet.

- [ ] **Step 3: Wire every API route and section registration**

Update the controller route table in `luasrc/controller/dashboard.lua`:

```lua
local API_ROUTES = {
  ["GET:/overview"] = { "luci.dashboard.api.overview", "get" },
  ["GET:/users"] = { "luci.dashboard.api.users", "list" },
  ["GET:/users/detail"] = { "luci.dashboard.api.users", "detail" },
  ["POST:/users/remark"] = { "luci.dashboard.api.users", "remark" },
  ["GET:/network/lan"] = { "luci.dashboard.api.network", "get_lan" },
  ["POST:/network/lan"] = { "luci.dashboard.api.network", "post_lan" },
  ["GET:/network/wan"] = { "luci.dashboard.api.network", "get_wan" },
  ["POST:/network/wan"] = { "luci.dashboard.api.network", "post_wan" },
  ["GET:/network/work-mode"] = { "luci.dashboard.api.network", "get_work_mode" },
  ["POST:/network/work-mode"] = { "luci.dashboard.api.network", "post_work_mode" },
  ["GET:/system/config"] = { "luci.dashboard.api.system", "get" },
  ["POST:/system/config"] = { "luci.dashboard.api.system", "post" },
  ["GET:/record/base"] = { "luci.dashboard.api.record", "get" },
  ["POST:/record/base"] = { "luci.dashboard.api.record", "post" },
  ["POST:/record/action"] = { "luci.dashboard.api.record", "action" },
  ["GET:/feature/info"] = { "luci.dashboard.api.feature", "info" },
  ["GET:/feature/classes"] = { "luci.dashboard.api.feature", "classes" },
  ["POST:/feature/upload"] = { "luci.dashboard.api.feature", "upload" },
  ["GET:/settings/dashboard"] = { "luci.dashboard.api.settings", "get_dashboard" },
  ["POST:/settings/dashboard"] = { "luci.dashboard.api.settings", "post_dashboard" }
}
```

Update `htdocs/luci-static/dashboard/app.js`:

```js
export const registeredSections = [
  "overview",
  "users",
  "network",
  "system",
  "record",
  "feature",
  "settings"
];
```

Append the stage-1 labels to `po/templates/luci-app-dashboard.pot`:

```po
msgid "Users"
msgstr ""

msgid "User Detail"
msgstr ""

msgid "Edit Remark"
msgstr ""

msgid "Record Settings"
msgstr ""

msgid "Clear History"
msgstr ""

msgid "Feature Library"
msgstr ""

msgid "Upload Feature Bundle"
msgstr ""

msgid "Capability Unavailable"
msgstr ""
```

Append the corresponding translations to `po/zh-cn/luci-app-dashboard.po`:

```po
msgid "Users"
msgstr "用户"

msgid "User Detail"
msgstr "用户详情"

msgid "Edit Remark"
msgstr "编辑备注"

msgid "Record Settings"
msgstr "记录设置"

msgid "Clear History"
msgstr "清空历史"

msgid "Feature Library"
msgstr "特征库"

msgid "Upload Feature Bundle"
msgstr "上传特征包"

msgid "Capability Unavailable"
msgstr "能力不可用"
```

Update `.github/workflows/release.yml` so the host validation stage covers the full stage-1 suite before invoking the SDK action:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Host Validators
        run: |
          sudo apt-get update
          sudo apt-get install -y lua5.1

      - name: Run Host Checks
        run: |
          lua tests/lua/run.lua tests/lua/test_response.lua
          lua tests/lua/run.lua tests/lua/test_validation.lua
          lua tests/lua/run.lua tests/lua/test_overview.lua
          lua tests/lua/run.lua tests/lua/test_users.lua
          lua tests/lua/run.lua tests/lua/test_network.lua
          lua tests/lua/run.lua tests/lua/test_record.lua
          lua tests/lua/run.lua tests/lua/test_feature.lua
          node --test tests/js/overview.test.mjs
          node --test tests/js/shell.test.mjs
          node --test tests/js/users.test.mjs
          node --check htdocs/luci-static/dashboard/app.js
          node --check htdocs/luci-static/dashboard/api.js
          node --check htdocs/luci-static/dashboard/shell.js
          node --check htdocs/luci-static/dashboard/sections-overview.js
          node --check htdocs/luci-static/dashboard/sections-users.js
          node --check htdocs/luci-static/dashboard/sections-network.js
          node --check htdocs/luci-static/dashboard/sections-system.js
          node --check htdocs/luci-static/dashboard/sections-record.js
          node --check htdocs/luci-static/dashboard/sections-feature.js
          node --check htdocs/luci-static/dashboard/sections-settings.js
```

- [ ] **Step 4: Run the full verification suite**

Run:

```powershell
lua tests/lua/run.lua tests/lua/test_response.lua
lua tests/lua/run.lua tests/lua/test_validation.lua
lua tests/lua/run.lua tests/lua/test_overview.lua
lua tests/lua/run.lua tests/lua/test_users.lua
lua tests/lua/run.lua tests/lua/test_network.lua
lua tests/lua/run.lua tests/lua/test_record.lua
lua tests/lua/run.lua tests/lua/test_feature.lua
node --test tests/js/overview.test.mjs
node --test tests/js/shell.test.mjs
node --test tests/js/users.test.mjs
node --check htdocs/luci-static/dashboard/app.js
node --check htdocs/luci-static/dashboard/api.js
node --check htdocs/luci-static/dashboard/shell.js
node --check htdocs/luci-static/dashboard/sections-overview.js
node --check htdocs/luci-static/dashboard/sections-users.js
node --check htdocs/luci-static/dashboard/sections-network.js
node --check htdocs/luci-static/dashboard/sections-system.js
node --check htdocs/luci-static/dashboard/sections-record.js
node --check htdocs/luci-static/dashboard/sections-feature.js
node --check htdocs/luci-static/dashboard/sections-settings.js
```

Expected:

- All Lua tests pass.
- All Node tests pass.
- All JS syntax checks pass.

- [ ] **Step 5: Run build verification and commit**

Run:

```powershell
git diff --stat
git push origin HEAD
```

Expected:

- Only the planned dashboard integration files are modified.
- `git push origin HEAD` starts the `Build OpenWrt Packages` workflow defined in `.github/workflows/release.yml`.

- `luci-app-dashboard` builds successfully.
- The workflow uploads a valid `.ipk`.

Commit:

```bash
git add luasrc/controller/dashboard.lua luasrc/view/dashboard/main.htm htdocs/luci-static/dashboard po/templates/luci-app-dashboard.pot po/zh-cn/luci-app-dashboard.po .github/workflows/release.yml
git commit -m "feat: complete dashboard stage1 modular integration"
```
