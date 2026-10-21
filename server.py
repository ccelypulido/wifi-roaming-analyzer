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
import argparse
import webbrowser
from urllib.parse import parse_qs, urlparse

IS_WINDOWS = sys.platform == 'win32'
PORT = 8050
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(PROJECT_DIR, 'static')

from oui_manager import oui_manager

def lookup_vendor(bssid):
    return oui_manager.lookup(bssid)

def run_windows_cmd(cmd_args, timeout=3):
    """Ejecuta un comando en Windows y decodifica la salida manejando páginas de códigos UTF-8, OEM (cp850/cp437) y CP1252."""
    try:
        proc = subprocess.run(cmd_args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout)
        raw = proc.stdout
        # Probar UTF-8 primero porque valida secuencias multibyte estrictas (evita corromper ñ y ó)
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

HISTORY_FILE = os.path.join(PROJECT_DIR, 'roaming_history.json')

def load_saved_roaming_events():
    """Carga los eventos de roaming guardados del archivo json"""
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
    """Guarda los eventos de roaming en el archivo json"""
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
        if target_block not in connected_blocks and connected_blocks:
            target_block = connected_blocks[0]
    elif connected_blocks:
        target_block = connected_blocks[0]
    elif blocks:
        target_block = blocks[0]

    state_m = re.search(r'(?i)^\s*(?:State|Estado)\s*:\s*(.+)$', target_block, re.MULTILINE)
    if state_m:
        st = state_m.group(1).strip().lower()
        res["state"] = st
        is_conn = any(w in st for w in ("connect", "conectad", "asociad"))
        if not is_conn:
            return res

    ssid_m = re.search(r'(?i)^\s*SSID\s*:\s*(.+)$', target_block, re.MULTILINE)
    if ssid_m:
        res["ssid"] = ssid_m.group(1).strip(' "\'')

    # BSSID (admite dos puntos o guiones, e ignora caracteres adicionales)
    bssid_m = re.search(r'(?i)\bBSSID[^:\n]*:\s*([0-9a-fA-F:-]{11,20})', target_block)
    if bssid_m:
        raw_b = bssid_m.group(1).strip().replace('-', ':').upper()
        if len(raw_b) == 17:
            res["bssid"] = raw_b

    # Señal en % (soporta Signal, Señal, Senal, Se¤al, Seal, Se├▒al o cualquier texto con %)
    sig_m = re.search(r'(?i)(?:Signal|Se.*al)[^:\n]*:\s*(\d+)%', target_block)
    if not sig_m:
        sig_m = re.search(r':\s*(\d+)%', target_block)
    if sig_m:
        pct = int(sig_m.group(1))
        res["signal_pct"] = max(0, min(100, pct))
        res["signal_dbm"] = int((res["signal_pct"] / 2) - 100)

    # Canal
    chan_m = re.search(r'(?i)(?:Channel|Canal)[^:\n]*:\s*(\d+)', target_block)
    if chan_m:
        ch = int(chan_m.group(1))
        res["channel"] = ch
        if 1 <= ch <= 14:
            res["freq_mhz"] = 2412 + (ch - 1) * 5 if ch != 14 else 2484
            res["band"] = "2.4 GHz"
        elif 32 <= ch <= 177:
            res["freq_mhz"] = 5000 + ch * 5
            res["band"] = "5.0 GHz"
        elif ch > 177:
            res["freq_mhz"] = 5950 + ch * 5
            res["band"] = "6 GHz (Wi-Fi 6E/7)"

    # TX rate (soporta: "Velocidad de transmisión (Mbps): 866", "Transmit rate (Mbps): 866", etc.)
    tx_m = re.search(r'(?i)(?:transmit|transmis)[^:\n]*:\s*([0-9.]+)', target_block)
    if tx_m:
        res["tx_bitrate"] = f"{tx_m.group(1).strip()} Mbps"

    # RX rate (soporta: "Velocidad de recepción (Mbps): 866", "Receive rate (Mbps): 866", etc.)
    rx_m = re.search(r'(?i)(?:receive|recep)[^:\n]*:\s*([0-9.]+)', target_block)
    if rx_m:
        res["rx_bitrate"] = f"{rx_m.group(1).strip()} Mbps"

    return res

