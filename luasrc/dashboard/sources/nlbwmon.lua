local M = {}

local function normalize_mac(mac)
  return tostring(mac or ""):upper()
end

local function has_path(path)
  local handle = io.open(path, "r")
  if handle then
    handle:close()
    return true
  end

  return os.rename(path, path) ~= nil
end

local function read_all(handle)
  if not handle or type(handle.read) ~= "function" then
    return nil
  end

  local ok, payload = pcall(handle.read, handle, "*a")
  if not ok or type(payload) ~= "string" or payload == "" then
    return nil
  end

  return payload
end

local function decode_json(payload)
  local ok, jsonc = pcall(require, "luci.jsonc")
  if not ok or type(jsonc) ~= "table" or type(jsonc.parse) ~= "function" then
    return nil
  end

  local parsed_ok, decoded = pcall(jsonc.parse, payload)
  if not parsed_ok then
    return nil
  end

  return decoded
end

local function number_or_zero(value)
  local num = tonumber(value)
  if not num or num < 0 then
    return 0
  end
  return math.floor(num)
end

local function pull_traffic(entry)
  if type(entry) ~= "table" then
    return nil, nil
  end

  local today = type(entry.today) == "table" and entry.today or nil
  local rx = entry.today_down_bytes
    or entry.download
    or entry.rx_bytes
    or entry.rx
    or (today and (today.down_bytes or today.rx_bytes or today.rx))
  local tx = entry.today_up_bytes
    or entry.upload
    or entry.tx_bytes
    or entry.tx
    or (today and (today.up_bytes or today.tx_bytes or today.tx))

  if rx == nil and tx == nil and today == nil then
    return nil, nil
  end

  return number_or_zero(rx), number_or_zero(tx)
end

local function collect_rows(node, rows, inherited_mac)
  if type(node) ~= "table" then
    return
  end

  local mac = node.mac or node.device_mac or node.hwaddr or inherited_mac
  local rx, tx = pull_traffic(node)
  if mac and (rx ~= nil or tx ~= nil) then
    rows[normalize_mac(mac)] = {
      today_up_bytes = tx or 0,
      today_down_bytes = rx or 0,
      supported = true
    }
  end

  if node.users then
    collect_rows(node.users, rows)
  end
  if node.data then
    collect_rows(node.data, rows)
  end
  if node.devices then
    collect_rows(node.devices, rows)
  end
  if node.by_mac and type(node.by_mac) == "table" then
    for key, value in pairs(node.by_mac) do
      collect_rows(value, rows, key)
    end
  end

  for _, value in ipairs(node) do
    collect_rows(value, rows)
  end
end

local function read_command_payload()
  for _, command in ipairs({
    "/usr/sbin/nlbw -c json list 2>/dev/null",
    "/usr/bin/nlbw -c json list 2>/dev/null",
    "/usr/bin/nlbwmon -c json 2>/dev/null"
  }) do
    local handle = io.popen(command)
    if handle then
      local payload = read_all(handle)
      handle:close()
      if payload then
        return payload
      end
    end
  end

  return nil
end

local function read_file_payload()
  for _, path in ipairs({
    "/tmp/nlbwmon.json",
    "/tmp/nlbwmon-data.json",
    "/var/run/nlbwmon/data.json",
    "/usr/share/nlbwmon/data.json"
  }) do
    local handle = io.open(path, "r")
    if handle then
      local payload = read_all(handle)
      handle:close()
      if payload then
        return payload
      end
    end
  end

  return nil
end

function M.list_users()
  if not has_path("/usr/share/nlbwmon") then
    return {}
  end

  local payload = read_command_payload() or read_file_payload()
  if not payload then
    return {}
  end

  local decoded = decode_json(payload)
  if type(decoded) ~= "table" then
    return {}
  end

  local rows = {}
  collect_rows(decoded, rows)
  return rows
end

return M
