"""
Motor de Agente Inteligente, Compilador de Contexto Físico y Cliente Gemini Interactions API
(core/ai_agent.py) — Wi-Fi & Enterprise Application Telemetry Analyzer.

Características principales:
1. Sigue la arquitectura actual de Google Gemini Interactions API:
   - Modelos actuales: `gemini-3.8-flash` (por defecto, rápido y multimodal/agéntico)
     y `gemini-4-argon` (razonamiento profundo y auditoría forense).
   - Conversaciones con estado (`previous_interaction_id`).
   - Function Calling nativo (`type: "function"` / `function_call` / `function_result`).
2. Soporta ejecución vía SDK oficial `google-genai` (>= 2.30.1) si está instalado, o
   cliente HTTPS nativo (`urllib.request`) hacia `https://generativelanguage.googleapis.com/v1beta/interactions`
   para preservar la compatibilidad Zero-Pip / Offline-Ready del proyecto.
3. Integra el Sistema de Enriquecimiento de Contexto en 3 Capas:
   - Capa 1: Perfil físico de la Sede/Zona (altura de APs, obstáculos, modo de prueba, tipo de terminal).
   - Capa 2: Detector de anomalías en tiempo real que genera preguntas situacionales (In-Loop Clarifications).
   - Capa 3: Herramientas MCP de telemetría en vivo invocables por el modelo o por el servidor MCP externo.
"""

import json
import time
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional, Callable

from database import database
from core import secrets_manager, net_diag

ALLOWED_MODELS = {
    "gemini-3.8-flash": "Gemini 3.8 Flash (Tiempo Real & Diagnóstico Ágil)",
    "gemini-4-argon": "Gemini 4 Argon (Auditoría Profunda & Causa Raíz)",
    "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite (Alta Velocidad)",
}

DEFAULT_MODEL = "gemini-3.8-flash"

SYSTEM_INSTRUCTION_CWNE = """Eres el Arquitecto Principal de Redes Inalámbricas (CWNE - Certified Wireless Network Expert) y Especialista en Observabilidad de Aplicaciones Empresariales integrado en 'Wi-Fi & Enterprise Application Telemetry Analyzer'.

Tu misión es ayudar al usuario en tiempo real a diagnosticar con precisión quirúrgica si los problemas experimentados (congelamiento de terminales PDA/pistolas RF, lentitud en cajas POS, cortes en videollamadas o demoras en sistemas WMS como Manhattan/SAP) se originan en:
- **Capa 1/2 (RF Wi-Fi y Roaming):** Nivel de señal (RSSI dBm), asimetría de potencia, modulación/bitrates Tx/Rx, interferencia co-canal (CCI) o adyacente (ACI), clientes pegajosos (*Sticky Clients* que no hacen handoff a pesar de tener un AP vecino mucho más fuerte), *Ping-Pong Roaming* o saltos de banda 5 GHz -> 2.4 GHz.
- **Capa 3/4 (Red Local, Transporte y DNS):** Pérdida de paquetes o latencia en el Gateway local, resolución DNS lenta (>50 ms), problemas de ruta en Traceroute o handshakes TCP/TLS demorados.
- **Capa 7 (Servidor de Aplicación / Backend):** Tiempo al Primer Byte (TTFB) elevado mientras el ping al Gateway local es bajo (<10 ms), errores HTTP 4xx/5xx, bloqueos de base de datos o saturación del servidor web.

REGLAS DE RAZONAMIENTO Y ENRIQUECIMIENTO DE CONTEXTO FÍSICO:
1. Siempre utiliza las herramientas (`tools`) disponibles para consultar la telemetría real antes de emitir un veredicto si los datos no están ya en el mensaje.
2. **Cruza los datos numéricos con el Contexto Físico de la Sede/Zona**:
   - Si el perfil físico indica *racks metálicos llenos* o *bodega de gran altura (>8m)*, considera el efecto de reflexión multitrayecto (*multipath*), caídas abruptas al doblar pasillos y zonas de sombra bajo estanterías.
   - Si el dispositivo es una *Terminal PDA / Pistola RF*, recuerda que tienen antenas pequeñas (1x1) y menor potencia de transmisión que el Access Point (asimetría de enlace UL/DL).
   - Si el modo de prueba es *Estático* pero ves eventos de roaming, diagnostica inmediatamente *Ping-Pong Roaming* (exceso de solapamiento de celdas o umbrales agresivos). Si es *Caminando* o en *Montacargas* y la señal cae por debajo de -78 dBm sin saltar a un AP vecino mejor, diagnostica *Sticky Client* y recomienda revisar 802.11k/v/r y tasas básicas (Minimum Basic Rates).
3. **Haz preguntas situacionales cuando el contexto físico esté incompleto o los datos sean ambiguos:**
   - Si el perfil físico de la zona actual NO está configurado o falta información clave para explicar una anomalía, incluye al final de tu análisis una sección breve llamada `### 🔍 Preguntas para Afinar el Diagnóstico` con 1 o 2 preguntas concretas sobre el espacio físico (ej. altura de APs, si acaba de cruzar un muro/puerta metálica, si hay alta densidad de usuarios o motores cerca).
4. Responde siempre en español claro, estructurado en Markdown con viñetas, citando las métricas exactas observadas (`dBm`, `ms`, `BSSID`, `Nombre de AP`, `Canal`, `P95`, `TTFB`)."""


# ==============================================================================
# Cuestionario Guiado de Contexto Físico (Plantillas y Opciones Rápidas)
# ==============================================================================

