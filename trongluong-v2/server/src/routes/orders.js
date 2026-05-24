// routes/orders.js — CRUD đơn hàng
// Mount tại: /api/orders

const express = require('express')
const fs = require('fs')
const path = require('path')
const { nanoid } = require('nanoid')
const db = require('../db')
const config = require('../config')
const { validate, orderCreateSchema, orderUpdateSchema } = require('../middleware/validate')

const router = express.Router()

// ── GET /api/orders ──────────────────────────────────────────────────────────
// Lấy danh sách đơn hàng (hoặc tìm kiếm cụ thể theo maVanDon)
router.get('/', (req, res) => {
  const { maVanDon } = req.query;

  if (maVanDon) {
    let order = db.prepare('SELECT * FROM orders WHERE maVanDon = ?').get(maVanDon);
    let files = [];

    if (order) {
      files = db.prepare('SELECT * FROM files WHERE orderId = ?').all(order.id);
      return res.json({ ok: true, data: { ...order, files } });
    }

    // 🌟 KHÔI PHỤC DỰ PHÒNG TỪ THƯ MỤC LOCAL (Đúng ý người dùng: Đọc trực tiếp từ thư mục nếu có)
    const folderPath = path.join(config.UPLOAD_DIR, maVanDon);
    if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      try {
        const filesInFolder = fs.readdirSync(folderPath);
        
        // 1. Quét tìm cân nặng trong file .txt
        let weight = 0.0;
        const txtFile = filesInFolder.find(f => f.toLowerCase().endsWith('.txt'));
        if (txtFile) {
          const txtContent = fs.readFileSync(path.join(folderPath, txtFile), 'utf8');
          const kgMatch = txtContent.match(/(Số ký|Cân nặng|Trọng lượng|soKy|weight|mass)\s*:\s*(\d+(\.\d+)?)/i);
          if (kgMatch) {
            weight = parseFloat(kgMatch[2]);
          } else {
            const matches = txtContent.match(/(\d+(\.\d+)?)/g);
            if (matches) {
              const validWeight = matches.find(num => num.length < 5);
              if (validWeight) weight = parseFloat(validWeight);
            }
          }
        }

        // 2. Lấy toàn bộ danh sách file ảnh và video
        const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.mp4', '.mov', '.3gp', '.avi', '.mpeg', '.webm'];
        const mediaFiles = filesInFolder.filter(f => {
          const ext = path.extname(f).toLowerCase();
          return allowedExts.includes(ext);
        });

        const getMimeType = (fileName) => {
          const ext = fileName.split('.').pop().toLowerCase();
          const mimeTypes = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'webp': 'image/webp',
            'pdf': 'application/pdf', 'mp4': 'video/mp4', 'mov': 'video/quicktime',
            'avi': 'video/x-msvideo', '3gp': 'video/3gpp'
          };
          return mimeTypes[ext] || 'application/octet-stream';
        };

        files = mediaFiles.map(f => {
          const stat = fs.statSync(path.join(folderPath, f));
          return {
            fileName: f,
            storedName: f,
            mimeType: getMimeType(f),
            size: stat.size,
            path: `${maVanDon}/${f}`
          };
        });

        console.log(`[API Orders] Bán tự động đối soát trực tiếp từ thư mục cho mã: ${maVanDon} (Cân nặng: ${weight} kg)`);
        return res.json({
          ok: true,
          data: {
            id: `mock_${maVanDon}`,
            maVanDon,
            soKy: weight,
            files
          }
        });
      } catch (err) {
        console.error('[API Orders] Lỗi đọc thư mục local dự phòng:', err.message);
      }
    }

    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng có mã vận đơn này' });
  }

  const orders = db.prepare(`
    SELECT * FROM orders ORDER BY createdAt DESC
  `).all()

  res.json({ ok: true, data: orders })
})

