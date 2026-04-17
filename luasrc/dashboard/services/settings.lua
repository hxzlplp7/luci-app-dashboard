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

function M.get_dashboard()
  local core = config.read_core()

  return {
    monitor_device = tostring(core.monitor_device or "")
  }
end

function M.set_dashboard(payload)
  local source = type(payload) == "table" and payload or {}
  local monitor_device = trim(source.monitor_device)

  if monitor_device == "" or not validation.is_iface_name(monitor_device) then
    return invalid("invalid_monitor_device", "monitor_device", monitor_device)
  end

  config.write_core({
    monitor_device = monitor_device
  })

  return M.get_dashboard()
end

return M
