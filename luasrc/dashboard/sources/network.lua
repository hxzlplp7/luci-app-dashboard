local util = require("luci.util")
local uci = require("luci.model.uci").cursor()

local M = {}

function M.summary()
  local wan = util.ubus("network.interface.wan", "status") or {}
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
  return { tx_bytes = 0, rx_bytes = 0 }
end

function M.devices()
  return {}
end

return M
