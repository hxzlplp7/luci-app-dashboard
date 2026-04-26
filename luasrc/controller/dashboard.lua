-- Dashboard Controller
-- entry({"admin","dashboard"}) -> dashboard_dispatch()
--   -> renders main.htm OR serves local JSON APIs consumed by main.htm

local http = require "luci.http"
local util = require "luci.util"
local jsonc = require "luci.jsonc"
local d = require "luci.dispatcher"
local _ = require "luci.i18n".translate

local M = {}

local DASHBOARD_CORE_URL = "http://127.0.0.1:19090"

function M.index()
    d.entry({ "admin", "dashboard" }, d.call("dashboard_dispatch"), _("Dashboard"), 0).leaf = true
    d.entry({ "admin", "dashboard", "api" }, d.call("dashboard_dispatch")).leaf = true
end

local function trim(value)
    local s = tostring(value or "")
    s = s:gsub("^%s+", "")
    s = s:gsub("%s+$", "")
    return s
end

local function shell_quote(value)
    return "'" .. tostring(value or ""):gsub("'", [['"'"']]) .. "'"
end

local function exec_trim(cmd)
    local p = io.popen(cmd .. " 2>/dev/null")
    if not p then
        return ""
    end

    local out = p:read("*a") or ""
    p:close()
    return out:gsub("%s+$", "")
end

local function check_session()
    local sdat, sid
    for _, key in ipairs({ "sysauth_https", "sysauth_http", "sysauth" }) do
        sid = http.getcookie(key)
        if sid then
            sdat = util.ubus("session", "get", { ubus_rpc_session = sid })
            if type(sdat) == "table" and
                type(sdat.values) == "table" and
                type(sdat.values.token) == "string" then
                return sid, sdat.values
            end
        end
    end
    return nil, nil
end

local function dashboard_core_error()
    return {
        code = 503,
        error = "dashboard-core unavailable",
    }
end

local function write_json(payload, status_code, status_text)
    if status_code and type(http.status) == "function" then
        http.status(status_code, status_text or "")
    end
    http.prepare_content("application/json")
    http.write(jsonc.stringify(payload or {}))
end

local function fetch_dashboard_core_databus()
    local url = DASHBOARD_CORE_URL .. "/databus"
    local commands = {
        "uclient-fetch -q -T 3 -O - " .. shell_quote(url),
        "wget -q -T 3 -O - " .. shell_quote(url),
        "curl -fsS --max-time 3 " .. shell_quote(url),
    }

    for _, command in ipairs(commands) do
        local raw = exec_trim(command)
        if raw ~= "" then
            local decoded = jsonc.parse(raw)
            if type(decoded) == "table" then
                if decoded.code == nil then
                    decoded.code = 0
                end
                if decoded.timestamp == nil then
                    decoded.timestamp = os.time()
                end
                return decoded
            end
        end
    end

    return nil
end

local function build_oaf_status_data()
    local ok, oaf = pcall(require, "luci.controller.api.oaf")
    if ok and oaf and type(oaf.get_status_data) == "function" then
        local ok_status, data = pcall(oaf.get_status_data)
        if ok_status and type(data) == "table" then
            return data
        end
    end

    return {
        success = false,
        available = false,
        engine = "",
        current_version = "",
        active_apps = {},
        class_stats = {},
    }
end

local function api_databus()
    local data = fetch_dashboard_core_databus()
    if not data then
        return write_json(dashboard_core_error(), 503, "Service Unavailable")
    end

    local oaf_status = build_oaf_status_data()

    if type(oaf_status.active_apps) == "table" and #oaf_status.active_apps > 0 then
        local online_apps = {}
        for _, app in ipairs(oaf_status.active_apps) do
            online_apps[#online_apps + 1] = {
                id = tonumber(app.id) or 0,
                name = trim(app.name or ""),
                class = trim(app.class or ""),
                class_label = trim(app.class_label or app.class or ""),
                devices = tonumber(app.devices or 0) or 0,
                last_seen = tonumber(app.last_seen or 0) or 0,
                icon = trim(app.icon or ""),
                time = tonumber(app.time or 0) or 0,
                source = "oaf",
            }
        end
        data.online_apps = {
            total = #online_apps,
            list = online_apps,
        }
        data.app_recognition = {
            available = true,
            source = "oaf",
            engine = trim(oaf_status.engine or "") ~= "" and trim(oaf_status.engine) or "OpenAppFilter",
            feature_version = trim(oaf_status.current_version or ""),
            class_stats = type(oaf_status.class_stats) == "table" and oaf_status.class_stats or {},
        }
    end

    return write_json(data)
end

local function get_backend_databus_or_error()
    local data = fetch_dashboard_core_databus()
    if not data then
        return nil, dashboard_core_error()
    end
    return data, nil
end

local function build_compat_netinfo(databus)
    local status = type(databus.status) == "table" and databus.status or {}
    local network = type(databus.network_status) == "table" and databus.network_status or {}
    local lan = type(network.lan) == "table" and network.lan or {}
    local wan = type(network.wan) == "table" and network.wan or {}
    local online = status.online and true or false

    local internet = trim(status.internet or "")
    if internet == "" then
        local network_internet = tonumber(network.internet)
        if network_internet == 0 then
            internet = "up"
        elseif network_internet == 1 then
            internet = "down"
        else
            internet = online and "up" or "down"
        end
    end

    return {
        wanStatus = (internet == "up" or online) and "up" or "down",
        wanIp = wan.ip or "",
        wanIpv6 = wan.ipv6 or "",
        lanIp = lan.ip or "",
        dns = wan.dns or lan.dns or {},
        network_uptime_raw = tonumber(network.uptime_raw or network.network_uptime_raw or 0) or 0,
        connCount = tonumber(status.conn_count or status.connCount or 0) or 0,
        interfaceName = network.interface or "",
        gateway = wan.gateway or "",
        linkUp = status.link_up and true or false,
        routeReady = status.route_ready and true or false,
        probeOk = status.probe_ok and true or false,
        onlineReason = status.online_reason or network.online_reason or "",
    }
end

local function build_compat_payload(endpoint, databus)
    if endpoint == "sysinfo" then
        return type(databus.system_status) == "table" and databus.system_status or {}
    elseif endpoint == "netinfo" then
        return build_compat_netinfo(databus)
    elseif endpoint == "traffic" then
        return type(databus.interface_traffic) == "table" and databus.interface_traffic or {}
    elseif endpoint == "devices" then
        local devices = databus.devices
        if type(devices) == "table" and type(devices.list) == "table" then
            return devices.list
        end
        return type(devices) == "table" and devices or {}
    elseif endpoint == "domains" then
        local domains = type(databus.domains) == "table" and databus.domains or {}
        if domains.realtime == nil and type(databus.realtime_urls) == "table" then
            local realtime = {}
            for _, item in ipairs(databus.realtime_urls.list or {}) do
                realtime[#realtime + 1] = {
                    domain = item.domain,
                    count = tonumber(item.count or item.hits or 0) or 0,
                }
            end
            domains.realtime = realtime
            domains.realtime_source = databus.realtime_urls.source or domains.realtime_source or "dashboard-core"
        end
        return domains
    end

    return databus
end

local function api_backend_compat(endpoint)
    local data, err = get_backend_databus_or_error()
    if not data then
        return write_json(err, 503, "Service Unavailable")
    end
    return write_json(build_compat_payload(endpoint, data))
end

local LOCAL_API = {
    sysinfo = function() return api_backend_compat("sysinfo") end,
    netinfo = function() return api_backend_compat("netinfo") end,
    traffic = function() return api_backend_compat("traffic") end,
    devices = function() return api_backend_compat("devices") end,
    domains = function() return api_backend_compat("domains") end,
    databus = api_databus,
    backend = api_databus,
    common = api_databus,
    oaf = function()
        local path = http.getenv("PATH_INFO") or ""
        local sub = path:match("/dashboard/api/oaf/([^/?#]+)")
        local ok, oaf = pcall(require, "luci.controller.api.oaf")
        if ok and oaf then
            if sub == "status" and type(oaf.action_status) == "function" then
                return oaf.action_status()
            elseif sub == "upload" and type(oaf.action_upload) == "function" then
                return oaf.action_upload()
            end
        end
        http.prepare_content("application/json")
        http.write('{"error":"OAF endpoint not found","success":false}')
    end,
}

M.dashboard_dispatch = function()
    local uri = http.getenv("REQUEST_URI") or ""
    local endpoint = uri:match("/dashboard/api/([^/?#]+)")

    if endpoint then
        local sid, _ = check_session()
        if not sid then
            http.status(403, "Forbidden")
            http.prepare_content("application/json")
            http.write('{"error":"Forbidden","code":-1001}')
            return
        end

        local h = LOCAL_API[endpoint]
        if h then
            local ok, err = pcall(h)
            if not ok then
                http.prepare_content("application/json")
                http.write(jsonc.stringify({ error = tostring(err), code = 500 }))
            end
        else
            http.prepare_content("application/json")
            http.write('{"error":"Not found","code":404}')
        end
    else
        require("luci.template").render("dashboard/main", {
            prefix = d.build_url("admin", "dashboard")
        })
    end
end

return M
