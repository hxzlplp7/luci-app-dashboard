local validation = require("luci.dashboard.validation")

assert(validation.is_ipv4("192.168.1.1") == true, "valid ip rejected")
assert(validation.is_ipv4("999.1.1.1") == false, "invalid ip accepted")
assert(validation.is_ipv4("1e2.1.1.1") == false, "scientific notation should be rejected")
assert(validation.is_ipv4(" 192.168.1.1") == false, "leading spaces should be rejected")
assert(validation.is_ipv4("+1.1.1.1") == false, "signed octets should be rejected")
assert(validation.is_ipv4("1..1.1") == false, "empty octets should be rejected")
assert(validation.is_netmask("255.255.255.0") == true, "valid netmask rejected")
assert(validation.is_netmask("255.0.255.0") == false, "invalid netmask accepted")
assert(validation.is_iface_name("br-lan") == true, "valid iface rejected")
assert(validation.is_iface_name("eth0.2") == true, "vlan iface should be accepted")
assert(validation.is_iface_name("wan.2") == true, "dotted iface should be accepted")
assert(validation.is_iface_name("lan/eth0") == false, "invalid iface accepted")

local config_file = assert(io.open("root/etc/config/dashboard", "r"))
local config_text = assert(config_file:read("*a"))
config_file:close()

assert(config_text:match("config core 'core'") ~= nil, "core section should be unique")
assert(config_text:match("config record 'record'") ~= nil, "record section should be unique")
assert(config_text:match("config core 'main'") == nil, "legacy core section name should be removed")
assert(config_text:match("config record 'main'") == nil, "legacy record section name should be removed")

local uci_state = { cursor_calls = 0, get_calls = 0, history_data_path = os.tmpname() }

package.preload["luci.model.uci"] = function()
  return {
    cursor = function()
      uci_state.cursor_calls = uci_state.cursor_calls + 1
      return {
        get = function(_, package_name, section, option)
          uci_state.get_calls = uci_state.get_calls + 1
          assert(package_name == "dashboard", "unexpected package name")
          assert(section == "record", "capabilities should read record section")
          assert(option == "history_data_path", "unexpected option name")
          return uci_state.history_data_path
        end
      }
    end
  }
end

local temp_file = assert(io.open(uci_state.history_data_path, "w"))
temp_file:write("history")
temp_file:close()

local capabilities = require("luci.dashboard.capabilities")
assert(uci_state.cursor_calls == 0, "uci cursor should be loaded inside detect()")

local detected = capabilities.detect()
assert(uci_state.cursor_calls == 1, "uci cursor should be called during detect()")
assert(uci_state.get_calls == 1, "capabilities should read history path once")
assert(detected.history_store == true, "history store should follow configured path")

os.remove(uci_state.history_data_path)

local open_state = {
  ["/etc/config/samba4"] = true,
  ["/tmp/openclash.log"] = true,
  ["/etc/dashboard/feature/feature.info.json"] = true,
  [uci_state.history_data_path] = true
}

local rename_state = {
  ["/usr/share/nlbwmon"] = true
}

local original_io_open = io.open
local original_os_rename = os.rename

io.open = function(path, mode)
  if open_state[path] then
    return {
      close = function() end
    }
  end
  return nil
end

os.rename = function(path, target)
  if path == target and rename_state[path] then
    return true
  end
  return nil
end

local detected_with_stubs = capabilities.detect()
assert(detected_with_stubs.nlbwmon == true, "directory presence should be detected")
assert(detected_with_stubs.samba4 == true, "samba4 file presence should be detected")
assert(detected_with_stubs.domain_logs == true, "domain log presence should be detected")
assert(detected_with_stubs.feature_library == true, "feature metadata presence should be detected")

io.open = original_io_open
os.rename = original_os_rename
