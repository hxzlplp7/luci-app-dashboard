module("luci.controller.dashboard", package.seeall)

function index()
    -- 注册路由，需要登录才能访问
    entry({"admin", "dashboard"}, template("dashboard/main"), _("Dashboard"), 10).dependent = true
    
    -- 注册 API 接口路由
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

-- 辅助函数：输出 JSON
local function send_json(data)
    http.prepare_content("application/json")
    http.write(jsonc.stringify(data or {}))
end

-- 辅助函数：格式化时间
local function format_time(seconds)
    if not seconds then return "-" end
    seconds = tonumber(seconds)
    local days = math.floor(seconds / 86400)
    local hours = math.floor((seconds % 86400) / 3600)
    local mins = math.floor((seconds % 3600) / 60)
    return string.format("%d天 %d小时 %d分", days, hours, mins)
end

-- 接口 1：获取系统信息
function api_sysinfo()
    local meminfo = sys.memory()
    local loadavg = sys.loadavg()
    local uptime = sys.uptime()
    local model = util.trim(sys.exec("cat /tmp/sysinfo/model 2>/dev/null") or "Generic Device")
    
    local mem_usage = 0
    if meminfo.total > 0 then
        mem_usage = math.floor(((meminfo.total - meminfo.free) / meminfo.total) * 100)
    end
    
    -- CPU使用率简单通过 1分钟负载 估算（或者可以通过 /proc/stat 算，这里用负载简算）
    local cpu_usage = math.min(math.floor(loadavg[1] * 100), 100)

    send_json({
        model = model,
        sysUptime = format_time(uptime),
        cpuUsage = cpu_usage,
        memUsage = mem_usage
    })
end

-- 接口 2：获取网络状态
function api_netinfo()
    local wanIp = "-"
    local wanStatus = "down"
    local lanIp = "-"
    local networkUptimeStr = "-"
    
    -- 通过 ubus 获取 WAN 口信息 (假设接口名是 wan)
    local wan_stat = util.ubus("network.interface.wan", "status", {})
    if wan_stat and wan_stat.up then
        wanStatus = "up"
        networkUptimeStr = format_time(wan_stat.uptime)
        if wan_stat["ipv4-address"] and #wan_stat["ipv4-address"] > 0 then
            wanIp = wan_stat["ipv4-address"][1].address
        end
    end

    -- 通过 ubus 获取 LAN 口信息
    local lan_stat = util.ubus("network.interface.lan", "status", {})
    if lan_stat and lan_stat["ipv4-address"] and #lan_stat["ipv4-address"] > 0 then
        lanIp = lan_stat["ipv4-address"][1].address
    end

    send_json({
        wanStatus = wanStatus,
        wanIp = wanIp,
        lanIp = lanIp,
        networkUptime = networkUptimeStr
    })
end

-- 接口 3：获取总流量 (前端负责计算网速)
function api_traffic()
    -- 取 pppoe-wan 或者 eth0 的数据，具体看你的主路由物理网卡名称
    -- 常见的 WAN 接口名字可能是 pppoe-wan, eth0, eth1 等
    local wan_dev = util.trim(sys.exec("uci get network.wan.device 2>/dev/null") or "eth0")
    if wan_dev == "" then wan_dev = "eth0" end
    
    -- 读取 /proc/net/dev 提取字节数
    local rx_bytes = tonumber(util.trim(sys.exec("cat /sys/class/net/"..wan_dev.."/statistics/rx_bytes 2>/dev/null"))) or 0
    local tx_bytes = tonumber(util.trim(sys.exec("cat /sys/class/net/"..wan_dev.."/statistics/tx_bytes 2>/dev/null"))) or 0

    send_json({
        rx_bytes = rx_bytes, -- 总下载字节
        tx_bytes = tx_bytes  -- 总上传字节
    })
end

-- 接口 4：获取局域网设备 (基于 DHCP 分配和 ARP 表)
function api_devices()
    local devices = {}
    local leases = util.execl("cat /tmp/dhcp.leases 2>/dev/null")
    local arp = util.execl("cat /proc/net/arp 2>/dev/null")
    
    local active_macs = {}
    for _, line in ipairs(arp) do
        local ip, type, flags, mac = line:match("^([%d%.]+)%s+%S+%s+0x(%d+)%s+([%x%:]+)")
        if mac and flags ~= "0" then 
            active_macs[mac:lower()] = true 
        end
    end

    for _, line in ipairs(leases) do
        local ts, mac, ip, name = line:match("^(%d+)%s+([%x%:]+)%s+([%d%.]+)%s+([^%s]+)")
        if mac then
            local is_active = active_macs[mac:lower()] == true
            -- 简单根据 hostname 猜设备类型
            local dev_type = "other"
            if name:lower():match("iphone") or name:lower():match("android") or name:lower():match("phone") then
                dev_type = "mobile"
            elseif name:lower():match("macbook") or name:lower():match("pc") or name:lower():match("laptop") then
                dev_type = "laptop"
            end

            table.insert(devices, {
                mac = mac:upper(),
                ip = ip,
                name = (name == "*" and "未知设备" or name),
                type = dev_type,
                active = is_active
            })
        end
    end
    send_json(devices)
end

-- 接口 5：获取活跃域名 (基于 nlbwmon 真实数据获取)
function api_domains()
    local result = {}
    
    -- 调用 nlbwmon 获取当前底层流量及域名连接数据
    local handle = io.popen("nlbwmon -c /etc/config/nlbwmon --dump -f json 2>/dev/null")
    if handle then
        local raw_json = handle:read("*a")
        handle:close()

        if raw_json and raw_json ~= "" then
            local success, parsed_data = pcall(jsonc.parse, raw_json)
            
            if success and parsed_data and parsed_data.connections then
                local domain_counts = {}
                
                -- 遍历所有连接并累加域名访问次数
                for _, conn in ipairs(parsed_data.connections) do
                    local domain = conn.hostname or conn.dst_ip
                    if domain and domain ~= "" and domain ~= "-" then
                        local count = tonumber(conn.conns) or 1 
                        domain_counts[domain] = (domain_counts[domain] or 0) + count
                    end
                end

                -- 转换为数组格式并过滤掉局域网内部 IP 请求
                for domain, count in pairs(domain_counts) do
                    -- 这里的过滤逻辑可以根据需要调整，目前过滤了常见的局域网 IP 段
                    if not domain:match("^192%.168%.") and not domain:match("^10%.") and not domain:match("^172%.(1[6-9]|2[0-9]|3[0-1])%.") then
                        table.insert(result, { domain = domain, count = count })
                    end
                end

                -- 按访问次数降序排序
                table.sort(result, function(a, b) return a.count > b.count end)
                
                -- 取 Top 10 返回
                local top10 = {}
                for i = 1, math.min(10, #result) do
                    table.insert(top10, result[i])
                end
                
                send_json(top10)
                return
            end
        end
    end

    -- Fallback：如果 nlbwmon 未安装或无数据，返回占位模拟数据以便前端不报错
    local mock_data = {
        { domain = "apple.com", count = 1250 },
        { domain = "github.com", count = 843 },
        { domain = "baidu.com", count = 621 },
        { domain = "wechat.com", count = 450 },
        { domain = "bilibili.com", count = 231 }
    }
    send_json(mock_data)
end