def parse_windows_networks(output, connected_bssid=None, connected_ssid=None):
    """Parsea la salida de 'netsh wlan show networks mode=bssid' para APs vecinos"""
    candidate_aps = []
    current_ssid = ""
    current_ap = None

    norm_out = output.replace('\r\n', '\n').replace('\r', '\n')

    for line in norm_out.splitlines():
        line_clean = line.strip()
        if not line_clean:
            continue

        ssid_match = re.match(r'(?i)^SSID\s+\d+\s*:\s*(.*)$', line_clean)
        if ssid_match:
            current_ssid = ssid_match.group(1).strip(' "\'')
            continue

        bssid_match = re.search(r'(?i)\bBSSID(?:\s+\d+)?\s*:\s*([0-9a-fA-F:-]{11,20})', line_clean)
        if bssid_match:
            if current_ap:
                candidate_aps.append(current_ap)
            bssid_str = bssid_match.group(1).strip().replace('-', ':').upper()
            is_same = (current_ssid.lower() == connected_ssid.lower()) if connected_ssid and current_ssid else False
            current_ap = {
                "active": (bssid_str == connected_bssid) if connected_bssid else False,
                "ssid": current_ssid,
                "bssid": bssid_str,
                "signal": 0,
                "freq": "Desconocida",
                "channel": "0",
                "rate": "N/A",
                "vendor": lookup_vendor(bssid_str),
                "is_same_ssid": is_same
            }
            continue

        if current_ap:
            sig_m = re.search(r'(?i)(?:Signal|Se.*al)[^:\n]*:\s*(\d+)%', line_clean)
            if not sig_m:
                sig_m = re.search(r':\s*(\d+)%', line_clean)
            if sig_m:
                current_ap["signal"] = int(sig_m.group(1))
                continue

            chan_m = re.search(r'(?i)(?:Channel|Canal)[^:\n]*:\s*(\d+)', line_clean)
            if chan_m:
                ch = int(chan_m.group(1))
                current_ap["channel"] = str(ch)
                if 1 <= ch <= 14:
                    current_ap["freq"] = f"{2412 + (ch-1)*5} MHz" if ch != 14 else "2484 MHz"
                elif 32 <= ch <= 177:
                    current_ap["freq"] = f"{5000 + ch*5} MHz"
                elif ch > 177:
                    current_ap["freq"] = f"{5950 + ch*5} MHz"
                continue

            radio_m = re.search(r'(?i)(?:Radio\s*type|Tipo\s*de\s*radio)[^:\n]*:\s*(.+)$', line_clean)
            if radio_m:
                current_ap["rate"] = radio_m.group(1).strip()
                continue

    if current_ap:
        candidate_aps.append(current_ap)

    return candidate_aps


def calculate_rating(dbm, ping_ms):
    if dbm >= -50:
        score = 100
        rating = "Excelente"
        color = "#10b981" # Emerald green
    elif dbm >= -60:
        score = 85
        rating = "Muy Buena"
        color = "#06b6d4" # Cyan
    elif dbm >= -70:
        score = 70
        rating = "Buena"
        color = "#8b5cf6" # Purple/violet
    elif dbm >= -80:
        score = 45
        rating = "Débil"
        color = "#f59e0b" # Amber
    else:
        score = 20
        rating = "Crítica"
        color = "#ef4444" # Red

    # Penalty for high latency
    if ping_ms is not None:
        if ping_ms > 150:
            score = max(10, score - 20)
        elif ping_ms > 80:
            score = max(10, score - 10)

    return rating, score, color

