#!/bin/bash
clear
echo "==================================================="
echo "  DANG KHOI DONG TOAN BO HE THONG TRONG LUONG V2 (macOS)"
echo "==================================================="
echo ""

# 1. Chạy Backend Server trong cửa sổ Terminal mới
osascript -e 'tell application "Terminal" to do script "cd \"'"$(dirname "$0")"'/server\" && npm start"'

# 2. Chạy Desktop Dashboard trong cửa sổ hiện tại
cd "$(dirname "$0")/desktop"
npm start
