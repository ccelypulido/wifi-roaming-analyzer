"""
Módulo de Gestión de Nombres de APs (Access Points) de Controladoras Wi-Fi.
Wi-Fi Roaming Analyzer.

Permite asociar direcciones MAC / BSSID de APs con sus nombres descriptivos
asignados en controladoras (Cisco WLC, Aruba Central, UniFi, Huawei, FortiGate, etc.),
para mostrar conjuntamente ambos valores en toda la plataforma:
  Ej: "AP-Piso2-SalaJuntas (B0:14:DF:11:22:30)"

Totalmente compatible con Windows y Linux (usa únicamente la biblioteca estándar).
"""

import os
import json
import re
import csv
import io
import threading
from datetime import datetime

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
AP_NAMES_FILE = os.path.join(PROJECT_ROOT, 'data', 'ap_names.json')
if not os.path.exists(AP_NAMES_FILE):
    alt_file = os.path.join(CURRENT_DIR, 'ap_names.json')
    if os.path.exists(alt_file):
        AP_NAMES_FILE = alt_file

class APManager:
    def __init__(self, filepath=AP_NAMES_FILE):
        self.filepath = filepath
        self.lock = threading.Lock()
        self.aps = {} # { "XX:XX:XX:XX:XX:XX": { "name": "...", "location": "...", "model": "..." } }
        self.metadata = {
            "last_updated": None,
            "total_entries": 0,
            "source": "Archivo ap_names.json"
        }
        self._load()

    def normalize_mac(self, mac_str):
        """
        Normaliza cualquier formato de MAC a formato estándar XX:XX:XX:XX:XX:XX.
        Soporta:
          - Formato dos puntos: B0:14:DF:11:22:33
          - Formato guiones (Windows): B0-14-DF-11-22-33
          - Formato Cisco WLC: b014.df11.2233
          - Formato plano: B014DF112233
        """
        if not mac_str:
            return None
        cleaned = re.sub(r'[^A-Fa-f0-9]', '', str(mac_str)).upper()
        if len(cleaned) != 12:
            return None
        return ':'.join(cleaned[i:i+2] for i in range(0, 12, 2))

    def _load(self):
        """Carga el archivo ap_names.json si existe o crea estructura inicial."""
        with self.lock:
            if os.path.exists(self.filepath):
                try:
                    with open(self.filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, dict):
                            if "aps" in data:
                                raw_aps = data.get("aps", {})
                                self.metadata = data.get("_meta", self.metadata)
                            else:
                                raw_aps = data
                            
                            self.aps = {}
                            for k, v in raw_aps.items():
                                norm_mac = self.normalize_mac(k)
                                if norm_mac:
                                    if isinstance(v, dict):
                                        self.aps[norm_mac] = {
                                            "name": str(v.get("name", "")).strip(),
                                            "location": str(v.get("location", "")).strip(),
                                            "model": str(v.get("model", "")).strip()
                                        }
                                    else:
                                        self.aps[norm_mac] = {
                                            "name": str(v).strip(),
                                            "location": "",
                                            "model": ""
                                        }
                            self.metadata["total_entries"] = len(self.aps)
                            return
                except Exception as e:
                    print(f"[APManager] Advertencia leyendo {self.filepath}: {e}")

            # Estructura por defecto
            self.aps = {}
            self.metadata = {
                "last_updated": None,
                "total_entries": 0,
                "source": "Sin registros"
            }
            self._save_unlocked()

    def _save_unlocked(self):
        """Guarda en disco (llamar dentro de self.lock)."""
        try:
            self.metadata["total_entries"] = len(self.aps)
            payload = {
                "_meta": self.metadata,
                "aps": self.aps
            }
            tmp_path = self.filepath + ".tmp"
            with open(tmp_path, 'w', encoding='utf-8') as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, self.filepath)
        except Exception as e:
            print(f"[APManager] Error guardando {self.filepath}: {e}")

    def lookup_name(self, bssid):
        """
        Retorna el nombre asignado en la controladora para este BSSID o None si no existe.
        Soporta coincidencia exacta y coincidencia por prefijo de 5 octetos (para vBSSID / MBSSID).
        """
        if not bssid or bssid in ("No conectado", "--:--:--:--:--:--", "--"):
            return None

        norm = self.normalize_mac(bssid)
        if not norm:
            return None

        with self.lock:
            # 1. Coincidencia exacta
            if norm in self.aps:
                return self.aps[norm].get("name") or None

            # 2. Coincidencia por AP Base (mismo prefijo de 5 octetos XX:XX:XX:XX:XX:)
            prefix5 = norm[:15]
            for ap_mac, ap_info in self.aps.items():
                if ap_mac.startswith(prefix5):
                    return ap_info.get("name") or None

        return None

    def lookup_details(self, bssid):
        """Retorna el diccionario completo con detalles del AP (name, location, model)."""
        if not bssid:
            return None
        norm = self.normalize_mac(bssid)
        if not norm:
            return None

        with self.lock:
            if norm in self.aps:
                res = dict(self.aps[norm])
                res["mac"] = norm
                res["match"] = "exact"
                return res

            prefix5 = norm[:15]
            for ap_mac, ap_info in self.aps.items():
                if ap_mac.startswith(prefix5):
                    res = dict(ap_info)
                    res["mac"] = ap_mac
                    res["match"] = "vBSSID"
                    return res

        return None

    def add_or_update(self, mac_raw, name, location="", model=""):
        """Registra o actualiza un AP individual."""
        norm = self.normalize_mac(mac_raw)
        if not norm:
            raise ValueError(f"Dirección MAC inválida: '{mac_raw}'. Debe contener 12 dígitos hexadecimales.")
        name_clean = str(name).strip()
        if not name_clean:
            raise ValueError("El nombre del AP no puede estar vacío.")

        with self.lock:
            self.aps[norm] = {
                "name": name_clean,
                "location": str(location).strip(),
                "model": str(model).strip()
            }
            self.metadata["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._save_unlocked()

        return {"mac": norm, "name": name_clean, "location": location, "model": model}

    def remove(self, mac_raw):
        """Elimina un AP registrado."""
        norm = self.normalize_mac(mac_raw)
        if not norm:
            return False

        with self.lock:
            if norm in self.aps:
                del self.aps[norm]
                self.metadata["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                self._save_unlocked()
                return True
        return False

    def clear(self):
        """Limpia todos los APs registrados."""
        with self.lock:
            self.aps.clear()
            self.metadata["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self._save_unlocked()

    def search(self, query="", limit=100):
        """Busca APs por nombre, MAC, ubicación o modelo."""
        q = (query or "").strip().lower()
        results = []
        with self.lock:
            for mac, info in self.aps.items():
                name = info.get("name", "")
                loc = info.get("location", "")
                mod = info.get("model", "")
                if (not q or q in mac.lower() or q in name.lower() or 
                    q in loc.lower() or q in mod.lower()):
                    results.append({
                        "mac": mac,
                        "name": name,
                        "location": loc,
                        "model": mod
                    })
                    if len(results) >= limit:
                        break
        return results

    def import_csv(self, csv_text):
        """
        Importa múltiples APs desde un texto CSV exportado de controladoras Wi-Fi
        (Cisco WLC, Aruba Central, UniFi, Huawei, FortiGate, etc.).
        
        Detecta delimitadores automáticamente (,, ;, tab, |).
        Detecta columnas de MAC y Nombre automáticamente o por posición.
        """
        if not csv_text or not csv_text.strip():
            raise ValueError("El contenido CSV está vacío.")

        # Limpiar posibles BOMs (UTF-8 BOM de Excel en Windows)
        cleaned_text = csv_text.strip().lstrip('\ufeff')
        lines = [line for line in cleaned_text.splitlines() if line.strip()]
        if not lines:
            raise ValueError("El archivo no contiene filas válidas.")

        # Detección de delimitador
        first_line = lines[0]
        delimiters = [',', ';', '\t', '|']
        best_delim = ','
        max_splits = 0
        for d in delimiters:
            count = len(first_line.split(d))
            if count > max_splits:
                max_splits = count
                best_delim = d

        reader = csv.reader(io.StringIO(cleaned_text), delimiter=best_delim)
        try:
            raw_rows = list(reader)
        except Exception as e:
            raise ValueError(f"Error procesando formato CSV: {e}")

        if not raw_rows:
            raise ValueError("No se encontraron filas.")

        header = [h.strip().lower() for h in raw_rows[0]]
        
        # Buscar índices de columnas
        mac_idx = -1
        name_idx = -1
        loc_idx = -1
        mod_idx = -1

        mac_keywords = ['mac', 'bssid', 'ethernet', 'eth', 'radio mac', 'base mac', 'dirección mac', 'direccion mac']
        name_keywords = ['ap name', 'ap_name', 'name', 'nombre', 'hostname', 'device name', 'device_name', 'dispositivo', 'ap']
        loc_keywords = ['location', 'ubicacion', 'ubicación', 'group', 'ap group', 'site', 'sitio', 'piso']
        mod_keywords = ['model', 'modelo', 'type', 'tipo', 'ap model']

        for idx, col in enumerate(header):
            for k in mac_keywords:
                if k in col and mac_idx == -1:
                    mac_idx = idx
                    break
            for k in name_keywords:
                if k in col and name_idx == -1 and idx != mac_idx:
                    name_idx = idx
                    break
            for k in loc_keywords:
                if k in col and loc_idx == -1:
                    loc_idx = idx
                    break
            for k in mod_keywords:
                if k in col and mod_idx == -1:
                    mod_idx = idx
                    break

        # Si no se detectaron encabezados explícitos, usar heurística:
        start_row = 1
        if mac_idx == -1 or name_idx == -1:
            # Comprobar si la primera fila ya contiene datos (no encabezados)
            first_is_mac = bool(self.normalize_mac(raw_rows[0][0]))
            if first_is_mac:
                start_row = 0
                mac_idx = 0
                name_idx = 1 if len(raw_rows[0]) > 1 else -1
            else:
                # Si había encabezados pero no coincidieron exactamente, asumir col 0 = MAC o col 1 = MAC
                for c in range(min(4, len(raw_rows[0]))):
                    # Probar en filas de datos si la columna 'c' tiene MACs
                    has_macs = sum(1 for r in raw_rows[1:6] if len(r) > c and self.normalize_mac(r[c]))
                    if has_macs >= 1 and mac_idx == -1:
                        mac_idx = c
                if mac_idx == -1:
                    mac_idx = 0
                if name_idx == -1:
                    name_idx = 1 if mac_idx == 0 else 0

        added_count = 0
        updated_count = 0
        errors = []

        with self.lock:
            for line_no, row in enumerate(raw_rows[start_row:], start=start_row + 1):
                if not row or not any(row):
                    continue
                if len(row) == 1 and any(d in row[0] for d in (';', ',', '\t', '|')):
                    for alt_d in (';', '\t', '|', ','):
                        if alt_d in row[0]:
                            alt_parts = row[0].split(alt_d)
                            if len(alt_parts) >= 2:
                                row = [p.strip() for p in alt_parts]
                                mac_idx = 0
                                name_idx = 1
                                loc_idx = 2 if len(row) > 2 else -1
                                mod_idx = 3 if len(row) > 3 else -1
                                break
                if len(row) <= mac_idx:
                    continue

                raw_mac = row[mac_idx].strip()
                norm_mac = self.normalize_mac(raw_mac)
                if not norm_mac:
                    errors.append(f"Fila {line_no}: MAC inválida '{raw_mac}'")
                    continue

                raw_name = row[name_idx].strip() if (name_idx != -1 and len(row) > name_idx) else ""
                if not raw_name:
                    raw_name = f"AP-{norm_mac[-8:].replace(':', '')}"

                loc = row[loc_idx].strip() if (loc_idx != -1 and len(row) > loc_idx) else ""
                mod = row[mod_idx].strip() if (mod_idx != -1 and len(row) > mod_idx) else ""

                if norm_mac in self.aps:
                    updated_count += 1
                else:
                    added_count += 1

                self.aps[norm_mac] = {
                    "name": raw_name,
                    "location": loc,
                    "model": mod
                }

            self.metadata["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            self.metadata["source"] = f"Importación CSV ({len(self.aps)} APs)"
            self._save_unlocked()

        return {
            "status": "success",
            "added": added_count,
            "updated": updated_count,
            "total": len(self.aps),
            "errors": errors[:10] # Limitar reporte de errores
        }

    def get_info(self):
        """Retorna estadísticas generales."""
        with self.lock:
            return {
                "total": len(self.aps),
                "last_updated": self.metadata.get("last_updated"),
                "source": self.metadata.get("source", "ap_names.json")
            }

# Instancia global
ap_manager = APManager()
