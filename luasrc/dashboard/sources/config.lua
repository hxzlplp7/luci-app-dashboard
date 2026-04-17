local uci = require("luci.model.uci")

local M = {}
local CORE_SECTION = "core"

local function normalize_mac(mac)
  return tostring(mac or ""):upper()
end

local function get_cursor()
  return uci.cursor()
end

local function read_option(cursor, option)
  return tostring(cursor:get("dashboard", CORE_SECTION, option) or "")
end

function M.read_nicknames()
  local cursor = get_cursor()
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
  local cursor = get_cursor()
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

function M.read_core()
  local cursor = get_cursor()

  return {
    lan_ifname = read_option(cursor, "lan_ifname"),
    monitor_device = read_option(cursor, "monitor_device"),
    work_mode = read_option(cursor, "work_mode")
  }
end

function M.write_core(values)
  local cursor = get_cursor()
  local normalized = type(values) == "table" and values or {}

  for _, option in ipairs({ "lan_ifname", "monitor_device", "work_mode" }) do
    if normalized[option] ~= nil then
      cursor:set("dashboard", CORE_SECTION, option, tostring(normalized[option]))
    end
  end

  cursor:save("dashboard")
  cursor:commit("dashboard")

  return true
end

return M
