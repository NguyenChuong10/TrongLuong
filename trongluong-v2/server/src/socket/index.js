// socket/index.js — setup Socket.io connection và event handlers
// Được gọi từ server.js sau khi tạo io instance

const config = require('../config')
const { emitServerStatus } = require('./events')

/**
 * @param {import('socket.io').Server} io
 */
function setupSocket(io) {
  // Gắn io vào mọi request để routes có thể dùng req.io
  // (middleware Express không có cách khác truyền io vào)
  io.engine.on('connection_error', (err) => {
    console.error('[Socket] Connection error:', err.message)
  })

  // Lớp bảo mật kết nối WebSocket chống bên thứ 3
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || 
                  socket.handshake.headers['x-api-key'] || 
                  socket.handshake.query?.token;
                  
    if (token && token === config.API_KEY) {
      return next();
    }
    
    console.warn(`[Socket Security] Từ chối kết nối Socket lạ từ ID: ${socket.id} (IP: ${socket.handshake.address})`);
    return next(new Error('Xác thực thất bại: Mã API Key không hợp lệ hoặc bị thiếu!'));
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client kết nối: ${socket.id}`)

    // ── join_order ─────────────────────────────────────────────────────────
    // Client (app hoặc desktop) join vào "phòng" của 1 đơn hàng
    // → chỉ nhận event của đơn hàng đó thôi, không nhận của đơn khác
    socket.on('join_order', (orderId) => {
      const room = `order:${orderId}`
      socket.join(room)
      console.log(`[Socket] ${socket.id} joined room: ${room}`)
      socket.emit('joined', { room, orderId })
    })

    // ── leave_order ────────────────────────────────────────────────────────
    socket.on('leave_order', (orderId) => {
      const room = `order:${orderId}`
      socket.leave(room)
      console.log(`[Socket] ${socket.id} left room: ${room}`)
    })

    // ── ping/pong — để client kiểm tra kết nối còn sống không ─────────────
    socket.on('ping_server', () => {
      socket.emit('pong_server', { timestamp: new Date().toISOString() })
    })

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client ngắt kết nối: ${socket.id} — ${reason}`)
    })
  })

  // Emit server_status ngay khi socket setup xong — client biết server online
  setTimeout(() => emitServerStatus(io, 'online'), 500)

  console.log('[Socket] Socket.io đã sẵn sàng')

  return io
}

module.exports = setupSocket