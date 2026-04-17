local util = require("luci.util")

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

local function exec_trim(cmd)
  local p = io.popen(cmd .. " 2>/dev/null")
  if not p then
    return ""
  end

  local output = p:read("*a") or ""
  p:close()
  return output:gsub("%s+$", "")
end

function M.read()
  local board = util.ubus("system", "board", {}) or {}
  local release = read_all("/etc/openwrt_release") or ""
  local model = board.model or exec_trim("cat /tmp/sysinfo/model") or "Generic Device"
  local uptime = tonumber((read_line("/proc/uptime") or "0"):match("^(%S+)")) or 0

  return {
    model = model,
    firmware = release:match("DISTRIB_DESCRIPTION='([^']*)'") or "OpenWrt",
    kernel = exec_trim("uname -r"),
    uptime_raw = math.floor(uptime),
    cpuUsage = 0,
    memUsage = 0,
    temp = 0,
    systime_raw = os.time()
  }
end

return M
