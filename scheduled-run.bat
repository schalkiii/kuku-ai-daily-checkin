@echo off
rem Non-interactive one-shot for Windows Task Scheduler.
rem Close -> relaunch KukuAI with debug port -> run auto check-in (with --force --close) -> append log.
rem Pushes Feishu if a webhook is configured (config.json / env). No pause (avoids hanging).
setlocal
set PORT=9333
set SCRIPT_DIR=%~dp0
set LOGDIR=%SCRIPT_DIR%logs
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set LOGFILE=%LOGDIR%\checkin.log

set NODE=node
for /f "delims=" %%i in ('where node') do if not defined NODEABS set NODEABS=%%i
if defined NODEABS set NODE="%NODEABS%"

echo ===================== %DATE% %TIME% ===================== >> "%LOGFILE%"
echo [scheduled-run] relaunch with debug port %PORT% >> "%LOGFILE%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\relaunch-with-debug.ps1" -Port %PORT% >> "%LOGFILE%" 2>&1

echo [scheduled-run] auto check-in >> "%LOGFILE%"
%NODE% "%SCRIPT_DIR%src\auto-checkin.mjs" --port %PORT% --force --close >> "%LOGFILE%" 2>&1
echo [scheduled-run] exit code %errorlevel% >> "%LOGFILE%"
