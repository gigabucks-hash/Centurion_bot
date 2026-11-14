@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Menyalakan Centurion Trade...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\Start-Centurion-Web.ps1"
echo.
echo Tekan tombol apa saja untuk menutup jendela ini. Aplikasi di browser tetap berjalan.
pause
