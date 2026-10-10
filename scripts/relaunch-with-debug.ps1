# Force-close KukuAI, relaunch it with a CDP debug port, and wait until the port is ready.
# Reuses locate-kuku.ps1 for path resolution. Safe against Electron single-instance lock races.
param(
    [string]$ExePath = '',
    [int]$Port = 9333,
    [string]$Profile = '',
    [int]$Retries = 3
)
$ErrorActionPreference = 'SilentlyContinue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# locate exe
if ($ExePath) {
    $exe = & (Join-Path $here 'locate-kuku.ps1') -ExePath $ExePath
} else {
    $exe = & (Join-Path $here 'locate-kuku.ps1')
}
$exe = ($exe | Select-Object -Last 1)
if (-not $exe -or -not (Test-Path -LiteralPath $exe)) {
    Write-Error 'KukuAI exe not found. Pass -ExePath.'
    exit 1
}
Write-Output "Using exe: $exe"

for ($attempt = 1; $attempt -le $Retries; $attempt++) {
    Write-Output "Attempt $attempt / $Retries : close -> launch with debug port $Port"
    & (Join-Path $here 'close-kuku.ps1') | Out-Null
    Start-Sleep -Seconds 2

    $argList = "--remote-debugging-port=$Port"
    if ($Profile) { $argList += " --user-data-dir=`"$Profile`"" }
    if ($Profile) {
        Start-Process -FilePath $exe -ArgumentList @("--remote-debugging-port=$Port", "--user-data-dir=$Profile")
    } else {
        Start-Process -FilePath $exe -ArgumentList "--remote-debugging-port=$Port"
    }

    & (Join-Path $here 'wait-debug-port.ps1') -Port $Port -TimeoutSec 45 -RequireKuku
    if ($LASTEXITCODE -eq 0) {
        Write-Output "Debug port $Port is ready."
        exit 0
    }
    Write-Output "Port not ready, retrying..."
}
Write-Error "Failed to open debug port $Port after $Retries attempts."
exit 1
