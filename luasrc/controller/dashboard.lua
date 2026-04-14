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

-- 接口 1：系统深度信息
function api_sysinfo()
    local loadavg = sys.loadavg()
    
    -- 获取运行时间 (秒)
    local uptime_raw = 0
    local f_up = io.open("/proc/uptime", "r")
    if f_up then
        uptime_raw = tonumber(f_up:read("*all"):match("^(%d+%.%d+)")) or 0
        f_up:close()
    end
    
    -- 获取设备型号 (ubus 优先)
    local boardinfo = util.ubus("system", "board", {})
    local model = boardinfo and boardinfo.model or util.trim(sys.exec("cat /tmp/sysinfo/model 2>/dev/null"))
    if not model or model == "" then model = "Generic Device" end
    
    -- 获取固件版本
    local firmware = "Unknown"
    local f_rel = io.open("/etc/openwrt_release", "r")
    if f_rel then
        firmware = f_rel:read("*all"):match("DISTRIB_DESCRIPTION='([^']+)'") or "OpenWrt"
        f_rel:close()
    end

    -- 获取内核版本
    local kernel = util.trim(sys.exec("uname -r 2>/dev/null") or "-")

    -- 获取 CPU 温度
    local temp_raw = tonumber(util.trim(sys.exec("cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null"))) or 0
    local temp = 0
    if temp_raw > 0 then
        temp = math.floor(temp_raw / 1000)
    end

    -- 获取系统当前 Unix 时间戳
    local systime_raw = os.time()
    
    -- 内存与 CPU 负载
    local meminfo = sys.memory()
    local mem_usage = 0
    if meminfo.total > 0 then
        mem_usage = math.floor(((meminfo.total - meminfo.free) / meminfo.total) * 100)
    end
    local cpu_usage = math.min(math.floor(loadavg[1] * 100), 100)

    send_json({
        model = model,
        firmware = firmware,
        kernel = kernel,
        temp = temp,
        systime_raw = systime_raw,
        uptime_raw = math.floor(uptime_raw),
        cpuUsage = cpu_usage,
        memUsage = mem_usage
    })
end

-- 接口 2：网络接口信息 (含 DNS)
function api_netinfo()
    local wanIp, wanStatus, lanIp = "-", "down", "-"
    local network_uptime_raw = 0
    local dns_list = {}
    
    local wan_stat = util.ubus("network.interface.wan", "status", {})
    if wan_stat and wan_stat.up then
        wanStatus = "up"
        network_uptime_raw = tonumber(wan_stat.uptime) or 0
        if wan_stat["ipv4-address"] and #wan_stat["ipv4-address"] > 0 then
            wanIp = wan_stat["ipv4-address"][1].address
        end
        if wan_stat["dns-server"] then
            for _, d in ipairs(wan_stat["dns-server"]) do table.insert(dns_list, d) end
        end
    end

    -- DNS 备份读取
    if #dns_list == 0 then
        local resolv = util.execl("cat /tmp/resolv.conf.auto 2>/dev/null | grep nameserver | awk '{print $2}'")
        for _, d in ipairs(resolv) do
            table.insert(dns_list, util.trim(d))
        end
    end

    local lan_stat = util.ubus("network.interface.lan", "status", {})
    if lan_stat and lan_stat["ipv4-address"] and #lan_stat["ipv4-address"] > 0 then
        lanIp = lan_stat["ipv4-address"][1].address
    end

    send_json({
        wanStatus = wanStatus,
        wanIp = wanIp,
        lanIp = lanIp,
        dns = dns_list,
        network_uptime_raw = network_uptime_raw
    })
end

-- 接口 3：实时流量统计
function api_traffic()
    local wan_dev = util.trim(sys.exec("uci get network.wan.device 2>/dev/null") or "eth0")
    if wan_dev == "" then wan_dev = "eth0" end
    local rx_bytes = tonumber(util.trim(sys.exec("cat /sys/class/net/"..wan_dev.."/statistics/rx_bytes 2>/dev/null"))) or 0
    local tx_bytes = tonumber(util.trim(sys.exec("cat /sys/class/net/"..wan_dev.."/statistics/tx_bytes 2>/dev/null"))) or 0
    send_json({ rx_bytes = rx_bytes, tx_bytes = tx_bytes })
end

-- 接口 4：联网设备
function api_devices()
    local devices = {}
    local leases = util.execl("cat /tmp/dhcp.leases 2>/dev/null")
    local arp = util.execl("cat /proc/net/arp 2>/dev/null")
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

-- 接口 5：活跃域名
function api_domains()
    local result = {}
    local handle = io.popen("nlbwmon -c /etc/config/nlbwmon --dump -f json 2>/dev/null")
    if handle then
        local raw_json = handle:read("*a")
        handle:close()
        if raw_json and raw_json ~= "" then
            local success, parsed = pcall(jsonc.parse, raw_json)
            if success and parsed and parsed.connections then
                local counts, has_data = {}, false
                for _, conn in ipairs(parsed.connections) do
                    local domain = conn.hostname or conn.dst_ip
                    if domain and domain ~= "" and domain ~= "-" then
                        counts[domain] = (counts[domain] or 0) + (tonumber(conn.conns) or 1)
                        has_data = true
                    end
                end
                if has_data then
                    for domain, count in pairs(counts) do
                        if not domain:match("^192%.168%.") and not domain:match("^10%.") then
                            table.insert(result, { domain = domain, count = count })
                        end
                    end
                    table.sort(result, function(a, b) return a.count > b.count end)
                    local top10 = {}
                    for i = 1, math.min(10, #result) do table.insert(top10, result[i]) end
                    send_json(top10)
                    return
                end
            end
        end
    end
    send_json({})
end
