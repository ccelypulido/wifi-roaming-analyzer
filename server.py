#!/usr/bin/env python3
import http.server
import socketserver
import json
import os
import re
import subprocess
import threading
import time
import sys
import socket
import argparse
import webbrowser
import io
import csv
import datetime
import zipfile
import mimetypes
from urllib.parse import parse_qs, urlparse

IS_WINDOWS = sys.platform == 'win32'
PORT = 8050
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(PROJECT_DIR, 'static')
DOCS_DIR = os.path.join(PROJECT_DIR, 'docs')

from core.oui_manager import oui_manager
from core.ap_manager import ap_manager
from core import probe, net_diag, secrets_manager
from core.ai_agent import agent_runtime, ALLOWED_MODELS, PHYSICAL_CONTEXT_SCHEMA
from database import database

# Initialize SQLite database
database.init_db()

# Predefined multipurpose profiles
PRESETS = {
    "store": {
        "id": "store",
        "name": "🏬 Tienda / Punto de Venta (POS)",
        "default_target_url": "https://1.1.1.1",
        "description": "Optimizado para cajas POS, pasarelas de pago y piso de venta",
        "default_location": "Tienda_Principal",
        "default_zone": "Cajas:1-4",
        "default_zones": ["Cajas:1-4", "Cajas:5-8", "Piso de Ventas:Pasillo Central", "Mostrador Atencion", "Bodega Tienda", "Probadores"]
    },
    "office": {
        "id": "office",
        "name": "🏢 Sede Administrativa / Oficinas",
        "default_target_url": "https://outlook.office.com",
        "description": "Optimizado para laptops, ERPs, VoIP y videollamadas corporativas",
        "default_location": "Sede_Administrativa",
        "default_zone": "Recepcion Piso 1",
        "default_zones": ["Recepcion Piso 1", "Presidencia y Gerencia", "Sala de Juntas A", "Operaciones Piso 2", "Tecnologia e Infraestructura"]
    },
    "warehouse": {
        "id": "warehouse",
        "name": "🏭 Centro de Distribución / Bodega",
        "default_target_url": "https://alkop.sce.manh.com/ping",
        "description": "Optimizado para terminales PDA, pistolas RF y Manhattan WMS/SCE",
        "default_location": "Bodega_CLEN",
        "default_zone": "Rack:1-5",
        "default_zones": ["Rack:1-5", "Rack:6-10", "Rack:11-15", "Rack:16-20", "Muelles:Entrada", "Muelles:Despacho", "Mezanine", "Bunker"]
    },
    "custom": {
        "id": "custom",
        "name": "⚙️ Personalizado / Libre",
        "default_target_url": "https://1.1.1.1",
        "description": "Diagnóstico flexible con cualquier URL o puerto HTTP/HTTPS",
        "default_location": "Sede_Personalizada",
        "default_zone": "Zona General",
        "default_zones": ["Zona General", "Prueba 1"]
    }
}

def lookup_vendor(bssid):
    return oui_manager.lookup(bssid)

def lookup_ap_name(bssid):
    return ap_manager.lookup_name(bssid)

def run_windows_cmd(cmd_args, timeout=3):
    """Ejecuta un comando en Windows y decodifica la salida manejando páginas de códigos UTF-8, OEM (cp850/cp437) y CP1252."""
    try:
        proc = subprocess.run(cmd_args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout)
        raw = proc.stdout
        encodings = ['utf-8']
        try:
            import ctypes
            oem_cp = ctypes.windll.kernel32.GetOEMCP()
            encodings.append(f'cp{oem_cp}')
        except Exception:
            pass
        encodings.extend(['cp850', 'cp437', 'cp1252', 'latin1'])
        for enc in encodings:
            try:
                decoded = raw.decode(enc)
                return decoded.replace('\r\n', '\n').replace('\r', '\n')
            except (UnicodeDecodeError, LookupError):
                continue
        return raw.decode('latin1', errors='replace').replace('\r\n', '\n').replace('\r', '\n')
    except Exception:
        return ""

def trigger_windows_wifi_scan():
    """Dispara un escaneo activo de Wi-Fi mediante WlanScan (wlanapi.dll en Windows).
    Evita el throttling del controlador y mantiene visible la totalidad de APs redundantes."""
    if not IS_WINDOWS:
        return
    try:
        import ctypes
        from ctypes import wintypes

        class GUID(ctypes.Structure):
            _fields_ = [
                ('Data1', wintypes.DWORD),
                ('Data2', wintypes.WORD),
                ('Data3', wintypes.WORD),
                ('Data4', wintypes.BYTE * 8)
            ]

        class WLAN_INTERFACE_INFO(ctypes.Structure):
            _fields_ = [
                ('InterfaceGuid', GUID),
                ('strInterfaceDescription', wintypes.WCHAR * 256),
                ('isState', wintypes.DWORD)
            ]

        class WLAN_INTERFACE_INFO_LIST(ctypes.Structure):
            _fields_ = [
                ('dwNumberOfItems', wintypes.DWORD),
                ('dwIndex', wintypes.DWORD),
                ('InterfaceInfo', WLAN_INTERFACE_INFO * 1)
            ]

        wlanapi = ctypes.windll.wlanapi
        handle = wintypes.HANDLE()
        neg = wintypes.DWORD()
        if wlanapi.WlanOpenHandle(2, None, ctypes.byref(neg), ctypes.byref(handle)) == 0:
            ppList = ctypes.POINTER(WLAN_INTERFACE_INFO_LIST)()
            if wlanapi.WlanEnumInterfaces(handle, None, ctypes.byref(ppList)) == 0:
                info_list = ppList.contents
                if info_list.dwNumberOfItems > 0:
                    guid = info_list.InterfaceInfo[0].InterfaceGuid
                    wlanapi.WlanScan(handle, ctypes.byref(guid), None, None, None)
                wlanapi.WlanFreeMemory(ppList)
            wlanapi.WlanCloseHandle(handle, None)
    except Exception:
        pass

_cached_link_speed = {"speed": "N/A", "time": 0}

def get_windows_link_speed():
    """Fallback si netsh no reporta velocidades: consulta Get-NetAdapter LinkSpeed via powershell"""
    now = time.time()
    if (now - _cached_link_speed["time"] < 10) and _cached_link_speed["speed"] != "N/A":
        return _cached_link_speed["speed"]
    try:
        cmd = [
            'powershell', '-NoProfile', '-NonInteractive', '-Command',
            "(Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and ($_.MediaType -match '802.11|Wireless|Wi-Fi' -or $_.Name -match 'Wi-Fi') } | Select-Object -First 1).LinkSpeed"
        ]
        out = run_windows_cmd(cmd, timeout=2).strip()
        if out and any(c.isdigit() for c in out):
            _cached_link_speed["speed"] = out
            _cached_link_speed["time"] = now
            return out
    except Exception:
        pass
    return None

def get_available_wifi_interfaces():
    """Obtiene lista de todas las interfaces Wi-Fi disponibles"""
    interfaces = []
    if IS_WINDOWS:
        try:
            out = run_windows_cmd(['netsh', 'wlan', 'show', 'interfaces'], timeout=3)
            for m in re.finditer(r'(?i)^\s*(?:Name|Nombre)\s*:\s*(.+)$', out, re.MULTILINE):
                iface_name = m.group(1).strip()
                if iface_name and iface_name not in interfaces:
                    interfaces.append(iface_name)
        except Exception:
            pass
        if not interfaces:
            interfaces.append("Wi-Fi")
        return interfaces

    try:
        out = subprocess.check_output(['iw', 'dev'], text=True, errors='replace', stderr=subprocess.DEVNULL)
        for match in re.finditer(r'Interface\s+(\w+)', out):
            interfaces.append(match.group(1))
    except:
        pass
    
    if not interfaces:
        try:
            out = subprocess.check_output(['iwconfig'], text=True, errors='replace', stderr=subprocess.DEVNULL)
            for line in out.split('\n'):
                if line and not line.startswith(' '):
                    iface = line.split()[0]
                    interfaces.append(iface)
        except:
            pass
    
    return interfaces

HISTORY_FILE = os.path.join(PROJECT_DIR, 'data', 'roaming_history.json')

def load_saved_roaming_events():
    """Carga los eventos de roaming guardados del archivo json o base de datos"""
    events = database.get_roaming_events(limit=50)
    if events:
        return events
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception:
            pass
    return []

def save_roaming_events(events):
    """Guarda los eventos de roaming en el archivo json para compatibilidad"""
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(events[:50], f, indent=2, ensure_ascii=False)
    except Exception:
        pass