PHYSICAL_CONTEXT_SCHEMA = [
    {
        "id": "environment_type",
        "label": "1. Tipo de Recinto Físico",
        "question": "¿Cómo describirías el espacio físico donde estás realizando la prueba?",
        "options": [
            "Bodega / Centro de Distribución (Estanterías altas)",
            "Piso de Venta / Tienda Retail",
            "Oficina Abierta / Corporativo",
            "Área Cerrada / Cuartos Fríos / Bunker",
            "Zona Exterior / Muelles de Carga",
        ],
    },
    {
        "id": "ceiling_height",
        "label": "2. Altura y Montaje de los Access Points",
        "question": "¿A qué altura aproximada están instalados los APs y cómo están montados?",
        "options": [
            "Techo bajo (< 3.5 m) - Omnidireccional",
            "Altura media comercial (4 a 6 m)",
            "Gran altura industrial (7 a 12 m) - Techo/Cercha",
            "Montaje en pared / columna lateral",
            "Desconocido / No visibles",
        ],
    },
    {
        "id": "obstacles",
        "label": "3. Obstáculos y Materiales de Atenuación RF",
        "question": "¿Qué obstáculos físicos rodean la zona de captura actual?",
        "multi": True,
        "options": [
            "Racks metálicos llenos de mercancía",
            "Estantería metálica semivacía",
            "Muros gruesos de concreto / ladrillo",
            "Divisiones de vidrio / drywall",
            "Líquidos / papel / productos densos",
            "Puertas cortafuego / persianas metálicas",
            "Línea de vista despejada",
        ],
    },
    {
        "id": "test_mode",
        "label": "4. Dinámica del Recorrido (Movimiento)",
        "question": "¿Cómo se está desplazando el equipo durante esta medición?",
        "options": [
            "Estático en un punto fijo (sin moverse)",
            "Caminando a paso normal (Walk-Test por pasillos)",
            "Desplazamiento rápido (Montacargas / Estibadora eléctrica)",
            "Movimiento intermitente (Deteniéndose en cada estación/caja)",
        ],
    },
    {
        "id": "client_device_type",
        "label": "5. Tipo de Terminal Crítica Evaluada",
        "question": "¿Qué tipo de dispositivo opera principalmente en esta zona?",
        "options": [
            "Terminal Portátil PDA / Pistola RF (Zebra / Honeywell - WMS)",
            "Caja Registradora POS / Datáfono Inalámbrico",
            "Laptop Corporativa (ERP / Videollamadas / Office)",
            "Tablet / Escáner Móvil de Inventario",
        ],
    },
    {
        "id": "interference_notes",
        "label": "6. Concurrencia y Fuentes de Interferencia",
        "question": "¿Observas alta densidad de usuarios o equipos industriales cercanos?",
        "multi": True,
        "options": [
            "Baja concurrencia (< 10 dispositivos)",
            "Alta concurrencia (> 25 dispositivos simultáneos)",
            "Motores eléctricos / Bandas transportadoras / Montacargas",
            "Cámaras inalámbricas / Escáneres Bluetooth / Escáneres UHF",
            "Redes Wi-Fi vecinas externas (Centros comerciales / Edificios)",
        ],
    },
]


# ==============================================================================
# Definición de Herramientas (Tools) compatibles con Gemini Interactions API y MCP
# ==============================================================================

GEMINI_TOOLS_DECLARATIONS = [
    {
        "type": "function",
        "name": "get_live_telemetry_snapshot",
        "description": (
            "Obtiene el estado en tiempo real de la interfaz Wi-Fi (SSID, BSSID, nombre del AP, "
            "señal en dBm y porcentaje, canal, banda, bitrates Tx/Rx, ping al Gateway) junto con "
            "el resultado más reciente de la sonda HTTP por fases (DNS, TCP, TLS, TTFB, Transfer) "
            "y el perfil físico de la Sede y Zona activa."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "type": "function",
        "name": "get_roaming_events_analysis",
        "description": (
            "Consulta el historial de eventos de Roaming (handoffs entre Access Points), incluyendo "
            "AP anterior, AP nuevo, delta de señal en dBm, latencia de ping durante el salto y veredicto."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Cantidad máxima de eventos de roaming a consultar (por defecto 20).",
                },
                "location": {
                    "type": "string",
                    "description": "Filtrar por nombre de Sede (opcional, usar 'all' o dejar vacío para sede actual).",
                },
                "zone": {
                    "type": "string",
                    "description": "Filtrar por nombre de Zona (opcional, usar 'all' o dejar vacío para zona actual).",
                },
            },
        },
    },
    {
        "type": "function",
        "name": "get_rf_spectrum_scan",
        "description": (
            "Obtiene la lista de Access Points vecinos detectados en el escaneo de espectro RF "
            "(2.4 GHz, 5 GHz, 6 GHz) para analizar interferencia co-canal (CCI), solapamiento de canales "
            "y verificar si existe un AP candidato con mejor señal que el AP actual (detección de Sticky Client)."
        ),
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "type": "function",
        "name": "get_http_phases_breakdown",
        "description": (
            "Obtiene las estadísticas consolidadas (Percentiles P50, P90, P95, P99, Jitter RFC 3550, Uptime) "
            "y las muestras recientes del desglose de latencia de Capa 7 (DNS, TCP, TLS, TTFB y Transferencia) "
            "para distinguir entre problemas de red local y lentitud del servidor de aplicación."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Número de pruebas HTTP recientes a analizar (por defecto 25).",
                },
                "location": {
                    "type": "string",
                    "description": "Sede a consultar (opcional).",
                },
                "zone": {
                    "type": "string",
                    "description": "Zona a consultar (opcional).",
                },
            },
        },
    },
    {
        "type": "function",
        "name": "get_network_diagnostics_summary",
        "description": (
            "Consulta los resultados más recientes de Diagnóstico de Red ICMP (Multi-Ping a Gateway, "
            "servidores DNS y host de aplicación) y los saltos de Traceroute para identificar en qué "
            "nodo exacto ocurre pérdida de paquetes o cuellos de botella."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Cantidad de corridas de diagnóstico recientes a consultar (por defecto 3).",
                }
            },
        },
    },
    {
        "type": "function",
        "name": "get_physical_environment_context",
        "description": (
            "Obtiene la ficha descriptiva del espacio físico (altura de techo, obstáculos como racks metálicos "
            "o muros, modo de desplazamiento, tipo de terminal y anotaciones situacionales en tiempo real) "
            "de la Sede y Zona indicadas."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "Nombre de la Sede (opcional, por defecto la activa).",
                },
                "zone": {
                    "type": "string",
                    "description": "Nombre de la Zona (opcional, por defecto la activa).",
                },
            },
        },
    },
]


