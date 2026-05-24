// routes/system.js — health check + drive status
// Mount tại: /api

const express = require('express')
const os = require('os')
const fs = require('fs')
const config = require('../config')
const driveService = require('../services/drive')

const router = express.Router()

// ── GET /api/health ──────────────────────────────────────────────────────────
// App mobile ping endpoint này để biết server có online không
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()), // giây
    hostname: os.hostname(),
  })
})

// ── GET /api/drive/status ────────────────────────────────────────────────────
// Kiểm tra thư mục upload có accessible không + lấy thông tin Google Drive
// Desktop dùng endpoint này để hiển thị trạng thái ổ đĩa và đồng bộ
router.get('/drive/status', async (req, res) => {
  let diskInfo = null
  let accessible = false

  try {
    // Thử đọc thư mục uploads — nếu không tồn tại hoặc không có quyền thì báo lỗi
    fs.accessSync(config.UPLOAD_DIR, fs.constants.R_OK | fs.constants.W_OK)
    accessible = true

    const stat = fs.statfsSync(config.UPLOAD_DIR)
    const freeGB = ((stat.bfree * stat.bsize) / 1e9).toFixed(2)
    const totalGB = ((stat.blocks * stat.bsize) / 1e9).toFixed(2)
    diskInfo = { freeGB, totalGB }
  } catch (err) {
    console.error('[System API] Lỗi truy cập thư mục upload local:', err.message)
  }

  // Lấy thêm trạng thái Google Drive thực tế
  const driveInfo = await driveService.getDriveStatus()

  res.json({
    ok: true,
    accessible,
    uploadDir: config.UPLOAD_DIR,
    disk: diskInfo,
    drive: driveInfo
  })
})

// ── GET /api/drive/token ─────────────────────────────────────────────────────
// Trả về Google Drive Access Token ngắn hạn và Folder ID mục tiêu
// Cho phép app di động sử dụng để tải ảnh/video trực tiếp lên Drive khi server offline
router.get('/drive/token', async (req, res) => {
  try {
    const token = await driveService.getAccessToken()
    if (!token) {
      return res.status(500).json({ ok: false, message: 'Không thể lấy Google Drive token' })
    }
    res.json({
      ok: true,
      token,
      parentFolderId: config.DRIVE_FOLDER_ID
    })
  } catch (err) {
    console.error('[System API] Lỗi lấy token Google Drive:', err.message)
    res.status(500).json({ ok: false, message: err.message })
  }
})

module.exports = router