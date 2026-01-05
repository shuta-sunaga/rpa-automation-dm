@echo off
chcp 65001 > nul
title Image RPA Studio

echo ===============================================
echo   Image RPA Studio - Starting...
echo ===============================================
echo.

cd /d "%~dp0"

echo [1/2] Building TypeScript...
call npm run build:electron
if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo [2/2] Starting Electron app...
call npm start

pause
