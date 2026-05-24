// services/storage.js — cấu hình Multer lưu file vào disk
// Mỗi đơn hàng có thư mục riêng: uploads/<maVanDon>/

const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { nanoid } = require('nanoid')
const config = require('../config')

// Các loại MIME được phép upload
const ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/quicktime', // for mov files from iOS
  'video/3gpp',
  'video/x-msvideo', // AVI
  'video/mpeg',
  'video/ogg',
  'video/webm',
]

// 20 MB tính bằng bytes
const MAX_FILE_SIZE = 20 * 1024 * 1024

const storage = multer.diskStorage({
  // Destination: tạo thư mục uploads/<maVanDon>/ nếu chưa có
  destination: (req, file, cb) => {
    // maVanDon được truyền qua route param :maVanDon
    const folder = path.join(config.UPLOAD_DIR, req.params.maVanDon)

    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true })
    }

    cb(null, folder)
  },

  // Filename: không dùng tên gốc vì có thể trùng, có thể chứa ký tự lạ
  // Format: <nanoid>.<ext gốc>  →  VD: abc123.jpg
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${nanoid()}${ext}`)
  },
})

// Filter: chỉ cho phép MIME types trong danh sách hoặc đuôi file được hỗ trợ
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase()
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.mp4', '.mov', '.3gp', '.avi', '.mpeg', '.webm']

  if (ALLOWED_MIME.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true)
  } else {
    cb(new Error(`Loại file không được hỗ trợ: ${file.mimetype} (đuôi file: ${ext})`), false)
  }
}

// Export middleware upload — route dùng upload.single('file') hoặc upload.array('files')
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
})

/**
 * Ghi hoặc cập nhật file thông tin đơn hàng dưới dạng .txt
 * @param {object} order Đối tượng đơn hàng lấy từ DB
 */
function writeOrderInfoTxt(order) {
  const folder = path.join(config.UPLOAD_DIR, order.maVanDon)
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true })
  }
  
  const txtPath = path.join(folder, `${order.maVanDon}.txt`)
  const content = `Mã vận đơn: ${order.maVanDon}
Số ký: ${order.soKy} kg
Ghi chú: ${order.ghiChu || 'Không có'}
Ngày tạo: ${order.createdAt}
Ngày cập nhật: ${order.updatedAt}
Trạng thái: ${order.trangThai}
`
  fs.writeFileSync(txtPath, content, 'utf8')
  console.log(`[Disk Storage] Đã cập nhật file thông tin: ${txtPath}`)
  return txtPath
}

module.exports = { upload, writeOrderInfoTxt }