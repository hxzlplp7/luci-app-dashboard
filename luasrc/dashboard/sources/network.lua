local util = require("luci.util")
local uci = require("luci.model.uci").cursor()

local M = {}

local function read_line(path)
  local f = io.open(path, "r")
  if not f then
    return nil
  end

  local value = f:read("*l")
  f:close()
  return value
end

local function read_all(path)
  local f = io.open(path, "r")
  if not f then
    return nil
  end

  local value = f:read("*a")
  f:close()
  return value
end

function M.summary()
  local wan = util.ubus("network.interface.wan", "status") or {}
  if not wan.up and not (wan["ipv4-address"] and #wan["ipv4-address"] > 0) then
    local dump = util.ubus("network.interface", "dump", {}) or {}
    for _, entry in ipairs(dump.interface or dump.interfaces or {}) do
      local name = entry.interface or ""
      if name ~= "loopback" and name ~= "lan" and not name:match("^lan%d") then
        if entry["ipv4-address"] and #entry["ipv4-address"] > 0 then
          wan = entry
          break
        end
      end
    end
  end

  local wan_ip = ""
  if wan["ipv4-address"] and wan["ipv4-address"][1] then
    wan_ip = wan["ipv4-address"][1].address or ""
  end

  return {
    wanStatus = (wan.up == true or wan_ip ~= "") and "up" or "down",
    wanIp = wan_ip,
    lanIp = uci:get("network", "lan", "ipaddr") or "192.168.1.1",
    dns = wan["dns-server"] or {},
    network_uptime_raw = wan.uptime or 0
  }
end

function M.traffic()
  local wan = util.ubus("network.interface.wan", "status") or {}
  local l3_device = wan.l3_device or wan.device or ""

  if l3_device == "" then
    local dump = util.ubus("network.interface", "dump", {}) or {}
    for _, entry in ipairs(dump.interface or dump.interfaces or {}) do
      local name = entry.interface or ""
      if name ~= "loopback" and name ~= "lan" and not name:match("^lan%d") then
        l3_device = entry.l3_device or entry.device or ""
        if l3_device ~= "" then
          break
        end
      end
    end
  end

  local tx_bytes, rx_bytes = 0, 0
  if l3_device ~= "" then
    local base = "/sys/class/net/" .. l3_device .. "/statistics/"
    tx_bytes = tonumber(read_line(base .. "tx_bytes") or "0") or 0
    rx_bytes = tonumber(read_line(base .. "rx_bytes") or "0") or 0
  end

  return { tx_bytes = tx_bytes, rx_bytes = rx_bytes }
end

function M.devices()
  local devices = {}
  local seen = {}

  local function guess_type(name)
    local normalized = (name or ""):lower()
    if normalized:match("iphone") or normalized:match("ipad") or normalized:match("android") or
      normalized:match("phone") or normalized:match("mobile") or normalized:match("pixel") or
      normalized:match("galaxy") or normalized:match("oneplus") or normalized:match("xiaomi") or
      normalized:match("huawei") or normalized:match("oppo") or normalized:match("vivo") then
      return "mobile"
    end
    return "laptop"
  end

  for line in (read_all("/tmp/dhcp.leases") or ""):gmatch("[^\n]+") do
    local _, mac, ip, name = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
    if mac then
      mac = mac:upper()
      if not seen[mac] then
        seen[mac] = true
        local host = (name and name ~= "*") and name or ""
        devices[#devices + 1] = {
          mac = mac,
          ip = ip or "",
          name = host,
          type = guess_type(host),
          active = true
        }
      end
    end
  end

  for line in (read_all("/proc/net/arp") or ""):gmatch("[^\n]+") do
    local ip, _, flags, mac = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
    if mac and mac ~= "00:00:00:00:00:00" and ip ~= "IP" and flags == "0x2" then
      mac = mac:upper()
      if not seen[mac] then
        seen[mac] = true
        devices[#devices + 1] = {
          mac = mac,
          ip = ip or "",
          name = "",
          type = "laptop",
          active = true
        }
      end
    end
  end

  return devices
end

return M
