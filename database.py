import sqlite3
import datetime
import math
import json
import contextlib
import os
import csv
import io
from typing import Dict, Any, List, Optional, Tuple

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "telemetry.db")
SEDES_ZONAS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sedes_zonas.json")

@contextlib.contextmanager
def get_connection():
    """Thread-safe context manager with WAL mode and busy timeout."""
    conn = sqlite3.connect(DB_FILE, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()

def init_db():
    """Initializes SQLite tables and creates indexes."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")

        # 1. Telemetry Samples (Wi-Fi RF + HTTP Probe)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS telemetry_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                created_at TEXT NOT NULL,
                location TEXT DEFAULT 'Sede Principal',
                zone TEXT DEFAULT '',
                -- Wi-Fi RF Metrics
                interface TEXT,
                ssid TEXT,
                bssid TEXT,
                ap_name TEXT,
                vendor TEXT,
                signal_dbm INTEGER,
                signal_pct INTEGER,
                channel INTEGER,
                band TEXT,
                tx_bitrate TEXT,
                rx_bitrate TEXT,
                gw_ping_ms REAL,
                -- HTTP Probe Metrics
                target_url TEXT,
                dns_ms REAL,
                tcp_ms REAL,
                tls_ms REAL,
                ttfb_ms REAL,
                transfer_ms REAL,
                total_ms REAL,
                cold_total_ms REAL,
                status_code INTEGER DEFAULT 0,
                is_error INTEGER DEFAULT 0,
                error_message TEXT,
                response_size_bytes INTEGER DEFAULT 0
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_loc ON telemetry_samples(location, timestamp)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_time ON telemetry_samples(timestamp)")

        # 2. Roaming Events
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS roaming_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                created_at TEXT NOT NULL,
                location TEXT DEFAULT 'Sede Principal',
                zone TEXT DEFAULT '',
                ssid TEXT,
                prev_bssid TEXT,
                prev_ap_name TEXT,
                prev_signal_dbm INTEGER,
                new_bssid TEXT,
                new_ap_name TEXT,
                new_signal_dbm INTEGER,
                delta_dbm INTEGER,
                gw_ping_ms REAL,
                app_latency_ms REAL,
                verdict TEXT
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_roaming_time ON roaming_events(timestamp)")

        # 3. Network Diagnostics History
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS net_diag_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp REAL NOT NULL,
                created_at TEXT NOT NULL,
                location TEXT DEFAULT 'Sede Principal',
                zone TEXT DEFAULT '',
                target_url TEXT,
                results_json TEXT NOT NULL
            )
        """)

        # 4. Config Key-Value Store
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)

        # Default configuration values
        default_zones = {
            "Bodega_CLEN": ["Rack:1-5", "Rack:6-10", "Rack:11-15", "Rack:16-20", "Muelles:Entrada", "Muelles:Despacho", "Mezanine", "Bunker"],
            "Tienda_Principal": ["Cajas:1-4", "Cajas:5-8", "Piso de Ventas:Pasillo Central", "Mostrador Atencion", "Bodega Tienda", "Probadores"],
            "Sede_Administrativa": ["Recepcion Piso 1", "Presidencia y Gerencia", "Sala de Juntas A", "Operaciones Piso 2", "Tecnologia e Infraestructura"]
        }

        defaults = {
            "target_url": "https://1.1.1.1",
            "active_preset": "custom",
            "probe_interval_seconds": "5",
            "probe_timeout_seconds": "5",
            "auto_probe_enabled": "1",
            "verify_ssl": "1",
            "location_name": "Tienda_Principal",
            "current_zone": "Cajas:1-4",
            "zones_by_location": json.dumps(default_zones, ensure_ascii=False),
            "auth_enabled": "0",
            "auth_type": "none",
            "auth_domain": "",
            "auth_user": "",
            "auth_password": "",
            "auth_token": "",
            "extra_ping_targets": "8.8.8.8, 1.1.1.1",
            "excluded_ping_targets": "",
            "selected_wifi_interface": ""
        }
        for k, v in defaults.items():
            cursor.execute("INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)", (k, v))
        conn.commit()

    auto_preload_sedes_zonas()

def get_config() -> Dict[str, str]:
    """Retrieves all configuration keys and values."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM config")
        return {row['key']: row['value'] for row in cursor.fetchall()}

def set_config(key: str, value: str):
    """Sets or updates a single configuration key."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (key, str(value)))
        conn.commit()

