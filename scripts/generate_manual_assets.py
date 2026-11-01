#!/usr/bin/env python3
"""
Capturador y recortador de imágenes de todas las secciones de la aplicación
para el Manual Oficial de Uso del Wi-Fi & Enterprise Telemetry Analyzer.
Adaptado al nuevo diseño de Barra Lateral Izquierda y Vistas Modulares.
"""

import os
import subprocess
import time
from PIL import Image

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(BASE_DIR, "docs", "img")
os.makedirs(IMG_DIR, exist_ok=True)

TABS = [
    ("tab-dashboard", "raw_tab_dashboard.png"),
    ("tab-roaming-log", "raw_tab_roaming.png"),
    ("tab-ap-scanner", "raw_tab_ap_scanner.png"),
    ("tab-http-phases", "raw_tab_http_phases.png"),
    ("tab-net-diag", "raw_tab_net_diag.png"),
    ("tab-sedes-zonas", "raw_tab_sedes_zonas.png"),
    ("tab-stats", "raw_tab_stats.png"),
    ("tab-config", "raw_tab_config.png"),
    ("tab-help", "raw_tab_help.png"),
]

def capture_tab(tab_id, output_filename):
    out_path = os.path.join(IMG_DIR, output_filename)
    url = f"http://localhost:8050/?tab={tab_id}"
    cmd = [
        "google-chrome",
        "--headless=new",
        "--disable-gpu",
        "--window-size=1600,1050",
        f"--screenshot={out_path}",
        url
    ]
    print(f"Capturando {tab_id} -> {output_filename}...")
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out_path

def main():
    print("=== 1. CAPTURANDO PANTALLAS COMPLETAS EN NUEVA ARQUITECTURA SIDEBAR ===")
    captured = {}
    for tab_id, fname in TABS:
        captured[tab_id] = capture_tab(tab_id, fname)
        time.sleep(0.4)

    print("\n=== 2. PROCESANDO Y RECORTANDO SECCIONES MODULARES ===")
    
    crops = [
        # Vista General Panorámica
        ("tab-dashboard", "01_dashboard_general.png", (0, 0, 1600, 1050)),
        # Cabecera Topbar con Migas de Pan y Badges
        ("tab-dashboard", "01_cabecera_badges.png", (0, 0, 1600, 68)),
        # Barra Lateral Izquierda (Sidebar)
        ("tab-dashboard", "01_sidebar_navegacion.png", (0, 0, 260, 720)),
        # Barra de Control de Perfiles y Ubicación
        ("tab-dashboard", "02_barra_control_perfiles.png", (270, 75, 1590, 175)),
        # Cuadrícula de 4 Tarjetas de Métricas RF
        ("tab-dashboard", "03_tarjetas_metricas_rf.png", (270, 185, 1590, 620)),
        # Gráfica Sincronizada en Tiempo Real (Chart.js)
        ("tab-dashboard", "04_diagnostico_roaming_malla.png", (270, 625, 1590, 1040)),
        # Analizador de Espectro RF (2.4 / 5 / 6 GHz)
        ("tab-ap-scanner", "05_analizador_espectro_wifi.png", (270, 75, 1590, 495)),
        # Módulo 2: Historial y Auditoría de Roaming
        ("tab-roaming-log", "06_tab_historial_roaming.png", (270, 75, 1590, 650)),
        # Módulo 3: Escáner de APs Vecinos
        ("tab-ap-scanner", "07_tab_escaner_aps.png", (270, 505, 1590, 1040)),
        # Módulo 4: Fases de Latencia HTTP
        ("tab-http-phases", "08_tab_fases_latencia_http.png", (270, 75, 1590, 780)),
        # Módulo 5: Diagnóstico de Red y Traceroute
        ("tab-net-diag", "09_tab_diagnostico_red_traceroute.png", (270, 75, 1590, 720)),
        # Módulo 6: Sedes y Zonas
        ("tab-sedes-zonas", "10_tab_sedes_zonas.png", (270, 75, 1590, 680)),
        # Módulo 7: Estadísticas & Auditoría
        ("tab-stats", "11_tab_estadisticas_auditoria.png", (270, 75, 1590, 850)),
        # Módulo 8: Configuración del Sistema
        ("tab-config", "12_tab_configuracion_sistema.png", (270, 75, 1590, 920)),
    ]

    for tab_id, crop_name, box in crops:
        print(f"Recortando {crop_name} desde {tab_id}...")
        tab_im = Image.open(captured[tab_id])
        tab_im.crop(box).save(os.path.join(IMG_DIR, crop_name))

    # Limpiar archivos temporales raw_
    for tab_id, fname in TABS:
        raw_file = os.path.join(IMG_DIR, fname)
        if os.path.exists(raw_file):
            try:
                os.remove(raw_file)
            except OSError:
                pass

    print("\n=== TODAS LAS IMÁGENES HAN SIDO CAPTURADAS Y OPTIMIZADAS EXITOSAMENTE ===")
    for f in sorted(os.listdir(IMG_DIR)):
        if f.endswith(".png") and not f.startswith("raw_"):
            p = os.path.join(IMG_DIR, f)
            print(f"  • {f} ({os.path.getsize(p) // 1024} KB)")

if __name__ == "__main__":
    main()

