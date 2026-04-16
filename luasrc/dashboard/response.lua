local M = {}

function M.ok(data, meta)
  return {
    ok = true,
    data = data or {},
    meta = meta or {}
  }
end

function M.fail(code, message, details)
  return {
    ok = false,
    error = {
      code = code or "unknown_error",
      message = message or "unknown error",
      details = details or {}
    }
  }
end

return M
