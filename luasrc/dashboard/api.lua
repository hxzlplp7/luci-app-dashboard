-- Dashboard API Logic
-- 专注于高性能、鲁棒性数据采集

local u = require "luci.dashboard.util"
local util = require "luci.util"
local jsonc = require "luci.jsonc"
local fs = require "nixio.fs"

local M = {}

local TRAFFIC_STATE_FILE = "/tmp/dashboard_traffic.json"
local TRAFFIC_SLOTS = 30

--- 动态探测活动中的 WAN 设备
local function get_active_wan_dev()
    -- 方案 A: 优先检查标准 wan 接口
    local status = util.ubus("network.interface.wan", "status")
    if status and status.up and (status.l3_device or status.device) then
        return status.l3_device or status.device
    end

    -- 方案 B: 遍历所有接口，寻找默认路由或 common WAN names
    local dump = util.ubus("network.interface", "dump")
    if dump and dump.interface then
        for _, intf in ipairs(dump.interface) do
            if intf.up and (intf.interface == "wan" or intf.interface == "wwan" or intf.data.default_route) then
                return intf.l3_device or intf.device
            end
        end
    end

    -- 方案 C: 最后的保底措施 (查找 pppoe-wan 或第一个非 lo, 非 br 设备)
    local dev_list = u.read_file_all("/proc/net/dev") or ""
    local first_dev = dev_list:match("\n%s*([^%s:]+):")
    return first_dev or "eth0"
end

function M.get_system_status()
    local result = {}
    local uptime_str = u.read_file("/proc/uptime") or "0"
    result.uptime = math.floor(tonumber(uptime_str:match("^(%S+)")) or 0)

    local loadavg = u.read_file("/proc/loadavg") or "0 0 0"
    local load1 = tonumber(loadavg:match("^(%S+)")) or 0
    local cpus = 1
    local cpuinfo = u.read_file_all("/proc/cpuinfo") or ""
    local _, count = cpuinfo:gsub("processor%s*:", "")
    cpus = count > 0 and count or 1
    result.cpu_usage = math.min(100, math.floor(load1 * 100 / cpus))

    local meminfo = u.read_file_all("/proc/meminfo") or ""
    local m_total = tonumber(meminfo:match("MemTotal:%s+(%d+)")) or 1
    local m_avail = tonumber(meminfo:match("MemAvailable:%s+(%d+)")) or 
                    tonumber(meminfo:match("MemFree:%s+(%d+)")) or 0
    result.mem_usage = math.floor(((m_total - m_avail) * 100) / m_total)

    u.json_success(result)
end

function M.get_network_status()
    local result = {}
    local status = util.ubus("network.interface.wan", "status") or {}
    result.ip = (status["ipv4-address"] and status["ipv4-address"][1]) and status["ipv4-address"][1].address or "N/A"
    result.proto = status.proto or "unknown"
    
    local f = io.open("/tmp/public_ip.txt", "r")
    result.public_ip = f and f:read("*a"):gsub("%s+$", "") or "Detecting..."
    if f then f:close() end

    u.json_success(result)
end

function M.get_traffic()
    local dev = get_active_wan_dev()
    local now = os.time()
    
    -- 获取网口原生统计 (字节)
    local rx_bytes, tx_bytes = 0, 0
    local dev_stats = u.read_file_all("/proc/net/dev") or ""
    local line = dev_stats:match("\n%s*" .. dev .. ":%s*(%d+)%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+(%d+)")
    if line then
        rx_bytes, tx_bytes = tonumber(line:match("(%d+)%s+(%d+)"))
    end

    -- 基于 nlbwmon 的深度统计
    local nlbw_data = jsonc.parse(u.exec("nlbw -c json 2>/dev/null") or "[]") or {}
    local domains, types, total_rx, total_tx = {}, {}, 0, 0

    for _, e in ipairs(nlbw_data) do
        local rx, tx = tonumber(e.rx_bytes) or 0, tonumber(e.tx_bytes) or 0
        total_rx, total_tx = total_rx + rx, total_tx + tx
        local host = (e.hostname ~= "" and e.hostname) or e.ip or "Unknown"
        domains[host] = (domains[host] or 0) + rx + tx
        local fam = e.family or "Other"
        types[fam] = (types[fam] or 0) + rx + tx
    end

    local top_domains = {}
    for k, v in pairs(domains) do table.insert(top_domains, {name = k, value = v}) end
    table.sort(top_domains, function(a, b) return a.value > b.value end)
    local final_domains = {}
    for i = 1, math.min(5, #top_domains) do table.insert(final_domains, top_domains[i]) end

    local type_dist = {}
    for k, v in pairs(types) do table.insert(type_dist, {name = k, value = v}) end

    -- 实时网速存根
    local raw = u.read_file_all(TRAFFIC_STATE_FILE)
    local state = (raw and jsonc.parse(raw)) or { items = {} }
    local items = state.items or {}
    local speed_rx, speed_tx = 0, 0

    if state.time and now > state.time then
        local dt = now - state.time
        speed_rx = math.max(0, (rx_bytes - (state.rx or 0)) / dt)
        speed_tx = math.max(0, (tx_bytes - (state.tx or 0)) / dt)
        table.insert(items, {time = now, rx = speed_rx, tx = speed_tx})
        if #items > TRAFFIC_SLOTS then table.remove(items, 1) end
    end

    u.write_to_file(TRAFFIC_STATE_FILE, jsonc.stringify({
        time = now, rx = rx_bytes, tx = tx_bytes, items = items
    }))

    u.json_success({
        speed = { rx = speed_rx, tx = speed_tx },
        history = items,
        top_domains = final_domains,
        traffic_types = type_dist,
        totals = { rx = total_rx, tx = total_tx },
        active_dev = dev
    })
end

return M
