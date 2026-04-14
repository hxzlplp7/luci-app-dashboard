module("luci.controller.dashboard", package.seeall)

function index()
    -- 路由注册，确保解决 404 问题，直接指向主模板
    entry({"admin", "dashboard"}, template("dashboard/main"), _("Dashboard"), 10).dependent = true
    
    -- API 接口路由
    entry({"admin", "dashboard", "api", "sysinfo"}, call("api_sysinfo"))
    entry({"admin", "dashboard", "api", "netinfo"}, call("api_netinfo"))
    entry({"admin", "dashboard", "api", "traffic"}, call("api_traffic"))
    entry({"admin", "dashboard", "api", "devices"}, call("api_devices"))
    entry({"admin", "dashboard", "api", "domains"}, call("api_domains"))
end

local http = require "luci.http"
local jsonc = require "luci.jsonc"
local sys = require "luci.sys"
local util = require "luci.util"

local function send_json(data)
    http.prepare_content("application/json")
    http.write(jsonc.stringify(data or {}))
end

function api_sysinfo()
    local loadavg = sys.loadavg() or {0, 0, 0}
    
    local uptime_raw = 0
    local f_up = io.open("/proc/uptime", "r")
    if f_up then
        local c = f_up:read("*all")
        if c then uptime_raw = tonumber(c:match("^(%d+%.%d+)")) or 0 end
        f_up:close()
    end
    
    -- 获取设备型号: 综合多种方式，加入对 device-tree 的读取 (针对你的 NanoPi R4S)
    local model = ""
    local boardinfo = util.ubus("system", "board", {})
    if type(boardinfo) == "table" and boardinfo.model then model = boardinfo.model end
    if model == "" then model = util.trim(sys.exec("cat /tmp/sysinfo/model 2>/dev/null") or "") end
    if model == "" then model = util.trim(sys.exec("cat /proc/device-tree/model 2>/dev/null | tr -d '\\0'") or "") end
    if model == "" then model = "Generic Device" end
    
    local firmware = "Unknown"
    local f_rel = io.open("/etc/openwrt_release", "r")
    if f_rel then
        local c = f_rel:read("*all")
        if c then firmware = c:match("DISTRIB_DESCRIPTION='([^']+)'") or "OpenWrt" end
        f_rel:close()
    end

    local kernel = util.trim(sys.exec("uname -r 2>/dev/null") or "-")
    
    -- 安全获取 CPU 温度
    local temp_str = util.trim(sys.exec("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null") or "")
    local temp_raw = tonumber(temp_str) or 0
    local temp = temp_raw > 0 and math.floor(temp_raw / 1000) or 0
    local systime_raw = os.time()
    
    -- 安全获取内存信息
    local meminfo = sys.memory() or {}
    local m_tot = tonumber(meminfo.total) or 0
    local m_free = tonumber(meminfo.free) or 0
    local mem_usage = m_tot > 0 and math.floor(((m_tot - m_free) / m_tot) * 100) or 0
    
    -- 安全获取负载
    local cpu_usage = loadavg[1] and math.min(math.floor(tonumber(loadavg[1]) * 100), 100) or 0

    send_json({
        model = model, firmware = firmware, kernel = kernel, temp = temp,
        systime_raw = systime_raw, uptime_raw = math.floor(uptime_raw),
        cpuUsage = cpu_usage, memUsage = mem_usage
    })
end

function api_netinfo()
    local wanIp, wanStatus, lanIp = "-", "down", "-"
    local network_uptime_raw = 0
    local dns_list = {}
    
    local wan_stat = util.ubus("network.interface.wan", "status", {})
    if wan_stat and type(wan_stat) == "table" and wan_stat.up then
        wanStatus = "up"
        network_uptime_raw = tonumber(wan_stat.uptime) or 0
        if wan_stat["ipv4-address"] and #wan_stat["ipv4-address"] > 0 then
            wanIp = wan_stat["ipv4-address"][1].address
        end
        if wan_stat["dns-server"] then
            for _, d in ipairs(wan_stat["dns-server"]) do table.insert(dns_list, d) end
        end
    end

    if #dns_list == 0 then
        local resolv = util.execl("cat /tmp/resolv.conf.auto 2>/dev/null | grep nameserver | awk '{print $2}'")
        if resolv then
            for _, d in ipairs(resolv) do table.insert(dns_list, util.trim(d)) end
        end
    end

    local lan_stat = util.ubus("network.interface.lan", "status", {})
    if lan_stat and type(lan_stat) == "table" and lan_stat["ipv4-address"] and #lan_stat["ipv4-address"] > 0 then
        lanIp = lan_stat["ipv4-address"][1].address
    end

    send_json({ wanStatus = wanStatus, wanIp = wanIp, lanIp = lanIp, dns = dns_list, network_uptime_raw = network_uptime_raw })
