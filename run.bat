@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo   Wi-Fi ^& AP Roaming Telemetry Analyzer
echo ======================================================
echo Iniciando servidor en http://localhost:8050 ...
echo Presiona Ctrl+C en esta ventana para detener el servidor.
echo.

where python >nul 2>nul
if %errorlevel% equ 0 (
    python server.py %*
    goto end
)

where py >nul 2>nul
if %errorlevel% equ 0 (
    py server.py %*
    goto end
)

echo [ERROR] No se encontro Python en el sistema.
echo Por favor instala Python 3.6 o superior desde https://www.python.org/
pause

:end
endlocal
