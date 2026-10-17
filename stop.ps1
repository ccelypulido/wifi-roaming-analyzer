# Wi-Fi & AP Roaming Telemetry Analyzer - Stop Script for PowerShell
$ErrorActionPreference = "SilentlyContinue"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Deteniendo Wi-Fi & AP Roaming Telemetry Analyzer... " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$stopped = $false

# 1. Detener procesos escuchando en el puerto 8050
try {
    $connections = Get-NetTCPConnection -LocalPort 8050 -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $connections) {
        $pId = $conn.OwningProcess
        if ($pId -and $pId -ne 0) {
            Write-Host "Cerrando proceso en puerto 8050 (PID $pId)..." -ForegroundColor Yellow
            Stop-Process -Id $pId -Force -ErrorAction SilentlyContinue
            $stopped = $true
        }
    }
} catch {}

# 2. Detener procesos Python ejecutando server.py
try {
    $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*server.py*" }
    foreach ($p in $processes) {
        Write-Host "Terminando proceso server.py (PID $($p.ProcessId))..." -ForegroundColor Yellow
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        $stopped = $true
    }
} catch {}

# 3. Fallback con netstat si no se detectó por WMI/CIM
if (-not $stopped) {
    $lines = netstat -ano | Select-String ":8050\s+.*LISTENING"
    foreach ($line in $lines) {
        $tokens = ($line.ToString().Trim() -split "\s+")
        $targetPid = $tokens[-1]
        if ($targetPid -and $targetPid -ne "0") {
            Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
            $stopped = $true
        }
    }
}

Write-Host "`nServidor detenido y puerto 8050 liberado exitosamente.`n" -ForegroundColor Green
