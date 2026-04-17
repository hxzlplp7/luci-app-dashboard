local uci = require("luci.model.uci")

local M = {}

local function normalize_mac(mac)
  return tostring(mac or ""):upper()
end

function M.read_nicknames()
  local cursor = uci.cursor()
  local nicknames = {}

  cursor:foreach("dashboard", "nickname", function(section)
    local mac = normalize_mac(section.mac)
    local value = tostring(section.value or "")

    if mac ~= "" and value ~= "" then
      nicknames[mac] = value
    end
  end)

  return nicknames
end

function M.write_nickname(mac, value)
  local cursor = uci.cursor()
  local normalized_mac = normalize_mac(mac)
  local normalized_value = tostring(value or "")
  local existing

  cursor:foreach("dashboard", "nickname", function(section)
    if not existing and normalize_mac(section.mac) == normalized_mac then
      existing = section[".name"]
    end
  end)

  if normalized_value == "" then
    if existing then
      cursor:delete("dashboard", existing)
    end
  else
    if not existing then
      existing = cursor:add("dashboard", "nickname")
    end

    cursor:set("dashboard", existing, "mac", normalized_mac)
    cursor:set("dashboard", existing, "value", normalized_value)
  end

  cursor:save("dashboard")
  cursor:commit("dashboard")

  return true
end

return M
