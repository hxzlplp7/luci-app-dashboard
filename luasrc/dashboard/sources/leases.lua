local M = {}

local function normalize_mac(mac)
  return tostring(mac or ""):upper()
end

function M.list_users(path)
  local leases_path = path or "/tmp/dhcp.leases"
  local handle = io.open(leases_path, "r")
  local users = {}

  if not handle then
    return users
  end

  for line in handle:lines() do
    local _, mac, ip, hostname = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
    if mac and ip then
      users[#users + 1] = {
        mac = normalize_mac(mac),
        ip = ip,
        hostname = hostname == "*" and "" or (hostname or "")
      }
    end
  end

  handle:close()
  return users
end

return M
