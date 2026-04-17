local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local overview = require("luci.dashboard.services.overview")

local M = {}

function M.get()
  http.prepare_content("application/json")
  http.write(jsonc.stringify(response.ok(overview.build())))
end

return M
