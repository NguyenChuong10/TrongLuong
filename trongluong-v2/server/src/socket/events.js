// socket/events.js — các hàm emit event có tên rõ ràng
// Routes và services gọi các hàm này thay vì gọi io.emit trực tiếp
// → dễ tìm tất cả chỗ emit, dễ đổi tên event sau này

/**
 * Thông báo tiến độ upload cho client đang xem đơn hàng đó
 * @param {import('socket.io').Server} io
 * @param {string} orderId
 * @param {{ fileName: string, progress: number }} payload
 */
function emitUploadProgress(io, orderId, payload) {
  io.to(`order:${orderId}`).emit('upload_progress', {
    orderId,
    ...payload,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Thông báo upload hoàn tất
 * @param {import('socket.io').Server} io
 * @param {string} orderId
 * @param {{ fileId: string, fileName: string }} payload
 */
function emitUploadDone(io, orderId, payload) {
  io.to(`order:${orderId}`).emit('upload_done', {
    orderId,
    ...payload,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Thông báo trạng thái server cho tất cả client
 * Desktop dùng để hiển thị indicator "Server đang chạy"
 * @param {import('socket.io').Server} io
 * @param {'online' | 'busy' | 'error'} status
 */
function emitServerStatus(io, status) {
  io.emit('server_status', {
    status,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Thông báo đơn hàng bị cập nhật (trangThai, soKy...)
 * @param {import('socket.io').Server} io
 * @param {string} orderId
 * @param {object} changes
 */
function emitOrderUpdated(io, orderId, changes) {
  io.to(`order:${orderId}`).emit('order_updated', {
    orderId,
    changes,
    timestamp: new Date().toISOString(),
  })
}

module.exports = {
  emitUploadProgress,
  emitUploadDone,
  emitServerStatus,
  emitOrderUpdated,
}