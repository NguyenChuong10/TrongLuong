@echo off
title HE THONG TRONG LUONG V2 - ENGINE
color 0A
echo ===================================================
echo   DANG KHOI DONG TOAN BO HE THONG TRONG LUONG V2
echo ===================================================
echo.

echo 1. Dang khoi dong Backend Server (Cua so rieng)...
start "TrongLuong V2 - Backend Server" cmd /c "cd /d "%~dp0\server" && npm start"

echo.
echo 2. Dang khoi dong Desktop Dashboard...
cd /d "%~dp0\desktop"
npm start

if %errorlevel% neq 0 (
    echo.
    echo [LOI] Khong the khoi dong phan he Desktop Dashboard!
    echo Vui long kiem tra xem da chay 'npm install' o ca hai thu muc 'server' va 'desktop' chua.
    echo.
    pause
)
