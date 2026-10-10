@echo off
rem One-shot manual run: relaunch KukuAI with debug port, then do check-in + chat reward.
rem For manual double-click testing. Does NOT push Feishu (--no-push). Keeps KukuAI open.
setlocal
set PORT=%1
if "%PORT%"=="" set PORT=9333
set SCRIPT_DIR=%~dp0
set NODE=node
for /f "delims=" %%i in ('where node') do if not defined NODEABS set NODEABS=%%i
if defined NODEABS set NODE="%NODEABS%"

echo [1/2] Relaunching KukuAI with debug port %PORT% ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%scripts\relaunch-with-debug.ps1" -Port %PORT%
if errorlevel 1 ( echo [ERROR] debug port not ready. & pause & exit /b 1 )

echo [2/2] Running auto check-in ...
%NODE% "%SCRIPT_DIR%src\auto-checkin.mjs" --port %PORT% --no-push
echo.
echo Exit code: %errorlevel%  (0 success/partial, 1 fail, 2 already done today)
pause
