#!/bin/bash
echo "Deteniendo Wi-Fi & AP Roaming Telemetry Analyzer..."
if command -v fuser &> /dev/null; then
    fuser -k 8050/tcp 2>/dev/null || true
fi
pkill -f "python.*server.py" 2>/dev/null || true
echo "Servidor detenido y puerto liberado."