def parse_windows_interface(output, target_iface=None):
    """Parsea la salida de 'netsh wlan show interfaces' en Windows (Español e Inglés)"""
    res = {
        "bssid": None,
        "ssid": None,
        "signal_pct": 0,
        "signal_dbm": -100,
        "freq_mhz": 0,
        "channel": 0,
        "band": "Desconocida",
        "tx_bitrate": "N/A",
        "rx_bitrate": "N/A",
        "state": "desconectado"
    }

    norm_out = output.replace('\r\n', '\n').replace('\r', '\n')
    blocks = re.split(r'\n(?=\s*(?:Name|Nombre)\s*:)', norm_out)
    target_block = norm_out

    connected_blocks = [
        b for b in blocks 
        if re.search(r'(?i)(?:State|Estado)\s*:\s*(?:connected|conectado|asociado|associated)', b)
    ]

    if target_iface:
        for b in blocks:
            m = re.search(r'(?i)^\s*(?:Name|Nombre)\s*:\s*(.+)$', b, re.MULTILINE)
            if m and m.group(1).strip().lower() == target_iface.strip().lower():
                target_block = b
                break
    elif connected_blocks:
        target_block = connected_blocks[0]
    elif blocks:
        target_block = blocks[0]

    bssid_m = re.search(r'(?i)BSSID\s*:\s*([0-9a-fA-F:]{17})', target_block)
    if bssid_m:
        res["bssid"] = bssid_m.group(1).upper()

    ssid_m = re.search(r'(?i)^\s*SSID\s*:\s*(.+)$', target_block, re.MULTILINE)
    if ssid_m:
        res["ssid"] = ssid_m.group(1).strip()

    sig_m = re.search(r'(?i)(?:Señal|Signal)\s*:\s*(\d+)%', target_block)
    if sig_m:
        res["signal_pct"] = int(sig_m.group(1))
        res["signal_dbm"] = int((res["signal_pct"] / 2.0) - 100)

    # Filtrar la sección anidada de 'Puntos de acceso colocados' para evitar falsos positivos
    # en la lectura de la Banda y Canal de la interfaz activa
    cleaned_block = re.sub(
        r'(?i)^\s*(?:Puntos de acceso colocados|Colocated access points)[\s\S]*?(?=^\s*(?:Banda|Band|Tipo de red|Network type|Tipo de radio|Radio type)|\Z)',
        '',
        target_block,
        flags=re.MULTILINE
    )

    band_m = re.search(r'(?i)^\s*(?:Banda|Band)\s*:\s*(.+)$', cleaned_block, re.MULTILINE)
    chan_m = re.search(r'(?i)^\s*(?:Canal|Channel)\s*:\s*(\d+)', cleaned_block, re.MULTILINE)

    band_str = band_m.group(1).strip().lower() if band_m else ''
    ch = int(chan_m.group(1)) if chan_m else 0
    res["channel"] = ch

    if '6' in band_str:
        res["band"] = "6 GHz (Wi-Fi 6E/7)"
        res["freq_mhz"] = 5950 + (ch * 5)
    elif '5' in band_str:
        res["band"] = "5.0 GHz"
        res["freq_mhz"] = 5000 + (ch * 5)
    elif '2' in band_str:
        res["band"] = "2.4 GHz"
        res["freq_mhz"] = 2484 if ch == 14 else 2407 + (ch * 5)
    elif ch <= 14 and ch > 0:
        res["band"] = "2.4 GHz"
        res["freq_mhz"] = 2484 if ch == 14 else 2407 + (ch * 5)
    elif ch <= 177 and ch > 0:
        res["band"] = "5.0 GHz"
        res["freq_mhz"] = 5000 + (ch * 5)
    elif ch > 177:
        res["band"] = "6 GHz (Wi-Fi 6E/7)"
        res["freq_mhz"] = 5950 + (ch * 5)
    else:
        res["band"] = "Desconocida"
        res["freq_mhz"] = 0

    rx_m = re.search(r'(?i)(?:Velocidad de recepción|Receive rate)\s*\([^\)]*\)\s*:\s*([0-9.]+)', target_block)
    tx_m = re.search(r'(?i)(?:Velocidad de transmisión|Transmit rate)\s*\([^\)]*\)\s*:\s*([0-9.]+)', target_block)
    if rx_m:
        res["rx_bitrate"] = f"{rx_m.group(1)} Mbps"
    if tx_m:
        res["tx_bitrate"] = f"{tx_m.group(1)} Mbps"

    if res["tx_bitrate"] == "N/A" and res["rx_bitrate"] == "N/A":
        link_spd = get_windows_link_speed()
        if link_spd:
            res["tx_bitrate"] = link_spd
            res["rx_bitrate"] = link_spd

    st_m = re.search(r'(?i)(?:State|Estado)\s*:\s*(.+)$', target_block, re.MULTILINE)
    if st_m:
        res["state"] = st_m.group(1).strip().lower()

    return res

def parse_windows_networks(output, current_ssid=None):
    """Parsea 'netsh wlan show networks mode=bssid' para listar APs candidatos,
    incluyendo BSSIDs primarios y APs colocados (Multi-BSSID / RNR en Wi-Fi 6/6E/7).
    Garantiza que un BSSID primario anunciado tenga precedencia sobre referencias colocadas."""
    primary_aps = {}
    coloc_aps = {}
    current_ap = None
    current_ssid_block = ""

    for line in output.split('\n'):
        line = line.strip()
        m_ssid = re.match(r'(?i)^SSID\s+\d+\s*:\s*(.*)$', line)
        if m_ssid:
            ssid_name = m_ssid.group(1).strip()
            current_ssid_block = ssid_name
            continue

        m_bssid = re.match(r'(?i)^BSSID\s+\d+\s*:\s*([0-9a-fA-F:]{17})', line)
        if m_bssid:
            if current_ap and current_ap.get("bssid"):
                b_key = current_ap["bssid"]
                if b_key not in primary_aps or (current_ap["is_same_ssid"] and not primary_aps[b_key]["is_same_ssid"]):
                    primary_aps[b_key] = current_ap
            bssid_val = m_bssid.group(1).upper()
            is_same = bool(current_ssid and (current_ssid_block or "").strip().lower() == current_ssid.strip().lower())
            current_ap = {
                "bssid": bssid_val,
                "ssid": current_ssid_block or "Oculto",
                "signal": 0,
                "signal_dbm": -100,
                "channel": 0,
                "band": "Desconocida",
                "freq": "0",
                "vendor": lookup_vendor(bssid_val),
                "ap_name": lookup_ap_name(bssid_val),
                "active": False,
                "is_same_ssid": is_same
            }
            continue

        if current_ap:
            m_sig = re.match(r'(?i)^Señal\s*:\s*(\d+)%', line) or re.match(r'(?i)^Signal\s*:\s*(\d+)%', line)
            if m_sig:
                current_ap["signal"] = int(m_sig.group(1))
                current_ap["signal_dbm"] = int((current_ap["signal"] / 2) - 100)

            m_band = re.match(r'(?i)^Banda\s*:\s*(.*)$', line) or re.match(r'(?i)^Band\s*:\s*(.*)$', line)
            if m_band:
                b_str = m_band.group(1).lower()
                if '6' in b_str:
                    current_ap["band"] = "6 GHz (Wi-Fi 6E/7)"
                elif '5' in b_str:
                    current_ap["band"] = "5.0 GHz"
                elif '2' in b_str:
                    current_ap["band"] = "2.4 GHz"

            m_chan = re.match(r'(?i)^Canal\s*:\s*(\d+)', line) or re.match(r'(?i)^Channel\s*:\s*(\d+)', line)
            if m_chan:
                ch = int(m_chan.group(1))
                current_ap["channel"] = ch
                if current_ap["band"] == "Desconocida":
                    current_ap["band"] = "2.4 GHz" if ch <= 14 else ("5.0 GHz" if ch <= 177 else "6 GHz (Wi-Fi 6E/7)")

                # Calcular frecuencia estimada en MHz
                if current_ap["band"] == "5.0 GHz":
                    current_ap["freq"] = str(5000 + ch * 5)
                elif current_ap["band"] == "2.4 GHz":
                    current_ap["freq"] = str(2484 if ch == 14 else 2407 + ch * 5)
                elif "6" in current_ap["band"]:
                    current_ap["freq"] = str(5950 + ch * 5)

            # Detectar puntos de acceso colocados (Reduced Neighbor Report en 802.11ax/be)
            m_coloc = re.search(r'(?i)BSSID:\s*([0-9a-fA-F:\s]{17,25}),\s*Banda:\s*([^,]+),\s*Canal:\s*(\d+)', line)
            if m_coloc:
                c_mac = re.sub(r'\s+', '', m_coloc.group(1)).upper()
                c_band_str = m_coloc.group(2).lower()
                c_chan = int(m_coloc.group(3))
                c_band = "6 GHz (Wi-Fi 6E/7)" if '6' in c_band_str else ("5.0 GHz" if '5' in c_band_str else "2.4 GHz")
                if len(c_mac) == 17:
                    if c_band == "5.0 GHz":
                        c_freq = str(5000 + c_chan * 5)
                    elif c_band == "2.4 GHz":
                        c_freq = str(2484 if c_chan == 14 else 2407 + c_chan * 5)
                    else:
                        c_freq = str(5950 + c_chan * 5)

                    c_sig = max(10, current_ap.get("signal", 50) - 3)
                    is_coloc_same = bool(current_ssid and (current_ssid_block or "").strip().lower() == current_ssid.strip().lower())
                    coloc_entry = {
                        "bssid": c_mac,
                        "ssid": current_ssid_block or current_ap.get("ssid", "Oculto"),
                        "signal": c_sig,
                        "signal_dbm": int((c_sig / 2) - 100),
                        "channel": c_chan,
                        "band": c_band,
                        "freq": c_freq,
                        "vendor": lookup_vendor(c_mac),
                        "ap_name": lookup_ap_name(c_mac),
                        "active": False,
                        "is_same_ssid": is_coloc_same
                    }
                    if c_mac not in coloc_aps or (is_coloc_same and not coloc_aps[c_mac]["is_same_ssid"]):
                        coloc_aps[c_mac] = coloc_entry

    if current_ap and current_ap.get("bssid"):
        b_key = current_ap["bssid"]
        if b_key not in primary_aps or (current_ap["is_same_ssid"] and not primary_aps[b_key]["is_same_ssid"]):
            primary_aps[b_key] = current_ap

    # Prioridad: Las lecturas de BSSID directas primarias sobrescriben las referencias colocadas
    combined_aps = dict(coloc_aps)
    combined_aps.update(primary_aps)
    return list(combined_aps.values())

def calculate_rating(signal_dbm, ping_ms):
    """Calcula calificación y color del enlace Wi-Fi"""
    if signal_dbm >= -60:
        sig_score = 100
    elif signal_dbm >= -67:
        sig_score = 80
    elif signal_dbm >= -75:
        sig_score = 60
    elif signal_dbm >= -82:
        sig_score = 40
    else:
        sig_score = 20

    if ping_ms is None or ping_ms > 200:
        ping_score = 20
    elif ping_ms > 100:
        ping_score = 40
    elif ping_ms > 50:
        ping_score = 60
    elif ping_ms > 20:
        ping_score = 80
    else:
        ping_score = 100

    total_score = int(0.7 * sig_score + 0.3 * ping_score)
    if total_score >= 85:
        return "Excelente", total_score, "#10b981"
    elif total_score >= 70:
        return "Muy Buena", total_score, "#06b6d4"
    elif total_score >= 50:
        return "Buena", total_score, "#8b5cf6"
    elif total_score >= 35:
        return "Débil", total_score, "#f59e0b"
    else:
        return "Crítica", total_score, "#ef4444"

_cached_win_net = {"ip": "Desconocida", "gw": "8.8.8.8", "time": 0.0}

def get_local_ip_and_gateway(interface):
    if IS_WINDOWS:
        gw = net_diag.get_cached_gateway(max_age_sec=15.0) or "8.8.8.8"
        ip = None
        # 1. Determinar la IP de la interfaz que enruta hacia la puerta de enlace activa (o internet)
        for target_dest in (gw, "8.8.8.8", "1.1.1.1"):
            if not target_dest or target_dest.startswith("127."):
                continue
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect((target_dest, 80))
                cand_ip = s.getsockname()[0]
                s.close()
                if cand_ip and not cand_ip.startswith("127.") and not cand_ip.startswith("169.254."):
                    ip = cand_ip
                    break
            except Exception:
                pass

        # 2. Fallback por ipconfig si el socket UDP no pudo resolver (ej. red aislada sin ruta por defecto)
        now = time.time()
        if not ip:
            if (now - _cached_win_net["time"] < 10.0) and _cached_win_net["ip"] not in ("Desconocida", "127.0.0.1"):
                ip = _cached_win_net["ip"]
            else:
                try:
                    out = run_windows_cmd(["ipconfig"], timeout=3)
                    for m in re.finditer(r"(?:IPv4|Direcci[oó]n IPv4)[^:]*:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)", out, re.IGNORECASE):
                        cand = m.group(1).strip()
                        if not cand.startswith("127.") and not cand.startswith("169.254."):
                            ip = cand
                            break
                except Exception:
                    pass

        final_ip = ip or "127.0.0.1"
        _cached_win_net["ip"] = final_ip
        _cached_win_net["gw"] = gw
        _cached_win_net["time"] = now
        return final_ip, gw

    ip_addr = "Desconocida"
    gw_ip = "8.8.8.8"
    try:
        out = subprocess.check_output(['ip', '-4', 'addr', 'show', interface], text=True, errors='replace', stderr=subprocess.DEVNULL)
        m = re.search(r'inet\s+([0-9.]+)', out)
        if m:
            ip_addr = m.group(1)
    except:
        pass

    try:
        out = subprocess.check_output(['ip', 'route', 'show', 'default'], text=True, errors='replace', stderr=subprocess.DEVNULL)
        m = re.search(r'via\s+([0-9.]+)', out)
        if m:
            gw_ip = m.group(1)
    except:
        pass

    return ip_addr, gw_ip

