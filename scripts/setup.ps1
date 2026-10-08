# Downloads go2rtc (https://github.com/AlexxIT/go2rtc) for Windows into bin\.
# The version is pinned in go2rtc.version so the dashboard and go2rtc always fit together.
param([string]$Version)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $Version) { $Version = (Get-Content "$root\go2rtc.version" -ErrorAction Stop | Select-Object -First 1).Trim() }

$url = "https://github.com/AlexxIT/go2rtc/releases/download/v$Version/go2rtc_win64.zip"
$zip = Join-Path $env:TEMP "go2rtc_win64_$Version.zip"
New-Item -ItemType Directory -Force "$root\bin" | Out-Null

Write-Host "Downloading go2rtc v$Version from $url"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"   # much faster in Windows PowerShell 5.1
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath "$root\bin" -Force
try { Remove-Item -LiteralPath $zip -Force } catch { }   # temp clean-up is best effort

if (-not (Test-Path "$root\bin\go2rtc.exe")) { throw "go2rtc.exe not found after extracting." }
Write-Host "go2rtc v$Version installed in $root\bin" -ForegroundColor Green
