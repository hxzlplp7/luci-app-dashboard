-- Dashboard shared utilities
-- Provides JSON response helpers and common functions

local http = require "luci.http"
local jsonc = require "luci.jsonc"
local util = require "luci.util"

local M = {}

--- Send a successful JSON response
-- @param data table Result data to return
function M.json_success(data)
    http.prepare_content("application/json")
    http.write(jsonc.stringify({
        success = 200,
        result = data or {}
    }))
end

--- Send an error JSON response
-- @param code number Error code (e.g. 0, 500, -1001)
-- @param msg string Error message
function M.json_error(code, msg)
    http.prepare_content("application/json")
    http.write(jsonc.stringify({
        success = code or 0,
        error = msg or "error"
    }))
end

--- Read and parse JSON request body
-- @return table Parsed JSON body or empty table
function M.get_request_body()
    local len = tonumber(http.getenv("CONTENT_LENGTH")) or 0
    if len <= 0 then return {} end

    local raw = ""
    local src = http.source()
    if src then
        while true do
            local chunk = src()
            if not chunk then break end
            raw = raw .. chunk
        end
    end

    if raw ~= "" then
        return jsonc.parse(raw) or {}
    end
    return {}
end

--- Validate user session, return sid and session data
-- @return string|nil sid
-- @return table|nil sdat
function M.check_session()
    local sdat
    local sid
    for _, key in ipairs({"sysauth_https", "sysauth_http", "sysauth"}) do
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

--- Read a single line from a file
-- @param path string File path
-- @return string|nil Content or nil
function M.read_file(path)
    local f = io.open(path, "r")
    if f then
        local content = f:read("*l")
        f:close()
        return content
    end
    return nil
end

--- Read entire file content
-- @param path string File path
-- @return string|nil Content or nil
function M.read_file_all(path)
    local f = io.open(path, "r")
    if f then
        local content = f:read("*a")
        f:close()
        return content
    end
    return nil
end

--- Execute a command and return its output
-- @param cmd string Shell command
-- @return string Output
function M.exec(cmd)
    local p = io.popen(cmd .. " 2>/dev/null")
    if p then
        local output = p:read("*a") or ""
        p:close()
        return output
    end
    return ""
end

--- Check if a file/path exists
-- @param path string File path
-- @return boolean
function M.file_exists(path)
    local f = io.open(path, "r")
    if f then
        f:close()
        return true
    end
    return false
end

return M