def measure_ping(target):
    try:
        if IS_WINDOWS:
            cmd = ['ping', '-n', '1', '-w', '1000', target]
            out = run_windows_cmd(cmd, timeout=2)
        else:
            cmd = ['ping', '-c', '1', '-W', '1', target]
            out = subprocess.check_output(cmd, text=True, errors='replace', stderr=subprocess.DEVNULL)
        m = re.search(r'(?:tiempo|time)[=<]([0-9.,]+)', out, re.IGNORECASE)
        if m:
            val_str = m.group(1).replace(',', '.')
            return float(val_str)
    except:
        pass
    return None

# State management
class WiFiState:
    def __init__(self, interface=None):
        self.lock = threading.Lock()
        self.current_bssid = None
        self.current_ssid = None
        self.signal_dbm = -100
        self.signal_pct = 0
        self.tx_bitrate = "N/A"
        self.rx_bitrate = "N/A"
        self.frequency_mhz = 0
        self.channel = 0
        self.band = "Desconocida"
        self.interface = interface or self.detect_wifi_interface() or ("Wi-Fi" if IS_WINDOWS else "wlan0")
        self.ip_address = "Desconocida"
        self.gateway_ip = "8.8.8.8"
        self.ping_latency_ms = None
        self.rating_text = "Sin Señal"
        self.rating_score = 0
        self.rating_badge_color = "#ef4444"
        self.vendor_name = "Desconocido"
        self.ap_name = None
        self.candidate_aps = []
        self.ap_cache = {}
        self.last_scan_trigger = 0.0
        self.roaming_events = load_saved_roaming_events()
        self.telemetry_history = []
        self.last_update_time = time.time()
        self.is_monitoring = True
        self.sample_counter = 0

        # Dynamic Multipurpose Configuration & Location
        cfg = database.get_config()
        self.location = cfg.get("location_name", "Tienda_Principal")
        self.zone = cfg.get("current_zone", "Cajas:1-4")
        self.target_url = cfg.get("target_url", "https://1.1.1.1")
        self.active_preset = cfg.get("active_preset", "store")
        self.probe_interval_seconds = float(cfg.get("probe_interval_seconds", "5"))
        self.probe_timeout_seconds = float(cfg.get("probe_timeout_seconds", "5"))
        self.auto_probe_enabled = (cfg.get("auto_probe_enabled", "1") == "1")
        self.capture_enabled = (cfg.get("capture_enabled", "1") == "1")
        self.verify_ssl = (cfg.get("verify_ssl", "1") == "1")

        # HTTP Application Probe Latency Metrics
        self.app_latency_ms = None
        self.app_cold_total_ms = None
        self.app_dns_ms = 0.0
        self.app_tcp_ms = 0.0
        self.app_tls_ms = 0.0
        self.app_ttfb_ms = 0.0
        self.app_transfer_ms = 0.0
        self.app_status_code = 0
        self.app_is_error = False
        self.app_error_message = None
        self.last_probe_time = 0.0
        self.http_probe_counter = 0
        self.last_net_diag_time = 0.0
        self.net_diag_counter = 0

    def detect_wifi_interface(self):
        try:
            available = get_available_wifi_interfaces()
            if available:
                return available[0]
        except Exception:
            pass
        return "Wi-Fi" if IS_WINDOWS else "wlan0"

    def set_interface(self, interface_name):
        with self.lock:
            self.interface = interface_name
            self.current_bssid = None
            self.current_ssid = None
            self.ap_name = None
            self.signal_dbm = -100

state = WiFiState()

def update_wifi_telemetry():
    with state.lock:
        iface = state.interface
        loc = state.location
        zone = state.zone
        current_app_latency = state.app_latency_ms

    ip_addr, gw_ip = get_local_ip_and_gateway(iface)
    ping_ms = measure_ping(gw_ip)

    connected_bssid = None
    connected_ssid = None
    signal_dbm = -100
    signal_pct = 0
    freq_mhz = 0
    channel = 0
    tx_bitrate = "N/A"
    rx_bitrate = "N/A"
    band = "Desconocida"
    candidate_aps = []

    if IS_WINDOWS:
        try:
            out = run_windows_cmd(['netsh', 'wlan', 'show', 'interfaces'], timeout=3)
            info = parse_windows_interface(out, target_iface=iface)
            connected_bssid = info["bssid"]
            connected_ssid = info["ssid"]
            signal_pct = info["signal_pct"]
            signal_dbm = info["signal_dbm"]
            channel = info["channel"]
            freq_mhz = info["freq_mhz"]
            band = info["band"]
            tx_bitrate = info["tx_bitrate"]
            rx_bitrate = info["rx_bitrate"]
        except Exception:
            pass

        try:
            now_ts = time.time()
            if now_ts - getattr(state, 'last_scan_trigger', 0.0) > 10.0:
                state.last_scan_trigger = now_ts
                threading.Thread(target=trigger_windows_wifi_scan, daemon=True).start()

            net_out = run_windows_cmd(['netsh', 'wlan', 'show', 'networks', 'mode=bssid'], timeout=3)
            candidate_aps = parse_windows_networks(net_out, current_ssid=connected_ssid)
            if connected_bssid:
                for ap in candidate_aps:
                    if ap.get("bssid") == connected_bssid:
                        ap["active"] = True
                        break
        except Exception:
            pass
    else:
        # Linux
        try:
            iw_out = subprocess.check_output(['iw', 'dev', iface, 'link'], text=True, errors='replace', stderr=subprocess.DEVNULL)
            bssid_m = re.search(r'Connected to\s+([0-9a-fA-F:]{17})', iw_out)
            if bssid_m:
                connected_bssid = bssid_m.group(1).upper()

            ssid_m = re.search(r'SSID:\s*(.+)', iw_out)
            if ssid_m:
                connected_ssid = ssid_m.group(1).strip()

            signal_m = re.search(r'signal:\s*(-?[0-9]+)\s*dBm', iw_out)
            if signal_m:
                signal_dbm = int(signal_m.group(1))
                signal_pct = max(0, min(100, int((signal_dbm + 100) * 2)))

            freq_m = re.search(r'freq:\s*([0-9.]+)', iw_out)
            if freq_m:
                freq_mhz = int(float(freq_m.group(1)))
                if 2400 <= freq_mhz <= 2500:
                    channel = int((freq_mhz - 2407) / 5)
                elif 5000 <= freq_mhz <= 5900:
                    channel = int((freq_mhz - 5000) / 5)

            tx_m = re.search(r'tx bitrate:\s*(.+)', iw_out)
            if tx_m:
                tx_bitrate = tx_m.group(1).strip()

            rx_m = re.search(r'rx bitrate:\s*(.+)', iw_out)
            if rx_m:
                rx_bitrate = rx_m.group(1).strip()
        except Exception:
            pass

        if freq_mhz >= 5900:
            band = "6 GHz (Wi-Fi 6E/7)"
        elif freq_mhz >= 5000:
            band = "5.0 GHz"
        elif freq_mhz >= 2400:
            band = "2.4 GHz"
        else:
            band = "Desconocida"

        try:
            nm_out = subprocess.check_output(
                ['nmcli', '-t', '-f', 'active,ssid,bssid,signal,freq,chan,rate', 'device', 'wifi'],
                text=True, errors='replace', stderr=subprocess.DEVNULL
            )
            for line in nm_out.strip().split('\n'):
                if not line:
                    continue
                parts = line.split(':')
                if len(parts) >= 7:
                    is_active = (parts[0] in ('sí', 'yes', 'si'))
                    ap_ssid = parts[1]
                    raw_bssid = ':'.join(parts[2:-4]) if len(parts) > 7 else parts[2]
                    ap_bssid = raw_bssid.replace('\\:', ':').upper()
                    try:
                        ap_sig = int(parts[-4])
                    except:
                        ap_sig = 0
                    ap_freq = parts[-3]
                    ap_chan = parts[-2]
                    ap_rate = parts[-1]

                    candidate_aps.append({
                        "active": is_active,
                        "ssid": ap_ssid,
                        "bssid": ap_bssid,
                        "signal": ap_sig,
                        "signal_dbm": int((ap_sig / 2) - 100),
                        "freq": ap_freq,
                        "channel": ap_chan,
                        "rate": ap_rate,
                        "vendor": lookup_vendor(ap_bssid),
                        "ap_name": lookup_ap_name(ap_bssid),
                        "is_same_ssid": (ap_ssid.strip().lower() == connected_ssid.strip().lower()) if connected_ssid else False
                    })
        except Exception:
            pass

    # Mantenimiento de caché deslizante de APs candidatos (ventana de retención de 45s)
    # Evita que redes redundantes desaparezcan en Windows por fluctuaciones momentáneas del escaneo
    now_ts = time.time()
    merged_aps = []
    with state.lock:
        # 1. Actualizar caché con los APs detectados en esta pasada.
        # Si el AP ya existía en caché pero la nueva pasada trae su BSSID primario o con mismo SSID, actualizarlo.
        for ap in candidate_aps:
            bssid_key = ap.get("bssid")
            if not bssid_key:
                continue
            ap["last_seen"] = now_ts
            if bssid_key not in state.ap_cache:
                state.ap_cache[bssid_key] = ap
            else:
                existing = state.ap_cache[bssid_key]
                # Si el nuevo dato coincide con el SSID conectado y el anterior no, sobrescribir
                if ap.get("is_same_ssid") or not existing.get("is_same_ssid") or (bssid_key == connected_bssid):
                    state.ap_cache[bssid_key] = ap
                else:
                    existing["last_seen"] = now_ts

        # 2. Retener los APs activos o vistos en los últimos 45 segundos
        for bssid_key, ap in list(state.ap_cache.items()):
            is_active = (bssid_key == connected_bssid)
            if is_active or (now_ts - ap.get("last_seen", 0.0) <= 45.0):
                ap_entry = dict(ap)
                ap_entry["active"] = is_active
                if is_active and connected_ssid:
                    # Garantizar que el AP activo siempre refleje el SSID conectado real
                    ap_entry["ssid"] = connected_ssid
                    ap_entry["is_same_ssid"] = True
                elif connected_ssid:
                    ap_entry["is_same_ssid"] = bool(ap_entry.get("ssid", "").strip().lower() == connected_ssid.strip().lower())
                merged_aps.append(ap_entry)
            else:
                del state.ap_cache[bssid_key]

        merged_aps.sort(key=lambda ap: (1 if ap.get('active') else 0, ap.get('signal', 0)), reverse=True)
        candidate_aps = merged_aps

    rating_text, rating_score, badge_color = calculate_rating(signal_dbm, ping_ms)
    vendor_name = lookup_vendor(connected_bssid)
    current_ap_name = lookup_ap_name(connected_bssid)

    with state.lock:
        time_str = time.strftime("%H:%M:%S")
        state.telemetry_history.append({
            "time": time_str,
            "signal_dbm": signal_dbm,
            "ping_ms": ping_ms,
            "app_latency_ms": state.app_latency_ms
        })
        if len(state.telemetry_history) > 60:
            state.telemetry_history.pop(0)

        # Detect Roaming Handoff event
        if state.current_bssid and connected_bssid and state.current_bssid != connected_bssid:
            event = {
                "timestamp_raw": time.time(),
                "timestamp": time_str,
                "date": time.strftime("%Y-%m-%d"),
                "location": state.location,
                "zone": state.zone,
                "prev_bssid": state.current_bssid,
                "prev_ap_name": lookup_ap_name(state.current_bssid),
                "new_bssid": connected_bssid,
                "new_ap_name": current_ap_name,
                "ssid": connected_ssid,
                "prev_signal_dbm": state.signal_dbm,
                "new_signal_dbm": signal_dbm,
                "ping_ms": ping_ms,
                "gw_ping_ms": ping_ms,
                "app_latency_ms": state.app_latency_ms,
                "delta_dbm": signal_dbm - state.signal_dbm,
                "verdict": "Transición suave" if (signal_dbm > state.signal_dbm) else "Handoff detectado"
            }
            state.roaming_events.insert(0, event)
            if len(state.roaming_events) > 50:
                state.roaming_events.pop()
            save_roaming_events(state.roaming_events)
            try:
                database.save_roaming_event(event)
            except Exception as e:
                pass

        state.current_bssid = connected_bssid
        state.current_ssid = connected_ssid
        state.signal_dbm = signal_dbm
        state.signal_pct = signal_pct
        state.tx_bitrate = tx_bitrate
        state.rx_bitrate = rx_bitrate
        state.frequency_mhz = freq_mhz
        state.channel = channel
        state.band = band
        state.interface = iface
        state.ip_address = ip_addr
        state.gateway_ip = gw_ip
        state.ping_latency_ms = ping_ms
        state.rating_text = rating_text
        state.rating_score = rating_score
        state.rating_badge_color = badge_color
        state.vendor_name = vendor_name
        state.ap_name = current_ap_name
        state.candidate_aps = candidate_aps
        state.last_update_time = time.time()
        state.sample_counter += 1

        # Persist to SQLite every ~3 samples (~4.5s) to avoid excessive disk I/O while maintaining high-fidelity history.
        # Only recorded when capture_enabled is active. Roaming handoff detection above ALWAYS executes uninterrupted.
        if state.capture_enabled and state.sample_counter % 2 == 0 and connected_bssid:
            sample_data = {
                "timestamp": time.time(),
                "location": state.location,
                "zone": state.zone,
                "interface": iface,
                "ssid": connected_ssid,
                "bssid": connected_bssid,
                "ap_name": current_ap_name,
                "vendor": vendor_name,
                "signal_dbm": signal_dbm,
                "signal_pct": signal_pct,
                "channel": channel,
                "band": band,
                "tx_bitrate": tx_bitrate,
                "rx_bitrate": rx_bitrate,
                "gw_ping_ms": ping_ms,
                "target_url": state.target_url,
                "dns_ms": state.app_dns_ms,
                "tcp_ms": state.app_tcp_ms,
                "tls_ms": state.app_tls_ms,
                "ttfb_ms": state.app_ttfb_ms,
                "transfer_ms": state.app_transfer_ms,
                "total_ms": state.app_latency_ms or 0.0,
                "cold_total_ms": state.app_cold_total_ms or 0.0,
                "status_code": state.app_status_code,
                "is_error": state.app_is_error,
                "error_message": state.app_error_message
            }
            try:
                database.save_telemetry_sample(sample_data)
            except Exception:
                pass

