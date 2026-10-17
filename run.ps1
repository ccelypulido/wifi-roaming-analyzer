# Wi-Fi & AP Roaming Telemetry Analyzer - PowerShell Launcher
$ErrorActionPreference = "Stop"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Wi-Fi & AP Roaming Telemetry Analyzer" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "Iniciando servidor en http://localhost:8050 ..." -ForegroundColor Green
Write-Host "Presiona Ctrl+C en esta consola para detener el servidor.`n" -ForegroundColor DarkGray

Set-Location $PSScriptRoot

if (Get-Command python -ErrorAction SilentlyContinue) {
    & python "$PSScriptRoot\server.py" @args
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    & py "$PSScriptRoot\server.py" @args
} else {
    Write-Host "[ERROR] Python no fue encontrado en el PATH." -ForegroundColor Red
    Write-Host "Por favor instala Python 3.6+ desde https://www.python.org/ o Microsoft Store." -ForegroundColor Yellow
    Read-Host "Presiona Enter para salir"
}
