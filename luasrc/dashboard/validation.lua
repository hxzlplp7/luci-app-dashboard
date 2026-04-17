local M = {}

function M.is_ipv4(value)
  local a, b, c, d = tostring(value or ""):match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
  if not a then
    return false
  end

  for _, part in ipairs({ tonumber(a), tonumber(b), tonumber(c), tonumber(d) }) do
    if not part or part < 0 or part > 255 then
      return false
    end
  end
  return true
end

function M.is_netmask(value)
  local valid = {
    ["255.255.255.255"] = true,
    ["255.255.255.254"] = true,
    ["255.255.255.252"] = true,
    ["255.255.255.248"] = true,
    ["255.255.255.240"] = true,
    ["255.255.255.224"] = true,
    ["255.255.255.192"] = true,
    ["255.255.255.128"] = true,
    ["255.255.255.0"] = true,
    ["255.255.254.0"] = true,
    ["255.255.252.0"] = true,
    ["255.255.248.0"] = true,
    ["255.255.240.0"] = true,
    ["255.255.224.0"] = true,
    ["255.255.192.0"] = true,
    ["255.255.128.0"] = true,
    ["255.255.0.0"] = true,
    ["255.254.0.0"] = true,
    ["255.252.0.0"] = true,
    ["255.248.0.0"] = true,
    ["255.240.0.0"] = true,
    ["255.224.0.0"] = true,
    ["255.192.0.0"] = true,
    ["255.128.0.0"] = true,
    ["255.0.0.0"] = true
  }
  return valid[tostring(value or "")] == true
end

function M.is_iface_name(value)
  return tostring(value or ""):match("^[A-Za-z0-9._-]+$") ~= nil
end

return M
