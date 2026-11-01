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
        "--virtual-time-budget=2000",
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

    print("\n=== 2. PROCESANDO Y RECORTANDO SECCIONES MODULARES CON BARRA LATERAL ===")
    
    crops = [
        # Vista General Panorámica (Módulo Dashboard)
        ("tab-dashboard", "01_dashboard_general.png", (0, 0, 1600, 1000)),
        # Barra Lateral Izquierda (Sidebar Vertical)
        ("tab-dashboard", "01_sidebar_navegacion.png", (0, 0, 260, 800)),
        # Cabecera Topbar con Migas de Pan y Badges
        ("tab-dashboard", "01_cabecera_badges.png", (0, 0, 1600, 68)),
        # Barra de Control de Perfiles y Ubicación
        ("tab-dashboard", "02_barra_control_perfiles.png", (0, 0, 1600, 240)),
        # Cuadrícula de Tarjetas de Métricas RF y Estado AP
        ("tab-dashboard", "03_tarjetas_metricas_rf.png", (0, 0, 1600, 640)),
        # Diagnóstico de Roaming y Gráfica Sincronizada en Tiempo Real
        ("tab-dashboard", "04_diagnostico_roaming_malla.png", (0, 320, 1600, 1000)),
        # Módulo 3: Analizador de Espectro RF (2.4 / 5 / 6 GHz) con Sidebar
        ("tab-ap-scanner", "05_analizador_espectro_wifi.png", (0, 0, 1600, 600)),
        # Módulo 2: Historial y Auditoría de Roaming con Sidebar
        ("tab-roaming-log", "06_tab_historial_roaming.png", (0, 0, 1600, 650)),
        # Módulo 3: Escáner de APs Vecinos con Sidebar
        ("tab-ap-scanner", "07_tab_escaner_aps.png", (0, 0, 1600, 1000)),
        # Módulo 4: Fases de Latencia HTTP con Sidebar
        ("tab-http-phases", "08_tab_fases_latencia_http.png", (0, 0, 1600, 850)),
        # Módulo 5: Diagnóstico de Red y Traceroute con Sidebar
        ("tab-net-diag", "09_tab_diagnostico_red_traceroute.png", (0, 0, 1600, 850)),
        # Módulo 6: Sedes y Zonas con Sidebar
        ("tab-sedes-zonas", "10_tab_sedes_zonas.png", (0, 0, 1600, 800)),
        # Módulo 7: Estadísticas & Auditoría con Sidebar
        ("tab-stats", "11_tab_estadisticas_auditoria.png", (0, 0, 1600, 900)),
        # Módulo 8: Configuración del Sistema con Sidebar
        ("tab-config", "12_tab_configuracion_sistema.png", (0, 0, 1600, 950)),
        # Módulo 9: Ayuda, Guía & Manuales con Sidebar
        ("tab-help", "13_tab_ayuda_manuales.png", (0, 0, 1600, 850)),
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

