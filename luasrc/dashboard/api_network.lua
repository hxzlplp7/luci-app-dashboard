-- Dashboard Network API
-- Handles: /u/network/status/, /u/network/statistics/, /network/device/list/,
--          /network/port/list/, /network/interface/config/, /network/checkPublicNet/

local u = require "luci.dashboard.util"
local util = require "luci.util"
local jsonc = require "luci.jsonc"

local M = {}

--- GET /u/network/status/
-- Returns WAN/LAN connection info, IP, DNS, proto, uptime
function M.status()
    local uci = require("luci.model.uci").cursor()
    local result = {}

    -- Determine default WAN interface name
    local wan_ifname = "wan"
    result.defaultInterface = wan_ifname

    -- Get WAN status via ubus
    local wan = util.ubus("network.interface." .. wan_ifname, "status") or {}
    local wan6 = util.ubus("network.interface.wan6", "status") or {}

    -- IPv4 address
    result.ipv4addr = ""
    if wan["ipv4-address"] and wan["ipv4-address"][1] then
        result.ipv4addr = wan["ipv4-address"][1].address or ""
    end

    -- IPv6 address
    result.ipv6addr = ""
    if wan6["ipv6-address"] and wan6["ipv6-address"][1] then
        result.ipv6addr = wan6["ipv6-address"][1].address or ""
    elseif wan["ipv6-address"] and wan["ipv6-address"][1] then
        result.ipv6addr = wan["ipv6-address"][1].address or ""
    end

    -- Protocol
    result.proto = uci:get("network", wan_ifname, "proto") or "dhcp"

    -- DNS servers
    local dns_servers = wan["dns-server"] or {}
    result.dnsList = dns_servers

    -- DNS proto: check if user configured custom DNS
    local custom_dns = uci:get_list("network", wan_ifname, "dns")
    if custom_dns and #custom_dns > 0 then
        result.dnsProto = "manual"
    else
        result.dnsProto = "auto"
    end

    -- WAN uptime
    result.uptimeStamp = wan.uptime or 0

    -- Network connectivity status
    if wan.up then
        -- Quick DNS check to determine network quality
        local dns_ok = os.execute("nslookup www.baidu.com >/dev/null 2>&1") == 0
        if dns_ok then
            result.networkInfo = "netSuccess"
        else
            result.networkInfo = "dnsFailed"
        end
    else
        result.networkInfo = "netFailed"
    end

    u.json_success(result)
end

--- GET /u/network/statistics/
-- Returns interface rx/tx byte counters for traffic display
function M.statistics()
    local result = {}
    local interfaces = {}

    local netdev = u.read_file_all("/proc/net/dev") or ""
    for line in netdev:gmatch("[^\n]+") do
        local iface, rx_bytes, rx_pkts, _, _, _, _, _, _, tx_bytes, tx_pkts =
            line:match("^%s*(%S+):%s*(%d+)%s+(%d+)%s+(%d+)%s+(%d+)%s+(%d+)%s+(%d+)%s+(%d+)%s+(%d+)%s+(%d+)%s+(%d+)")
        if iface and iface ~= "lo" then
            interfaces[iface] = {
                rx_bytes = tonumber(rx_bytes) or 0,
                tx_bytes = tonumber(tx_bytes) or 0,
                rx_packets = tonumber(rx_pkts) or 0,
                tx_packets = tonumber(tx_pkts) or 0
            }
        end
    end

    result.interfaces = interfaces

    -- Also provide total WAN counters if available
    if interfaces["eth0"] then
        result.wan = interfaces["eth0"]
    end
    -- Try common WAN interface names
    for _, name in ipairs({"pppoe-wan", "eth1", "wan"}) do
        if interfaces[name] then
            result.wan = interfaces[name]
            break
        end
    end

    u.json_success(result)
end

--- GET /network/device/list/
-- Returns list of connected devices from DHCP leases + ARP table
function M.device_list()
    local devices = {}
    local seen = {}

    -- Read DHCP leases
    local leases = u.read_file_all("/tmp/dhcp.leases") or ""
    for line in leases:gmatch("[^\n]+") do
        local ts, mac, ip, name = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
        if mac then
            mac = mac:upper()
            if not seen[mac] then
                seen[mac] = true
                devices[#devices + 1] = {
                    mac = mac,
                    ip = ip,
                    name = (name and name ~= "*") and name or "",
                    timestamp = tonumber(ts) or 0
                }
            end
        end
    end

    -- Supplement with ARP table for devices not in DHCP leases
    local arp = u.read_file_all("/proc/net/arp") or ""
    for line in arp:gmatch("[^\n]+") do
        local ip, _, _, mac = line:match("^(%S+)%s+(%S+)%s+(%S+)%s+(%S+)")
        if mac and mac ~= "00:00:00:00:00:00" and ip ~= "IP" then
            mac = mac:upper()
            if not seen[mac] then
                seen[mac] = true
                devices[#devices + 1] = {
                    mac = mac,
                    ip = ip,
                    name = ""
                }
            end
        end
    end

    u.json_success({ devices = devices })