def wifi_telemetry_loop():
    """Background loop for Wi-Fi telemetry (~1.5s interval)"""
    while state.is_monitoring:
        try:
            update_wifi_telemetry()
        except Exception as e:
            pass
        time.sleep(1.5)

def http_probe_loop():
    """Background loop for multipurpose HTTP application probe (configurable interval)"""
    while state.is_monitoring:
        try:
            with state.lock:
                enabled = state.auto_probe_enabled and state.capture_enabled
                url = state.target_url
                timeout = state.probe_timeout_seconds
                verify = state.verify_ssl

            if enabled and url:
                cfg = database.get_config()
                auth_cfg = {
                    "auth_enabled": cfg.get("auth_enabled", "0"),
                    "auth_type": cfg.get("auth_type", "none"),
                    "auth_domain": cfg.get("auth_domain", ""),
                    "auth_user": cfg.get("auth_user", ""),
                    "auth_password": cfg.get("auth_password", ""),
                    "auth_token": cfg.get("auth_token", "")
                }
                res = probe.measure_latency(url, timeout=timeout, auth_config=auth_cfg, verify_ssl=verify)
                with state.lock:
                    state.app_latency_ms = res.get('total_ms')
                    state.app_cold_total_ms = res.get('cold_total_ms')
                    state.app_dns_ms = res.get('dns_ms', 0.0)
                    state.app_tcp_ms = res.get('tcp_ms', 0.0)
                    state.app_tls_ms = res.get('tls_ms', 0.0)
                    state.app_ttfb_ms = res.get('ttfb_ms', 0.0)
                    state.app_transfer_ms = res.get('transfer_ms', 0.0)
                    state.app_status_code = res.get('status_code', 0)
                    state.app_is_error = res.get('is_error', False)
                    state.app_error_message = res.get('error_message')
                    state.last_probe_time = time.time()
                    state.http_probe_counter += 1
                    curr_loc = state.location
                    curr_zone = state.zone
                    curr_bssid = state.current_bssid
                    curr_ap = state.ap_name
                    curr_sig = state.signal_dbm
                try:
                    database.save_http_probe(res, location=curr_loc, zone=curr_zone, bssid=curr_bssid, ap_name=curr_ap, signal_dbm=curr_sig)
                except Exception as db_err:
                    sys.stderr.write(f"[WARN] Error guardando http_probe_history: {db_err}\n")
        except Exception as e:
            pass

        with state.lock:
            sleep_sec = max(2.0, state.probe_interval_seconds)
        time.sleep(sleep_sec)

