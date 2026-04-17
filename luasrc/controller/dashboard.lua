local http = require("luci.http")
local dispatcher = require("luci.dispatcher")
local jsonc = require("luci.jsonc")
local session = require("luci.dashboard.session")

local PAGE_TEMPLATE = "dashboard/main"
local API_ROUTES = {
  ["GET:/overview"] = { "luci.dashboard.api.overview", "get" }
}

module("luci.controller.dashboard", package.seeall)

function index()
  entry({ "admin", "dashboard" }, call("dashboard_dispatch"), _("Dashboard"), 0).leaf = true
end

local function dispatch_api()
  local sid = session.require_session()
  if not sid then
    http.status(403, "Forbidden")
    http.prepare_content("application/json")
    http.write(jsonc.stringify({
      ok = false,
      error = {
        code = "forbidden",
        message = "forbidden"
      }
    }))
    return
  end

  local request_uri = http.getenv("REQUEST_URI") or ""
  local method = http.getenv("REQUEST_METHOD") or "GET"
  local path = request_uri:match("/admin/dashboard/api(/.*)") or "/"
  path = path:gsub("%?.*$", "")
  local route = API_ROUTES[method .. ":" .. path]

  if not route then
    http.status(404, "Not Found")
    http.prepare_content("application/json")
    http.write(jsonc.stringify({
      ok = false,
      error = {
        code = "not_found",
        message = "route not found"
      }
    }))
    return
  end

  local mod = require(route[1])
  return mod[route[2]]()
end

function dashboard_dispatch()
  local uri = http.getenv("REQUEST_URI") or ""
  if uri:match("/admin/dashboard/api") then
    return dispatch_api()
  end

  require("luci.template").render(PAGE_TEMPLATE, {
    prefix = dispatcher.build_url("admin", "dashboard")
  })
end