end

--- GET /network/port/list/
-- Returns physical network port status from sysfs
function M.port_list()
    local ports = {}

    local p = io.popen("ls /sys/class/net/ 2>/dev/null")
    if p then
        for iface in p:lines() do
            -- Skip virtual interfaces but include physical ones
            if iface ~= "lo" and
               not iface:match("^br%-") and
               not iface:match("^docker") and
               not iface:match("^veth") and
               not iface:match("^wlan") and
               not iface:match("^wwan") then

                local port = {
                    name = iface,
                    macAddress = "",
                    linkSpeed = "",
                    linkState = "DOWN",
                    rx_packets = 0,
                    tx_packets = 0,
                    interfaceNames = {},
                    master = "",
                    duplex = ""
                }

                -- MAC address
                port.macAddress = (u.read_file("/sys/class/net/" .. iface .. "/address") or ""):upper()

                -- Link state
                local operstate = u.read_file("/sys/class/net/" .. iface .. "/operstate") or "down"
                port.linkState = (operstate == "up") and "UP" or "DOWN"

                -- Speed
                local speed = u.read_file("/sys/class/net/" .. iface .. "/speed")
                if speed then
                    local spd = tonumber(speed)
                    if spd and spd > 0 then
                        port.linkSpeed = spd .. "Mbps"
                    end
                end

                -- Duplex
                port.duplex = u.read_file("/sys/class/net/" .. iface .. "/duplex") or ""

                -- Packet counters
                local rx = u.read_file("/sys/class/net/" .. iface .. "/statistics/rx_packets")
                local tx = u.read_file("/sys/class/net/" .. iface .. "/statistics/tx_packets")
                port.rx_packets = tonumber(rx) or 0
                port.tx_packets = tonumber(tx) or 0

                -- Check which logical interface this port belongs to
                local uci = require("luci.model.uci").cursor()
                uci:foreach("network", "interface", function(s)
                    local ifname = s.device or s.ifname or ""
                    if ifname == iface or ifname:match(iface) then
                        port.interfaceNames[#port.interfaceNames + 1] = s[".name"]
                    end
                end)

                -- Bridge master
                local master_link = "/sys/class/net/" .. iface .. "/master"
                local master_info = u.exec("readlink " .. master_link)
                if master_info and master_info ~= "" then
                    port.master = master_info:match("([^/]+)%s*$") or ""
                end

                ports[#ports + 1] = port
            end
        end
        p:close()
    end

    u.json_success({ ports = ports })
end

--- GET /network/interface/config/
-- Returns network interface configuration
function M.interface_config_get()
    local uci = require("luci.model.uci").cursor()
    local interfaces = {}

    uci:foreach("network", "interface", function(s)
        if s[".name"] ~= "loopback" then
            interfaces[#interfaces + 1] = {
                name = s[".name"],
                proto = s.proto or "",
                device = s.device or s.ifname or "",
                ipaddr = s.ipaddr or "",
                netmask = s.netmask or "",
                gateway = s.gateway or "",
                dns = s.dns or "",
                enabled = (s.disabled ~= "1")
            }
        end
    end)

    u.json_success({ interfaces = interfaces })
end

--- POST /network/interface/config/
-- Updates network interface configuration
function M.interface_config_post()
    local body = u.get_request_body()
    local uci = require("luci.model.uci").cursor()

    if body.name then
        local iface = body.name
        if body.proto then
            uci:set("network", iface, "proto", body.proto)
        end
        if body.ipaddr then
            uci:set("network", iface, "ipaddr", body.ipaddr)
        end
        if body.netmask then
            uci:set("network", iface, "netmask", body.netmask)
        end
        if body.gateway then
            uci:set("network", iface, "gateway", body.gateway)
        end
        if body.dns then
            if type(body.dns) == "table" then
                uci:set_list("network", iface, "dns", body.dns)
            else
                uci:set("network", iface, "dns", body.dns)
            end
        end

        uci:commit("network")
        os.execute("/etc/init.d/network reload >/dev/null 2>&1 &")
    end

    u.json_success({ status = "ok" })
end

--- POST /network/checkPublicNet/
-- Checks Internet connectivity by pinging external hosts
function M.check_public_net()
    local body = u.get_request_body()

    local targets = { "223.5.5.5", "114.114.114.114", "8.8.8.8" }
    local reachable = false

    for _, target in ipairs(targets) do
        if os.execute("ping -c 1 -W 3 " .. target .. " >/dev/null 2>&1") == 0 then
            reachable = true
            break
        end
    end

    -- DNS check
    local dns_ok = false
    if reachable then
        dns_ok = os.execute("nslookup www.baidu.com >/dev/null 2>&1") == 0
    end

    u.json_success({
        reachable = reachable,
        dns = dns_ok
    })
end

return M