def net_diag_scheduled_loop():
    """Background loop that automatically executes multi-target ICMP network diagnostics periodically"""
    time.sleep(4.0)  # Initial wait for server and Wi-Fi interface initialization
    while state.is_monitoring:
        try:
            if not state.capture_enabled:
                time.sleep(2.0)
                continue

            cfg = database.get_config()
            try:
                diag_interval_min = float(cfg.get("net_diag_interval_minutes", "10"))
                if diag_interval_min <= 0:
                    diag_interval_min = 10.0
            except (ValueError, TypeError):
                diag_interval_min = 10.0

            extra = cfg.get("extra_ping_targets", "")
            exclude = cfg.get("excluded_ping_targets", "")
            with state.lock:
                target_url = state.target_url
                loc = state.location
                zone = state.zone

            target_h = urlparse(target_url).hostname if target_url else None
            # Runs concurrent ICMP pings and traceroutes to Gateway, DNS, App Server & Extra nodes
            res = net_diag.run_full_network_diagnostic(extra_hosts_str=extra, exclude_hosts_str=exclude, target_host=target_h)
            database.save_net_diag(res, location=loc, zone=zone, target_url=target_url)
            with state.lock:
                state.net_diag_counter += 1
                state.last_net_diag_time = time.time()

            # Sleep in 2-second chunks to allow graceful shutdown
            total_sleep = int(diag_interval_min * 60)
            for _ in range(total_sleep // 2):
                if not state.is_monitoring:
                    break
                time.sleep(2.0)
        except Exception:
            time.sleep(10.0)

class QuietThreadingHTTPServer(http.server.ThreadingHTTPServer):
    """Multi-threaded HTTP server that runs each connection concurrently in a separate daemon thread,
    guaranteeing that slow operations (like traceroutes or manual pings) never block real-time telemetry."""
    daemon_threads = True
    allow_reuse_address = True

    def handle_error(self, request, client_address):
        exc_type, exc_val, _ = sys.exc_info()
        if exc_type in (BrokenPipeError, ConnectionResetError):
            return
        super().handle_error(request, client_address)

class WiFiRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)

        if parsed.path == '/api/status':
            self.send_json_response(self.get_status_data())
        elif parsed.path == '/api/interfaces':
            available = get_available_wifi_interfaces()
            current = state.interface
            self.send_json_response({
                "available": available,
                "current": current,
                "count": len(available)
            })
        elif parsed.path == '/api/roaming-history':
            loc = qs.get('location', ['all'])[0]
            zone = qs.get('zone', ['all'])[0]
            events = database.get_roaming_events(limit=50, location_filter=loc, zone_filter=zone)
            if not events:
                with state.lock:
                    events = list(state.roaming_events)
            self.send_json_response({"events": events})
        elif parsed.path == '/api/scan':
            now_ts = time.time()
            if IS_WINDOWS and (now_ts - getattr(state, 'last_scan_trigger', 0.0) > 4.0):
                state.last_scan_trigger = now_ts
                threading.Thread(target=trigger_windows_wifi_scan, daemon=True).start()
            with state.lock:
                aps = list(state.candidate_aps)
            self.send_json_response({"aps": aps})
        elif parsed.path == '/api/oui':
            self.send_json_response(oui_manager.get_info())
        elif parsed.path == '/api/oui/search':
            q = qs.get('q', [''])[0]
            try:
                limit = int(qs.get('limit', [50])[0])
            except ValueError:
                limit = 50
            results = oui_manager.search(q, limit=limit)
            self.send_json_response({"results": results, "count": len(results)})
        elif parsed.path == '/api/oui/status':
            self.send_json_response(oui_manager.get_update_status())
        elif parsed.path == '/api/ap-names':
            q = qs.get('q', [''])[0]
            try:
                page = max(1, int(qs.get('page', [1])[0]))
            except ValueError:
                page = 1
            try:
                page_size = max(1, min(500, int(qs.get('page_size', qs.get('limit', [50]))[0])))
            except ValueError:
                page_size = 50
            paged = ap_manager.search_paginated(q, page=page, page_size=page_size)
            self.send_json_response({
                "info": ap_manager.get_info(),
                "aps": paged["aps"],
                "total": paged["total"],
                "page": paged["page"],
                "page_size": paged["page_size"],
                "total_pages": paged["total_pages"],
                "query": q
            })
        elif parsed.path == '/api/config':
            cfg = database.get_config()
            # Proteger secretos: nunca enviar claves cifradas o en texto plano hacia el navegador
            safe_cfg = dict(cfg)
            safe_cfg.pop('gemini_api_key_enc', None)
            safe_cfg.pop('gemini_api_key', None)
            if safe_cfg.get('auth_password'):
                safe_cfg['auth_password'] = '••••••••'
            if safe_cfg.get('auth_token'):
                safe_cfg['auth_token'] = '••••••••'
            cred_status = secrets_manager.get_credentials_status(
                cfg.get('gemini_api_key_enc', ''),
                cfg.get('gemini_model', 'gemini-3.8-flash')
            )
            safe_cfg['gemini_credentials'] = cred_status
            self.send_json_response(safe_cfg)
        elif parsed.path == '/api/agent/credentials':
            cfg = database.get_config()
            cred_status = secrets_manager.get_credentials_status(
                cfg.get('gemini_api_key_enc', ''),
                cfg.get('gemini_model', 'gemini-3.8-flash')
            )
            cred_status['allowed_models'] = ALLOWED_MODELS
            cred_status['mcp_command'] = f"python3 {os.path.join(PROJECT_DIR, 'mcp_telemetry_server.py')}"
            self.send_json_response(cred_status)
        elif parsed.path == '/api/zone-context':
            loc = qs.get('location', [state.location])[0]
            zone = qs.get('zone', [state.zone])[0]
            profile = database.get_zone_context_profile(loc, zone)
            annotations = database.get_agent_annotations(location_filter=loc, zone_filter=zone, limit=15)
            self.send_json_response({
                "profile": profile,
                "annotations": annotations,
                "schema": PHYSICAL_CONTEXT_SCHEMA
            })
        elif parsed.path == '/api/agent/context-questions':
            self.send_json_response(agent_runtime.generate_situational_questions())
        elif parsed.path == '/api/agent/history':
            loc = qs.get('location', ['all'])[0]
            zone = qs.get('zone', ['all'])[0]
            try:
                limit = int(qs.get('limit', [25])[0])
            except Exception:
                limit = 25
            hist = database.get_ai_diagnosis_history(location_filter=loc, zone_filter=zone, limit=limit)
            self.send_json_response({"history": hist})
        elif parsed.path == '/api/presets':
            self.send_json_response(PRESETS)
        elif parsed.path == '/api/locations':
            only_data = (qs.get('only_data', ['0'])[0] in ('1', 'true'))
            configured_only = (qs.get('configured_only', ['0'])[0] in ('1', 'true'))
            locs = database.get_locations(only_with_data=only_data, configured_only=configured_only)
            self.send_json_response({"locations": locs})
        elif parsed.path == '/api/zones':
            mapping = database.get_location_zones_map()
            self.send_json_response(mapping)
        elif parsed.path == '/api/stats':
            loc = qs.get('location', ['all'])[0]
            zone = qs.get('zone', ['all'])[0]
            start_date = qs.get('start_date', [None])[0]
            end_date = qs.get('end_date', [None])[0]
            if start_date == '':
                start_date = None
            if end_date == '':
                end_date = None
            stats = database.get_statistics(
                location_filter=loc,
                zone_filter=zone,
                start_date=start_date,
                end_date=end_date
            )
            self.send_json_response(stats)
        elif parsed.path == '/api/history':
            try:
                limit = int(qs.get('limit', [60])[0])
            except:
                limit = 60
            loc = qs.get('location', ['all'])[0]
            zone = qs.get('zone', ['all'])[0]
            samples = database.get_recent_samples(limit=limit, location_filter=loc, zone_filter=zone)
            self.send_json_response({"samples": samples})
        elif parsed.path in ('/api/http-phases/history', '/api/probe/history'):
            try:
                limit = int(qs.get('limit', [50])[0])
            except (ValueError, TypeError):
                limit = 50
            loc = qs.get('location', ['all'])[0]
            zone = qs.get('zone', ['all'])[0]
            records = database.get_http_probe_history(limit=limit, location_filter=loc, zone_filter=zone)
            if not records and state.last_probe_time > 0:
                dt = datetime.datetime.fromtimestamp(state.last_probe_time)
                records = [{
                    "id": 1,
                    "timestamp": state.last_probe_time,
                    "created_at": dt.isoformat(),
                    "time": dt.strftime("%H:%M:%S"),
                    "date": dt.strftime("%Y-%m-%d"),
                    "location": state.location,
                    "zone": state.zone,
                    "bssid": state.current_bssid or "",
                    "ap_name": state.ap_name or "",
                    "signal_dbm": state.signal_dbm,
                    "target_url": state.target_url,
                    "dns_ms": state.app_dns_ms,
                    "tcp_ms": state.app_tcp_ms,
                    "tls_ms": state.app_tls_ms,
                    "ttfb_ms": state.app_ttfb_ms,
                    "transfer_ms": state.app_transfer_ms,
                    "total_ms": state.app_latency_ms or 0.0,
                    "cold_total_ms": state.app_cold_total_ms or 0.0,
                    "status_code": state.app_status_code,
                    "is_error": 1 if state.app_is_error else 0,
                    "error_message": state.app_error_message or ""
                }]
            self.send_json_response({"records": records, "count": len(records)})
        elif parsed.path == '/api/net-diag':
            history = database.get_net_diag_history(limit=10)
            gw = net_diag.get_cached_gateway()
            dns = net_diag.get_cached_dns_servers()
            self.send_json_response({
                "gateway": gw,
                "dns_servers": dns,
                "history": history
            })
        elif parsed.path == '/api/export':
            exp_type = qs.get('type', ['telemetry'])[0].lower()
            exp_fmt = qs.get('format', [''])[0].lower()
            loc = qs.get('location', ['all'])[0]
            zone = qs.get('zone', ['all'])[0]
            start_date = qs.get('start_date', [None])[0]
            end_date = qs.get('end_date', [None])[0]
            if start_date == '':
                start_date = None
            if end_date == '':
                end_date = None

            loc_filter = None if loc in ('all', '', 'todas') else loc
            zone_filter = None if zone in ('all', '', 'todas') else zone

            clean_loc = re.sub(r'[^a-zA-Z0-9_\-]', '_', loc) if loc else "all"
            clean_zone = re.sub(r'[^a-zA-Z0-9_\-]', '_', zone) if zone else "all"
            loc_suffix = f"_{clean_loc}" if clean_loc != "all" else ""
            zone_suffix = f"_zona_{clean_zone}" if clean_zone != "all" else ""

            # Suffix for date ranges
            date_range_suffix = ""
            if start_date and end_date:
                date_range_suffix = f"_{start_date}_a_{end_date}"
            elif start_date:
                date_range_suffix = f"_desde_{start_date}"
            elif end_date:
                date_range_suffix = f"_hasta_{end_date}"

            date_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

            # 1. ZIP Export: Full Audit Package (Roaming + HTTP + ICMP + Telemetry + Summary)
            if exp_type in ('all', 'zip', 'audit', 'full') or exp_fmt == 'zip':
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
                    # File 1: Telemetría Sincronizada RF + HTTP + ICMP
                    telemetry_csv = database.export_telemetry_csv(
                        location_filter=loc_filter,
                        zone_filter=zone_filter,
                        start_date=start_date,
                        end_date=end_date
                    )
                    zf.writestr(f"01_telemetria_sincronizada_rf_icmp_http{loc_suffix}{zone_suffix}{date_range_suffix}.csv", telemetry_csv.encode('utf-8-sig'))

                    # File 2: Resultados y Eventos de Roaming (Handoffs)
                    roaming_csv = database.export_roaming_csv(
                        location_filter=loc_filter,
                        zone_filter=zone_filter,
                        start_date=start_date,
                        end_date=end_date
                    )
                    zf.writestr(f"02_eventos_roaming_handoffs{loc_suffix}{zone_suffix}{date_range_suffix}.csv", roaming_csv.encode('utf-8-sig'))

                    # File 3: Telemetría de Pruebas de Latencia HTTP por Fases
                    http_csv = database.export_http_probes_csv(
                        location_filter=loc_filter,
                        zone_filter=zone_filter,
                        start_date=start_date,
                        end_date=end_date
                    )
                    zf.writestr(f"03_latencia_fases_http{loc_suffix}{zone_suffix}{date_range_suffix}.csv", http_csv.encode('utf-8-sig'))

                    # File 4: Telemetría de Diagnóstico de Red ICMP & Traceroute
                    icmp_csv = database.export_icmp_diag_csv(
                        location_filter=loc_filter,
                        zone_filter=zone_filter,
                        start_date=start_date,
                        end_date=end_date
                    )
                    zf.writestr(f"04_diagnostico_red_icmp_traceroute{loc_suffix}{zone_suffix}{date_range_suffix}.csv", icmp_csv.encode('utf-8-sig'))

                    # File 5: Contexto Físico y Dictámenes del Agente IA Gemini (Sin credenciales)
                    ctx_profile = database.get_zone_context_profile(loc_filter or state.location, zone_filter or state.zone)
                    annotations = database.get_agent_annotations(location_filter=loc_filter or 'all', zone_filter=zone_filter or 'all', limit=50)
                    ai_hist = database.get_ai_diagnosis_history(location_filter=loc_filter or 'all', zone_filter=zone_filter or 'all', limit=15)
                    ai_report_lines = [
                        "======================================================================",
                        " CONTEXTO FÍSICO DEL SITIO Y DICTÁMENES DEL AGENTE IA GEMINI          ",
                        "======================================================================",
                        f"Sede: {ctx_profile.get('location')} | Zona: {ctx_profile.get('zone')}",
                        f"Recinto Físico     : {ctx_profile.get('environment_type') or 'No especificado'}",
                        f"Altura de APs      : {ctx_profile.get('ceiling_height') or 'No especificado'}",
                        f"Obstáculos RF      : {ctx_profile.get('obstacles') or 'No especificado'}",
                        f"Modo de Prueba     : {ctx_profile.get('test_mode') or 'No especificado'}",
                        f"Terminal Evaluada  : {ctx_profile.get('client_device_type') or 'No especificado'}",
                        f"Interferencias     : {ctx_profile.get('interference_notes') or 'No especificado'}",
                        f"Descripción Libre  : {ctx_profile.get('custom_description') or 'N/A'}",
                        "----------------------------------------------------------------------",
                        "OBSERVACIONES SITUACIONALES EN CAMPO:",
                    ]
                    if annotations:
                        for an in annotations:
                            ai_report_lines.append(f"  [{an.get('created_at')}] ({an.get('location')}/{an.get('zone')}) {an.get('question_text')} -> {an.get('user_answer')}")
                    else:
                        ai_report_lines.append("  (Sin observaciones situacionales registradas)")
                    ai_report_lines.append("----------------------------------------------------------------------")
                    ai_report_lines.append("HISTORIAL DE DIAGNÓSTICOS IA GEMINI:")
                    if ai_hist:
                        for h in ai_hist:
                            ai_report_lines.append(f"\n--- [{h.get('created_at')}] Modelo: {h.get('model')} | Sede: {h.get('location')} ({h.get('zone')}) ---")
                            ai_report_lines.append(f"Consulta: {h.get('user_prompt')}")
                            ai_report_lines.append(f"Dictamen:\n{h.get('ai_response')}\n")
                    else:
                        ai_report_lines.append("  (Sin dictámenes de IA registrados en este filtro)")
                    zf.writestr(f"05_contexto_fisico_y_dictamen_ia{loc_suffix}{zone_suffix}{date_range_suffix}.txt", "\n".join(ai_report_lines).encode('utf-8'))

                    # File 6: Resumen de Auditoría
                    stats = database.get_statistics(
                        location_filter=loc_filter or 'all',
                        zone_filter=zone_filter or 'all',
                        start_date=start_date,
                        end_date=end_date
                    )
                    date_range_display = f"{start_date or 'Historial inicial'} hasta {end_date or 'Fecha actual'}" if (start_date or end_date) else "Historial Completo Registrado"
                    summary_text = (
                        "======================================================================\n"
                        " PAQUETE DE AUDITORÍA Y TELEMETRÍA DE RED, ROAMING Y APLICACIÓN       \n"
                        "======================================================================\n"
                        f"Fecha y Hora de Generación : {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
                        f"Sede Evaluada             : {loc if loc != 'all' else 'Todas las Sedes'}\n"
                        f"Zona Evaluada             : {zone if zone != 'all' else 'Todas las Zonas (Recorrido Completo)'}\n"
                        f"Rango de Fechas           : {date_range_display}\n"
                        "----------------------------------------------------------------------\n"
                        "CONTEXTO FÍSICO DE LA ZONA:\n"
                        f"  • Tipo de Recinto         : {ctx_profile.get('environment_type') or 'No especificado'}\n"
                        f"  • Altura / Montaje APs    : {ctx_profile.get('ceiling_height') or 'No especificado'}\n"
                        f"  • Obstáculos RF           : {ctx_profile.get('obstacles') or 'No especificado'}\n"
                        f"  • Dinámica de Medición    : {ctx_profile.get('test_mode') or 'No especificado'}\n"
                        f"  • Terminal Crítica        : {ctx_profile.get('client_device_type') or 'No especificado'}\n"
                        "----------------------------------------------------------------------\n"
                        "MÉTRICAS CONSOLIDADAS:\n"
                        f"  • Muestras Totales de Telemetría: {stats.get('total_samples', 0)}\n"
                        f"  • Disponibilidad (Uptime)       : {stats.get('uptime_percentage', 100)}%\n"
                        f"  • Eventos de Roaming Wi-Fi      : {stats.get('roaming_count', 0)}\n"
                        f"  • Latencia HTTP Mediana (P50)   : {stats.get('percentiles', {}).get('p50', 0)} ms\n"
                        f"  • Latencia HTTP Percentil 95 (P95): {stats.get('percentiles', {}).get('p95', 0)} ms\n"
                        f"  • Latencia HTTP Percentil 99 (P99): {stats.get('percentiles', {}).get('p99', 0)} ms\n"
                        f"  • Jitter Promedio de Red        : {stats.get('jitter', 0)} ms\n"
                        f"  • Señal Wi-Fi Promedio          : {stats.get('averages', {}).get('signal_dbm', '--')} dBm\n"
                        "----------------------------------------------------------------------\n"
                        "ARCHIVOS ADJUNTOS EN ESTE ZIP:\n"
                        "  1. 01_telemetria_sincronizada_rf_icmp_http.csv -> Muestras completas periódicas\n"
                        "  2. 02_eventos_roaming_handoffs.csv             -> Registro de saltos entre APs\n"
                        "  3. 03_latencia_fases_http.csv                  -> Tiempos DNS, TCP, TLS, TTFB y Transfer\n"
                        "  4. 04_diagnostico_red_icmp_traceroute.csv      -> Pruebas multi-ping y saltos traceroute\n"
                        "  5. 05_contexto_fisico_y_dictamen_ia.txt        -> Ficha física del sitio y análisis IA\n"
                        "  6. 00_resumen_auditoria.txt                    -> Ficha técnica del informe\n"
                        "======================================================================\n"
                    )
                    zf.writestr(f"00_resumen_auditoria{loc_suffix}{zone_suffix}{date_range_suffix}.txt", summary_text.encode('utf-8'))

                zip_data = zip_buffer.getvalue()
                filename = f"auditoria_completa_red_roaming{loc_suffix}{zone_suffix}{date_range_suffix}_{date_str}.zip"
                self.send_response(200)
                self.send_header('Content-Type', 'application/zip')
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
                self.send_header('Content-Length', str(len(zip_data)))
                self.end_headers()
                self.wfile.write(zip_data)
                return

            # 2. Individual CSV Exports
            elif exp_type == 'roaming':
                csv_str = database.export_roaming_csv(
                    location_filter=loc_filter,
                    zone_filter=zone_filter,
                    start_date=start_date,
                    end_date=end_date
                )
                filename = f"eventos_roaming{loc_suffix}{zone_suffix}{date_range_suffix}_{date_str}.csv"
            elif exp_type in ('http-phases', 'probes', 'http'):
                csv_str = database.export_http_probes_csv(
                    location_filter=loc_filter,
                    zone_filter=zone_filter,
                    start_date=start_date,
                    end_date=end_date
                )
                filename = f"latencia_fases_http{loc_suffix}{zone_suffix}{date_range_suffix}_{date_str}.csv"
            elif exp_type in ('icmp', 'net-diag'):
                csv_str = database.export_icmp_diag_csv(
                    location_filter=loc_filter,
                    zone_filter=zone_filter,
                    start_date=start_date,
                    end_date=end_date
                )
                filename = f"diagnostico_red_icmp{loc_suffix}{zone_suffix}{date_range_suffix}_{date_str}.csv"
            elif exp_type == 'sedes-zonas-csv':
                csv_str = database.export_sedes_zonas_csv()
                filename = f"sedes_zonas_{date_str}.csv"
            elif exp_type == 'sedes-zonas-json':
                json_str = json.dumps(database.get_location_zones_map(), ensure_ascii=False, indent=2)
                content = json_str.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Disposition', f'attachment; filename="sedes_zonas_{date_str}.json"')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            elif exp_type == 'ap-names':
                aps = ap_manager.search('', limit=10000)
                out = io.StringIO()
                writer = csv.writer(out)
                writer.writerow(['MAC / BSSID', 'AP Name', 'Location', 'Model'])
                for a in aps:
                    writer.writerow([a.get('mac', ''), a.get('name', ''), a.get('location', ''), a.get('model', '')])
                csv_str = out.getvalue()
                filename = f"ap_names_inventory_{date_str}.csv"
            else:
                csv_str = database.export_telemetry_csv(
                    location_filter=loc_filter,
                    zone_filter=zone_filter,
                    start_date=start_date,
                    end_date=end_date
                )
                filename = f"telemetria_sincronizada{loc_suffix}{zone_suffix}{date_range_suffix}_{date_str}.csv"

            content = csv_str.encode('utf-8-sig')
            self.send_response(200)
            self.send_header('Content-Type', 'text/csv; charset=utf-8')
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
        elif parsed.path.startswith('/docs/'):
            rel_file = parsed.path[len('/docs/'):].split('?')[0].split('#')[0]
            # Buscar primero en static/docs, luego en docs/
            target_file = os.path.join(STATIC_DIR, 'docs', rel_file)
            if not os.path.exists(target_file) or not os.path.isfile(target_file):
                target_file = os.path.join(DOCS_DIR, rel_file)
            
            if os.path.exists(target_file) and os.path.isfile(target_file):
                ctype, _ = mimetypes.guess_type(target_file)
                if not ctype:
                    ctype = 'application/octet-stream'
                try:
                    with open(target_file, 'rb') as f:
                        file_data = f.read()
                    self.send_response(200)
                    self.send_header('Content-Type', ctype)
                    self.send_header('Content-Length', str(len(file_data)))
                    self.end_headers()
                    self.wfile.write(file_data)
                    return
                except Exception as e:
                    self.send_error(500, f"Error leyendo documento: {e}")
                    return
            self.send_error(404, f"Documento no encontrado: {parsed.path}")
            return
        else:
            if parsed.path == '/':
                self.path = '/index.html'
            return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ""
        data = {}
        if body:
            try:
                data = json.loads(body)
            except Exception:
                data = {}

        if parsed.path == '/api/probe/now':
            target = data.get('url') or state.target_url
            cfg = database.get_config()
            auth_cfg = {
                "auth_enabled": cfg.get("auth_enabled", "0"),
                "auth_type": cfg.get("auth_type", "none"),
                "auth_domain": cfg.get("auth_domain", ""),
                "auth_user": cfg.get("auth_user", ""),
                "auth_password": cfg.get("auth_password", ""),
                "auth_token": cfg.get("auth_token", "")
            }
            res = probe.measure_latency(target, timeout=float(cfg.get('probe_timeout_seconds', '5')), auth_config=auth_cfg, verify_ssl=(cfg.get('verify_ssl', '1') == '1'))
            with state.lock:
                state.app_latency_ms = res.get('total_ms')
                state.app_cold_total_ms = res.get('cold_total_ms')
                state.app_dns_ms = res.get('dns_ms', 0.0)
                state.app_tcp_ms = res.get('tcp_ms', 0.0)
                state.app_tls_ms = res.get('tls_ms', 0.0)
                state.app_ttfb_ms = res.get('ttfb_ms', 0.0)
                state.app_transfer_ms = res.get('transfer_ms', 0.0)
                state.app_status_code = res.get('status_code', 0)
                state.app_is_error = res.get('is_error', False)
                state.app_error_message = res.get('error_message')
                state.last_probe_time = time.time()
                state.http_probe_counter += 1
                curr_loc = state.location
                curr_zone = state.zone
                curr_bssid = state.current_bssid
                curr_ap = state.ap_name
                curr_sig = state.signal_dbm
            try:
                database.save_http_probe(res, location=curr_loc, zone=curr_zone, bssid=curr_bssid, ap_name=curr_ap, signal_dbm=curr_sig)
            except Exception:
                pass
            self.send_json_response(res)

        elif parsed.path == '/api/config':
            # Filtrar claves sensibles o máscaras enviadas desde la UI
            clean_data = dict(data)
            clean_data.pop('gemini_api_key', None)
            clean_data.pop('gemini_api_key_enc', None)
            clean_data.pop('gemini_credentials', None)
            if clean_data.get('auth_password') == '••••••••':
                clean_data.pop('auth_password', None)
            if clean_data.get('auth_token') == '••••••••':
                clean_data.pop('auth_token', None)
            database.update_config(clean_data)
            with state.lock:
                if 'target_url' in clean_data:
                    state.target_url = clean_data['target_url']
                if 'location_name' in clean_data:
                    state.location = clean_data['location_name']
                if 'current_zone' in clean_data:
                    state.zone = clean_data['current_zone']
                if 'active_preset' in clean_data:
                    state.active_preset = clean_data['active_preset']
                if 'probe_interval_seconds' in clean_data:
                    try:
                        state.probe_interval_seconds = float(clean_data['probe_interval_seconds'])
                    except:
                        pass
                if 'probe_timeout_seconds' in clean_data:
                    try:
                        state.probe_timeout_seconds = float(clean_data['probe_timeout_seconds'])
                    except:
                        pass
                if 'auto_probe_enabled' in clean_data:
                    state.auto_probe_enabled = (str(clean_data['auto_probe_enabled']) in ('1', 'true', 'True'))
                if 'capture_enabled' in clean_data:
                    state.capture_enabled = (str(clean_data['capture_enabled']) in ('1', 'true', 'True'))
                if 'verify_ssl' in clean_data:
                    state.verify_ssl = (str(clean_data['verify_ssl']) in ('1', 'true', 'True'))

            cfg = database.get_config()
            safe_cfg = dict(cfg)
            safe_cfg.pop('gemini_api_key_enc', None)
            safe_cfg['gemini_credentials'] = secrets_manager.get_credentials_status(
                cfg.get('gemini_api_key_enc', ''),
                cfg.get('gemini_model', 'gemini-3.8-flash')
            )
            self.send_json_response({"status": "success", "config": safe_cfg})

        elif parsed.path == '/api/agent/credentials':
            action = str(data.get('action', 'save')).lower()
            model_sel = str(data.get('model') or 'gemini-3.8-flash').strip()
            if model_sel in ALLOWED_MODELS:
                database.set_config("gemini_model", model_sel)

            if action == 'clear':
                database.set_config("gemini_api_key_enc", "")
                secrets_manager.write_dotenv_value("GEMINI_API_KEY", "")
                cfg = database.get_config()
                status_obj = secrets_manager.get_credentials_status(
                    cfg.get('gemini_api_key_enc', ''),
                    cfg.get('gemini_model', 'gemini-3.8-flash')
                )
                self.send_json_response({
                    "status": "success",
                    "message": "Credenciales locales eliminadas de .env y SQLite.",
                    "credentials": status_obj
                })
                return

            raw_key = str(data.get('api_key', '')).strip()
            storage_target = str(data.get('storage', 'dotenv')).lower()  # 'dotenv' | 'db'
            if raw_key and '••' not in raw_key:
                if storage_target == 'dotenv':
                    secrets_manager.write_dotenv_value("GEMINI_API_KEY", raw_key)
                enc_val = secrets_manager.encrypt_local_secret(raw_key)
                database.set_config("gemini_api_key_enc", enc_val)

            cfg = database.get_config()
            status_obj = secrets_manager.get_credentials_status(
                cfg.get('gemini_api_key_enc', ''),
                cfg.get('gemini_model', 'gemini-3.8-flash')
            )
            self.send_json_response({
                "status": "success",
                "message": "Configuración de Gemini actualizada de forma segura.",
                "credentials": status_obj
            })

        elif parsed.path == '/api/zone-context':
            payload = dict(data)
            if not payload.get('location'):
                payload['location'] = state.location
            if payload.get('zone') is None:
                payload['zone'] = state.zone
            saved_profile = database.save_zone_context_profile(payload)
            self.send_json_response({
                "status": "success",
                "profile": saved_profile,
                "questions": agent_runtime.generate_situational_questions().get("questions", [])
            })

        elif parsed.path == '/api/agent/annotate':
            payload = dict(data)
            if not payload.get('location'):
                payload['location'] = state.location
            if payload.get('zone') is None:
                payload['zone'] = state.zone
            payload['telemetry_snapshot'] = self.get_status_data()
            saved_ann = database.save_agent_annotation(payload)
            self.send_json_response({
                "status": "success",
                "annotation": saved_ann,
                "annotations": database.get_agent_annotations(location_filter=payload['location'], zone_filter=payload['zone'], limit=15)
            })

        elif parsed.path in ('/api/agent/chat', '/api/agent/quick-audit'):
            user_prompt = str(data.get('prompt', '')).strip()
            mode = str(data.get('mode', 'quick_audit' if parsed.path.endswith('quick-audit') else 'chat'))
            model_override = data.get('model')
            prev_id = data.get('previous_interaction_id') or None
            if not user_prompt:
                user_prompt = (
                    "Realiza una auditoría integral en tiempo real de la captura actual en esta Sede y Zona. "
                    "Evalúa Capa 1/2 (RF, canal, vecinos, Roaming), Capa 3/4 (Gateway, DNS, ICMP) y Capa 7 (Fases HTTP/TTFB), "
                    "cruzándolo con las condiciones físicas del espacio reportadas. Determina la causa raíz y acciones recomendadas."
                )
            try:
                res = agent_runtime.run_diagnosis_interaction(
                    user_prompt=user_prompt,
                    mode=mode,
                    model_override=model_override,
                    previous_interaction_id=prev_id,
                    include_full_snapshot=True
                )
                self.send_json_response(res)
            except Exception as e:
                self.send_json_response({
                    "status": "error",
                    "message": str(e)
                }, status=400)

        elif parsed.path in ('/api/capture/toggle', '/api/auto-probe/toggle'):
            with state.lock:
                state.capture_enabled = not state.capture_enabled
                new_val = "1" if state.capture_enabled else "0"
            database.update_config({"capture_enabled": new_val})
            msg = "Captura de telemetría reanudada" if state.capture_enabled else "Captura de telemetría pausada (Monitoreo de Roaming activo)"
            self.send_json_response({
                "status": "success",
                "capture_enabled": state.capture_enabled,
                "auto_probe_enabled": state.auto_probe_enabled,
                "message": msg
            })

        elif parsed.path == '/api/capture':
            enabled = data.get('enabled')
            if enabled is not None:
                is_on = (str(enabled).lower() in ('1', 'true'))
                with state.lock:
                    state.capture_enabled = is_on
                    new_val = "1" if is_on else "0"
                database.update_config({"capture_enabled": new_val})
                self.send_json_response({"status": "success", "capture_enabled": state.capture_enabled})
            else:
                self.send_json_response({"status": "error", "message": "Parámetro enabled requerido"}, status=400)

        elif parsed.path == '/api/locations/sync':
            mapping = database.reload_sedes_zonas_file(overwrite=True)
            self.send_json_response({"status": "success", "locations": list(mapping.keys()), "zones": mapping})

        elif parsed.path == '/api/locations/import':
            content = data.get('content', '') if isinstance(data, dict) else body
            overwrite = bool(data.get('overwrite', False)) if isinstance(data, dict) else False
            try:
                result = database.import_sedes_zonas_data(content, overwrite=overwrite)
                self.send_json_response(result)
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)}, status=400)

        elif parsed.path == '/api/locations/delete':
            loc = data.get('location')
            if loc:
                database.delete_location(loc)
                self.send_json_response({"status": "success", "locations": database.get_locations()})
            else:
                self.send_json_response({"status": "error", "message": "Falta parámetro location"})

        elif parsed.path == '/api/zones':
            loc = data.get('location')
            zone = data.get('zone')
            if loc and zone:
                database.add_zone_to_location(loc, zone)
                self.send_json_response({"status": "success", "zones": database.get_location_zones_map()})
            else:
                self.send_json_response({"status": "error", "message": "Faltan parámetros"})

        elif parsed.path == '/api/zones/delete':
            loc = data.get('location')
            zone = data.get('zone')
            if loc and zone:
                database.remove_zone_from_location(loc, zone)
                self.send_json_response({"status": "success", "zones": database.get_location_zones_map()})
            else:
                self.send_json_response({"status": "error", "message": "Faltan parámetros location y zone"}, status=400)

        elif parsed.path == '/api/net-diag/run':
            cfg = database.get_config()
            extra = cfg.get("extra_ping_targets", "")
            exclude = cfg.get("excluded_ping_targets", "")
            target_h = urlparse(state.target_url).hostname
            res = net_diag.run_full_network_diagnostic(extra_hosts_str=extra, exclude_hosts_str=exclude, target_host=target_h)
            database.save_net_diag(res, location=state.location, zone=state.zone, target_url=state.target_url)
            with state.lock:
                state.net_diag_counter += 1
                state.last_net_diag_time = time.time()
            self.send_json_response({"status": "success", "results": res})

        elif parsed.path == '/api/clear':
            scope = data.get('scope', 'all')
            database.clear_history(scope)
            with state.lock:
                if scope in ('roaming', 'all'):
                    state.roaming_events.clear()
                    save_roaming_events([])
                if scope in ('telemetry', 'all'):
                    state.telemetry_history.clear()
            self.send_json_response({"status": "success", "message": f"Historial '{scope}' limpiado correctamente"})

        elif parsed.path == '/api/clear-roaming-log':
            with state.lock:
                state.roaming_events.clear()
            save_roaming_events([])
            database.clear_history('roaming')
            self.send_json_response({"status": "success", "message": "Historial de roaming limpiado"})

        elif parsed.path == '/api/oui/update':
            res = oui_manager.trigger_ieee_update(background=True)
            self.send_json_response(res)

        elif parsed.path == '/api/oui/add':
            try:
                prefix = data.get('prefix', '').strip()
                vendor = data.get('vendor', '').strip()
                res = oui_manager.add_custom(prefix, vendor)
                self.send_json_response({"status": "success", "entry": res})
            except ValueError as e:
                self.send_json_response({"status": "error", "message": str(e)})

        elif parsed.path == '/api/oui/remove':
            try:
                prefix = data.get('prefix', '').strip()
                res = oui_manager.remove_custom(prefix)
                self.send_json_response({"status": "success", "removed": res})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)})

        elif parsed.path == '/api/ap-names/add':
            try:
                bssid = data.get('bssid', '').strip()
                name = data.get('name', '').strip()
                location = data.get('location', '') or data.get('notes', '')
                model = data.get('model', '').strip()
                res = ap_manager.add_or_update(bssid, name, location=str(location).strip(), model=model)
                self.send_json_response({"status": "success", "entry": res})
            except ValueError as e:
                self.send_json_response({"status": "error", "message": str(e)})

        elif parsed.path == '/api/ap-names/import-csv':
            try:
                csv_content = data.get('csv_content', '')
                if not csv_content:
                    self.send_json_response({"status": "error", "message": "El archivo CSV está vacío"})
                    return
                res = ap_manager.import_csv(csv_content)
                self.send_json_response(res)
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)})

        elif parsed.path == '/api/ap-names/remove':
            bssid = data.get('bssid', '').strip()
            res = ap_manager.remove(bssid)
            self.send_json_response({"status": "success", "removed": res})

        elif parsed.path == '/api/ap-names/clear':
            ap_manager.clear()
            self.send_json_response({"status": "success", "message": "Base de datos de APs limpiada"})

        elif parsed.path == '/api/set-interface':
            new_interface = data.get('interface', '').strip()
            if not new_interface:
                self.send_json_response({"status": "error", "message": "Interfaz no especificada"})
                return
            available = get_available_wifi_interfaces()
            if new_interface not in available:
                self.send_json_response({
                    "status": "error",
                    "message": f"Interfaz '{new_interface}' no disponible. Disponibles: {', '.join(available)}"
                })
                return
            state.set_interface(new_interface)
            database.set_config("selected_wifi_interface", new_interface)
            self.send_json_response({
                "status": "success",
                "message": f"Interfaz cambiada a '{new_interface}'",
                "interface": new_interface
            })

        elif parsed.path == '/api/trigger-test-ping':
            gw = state.gateway_ip
            pings = []
            for _ in range(5):
                p = measure_ping(gw)
                if p is not None:
                    pings.append(p)
                time.sleep(0.2)
            avg_ping = round(sum(pings) / len(pings), 2) if pings else None
            loss = ((5 - len(pings)) / 5.0) * 100
            self.send_json_response({
                "status": "success",
                "avg_ping_ms": avg_ping,
                "packet_loss_pct": loss,
                "pings": pings
            })
        else:
            self.send_error(404, "Endpoint no encontrado")

    def send_json_response(self, data, status=200):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)

    def get_status_data(self):
        with state.lock:
            same_ssid_aps = [ap for ap in state.candidate_aps if ap.get('is_same_ssid')]
            better_candidate = None
            better_candidates = [
                ap for ap in same_ssid_aps 
                if ap.get('bssid') != state.current_bssid and ap.get('signal', 0) > (state.signal_pct + 8)
            ]
            if better_candidates:
                better_candidate = max(better_candidates, key=lambda ap: ap.get('signal', 0))

            roaming_verdict = "Conectado al mejor AP disponible"
            if better_candidate:
                diff = better_candidate['signal'] - state.signal_pct
                cand_name = better_candidate.get('ap_name')
                cand_label = f"{cand_name} ({better_candidate['bssid']})" if cand_name else f"AP {better_candidate['bssid']}"
                roaming_verdict = f"Candidato a Roaming disponible: {cand_label} (+{diff}% señal)"
            elif len(same_ssid_aps) > 1:
                roaming_verdict = f"Red Mesh/Multi-AP activa ({len(same_ssid_aps)} APs detectados con mismo SSID)"
            elif not state.current_bssid or state.current_bssid == "No conectado":
                roaming_verdict = "Sin conexión Wi-Fi activa"
            elif len(same_ssid_aps) == 1:
                roaming_verdict = "Conectado al único AP detectado para este SSID"

            return {
                "bssid": state.current_bssid or "No conectado",
                "ap_name": state.ap_name,
                "ssid": state.current_ssid or "Desconectado",
                "signal_dbm": state.signal_dbm,
                "signal_pct": state.signal_pct,
                "tx_bitrate": state.tx_bitrate,
                "rx_bitrate": state.rx_bitrate,
                "frequency_mhz": state.frequency_mhz,
                "channel": state.channel,
                "band": state.band,
                "interface": state.interface,
                "ip_address": state.ip_address,
                "gateway_ip": state.gateway_ip,
                "ping_ms": state.ping_latency_ms,
                "rating_text": state.rating_text,
                "rating_score": state.rating_score,
                "rating_color": state.rating_badge_color,
                "vendor_name": state.vendor_name,
                "same_ssid_aps_count": len(same_ssid_aps),
                "total_neighbor_aps": len(state.candidate_aps),
                "roaming_verdict": roaming_verdict,
                "recent_roaming_count": len(state.roaming_events),
                "telemetry_history": list(state.telemetry_history),
                "last_update": time.strftime("%H:%M:%S", time.localtime(state.last_update_time)),
                # Multipurpose & Application Latency telemetry
                "location": state.location,
                "zone": state.zone,
                "target_url": state.target_url,
                "active_preset": state.active_preset,
                "app_latency_ms": state.app_latency_ms,
                "app_cold_total_ms": state.app_cold_total_ms,
                "app_dns_ms": state.app_dns_ms,
                "app_tcp_ms": state.app_tcp_ms,
                "app_tls_ms": state.app_tls_ms,
                "app_ttfb_ms": state.app_ttfb_ms,
                "app_transfer_ms": state.app_transfer_ms,
                "app_status_code": state.app_status_code,
                "app_is_error": state.app_is_error,
                "app_error_message": state.app_error_message,
                "last_probe_time": state.last_probe_time,
                "http_probe_counter": getattr(state, "http_probe_counter", 0),
                "last_net_diag_time": getattr(state, "last_net_diag_time", 0.0),
                "net_diag_counter": getattr(state, "net_diag_counter", 0),
                "auto_probe_enabled": state.auto_probe_enabled,
                "capture_enabled": state.capture_enabled,
                "auth_enabled": (database.get_config().get("auth_enabled", "0") in ('1', True, 'true', 1)),
                "auth_type": database.get_config().get("auth_type", "ntlm"),
                "auth_user": database.get_config().get("auth_user", ""),
                "auth_domain": database.get_config().get("auth_domain", "")
            }

