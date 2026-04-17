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

local registered = {}
local overview_called = false
local rendered_template
local rendered_prefix
local request_uri = "/admin/dashboard/api/overview"
local request_method = "GET"

_G.entry = function(path, target, title, order)
  local node = { path = path, target = target, title = title, order = order }
  registered[#registered + 1] = node
  return node
end

_G.call = function(name)
  return name
end

_G._ = function(value)
  return value
end

package.loaded["luci.http"] = {
  getenv = function(name)
    if name == "REQUEST_URI" then
      return request_uri
    end
    if name == "REQUEST_METHOD" then
      return request_method
    end
    return nil
  end,
  status = function() end,
  prepare_content = function() end,
  write = function() end
}

package.loaded["luci.jsonc"] = {
  stringify = function(value)
    return value
  end
}

package.loaded["luci.dispatcher"] = {
  build_url = function()
    return "/admin/dashboard"
  end
}

package.loaded["luci.template"] = {
  render = function(template, context)
    rendered_template = template
    rendered_prefix = context.prefix
  end
}

package.loaded["luci.dashboard.session"] = {
  require_session = function()
    return "sid", { token = "t" }
  end
}

package.loaded["luci.dashboard.api.overview"] = {
  get = function()
    overview_called = true
  end
}

package.loaded["luci.controller.dashboard"] = nil
local controller = require("luci.controller.dashboard")
controller.index()

assert(#registered == 1, "legacy dashboard-api route should be removed")
assert(table.concat(registered[1].path, "/") == "admin/dashboard", "dashboard page route missing")

controller.dashboard_dispatch()
assert(overview_called == true, "overview route should dispatch modular API")

request_uri = "/admin/dashboard"
controller.dashboard_dispatch()
assert(rendered_template == "dashboard/main", "dashboard page should render main template")
assert(rendered_prefix == "/admin/dashboard", "dashboard page should pass prefix to template")
