# Switches the spider easter egg on or off:  scripts\spider.ps1 on|off
param([Parameter(Mandatory = $true)][ValidateSet("on", "off")][string]$State)
$file = Join-Path (Split-Path -Parent $PSScriptRoot) "www\state.json"
if ($State -eq "on") {
    Set-Content -Path $file -Value '{"spider": true}' -Encoding ascii
    Write-Host "Spider is ON (visible within ~5 seconds)." -ForegroundColor Green
} else {
    Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
    Write-Host "Spider is OFF." -ForegroundColor Yellow
}