// ── GET /api/orders/open-folder ──────────────────────────────────────────────
// Mở thư mục của mã vận đơn trên Finder (macOS) hoặc File Explorer (Windows) và copy path vào clipboard
router.get('/open-folder', (req, res) => {
  const { maVanDon } = req.query;
  if (!maVanDon) {
    return res.status(400).json({ ok: false, message: 'Thiếu mã vận đơn' });
  }

  // Tìm đường dẫn thư mục tuyệt đối
  const folderPath = path.resolve(config.UPLOAD_DIR, maVanDon);

  // Tự động tạo thư mục nếu chưa tồn tại
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  try {
    const { exec } = require('child_process');
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // 💻 LỆNH CHO HỆ ĐIỀU HÀNH WINDOWS
      const winPath = folderPath.replace(/\//g, '\\');

      // 1. Mở thư mục trong File Explorer
      exec(`explorer.exe "${winPath}"`, (err) => {
        if (err) {
          console.error('[Open Folder Windows] Lỗi khi mở thư mục:', err.message);
        }
      });

      // 2. Sao chép đường dẫn tuyệt đối vào Clipboard Windows (ưu tiên PowerShell để tránh newline, dự phòng clip)
      exec(`powershell -command "Set-Clipboard -Value '${winPath}'"`, (err) => {
        if (err) {
          exec(`echo | set /p="${winPath}" | clip`, (clipErr) => {
            if (clipErr) {
              console.error('[Open Folder Windows] Lỗi sao chép clipboard:', clipErr.message);
            }
          });
        }
      });
      console.log(`[API Orders Windows] Đã tự động mở Explorer & nạp clipboard đường dẫn: ${winPath}`);

    } else {
      // 🍎 LỆNH CHO HỆ ĐIỀU HÀNH macOS
      // 1. Mở thư mục trong Finder (macOS)
      exec(`open "${folderPath}"`, (err) => {
        if (err) {
          console.error('[Open Folder macOS] Lỗi khi mở thư mục:', err.message);
        }
      });

      // 2. Sao chép đường dẫn tuyệt đối vào clipboard (pbcopy)
      exec(`echo "${folderPath}" | pbcopy`, (err) => {
        if (err) {
          console.error('[Open Folder macOS] Lỗi khi sao chép clipboard:', err.message);
        }
      });
      console.log(`[API Orders macOS] Đã tự động mở Finder & nạp clipboard đường dẫn: ${folderPath}`);
    }

    return res.json({ ok: true, folderPath });
  } catch (err) {
    console.error('[API Orders] Lỗi xử lý open-folder:', err.message);
    return res.status(500).json({ ok: false, message: err.message });
  }
});

// ── GET /api/orders/export ───────────────────────────────────────────────────
// Xuất báo cáo CSV của các đơn hàng (có hỗ trợ lọc theo ngày nghiệp vụ)
router.get('/export', (req, res) => {
  const { date } = req.query; // 'YYYY-MM-DD' hoặc rỗng để lấy tất cả
  let orders;
  let filename = 'bao_cao_tat_ca_don_hang.csv';

  if (date) {
    orders = db.prepare(`
      SELECT * FROM orders WHERE businessDate = ? ORDER BY createdAt DESC
    `).all(date);
    filename = `bao_cao_don_hang_${date}.csv`;
  } else {
    orders = db.prepare(`
      SELECT * FROM orders ORDER BY createdAt DESC
    `).all();
  }

  // Định dạng dữ liệu thành TSV (Tab Separated Values) để Excel tự động phân chia cột và hiển thị tiếng Việt hoàn hảo
  const csvHeaders = ['Mã vận đơn', 'Số ký (kg)', 'Người thực hiện', 'Ca trực', 'Ngày nghiệp vụ', 'Trạng thái', 'Ghi chú', 'Link Drive', 'Thời gian tạo'];
  
  const csvRows = orders.map(order => {
    // Trạng thái hiển thị tiếng Việt cho dễ hiểu
    let trangThaiText = order.trangThai;
    if (order.trangThai === 'cho_xu_ly') trangThaiText = 'Chờ xử lý';
    else if (order.trangThai === 'dang_xu_ly') trangThaiText = 'Đang xử lý';
    else if (order.trangThai === 'hoan_thanh') trangThaiText = 'Hoàn thành';

    // Trong file TSV, loại bỏ tab và xuống dòng trong text để tránh vỡ cấu trúc cột
    const escapeTSV = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    };

    return [
      escapeTSV(order.maVanDon),
      order.soKy || 0,
      escapeTSV(order.recordedBy),
      order.shift === 'ca_sang' ? 'Ca sáng' : order.shift === 'ca_dem' ? 'Ca đêm' : '',
      escapeTSV(order.businessDate),
      escapeTSV(trangThaiText),
      escapeTSV(order.ghiChu),
      escapeTSV(order.driveUrl),
      escapeTSV(order.createdAt)
    ].join('\t');
  });

  // Sử dụng CRLF (\r\n) làm dấu xuống dòng cho đúng chuẩn Windows/Excel
  const tsvContent = [csvHeaders.join('\t'), ...csvRows].join('\r\n');

  // Chuyển đổi sang Buffer mã hóa UTF-16 LE kèm BOM (0xFF 0xFE) để Excel tự động nhận diện Unicode 100%
  const bom = Buffer.from([0xFF, 0xFE]);
  const dataBuffer = Buffer.from(tsvContent, 'utf16le');
  const finalBuffer = Buffer.concat([bom, dataBuffer]);

  res.setHeader('Content-Type', 'text/csv; charset=utf-16le');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.status(200).send(finalBuffer);
});

