local http = require("luci.http")
local jsonc = require("luci.jsonc")
local response = require("luci.dashboard.response")
local users = require("luci.dashboard.services.users")

local M = {}

local function write(payload)
  http.prepare_content("application/json")
  http.write(jsonc.stringify(payload))
end

local function parse_positive_int(value, fallback)
  local num = tonumber(value)
  if not num or num < 1 then
    return fallback
  end

  return math.floor(num)
end

function M.list()
  write(response.ok(users.list({
    page = parse_positive_int(http.formvalue("page"), 1),
    page_size = parse_positive_int(http.formvalue("page_size"), 20)
  })))
end

function M.detail()
  local mac = http.formvalue("mac")
  local payload = users.detail(mac)

  if not payload then
    write(response.fail("not_found", "user not found", {
      mac = tostring(mac or "")
    }))
    return
  end

  write(response.ok(payload))
end

function M.remark()
  local mac = http.formvalue("mac")
  local value = http.formvalue("value")
  local payload, err = users.save_remark(mac, value)

  if not payload then
    if err == "invalid_mac" then
      write(response.fail("invalid_arg", "invalid mac", {
        mac = tostring(mac or "")
      }))
      return
    end

    write(response.fail("save_failed", "failed to save remark", {
      mac = tostring(mac or "")
    }))
    return
  end

  write(response.ok(payload))
end

return M
