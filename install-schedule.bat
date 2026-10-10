@echo off
rem Register a daily scheduled task "KukuDailyCheckin" that runs scheduled-run.bat.
rem Usage: install-schedule.bat [HH:MM]   (default 12:00, 24-hour). Re-run to change the time.
setlocal
set TIMEARG=%1
if "%TIMEARG%"=="" set TIMEARG=12:00
set SCRIPT_DIR=%~dp0
set TASKNAME=KukuDailyCheckin
set BAT=%SCRIPT_DIR%scheduled-run.bat

echo Registering scheduled task "%TASKNAME%" daily at %TIMEARG% ...
echo Command: "%BAT%"

schtasks /Create /F /SC DAILY /ST %TIMEARG% /TN "%TASKNAME%" /TR "\"%BAT%\""
if errorlevel 1 (
  echo [ERROR] Failed to create the scheduled task.
  pause
  exit /b 1
)
echo [OK] Task created. Runs %BAT% daily at %TIMEARG%.
echo Manage it in "Task Scheduler" (taskschd.msc) or: schtasks /Query /TN %TASKNAME% /V
pause
