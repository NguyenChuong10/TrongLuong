// middleware/auth.js — Xác thực API Key để chống truy cập từ bên thứ 3
const config = require('../config')

/**
 * Middleware xác thực API Key từ Request Header hoặc Query Parameter
 */
function authenticateApiKey(req, res, next) {
  // Lấy API Key từ Header 'X-API-Key', hoặc tham số 'apiKey' / 'token' trên URL
  const apiKey = req.header('X-API-Key') || req.query.apiKey || req.query.token;

  if (!apiKey || apiKey !== config.API_KEY) {
    console.warn(`[Security] Phát hiện kết nối không hợp lệ từ IP: ${req.ip} | URL: ${req.method} ${req.url} | ApiKey nhận được: "${apiKey}" | ApiKey mong đợi: "${config.API_KEY}"`);
    return res.status(401).json({
      ok: false,
      message: 'Truy cập bị từ chối: Mã API Key không hợp lệ hoặc bị thiếu!'
    });
  }

  next();
}

module.exports = { authenticateApiKey }
