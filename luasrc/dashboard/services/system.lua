local config = require("luci.dashboard.sources.config")
local validation = require("luci.dashboard.validation")

local M = {}

local function trim(value)
  return tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function invalid(code, field, value)
  return nil, code, {
    field = field,
    value = value
  }
end

function M.get()
  local core = config.read_core()

  return {
    lan_ifname = tostring(core.lan_ifname or "")
  }
end

function M.set(payload)
  local source = type(payload) == "table" and payload or {}
  local lan_ifname = trim(source.lan_ifname)

  if lan_ifname == "" or not validation.is_iface_name(lan_ifname) then
    return invalid("invalid_lan_ifname", "lan_ifname", lan_ifname)
  end

  config.write_core({
    lan_ifname = lan_ifname
  })

  return M.get()
end

return M
