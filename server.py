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
from urllib.parse import parse_qs, urlparse

PORT = 8050
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(PROJECT_DIR, 'static')

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
        self.interface = interface or self.detect_wifi_interface() or "wlp2s0"
        self.ip_address = "Desconocida"
        self.gateway_ip = "8.8.8.8"
        self.ping_latency_ms = None
        self.rating_text = "Sin Señal"
        self.rating_score = 0
        self.rating_badge_color = "#ef4444"
        self.vendor_name = "Desconocido"
        self.candidate_aps = []
        self.roaming_events = []
        self.last_update_time = time.time()
        self.is_monitoring = True
    
    def detect_wifi_interface(self):
        """Detecta la primera interfaz Wi-Fi disponible"""
        try:
            out = subprocess.check_output(['iw', 'dev'], text=True, stderr=subprocess.DEVNULL)
            m = re.search(r'Interface\s+(\w+)', out)
            if m:
                return m.group(1)
        except:
            pass
        return None
    
    def set_interface(self, interface_name):
        """Cambia la interfaz Wi-Fi activa"""
        with self.lock:
            self.interface = interface_name
            self.current_bssid = None
            self.current_ssid = None
            self.signal_dbm = -100

state = WiFiState()

# Known MAC OUI vendors for common APs
OUI_VENDORS = {
    "8C:53:C3": "Huawei Technologies",
    "0C:F0:7B": "TP-Link Corporation",
    "8C:90:2D": "ZTE Corporation",
    "CC:ED:DC": "Xiaomi Communications",
    "24:2F:D0": "Sagemcom Broadband",
    "8C:5A:25": "ARRIS Group",
    "0A:02:05": "Cisco Systems / Meraki",
    "D8:47:32": "Linksys / Belkin",
    "54:47:CC": "Asustek Computer",
    "74:3A:EF": "Netgear",
    "E4:DA:DF": "Intel Mobile",
    "B0:14:DF": "Ubiquiti Networks"
}

def lookup_vendor(bssid):
    if not bssid:
        return "Desconocido"
    clean_bssid = bssid.replace("\\:", ":").upper()
    prefix = clean_bssid[:8]
    return OUI_VENDORS.get(prefix, "AP Genérico / Router Wi-Fi")

def get_available_wifi_interfaces():
    """Obtiene lista de todas las interfaces Wi-Fi disponibles"""
    interfaces = []
    try:
        out = subprocess.check_output(['iw', 'dev'], text=True, stderr=subprocess.DEVNULL)
        # Busca todas las líneas que comienzan con "Interface"
        for match in re.finditer(r'Interface\s+(\w+)', out):
            interfaces.append(match.group(1))
    except:
        pass
    
    # Si no encuentra interfaz, intenta con iwconfig como fallback
    if not interfaces:
        try:
            out = subprocess.check_output(['iwconfig'], text=True, stderr=subprocess.DEVNULL)
            for line in out.split('\n'):
                if line and not line.startswith(' '):
                    iface = line.split()[0]
                    interfaces.append(iface)
        except:
            pass
    
    return interfaces

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
    try:
        out = subprocess.check_output(['ip', 'addr', 'show', iface], text=True, stderr=subprocess.DEVNULL)
        m = re.search(r'inet\s+([0-9.]+)', out)
        if m:
            ip_addr = m.group(1)
    except:
        pass

    try:
        out = subprocess.check_output(['ip', 'route', 'show', 'default'], text=True, stderr=subprocess.DEVNULL)
        m = re.search(r'via\s+([0-9.]+)', out)
        if m:
            gw_ip = m.group(1)
    except:
        pass

    return ip_addr, gw_ip

def measure_ping(target):
    try:
        out = subprocess.check_output(['ping', '-c', '1', '-W', '1', target], text=True, stderr=subprocess.DEVNULL)
        m = re.search(r'(?:tiempo|time)=([0-9.,]+)', out)
        if m:
            return float(m.group(1).replace(',', '.'))
    except:
        pass
    return None

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

    # Query iw link
    try:
        iw_out = subprocess.check_output(['iw', 'dev', iface, 'link'], text=True, stderr=subprocess.DEVNULL)
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
    except Exception as e:
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
    candidate_aps = []
    try:
        nm_out = subprocess.check_output(
            ['nmcli', '-t', '-f', 'active,ssid,bssid,signal,freq,chan,rate', 'device', 'wifi'],
            text=True, stderr=subprocess.DEVNULL
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
                    "is_same_ssid": (ap_ssid == connected_ssid) if connected_ssid else False
                })
    except Exception as e:
        pass

    rating_text, rating_score, badge_color = calculate_rating(signal_dbm, ping_ms)
    vendor_name = lookup_vendor(connected_bssid)

    with state.lock:
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
            self.send_json_response({"status": "success", "message": "Historial de roaming limpiado"})
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
            for ap in same_ssid_aps:
                if ap['bssid'] != state.current_bssid and ap['signal'] > (state.signal_pct + 15):
                    better_candidate = ap
                    break

            roaming_verdict = "Conectado al mejor AP disponible"
            if better_candidate:
                roaming_verdict = f"Candidato a Roaming disponible: AP {better_candidate['bssid']} (+{better_candidate['signal'] - state.signal_pct}% señal)"
            elif len(same_ssid_aps) > 1:
                roaming_verdict = f"Red Mesh/Multi-AP activa ({len(same_ssid_aps)} APs detectados con mismo SSID)"
            elif not state.current_bssid:
                roaming_verdict = "Sin conexión Wi-Fi activa"

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
                "last_update": time.strftime("%H:%M:%S", time.localtime(state.last_update_time))
            }

def main():
    # Parsear argumentos de línea de comandos
    parser = argparse.ArgumentParser(
        description='Wi-Fi & AP Roaming Telemetry Analyzer',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Ejemplos de uso:
  python3 server.py                    # Detecta interfaz automáticamente
  python3 server.py -i wlp2s0         # Usa la interfaz wlp2s0
  python3 server.py --interface wlan0 # Usa la interfaz wlan0
  python3 server.py --list             # Lista todas las interfaces disponibles
  python3 server.py --port 9000        # Usa puerto 9000
        '''
    )
    parser.add_argument('-i', '--interface', type=str, 
                        help='Interfaz Wi-Fi a usar (ej: wlp2s0, wlan0)')
    parser.add_argument('--list', action='store_true',
                        help='Lista todas las interfaces Wi-Fi disponibles y sale')
    parser.add_argument('--port', type=int, default=PORT,
                        help=f'Puerto para el servidor (defecto: {PORT})')
    
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
    
    # Start background telemetry thread
    thread = threading.Thread(target=background_loop, daemon=True)
    thread.start()

    server = socketserver.TCPServer(("", port), WiFiRequestHandler)
    print(f"=====================================================")
    print(f" 🚀 WiFi & Roaming Analyzer iniciado en:")
    print(f" 👉 http://localhost:{port}")
    print(f" 📡 Interfaz: {state.interface}")
    print(f"=====================================================")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")
        state.is_monitoring = False
        server.server_close()

if __name__ == '__main__':
    main()
