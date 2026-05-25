// services/watcher.js — Giám sát thư mục uploads và tự động đồng bộ Google Drive
// Sử dụng chokidar để bắt sự kiện file và p-queue để xếp hàng upload tránh nghẽn quota

const fs = require('fs')
const path = require('path')
const chokidar = require('chokidar')
const PQueueClass = require('p-queue')
const PQueue = PQueueClass.default || PQueueClass
const config = require('../config')
const db = require('../db')
const driveService = require('./drive')
const { emitUploadProgress, emitOrderUpdated } = require('../socket/events')

// Khởi tạo hàng đợi upload với concurrency tối đa là 2 để tối ưu hóa và an toàn quota
const uploadQueue = new PQueue({ concurrency: 2 })

let watcherInstance = null
let ioInstance = null

/**
 * Trích xuất mã vận đơn và tên file từ đường dẫn tuyệt đối của file lưu trữ
 * @param {string} absolutePath Đường dẫn file
 * @returns {{maVanDon: string, fileName: string}|null}
 */
function parsePathInfo(absolutePath) {
  try {
    const relative = path.relative(config.UPLOAD_DIR, absolutePath)
    const parts = relative.split(path.sep)
    if (parts.length >= 2) {
      return {
        maVanDon: parts[0],
        fileName: parts[1]
      }
    }
  } catch (err) {
    console.error('[Watcher] Lỗi parse đường dẫn:', err.message)
  }
  return null
}

/**
 * Hàm emit socket an toàn
 */
function safeEmit(orderId, event, payload) {
  if (ioInstance) {
    ioInstance.to(`order:${orderId}`).emit(event, {
      orderId,
      ...payload,
      timestamp: new Date().toISOString()
    })
  }
}

/**
 * Xử lý đồng bộ một file cụ thể lên Google Drive
 * @param {string} filePath Đường dẫn tuyệt đối file local
 */
