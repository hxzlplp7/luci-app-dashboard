local validation = require("luci.dashboard.validation")

assert(validation.is_ipv4("192.168.10.1") == true, "valid ipv4 rejected")
assert(validation.is_ipv4("256.1.1.1") == false, "invalid ipv4 accepted")
assert(validation.is_netmask("255.255.255.0") == true, "valid netmask rejected")
assert(validation.is_netmask("255.255.0.255") == false, "invalid netmask accepted")

local network_state = {
  lan = {
    ipaddr = "192.168.1.1",
    netmask = "255.255.255.0"
  },
  wan = {
    proto = "dhcp",
    ipaddr = "",
    netmask = "",
    gateway = "",
    dns = {},
    username = "",
    password = ""
  },
  work_mode = "0"
}

local core_state = {
  work_mode = "0",
  lan_ifname = "br-lan",
  monitor_device = "wan"
}

package.preload["luci.dashboard.sources.network"] = function()
  return {
    read_lan = function()
      return {
        ipaddr = network_state.lan.ipaddr,
        netmask = network_state.lan.netmask
      }
    end,
    write_lan = function(payload)
      network_state.lan = {
        ipaddr = payload.ipaddr,
        netmask = payload.netmask
      }
      return true
    end,
    read_wan = function()
      return {
        proto = network_state.wan.proto,
        ipaddr = network_state.wan.ipaddr,
        netmask = network_state.wan.netmask,
        gateway = network_state.wan.gateway,
        dns = network_state.wan.dns,
        username = network_state.wan.username,
        password = network_state.wan.password
      }
    end,
    write_wan = function(payload)
      network_state.wan = {
        proto = payload.proto,
        ipaddr = payload.ipaddr,
        netmask = payload.netmask,
        gateway = payload.gateway,
        dns = payload.dns,
        username = payload.username,
        password = payload.password
      }
      return true
    end,
    read_work_mode = function()
      return core_state.work_mode
    end,
    write_work_mode = function(value)
      core_state.work_mode = value
      return true
    end
  }
end

package.preload["luci.dashboard.sources.config"] = function()
  return {
    read_core = function()
      return {
        work_mode = core_state.work_mode,
        lan_ifname = core_state.lan_ifname,
        monitor_device = core_state.monitor_device
      }
    end,
    write_core = function(values)
      for key, value in pairs(values) do
        core_state[key] = value
      end
      return true
    end
  }
end

local service = require("luci.dashboard.services.network")

local lan_payload, lan_err = service.validate_lan_payload({
  ipaddr = "192.168.5.1",
  netmask = "255.255.255.0"
})
assert(lan_payload ~= nil, "valid lan payload rejected")
assert(lan_err == nil, "valid lan payload returned error")
assert(lan_payload.ipaddr == "192.168.5.1", "lan ipaddr should be preserved")

local invalid_lan, invalid_lan_err, invalid_lan_details = service.validate_lan_payload({
  ipaddr = "192.168.5.999",
  netmask = "255.255.255.0"
})
assert(invalid_lan == nil, "invalid lan payload should fail")
assert(invalid_lan_err == "invalid_ipaddr", "invalid lan ip should report invalid_ipaddr")
assert(invalid_lan_details.field == "ipaddr", "invalid lan error should identify ipaddr")

local wan_payload, wan_err = service.validate_wan_payload({
  proto = "static",
  ipaddr = "10.0.0.2",
  netmask = "255.255.255.0",
  gateway = "10.0.0.1",
  dns = { "1.1.1.1", "8.8.8.8" }
})
assert(wan_payload ~= nil, "valid static wan payload rejected")
assert(wan_err == nil, "valid static wan payload returned error")
assert(#wan_payload.dns == 2, "wan dns should keep both entries")

local invalid_wan, invalid_wan_err, invalid_wan_details = service.validate_wan_payload({
  proto = "static",
  ipaddr = "10.0.0.2",
  netmask = "255.255.255.0",
  gateway = "10.0.0.1",
  dns = { "1.1.1.999" }
})
assert(invalid_wan == nil, "invalid wan payload should fail")
assert(invalid_wan_err == "invalid_dns", "invalid dns should report invalid_dns")
assert(invalid_wan_details.field == "dns", "invalid wan error should identify dns")

local work_mode = service.get_work_mode()
assert(work_mode.work_mode == "0", "initial work mode should come from core config")

local set_mode_payload, set_mode_err = service.set_work_mode("1")
assert(set_mode_payload ~= nil, "valid work mode should save")
assert(set_mode_err == nil, "valid work mode should not error")
assert(core_state.work_mode == "1", "work mode should persist to config")

local bad_mode, bad_mode_err, bad_mode_details = service.set_work_mode("3")
assert(bad_mode == nil, "invalid work mode should fail")
assert(bad_mode_err == "invalid_work_mode", "invalid work mode should report invalid_work_mode")
assert(bad_mode_details.field == "work_mode", "invalid work mode should identify field")
