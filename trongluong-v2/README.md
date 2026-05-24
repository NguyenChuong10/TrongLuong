# 📦 TrongLuong v2 — Hệ Thống Số Hóa Cân Nặng & Đối Soát Bán Tự Động Phân Tán

**TrongLuong v2** là hệ thống phân tán toàn diện giúp số hóa toàn bộ quy trình cân đo hàng hóa tại kho, lưu trữ dữ liệu thời gian thực và hỗ trợ nhân viên đối soát điền thông tin cân nặng, tải tệp minh chứng lên hệ thống **J&T JMS** siêu tốc chỉ bằng 1-click chuột.

Hệ thống bao gồm 4 phân hệ cốt lõi hoạt động đồng bộ:
1. 📱 **Mobile App (React Native/Expo):** Quét mã vận đơn, chụp ảnh/quay video cân nặng thực tế, nén dữ liệu cực tốt và đồng bộ theo mô hình Offline-First.
2. 💻 **Backend Server (Node.js/SQLite):** Quản lý cơ sở dữ liệu SQLite cục bộ, theo dõi thư mục (Watcher) và đồng bộ tệp lên Google Drive.
3. 🖥️ **Desktop App (Electron Glassmorphism):** Bảng quản trị ca kíp, danh sách nhân sự và quản lý xuất file báo cáo Excel tiếng Việt hoàn hảo.
4. 🚚 **Browser Assistant (Tampermonkey):** Điền cân nặng thực tế và tự động mở Finder/Explorer nạp Clipboard đường dẫn ảnh khi bấm dấu `[+]` native trên J&T JMS.

---

## 🚀 Các Tính Năng Đột Phá Trên Phiên Bản v2

* **Offline-First & Auto-Cleanup di động:** Cho phép lưu trữ tạm dữ liệu đơn hàng và ảnh khi mất kết nối mạng. Tự động đồng bộ lên Google Drive qua 4G khi có sóng và **xóa ngay lập tức file đệm trên điện thoại** để giải phóng dung lượng bộ nhớ.
* **Nén thông minh (Smart Compression):** Ảnh chụp được tự nén xuống chỉ còn **120KB - 160KB**, video giới hạn tối đa 30 giây được nén xuống dưới **1.2MB** mà vẫn đảm bảo độ sắc nét cao của chữ số cân, tránh hoàn toàn tình trạng nghẽn mạng băng thông kho.
* **Quản lý ca trực & Bàn giao ca (08:00 AM):** Tự động phân chia ngày nghiệp vụ thông minh. Đúng **08:00 sáng hàng ngày**, ứng dụng tự động hiển thị **Hộp thoại Bàn Giao Ca (Handover Modal)** hiển thị báo cáo tổng hợp và cưỡng chế Đăng xuất để bàn giao cho ca tiếp theo.
* **Vượt rào bảo mật trình duyệt đa nền tảng (macOS & Windows):** Khi click vào nút dấu **`[+]`** native trên J&T JMS, server trung tâm tự động mở Finder (Mac) hoặc Explorer (Windows) hiển thị thư mục ảnh cục bộ, đồng thời **tự động sao chép đường dẫn tuyệt đối vào Clipboard**. Người dùng chỉ cần nhấn dán (`Cmd+V` / `Ctrl+V`) là nhảy thẳng đến thư mục ảnh!
* **Script đóng gói `.ipa` miễn phí dòng lệnh:** Tích hợp script 1-click biên dịch dự án iOS không cần chữ ký số nhà phát triển, xuất thẳng file cài đặt `.ipa` ra Desktop để sideload.

---

## 🛠️ Hướng Dẫn Cài Đặt Chi Tiết Từ A - Z