async function syncFileToDrive(filePath) {
  const pathInfo = parsePathInfo(filePath)
  if (!pathInfo) return

  const { maVanDon, fileName } = pathInfo
  
  // Tránh vòng lặp hoặc file rác hệ thống (ví dụ .DS_Store)
  if (fileName.startsWith('.')) return

  console.log(`\n📬 [Watcher] Phát hiện file cần sync: ${fileName} (Mã VD: ${maVanDon})`)

  try {
    // 1. Lấy thông tin đơn hàng từ DB
    const order = db.prepare('SELECT * FROM orders WHERE maVanDon = ?').get(maVanDon)
    if (!order) {
      console.warn(`⚠️ [Watcher] File thuộc về mã vận đơn ${maVanDon} không tồn tại trong Database orders!`)
      return
    }

    // 2. Kiểm tra/Tạo thư mục đơn hàng trên Google Drive
    let driveFolderId = order.driveFolderId
    let driveUrl = order.driveUrl

    if (!driveFolderId) {
      console.log(`[Watcher] Đơn hàng ${maVanDon} chưa có thư mục Google Drive. Đang tiến hành tạo...`)
      try {
        if (order.businessDate) {
          console.log(`[Watcher] Phân nhóm theo Ngày nghiệp vụ: ${order.businessDate}. Tìm/Tạo thư mục ngày...`)
          const dateFolderId = await driveService.createFolder(order.businessDate)
          driveFolderId = await driveService.createFolder(maVanDon, dateFolderId)
        } else {
          driveFolderId = await driveService.createFolder(maVanDon)
        }
        driveUrl = `https://drive.google.com/drive/folders/${driveFolderId}`
        
        // Cập nhật thư mục Drive vào SQLite
        db.prepare('UPDATE orders SET driveFolderId = ?, driveUrl = ?, updatedAt = ? WHERE id = ?')
          .run(driveFolderId, driveUrl, new Date().toISOString(), order.id)
        
        console.log(`✅ [Watcher] Đã cập nhật Folder Drive cho đơn hàng ${maVanDon}: ${driveFolderId}`)
        
        // Notify client realtime
        safeEmit(order.id, 'drive_folder_created', { driveFolderId, driveUrl })
      } catch (folderErr) {
        console.error(`❌ [Watcher] Không thể tạo thư mục cho đơn hàng ${maVanDon} trên Drive:`, folderErr.message)
        return
      }
    }

    // 3. Phân biệt file cân nặng .txt và file hình ảnh/video đính kèm
    const isWeightTxt = fileName === `${maVanDon}.txt`

    if (isWeightTxt) {
      // Đối với file cân nặng .txt: tải lên ghi đè trực tiếp
      console.log(`[Watcher] Đang tải lên file thông tin cân nặng: ${fileName}`)
      
      await uploadQueue.add(async () => {
        try {
          const mimeType = 'text/plain'
          await driveService.uploadFile(filePath, mimeType, fileName, driveFolderId)
          console.log(`✅ [Watcher] Đã đồng bộ file cân nặng ${fileName} lên Google Drive`)
          
          // Cập nhật trạng thái đơn hàng thành hoàn thành nếu có ít nhất 1 file đính kèm và tất cả đã đồng bộ
          const totalFiles = db.prepare("SELECT COUNT(*) as count FROM files WHERE orderId = ?").get(order.id)
          const unfinishedFiles = db.prepare("SELECT COUNT(*) as count FROM files WHERE orderId = ? AND status != 'synced'").get(order.id)
          
          let newStatus = order.trangThai
          if (totalFiles.count > 0) {
            newStatus = unfinishedFiles.count === 0 ? 'hoan_thanh' : 'dang_xu_ly'
          }
          
          db.prepare('UPDATE orders SET trangThai = ?, updatedAt = ? WHERE id = ?')
            .run(newStatus, new Date().toISOString(), order.id)
          
          // Phát socket realtime cập nhật
          if (ioInstance) {
            emitOrderUpdated(ioInstance, order.id, { trangThai: newStatus, driveUrl })
          }
        } catch (uploadErr) {
          console.error(`❌ [Watcher] Lỗi upload file cân nặng ${fileName}:`, uploadErr.message)
        }
      })
    } else {
      // Đối với file hình ảnh, video đính kèm:
      // A. Truy vấn file trong bảng files
      const dbFile = db.prepare('SELECT * FROM files WHERE orderId = ? AND storedName = ?').get(order.id, fileName)
      
      if (!dbFile) {
        console.warn(`⚠️ [Watcher] File đính kèm ${fileName} chưa được khai báo trong DB files! Tự động tạo bản ghi...`)
        // Có thể do watcher bắt được trước khi API xử lý xong DB, hoặc user chép tay
        // Ta sẽ bỏ qua hoặc đợi 1 giây rồi thử lại. Ở đây chokidar đã có awaitWriteFinish nên phần lớn là DB đã insert.
        // Hãy đợi một lát rồi thử query lại để an toàn
        await new Promise(resolve => setTimeout(resolve, 800))
      }

      const fileRecord = db.prepare('SELECT * FROM files WHERE orderId = ? AND storedName = ?').get(order.id, fileName)
      if (!fileRecord) {
        console.warn(`❌ [Watcher] File đính kèm ${fileName} vẫn không tìm thấy trong DB files sau khi chờ. Bỏ qua đồng bộ file này.`)
        return
      }

      // Nếu file đã synced trước đó rồi thì bỏ qua
      if (fileRecord.status === 'synced') {
        console.log(`[Watcher] File ${fileName} đã được đồng bộ từ trước. Bỏ qua.`)
        return
      }

      // B. Cập nhật trạng thái thành 'syncing' và đẩy vào Queue
      db.prepare("UPDATE files SET status = 'syncing' WHERE id = ?").run(fileRecord.id)
      safeEmit(order.id, 'drive_syncing', { fileId: fileRecord.id, fileName: fileRecord.fileName })

      await uploadQueue.add(async () => {
        try {
          console.log(`[Watcher] Đang tải lên file đính kèm: ${fileRecord.fileName} (${fileName})`)
          
          const mimeType = fileRecord.mimeType || 'application/octet-stream'
          const uploadRes = await driveService.uploadFile(filePath, mimeType, fileRecord.fileName, driveFolderId)
          
          // C. Upload thành công, cập nhật SQLite files
          db.prepare("UPDATE files SET driveFileId = ?, status = 'synced' WHERE id = ?")
            .run(uploadRes.id, fileRecord.id)
          
          console.log(`✅ [Watcher] Đồng bộ thành công file ${fileRecord.fileName} lên Drive (ID: ${uploadRes.id})`)
          
          // D. Notify client
          safeEmit(order.id, 'drive_synced', {
            fileId: fileRecord.id,
            fileName: fileRecord.fileName,
            driveFileId: uploadRes.id,
            webViewLink: uploadRes.webViewLink
          })

          // E. Kiểm tra xem tất cả các file của đơn hàng đã được sync xong chưa
          const pendingFiles = db.prepare("SELECT COUNT(*) as count FROM files WHERE orderId = ? AND status != 'synced'").get(order.id)
          const allSynced = pendingFiles.count === 0

          if (allSynced) {
            db.prepare("UPDATE orders SET trangThai = 'hoan_thanh', updatedAt = ? WHERE id = ?")
              .run(new Date().toISOString(), order.id)
            
            console.log(`🎉 [Watcher] Đơn hàng ${maVanDon} ĐÃ HOÀN THÀNH đồng bộ toàn bộ file!`)
            if (ioInstance) {
              emitOrderUpdated(ioInstance, order.id, { trangThai: 'hoan_thanh', driveUrl })
            }
          } else {
            db.prepare("UPDATE orders SET trangThai = 'dang_xu_ly', updatedAt = ? WHERE id = ?")
              .run(new Date().toISOString(), order.id)
            if (ioInstance) {
              emitOrderUpdated(ioInstance, order.id, { trangThai: 'dang_xu_ly', driveUrl })
            }
          }
        } catch (uploadErr) {
          console.error(`❌ [Watcher] Lỗi đồng bộ file đính kèm ${fileRecord.fileName}:`, uploadErr.message)
          db.prepare("UPDATE files SET status = 'error' WHERE id = ?").run(fileRecord.id)
          safeEmit(order.id, 'sync_error', {
            fileId: fileRecord.id,
            fileName: fileRecord.fileName,
            message: uploadErr.message
          })
        }
      })
    }
  } catch (globalErr) {
    console.error(`❌ [Watcher] Lỗi nghiêm trọng khi đồng bộ file ${filePath}:`, globalErr.message)
  }
}

