local validation = require("luci.dashboard.validation")

assert(validation.is_ipv4("192.168.1.1") == true, "valid ip rejected")
assert(validation.is_ipv4("999.1.1.1") == false, "invalid ip accepted")
assert(validation.is_netmask("255.255.255.0") == true, "valid netmask rejected")
assert(validation.is_netmask("255.0.255.0") == false, "invalid netmask accepted")
assert(validation.is_iface_name("br-lan") == true, "valid iface rejected")
assert(validation.is_iface_name("lan/eth0") == false, "invalid iface accepted")
