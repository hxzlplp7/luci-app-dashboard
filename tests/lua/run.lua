package.path = table.concat({
  "luasrc/?.lua",
  "luasrc/?/init.lua",
  "luasrc/?/?.lua",
  "tests/lua/?.lua",
  package.path
}, ";")

local alias_prefixes = {
  ["luci.dashboard."] = "dashboard.",
  ["luci.controller."] = "controller."
}

table.insert(package.loaders, 2, function(module_name)
  for source_prefix, target_prefix in pairs(alias_prefixes) do
    if module_name:sub(1, #source_prefix) == source_prefix then
      local target_name = target_prefix .. module_name:sub(#source_prefix + 1)
      return function()
        local loaded = require(target_name)
        return package.loaded[module_name] or package.loaded[target_name] or loaded
      end
    end
  end

  return "\n\tno local LuCI source alias for " .. module_name
end)

local test_file = assert(arg[1], "missing test file")
local ok, err = pcall(dofile, test_file)
if not ok then
  io.stderr:write(err .. "\n")
  os.exit(1)
end
io.stdout:write("PASS " .. test_file .. "\n")
