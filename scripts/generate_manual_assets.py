#!/usr/bin/env python3
"""
Capturador y recortador de imágenes de todas las secciones de la aplicación
para el Manual Oficial de Uso del Wi-Fi & Enterprise Telemetry Analyzer.
"""

import os
import subprocess
import time
from PIL import Image

BASE_DIR = "/home/cesarcely/Proyectos/wifi-roaming-analyzer"
IMG_DIR = os.path.join(BASE_DIR, "docs", "img")
os.makedirs(IMG_DIR, exist_ok=True)

TABS = [
    ("tab-roaming-log", "raw_tab_roaming.png"),
    ("tab-ap-scanner", "raw_tab_ap_scanner.png"),
    ("tab-http-phases", "raw_tab_http_phases.png"),
    ("tab-net-diag", "raw_tab_net_diag.png"),
    ("tab-sedes-zonas", "raw_tab_sedes_zonas.png"),
    ("tab-stats", "raw_tab_stats.png"),
    ("tab-config", "raw_tab_config.png"),
]

def capture_tab(tab_id, output_filename):
    out_path = os.path.join(IMG_DIR, output_filename)
    url = f"http://localhost:8050/?tab={tab_id}"
    cmd = [
        "google-chrome",
        "--headless=new",
        "--disable-gpu",
        "--window-size=1400,2800",
        f"--screenshot={out_path}",
        url
    ]
    print(f"Capturando {tab_id} -> {output_filename}...")
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return out_path

def main():
    print("=== 1. CAPTURANDO PANTALLAS COMPLETAS DE CADA PESTAÑA ===")
    captured = {}
    for tab_id, fname in TABS:
        captured[tab_id] = capture_tab(tab_id, fname)
        time.sleep(0.5)

    print("\n=== 2. PROCESANDO Y RECORTANDO SECCIONES INDIVIDUALES ===")
    # Tomar la primera captura (roaming) como referencia para el layout superior
    ref_im = Image.open(captured["tab-roaming-log"])
    w, h = ref_im.size

    # 1. Cabecera superior
    print("Recortando 01_cabecera_badges.png...")
    ref_im.crop((15, 10, w - 15, 125)).save(os.path.join(IMG_DIR, "01_cabecera_badges.png"))

    # 2. Barra de Control Persistente (Sticky Toolbar)
    print("Recortando 02_barra_control_perfiles.png...")
    ref_im.crop((15, 125, w - 15, 330)).save(os.path.join(IMG_DIR, "02_barra_control_perfiles.png"))

    # 3. Tarjetas principales de métricas (Señal Wi-Fi, AP, Salud de Aplicación)
    print("Recortando 03_tarjetas_metricas_rf.png...")
    ref_im.crop((15, 340, w - 15, 810)).save(os.path.join(IMG_DIR, "03_tarjetas_metricas_rf.png"))

    # 4. Diagnóstico de Roaming & Gráfico en Vivo
    print("Recortando 04_diagnostico_roaming_malla.png...")
    ref_im.crop((15, 820, w - 15, 1250)).save(os.path.join(IMG_DIR, "04_diagnostico_roaming_malla.png"))

    # 5. Analizador de Espectro Wi-Fi
    print("Recortando 05_analizador_espectro_wifi.png...")
    ref_im.crop((15, 1260, w - 15, 1750)).save(os.path.join(IMG_DIR, "05_analizador_espectro_wifi.png"))

    # Recortar la zona de pestañas de cada pestaña específica (Y=1760 hasta donde termine el contenido relevante)
    tab_crops = [
        ("tab-roaming-log", "06_tab_historial_roaming.png", 1760, 2450),
        ("tab-ap-scanner", "07_tab_escaner_aps.png", 1760, 2450),
        ("tab-http-phases", "08_tab_fases_latencia_http.png", 1760, 2480),
        ("tab-net-diag", "09_tab_diagnostico_red_traceroute.png", 1760, 2550),
        ("tab-sedes-zonas", "10_tab_sedes_zonas.png", 1760, 2400),
        ("tab-stats", "11_tab_estadisticas_auditoria.png", 1760, 2480),
        ("tab-config", "12_tab_configuracion_sistema.png", 1760, 2750),
    ]

    for tab_id, crop_name, y1, y2 in tab_crops:
        print(f"Recortando {crop_name} desde {tab_id}...")
        tab_im = Image.open(captured[tab_id])
        tab_im.crop((15, y1, w - 15, min(y2, tab_im.size[1]))).save(os.path.join(IMG_DIR, crop_name))

    print("\n=== TODAS LAS IMÁGENES HAN SIDO CAPTURADAS Y OPTIMIZADAS EXITOSAMENTE ===")
    for f in sorted(os.listdir(IMG_DIR)):
        if f.endswith(".png") and not f.startswith("raw_"):
            p = os.path.join(IMG_DIR, f)
            print(f"  • {f} ({os.path.getsize(p) // 1024} KB)")

if __name__ == "__main__":
    main()