def get_local_ip_and_gateway(iface):
    ip_addr = "N/A"
    gw_ip = "8.8.8.8"
    if IS_WINDOWS:
        try:
            out = subprocess.check_output(['route', 'print', '0.0.0.0'], text=True, errors='replace', stderr=subprocess.DEVNULL)
            for line in out.splitlines():
                m = re.search(r'0\.0\.0\.0\s+0\.0\.0\.0\s+([0-9.]+)\s+([0-9.]+)', line)
                if m:
                    gw_ip = m.group(1)
                    ip_addr = m.group(2)
                    break
        except Exception:
            pass

        if ip_addr == "N/A":
            try:
                import socket
                s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                s.connect((gw_ip if gw_ip != "8.8.8.8" else "8.8.8.8", 80))
                ip_addr = s.getsockname()[0]
                s.close()
            except Exception:
                pass
        return ip_addr, gw_ip

    try:
        out = subprocess.check_output(['ip', 'addr', 'show', iface], text=True, errors='replace', stderr=subprocess.DEVNULL)
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
        # Use provided interface or auto-detect
        self.interface = interface or self.detect_wifi_interface() or ("Wi-Fi" if IS_WINDOWS else "wlan0")
        self.ip_address = "Desconocida"
        self.gateway_ip = "8.8.8.8"
        self.ping_latency_ms = None
        self.rating_text = "Sin Señal"
        self.rating_score = 0
        self.rating_badge_color = "#ef4444"
        self.vendor_name = "Desconocido"
        self.candidate_aps = []
        self.roaming_events = load_saved_roaming_events()
        self.telemetry_history = []
        self.last_update_time = time.time()
        self.is_monitoring = True
    
    def detect_wifi_interface(self):
        """Detecta la primera interfaz Wi-Fi disponible (Linux o Windows)"""
        try:
            available = get_available_wifi_interfaces()
            if available:
                return available[0]
        except Exception:
            pass
        return "Wi-Fi" if IS_WINDOWS else "wlan0"
    
    def set_interface(self, interface_name):
        """Cambia la interfaz Wi-Fi activa"""
        with self.lock:
            self.interface = interface_name
            self.current_bssid = None
            self.current_ssid = None
            self.signal_dbm = -100

state = WiFiState()

