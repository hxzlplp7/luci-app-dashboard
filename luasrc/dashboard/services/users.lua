local config = require("luci.dashboard.sources.config")
local leases = require("luci.dashboard.sources.leases")
local arp = require("luci.dashboard.sources.arp")
local nlbwmon = require("luci.dashboard.sources.nlbwmon")

local M = {}

local DEFAULT_PAGE = 1
local DEFAULT_PAGE_SIZE = 20

local function normalize_mac(mac)
  return tostring(mac or ""):upper()
end

local function is_valid_mac(mac)
  return normalize_mac(mac):match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") ~= nil
end

local function normalize_traffic(entry)
  local source = type(entry) == "table" and entry or {}

  return {
    today_up_bytes = math.floor(tonumber(source.today_up_bytes) or 0),
    today_down_bytes = math.floor(tonumber(source.today_down_bytes) or 0),
    supported = source.supported == true
  }
end

local function collect_devices()
  local devices = {}

  for _, item in ipairs(leases.list_users()) do
    local mac = normalize_mac(item.mac)
    if mac ~= "" then
      devices[mac] = {
        mac = mac,
        ip = tostring(item.ip or ""),
        hostname = tostring(item.hostname or "")
      }
    end
  end

  for _, item in ipairs(arp.list_users()) do
    local mac = normalize_mac(item.mac)
    if mac ~= "" then
      local device = devices[mac] or {
        mac = mac,
        ip = "",
        hostname = ""
      }

      if device.ip == "" then
        device.ip = tostring(item.ip or "")
      end

      devices[mac] = device
    end
  end

  return devices
end

local function to_list_item(device, nicknames, usage)
  local traffic = normalize_traffic(usage[device.mac])

  return {
    mac = device.mac,
    ip = device.ip,
    hostname = device.hostname,
    nickname = tostring(nicknames[device.mac] or ""),
    traffic = traffic
  }
end

local function sort_key(item)
  local primary = item.nickname ~= "" and item.nickname
    or (item.hostname ~= "" and item.hostname or item.mac)
  return string.lower(primary), item.mac
end

local function compare_items(left, right)
  local left_primary, left_mac = sort_key(left)
  local right_primary, right_mac = sort_key(right)

  if left_primary == right_primary then
    return left_mac < right_mac
  end

  return left_primary < right_primary
end

local function build_all_items()
  local devices = collect_devices()
  local nicknames = config.read_nicknames()
  local usage = nlbwmon.list_users()
  local items = {}

  for _, device in pairs(devices) do
    items[#items + 1] = to_list_item(device, nicknames, usage)
  end

  table.sort(items, compare_items)

  return items, usage
end

function M.list(params)
  local options = type(params) == "table" and params or {}
  local page = math.max(DEFAULT_PAGE, math.floor(tonumber(options.page) or DEFAULT_PAGE))
  local page_size = math.max(1, math.floor(tonumber(options.page_size) or DEFAULT_PAGE_SIZE))
  local items = build_all_items()
  local total_num = #items
  local offset = (page - 1) * page_size + 1
  local page_items = {}

  for index = offset, math.min(total_num, offset + page_size - 1) do
    page_items[#page_items + 1] = items[index]
  end

  return {
    page = page,
    page_size = page_size,
    total_num = total_num,
    list = page_items
  }
end

function M.detail(mac)
  if not is_valid_mac(mac) then
    return nil
  end

  local items, usage = build_all_items()
  local target_mac = normalize_mac(mac)

  for _, item in ipairs(items) do
    if item.mac == target_mac then
      return {
        device = {
          mac = item.mac,
          ip = item.ip,
          hostname = item.hostname,
          nickname = item.nickname
        },
        traffic = normalize_traffic(usage[target_mac]),
        recent_domains = {},
        history = {}
      }
    end
  end

  return nil
end

function M.save_remark(mac, value)
  if not is_valid_mac(mac) then
    return nil, "invalid_mac"
  end

  local normalized_mac = normalize_mac(mac)
  local normalized_value = tostring(value or "")
  local ok = config.write_nickname(normalized_mac, normalized_value)

  if ok == false then
    return nil, "save_failed"
  end

  return {
    saved = true,
    mac = normalized_mac,
    value = normalized_value
  }
end

return M
