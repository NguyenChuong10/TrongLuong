// services/drive.js — Dịch vụ tích hợp Google Drive API v3
// Hỗ trợ chế độ dry-run (giả lập) nếu chưa có Service Account Key để tránh crash server

const fs = require('fs')
const path = require('path')
const { google } = require('googleapis')
const config = require('../config')

let driveClient = null
let isMockMode = false
let authClient = null

/**
 * Khởi tạo Google Drive API client
 */
function initDrive() {
  if (driveClient) return driveClient

  const parentFolderId = config.DRIVE_FOLDER_ID
  const clientId = config.GOOGLE_CLIENT_ID
  const clientSecret = config.GOOGLE_CLIENT_SECRET
  const refreshToken = config.GOOGLE_REFRESH_TOKEN
  const serviceAccountKey = config.GOOGLE_SERVICE_ACCOUNT_KEY

  if (!parentFolderId) {
    console.warn('\n⚠️  [Google Drive] Chưa cấu hình DRIVE_FOLDER_ID trong .env!')
    console.warn('⚠️  [Google Drive] Tự động kích hoạt chế độ GIẢ LẬP (Mock Mode). File sẽ chỉ lưu offline trên disk.\n')
    isMockMode = true
    return null
  }

  // 🌟 ƯU TIÊN 1: Kết nối dạng OAuth2 (Gmail cá nhân 15GB)
  if (clientId && clientSecret && refreshToken) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        `http://localhost:${config.PORT}/oauth2callback`
      )
      oauth2Client.setCredentials({
        refresh_token: refreshToken
      })

      authClient = oauth2Client
      driveClient = google.drive({ version: 'v3', auth: oauth2Client })
      isMockMode = false
      console.log('✅ [Google Drive] Khởi tạo kết nối Google API OAuth2 (Gmail cá nhân) thành công!')
      return driveClient
    } catch (oauthErr) {
      console.error('❌ [Google Drive] Lỗi kết nối OAuth2:', oauthErr.message)
    }
  }

  // 🌟 ƯU TIÊN 2: Kết nối dạng Service Account (JWT)
  if (serviceAccountKey) {
    try {
      let credentials
      if (fs.existsSync(serviceAccountKey)) {
        const fileContent = fs.readFileSync(serviceAccountKey, 'utf8')
        credentials = JSON.parse(fileContent)
      } else {
        credentials = JSON.parse(serviceAccountKey)
      }

      const auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        ['https://www.googleapis.com/auth/drive']
      )

      authClient = auth
      driveClient = google.drive({ version: 'v3', auth })
      isMockMode = false
      console.log('✅ [Google Drive] Khởi tạo kết nối Google API Service Account thành công')
      return driveClient
    } catch (error) {
      console.error('❌ [Google Drive] Lỗi khởi tạo Service Account Client:', error.message)
    }
  }

  // 🌟 MOCK MODE làm dự phòng
  console.warn('⚠️  [Google Drive] Không tìm thấy cấu hình OAuth2 hợp lệ hoặc Service Account Key trong .env!')
  console.warn('⚠️  [Google Drive] Tự động chuyển sang chế độ GIẢ LẬP (Mock Mode).')
  isMockMode = true
  return null
}

/**
 * Tạo một thư mục con trên Google Drive
 * @param {string} folderName Tên thư mục cần tạo (thường là mã vận đơn)
 * @param {string} [customParentId] Thư mục cha tuỳ chọn, mặc định lấy trong config
 * @returns {Promise<string>} Folder ID trên Google Drive
 */
