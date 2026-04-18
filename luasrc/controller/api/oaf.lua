-- 修复已废弃的 module 函数及未定义全局变量警告
local fs = require "nixio.fs"
local http = require "luci.http"
local sys = require "luci.sys"
local json = require "luci.jsonc"
local d = require "luci.dispatcher"

-- 定义模块表（兼容 Lua 5.1/5.4）
local M = {}

function M.index()
    -- 使用 luci.dispatcher 的明确引用来定义 API 路由
    d.entry({"api", "oaf", "status"}, d.call("action_status"), nil).sysauth = true
    d.entry({"api", "oaf", "upload"}, d.call("action_upload"), nil).sysauth = true
end

-- 导出 action 函数供控制器调度使用
M.action_status = function()
    http.prepare_content("application/json")
    
    local version = fs.readfile("/etc/appfilter/version.txt")
    if not version then version = "20240101 (内置)" end
    
    local response = {
        status = "running",
        current_version = string.gsub(version, "\n", ""),
        engine = "OpenAppFilter v6.1.5",
        last_update = os.date("%Y-%m-%d %H:%M:%S")
    }
    
    http.write(json.stringify(response))
end

M.action_upload = function()
    local tmp_file = "/tmp/oaf_feature_upload.bin"
    
    http.setfilehandler(
        function(meta, chunk, eof)
            if not meta then return end
            if meta.name == "file" then
                local fp = io.open(tmp_file, chunk and "a" or "w")
                if fp and chunk then
                    fp:write(chunk)
                    fp:close()
                end
            end
        end
    )

    local file_upload = http.formvalue("file")
    http.prepare_content("application/json")

    if fs.access(tmp_file) then
        sys.call("cp /tmp/oaf_feature_upload.bin /etc/appfilter/feature.bin")
        sys.call("/etc/init.d/oaf restart >/dev/null 2>&1")
        
        local filename = "新版本"
        if type(file_upload) == "string" and file_upload ~= "" then 
            filename = file_upload 
        end
        fs.writefile("/etc/appfilter/version.txt", filename)
        fs.unlink(tmp_file)
        
        http.write(json.stringify({
            success = true,
            message = "特征库已更新，OAF 服务重启成功！"
        }))
    else
        http.write(json.stringify({
            success = false,
            message = "上传失败，未接收到文件数据。"
        }))
    end
end

-- 返回模块表 (LuCI 调度器通过此表获取 index 和 action)
return M
