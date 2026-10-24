"""
Módulo de Gestión de Fabricantes OUI (MAC Address Organizationally Unique Identifier)
Wi-Fi Roaming Analyzer.

Permite:
1. Carga y almacenamiento en archivo externo 'oui_vendors.json'.
2. Búsqueda y resolución rápida de BSSID / MAC a fabricante de APs.
3. Actualización automática desde el registro oficial IEEE (MA-L Registry).
4. Registro y persistencia de fabricantes personalizados (custom overrides).
"""

import os
import json
import re
import csv
import io
import time
import threading
import ssl
import urllib.request
from datetime import datetime

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
OUI_FILE = os.path.join(PROJECT_ROOT, 'data', 'oui_vendors.json')
if not os.path.exists(OUI_FILE):
    alt_file = os.path.join(CURRENT_DIR, 'oui_vendors.json')
    if os.path.exists(alt_file):
        OUI_FILE = alt_file

# Fabricantes y APs conocidos por defecto (fallback garantizado)
DEFAULT_OUI_VENDORS = {
    # Aruba / HPE
    "94:64:24": "Aruba Networks / HPE",
    "20:A6:CD": "Aruba Networks / HPE",
    "00:0B:86": "Aruba Networks / HPE",
    "F0:5C:19": "Aruba Networks / HPE",
    "D8:C7:C8": "Aruba Networks / HPE",
    "A8:BD:27": "Aruba Networks / HPE",
    "B4:5D:50": "Aruba Networks / HPE",

    # Cisco & Meraki
    "0A:02:05": "Cisco Systems / Meraki",
    "24:DE:C6": "Cisco Systems",
    "00:27:0D": "Cisco Systems",
    "00:1A:2B": "Cisco Systems",
    "BC:16:65": "Cisco Systems",
    "00:25:9C": "Cisco-Linksys",
    "34:BD:C8": "Cisco Systems",
    "50:06:04": "Cisco Systems",
    "64:A0:E7": "Cisco Systems",
    "00:18:BA": "Cisco Meraki",
    "E0:55:3D": "Cisco Meraki",

    # Ubiquiti
    "B0:14:DF": "Ubiquiti Networks",
    "E0:63:DA": "Ubiquiti Inc.",
    "74:83:C2": "Ubiquiti Inc.",
    "18:E8:29": "Ubiquiti Inc.",
    "44:D9:E7": "Ubiquiti Inc.",
    "B4:FB:E4": "Ubiquiti Inc.",
    "68:D7:9A": "Ubiquiti Inc.",
    "DC:9F:DB": "Ubiquiti Inc.",
    "24:5A:4C": "Ubiquiti Inc.",
    "04:18:D6": "Ubiquiti Inc.",
    "F4:92:BF": "Ubiquiti Inc.",
    "78:45:58": "Ubiquiti Inc.",

    # Ruckus / CommScope
    "70:69:79": "Ruckus Wireless / CommScope",
    "C0:C5:20": "Ruckus Wireless / CommScope",
    "00:24:82": "Ruckus Wireless",
    "8C:0C:90": "Ruckus Wireless",

    # Fortinet & Juniper / Mist
    "70:4F:57": "Fortinet Inc.",
    "00:09:0F": "Fortinet Inc.",
    "5C:5B:35": "Mist Systems / Juniper",
    "D4:20:B0": "Juniper Networks",

    # MikroTik & Cambium
    "D4:01:C3": "MikroTik",
    "48:8F:5A": "MikroTik",
    "CC:2D:E0": "MikroTik",
    "00:04:56": "Cambium Networks",

    # Huawei, ZTE, Xiaomi, Ruijie
    "8C:53:C3": "Huawei Technologies",
    "00:E0:FC": "Huawei Technologies",
    "8C:90:2D": "ZTE Corporation",
    "CC:ED:DC": "Xiaomi Communications",
    "08:55:31": "Ruijie Networks",

    # TP-Link, D-Link, Netgear, Linksys, Asus
    "0C:F0:7B": "TP-Link Corporation",
    "50:C7:BF": "TP-Link Corporation",
    "60:A4:4C": "TP-Link Corporation",
    "98:DA:C4": "TP-Link Corporation",
    "00:1E:58": "D-Link Corporation",
    "74:3A:EF": "Netgear",
    "20:E5:2A": "Netgear",
    "D8:47:32": "Linksys / Belkin",
    "14:91:82": "Linksys / Belkin",
    "54:47:CC": "Asustek Computer",

    # Operadores y Routers ISP
    "24:2F:D0": "Sagemcom Broadband",
    "8C:5A:25": "ARRIS Group",
    "E4:DA:DF": "Intel Mobile",
    "00:1D:CE": "Technicolor / Thomson"
}

