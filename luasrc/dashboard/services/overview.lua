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
