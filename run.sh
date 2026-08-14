#!/bin/bash
echo "======================================================"
echo " 📶 Wi-Fi & AP Roaming Telemetry Analyzer"
echo "======================================================"
echo "Iniciando servidor de telemetría Wi-Fi en http://localhost:8050 ..."

cd "$(dirname "$0")"

# Open browser if available after 1 second
(sleep 1.5 && (xdg-open http://localhost:8050 2>/dev/null || true)) &

python3 server.py
