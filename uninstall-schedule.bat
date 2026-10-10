@echo off
rem Remove the daily scheduled task "KukuDailyCheckin".
setlocal
schtasks /Delete /F /TN "KukuDailyCheckin"
if errorlevel 1 ( echo [ERROR] Failed to delete task (maybe it does not exist). ) else ( echo [OK] Task KukuDailyCheckin deleted. )
pause
