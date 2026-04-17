local M = {}

local function path_exists(path)
  local f = io.open(path, "r")
  if f then
    f:close()
    return true
  end
  return false
end

function M.summary()
  local result = { top = {}, recent = {} }
  local source = "none"
  local lines = {}
  local counts = {}

  if path_exists("/tmp/openclash.log") then
    source = "openclash"
    local p = io.popen('grep -iE "dns|connect|host|sni" /tmp/openclash.log 2>/dev/null | tail -n 1000')
    if p then
      for line in p:lines() do
        local domain = line:match("-->%s*([%w%-%.]+)%:%d+")
          or line:match("%[DNS%]%s*([%w%-%.]+)")
          or line:match("host=([%w%-%.]+)")
          or line:match("sni=([%w%-%.]+)")
        if domain and domain:match("%..") and not domain:match("^%d+%.%d+%.%d+%.%d+$")
          and not domain:match("^192%.168%.") and not domain:match("^127%.")
          and not domain:match("^10%.") then
          lines[#lines + 1] = domain
        end
      end
      p:close()
    end
  else
    source = "dnsmasq"
    local p = io.popen("logread | grep -i dnsmasq | tail -n 1000")
    if p then
      for line in p:lines() do
        local domain = line:match("query%[%w+%]*%s+([%w%-%.]+)%s+from") or line:match("reply%s+([%w%-%.]+)%s+is")
        if domain and not domain:match("^%d+%.%d+%.%d+%.%d+$") and not domain:match("in%-addr%.arpa") then
          lines[#lines + 1] = domain
        end
      end
      p:close()
    end
  end

  for i = 1, #lines do
    local domain = lines[i]
    counts[domain] = (counts[domain] or 0) + 1
  end

  local sortable = {}
  for domain, count in pairs(counts) do
    sortable[#sortable + 1] = { domain = domain, count = count }
  end
  table.sort(sortable, function(a, b) return a.count > b.count end)

  for i = 1, math.min(10, #sortable) do
    result.top[#result.top + 1] = sortable[i]
  end

  local seen_recent = {}
  for i = #lines, 1, -1 do
    local domain = lines[i]
    if not seen_recent[domain] then
      seen_recent[domain] = true
      result.recent[#result.recent + 1] = { domain = domain, count = counts[domain] }
      if #result.recent >= 10 then
        break
      end
    end
  end

  if #result.top == 0 and #result.recent == 0 then
    source = "none"
  end

  return {
    source = source,
    top = result.top,
    recent = result.recent
  }
end

return M
