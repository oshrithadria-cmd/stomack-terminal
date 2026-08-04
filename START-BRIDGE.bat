@echo off
chcp 65001 >nul
title Hologram Bridge - STOMACK
color 0A
echo ================================================================
echo         STOMACK  -  Hologram Bridge (phone -^> fan)
echo ================================================================
echo.
echo   Keep this window OPEN during the event.
echo   It listens to the phones (via the QR) and drives the fan.
echo.
cd /d "%~dp0bridge"
if not exist node_modules (
  echo   First run: installing dependencies...
  call npm install
  echo.
)
echo   Starting bridge...
echo.
node server.js
echo.
echo   (Bridge stopped. Close this window or press a key.)
pause >nul
