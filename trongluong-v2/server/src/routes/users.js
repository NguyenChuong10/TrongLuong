// routes/users.js — Quản lý danh sách nhân viên và ca làm việc
// Mount tại: /api/users

const express = require('express')
const { nanoid } = require('nanoid')
const db = require('../db')

const router = express.Router()

// ── GET /api/users ──────────────────────────────────────────────────────────
// Lấy danh sách tất cả nhân viên để đồng bộ xuống điện thoại di động
router.get('/', (req, res) => {
  try {
    const users = db.prepare('SELECT * FROM users ORDER BY name ASC').all()
    res.json({ ok: true, data: users })
  } catch (error) {
    console.error('❌ [Users Route] Lỗi lấy danh sách nhân viên:', error.message)
    res.status(500).json({ ok: false, message: 'Lỗi hệ thống khi lấy danh sách nhân viên' })
  }
})

// ── POST /api/users ─────────────────────────────────────────────────────────
// Tạo mới nhân viên (dùng trên Desktop Dashboard)
router.post('/', (req, res) => {
  const { name, shift, pin } = req.body

  if (!name || !shift || !pin) {
    return res.status(400).json({ ok: false, message: 'Thiếu thông tin bắt buộc: name, shift hoặc pin!' })
  }

  if (pin.length !== 4 || isNaN(Number(pin))) {
    return res.status(400).json({ ok: false, message: 'Mã PIN đăng nhập bắt buộc phải là 4 chữ số!' })
  }

  if (shift !== 'ca_sang' && shift !== 'ca_dem') {
    return res.status(400).json({ ok: false, message: 'Ca làm việc không hợp lệ (phải là ca_sang hoặc ca_dem)!' })
  }

  const id = nanoid()
  const now = new Date().toISOString()

  try {
    // Kiểm tra trùng tên nhân viên
    const existing = db.prepare('SELECT id FROM users WHERE name = ?').get(name)
    if (existing) {
      return res.status(409).json({ ok: false, message: 'Tên nhân viên này đã tồn tại trên hệ thống!' })
    }

    db.prepare(`
      INSERT INTO users (id, name, shift, pin, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, name, shift, pin, now, now)

    const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
    console.log(`🌱 [DB] Đã thêm nhân viên mới: ${name} (Ca: ${shift})`)

    res.status(201).json({ ok: true, data: newUser })
  } catch (error) {
    console.error('❌ [Users Route] Lỗi tạo nhân viên mới:', error.message)
    res.status(500).json({ ok: false, message: 'Lỗi hệ thống khi thêm nhân viên' })
  }
})

// ── DELETE /api/users/:id ───────────────────────────────────────────────────
// Xóa nhân viên (dùng trên Desktop Dashboard)
router.delete('/:id', (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id)

    if (!user) {
      return res.status(404).json({ ok: false, message: 'Không tìm thấy nhân viên cần xóa!' })
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)
    console.log(`🗑️ [DB] Đã xóa nhân viên: ${user.name}`)

    res.json({ ok: true, message: `Đã xóa nhân viên ${user.name} khỏi hệ thống.` })
  } catch (error) {
    console.error('❌ [Users Route] Lỗi xóa nhân viên:', error.message)
    res.status(500).json({ ok: false, message: 'Lỗi hệ thống khi xóa nhân viên' })
  }
})

module.exports = router
