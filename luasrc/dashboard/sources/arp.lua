local M = {}

local ZERO_MAC = "00:00:00:00:00:00"

local function normalize_mac(mac)
  return tostring(mac or ""):upper()
end

function M.list_users(path)
  local arp_path = path or "/proc/net/arp"
  local handle = io.open(arp_path, "r")
  local users = {}
  local is_first_line = true

  if not handle then
    return users
  end

  for line in handle:lines() do
    if is_first_line then
      is_first_line = false
    else
      local ip, _, flags, mac = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
      local normalized_mac = normalize_mac(mac)

      if ip and flags == "0x2" and normalized_mac ~= ZERO_MAC then
        users[#users + 1] = {
          mac = normalized_mac,
          ip = ip
        }
      end
    end
  end

  handle:close()
  return users
end

return M
