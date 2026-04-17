local M = {}
local FEATURE_ROOT = "/etc/dashboard/feature"
local FEATURE_INFO_FILE = FEATURE_ROOT .. "/feature.info.json"
local FEATURE_CLASSES_FILE = FEATURE_ROOT .. "/feature.classes.json"

local function path_exists(path)
  local f = io.open(path, "r")
  if f then
    f:close()
    return true
  end

  return os.rename(path, path) and true or false
end

function M.detect()
  local uci = require("luci.model.uci").cursor()
  return {
    nlbwmon = path_exists("/usr/share/nlbwmon"),
    samba4 = path_exists("/etc/config/samba4") or path_exists("/usr/lib/lua/luci/controller/samba4.lua"),
    domain_logs = path_exists("/tmp/openclash.log"),
    feature_library = path_exists(FEATURE_INFO_FILE) or path_exists(FEATURE_CLASSES_FILE) or path_exists(FEATURE_ROOT),
    history_store = path_exists(uci:get("dashboard", "record", "history_data_path") or "/tmp/dashboard/history")
  }
end

return M
