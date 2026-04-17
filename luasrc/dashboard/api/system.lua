local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local system = require("luci.dashboard.services.system")

local M = {}

local function write(payload)
  http.prepare_content("application/json")
  http.write(jsonc.stringify(payload))
end

function M.get()
  write(response.ok(system.get()))
end

function M.post()
  local payload, err, details = system.set({
    lan_ifname = http.formvalue("lan_ifname")
  })

  if not payload then
    write(response.fail(err, "invalid system config", details))
    return
  end

  write(response.ok(payload))
end

return M