IEEE_OUI_URLS = [
    "https://standards-oui.ieee.org/oui/oui.csv",
    "http://standards-oui.ieee.org/oui/oui.csv"
]

class OUIManager:
    def __init__(self, filepath=OUI_FILE):
        self.filepath = filepath
        self.lock = threading.Lock()
        self.vendors = {}
        self.custom = {}
        self.metadata = {
            "last_updated": None,
            "total_entries": 0,
            "source": "Predeterminado"
        }
        self.update_status = {
            "status": "idle",  # 'idle', 'downloading', 'processing', 'completed', 'error'
            "progress": 0,
            "message": "En espera",
            "last_result": None
        }
        self._load()

    def normalize_mac_prefix(self, mac_str):
        """Limpia y extrae el prefijo OUI de 3 bytes (XX:XX:XX)."""
        if not mac_str:
            return None
        cleaned = re.sub(r'[^A-Fa-f0-9]', '', mac_str).upper()
        if len(cleaned) < 6:
            return None
        prefix_hex = cleaned[:6]
        return f"{prefix_hex[0:2]}:{prefix_hex[2:4]}:{prefix_hex[4:6]}"

    def _load(self):
        """Carga el archivo oui_vendors.json si existe, o inicializa con los predeterminados."""
        with self.lock:
            if os.path.exists(self.filepath):
                try:
                    with open(self.filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, dict):
                            if "vendors" in data or "custom" in data:
                                self.vendors = data.get("vendors", {})
                                self.custom = data.get("custom", {})
                                self.metadata = data.get("_meta", self.metadata)
                            else:
                                # Formato plano { "XX:XX:XX": "Vendor" }
                                self.vendors = data
                                self.custom = {}
                                self.metadata["total_entries"] = len(data)
                                self.metadata["source"] = "Archivo oui_vendors.json"
                            
                            # Asegurar que los fabricantes base estén presentes
                            for k, v in DEFAULT_OUI_VENDORS.items():
                                if k not in self.vendors and k not in self.custom:
                                    self.vendors[k] = v
                                    
                            self.metadata["total_entries"] = len(self.vendors) + len(self.custom)
                            return
                except Exception as e:
                    print(f"[OUI] Advertencia: Error leyendo {self.filepath}: {e}. Usando predeterminados.")

            # Inicializar con predeterminados
            self.vendors = dict(DEFAULT_OUI_VENDORS)
            self.custom = {}
            self.metadata = {
                "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_entries": len(self.vendors),
                "source": "Predeterminado (AP Comunes)"
            }
            self._save_unlocked()

    def _save_unlocked(self):
        """Guarda la base de datos en disco (debe llamarse dentro de self.lock)."""
        try:
            self.metadata["total_entries"] = len(self.vendors) + len(self.custom)
            payload = {
                "_meta": self.metadata,
                "custom": self.custom,
                "vendors": self.vendors
            }
            tmp_path = self.filepath + ".tmp"
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, self.filepath)
        except Exception as e:
            print(f"[OUI] Error guardando {self.filepath}: {e}")

    def lookup(self, bssid):
        """Busca el fabricante para un BSSID dado."""
        if not bssid or bssid in ("No conectado", "--:--:--:--:--:--", "--"):
            return "Desconocido"

        prefix = self.normalize_mac_prefix(bssid)
        if not prefix:
            return "AP Genérico / Router Wi-Fi"

        with self.lock:
            # 1. Prioridad: Overrides personalizados
            if prefix in self.custom:
                return self.custom[prefix]
            # 2. Base de datos general
            if prefix in self.vendors:
                return self.vendors[prefix]

        return "AP Genérico / Router Wi-Fi"

    def add_custom(self, prefix_raw, vendor_name):
        """Registra o actualiza un prefijo OUI personalizado."""
        prefix = self.normalize_mac_prefix(prefix_raw)
        if not prefix:
            raise ValueError(f"Formato de prefijo MAC inválido: {prefix_raw}")
        name = vendor_name.strip()
        if not name:
            raise ValueError("El nombre del fabricante no puede estar vacío")

        with self.lock:
            self.custom[prefix] = name
            self.metadata["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._save_unlocked()

        return {"prefix": prefix, "vendor": name}

    def remove_custom(self, prefix_raw):
        """Elimina un prefijo personalizado."""
        prefix = self.normalize_mac_prefix(prefix_raw)
        if not prefix:
            return False
        with self.lock:
            if prefix in self.custom:
                del self.custom[prefix]
                self._save_unlocked()
                return True
        return False

    def search(self, query, limit=50):
        """Busca prefijos OUI por término de búsqueda (coincide con MAC o nombre)."""
        q = (query or "").strip().lower()
        results = []
        with self.lock:
            # Buscar en custom primero
            for prefix, vendor in self.custom.items():
                if not q or q in prefix.lower() or q in vendor.lower():
                    results.append({"prefix": prefix, "vendor": vendor, "is_custom": True})
                    if len(results) >= limit:
                        return results

            # Buscar en vendors
            for prefix, vendor in self.vendors.items():
                if not q or q in prefix.lower() or q in vendor.lower():
                    results.append({"prefix": prefix, "vendor": vendor, "is_custom": False})
                    if len(results) >= limit:
                        break

        return results

    def get_info(self):
        """Retorna metadatos y resumen de la base de datos."""
        with self.lock:
            return {
                "total": len(self.vendors) + len(self.custom),
                "vendors_count": len(self.vendors),
                "custom_count": len(self.custom),
                "last_updated": self.metadata.get("last_updated"),
                "source": self.metadata.get("source", "Desconocido")
            }

    def get_update_status(self):
        """Retorna el estado de la tarea de actualización en segundo plano."""
        with self.lock:
            return dict(self.update_status)

    def trigger_ieee_update(self, background=True):
        """Inicia la actualización desde la base de datos oficial del IEEE."""
        with self.lock:
            if self.update_status["status"] in ("downloading", "processing"):
                return {"status": "in_progress", "message": "Ya hay una actualización en curso"}
            self.update_status = {
                "status": "downloading",
                "progress": 5,
                "message": "Conectando con IEEE...",
                "last_result": None
            }

        if background:
            thread = threading.Thread(target=self._run_ieee_update, daemon=True)
            thread.start()
            return {"status": "started", "message": "Actualización iniciada en segundo plano"}
        else:
            return self._run_ieee_update()

    def _run_ieee_update(self):
        """Descarga y procesa el archivo oui.csv del IEEE."""
        try:
            # Configurar contexto SSL tolerante
            ctx = ssl._create_unverified_context()
            opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
            headers = {
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }

            content = None
            last_err = None
            for url in IEEE_OUI_URLS:
                try:
                    with self.lock:
                        self.update_status["message"] = f"Descargando registro oficial desde {url}..."
                        self.update_status["progress"] = 20

                    req = urllib.request.Request(url, headers=headers)
                    with opener.open(req, timeout=25) as res:
                        raw_data = res.read()
                        content = raw_data.decode('utf-8', errors='replace')
                        break
                except Exception as e:
                    last_err = e
                    continue

            if not content:
                raise Exception(f"No fue posible descargar el archivo de IEEE: {last_err}")

            with self.lock:
                self.update_status["status"] = "processing"
                self.update_status["progress"] = 65
                self.update_status["message"] = "Procesando registros OUI..."

            # Parsear CSV de IEEE
            reader = csv.reader(io.StringIO(content))
            try:
                header = next(reader)
            except StopIteration:
                raise Exception("El archivo CSV descargado está vacío")

            new_vendors = {}
            for row in reader:
                if len(row) >= 3:
                    assignment = row[1].strip()
                    org_name = row[2].strip()
                    # Las asignaciones MA-L son de 6 caracteres hexadecimales
                    if len(assignment) == 6 and all(c in '0123456789ABCDEFabcdef' for c in assignment):
                        prefix = f"{assignment[0:2]}:{assignment[2:4]}:{assignment[4:6]}".upper()
                        # Limpiar nombre de organización
                        clean_org = org_name.replace('"', '').replace("'", '').strip()
                        if clean_org:
                            new_vendors[prefix] = clean_org

            if len(new_vendors) < 1000:
                raise Exception(f"Pocos registros encontrados ({len(new_vendors)}). Posible respuesta inválida.")

            # Preservar nombres comerciales amigables de APs predeterminados
            for k, v in DEFAULT_OUI_VENDORS.items():
                if k not in new_vendors or "/" in v:
                    new_vendors[k] = v

            with self.lock:
                self.vendors = new_vendors
                self.metadata["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                self.metadata["source"] = f"Registro Oficial IEEE ({len(new_vendors):,} fabricantes)"
                self._save_unlocked()

                res_info = {
                    "total": len(self.vendors) + len(self.custom),
                    "new_count": len(new_vendors),
                    "timestamp": self.metadata["last_updated"]
                }
                self.update_status["status"] = "completed"
                self.update_status["progress"] = 100
                self.update_status["message"] = f"Base de datos actualizada con éxito: {len(new_vendors):,} fabricantes."
                self.update_status["last_result"] = res_info

            return {"status": "success", "result": res_info}

        except Exception as e:
            with self.lock:
                self.update_status["status"] = "error"
                self.update_status["progress"] = 0
                self.update_status["message"] = f"Error al actualizar: {str(e)}"
                self.update_status["last_result"] = {"error": str(e)}
            return {"status": "error", "error": str(e)}

# Instancia global única
oui_manager = OUIManager()