end

function api_traffic()
    local wan_dev = util.trim(sys.exec("uci get network.wan.device 2>/dev/null") or "eth0")
    if wan_dev == "" then wan_dev = "eth0" end
    local rx_bytes = tonumber(util.trim(sys.exec("cat /sys/class/net/"..wan_dev.."/statistics/rx_bytes 2>/dev/null"))) or 0
    local tx_bytes = tonumber(util.trim(sys.exec("cat /sys/class/net/"..wan_dev.."/statistics/tx_bytes 2>/dev/null"))) or 0
    send_json({ rx_bytes = rx_bytes, tx_bytes = tx_bytes })
end

function api_devices()
    local devices = {}
    local leases = util.execl("cat /tmp/dhcp.leases 2>/dev/null") or {}
    local arp = util.execl("cat /proc/net/arp 2>/dev/null") or {}
    
    local active_macs = {}
    for _, line in ipairs(arp) do
        local ip, type, flags, mac = line:match("^([%d%.]+)%s+%S+%s+0x(%d+)%s+([%x%:]+)")
        if mac and flags ~= "0" then active_macs[mac:lower()] = true end
    end
    for _, line in ipairs(leases) do
        local ts, mac, ip, name = line:match("^(%d+)%s+([%x%:]+)%s+([%d%.]+)%s+([^%s]+)")
        if mac then
            local is_active = active_macs[mac:lower()] == true
            local dev_type = "other"
            if name:lower():match("iphone") or name:lower():match("android") or name:lower():match("phone") then dev_type = "mobile"
            elseif name:lower():match("macbook") or name:lower():match("pc") or name:lower():match("laptop") then dev_type = "laptop" end
            table.insert(devices, { mac = mac:upper(), ip = ip, name = (name == "*" and "Unknown" or name), type = dev_type, active = is_active })
        end
    end
    send_json(devices)
end

function api_domains()
    local result = {}
    local source = "none"

    -- 尝试 1：nlbwmon (域名模式)
    local handle = io.popen("nlbwmon -c /etc/config/nlbwmon --dump -f json 2>/dev/null")
    if handle then
        local raw_json = handle:read("*a")
        handle:close()
        if raw_json and raw_json ~= "" then
            local success, parsed = pcall(jsonc.parse, raw_json)
            if success and parsed and type(parsed.connections) == "table" then
                local counts = {}
                for _, conn in ipairs(parsed.connections) do
                    local domain = conn.hostname or conn.dst_ip
                    if domain and domain ~= "" and domain ~= "-" then
                        counts[domain] = (counts[domain] or 0) + (tonumber(conn.conns) or 1)
                    end
                end
                for domain, count in pairs(counts) do
                    if not domain:match("^192%.168%.") and not domain:match("^10%.") and not domain:match("^127%.") then
                        table.insert(result, { domain = domain, count = count })
                    end
                end
                if #result > 0 then source = "nlbwmon" end
            end
        end
    end

    -- 尝试 2：原生内核连接追踪 nf_conntrack (公网 IP 模式)
    if source == "none" then
        local cmd = "cat /proc/net/nf_conntrack 2>/dev/null | grep -Eo 'dst=([0-9\\.]+)' | awk -F'=' '{print $2}' | grep -v '^192\\.168\\.' | grep -v '^127\\.' | grep -v '^10\\.' | sort | uniq -c | sort -nr | head -n 10"
        local p = io.popen(cmd)
        if p then
            for line in p:lines() do
                local count, ip = line:match("%s*(%d+)%s+(%S+)")
                if count and ip then
                    table.insert(result, { domain = ip, count = tonumber(count) })
                end
            end
            p:close()
            if #result > 0 then source = "conntrack" end
        end
    end

    if #result > 0 then
        table.sort(result, function(a, b) return a.count > b.count end)
        local top10 = {}
        for i = 1, math.min(10, #result) do table.insert(top10, result[i]) end
        send_json({ source = source, list = top10 })
    else
        send_json({ source = "none", list = {} })
    end
end