def update_config(data: Dict[str, Any]):
    """Updates multiple configuration keys in a transaction."""
    with get_connection() as conn:
        cursor = conn.cursor()
        for k, v in data.items():
            cursor.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", (k, str(v)))
        conn.commit()

def save_telemetry_sample(sample: Dict[str, Any]) -> int:
    """Inserts a combined Wi-Fi + HTTP telemetry sample into SQLite."""
    ts = sample.get('timestamp') or datetime.datetime.now().timestamp()
    created_at = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
    cfg = get_config()
    loc = sample.get('location') or cfg.get('location_name', 'Sede Principal')
    zone = sample.get('zone') if sample.get('zone') is not None else cfg.get('current_zone', '')

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO telemetry_samples (
                timestamp, created_at, location, zone,
                interface, ssid, bssid, ap_name, vendor,
                signal_dbm, signal_pct, channel, band,
                tx_bitrate, rx_bitrate, gw_ping_ms,
                target_url, dns_ms, tcp_ms, tls_ms, ttfb_ms, transfer_ms,
                total_ms, cold_total_ms, status_code, is_error, error_message, response_size_bytes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ts, created_at, loc, zone,
            sample.get('interface'),
            sample.get('ssid'),
            sample.get('bssid'),
            sample.get('ap_name'),
            sample.get('vendor'),
            sample.get('signal_dbm', -100),
            sample.get('signal_pct', 0),
            sample.get('channel', 0),
            sample.get('band', 'Desconocida'),
            sample.get('tx_bitrate', 'N/A'),
            sample.get('rx_bitrate', 'N/A'),
            sample.get('gw_ping_ms'),
            sample.get('target_url'),
            sample.get('dns_ms', 0.0),
            sample.get('tcp_ms', 0.0),
            sample.get('tls_ms', 0.0),
            sample.get('ttfb_ms', 0.0),
            sample.get('transfer_ms', 0.0),
            sample.get('total_ms', 0.0),
            sample.get('cold_total_ms', 0.0),
            sample.get('status_code', 0),
            1 if sample.get('is_error') else 0,
            sample.get('error_message'),
            sample.get('response_size_bytes', 0)
        ))
        conn.commit()
        return cursor.lastrowid

def save_roaming_event(event: Dict[str, Any]) -> int:
    """Inserts a roaming handoff event with location and latency impact into SQLite."""
    ts = event.get('timestamp_raw') or datetime.datetime.now().timestamp()
    created_at = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
    cfg = get_config()
    loc = event.get('location') or cfg.get('location_name', 'Sede Principal')
    zone = event.get('zone') if event.get('zone') is not None else cfg.get('current_zone', '')

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO roaming_events (
                timestamp, created_at, location, zone,
                ssid, prev_bssid, prev_ap_name, prev_signal_dbm,
                new_bssid, new_ap_name, new_signal_dbm, delta_dbm,
                gw_ping_ms, app_latency_ms, verdict
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            ts, created_at, loc, zone,
            event.get('ssid'),
            event.get('prev_bssid'),
            event.get('prev_ap_name'),
            event.get('prev_signal_dbm'),
            event.get('new_bssid'),
            event.get('new_ap_name'),
            event.get('new_signal_dbm'),
            event.get('delta_dbm'),
            event.get('gw_ping_ms') or event.get('ping_ms'),
            event.get('app_latency_ms'),
            event.get('verdict')
        ))
        conn.commit()
        return cursor.lastrowid

