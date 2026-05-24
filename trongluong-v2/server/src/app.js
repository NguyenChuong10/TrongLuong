// app.js — khởi tạo Express, mount middleware và routes
// Tách khỏi server.js để dễ test (có thể import app mà không cần listen)

const express = require('express')
const cors = require('cors')
const path = require('path')
const config = require('./config')
const { errorHandler } = require('./middleware/errorHandler')
const { authenticateApiKey } = require('./middleware/auth')


// Routes
const ordersRouter = require('./routes/orders')
const uploadRouter = require('./routes/upload')
const systemRouter = require('./routes/system')
const usersRouter = require('./routes/users')

const app = express()

// ── Middleware toàn cục ──────────────────────────────────────────────────────

// CORS — cho phép app mobile và desktop kết nối
app.use(cors({
  origin: config.IS_DEV
    ? true                        // dev: cho phép mọi origin
    : config.ALLOWED_ORIGINS,     // prod: chỉ cho phép origin trong .env
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}))

// Parse JSON body — giới hạn 10mb phòng tràn bộ nhớ
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Serve file tĩnh từ uploads/ — bảo vệ bằng API Key chống truy cập lậu
app.use('/uploads', authenticateApiKey, express.static(path.resolve(config.UPLOAD_DIR)))


// ── Routes ───────────────────────────────────────────────────────────────────

// Inject io vào req để routes có thể emit socket events
app.use((req, res, next) => {
  req.io = app.get('io')
  next()
})

// Bảo vệ toàn bộ API bằng API Key
app.use('/api', authenticateApiKey)
app.use('/api/orders', ordersRouter)
app.use('/api/orders/:maVanDon/files', uploadRouter)
app.use('/api/users', usersRouter)
app.use('/api', systemRouter)


// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, message: `Không tìm thấy route: ${req.method} ${req.url}` })
})

// ── Global error handler — phải đứng CUỐI CÙNG ──────────────────────────────
app.use(errorHandler)

module.exports = app