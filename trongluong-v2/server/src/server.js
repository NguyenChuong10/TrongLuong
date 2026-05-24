// server.js — entry point: tạo HTTP server, gắn Socket.io, bắt đầu lắng nghe
// Đây là file duy nhất được chạy: node src/server.js

const http = require('http')
const { Server: SocketServer } = require('socket.io')
const app = require('./app')
const config = require('./config')
const setupSocket = require('./socket')

// Tạo HTTP server từ Express app
// Cần dùng http.createServer thay vì app.listen vì Socket.io cần share cùng server
const httpServer = http.createServer(app)

// Khởi tạo Socket.io và gắn vào HTTP server
const io = new SocketServer(httpServer, {
  cors: {
    origin: config.IS_DEV ? '*' : config.ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
  },
})

// Gắn io vào app để app.js inject vào req
app.set('io', io)

// Setup socket event handlers (Bước 3)
setupSocket(io)

// Khởi chạy bộ giám sát thư mục uploads (Đồng bộ Google Drive tự động)
const { startWatcher, stopWatcher } = require('./services/watcher')
startWatcher(io)

// Bắt đầu lắng nghe
httpServer.listen(config.PORT, '0.0.0.0', () => {
  console.log(`\n✅ Server đang chạy tại:`)
  console.log(`   http://localhost:${config.PORT}`)
  console.log(`   Môi trường: ${config.NODE_ENV}`)
  console.log(`   DB: ${config.DB_PATH}`)
  console.log(`   Upload dir: ${config.UPLOAD_DIR}\n`)
})

// Graceful shutdown — đóng DB và server sạch khi Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[Server] Đang tắt...')
  
  // Tắt bộ watcher giám sát thư mục
  try {
    stopWatcher()
  } catch (err) {
    console.error('[Server] Lỗi tắt watcher:', err.message)
  }

  httpServer.close(() => {
    console.log('[Server] Đã tắt')
    process.exit(0)
  })
})