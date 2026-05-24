 
const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const config = require('../config')
const { runSchema } = require('./schema')
 
// Đảm bảo thư mục chứa .db tồn tại trước khi tạo file
const dbDir = path.dirname(config.DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}
 
// Tạo kết nối — better-sqlite3 là synchronous, không cần async/await
const db = new Database(config.DB_PATH, {
  // verbose: config.IS_DEV ? console.log : null, // bật để debug SQL
})
 
// Chạy schema ngay khi module được load
runSchema(db)
 
console.log(`[DB] Kết nối SQLite: ${config.DB_PATH}`)
 
module.exports = db