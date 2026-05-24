// routes/upload.js — upload, liệt kê, xoá file đính kèm theo đơn hàng
// Mount tại: /api/orders/:maVanDon/files

const express = require('express')
const path = require('path')
const fs = require('fs')
const { nanoid } = require('nanoid')
const db = require('../db')
const { upload } = require('../services/storage')
const config = require('../config')

const router = express.Router({ mergeParams: true }) // mergeParams để đọc được :maVanDon từ parent

// ── POST /api/orders/:maVanDon/files ─────────────────────────────────────────
// Upload một hoặc nhiều file cho đơn hàng
router.post('/', upload.array('files', 10), (req, res) => {
  // Tìm order theo maVanDon
  const order = db.prepare('SELECT * FROM orders WHERE maVanDon = ?').get(req.params.maVanDon)

  if (!order) {
    // Xoá file đã upload vì order không tồn tại
    req.files?.forEach(f => fs.unlink(f.path, () => {}))
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng' })
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ ok: false, message: 'Không có file nào được gửi lên' })
  }

  const now = new Date().toISOString()
  const insertFile = db.prepare(`
    INSERT INTO files (id, orderId, fileName, storedName, mimeType, size, path, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // Dùng transaction để insert nhiều file cùng lúc (nhanh hơn, atomic)
  const insertMany = db.transaction((files) => {
    return files.map(f => {
      const id = nanoid()
      // Lưu path tương đối để không bị lỗi khi chuyển máy
      const relativePath = path.relative(config.UPLOAD_DIR, f.path)
      insertFile.run(id, order.id, f.originalname, f.filename, f.mimetype, f.size, relativePath, now)
      return { id, fileName: f.originalname, storedName: f.filename, size: f.size }
    })
  })

  const inserted = insertMany(req.files)

  // Emit socket event để desktop/app biết có file mới (Bước 3 sẽ dùng)
  if (req.io) {
    req.io.to(`order:${order.id}`).emit('files_updated', { orderId: order.id })
  }

  // Khởi động đồng bộ Google Drive ngay lập tức dưới nền (không chặn luồng phản hồi HTTP)
  try {
    const { syncFileToDrive } = require('../services/watcher')
    req.files?.forEach(f => {
      syncFileToDrive(f.path).catch(err => {
        console.error(`❌ [Upload Route] Lỗi kích hoạt sync nhanh cho ${f.filename}:`, err.message)
      })
    })
  } catch (syncErr) {
    console.error('❌ [Upload Route] Không thể khởi chạy đồng bộ nền:', syncErr.message)
  }

  res.status(201).json({ ok: true, data: inserted, count: inserted.length })
})

// ── POST /api/orders/:maVanDon/files/drive ──────────────────────────────────
// Ghi nhận file đã đồng bộ Google Drive trực tiếp từ di động (Offline Direct Sync)
router.post('/drive', (req, res) => {
  const { files, driveFolderId, driveUrl } = req.body

  if (!files || files.length === 0) {
    return res.status(400).json({ ok: false, message: 'Thiếu thông tin file' })
  }

  const order = db.prepare('SELECT * FROM orders WHERE maVanDon = ?').get(req.params.maVanDon)

  if (!order) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng' })
  }

  const now = new Date().toISOString()

  if (driveFolderId || driveUrl) {
    db.prepare(`
      UPDATE orders 
      SET driveFolderId = COALESCE(?, driveFolderId),
          driveUrl      = COALESCE(?, driveUrl),
          trangThai     = 'hoan_thanh',
          updatedAt     = ?
      WHERE id = ?
    `).run(driveFolderId, driveUrl, now, order.id)
  }

  const insertFile = db.prepare(`
    INSERT INTO files (id, orderId, fileName, storedName, mimeType, size, path, driveFileId, status, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)
  `)

  const inserted = db.transaction((fileList) => {
    return fileList.map(f => {
      const id = nanoid()
      insertFile.run(
        id, 
        order.id, 
        f.fileName, 
        f.driveFileId || `drive_${id}`, 
        f.mimeType || 'image/jpeg', 
        f.size || 0, 
        f.path || '', 
        f.driveFileId || '', 
        now
      )
      return { id, fileName: f.fileName, driveFileId: f.driveFileId }
    })
  })(files)

  if (req.io) {
    req.io.to(`order:${order.id}`).emit('files_updated', { orderId: order.id })
    try {
      const { emitOrderUpdated } = require('../socket/events')
      emitOrderUpdated(req.io, order.id, {
        trangThai: 'hoan_thanh',
        updatedAt: now
      })
    } catch (err) {}
  }

  res.status(201).json({ ok: true, data: inserted })
})

// ── GET /api/orders/:maVanDon/files ──────────────────────────────────────────
// Lấy danh sách file của đơn hàng
router.get('/', (req, res) => {
  const order = db.prepare('SELECT id FROM orders WHERE maVanDon = ?').get(req.params.maVanDon)

  if (!order) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng' })
  }

  const files = db.prepare('SELECT * FROM files WHERE orderId = ? ORDER BY createdAt DESC').all(order.id)

  res.json({ ok: true, data: files })
})

// ── DELETE /api/orders/:maVanDon/files/:fileId ────────────────────────────────
// Xoá 1 file — xoá cả trong DB lẫn trên disk
router.delete('/:fileId', (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.fileId)

  if (!file) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy file' })
  }

  // Xoá trên disk trước
  const fullPath = path.join(config.UPLOAD_DIR, file.path)
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath)
  }

  // Xoá trong DB
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.fileId)

  res.json({ ok: true, message: 'Đã xoá file' })
})

module.exports = router
