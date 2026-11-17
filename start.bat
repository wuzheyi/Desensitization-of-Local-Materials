@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title DD Mask - Local Server

echo.
echo  ==========================================
echo   DD Mask / Local Startup
echo  ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto NO_NODE

netstat -ano | findstr ":5273" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 goto RUNNING

if not exist "node_modules" goto INSTALL
goto READY

:NO_NODE
echo  [ERROR] Node.js not found.
echo  Install Node.js 18+ from https://nodejs.org/ first.
echo.
pause
exit /b 1

:INSTALL
echo  First run: installing dependencies (China mirror)...
echo.
call npm install --registry=https://registry.npmmirror.com --no-fund --no-audit
if errorlevel 1 goto INSTALL_FAIL
goto READY

:INSTALL_FAIL
echo.
echo  [ERROR] Dependency install failed. Check network and retry.
pause
exit /b 1

:RUNNING
echo  Service is already running. Opening browser...
echo  URL: http://127.0.0.1:5273/
start "" http://127.0.0.1:5273/
echo.
echo  To restart: close the window holding port 5273, then run this again.
echo.
ping -n 4 127.0.0.1 >nul
exit /b 0

:READY
echo  Starting server; browser will open shortly...
echo.
echo  URL: http://127.0.0.1:5273/
echo  Close this window to stop the server.
echo.
start "" /min cmd /c "ping -n 6 127.0.0.1 >nul & start http://127.0.0.1:5273/"

call npm start
if errorlevel 1 goto START_FAIL
exit /b 0

:START_FAIL
echo.
echo  [ERROR] Server failed to start. See messages above.
echo.
pause
exit /b 1