class TelemetryAgentRuntime:
    """
    Orquesta las herramientas de telemetría en vivo, el motor de preguntas situacionales
    y la comunicación con la API de Interactions de Google Gemini.
    """

    def __init__(self, state_provider: Optional[Callable[[], Dict[str, Any]]] = None,
                 scan_provider: Optional[Callable[[], List[Dict[str, Any]]]] = None):
        self._state_provider = state_provider
        self._scan_provider = scan_provider

    def bind_providers(
        self,
        state_provider: Callable[[], Dict[str, Any]],
        scan_provider: Callable[[], List[Dict[str, Any]]],
    ):
        """Vincula los proveedores de estado en memoria del servidor principal."""
        self._state_provider = state_provider
        self._scan_provider = scan_provider

    def _get_live_state(self) -> Dict[str, Any]:
        if self._state_provider:
            try:
                return self._state_provider()
            except Exception:
                pass
        # Fallback leyendo la muestra más reciente desde SQLite (útil cuando se invoca desde MCP externo)
        cfg = database.get_config()
        loc = cfg.get("location_name", "Tienda_Principal")
        zone = cfg.get("current_zone", "")
        recent = database.get_recent_samples(limit=1, location_filter=loc, zone_filter=zone)
        if not recent:
            recent = database.get_recent_samples(limit=1)
        last = recent[-1] if recent else {}
        return {
            "location": last.get("location") or loc,
            "zone": last.get("zone") if last.get("zone") is not None else zone,
            "ssid": last.get("ssid", "Desconocido"),
            "bssid": last.get("bssid", "N/A"),
            "ap_name": last.get("ap_name", ""),
            "vendor_name": last.get("vendor", ""),
            "signal_dbm": last.get("signal_dbm", -100),
            "signal_pct": last.get("signal_pct", 0),
            "channel": last.get("channel", 0),
            "band": last.get("band", "N/A"),
            "tx_bitrate": last.get("tx_bitrate", "N/A"),
            "rx_bitrate": last.get("rx_bitrate", "N/A"),
            "ping_ms": last.get("gw_ping_ms"),
            "target_url": last.get("target_url") or cfg.get("target_url", ""),
            "app_latency_ms": last.get("total_ms"),
            "app_cold_total_ms": last.get("cold_total_ms"),
            "app_dns_ms": last.get("dns_ms"),
            "app_tcp_ms": last.get("tcp_ms"),
            "app_tls_ms": last.get("tls_ms"),
            "app_ttfb_ms": last.get("ttfb_ms"),
            "app_transfer_ms": last.get("transfer_ms"),
            "app_status_code": last.get("status_code"),
            "app_is_error": bool(last.get("is_error")),
            "app_error_message": last.get("error_message"),
        }

    def _get_live_scan(self) -> List[Dict[str, Any]]:
        if self._scan_provider:
            try:
                return self._scan_provider()
            except Exception:
                pass
        return []

    # ------------------------------------------------------------------
    # Implementación de Tools (compartidas por Gemini API y Servidor MCP)
    # ------------------------------------------------------------------

    def tool_get_live_telemetry_snapshot(self) -> Dict[str, Any]:
        st = self._get_live_state()
        loc = st.get("location", "Tienda_Principal")
        zone = st.get("zone", "")
        profile = database.get_zone_context_profile(loc, zone)
        recent_samples = database.get_recent_samples(limit=10, location_filter=loc, zone_filter=zone)
        return {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "location": loc,
            "zone": zone,
            "rf_state": {
                "ssid": st.get("ssid"),
                "bssid": st.get("bssid"),
                "ap_name": st.get("ap_name") or "Sin alias asignado",
                "vendor": st.get("vendor_name"),
                "signal_dbm": st.get("signal_dbm"),
                "signal_pct": st.get("signal_pct"),
                "channel": st.get("channel"),
                "band": st.get("band"),
                "frequency_mhz": st.get("frequency_mhz"),
                "tx_bitrate": st.get("tx_bitrate"),
                "rx_bitrate": st.get("rx_bitrate"),
                "roaming_verdict": st.get("roaming_verdict"),
                "same_ssid_aps_count": st.get("same_ssid_aps_count"),
                "total_neighbor_aps": st.get("total_neighbor_aps"),
            },
            "local_network": {
                "ip_address": st.get("ip_address"),
                "gateway_ip": st.get("gateway_ip"),
                "gateway_ping_ms": st.get("ping_ms"),
            },
            "http_probe_latest": {
                "target_url": st.get("target_url"),
                "status_code": st.get("app_status_code"),
                "is_error": st.get("app_is_error"),
                "error_message": st.get("app_error_message"),
                "dns_ms": st.get("app_dns_ms"),
                "tcp_ms": st.get("app_tcp_ms"),
                "tls_ms": st.get("app_tls_ms"),
                "ttfb_ms": st.get("app_ttfb_ms"),
                "transfer_ms": st.get("app_transfer_ms"),
                "total_active_ms": st.get("app_latency_ms"),
                "cold_total_ms": st.get("app_cold_total_ms"),
            },
            "physical_context_profile": profile,
            "recent_10_samples_trend": [
                {
                    "time": s.get("created_at", "")[-12:-4] if s.get("created_at") else "",
                    "bssid": s.get("bssid"),
                    "ap_name": s.get("ap_name"),
                    "signal_dbm": s.get("signal_dbm"),
                    "channel": s.get("channel"),
                    "gw_ping_ms": s.get("gw_ping_ms"),
                    "ttfb_ms": s.get("ttfb_ms"),
                    "total_http_ms": s.get("total_ms"),
                }
                for s in recent_samples[-10:]
            ],
        }

    def tool_get_roaming_events_analysis(
        self, limit: int = 20, location: Optional[str] = None, zone: Optional[str] = None
    ) -> Dict[str, Any]:
        st = self._get_live_state()
        loc = location if location and location != "current" else st.get("location", "all")
        zn = zone if zone and zone != "current" else st.get("zone", "all")
        events = database.get_roaming_events(limit=min(max(int(limit or 20), 1), 100), location_filter=loc, zone_filter=zn)
        if not events and loc != "all":
            events = database.get_roaming_events(limit=20, location_filter="all", zone_filter="all")

        # Detectar patrones como Ping-Pong Roaming (rebotes entre el mismo par de BSSIDs)
        pair_counts: Dict[str, int] = {}
        critical_handoffs = 0
        for ev in events:
            p_bssid = ev.get("prev_bssid") or ""
            n_bssid = ev.get("new_bssid") or ""
            if p_bssid and n_bssid:
                pair_key = "<->".join(sorted([p_bssid, n_bssid]))
                pair_counts[pair_key] = pair_counts.get(pair_key, 0) + 1
            if (ev.get("new_signal_dbm") or -50) <= -75 or (ev.get("gw_ping_ms") or 0) > 100:
                critical_handoffs += 1

        ping_pong_pairs = [k for k, cnt in pair_counts.items() if cnt >= 3]
        return {
            "location_queried": loc,
            "zone_queried": zn,
            "total_events_returned": len(events),
            "critical_handoffs_count": critical_handoffs,
            "suspected_ping_pong_pairs": ping_pong_pairs,
            "events": events[:25],
        }

    def tool_get_rf_spectrum_scan(self) -> Dict[str, Any]:
        st = self._get_live_state()
        aps = self._get_live_scan()
        curr_bssid = st.get("bssid")
        curr_channel = st.get("channel")
        curr_dbm = st.get("signal_dbm", -100)

        same_ssid = [a for a in aps if a.get("is_same_ssid")]
        co_channel = [
            a for a in aps
            if a.get("channel") == curr_channel and a.get("bssid") != curr_bssid
        ]
        better_candidates = [
            a for a in same_ssid
            if a.get("bssid") != curr_bssid and (a.get("signal_dbm", -100) > (curr_dbm + 6))
        ]
        channel_distribution: Dict[str, int] = {}
        for a in aps:
            ch = str(a.get("channel", "?"))
            channel_distribution[ch] = channel_distribution.get(ch, 0) + 1

        return {
            "connected_bssid": curr_bssid,
            "connected_ap_name": st.get("ap_name"),
            "connected_channel": curr_channel,
            "connected_band": st.get("band"),
            "connected_signal_dbm": curr_dbm,
            "total_neighbor_aps": len(aps),
            "same_ssid_aps_count": len(same_ssid),
            "co_channel_interferers_count": len(co_channel),
            "co_channel_aps": co_channel[:10],
            "better_roaming_candidates": better_candidates[:5],
            "sticky_client_detected": bool(curr_dbm <= -74 and len(better_candidates) > 0),
            "channel_occupancy": channel_distribution,
            "top_neighbor_aps": sorted(aps, key=lambda x: x.get("signal_dbm", -100), reverse=True)[:15],
        }

    def tool_get_http_phases_breakdown(
        self, limit: int = 25, location: Optional[str] = None, zone: Optional[str] = None
    ) -> Dict[str, Any]:
        st = self._get_live_state()
        loc = location or st.get("location", "all")
        zn = zone if zone is not None else st.get("zone", "all")
        stats = database.get_statistics(location_filter=loc, zone_filter=zn)
        probes = database.get_http_probe_history(limit=min(max(int(limit or 25), 1), 100), location_filter=loc, zone_filter=zn)

        # Calcular promedios por fase de las muestras recientes
        phase_avgs = {"dns_ms": 0.0, "tcp_ms": 0.0, "tls_ms": 0.0, "ttfb_ms": 0.0, "transfer_ms": 0.0}
        if probes:
            n = len(probes)
            for k in phase_avgs:
                vals = [float(p.get(k) or 0.0) for p in probes]
                phase_avgs[k] = round(sum(vals) / n, 2)

        dominant_phase = max(phase_avgs.items(), key=lambda x: x[1])[0] if probes else "N/A"
        return {
            "location": loc,
            "zone": zn,
            "target_url": st.get("target_url"),
            "consolidated_statistics": stats,
            "recent_phase_averages_ms": phase_avgs,
            "dominant_bottleneck_phase": dominant_phase,
            "recent_probes": probes[:15],
        }

    def tool_get_network_diagnostics_summary(self, limit: int = 3) -> Dict[str, Any]:
        history = database.get_net_diag_history(limit=min(max(int(limit or 3), 1), 10))
        return {
            "gateway_ip": net_diag.get_cached_gateway(),
            "dns_servers": net_diag.get_cached_dns_servers(),
            "recent_diagnostic_runs": history,
        }

    def tool_get_physical_environment_context(
        self, location: Optional[str] = None, zone: Optional[str] = None
    ) -> Dict[str, Any]:
        st = self._get_live_state()
        loc = location or st.get("location", "Tienda_Principal")
        zn = zone if zone is not None else st.get("zone", "")
        profile = database.get_zone_context_profile(loc, zn)
        annotations = database.get_agent_annotations(location_filter=loc, zone_filter=zn, limit=15)
        return {
            "location": loc,
            "zone": zn,
            "profile": profile,
            "situational_annotations": annotations,
        }

    def execute_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Ejecuta una herramienta por nombre con sus argumentos y devuelve un diccionario serializable."""
        args = arguments or {}
        try:
            if name == "get_live_telemetry_snapshot":
                return self.tool_get_live_telemetry_snapshot()
            elif name == "get_roaming_events_analysis":
                return self.tool_get_roaming_events_analysis(
                    limit=args.get("limit", 20),
                    location=args.get("location"),
                    zone=args.get("zone"),
                )
            elif name == "get_rf_spectrum_scan":
                return self.tool_get_rf_spectrum_scan()
            elif name == "get_http_phases_breakdown":
                return self.tool_get_http_phases_breakdown(
                    limit=args.get("limit", 25),
                    location=args.get("location"),
                    zone=args.get("zone"),
                )
            elif name == "get_network_diagnostics_summary":
                return self.tool_get_network_diagnostics_summary(limit=args.get("limit", 3))
            elif name == "get_physical_environment_context":
                return self.tool_get_physical_environment_context(
                    location=args.get("location"),
                    zone=args.get("zone"),
                )
            else:
                return {"error": f"Herramienta desconocida: {name}"}
        except Exception as e:
            return {"error": f"Error ejecutando {name}: {str(e)}"}

    # ------------------------------------------------------------------
    # Generador de Preguntas Situacionales en Vivo (Capa 2 de Contexto)
    # ------------------------------------------------------------------

    def generate_situational_questions(self) -> Dict[str, Any]:
        """
        Analiza el estado actual de telemetría y el perfil físico de la Sede/Zona
        para generar preguntas contextuales inteligentes que robustezcan el análisis.
        """
        st = self._get_live_state()
        loc = st.get("location", "Tienda_Principal")
        zone = st.get("zone", "")
        profile = database.get_zone_context_profile(loc, zone)
        spectrum = self.tool_get_rf_spectrum_scan()

        questions: List[Dict[str, Any]] = []
        sig_dbm = st.get("signal_dbm") or -100
        gw_ping = st.get("ping_ms")
        ttfb_ms = st.get("app_ttfb_ms") or 0.0
        dns_ms = st.get("app_dns_ms") or 0.0
        band = str(st.get("band") or "")

        # 1. Verificar si la zona carece de perfil físico base
        if not profile.get("configured"):
            questions.append({
                "id": "missing_zone_profile",
                "severity": "info",
                "trigger_type": "onboarding",
                "title": f"Perfil Físico pendiente para '{loc} / {zone}'",
                "question": (
                    f"Para que el modelo Gemini interprete con exactitud las lecturas de '{zone}', "
                    "¿qué características físicas tiene este espacio (altura de APs, obstáculos y tipo de terminal)?"
                ),
                "quick_options": [
                    "Bodega con racks metálicos altos (>7m) y pistolas RF",
                    "Tienda / Cajas POS con techo medio (4m) y alta concurrencia",
                    "Oficina corporativa con divisiones de vidrio/drywall",
                    "Cuarto cerrado / Muros de concreto gruesos",
                ],
                "opens_profile_modal": True,
            })

        # 2. Anomalía Sticky Client (Señal baja pero existe candidato mucho más fuerte)
        if spectrum.get("sticky_client_detected"):
            best = spectrum["better_roaming_candidates"][0]
            cand_label = best.get("ap_name") or best.get("bssid")
            questions.append({
                "id": "sticky_client_anomaly",
                "severity": "warning",
                "trigger_type": "sticky_client",
                "title": f"Posible 'Sticky Client' detectado ({sig_dbm} dBm)",
                "question": (
                    f"Sigues conectado al AP actual con {sig_dbm} dBm aunque el AP vecino '{cand_label}' "
                    f"se escucha a {best.get('signal_dbm')} dBm. ¿Acabas de desplazarte caminando desde otra zona "
                    "o iniciaste la prueba estático en este punto?"
                ),
                "quick_options": [
                    "Me desplacé desde otro pasillo/zona (El terminal no soltó el AP anterior)",
                    "Estoy fijo en este sitio desde el inicio",
                    "Acabo de cruzar una puerta cortafuego o esquina metálica",
                ],
            })

        # 3. Señal débil sin candidatos cercanos (Zona de sombra RF)
        elif sig_dbm <= -75 and sig_dbm > -99:
            questions.append({
                "id": "weak_rf_coverage",
                "severity": "danger",
                "trigger_type": "rf_shadow",
                "title": f"Cobertura RF Débil ({sig_dbm} dBm en {band})",
                "question": (
                    f"La potencia de señal cayó a {sig_dbm} dBm y no se observan APs candidatos fuertes. "
                    "¿Qué condición física observas en tu ubicación exacta ahora mismo?"
                ),
                "quick_options": [
                    "Fondo de pasillo entre racks metálicos llenos",
                    "Debajo de mezanine / losa de concreto sin AP visible",
                    "Interior de cuarto frío / bodega blindada",
                    "Área exterior / Muelle de carga alejado del AP",
                ],
            })

        # 4. Señal excelente pero Ping al Gateway degradado (Interferencia L1/L2 o saturación de canal)
        if sig_dbm >= -65 and gw_ping is not None and gw_ping > 45:
            questions.append({
                "id": "high_gw_ping_good_rf",
                "severity": "warning",
                "trigger_type": "airtime_contention",
                "title": f"Latencia Local Alta ({gw_ping} ms) con Buena Señal ({sig_dbm} dBm)",
                "question": (
                    "La potencia RF es buena pero el ping al Gateway local subió. Esto suele indicar ruido no-Wi-Fi "
                    "o saturación de tiempo de aire. ¿Qué ocurre alrededor en este instante?"
                ),
                "quick_options": [
                    "Muchos operarios/terminales trabajando al mismo tiempo aquí",
                    "Maquinaria eléctrica / montacargas / motores operando cerca",
                    "Uso intensivo de lectores Bluetooth / cámaras inalámbricas",
                    "Entorno tranquilo sin actividad inusual visible",
                ],
            })

        # 5. Red Wi-Fi sana pero TTFB de Aplicación alto (Problema Capa 7)
        if (gw_ping is not None and gw_ping < 15) and ttfb_ms > 600:
            questions.append({
                "id": "high_ttfb_layer7",
                "severity": "warning",
                "trigger_type": "layer7_bottleneck",
                "title": f"Demora en Servidor de Aplicación (TTFB: {int(ttfb_ms)} ms vs Ping GW: {gw_ping} ms)",
                "question": (
                    "El enlace Wi-Fi responde en milisegundos, pero el servidor tarda en entregar el primer byte. "
                    "¿Qué operación están ejecutando los usuarios en la aplicación?"
                ),
                "quick_options": [
                    "Transacción pesada (Cierre de caja / Confirmación de picking masivo)",
                    "Operación rutinaria ligera (Escaneo normal de código de barras)",
                    "Pantalla de login congelada en múltiples terminales a la vez",
                ],
            })

        # 6. Caída a banda 2.4 GHz en entorno empresarial
        if "2.4" in band:
            questions.append({
                "id": "band_24ghz_warning",
                "severity": "info",
                "trigger_type": "band_steering",
                "title": "Terminal operando en banda 2.4 GHz",
                "question": (
                    "El adaptador está asociado en 2.4 GHz (banda propensa a interferencia industrial y solo 3 canales limpios). "
                    "¿El SSID corporativo tiene habilitado 5 GHz en esta zona?"
                ),
                "quick_options": [
                    "Sí hay 5 GHz, pero la terminal prefirió 2.4 GHz al alejarse",
                    "Esta terminal o zona solo soporta 2.4 GHz",
                    "No estoy seguro de la configuración de bandas del SSID",
                ],
            })

        return {
            "location": loc,
            "zone": zone,
            "profile_configured": profile.get("configured", False),
            "profile": profile,
            "questions": questions,
            "schema": PHYSICAL_CONTEXT_SCHEMA,
        }

    # ------------------------------------------------------------------
    # Invocación a Google Gemini Interactions API (SDK o HTTPS Directo)
    # ------------------------------------------------------------------

    def _call_gemini_interactions_http(
        self,
        api_key: str,
        payload: Dict[str, Any],
        timeout: int = 60,
    ) -> Dict[str, Any]:
        """Llama directamente al endpoint oficial v1beta/interactions usando urllib estándar."""
        url = "https://generativelanguage.googleapis.com/v1beta/interactions"
        body_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body_bytes,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "x-goog-api-key": api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw_resp = resp.read().decode("utf-8")
                return json.loads(raw_resp)
        except urllib.error.HTTPError as e:
            err_body = ""
            try:
                err_body = e.read().decode("utf-8", errors="ignore")
            except Exception:
                pass
            raise RuntimeError(f"Error HTTP {e.code} de Gemini API: {err_body or e.reason}")

    def _extract_text_from_interaction_dict(self, data: Dict[str, Any]) -> str:
        """Extrae el texto final desde el objeto Interaction (tanto en formato steps como output_text)."""
        if data.get("output_text"):
            return str(data["output_text"])

        steps = data.get("steps") or []
        text_parts: List[str] = []
        for step in steps:
            if step.get("type") == "model_output":
                for item in step.get("content") or []:
                    if item.get("type") == "text" and item.get("text"):
                        text_parts.append(str(item["text"]))
        if text_parts:
            return "\n".join(text_parts)

        # Compatibilidad con posibles estructuras outputs
        outputs = data.get("outputs") or []
        for out in outputs:
            if out.get("type") == "text" and out.get("text"):
                text_parts.append(str(out["text"]))
        return "\n".join(text_parts)

    def run_diagnosis_interaction(
        self,
        user_prompt: str,
        mode: str = "chat",
        model_override: Optional[str] = None,
        previous_interaction_id: Optional[str] = None,
        include_full_snapshot: bool = True,
    ) -> Dict[str, Any]:
        """
        Ejecuta un turno de análisis con Gemini usando Interactions API y Function Calling automático
        sobre las herramientas MCP de telemetría en tiempo real.
        """
        cfg = database.get_config()
        api_key, key_source = secrets_manager.resolve_gemini_api_key(
            cfg.get("gemini_api_key_enc", "")
        )
        model = model_override or cfg.get("gemini_model") or DEFAULT_MODEL
        if model not in ALLOWED_MODELS:
            model = DEFAULT_MODEL

        snapshot = self.tool_get_live_telemetry_snapshot()
        loc = snapshot.get("location", "Tienda_Principal")
        zone = snapshot.get("zone", "")
        annotations = database.get_agent_annotations(location_filter=loc, zone_filter=zone, limit=10)

        context_header = {
            "active_location": loc,
            "active_zone": zone,
            "physical_profile": snapshot.get("physical_context_profile"),
            "recent_field_annotations": [
                {
                    "time": a.get("created_at", "")[-12:-4] if a.get("created_at") else "",
                    "question": a.get("question_text"),
                    "operator_observation": a.get("user_answer"),
                }
                for a in annotations
            ],
            "live_telemetry_summary": {
                "rf": snapshot.get("rf_state"),
                "local_network": snapshot.get("local_network"),
                "http_probe": snapshot.get("http_probe_latest"),
            } if include_full_snapshot else {},
        }

        enriched_input = (
            f"[CONTEXTO OPERATIVO Y FÍSICO EN TIEMPO REAL - SEDE: {loc} | ZONA: {zone}]\n"
            f"{json.dumps(context_header, ensure_ascii=False, indent=2)}\n\n"
            f"[SOLICITUD DEL INGENIERO / OPERADOR ({mode.upper()})]:\n{user_prompt}"
        )

        # Si no hay API Key configurada, proveemos un diagnóstico heurístico local enriquecido
        # e indicamos cómo activar la clave o usar el servidor MCP desde Antigravity
        if not api_key:
            fallback_md = self._build_local_heuristic_diagnosis(user_prompt, snapshot, annotations)
            return {
                "status": "local_fallback",
                "has_api_key": False,
                "model": "heurístico-local (Sin API Key de Gemini)",
                "interaction_id": "",
                "response_markdown": fallback_md,
                "tools_used": ["get_live_telemetry_snapshot (local)"],
                "situational_questions": self.generate_situational_questions().get("questions", []),
            }

        tools_used: List[str] = []
        interaction_id = ""
        final_text = ""

        # Intentar primero mediante el SDK oficial google-genai (>= 2.30.1) si está disponible
        used_sdk = False
        try:
            from google import genai  # type: ignore

            client = genai.Client(api_key=api_key)
            create_kwargs: Dict[str, Any] = {
                "model": model,
                "input": enriched_input,
                "system_instruction": SYSTEM_INSTRUCTION_CWNE,
                "tools": GEMINI_TOOLS_DECLARATIONS,
            }
            if previous_interaction_id:
                create_kwargs["previous_interaction_id"] = previous_interaction_id

            interaction = client.interactions.create(**create_kwargs)
            used_sdk = True

            # Resolver bucle de Function Calling (hasta 4 rondas de herramientas)
            rounds = 0
            while getattr(interaction, "status", "") == "requires_action" and rounds < 4:
                rounds += 1
                steps = getattr(interaction, "steps", []) or []
                executed_ids = {
                    getattr(s, "call_id", None)
                    for s in steps
                    if getattr(s, "type", "") == "function_result"
                }
                pending_calls = [
                    s
                    for s in steps
                    if getattr(s, "type", "") == "function_call"
                    and getattr(s, "id", None) not in executed_ids
                ]
                if not pending_calls:
                    break

                fn_results_input = []
                for fc in pending_calls:
                    fn_name = getattr(fc, "name", "")
                    fn_id = getattr(fc, "id", "")
                    fn_args = getattr(fc, "arguments", {}) or {}
                    if not isinstance(fn_args, dict):
                        try:
                            fn_args = dict(fn_args)
                        except Exception:
                            fn_args = {}
                    tools_used.append(fn_name)
                    tool_output = self.execute_tool(fn_name, fn_args)
                    fn_results_input.append({
                        "type": "function_result",
                        "name": fn_name,
                        "call_id": fn_id,
                        "result": tool_output,
                    })

                interaction = client.interactions.create(
                    model=model,
                    previous_interaction_id=interaction.id,
                    system_instruction=SYSTEM_INSTRUCTION_CWNE,
                    tools=GEMINI_TOOLS_DECLARATIONS,
                    input=fn_results_input,
                )

            interaction_id = getattr(interaction, "id", "") or ""
            final_text = getattr(interaction, "output_text", "") or ""
        except ImportError:
            used_sdk = False
        except Exception as sdk_err:
            # Si falla el SDK por versión o transporte, intentar vía cliente HTTPS directo Interactions API
            used_sdk = False

        if not used_sdk:
            payload: Dict[str, Any] = {
                "model": model,
                "input": enriched_input,
                "system_instruction": SYSTEM_INSTRUCTION_CWNE,
                "tools": GEMINI_TOOLS_DECLARATIONS,
            }
            if previous_interaction_id:
                payload["previous_interaction_id"] = previous_interaction_id

            resp_data = self._call_gemini_interactions_http(api_key, payload)
            rounds = 0
            while resp_data.get("status") == "requires_action" and rounds < 4:
                rounds += 1
                steps = resp_data.get("steps") or []
                executed_ids = {
                    s.get("call_id") for s in steps if s.get("type") == "function_result"
                }
                pending_calls = [
                    s
                    for s in steps
                    if s.get("type") == "function_call" and s.get("id") not in executed_ids
                ]
                if not pending_calls:
                    break

                fn_results_input = []
                for fc in pending_calls:
                    fn_name = fc.get("name", "")
                    fn_id = fc.get("id", "")
                    fn_args = fc.get("arguments") or {}
                    tools_used.append(fn_name)
                    tool_output = self.execute_tool(fn_name, fn_args)
                    fn_results_input.append({
                        "type": "function_result",
                        "name": fn_name,
                        "call_id": fn_id,
                        "result": tool_output,
                    })

                next_payload = {
                    "model": model,
                    "previous_interaction_id": resp_data.get("id"),
                    "system_instruction": SYSTEM_INSTRUCTION_CWNE,
                    "tools": GEMINI_TOOLS_DECLARATIONS,
                    "input": fn_results_input,
                }
                resp_data = self._call_gemini_interactions_http(api_key, next_payload)

            interaction_id = resp_data.get("id", "")
            final_text = self._extract_text_from_interaction_dict(resp_data)

        if not final_text:
            final_text = "El modelo completó la interacción pero no devolvió texto adicional."

        database.save_ai_diagnosis({
            "location": loc,
            "zone": zone,
            "model": model,
            "interaction_id": interaction_id,
            "previous_interaction_id": previous_interaction_id or "",
            "mode": mode,
            "user_prompt": user_prompt,
            "ai_response": final_text,
            "tools_used": tools_used,
            "context_summary": {
                "signal_dbm": snapshot.get("rf_state", {}).get("signal_dbm"),
                "bssid": snapshot.get("rf_state", {}).get("bssid"),
                "gw_ping_ms": snapshot.get("local_network", {}).get("gateway_ping_ms"),
                "ttfb_ms": snapshot.get("http_probe_latest", {}).get("ttfb_ms"),
                "key_source": key_source,
            },
        })

        return {
            "status": "success",
            "has_api_key": True,
            "key_source": key_source,
            "model": model,
            "interaction_id": interaction_id,
            "response_markdown": final_text,
            "tools_used": tools_used,
            "situational_questions": self.generate_situational_questions().get("questions", []),
        }

    def _build_local_heuristic_diagnosis(
        self,
        user_prompt: str,
        snapshot: Dict[str, Any],
        annotations: List[Dict[str, Any]],
    ) -> str:
        """
        Genera un pre-diagnóstico estructurado cuando aún no se ha configurado la API Key de Gemini,
        combinando la telemetría en vivo y el contexto físico registrado.
        """
        rf = snapshot.get("rf_state", {})
        net = snapshot.get("local_network", {})
        http = snapshot.get("http_probe_latest", {})
        prof = snapshot.get("physical_context_profile", {})
        spectrum = self.tool_get_rf_spectrum_scan()
        roam = self.tool_get_roaming_events_analysis(limit=10)

        sig = rf.get("signal_dbm", -100)
        gw_ping = net.get("gateway_ping_ms")
        ttfb = http.get("ttfb_ms") or 0
        total_http = http.get("total_active_ms") or 0

        lines = [
            "### ⚡ Pre-Diagnóstico Local Basado en Telemetría y Contexto Físico",
            "> **Nota:** Aún no has configurado tu `GEMINI_API_KEY` para invocar `gemini-3.8-flash` / `gemini-4-argon` desde la web, o estás operando en modo 100% Air-Gapped. Puedes configurar tu clave de forma segura en **Configuración -> Agente IA Gemini & MCP** o conectarte vía **Servidor MCP** desde Antigravity.",
            "",
            f"#### 📍 Contexto Activo: `{snapshot.get('location')}` — Zona `{snapshot.get('zone')}`",
        ]

        if prof.get("configured"):
            lines.append(
                f"- **Entorno Físico:** {prof.get('environment_type') or 'N/A'} | **Altura APs:** {prof.get('ceiling_height') or 'N/A'}\n"
                f"- **Obstáculos:** {prof.get('obstacles') or 'Ninguno reportado'} | **Dinámica:** {prof.get('test_mode') or 'N/A'}\n"
                f"- **Terminal:** {prof.get('client_device_type') or 'Estándar'} | **Interferencia:** {prof.get('interference_notes') or 'N/A'}"
            )
            if prof.get("custom_description"):
                lines.append(f"- **Notas del sitio:** *{prof.get('custom_description')}*")
        else:
            lines.append(
                "- ⚠️ **Perfil físico sin completar:** Haz clic en **'Configurar Entorno Físico de Zona'** para indicar altura de techo, racks metálicos o muros y aumentar la precisión del diagnóstico."
            )

        lines.extend([
            "",
            "#### 📊 Evaluación por Capas OSI en Tiempo Real",
            f"1. **Capa 1/2 (RF Wi-Fi & Roaming):** Señal actual `{sig} dBm` ({rf.get('signal_pct')}%) en `{rf.get('band')}` (Canal `{rf.get('channel')}`), AP `{rf.get('ap_name')}` (`{rf.get('bssid')}`). "
            f"Vecinos en el mismo canal: `{spectrum.get('co_channel_interferers_count', 0)}`. Eventos de Roaming recientes: `{roam.get('total_events_returned', 0)}`.",
            f"2. **Capa 3/4 (Red Local & Gateway):** Ping al Gateway `{net.get('gateway_ip')}`: `{gw_ping if gw_ping is not None else 'N/A'} ms`.",
            f"3. **Capa 7 (Aplicación `{http.get('target_url')}`):** Estado HTTP `{http.get('status_code')}` | DNS `{http.get('dns_ms')} ms` | TCP `{http.get('tcp_ms')} ms` | TLS `{http.get('tls_ms')} ms` | **TTFB `{ttfb} ms`** | Total `{total_http} ms`.",
            "",
            "#### 🎯 Veredicto Preliminar:",
        ])

        if spectrum.get("sticky_client_detected"):
            lines.append(
                "- 🔴 **Alerta Sticky Client (Capa 2):** Tu terminal mantiene conexión con una señal pobre mientras existe otro AP del mismo SSID con mucha mejor potencia. En terminales PDA/pistolas RF esto causa pérdida de tramas y congelamiento de sesión al caminar por pasillos."
            )
        elif sig <= -75:
            lines.append(
                f"- 🔴 **Cobertura RF Deficiente ({sig} dBm):** Nivel por debajo del umbral empresarial recomendado (-67 dBm para voz/PDA). Revisa atenuación por obstáculos físicos o sombras de cobertura."
            )
        elif gw_ping and gw_ping > 40:
            lines.append(
                f"- 🟠 **Contención en Aire o Red Local (Ping GW {gw_ping} ms):** La señal RF es aceptable pero el tiempo de respuesta al Gateway local es elevado. Probable saturación de canal o interferencia no-Wi-Fi."
            )
        elif ttfb > 500 and (gw_ping is None or gw_ping < 15):
            lines.append(
                f"- 🟣 **Cuello de Botella en Servidor / Capa 7 (TTFB {ttfb} ms):** La red Wi-Fi y el Gateway local responden rápido ({gw_ping} ms), pero el backend de la aplicación demora en procesar la solicitud."
            )
        else:
            lines.append(
                "- 🟢 **Parámetros Operativos Saludables:** Tanto el enlace RF como el Gateway local y la sonda de aplicación se encuentran dentro de los umbrales nominales en este instante."
            )

        if annotations:
            lines.append("\n#### 📝 Observaciones Situacionales Registradas en Campo:")
            for a in annotations[:5]:
                lines.append(f"- `{a.get('created_at', '')[-12:-4]}`: **{a.get('user_answer')}**")

        return "\n".join(lines)


# Singleton global del runtime del agente
agent_runtime = TelemetryAgentRuntime()