def main():
    parser = argparse.ArgumentParser(
        description='Wi-Fi & Enterprise Multipurpose Telemetry Analyzer',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Ejemplos de uso:
  python server.py                    # Detecta interfaz automáticamente
  python server.py -i Wi-Fi           # Usa interfaz específica
  python server.py --list             # Lista todas las interfaces disponibles
  python server.py --port 9000        # Usa puerto 9000
  python server.py --no-browser       # No abre el navegador automáticamente
        '''
    )
    parser.add_argument('-i', '--interface', type=str, 
                        help='Interfaz Wi-Fi a usar (ej: Wi-Fi, wlp2s0, wlan0)')
    parser.add_argument('--list', action='store_true',
                        help='Lista todas las interfaces Wi-Fi disponibles y sale')
    parser.add_argument('--port', type=int, default=PORT,
                        help=f'Puerto para el servidor (defecto: {PORT})')
    parser.add_argument('--no-browser', action='store_true',
                        help='No abre el navegador automáticamente al iniciar')
    
    args = parser.parse_args()
    
    if args.list:
        interfaces = get_available_wifi_interfaces()
        print("Interfaces Wi-Fi disponibles:")
        if interfaces:
            for iface in interfaces:
                print(f"  - {iface}")
        else:
            print("  No se encontraron interfaces Wi-Fi")
        sys.exit(0)
    
    global state
    state = WiFiState(interface=args.interface)
    agent_runtime.bind_providers(
        state_provider=lambda: {
            "location": state.location,
            "zone": state.zone,
            "ssid": state.current_ssid or "Desconectado",
            "bssid": state.current_bssid or "No conectado",
            "ap_name": state.ap_name,
            "vendor_name": state.vendor_name,
            "signal_dbm": state.signal_dbm,
            "signal_pct": state.signal_pct,
            "channel": state.channel,
            "band": state.band,
            "frequency_mhz": state.frequency_mhz,
            "tx_bitrate": state.tx_bitrate,
            "rx_bitrate": state.rx_bitrate,
            "ip_address": state.ip_address,
            "gateway_ip": state.gateway_ip,
            "ping_ms": state.ping_latency_ms,
            "roaming_verdict": f"AP actual: {state.ap_name or state.current_bssid}",
            "same_ssid_aps_count": len([ap for ap in state.candidate_aps if ap.get('is_same_ssid')]),
            "total_neighbor_aps": len(state.candidate_aps),
            "target_url": state.target_url,
            "app_latency_ms": state.app_latency_ms,
            "app_cold_total_ms": state.app_cold_total_ms,
            "app_dns_ms": state.app_dns_ms,
            "app_tcp_ms": state.app_tcp_ms,
            "app_tls_ms": state.app_tls_ms,
            "app_ttfb_ms": state.app_ttfb_ms,
            "app_transfer_ms": state.app_transfer_ms,
            "app_status_code": state.app_status_code,
            "app_is_error": state.app_is_error,
            "app_error_message": state.app_error_message,
        },
        scan_provider=lambda: list(state.candidate_aps)
    )
    port = args.port
    
    try:
        server = QuietThreadingHTTPServer(("", port), WiFiRequestHandler)
    except OSError as e:
        if e.errno == 98 or getattr(e, 'winerror', None) == 10048:
            print(f"\n❌ Error: El puerto {port} ya está en uso.")
            print(f"👉 Solución:")
            print(f"   - En Linux: ejecuta './stop.sh' para liberar el puerto.")
            print(f"   - En Windows: cierra cualquier otra consola que esté corriendo server.py.")
            print(f"   - O ejecuta en otro puerto: python server.py --port {port + 1}")
            sys.exit(1)
        else:
            raise

    # 1. Start background Wi-Fi telemetry thread
    thread_wifi = threading.Thread(target=wifi_telemetry_loop, daemon=True, name="WiFiTelemetryThread")
    thread_wifi.start()

    # 2. Start background HTTP application probe thread
    thread_probe = threading.Thread(target=http_probe_loop, daemon=True, name="HTTPProbeThread")
    thread_probe.start()

    # 3. Start background scheduled ICMP network diagnostics thread
    thread_net_diag = threading.Thread(target=net_diag_scheduled_loop, daemon=True, name="NetDiagScheduledThread")
    thread_net_diag.start()

    if not args.no_browser:
        def open_browser():
            time.sleep(1.2)
            try:
                webbrowser.open(f"http://localhost:{port}")
            except Exception:
                pass
        threading.Thread(target=open_browser, daemon=True).start()

    print(f"=====================================================")
    print(f" 🚀 Wi-Fi & Enterprise Telemetry Analyzer iniciado en:")
    print(f" 👉 http://localhost:{port}")
    print(f" 📡 Interfaz Wi-Fi: {state.interface} ({'Windows' if IS_WINDOWS else 'Linux'})")
    print(f" 🏢 Sede Activa: {state.location} | Zona: {state.zone}")
    print(f" 🎯 Target Probe: {state.target_url}")
    print(f"=====================================================")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")
        state.is_monitoring = False
        server.server_close()

if __name__ == '__main__':
    main()
