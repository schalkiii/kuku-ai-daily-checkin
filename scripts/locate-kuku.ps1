# Locate KukuAI (GenFlowPro.exe). Prints the full path to stdout, or exits 1 if not found.
# Resolution order: -ExePath arg -> running process -> registry uninstall -> common dirs.
param(
    [string]$ExePath = ''
)
$ErrorActionPreference = 'SilentlyContinue'
$exeName = 'GenFlowPro.exe'

function Test-Exe($p) {
    if ([string]::IsNullOrWhiteSpace($p)) { return $false }
    return (Test-Path -LiteralPath $p -PathType Leaf) -and ($p -match '(?i)genflowpro\.exe$')
}

# 1) explicit path
if ($ExePath) {
    if (Test-Exe $ExePath) { Write-Output $ExePath; exit 0 }
    $cand = Join-Path $ExePath $exeName
    if (Test-Exe $cand) { Write-Output $cand; exit 0 }
}

# 2) running process
$proc = Get-CimInstance Win32_Process -Filter "Name='$exeName'" |
    Where-Object { Test-Exe $_.ExecutablePath } |
    Select-Object -First 1
if ($proc) { Write-Output $proc.ExecutablePath; exit 0 }

# 3) registry uninstall entries
$roots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
foreach ($r in $roots) {
    $items = Get-ItemProperty $r | Where-Object {
        ($_.DisplayName -match 'GenFlow|Kuku') -or
        ($_.InstallLocation -match 'KukuAI|GenFlow') -or
        ($_.DisplayIcon -match 'KukuAI|GenFlow')
    }
    foreach ($it in $items) {
        foreach ($val in @($it.DisplayIcon, $it.InstallLocation)) {
            if (-not $val) { continue }
            if (Test-Exe $val) { Write-Output $val; exit 0 }
            $c = Join-Path ($val -replace '\\[^\\]*\.exe$','') $exeName
            if (Test-Exe $c) { Write-Output $c; exit 0 }
            $c2 = Join-Path $val $exeName
            if (Test-Exe $c2) { Write-Output $c2; exit 0 }
        }
    }
}

# 4) common dirs (shallow scan)
$bases = @(
    (Join-Path $env:APPDATA 'Baidu\KukuAI'),
    (Join-Path $env:LOCALAPPDATA 'Programs'),
    'C:\Program Files',
    'C:\Program Files (x86)',
    $env:USERPROFILE
)
foreach ($b in $bases) {
    if (-not (Test-Path $b)) { continue }
    $d = Join-Path $b $exeName
    if (Test-Exe $d) { Write-Output $d; exit 0 }
    $found = Get-ChildItem -LiteralPath $b -Recurse -Depth 3 -Filter $exeName -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found -and (Test-Exe $found.FullName)) { Write-Output $found.FullName; exit 0 }
}

Write-Error 'KukuAI (GenFlowPro.exe) not found.'
exit 1
