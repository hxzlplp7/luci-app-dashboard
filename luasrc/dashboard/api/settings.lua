local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local settings = require("luci.dashboard.services.settings")

local M = {}

local function write(payload)
  http.prepare_content("application/json")
  http.write(jsonc.stringify(payload))
end

function M.get_dashboard()
  write(response.ok(settings.get_dashboard()))
end

function M.post_dashboard()
  local payload, err, details = settings.set_dashboard({
    monitor_device = http.formvalue("monitor_device")
  })

  if not payload then
    write(response.fail(err, "invalid dashboard settings", details))
    return
  end

  write(response.ok(payload))
end

return M