// ── GET /api/orders/:id ──────────────────────────────────────────────────────
// Lấy 1 đơn hàng + danh sách file đính kèm
router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)

  if (!order) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng' })
  }

  const files = db.prepare('SELECT * FROM files WHERE orderId = ?').all(order.id)

  res.json({ ok: true, data: { ...order, files } })
})

// ── POST /api/orders ─────────────────────────────────────────────────────────
// Tạo đơn hàng mới
router.post('/', validate(orderCreateSchema), (req, res) => {
  const { maVanDon, soKy, ghiChu, recordedBy, shift, businessDate } = req.body
  const now = new Date().toISOString()
  const id = nanoid()

  // Kiểm tra maVanDon đã tồn tại chưa
  const existing = db.prepare('SELECT id FROM orders WHERE maVanDon = ?').get(maVanDon)
  if (existing) {
    return res.status(409).json({ ok: false, message: 'Mã vận đơn đã tồn tại' })
  }

  db.prepare(`
    INSERT INTO orders (id, maVanDon, soKy, trangThai, ghiChu, recordedBy, shift, businessDate, createdAt, updatedAt)
    VALUES (?, ?, ?, 'cho_xu_ly', ?, ?, ?, ?, ?, ?)
  `).run(id, maVanDon, soKy, ghiChu || null, recordedBy || null, shift || null, businessDate || null, now, now)

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id)

  // Ghi file thông tin đơn hàng dưới dạng .txt cục bộ
  try {
    const { writeOrderInfoTxt } = require('../services/storage')
    writeOrderInfoTxt(order)
  } catch (err) {
    console.error('❌ [Orders Route] Lỗi ghi file .txt cục bộ:', err.message)
  }

  res.status(201).json({ ok: true, data: order })
})

// ── PATCH /api/orders/:id ────────────────────────────────────────────────────
// Cập nhật đơn hàng (partial update)
router.patch('/:id', validate(orderUpdateSchema), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)

  if (!order) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng' })
  }

  const { soKy, trangThai, ghiChu, recordedBy, shift, businessDate } = req.body
  const now = new Date().toISOString()

  // Chỉ update các field được gửi lên, giữ nguyên field còn lại
  db.prepare(`
    UPDATE orders
    SET soKy          = COALESCE(?, soKy),
        trangThai     = COALESCE(?, trangThai),
        ghiChu        = COALESCE(?, ghiChu),
        recordedBy    = COALESCE(?, recordedBy),
        shift         = COALESCE(?, shift),
        businessDate  = COALESCE(?, businessDate),
        updatedAt     = ?
    WHERE id = ?
  `).run(
    soKy ?? null,
    trangThai ?? null,
    ghiChu ?? null,
    recordedBy ?? null,
    shift ?? null,
    businessDate ?? null,
    now,
    req.params.id
  )

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)

  // Cập nhật file thông tin đơn hàng dưới dạng .txt cục bộ
  try {
    const { writeOrderInfoTxt } = require('../services/storage')
    writeOrderInfoTxt(updated)
  } catch (err) {
    console.error('❌ [Orders Route] Lỗi cập nhật file .txt cục bộ:', err.message)
  }

  // Phát Socket event realtime
  if (req.io) {
    try {
      const { emitOrderUpdated } = require('../socket/events')
      emitOrderUpdated(req.io, updated.id, {
        soKy: updated.soKy,
        trangThai: updated.trangThai,
        ghiChu: updated.ghiChu,
        updatedAt: updated.updatedAt
      })
    } catch (socketErr) {
      console.error('❌ [Orders Route] Lỗi emit socket event:', socketErr.message)
    }
  }

  res.json({ ok: true, data: updated })
})

// ── DELETE /api/orders/:id ───────────────────────────────────────────────────
// Xoá đơn hàng + các file liên quan (CASCADE trong DB tự xử lý bảng files)
router.delete('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)

  if (!order) {
    return res.status(404).json({ ok: false, message: 'Không tìm thấy đơn hàng' })
  }

  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id)

  res.json({ ok: true, message: 'Đã xoá đơn hàng' })
})

module.exports = router