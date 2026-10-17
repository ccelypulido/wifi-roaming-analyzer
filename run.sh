#!/bin/bash

# Funciones de ayuda
show_help() {
    echo "Uso: $0 [OPCIONES]"
    echo ""
    echo "Opciones:"
    echo "  -i, --interface <iface>  Especifica la interfaz Wi-Fi a usar (ej: wlp2s0)"
    echo "  --list                   Lista todas las interfaces Wi-Fi disponibles"
    echo "  --port <puerto>          Especifica el puerto (defecto: 8050)"
    echo "  -h, --help               Muestra esta ayuda"
    echo ""
    echo "Ejemplos:"
    echo "  $0                      # Detecta interfaz automáticamente"
    echo "  $0 -i wlan0             # Usa la interfaz wlan0"
    echo "  $0 --list               # Lista interfaces disponibles"
    exit 0
}

# Parsear argumentos
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            ;;
        --list)
            python3 "$(dirname "$0")/server.py" --list
            exit 0
            ;;
        -i|--interface)
            INTERFACE_ARG="-i $2"
            shift 2
            ;;
        --port)
            PORT_ARG="--port $2"
            shift 2
            ;;
        *)
            echo "Opción desconocida: $1"
            show_help
            ;;
    esac
done

echo "======================================================"
echo " 📶 Wi-Fi & AP Roaming Telemetry Analyzer"
echo "======================================================"
echo "Iniciando servidor de telemetría Wi-Fi en http://localhost:8050 ..."
[[ -n "$INTERFACE_ARG" ]] && echo "Interfaz especificada: $INTERFACE_ARG"

cd "$(dirname "$0")"

# Pasar argumentos a server.py (server.py abre el navegador automáticamente)
python3 server.py $INTERFACE_ARG $PORT_ARG