def update_wifi_telemetry():
    with state.lock:
        iface = state.interface
    
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
            cmd = ['netsh', 'wlan', 'show', 'interfaces']
            iw_out = run_windows_cmd(cmd, timeout=3)
            parsed_iface = parse_windows_interface(iw_out, target_iface=iface)
            connected_bssid = parsed_iface["bssid"]
            connected_ssid = parsed_iface["ssid"]
            signal_dbm = parsed_iface["signal_dbm"]
            signal_pct = parsed_iface["signal_pct"]
            freq_mhz = parsed_iface["freq_mhz"]
            channel = parsed_iface["channel"]
            band = parsed_iface["band"]
            tx_bitrate = parsed_iface["tx_bitrate"]
            rx_bitrate = parsed_iface["rx_bitrate"]
        except Exception:
            pass

        try:
            net_cmd = ['netsh', 'wlan', 'show', 'networks', 'mode=bssid']
            net_out = run_windows_cmd(net_cmd, timeout=4)
            candidate_aps = parse_windows_networks(net_out, connected_bssid=connected_bssid, connected_ssid=connected_ssid)
            for ap in candidate_aps:
                ap["vendor"] = lookup_vendor(ap.get("bssid"))
        except Exception:
            pass

        # Fallback BSSID resolver si netsh show interfaces no devolvió el BSSID directamente
        if (not connected_bssid or connected_bssid == "No conectado") and connected_ssid:
            clean_conn_ssid = connected_ssid.strip(' "\'').lower()
            matching_aps = [ap for ap in candidate_aps if ap.get('ssid', '').strip(' "\'').lower() == clean_conn_ssid]
            if matching_aps:
                chan_matching = [ap for ap in matching_aps if str(ap.get('channel', '')) == str(channel)]
                if chan_matching:
                    best = min(chan_matching, key=lambda ap: abs(ap.get('signal', 0) - signal_pct))
                    connected_bssid = best['bssid']
                else:
                    best = min(matching_aps, key=lambda ap: abs(ap.get('signal', 0) - signal_pct))
                    connected_bssid = best['bssid']
            elif candidate_aps and channel > 0:
                # Si el SSID no coincidió (ej. red oculta), buscar por canal y señal más cercana
                chan_aps = [ap for ap in candidate_aps if str(ap.get('channel', '')) == str(channel)]
                if chan_aps:
                    best = min(chan_aps, key=lambda ap: abs(ap.get('signal', 0) - signal_pct))
                    connected_bssid = best['bssid']

        # Fallback para velocidades de enlace si netsh no las reportó
        if tx_bitrate == "N/A" or rx_bitrate == "N/A":
            link_speed = get_windows_link_speed()
            if link_speed:
                if tx_bitrate == "N/A":
                    tx_bitrate = link_speed
                if rx_bitrate == "N/A":
                    rx_bitrate = link_speed

        # Actualizar banderas de activo y mismo SSID una vez resuelto el BSSID
        if connected_bssid:
            for ap in candidate_aps:
                ap["active"] = (ap.get("bssid") == connected_bssid)
                if connected_ssid and ap.get("ssid"):
                    ap["is_same_ssid"] = (ap["ssid"].strip(' "\'').lower() == connected_ssid.strip(' "\'').lower())

        # Rescate de nivel de señal si quedó en 0 pero candidate_aps tiene la información del AP activo
        if signal_pct == 0:
            if connected_bssid:
                active_ap = next((ap for ap in candidate_aps if ap.get('bssid') == connected_bssid), None)
                if active_ap and active_ap.get('signal', 0) > 0:
                    signal_pct = active_ap['signal']
                    signal_dbm = int((signal_pct / 2) - 100)
            if signal_pct == 0 and connected_ssid:
                clean_conn_ssid = connected_ssid.strip(' "\'').lower()
                matching_aps = [ap for ap in candidate_aps if ap.get('ssid', '').strip(' "\'').lower() == clean_conn_ssid and ap.get('signal', 0) > 0]
                if matching_aps:
                    signal_pct = max(ap.get('signal', 0) for ap in matching_aps)
                    signal_dbm = int((signal_pct / 2) - 100)

    else:
        # Query iw link (Linux)
        try:
            iw_out = subprocess.check_output(['iw', 'dev', iface, 'link'], text=True, errors='replace', stderr=subprocess.DEVNULL)
            bssid_m = re.search(r'Connected to ([0-9a-fA-F:]+)', iw_out)
            if bssid_m:
                connected_bssid = bssid_m.group(1).upper()
            
            ssid_m = re.search(r'SSID:\s*(.+)', iw_out)
            if ssid_m:
                connected_ssid = ssid_m.group(1).strip()
                
            signal_m = re.search(r'signal:\s*(-?\d+)\s*dBm', iw_out)
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

        # Determine band
        if freq_mhz >= 5900:
            band = "6 GHz (Wi-Fi 6E/7)"
        elif freq_mhz >= 5000:
            band = "5.0 GHz"
        elif freq_mhz >= 2400:
            band = "2.4 GHz"
        else:
            band = "Desconocida"

        # Query neighbor APs via nmcli
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
                    is_active = (parts[0] == 'sí' or parts[0] == 'yes')
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
                        "freq": ap_freq,
                        "channel": ap_chan,
                        "rate": ap_rate,
                        "vendor": lookup_vendor(ap_bssid),
                        "is_same_ssid": (ap_ssid.strip().lower() == connected_ssid.strip().lower()) if connected_ssid else False
                    })
        except Exception:
            pass

    # Ordenar APs candidatos: Activo primero, luego por porcentaje de señal descendente
    candidate_aps.sort(key=lambda ap: (1 if ap.get('active') else 0, ap.get('signal', 0)), reverse=True)

    rating_text, rating_score, badge_color = calculate_rating(signal_dbm, ping_ms)
    vendor_name = lookup_vendor(connected_bssid)

    with state.lock:
        # Registrar historial de telemetría para persistencia del gráfico al refrescar
        time_str = time.strftime("%H:%M:%S")
        state.telemetry_history.append({
            "time": time_str,
            "signal_dbm": signal_dbm,
            "ping_ms": ping_ms
        })
        if len(state.telemetry_history) > 40:
            state.telemetry_history.pop(0)

        # Detect Roaming Handoff event
        if state.current_bssid and connected_bssid and state.current_bssid != connected_bssid:
            event = {
                "timestamp": time.strftime("%H:%M:%S"),
                "date": time.strftime("%Y-%m-%d"),
                "prev_bssid": state.current_bssid,
                "new_bssid": connected_bssid,
                "ssid": connected_ssid,
                "prev_signal_dbm": state.signal_dbm,
                "new_signal_dbm": signal_dbm,
                "ping_ms": ping_ms,
                "delta_dbm": signal_dbm - state.signal_dbm,
                "verdict": "Transición suave" if (signal_dbm > state.signal_dbm) else "Handoff detectado"
            }
            state.roaming_events.insert(0, event)
            # Keep max 50 roaming events
            if len(state.roaming_events) > 50:
                state.roaming_events.pop()
            save_roaming_events(state.roaming_events)

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
        state.candidate_aps = candidate_aps
        state.last_update_time = time.time()

