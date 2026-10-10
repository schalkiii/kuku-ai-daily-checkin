# Close all GenFlowPro processes and wait until they are fully exited (release Electron SingletonLock).
param([int]$TimeoutSec = 30)
$ErrorActionPreference = 'SilentlyContinue'
$exeName = 'GenFlowPro.exe'

$pids = Get-CimInstance Win32_Process -Filter "Name='$exeName'" | ForEach-Object { $_.ProcessId }
if (-not $pids) { Write-Output 'No GenFlowPro running.'; exit 0 }

Write-Output ("Closing GenFlowPro PIDs: " + ($pids -join ', '))
taskkill /IM $exeName /T /F 2>$null | Out-Null

$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    $still = Get-CimInstance Win32_Process -Filter "Name='$exeName'"
    if (-not $still) { Write-Output 'All GenFlowPro processes exited.'; exit 0 }
    Start-Sleep -Milliseconds 800
}
# force kill tree as last resort
Get-CimInstance Win32_Process -Filter "Name='$exeName'" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Output 'WARNING: some GenFlowPro processes remained after timeout.'
exit 0
