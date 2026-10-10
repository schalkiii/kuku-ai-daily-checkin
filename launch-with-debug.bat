@echo off
rem Launch KukuAI (GenFlowPro) with a CDP debug port (auto-locate exe, close then relaunch).
rem Double-click to use. Default port 9333 (override: launch-with-debug.bat 9334).
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=9333
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\relaunch-with-debug.ps1" -Port %PORT%
if errorlevel 1 (
  echo [ERROR] Failed to open debug port %PORT%.
) else (
  echo [OK] KukuAI is running with debug port %PORT%. Now run: node src\auto-checkin.mjs --port %PORT%
)
pause