def background_loop():
    while state.is_monitoring:
        try:
            update_wifi_telemetry()
        except Exception as e:
            print("Error in telemetry update:", e)
        time.sleep(1.5)

class WiFiRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
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
            with state.lock:
                events = list(state.roaming_events)
            self.send_json_response({"events": events})
        elif parsed.path == '/api/scan':
            with state.lock:
                aps = list(state.candidate_aps)
            self.send_json_response({"aps": aps})
        elif parsed.path == '/api/oui':
            self.send_json_response(oui_manager.get_info())
        elif parsed.path == '/api/oui/search':
            qs = parse_qs(parsed.query)
            q = qs.get('q', [''])[0]
            try:
                limit = int(qs.get('limit', [50])[0])
            except ValueError:
                limit = 50
            results = oui_manager.search(q, limit=limit)
            self.send_json_response({"results": results, "count": len(results)})
        elif parsed.path == '/api/oui/status':
            self.send_json_response(oui_manager.get_update_status())
        else:
            # Fallback to static files
            if parsed.path == '/':
                self.path = '/index.html'
            return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/clear-roaming-log':
            with state.lock:
                state.roaming_events.clear()
            save_roaming_events([])
            self.send_json_response({"status": "success", "message": "Historial de roaming limpiado"})
        elif parsed.path == '/api/oui/update':
            res = oui_manager.trigger_ieee_update(background=True)
            self.send_json_response(res)
        elif parsed.path == '/api/oui/add':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                prefix = data.get('prefix', '').strip()
                vendor = data.get('vendor', '').strip()
                res = oui_manager.add_custom(prefix, vendor)
                self.send_json_response({"status": "success", "entry": res})
            except ValueError as e:
                self.send_json_response({"status": "error", "message": str(e)})
            except json.JSONDecodeError:
                self.send_json_response({"status": "error", "message": "JSON inválido"})
        elif parsed.path == '/api/oui/remove':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                prefix = data.get('prefix', '').strip()
                removed = oui_manager.remove_custom(prefix)
                self.send_json_response({"status": "success", "removed": removed})
            except Exception as e:
                self.send_json_response({"status": "error", "message": str(e)})
        elif parsed.path == '/api/set-interface':
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                new_interface = data.get('interface', '').strip()
                
                if not new_interface:
                    self.send_json_response({
                        "status": "error",
                        "message": "Interfaz no especificada"
                    })
                    return
                
                # Validar que la interfaz existe
                available = get_available_wifi_interfaces()
                if new_interface not in available:
                    self.send_json_response({
                        "status": "error",
                        "message": f"Interfaz '{new_interface}' no disponible. Disponibles: {', '.join(available)}"
                    })
                    return
                
                # Cambiar la interfaz
                state.set_interface(new_interface)
                self.send_json_response({
                    "status": "success",
                    "message": f"Interfaz cambiada a '{new_interface}'",
                    "interface": new_interface
                })
            except json.JSONDecodeError:
                self.send_json_response({
                    "status": "error",
                    "message": "JSON inválido"
                })
        elif parsed.path == '/api/trigger-test-ping':
            # Run 5 pings and measure handoff stability
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

    def send_json_response(self, data):
        content = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)

    def get_status_data(self):
        with state.lock:
            # Find candidate APs with same SSID
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
                roaming_verdict = f"Candidato a Roaming disponible: AP {better_candidate['bssid']} (+{diff}% señal)"
            elif len(same_ssid_aps) > 1:
                roaming_verdict = f"Red Mesh/Multi-AP activa ({len(same_ssid_aps)} APs detectados con mismo SSID)"
            elif not state.current_bssid or state.current_bssid == "No conectado":
                roaming_verdict = "Sin conexión Wi-Fi activa"
            elif len(same_ssid_aps) == 1:
                roaming_verdict = "Conectado al único AP detectado para este SSID"

            return {
                "bssid": state.current_bssid or "No conectado",
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
                "last_update": time.strftime("%H:%M:%S", time.localtime(state.last_update_time))
            }


