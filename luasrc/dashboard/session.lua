local http = require("luci.http")
local util = require("luci.util")

local M = {}

function M.require_session()
  for _, key in ipairs({ "sysauth_https", "sysauth_http", "sysauth" }) do
    local sid = http.getcookie(key)
    if sid then
      local session = util.ubus("session", "get", { ubus_rpc_session = sid })
      if type(session) == "table" and type(session.values) == "table" and type(session.values.token) == "string" then
        return sid, session.values
      end
    end
  end
  return nil, nil
end

return M
