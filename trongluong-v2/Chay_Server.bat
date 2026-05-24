@echo off
title KHOI DONG SERVER TRONG LUONG V2
color 0B
echo ===================================================
echo   DANG KHOI DONG SERVER TRONG LUONG V2
echo ===================================================
echo.
cd /d "%~dp0\server"
npm start
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Khong the khoi dong server!
    echo Vui long kiem tra xem da cai dat Node.js tren Windows chua.
    echo.
    pause
)
