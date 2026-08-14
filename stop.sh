#!/bin/bash
echo "Deteniendo Wi-Fi & AP Roaming Telemetry Analyzer..."
pkill -f "server.py" 2>/dev/null || true
echo "Servidor detenido y puerto liberado."
