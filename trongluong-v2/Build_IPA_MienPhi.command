#!/bin/bash
clear
echo "==================================================="
echo "  DANG TU DONG BUILD IPA MIEN PHI KHONG CAN KY"
echo "==================================================="
echo ""

# Thư mục hiện tại của script
BASE_DIR="$(dirname "$0")"
IOS_DIR="$BASE_DIR/app/ios"
DESKTOP_DIR="$HOME/Desktop"

echo "1. Dang di chuyen vao thu muc iOS..."
cd "$IOS_DIR" || exit 1

echo "2. Dang tien hanh bien dich app khong can ky (Unsigned Build)..."
echo "   Vui long cho doi trong giay lat (khoang 1-3 phut)..."
echo ""

# Chạy lệnh xcodebuild bỏ qua ký code hoàn toàn và lưu vào thư mục build tạm
xcodebuild -workspace TrongLuong.xcworkspace \
           -scheme TrongLuong \
           -configuration Release \
           -sdk iphoneos \
           -derivedDataPath ./build \
           CODE_SIGNING_ALLOWED=NO \
           CODE_SIGNING_REQUIRED=NO \
           AD_HOC_CODE_SIGNING_ALLOWED=YES

if [ $? -ne 0 ]; then
    echo ""
    echo "[LOI] Bien dich app that bai! Vui long kiem tra cac dong log loi phia tren."
    exit 1
fi

echo ""
echo "3. Bien dich thanh cong! Dang dong goi file .ipa..."

APP_PATH="./build/Build/Products/Release-iphoneos/TrongLuong.app"
TEMP_PAYLOAD="$IOS_DIR/Payload"

# Dọn dẹp và tạo thư mục Payload
rm -rf "$TEMP_PAYLOAD"
mkdir -p "$TEMP_PAYLOAD"

# Copy file .app vào Payload
cp -R "$APP_PATH" "$TEMP_PAYLOAD/"

# Nén thành zip và đổi tên thành .ipa xuất thẳng ra Desktop
rm -f "$DESKTOP_DIR/TrongLuong.ipa"
cd "$IOS_DIR" || exit 1
zip -r "$DESKTOP_DIR/TrongLuong.ipa" Payload > /dev/null

# Dọn dẹp thư mục tạm
rm -rf "$TEMP_PAYLOAD"
rm -rf "$IOS_DIR/build"

echo ""
echo "==================================================="
echo "  🎉🎉 HOAN THANH RUC RO! 🎉🎉"
echo "==================================================="
echo "  -> File IPA cua anh da duoc tao tai: Desktop/TrongLuong.ipa"
echo "  -> Bay gio anh co the keo file nay vao Sideloadly de tu resign!"
echo "==================================================="
echo ""
read -p "Nhan Enter de thoat..."
