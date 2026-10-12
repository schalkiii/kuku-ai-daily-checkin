@echo off
rem Register a daily scheduled task "KukuDailyCheckin" that runs scheduled-run.bat.
rem Usage: install-schedule.bat [HH:MM]   (default 12:00, 24-hour). Re-run to change the time.
setlocal
set TIMEARG=%1
if "%TIMEARG%"=="" set TIMEARG=12:00
set SCRIPT_DIR=%~dp0

echo Registering scheduled task "KukuDailyCheckin" daily at %TIMEARG% ...
echo (via install-schedule.ps1: interactive logon + StartWhenAvailable catch-up)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%install-schedule.ps1" -Time %TIMEARG%
if errorlevel 1 (
  echo [ERROR] Failed to create the scheduled task.
  pause
  exit /b 1
)
pause