/**
 * Khởi động bộ giám sát thư mục bằng Chokidar
 * @param {import('socket.io').Server} io Instance socket.io để truyền xuống events
 */
function startWatcher(io) {
  if (watcherInstance) return watcherInstance
  ioInstance = io

  const targetDir = path.resolve(config.UPLOAD_DIR)
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  console.log(`🔎 [Watcher] Bắt đầu theo dõi thư mục: ${targetDir}`)

  // Cấu hình Chokidar watcher
  watcherInstance = chokidar.watch(targetDir, {
    ignored: /(^|[\/\\])\../, // Bỏ qua file ẩn (như .DS_Store, .tmp)
    persistent: true,
    ignoreInitial: true,      // Bỏ qua các file đã tồn tại từ trước lúc mở server (tránh đồng bộ ồ ạt lúc khởi động)
    awaitWriteFinish: {
      stabilityThreshold: 1500, // Đợi 1.5 giây sau khi kích thước file ổn định
      pollInterval: 200         // Kiểm tra mỗi 200ms
    }
  })

  // Đăng ký sự kiện
  watcherInstance
    .on('add', (filePath) => {
      // Đẩy tác vụ sync vào hàng đợi
      syncFileToDrive(filePath)
    })
    .on('change', (filePath) => {
      // Khi file thay đổi nội dung (ví dụ file .txt cân nặng được ghi đè)
      syncFileToDrive(filePath)
    })
    .on('error', (error) => {
      console.error('❌ [Watcher] Gặp lỗi hệ thống:', error.message)
    })

  // Tự động quét và tiếp tục đồng bộ các đơn hàng dang dở từ DB sau khi khởi động
  setTimeout(() => {
    resumePendingSyncs()
  }, 2000)

  return watcherInstance
}

/**
 * Quét toàn bộ DB và tự động tiếp tục đồng bộ các đơn hàng chưa hoàn thành
 */
async function resumePendingSyncs() {
  try {
    const pendingOrders = db.prepare("SELECT * FROM orders WHERE trangThai != 'hoan_thanh'").all()
    
    if (pendingOrders.length === 0) {
      console.log('🌱 [Watcher] Không có đơn hàng cũ nào cần đồng bộ lại.')
      return
    }

    console.log(`📬 [Watcher] Phát hiện ${pendingOrders.length} đơn hàng cũ chưa hoàn thành. Đang tự động khôi phục luồng đồng bộ...`)
    
    for (const order of pendingOrders) {
      const folderPath = path.resolve(config.UPLOAD_DIR, order.maVanDon)
      if (fs.existsSync(folderPath)) {
        const filesInFolder = fs.readdirSync(folderPath)
        for (const file of filesInFolder) {
          if (file.startsWith('.')) continue // bỏ qua file ẩn
          const filePath = path.join(folderPath, file)
          // Kích hoạt đồng bộ lại
          syncFileToDrive(filePath)
        }
      }
    }
  } catch (err) {
    console.error('❌ [Watcher] Lỗi khi tự động khôi phục đồng bộ:', err.message)
  }
}

/**
 * Tắt bộ giám sát
 */
function stopWatcher() {
  if (watcherInstance) {
    watcherInstance.close()
    watcherInstance = null
    console.log('[Watcher] Đã tắt bộ giám sát thư mục.')
  }
}

module.exports = {
  startWatcher,
  stopWatcher,
  syncFileToDrive,
  resumePendingSyncs
}
