-- Dashboard NAS API
-- Handles: /nas/disk/status/, /u/nas/service/status/
-- Provides basic disk info and NAS service detection with graceful degradation

local u = require "luci.dashboard.util"
local jsonc = require "luci.jsonc"

local M = {}

--- GET /nas/disk/status/
-- Returns disk/partition information
function M.disk_status()
    local disks = {}
    local partitions = {}

    -- Use lsblk for block device info
    local lsblk_out = u.exec("lsblk -b -n -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL 2>/dev/null")
    for line in lsblk_out:gmatch("[^\n]+") do
        local name, size, devtype, fstype, mountpoint, model =
            line:match("^%s*(%S+)%s+(%S+)%s+(%S+)%s*(%S*)%s*(%S*)%s*(.*)")
        if name then
            local size_num = tonumber(size) or 0
            local size_str = ""
            if size_num >= 1099511627776 then
                size_str = string.format("%.1f TB", size_num / 1099511627776)
            elseif size_num >= 1073741824 then
                size_str = string.format("%.1f GB", size_num / 1073741824)
            elseif size_num >= 1048576 then
                size_str = string.format("%.1f MB", size_num / 1048576)
            else
                size_str = string.format("%d B", size_num)
            end

            local entry = {
                name = name,
                path = "/dev/" .. name,
                size = size_num,
                sizeStr = size_str,
                fstype = fstype or "",
                mountpoint = mountpoint or "",
                model = (model or ""):gsub("^%s+", ""):gsub("%s+$", "")
            }

            if devtype == "disk" then
                entry.type = "disk"
                -- Try to get SMART info if smartctl is available
                entry.temp = ""
                entry.health = ""
                entry.serial = ""
                entry.status = "ok"

                if u.file_exists("/usr/sbin/smartctl") then
                    local smart_out = u.exec("smartctl -A /dev/" .. name .. " 2>/dev/null")
                    local temp = smart_out:match("Temperature_Celsius%s+%S+%s+%S+%s+%S+%s+%S+%s+%S+%s+%S+%s+%S+%s+(%d+)")
                    if temp then
                        entry.temp = temp .. "°C"
                    end

                    local smart_info = u.exec("smartctl -i /dev/" .. name .. " 2>/dev/null")
                    entry.serial = smart_info:match("Serial Number:%s+(%S+)") or ""

                    local health_out = u.exec("smartctl -H /dev/" .. name .. " 2>/dev/null")
                    if health_out:match("PASSED") then
                        entry.health = "PASSED"
                    elseif health_out:match("FAILED") then
                        entry.health = "FAILED"
                        entry.status = "warning"
                    end
                end

                disks[#disks + 1] = entry
            elseif devtype == "part" then
                entry.type = "partition"
                partitions[#partitions + 1] = entry
            end
        end
    end

    -- Get df info for mounted partitions
    local df_out = u.exec("df -B1 2>/dev/null")
    local df_info = {}
    for line in df_out:gmatch("[^\n]+") do
        local dev, total, used, avail, pct, mount =
            line:match("^(%S+)%s+(%d+)%s+(%d+)%s+(%d+)%s+(%S+)%s+(%S+)")
        if dev then
            df_info[dev] = {
                total = tonumber(total) or 0,
                used = tonumber(used) or 0,
                available = tonumber(avail) or 0,
                usePercent = pct
            }
        end
    end

    -- Enrich partition data with df info
    for _, part in ipairs(partitions) do
        local info = df_info[part.path]
        if info then
            part.total = info.total
            part.used = info.used
            part.available = info.available
            part.usePercent = info.usePercent
        end
    end

    u.json_success({
        disks = disks,
        partitions = partitions
    })
end

--- GET /u/nas/service/status/
-- Returns installation and running status of common NAS services
function M.service_status()
    local function check_service(name)
        local installed = u.file_exists("/etc/init.d/" .. name)
        local running = false
        local enabled = false

        if installed then
            running = os.execute("/etc/init.d/" .. name .. " running >/dev/null 2>&1") == 0
            enabled = os.execute("/etc/init.d/" .. name .. " enabled >/dev/null 2>&1") == 0
        end

        return {
            installed = installed,
            running = running,
            enabled = enabled
        }
    end

    u.json_success({
        samba = check_service("samba4") or check_service("samba"),
        webdav = check_service("webdav"),
        nfs = check_service("nfsd"),
        ftp = check_service("vsftpd"),
        transmission = check_service("transmission"),
        aria2 = check_service("aria2"),
        qbittorrent = check_service("qbittorrent"),
        docker = check_service("dockerd"),
        minidlna = check_service("minidlna")
    })
end

return M