def main():
    # Parsear argumentos de línea de comandos
    parser = argparse.ArgumentParser(
        description='Wi-Fi & AP Roaming Telemetry Analyzer',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Ejemplos de uso:
  python server.py                    # Detecta interfaz automáticamente
  python server.py -i Wi-Fi           # Usa interfaz específica (ej: Wi-Fi en Windows, wlan0 en Linux)
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
    
    # Si --list, mostrar interfaces y salir
    if args.list:
        interfaces = get_available_wifi_interfaces()
        print("Interfaces Wi-Fi disponibles:")
        if interfaces:
            for iface in interfaces:
                print(f"  - {iface}")
        else:
            print("  No se encontraron interfaces Wi-Fi")
        sys.exit(0)
    
    # Inicializar estado con la interfaz especificada
    global state
    state = WiFiState(interface=args.interface)
    port = args.port
    
    # Permitir reutilización inmediata de dirección/puerto (evita TIME_WAIT / Address already in use)
    socketserver.TCPServer.allow_reuse_address = True

    try:
        server = socketserver.TCPServer(("", port), WiFiRequestHandler)
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

    # Start background telemetry thread
    thread = threading.Thread(target=background_loop, daemon=True)
    thread.start()

    # Abrir el navegador automáticamente si no se desactivó
    if not args.no_browser:
        def open_browser():
            time.sleep(1.2)
            try:
                webbrowser.open(f"http://localhost:{port}")
            except Exception:
                pass
        threading.Thread(target=open_browser, daemon=True).start()

    print(f"=====================================================")
    print(f" 🚀 WiFi & Roaming Analyzer iniciado en:")
    print(f" 👉 http://localhost:{port}")
    print(f" 📡 Interfaz: {state.interface} ({'Windows' if IS_WINDOWS else 'Linux'})")
    print(f"=====================================================")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")
        state.is_monitoring = False
        server.server_close()

if __name__ == '__main__':
    main()
