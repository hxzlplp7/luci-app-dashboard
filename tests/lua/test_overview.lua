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
