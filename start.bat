@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title DD Mask - Local Server

echo.
echo  ==========================================
echo   DD Mask / Local Startup
echo  ==========================================
echo.

rem ---------- 1. Check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js not found.
    echo  Install Node.js 18+ from https://nodejs.org/ first.
    echo.
    pause
    exit /b 1
)

rem ---------- 2. Already running? Just open the browser ----------
netstat -ano | findstr ":5273" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
    echo  Service is already running. Opening browser...
    echo  URL: http://127.0.0.1:5273/
    start "" http://127.0.0.1:5273/
    echo.
    echo  To restart: close the window holding port 5273, then run this again.
    echo.
    ping -n 4 127.0.0.1 >nul
    exit /b 0
)

rem ---------- 3. First run: install dependencies ----------
if not exist "node_modules" (
    echo  First run: installing dependencies (China mirror)...
    echo.
    call npm install --registry=https://registry.npmmirror.com --no-fund --no-audit
    if errorlevel 1 (
        echo.
        echo  [ERROR] Dependency install failed. Check network and retry.
        pause
        exit /b 1
    )
)

rem ---------- 4. Open browser after the server is ready ----------
start "" /min cmd /c ping -n 5 127.0.0.1 ^>nul ^& start "" http://127.0.0.1:5273/

rem ---------- 5. Run server in foreground (close window to stop) ----------
echo  Starting server; browser will open shortly...
echo.
echo  URL: http://127.0.0.1:5273/
echo  Close this window to stop the server.
echo.
call npm start
if errorlevel 1 (
    echo.
    echo  [ERROR] Server failed to start. See messages above.
)
echo.
pause
