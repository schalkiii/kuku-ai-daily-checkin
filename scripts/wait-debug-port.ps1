# Poll the CDP debug endpoint until /json/version returns 200 (and optionally belongs to KukuAI).
param(
    [int]$Port = 9333,
    [int]$TimeoutSec = 45,
    [switch]$RequireKuku
)
$ErrorActionPreference = 'SilentlyContinue'
$deadline = (Get-Date).AddSeconds($TimeoutSec)
while ((Get-Date) -lt $deadline) {
    try {
        $v = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 3
        $isKuku = ($v.User-Agent -match 'KuKuGenFlow|GenFlow|KukuAI') -or ($v.Browser -match 'Chrome')
        if (-not $RequireKuku -or $isKuku) {
            Write-Output ("DevTools listening on port $Port : " + $v.Browser)
            exit 0
        }
    } catch { }
    Start-Sleep -Seconds 1
}
Write-Error "Debug port $Port not ready within ${TimeoutSec}s."
exit 1
