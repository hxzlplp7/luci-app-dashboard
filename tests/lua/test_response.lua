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
