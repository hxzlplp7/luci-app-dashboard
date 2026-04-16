package.path = table.concat({
  "luasrc/?.lua",
  "luasrc/?/init.lua",
  "luasrc/?/?.lua",
  "tests/lua/?.lua",
  package.path
}, ";")

package.preload["luci.dashboard.response"] = function()
  return require("dashboard.response")
end

package.preload["luci.dashboard.validation"] = function()
  return require("dashboard.validation")
end

package.preload["luci.dashboard.session"] = function()
  return require("dashboard.session")
end

package.preload["luci.dashboard.capabilities"] = function()
  return require("dashboard.capabilities")
end

local test_file = assert(arg[1], "missing test file")
local ok, err = pcall(dofile, test_file)
if not ok then
  io.stderr:write(err .. "\n")
  os.exit(1)
end
io.stdout:write("PASS " .. test_file .. "\n")