async function createFolder(folderName, customParentId = null) {
  initDrive()
  const parentId = customParentId || config.DRIVE_FOLDER_ID

  if (isMockMode) {
    console.log(`[Google Drive - Mock] Tạo thư mục "${folderName}" dưới thư mục cha "${parentId}"`)
    return `mock_folder_id_${Date.now()}`
  }

  try {
    // 1. Kiểm tra xem folder đã tồn tại chưa (tránh trùng lặp thư mục)
    const existing = await driveClient.files.list({
      q: `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (existing.data.files && existing.data.files.length > 0) {
      const folderId = existing.data.files[0].id
      console.log(`[Google Drive] Thư mục "${folderName}" đã tồn tại: ${folderId}`)
      return folderId
    }

    // 2. Tạo mới nếu chưa có
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }

    const file = await driveClient.files.create({
      resource: fileMetadata,
      fields: 'id',
      supportsAllDrives: true,
    })

    console.log(`[Google Drive] Đã tạo thành công thư mục: "${folderName}" (ID: ${file.data.id})`)
    return file.data.id
  } catch (error) {
    console.error(`❌ [Google Drive] Lỗi tạo thư mục "${folderName}":`, error.message)
    throw error
  }
}

/**
 * Tải một file lên Google Drive
 * @param {string} localFilePath Đường dẫn tuyệt đối của file trên server
 * @param {string} mimeType Định dạng file (image/jpeg, video/mp4, text/plain...)
 * @param {string} fileName Tên file hiển thị trên Google Drive
 * @param {string} parentFolderId ID thư mục cha trên Drive (thư mục của đơn hàng)
 * @returns {Promise<{id: string, webViewLink: string}>} File ID và Link xem file trực tiếp
 */
async function uploadFile(localFilePath, mimeType, fileName, parentFolderId) {
  initDrive()

  if (isMockMode) {
    console.log(`[Google Drive - Mock] Upload file "${fileName}" lên thư mục "${parentFolderId}"`)
    return {
      id: `mock_file_id_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      webViewLink: `https://drive.google.com/drive/mock/file/view?id=mock_${Date.now()}`,
    }
  }

  try {
    // Check file tồn tại local trước
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`File local không tồn tại tại đường dẫn: ${localFilePath}`)
    }

    // 1. Kiểm tra xem file đã tồn tại trong thư mục chưa (tránh trùng tên)
    const existing = await driveClient.files.list({
      q: `name = '${fileName}' and '${parentFolderId}' in parents and trashed = false`,
      fields: 'files(id, webViewLink)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (existing.data.files && existing.data.files.length > 0) {
      const fileId = existing.data.files[0].id
      const webViewLink = existing.data.files[0].webViewLink
      console.log(`[Google Drive] File "${fileName}" đã tồn tại. Đang cập nhật đè (Update)...`)
      
      // Tiến hành update đè lên file cũ
      const media = {
        mimeType: mimeType,
        body: fs.createReadStream(localFilePath),
      }
      
      const updatedFile = await driveClient.files.update({
        fileId: fileId,
        media: media,
        fields: 'id, webViewLink',
        supportsAllDrives: true,
      })
      
      return {
        id: updatedFile.data.id,
        webViewLink: updatedFile.data.webViewLink,
      }
    }

    // 2. Tạo mới nếu chưa có
    const fileMetadata = {
      name: fileName,
      parents: [parentFolderId],
    }
    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(localFilePath),
    }

    const file = await driveClient.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    })

    // 3. Phân quyền chia sẻ công khai (để app mobile click là xem được ngay)
    try {
      await driveClient.permissions.create({
        fileId: file.data.id,
        resource: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true,
      })
    } catch (permError) {
      console.warn(`[Google Drive] Không thể phân quyền public cho file ${fileName}:`, permError.message)
    }

    console.log(`[Google Drive] Upload thành công: "${fileName}" (ID: ${file.data.id})`)
    return {
      id: file.data.id,
      webViewLink: file.data.webViewLink,
    }
  } catch (error) {
    console.error(`❌ [Google Drive] Lỗi upload file "${fileName}":`, error.message)
    throw error
  }
}

/**
 * Xoá một file trên Google Drive
 * @param {string} driveFileId ID file trên Drive cần xoá
 */
async function deleteFile(driveFileId) {
  initDrive()

  if (isMockMode) {
    console.log(`[Google Drive - Mock] Xoá file có ID: "${driveFileId}"`)
    return true
  }

  if (!driveFileId || driveFileId.startsWith('mock_')) return true

  try {
    await driveClient.files.delete({
      fileId: driveFileId,
    })
    console.log(`[Google Drive] Đã xoá file trên Drive (ID: ${driveFileId})`)
    return true
  } catch (error) {
    console.error(`❌ [Google Drive] Lỗi xoá file trên Drive (ID: ${driveFileId}):`, error.message)
    // Trả về false thay vì throw để tránh đứt gãy luồng xử lý chính
    return false
  }
}

/**
 * Lấy trạng thái kết nối Google Drive
 */
async function getDriveStatus() {
  initDrive()
  if (isMockMode) {
    return {
      connected: false,
      mode: 'mock',
      message: 'Chế độ giả lập (Mock Mode) đang kích hoạt do thiếu Key hoặc Folder ID trong .env',
      quota: { limit: '15 GB (Giả lập)', usage: '0 GB' },
    }
  }

  try {
    const response = await driveClient.about.get({
      fields: 'user, storageQuota',
    })
    const limit = parseInt(response.data.storageQuota.limit, 10)
    const usage = parseInt(response.data.storageQuota.usage, 10)
    
    return {
      connected: true,
      mode: 'production',
      user: response.data.user.displayName,
      email: response.data.user.emailAddress,
      quota: {
        limit: limit ? `${(limit / (1024 ** 3)).toFixed(2)} GB` : 'Không giới hạn',
        usage: `${(usage / (1024 ** 3)).toFixed(2)} GB`,
        percent: limit ? ((usage / limit) * 100).toFixed(1) + '%' : '0%',
      },
    }
  } catch (error) {
    return {
      connected: false,
      mode: 'error',
      message: error.message,
    }
  }
}

/**
 * Lấy Access Token ngắn hạn của Google Drive để cấp cho Mobile App khi chạy offline
 */
async function getAccessToken() {
  initDrive()
  if (isMockMode) return 'mock_token'
  try {
    const tokenRes = await authClient.getAccessToken()
    return tokenRes.token
  } catch (error) {
    console.error('❌ [Google Drive] Lỗi lấy Access Token:', error.message)
    return null
  }
}

module.exports = {
  initDrive,
  createFolder,
  uploadFile,
  deleteFile,
  getDriveStatus,
  getAccessToken,
}
