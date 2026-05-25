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


// ── Google OAuth2 Setup & Automatic Configuration ───────────────────────────
// Khi chưa có GOOGLE_REFRESH_TOKEN, server sẽ mở route này để user click link đăng nhập
app.get('/auth', (req, res) => {
  const { google } = require('googleapis')
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return res.status(400).send(`
      <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: auto; text-align: center; background: #fff0f0; border-radius: 12px; margin-top: 10vh; border: 1px solid #ffcccc;">
        <h2 style="color: #d32f2f;">Thiếu thông tin Client ID hoặc Client Secret!</h2>
        <p>Vui lòng điền <b>GOOGLE_CLIENT_ID</b> và <b>GOOGLE_CLIENT_SECRET</b> vào file <code>server/.env</code> trước khi bắt đầu liên kết tài khoản.</p>
      </div>
    `)
  }

  const oauth2Client = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    `http://localhost:${config.PORT}/oauth2callback`
  )

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent' // Force getting refresh token
  })

  res.redirect(authUrl)
})

app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query
  if (!code) {
    return res.status(400).send('Không nhận được mã xác thực (Auth Code) từ Google.')
  }

  try {
    const { google } = require('googleapis')
    const fs = require('fs')
    const oauth2Client = new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      `http://localhost:${config.PORT}/oauth2callback`
    )

    const { tokens } = await oauth2Client.getToken(code)
    const refreshToken = tokens.refresh_token

    if (!refreshToken) {
      return res.status(400).send(`
        <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: auto; text-align: center; background: #fffde7; border-radius: 12px; margin-top: 10vh; border: 1px solid #ffe082;">
          <h2 style="color: #f57f17;">Không nhận được Refresh Token mới!</h2>
          <p>Tài khoản của bạn đã được liên kết trước đó. Để lấy Refresh Token mới, vui lòng vào <a href="https://myaccount.google.com/permissions" target="_blank">Cài đặt tài khoản Google</a>, xóa ứng dụng <b>TrongLuong Sync</b> đi và thử đăng nhập lại.</p>
        </div>
      `)
    }

    // 🌟 Ghi tự động vào file .env
    const envPath = path.resolve(__dirname, '../.env')
    let envContent = fs.readFileSync(envPath, 'utf8')

    // Nếu đã có dòng GOOGLE_REFRESH_TOKEN thì thay thế, nếu chưa thì thêm vào cuối
    if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
      envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/g, `GOOGLE_REFRESH_TOKEN=${refreshToken}`)
    } else {
      envContent += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}\n`
    }

    fs.writeFileSync(envPath, envContent, 'utf8')

    // Cập nhật cấu hình runtime ngay lập tức
    config.GOOGLE_REFRESH_TOKEN = refreshToken

    res.send(`
      <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: auto; text-align: center; background: #e8f5e9; border-radius: 12px; margin-top: 10vh; border: 1px solid #c8e6c9;">
        <h2 style="color: #2e7d32;">Liên kết Google Drive thành công! 🎉</h2>
        <p>Hệ thống đã tự động lưu khóa <b>Refresh Token</b> vào file <code>.env</code>.</p>
        <p style="margin-top: 1.5rem; font-weight: bold; color: #1b5e20;">👉 Vui lòng khởi động lại Server trong cửa sổ dòng lệnh để hoàn tất kích hoạt!</p>
      </div>
    `)
  } catch (err) {
    console.error('❌ [OAuth2 Callback] Lỗi xác thực hoặc ghi file .env:', err.message)
    res.status(500).send(`Lỗi liên kết Google Drive: ${err.message}`)
  }
})

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