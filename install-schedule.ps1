# Register the daily scheduled task "KukuDailyCheckin" that runs scheduled-run.bat
# (close kuku -> relaunch with debug port -> CDP auto check-in -> close).
#
# Logon mode is INTERACTIVE on purpose: CDP drives the kuku Electron GUI, which
# only exists inside a logged-on desktop session. So this task runs only while
# you are signed in (it can still fire while the screen is LOCKED, since the
# session is alive) and needs NO stored password. The non-interactive daily
# fallback for kuku lives in the sister project ai-ide-daily-checkin
# (checkin_kuku.py, offline login-state -> freepoint API), which runs whether
# or not you are logged on because it decrypts cookies via DPAPI.
#
# StartWhenAvailable: if the scheduled time was missed (PC asleep/off), the task
# runs as soon as you are back at an interactive session instead of skipping.
#
# ASCII-only on purpose: Windows PowerShell 5.1 reads .ps1 as the ANSI/GBK code
# page unless the file has a UTF-8 BOM, so Chinese text here would mis-parse.
#Requires -Version 5
[CmdletBinding()]
param(
    [string]$Time = '12:00',
    [string]$TaskName = 'KukuDailyCheckin'
)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$bat = Join-Path $root 'scheduled-run.bat'

$action = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $Time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
# Interactive principal = current user, run only when logged on, no password.
$principal = New-ScheduledTaskPrincipal -UserId ('{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME) `
    -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

$next = (Get-ScheduledTaskInfo -TaskName $TaskName).NextRunTime
Write-Host ''
Write-Host ("[OK] Registered '" + $TaskName + "' daily at " + $Time + " (interactive, StartWhenAvailable catch-up).")
Write-Host ('  next run: ' + $next)
Write-Host ('  verify : schtasks /Query /TN "' + $TaskName + '" /FO LIST /V')
Write-Host ('  test   : schtasks /Run /TN "' + $TaskName + '"  then open logs\checkin.log')
Write-Host ('  remove : uninstall-schedule.bat')
