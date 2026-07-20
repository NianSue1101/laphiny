@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Laphiny Web Preview

echo ========================================
echo   Laphiny Web Preview
echo ========================================
echo.

REM Check node_modules
if not exist "node_modules" (
  echo [1/3] Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo 依赖安装失败，请检查网络连接后重试。
    pause
    exit /b 1
  )
)

echo [1/3] Building web assets...
call npm.cmd run web:build
if errorlevel 1 (
  echo.
  echo Web 构建失败，请查看上方错误信息。
  pause
  exit /b 1
)

echo.
echo [2/3] Starting preview server...
echo [3/3] Opening browser...
echo.
echo ========================================
echo   Preview: http://localhost:8081/laphiny/
echo   Press Ctrl+C to stop the server.
echo ========================================
echo.

node scripts/preview-web.mjs
if errorlevel 1 (
  echo.
  echo 预览服务器启动失败，请查看上方错误信息。
  pause
)
