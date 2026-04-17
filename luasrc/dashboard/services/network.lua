local config = require("luci.dashboard.sources.config")
local network = require("luci.dashboard.sources.network")
local validation = require("luci.dashboard.validation")

local M = {}

local function trim(value)
  return tostring(value or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function split_dns(value)
  if type(value) == "table" then
    return value
  end

  local text = trim(value)
  local values = {}

  for token in text:gmatch("[^,%s]+") do
    values[#values + 1] = token
  end

  return values
end

local function invalid(code, field, value)
  return nil, code, {
    field = field,
    value = value
  }
end

local function normalize_dns(value)
  local dns = {}

  for _, item in ipairs(split_dns(value)) do
    local addr = trim(item)
    if addr ~= "" then
      if not validation.is_ipv4(addr) then
        return invalid("invalid_dns", "dns", addr)
      end
      dns[#dns + 1] = addr
    end
  end

  return dns
end

local function normalize_work_mode(value)
  local mode = trim(value)
  if mode ~= "0" and mode ~= "1" then
    return invalid("invalid_work_mode", "work_mode", mode)
  end

  return mode
end

function M.validate_lan_payload(payload)
  local source = type(payload) == "table" and payload or {}
  local ipaddr = trim(source.ipaddr)
  local netmask = trim(source.netmask)

  if not validation.is_ipv4(ipaddr) then
    return invalid("invalid_ipaddr", "ipaddr", ipaddr)
  end
  if not validation.is_netmask(netmask) then
    return invalid("invalid_netmask", "netmask", netmask)
  end

  return {
    ipaddr = ipaddr,
    netmask = netmask
  }
end

function M.validate_wan_payload(payload)
  local source = type(payload) == "table" and payload or {}
  local proto = trim(source.proto)
  local username = trim(source.username)
  local password = tostring(source.password or "")
  local dns, dns_err, dns_details = normalize_dns(source.dns)

  if dns == nil then
    return nil, dns_err, dns_details
  end
  if proto ~= "dhcp" and proto ~= "static" and proto ~= "pppoe" then
    return invalid("invalid_proto", "proto", proto)
  end

  local normalized = {
    proto = proto,
    ipaddr = "",
    netmask = "",
    gateway = "",
    dns = dns,
    username = "",
    password = ""
  }

  if proto == "static" then
    normalized.ipaddr = trim(source.ipaddr)
    normalized.netmask = trim(source.netmask)
    normalized.gateway = trim(source.gateway)

    if not validation.is_ipv4(normalized.ipaddr) then
      return invalid("invalid_ipaddr", "ipaddr", normalized.ipaddr)
    end
    if not validation.is_netmask(normalized.netmask) then
      return invalid("invalid_netmask", "netmask", normalized.netmask)
    end
    if normalized.gateway ~= "" and not validation.is_ipv4(normalized.gateway) then
      return invalid("invalid_gateway", "gateway", normalized.gateway)
    end
  elseif proto == "pppoe" then
    if username == "" then
      return invalid("invalid_username", "username", username)
    end

    normalized.username = username
    normalized.password = password
  end

  return normalized
end

function M.get_lan()
  return network.read_lan()
end

function M.set_lan(payload)
  local normalized, err, details = M.validate_lan_payload(payload)
  if not normalized then
    return nil, err, details
  end

  return network.write_lan(normalized)
end

function M.get_wan()
  return network.read_wan()
end

function M.set_wan(payload)
  local normalized, err, details = M.validate_wan_payload(payload)
  if not normalized then
    return nil, err, details
  end

  return network.write_wan(normalized)
end

function M.get_work_mode()
  return {
    work_mode = tostring(network.read_work_mode() or config.read_core().work_mode or "")
  }
end

function M.set_work_mode(value)
  local mode, err, details = normalize_work_mode(value)
  if not mode then
    return nil, err, details
  end

  return {
    work_mode = tostring(network.write_work_mode(mode) or mode)
  }
end

return M
