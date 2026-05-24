function runSchema(db) {
  // Bật WAL mode — ghi nhanh hơn, cho phép đọc đồng thời
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  
  // Bảng nhân viên (tài khoản kho)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,         -- nanoid
      name        TEXT NOT NULL,            -- Tên nhân viên
      shift       TEXT NOT NULL,            -- 'ca_sang' | 'ca_dem'
      pin         TEXT NOT NULL,            -- mã PIN 4 số đăng nhập
      createdAt   TEXT NOT NULL,
      updatedAt   TEXT NOT NULL
    )
  `)
 
  // Bảng đơn hàng (phiếu trọng lượng)
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id          TEXT PRIMARY KEY,         -- nanoid, VD: "abc123xyz"
      maVanDon    TEXT NOT NULL UNIQUE,     -- mã vận đơn, VD: "VN123456789"
      soKy        INTEGER NOT NULL,         -- số ký thực tế (gram hoặc kg tuỳ quy ước)
      trangThai   TEXT NOT NULL DEFAULT 'cho_xu_ly',
                                            -- 'cho_xu_ly' | 'dang_xu_ly' | 'hoan_thanh' | 'loi'
      ghiChu      TEXT,                     -- ghi chú tuỳ chọn
      createdAt   TEXT NOT NULL,            -- ISO 8601 string
      updatedAt   TEXT NOT NULL             -- ISO 8601 string
    )
  `)
 
  // Bảng file đính kèm theo đơn hàng
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id          TEXT PRIMARY KEY,         -- nanoid
      orderId     TEXT NOT NULL,            -- FK → orders.id
      fileName    TEXT NOT NULL,            -- tên file gốc khi upload
      storedName  TEXT NOT NULL,            -- tên file thực tế lưu trên disk
      mimeType    TEXT,                     -- VD: "image/jpeg"
      size        INTEGER,                  -- byte
      path        TEXT NOT NULL,            -- đường dẫn tương đối từ UPLOAD_DIR
      createdAt   TEXT NOT NULL,
      FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
    )
  `)

  // Thêm các cột liên quan Google Drive vào orders nếu chưa có (Migration an toàn)
  try {
    db.exec("ALTER TABLE orders ADD COLUMN driveFolderId TEXT")
  } catch (e) {
    // Cột đã tồn tại
  }

  try {
    db.exec("ALTER TABLE orders ADD COLUMN driveUrl TEXT")
  } catch (e) {
    // Cột đã tồn tại
  }

  // Thêm cột ca kíp, ngày làm việc, người thực hiện vào orders
  try {
    db.exec("ALTER TABLE orders ADD COLUMN recordedBy TEXT")
  } catch (e) {
    // Cột đã tồn tại
  }

  try {
    db.exec("ALTER TABLE orders ADD COLUMN shift TEXT")
  } catch (e) {
    // Cột đã tồn tại
  }

  try {
    db.exec("ALTER TABLE orders ADD COLUMN businessDate TEXT")
  } catch (e) {
    // Cột đã tồn tại
  }

  // Thêm các cột liên quan Google Drive vào files nếu chưa có (Migration an toàn)
  try {
    db.exec("ALTER TABLE files ADD COLUMN driveFileId TEXT")
  } catch (e) {
    // Cột đã tồn tại
  }

  try {
    db.exec("ALTER TABLE files ADD COLUMN status TEXT DEFAULT 'local'")
  } catch (e) {
    // Cột đã tồn tại
  }
 
  // Index để tìm file theo orderId nhanh hơn
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_files_orderId ON files(orderId)
  `)
 
  // Index để tìm đơn theo maVanDon nhanh hơn
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_maVanDon ON orders(maVanDon)
  `)

  // Hạt giống (Seed) dữ liệu nhân viên mặc định nếu bảng trống
  try {
    const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;
    if (userCount === 0) {
      const insertUser = db.prepare(`
        INSERT INTO users (id, name, shift, pin, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertUser.run("u1", "Hùng (Ca Sáng)", "ca_sang", "1111", now, now);
      insertUser.run("u2", "Lan (Ca Sáng)", "ca_sang", "2222", now, now);
      insertUser.run("u3", "Nam (Ca Đêm)", "ca_dem", "3333", now, now);
      insertUser.run("u4", "Huy (Ca Đêm)", "ca_dem", "4444", now, now);
      insertUser.run("u5", "Tuấn (Ca Đêm)", "ca_dem", "5555", now, now);
      console.log("🌱 [DB] Đã khởi tạo 5 tài khoản nhân viên mặc định thành công!");
    }
  } catch (seedErr) {
    console.error("❌ [DB] Lỗi khởi tạo seed dữ liệu nhân viên:", seedErr.message);
  }
}
 
module.exports = { runSchema }
 