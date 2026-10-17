@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ======================================================
echo   Deteniendo Wi-Fi ^& AP Roaming Telemetry Analyzer...
echo ======================================================

set KILLED=0

:: 1. Liberar procesos escuchando en puerto 8050 usando netstat
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr /r ":8050 .*LISTENING"') do (
    if not "%%a"=="0" (
        echo Cerrando proceso en puerto 8050 (PID %%a)...
        taskkill /F /PID %%a >nul 2>&1
        set KILLED=1
    )
)

:: 2. Terminar procesos python ejecutando server.py
powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*server.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo.
echo Servidor detenido y puerto 8050 liberado.
echo ======================================================
timeout /t 3 >nul 2>&1
endlocal
