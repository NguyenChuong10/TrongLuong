// errorHandler.js — middleware xử lý lỗi toàn cục
// Phải được mount SAU tất cả routes trong app.js (Express quy định 4 tham số)

/**
 * Global error handler
 * Bắt mọi lỗi được next(err) từ bất kỳ route nào
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // Log lỗi ra console (dev) hoặc logger (prod)
  console.error(`[ERROR] ${req.method} ${req.url}`, err.message)
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack)
  }

  // Multer errors — file quá lớn, sai loại file...
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ ok: false, message: 'File quá lớn' })
  }

  // Lỗi có status code cụ thể (do code chủ động throw)
  const status = err.status || err.statusCode || 500
  const message = err.message || 'Lỗi server'

  res.status(status).json({
    ok: false,
    message,
    // Chỉ trả stack trace khi dev để không lộ thông tin
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

module.exports = { errorHandler }