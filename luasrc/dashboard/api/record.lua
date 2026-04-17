local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local record = require("luci.dashboard.services.record")

local M = {}

local function write(payload)
  http.prepare_content("application/json")
  http.write(jsonc.stringify(payload))
end

function M.get()
  write(response.ok(record.get()))
end

function M.post()
  local payload, err, details = record.set({
    enable = http.formvalue("enable"),
    record_time = http.formvalue("record_time"),
    app_valid_time = http.formvalue("app_valid_time"),
    history_data_size = http.formvalue("history_data_size"),
    history_data_path = http.formvalue("history_data_path")
  })

  if not payload then
    write(response.fail(err or "invalid_arg", "invalid record settings", details))
    return
  end

  write(response.ok(payload))
end

function M.action()
  local name = tostring(http.formvalue("name") or "")
  if name ~= "clear_history" then
    write(response.fail("invalid_arg", "unsupported record action", {
      field = "name",
      value = name
    }))
    return
  end

  local ok, err = record.clear_history()
  if not ok then
    write(response.fail(err or "runtime_error", "failed to clear history"))
    return
  end

  write(response.ok({
    cleared = true
  }))
end

return M