### 📋 Yêu cầu hệ thống:
* Đã cài đặt **Node.js LTS** (phiên bản 18 hoặc 20 trở lên) từ [nodejs.org](https://nodejs.org/).
* Đã cài đặt **Git** (để quản lý mã nguồn).
* Đã cài đặt tiện ích **Tampermonkey** trên trình duyệt Google Chrome.

---

### 1. Cài Đặt Trên Máy Chủ (Windows Server hoặc macOS)

1. Tải dự án từ GitHub của anh về máy:
   ```bash
   git clone <link_git_cua_anh>
   cd trongluong-v2
   ```

2. Cài đặt các thư viện cho **Backend Server**:
   ```bash
   cd server
   npm install
   ```

3. Cài đặt các thư viện cho **Desktop App (Electron)**:
   ```bash
   cd ../desktop
   npm install
   ```

---

### 2. Thiết Lập File Cấu Hình `.env` Cho Server
Tạo một file đặt tên là **`.env`** nằm bên trong thư mục **`server`** với nội dung mẫu sau:

```env
PORT=3000
UPLOAD_DIR=./upload
DB_PATH=./data/trongluong.db
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:19006

# Khóa bảo mật API chống truy cập trái phép
API_KEY=TL_SECRET_SECURE_API_KEY_2026

# Cấu hình tài khoản dịch vụ Google Drive (Google Service Account)
GOOGLE_SERVICE_ACCOUNT_KEY=C:/TrongLuong-v2/server/google-key.json
DRIVE_FOLDER_ID=0AIw9-Tyyr5vWUk9PVA
```
*(Hãy thay thế `C:/TrongLuong-v2/server/google-key.json` bằng đường dẫn tuyệt đối thực tế của file key Google Drive trên máy chủ của anh).*

---

### 3. Cài Đặt Trợ Lý Đối Soát Tampermonkey Trên Máy Tính Nhân Viên

1. Mở trình duyệt Chrome trên máy tính của nhân viên đối soát, cài đặt tiện ích mở rộng **Tampermonkey**.
2. Click vào biểu tượng Tampermonkey ➔ Chọn **Dashboard** ➔ Chọn **Tạo Script mới** (dấu cộng).
3. Copy toàn bộ nội dung file [jms_assistant.user.js](file:///Users/mac/Documents/TrongLuong-v2/trongluong-v2/jms-extension/jms_assistant.user.js) trong dự án của anh dán đè vào màn hình soạn thảo.
4. **Thay đổi cấu hình IP máy chủ:** Tìm dòng số 16:
   ```javascript
   const LOCAL_SERVER = 'http://localhost:3000';
   ```
   Sửa chữ `localhost` thành **Địa chỉ IP mạng WiFi** của máy chủ Windows/Mac trung tâm (ví dụ: `http://192.168.1.100:3000`).
5. Bấm **File** ➔ **Save** (hoặc `Ctrl+S` / `Cmd+S`). F5 lại trang J&T JMS để kích hoạt trợ lý!

---

## 🏃 Hướng Dẫn Vận Hành & Khởi Chạy Nhanh 1-Click

Để đơn giản hóa vận hành tối đa cho nhân viên, dự án cung cấp sẵn các bộ khởi chạy nhanh đặt tại thư mục gốc:

### 💻 Dành Cho Hệ Điều Hành Windows (Khi làm máy chủ):
* Anh chỉ cần click đúp chuột vào file **`KHOI_DONG_HE_THONG.bat`**:
  1. Script tự động bật cửa sổ Command Prompt riêng chạy **Backend Server** thời gian thực.
  2. Đồng thời, tự động mở ứng dụng **Desktop Dashboard** lên màn hình để anh giám sát ca kíp và quản lý tài khoản nhân viên.

### 🍎 Dành Cho Hệ Điều Hành macOS:
* Click đúp chuột vào file **`KHOI_DONG_HE_THONG.command`** để tự động mở tab Terminal mới chạy Server và bật ứng dụng Desktop Dashboard trên màn hình máy Mac.

---

## 📱 Hướng Dẫn Đóng Gói App Di Động `.ipa` Cho iPhone (Free Sideloading)

Anh không cần có sẵn iPhone cắm vào máy Mac vẫn build được file `.ipa` cài đặt nội bộ hoàn toàn miễn phí:

1. Mở thư mục gốc dự án trên máy Mac.
2. Click đúp chuột vào file **`Build_IPA_MienPhi.command`**.
3. Hệ thống Terminal sẽ tự động biên dịch dự án React Native/Expo bằng lệnh native dòng lệnh Xcode (`xcodebuild`), tắt bỏ cơ chế ký code bắt buộc của Apple.
4. **Kết quả:** File **`TrongLuong.ipa`** sẽ được tạo tự động và xuất thẳng ra màn hình **Desktop** của anh sau 1 - 2 phút!
5. Kéo thả file `TrongLuong.ipa` này vào ứng dụng **Sideloadly** trên máy tính để cài đặt và tự động resign sau 7 ngày cực kỳ tiện lợi!

---

## ⚖️ Luồng Hoạt Động Của Trợ Lý Đối Soát J&T JMS:

1. Nhân viên đối soát mở modal đăng ký đổi trọng lượng của một đơn hàng trên J&T JMS.
2. Trợ lý Tampermonkey tự nhận diện mã vận đơn trên giao diện, gửi yêu cầu về local server để lấy cân nặng thực tế từ SQLite và **tự động điền cân nặng vào ô nhập liệu**.
3. **Nạp ảnh tự động bằng 1-Click:** Nhấp vào nút màu xanh lá **`🚀 Tải ảnh/video tự động từ máy tính`** vừa được tiện ích tiêm vào giao diện để nạp thẳng 3 ảnh + 1 video minh chứng lên J&T trong vòng 0.5 giây.
4. **Nhấn nút [+] native:** Nếu nhân viên click vào nút dấu cộng gốc của J&T JMS:
   - Cửa sổ Finder (Mac) hoặc Explorer (Windows) tự động bật mở tại thư mục chứa ảnh cục bộ của đơn hàng đó.
   - Đường dẫn thư mục được **tự động copy vào Clipboard**.
   - Hộp thoại chọn tệp của Chrome hiện lên, nhân viên chỉ cần bấm **`Cmd+Shift+G`** (Mac) hoặc **`Ctrl+L`** (Windows) ➔ nhấn dán **`Cmd+V`** / **`Ctrl+V`** ➔ gõ **Enter** để nhảy thẳng đến thư mục ảnh, nhấn **`Cmd+A`** / **`Ctrl+A`** chọn tất cả tệp và tải lên!

---

Chúc anh vận hành hệ thống **TrongLuong v2** thành công rực rỡ và tối ưu hóa hiệu quả logistics đạt mức cao nhất!