def get_roaming_events(limit: int = 50, location_filter: Optional[str] = None, zone_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves roaming events with optional filtering."""
    with get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM roaming_events WHERE 1=1"
        params = []
        if location_filter and location_filter != 'all':
            query += " AND location = ?"
            params.append(location_filter)
        if zone_filter and zone_filter != 'all':
            query += " AND zone = ?"
            params.append(zone_filter)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            # Add formatted date and time for UI convenience
            dt = datetime.datetime.fromtimestamp(d['timestamp'])
            d['time'] = dt.strftime("%H:%M:%S")
            d['date'] = dt.strftime("%Y-%m-%d")
            d['ping_ms'] = d['gw_ping_ms']
            result.append(d)
        return result

def save_net_diag(results: List[Dict[str, Any]], location: Optional[str] = None, zone: Optional[str] = None, target_url: Optional[str] = None) -> int:
    """Saves a complete network diagnostic run (multi-ping + traceroutes)."""
    ts = datetime.datetime.now().timestamp()
    created_at = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat()
    cfg = get_config()
    loc = location or cfg.get('location_name', 'Sede Principal')
    z = zone if zone is not None else cfg.get('current_zone', '')
    url = target_url or cfg.get('target_url', '')

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO net_diag_history (timestamp, created_at, location, zone, target_url, results_json)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (ts, created_at, loc, z, url, json.dumps(results, ensure_ascii=False)))
        conn.commit()
        return cursor.lastrowid

def get_net_diag_history(limit: int = 15, location_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves recent network diagnostic runs."""
    with get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM net_diag_history WHERE 1=1"
        params = []
        if location_filter and location_filter != 'all':
            query += " AND location = ?"
            params.append(location_filter)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        result = []
        for r in rows:
            d = dict(r)
            try:
                d['results'] = json.loads(d['results_json'])
            except Exception:
                d['results'] = []
            result.append(d)
        return result

def get_recent_samples(limit: int = 60, location_filter: Optional[str] = None, zone_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """Returns recent telemetry samples for live charts."""
    with get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM telemetry_samples WHERE 1=1"
        params = []
        if location_filter and location_filter != 'all':
            query += " AND location = ?"
            params.append(location_filter)
        if zone_filter and zone_filter != 'all':
            query += " AND zone = ?"
            params.append(zone_filter)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(limit)
        cursor.execute(query, params)
        rows = cursor.fetchall()
        # Return in chronological order
        result = [dict(r) for r in reversed(rows)]
        for r in result:
            dt = datetime.datetime.fromtimestamp(r['timestamp'])
            r['time'] = dt.strftime("%H:%M:%S")
            r['ping_ms'] = r['gw_ping_ms']
        return result

def calculate_percentile(sorted_list: List[float], p: float) -> float:
    """Calculates percentile p (0 to 100) from a sorted list of floats."""
    if not sorted_list:
        return 0.0
    n = len(sorted_list)
    if n == 1:
        return sorted_list[0]
    k = (n - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_list[int(k)]
    d0 = sorted_list[int(f)] * (c - k)
    d1 = sorted_list[int(c)] * (k - f)
    return round(d0 + d1, 2)

def get_statistics(location_filter: Optional[str] = None, zone_filter: Optional[str] = None) -> Dict[str, Any]:
    """Calculates overall statistics, averages, percentiles, and Wi-Fi health."""
    with get_connection() as conn:
        cursor = conn.cursor()
        where_clause = " WHERE 1=1"
        params = []
        if location_filter and location_filter != 'all':
            where_clause += " AND location = ?"
            params.append(location_filter)
        if zone_filter and zone_filter != 'all':
            where_clause += " AND zone = ?"
            params.append(zone_filter)

        cursor.execute(f"SELECT COUNT(*) FROM telemetry_samples{where_clause}", params)
        total_samples = cursor.fetchone()[0]

        if total_samples == 0:
            return {
                "total_samples": 0,
                "successful_samples": 0,
                "error_samples": 0,
                "uptime_percentage": 100.0,
                "averages": {"total": 0, "dns": 0, "tcp": 0, "tls": 0, "ttfb": 0, "transfer": 0, "signal_dbm": 0, "gw_ping": 0},
                "peaks": {"total": 0, "signal_dbm": 0, "gw_ping": 0},
                "mins": {"total": 0, "signal_dbm": 0, "gw_ping": 0},
                "percentiles": {"p50": 0, "p90": 0, "p95": 0, "p99": 0},
                "jitter": 0.0,
                "roaming_count": 0
            }

        cursor.execute(f"SELECT COUNT(*) FROM telemetry_samples{where_clause} AND is_error = 0 AND total_ms > 0", params)
        successful_samples = cursor.fetchone()[0]
        error_samples = total_samples - successful_samples
        uptime_percentage = round((successful_samples / total_samples) * 100, 2) if total_samples > 0 else 100.0

        # Wi-Fi & HTTP Averages
        cursor.execute(f"""
            SELECT 
                AVG(total_ms), AVG(dns_ms), AVG(tcp_ms), AVG(tls_ms), AVG(ttfb_ms), AVG(transfer_ms),
                MAX(total_ms), MIN(total_ms),
                AVG(signal_dbm), MAX(signal_dbm), MIN(signal_dbm),
                AVG(gw_ping_ms), MAX(gw_ping_ms), MIN(gw_ping_ms)
            FROM telemetry_samples {where_clause} AND is_error = 0 AND total_ms > 0
        """, params)
        row = cursor.fetchone()

        averages = {
            "total": round(row[0] or 0, 2), "dns": round(row[1] or 0, 2), "tcp": round(row[2] or 0, 2),
            "tls": round(row[3] or 0, 2), "ttfb": round(row[4] or 0, 2), "transfer": round(row[5] or 0, 2),
            "signal_dbm": round(row[8] or 0, 1), "gw_ping": round(row[11] or 0, 2)
        }
        peaks = {
            "total": round(row[6] or 0, 2),
            "signal_dbm": round(row[9] or 0, 1),
            "gw_ping": round(row[12] or 0, 2)
        }
        mins = {
            "total": round(row[7] or 0, 2),
            "signal_dbm": round(row[10] or 0, 1),
            "gw_ping": round(row[13] or 0, 2)
        }

        # Percentiles & Jitter
        cursor.execute(f"SELECT total_ms FROM telemetry_samples {where_clause} AND is_error = 0 AND total_ms > 0 ORDER BY total_ms ASC", params)
        latencies = [r[0] for r in cursor.fetchall()]
        percentiles = {
            "p50": calculate_percentile(latencies, 50),
            "p90": calculate_percentile(latencies, 90),
            "p95": calculate_percentile(latencies, 95),
            "p99": calculate_percentile(latencies, 99)
        }

        jitter = 0.0
        if len(latencies) >= 2:
            diffs = [abs(latencies[i] - latencies[i-1]) for i in range(1, len(latencies))]
            jitter = round(sum(diffs) / len(diffs), 2)

        # Count roaming events in same scope
        cursor.execute(f"SELECT COUNT(*) FROM roaming_events{where_clause}", params)
        roaming_count = cursor.fetchone()[0]

        return {
            "total_samples": total_samples,
            "successful_samples": successful_samples,
            "error_samples": error_samples,
            "uptime_percentage": uptime_percentage,
            "averages": averages,
            "peaks": peaks,
            "mins": mins,
            "percentiles": percentiles,
            "jitter": jitter,
            "roaming_count": roaming_count
        }

def get_locations(only_with_data: bool = False) -> List[str]:
    """Returns list of distinct configured/recorded locations."""
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT location FROM telemetry_samples WHERE location IS NOT NULL AND location != '' ORDER BY location ASC")
        db_locs = [r[0] for r in cursor.fetchall()]

    if only_with_data:
        return db_locs

    cfg = get_config()
    raw = cfg.get("zones_by_location", "")
    try:
        mapping = json.loads(raw) if raw else {}
    except Exception:
        mapping = {}

    curr_loc = cfg.get("location_name", "")
    all_locs = []
    for l in ([curr_loc] + list(mapping.keys()) + db_locs):
        l_str = str(l).strip()
        if l_str and l_str not in all_locs:
            all_locs.append(l_str)
    return all_locs

def get_location_zones_map() -> Dict[str, List[str]]:
    """Returns mapping of Sede -> list of configured zones."""
    cfg = get_config()
    raw = cfg.get("zones_by_location", "")
    try:
        mapping = json.loads(raw) if raw else {}
    except Exception:
        mapping = {}

    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT location, zone FROM telemetry_samples WHERE zone IS NOT NULL AND zone != ''")
        for row in cursor.fetchall():
            loc, z = row['location'], row['zone']
            if loc not in mapping:
                mapping[loc] = []
            if z not in mapping[loc]:
                mapping[loc].append(z)

    return mapping

def set_location_zones(location: str, zones: List[str]):
    """Replaces zones list for a specific location."""
    mapping = get_location_zones_map()
    mapping[location] = [z.strip() for z in zones if z.strip()]
    set_config("zones_by_location", json.dumps(mapping, ensure_ascii=False))

def add_zone_to_location(location: str, zone: str):
    """Adds a single zone to a location."""
    mapping = get_location_zones_map()
    if location not in mapping:
        mapping[location] = []
    z_clean = zone.strip()
    if z_clean and z_clean not in mapping[location]:
        mapping[location].append(z_clean)
        set_config("zones_by_location", json.dumps(mapping, ensure_ascii=False))

def delete_location(location: str):
    """Removes a location from configuration."""
    mapping = get_location_zones_map()
    if location in mapping:
        del mapping[location]
        set_config("zones_by_location", json.dumps(mapping, ensure_ascii=False))

def auto_preload_sedes_zonas():
    """Loads sedes_zonas.json into config if available and not yet loaded."""
    if not os.path.exists(SEDES_ZONAS_FILE):
        return
    try:
        with open(SEDES_ZONAS_FILE, "r", encoding="utf-8") as f:
            file_data = json.load(f)
        if isinstance(file_data, dict):
            current_map = get_location_zones_map()
            changed = False
            for loc, zones in file_data.items():
                if loc not in current_map:
                    current_map[loc] = zones
                    changed = True
                else:
                    for z in zones:
                        if z not in current_map[loc]:
                            current_map[loc].append(z)
                            changed = True
            if changed:
                set_config("zones_by_location", json.dumps(current_map, ensure_ascii=False))
    except Exception:
        pass

def export_telemetry_csv(location_filter: Optional[str] = None, zone_filter: Optional[str] = None) -> str:
    """Exports all telemetry samples into CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Fecha_Hora_UTC", "Timestamp", "Sede", "Zona",
        "SSID", "BSSID", "Nombre_AP", "Fabricante", "Signal_dBm", "Signal_Pct",
        "Canal", "Banda", "TX_Rate", "RX_Rate", "Ping_Gateway_ms",
        "Target_URL", "DNS_ms", "TCP_ms", "TLS_ms", "TTFB_ms", "Transfer_ms",
        "Total_HTTP_ms", "Cold_Total_ms", "Status_Code", "Error", "Error_Msg"
    ])
    with get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM telemetry_samples WHERE 1=1"
        params = []
        if location_filter and location_filter != 'all':
            query += " AND location = ?"
            params.append(location_filter)
        if zone_filter and zone_filter != 'all':
            query += " AND zone = ?"
            params.append(zone_filter)
        query += " ORDER BY id ASC"
        cursor.execute(query, params)
        for r in cursor.fetchall():
            writer.writerow([
                r['id'], r['created_at'], r['timestamp'], r['location'], r['zone'],
                r['ssid'], r['bssid'], r['ap_name'], r['vendor'], r['signal_dbm'], r['signal_pct'],
                r['channel'], r['band'], r['tx_bitrate'], r['rx_bitrate'], r['gw_ping_ms'],
                r['target_url'], r['dns_ms'], r['tcp_ms'], r['tls_ms'], r['ttfb_ms'], r['transfer_ms'],
                r['total_ms'], r['cold_total_ms'], r['status_code'], r['is_error'], r['error_message']
            ])
    return output.getvalue()

def export_roaming_csv(location_filter: Optional[str] = None, zone_filter: Optional[str] = None) -> str:
    """Exports roaming handoff events into CSV string."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "ID", "Fecha_Hora_UTC", "Timestamp", "Sede", "Zona", "SSID",
        "AP_Anterior_BSSID", "AP_Anterior_Nombre", "Signal_Anterior_dBm",
        "AP_Nuevo_BSSID", "AP_Nuevo_Nombre", "Signal_Nuevo_dBm",
        "Delta_dBm", "Ping_Gateway_ms", "Latencia_App_ms", "Veredicto"
    ])
    with get_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM roaming_events WHERE 1=1"
        params = []
        if location_filter and location_filter != 'all':
            query += " AND location = ?"
            params.append(location_filter)
        if zone_filter and zone_filter != 'all':
            query += " AND zone = ?"
            params.append(zone_filter)
        query += " ORDER BY id ASC"
        cursor.execute(query, params)
        for r in cursor.fetchall():
            writer.writerow([
                r['id'], r['created_at'], r['timestamp'], r['location'], r['zone'], r['ssid'],
                r['prev_bssid'], r['prev_ap_name'], r['prev_signal_dbm'],
                r['new_bssid'], r['new_ap_name'], r['new_signal_dbm'],
                r['delta_dbm'], r['gw_ping_ms'], r['app_latency_ms'], r['verdict']
            ])
    return output.getvalue()

def clear_history(scope: str = 'all'):
    """Clears history tables according to scope ('telemetry', 'roaming', 'diag', 'all')."""
    with get_connection() as conn:
        cursor = conn.cursor()
        if scope in ('telemetry', 'all'):
            cursor.execute("DELETE FROM telemetry_samples")
        if scope in ('roaming', 'all'):
            cursor.execute("DELETE FROM roaming_events")
        if scope in ('diag', 'all'):
            cursor.execute("DELETE FROM net_diag_history")
        conn.commit()

if __name__ == '__main__':
    print("Initializing SQLite database telemetry.db...")
    init_db()
    print("Database initialized successfully.")
    cfg = get_config()
    print("Loaded config count:", len(cfg))
    locs = get_locations()
    print("Available locations:", locs)
