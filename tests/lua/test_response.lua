local response = require("luci.dashboard.response")

local ok_payload = response.ok({ value = 1 }, { source = "unit" })
assert(ok_payload.ok == true, "ok payload should mark ok=true")
assert(ok_payload.data.value == 1, "ok payload should keep data")
assert(ok_payload.meta.source == "unit", "ok payload should keep meta")

local err_payload = response.fail("invalid_arg", "bad input", { field = "ip" })
assert(err_payload.ok == false, "fail payload should mark ok=false")
assert(err_payload.error.code == "invalid_arg", "error code mismatch")
assert(err_payload.error.message == "bad input", "error message mismatch")
assert(err_payload.error.details.field == "ip", "error details mismatch")

local http_state = { cookies = {} }
local util_state = { session = nil }

package.preload["luci.http"] = function()
  return {
    getcookie = function(key)
      return http_state.cookies[key]
    end
  }
end

package.preload["luci.util"] = function()
  return {
    ubus = function()
      return util_state.session
    end
  }
end

local session = require("luci.dashboard.session")

http_state.cookies.sysauth = "sid-123"
util_state.session = { values = { token = 123 } }
local sid, values = session.require_session()
assert(sid == nil and values == nil, "session should reject non-string token")

util_state.session = { values = { token = "abc123" } }
sid, values = session.require_session()
assert(sid == "sid-123", "session should return sid when token is present")
assert(values.token == "abc123", "session should return session values")
