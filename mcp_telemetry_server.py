#!/usr/bin/env python3
"""
Servidor MCP (Model Context Protocol) para Wi-Fi & Enterprise Application Telemetry Analyzer
(mcp_telemetry_server.py)

Permite conectar directamente agentes compatibles con MCP (como Google Antigravity IDE,
Gemini CLI o agentes construidos con el SDK `google-antigravity`) a la telemetría en vivo
y a la base de datos SQLite (`telemetry.db`), sin necesidad de exponer ni almacenar
claves adicionales en el repositorio.

Uso con Google Antigravity SDK:
```python
from google.antigravity import Agent, LocalAgentConfig, types

mcp_server = types.McpStdioServer(
    name="wifi_telemetry_mcp",
    command="python3",
    args=["mcp_telemetry_server.py"],
)
```

Soporta:
1. `FastMCP` (si el paquete `mcp` está instalado en el entorno).
2. Implementación nativa JSON-RPC 2.0 sobre `stdio` (Zero-Pip Fallback), cumpliendo la
   especificación oficial de Model Context Protocol (`initialize`, `tools/list`, `tools/call`,
   `resources/list`, `resources/read`).
"""

import sys
import os
import json
import urllib.request
from typing import Dict, Any, Optional, List

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
if PROJECT_DIR not in sys.path:
    sys.path.insert(0, PROJECT_DIR)

from database import database
from core.ai_agent import agent_runtime, GEMINI_TOOLS_DECLARATIONS

database.init_db()


def _try_fetch_live_server_status() -> Optional[Dict[str, Any]]:
    """Si server.py está corriendo en localhost:8050, obtiene el estado instantáneo en memoria."""
    port = os.environ.get("WIFI_ANALYZER_PORT", "8050")
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/status", method="GET")
        with urllib.request.urlopen(req, timeout=1.2) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def _try_fetch_live_server_scan() -> List[Dict[str, Any]]:
    """Si server.py está corriendo en localhost:8050, obtiene el escaneo RF en vivo."""
    port = os.environ.get("WIFI_ANALYZER_PORT", "8050")
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/scan", method="GET")
        with urllib.request.urlopen(req, timeout=1.2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("aps", [])
    except Exception:
        return []


# Vincular proveedores híbridos (Servidor en vivo -> Fallback SQLite WAL)
agent_runtime.bind_providers(
    state_provider=lambda: _try_fetch_live_server_status() or agent_runtime._get_live_state(),
    scan_provider=_try_fetch_live_server_scan,
)


# Herramienta adicional MCP para guardar o enriquecer el perfil físico desde el agente externo
MCP_EXTRA_TOOLS = [
    {
        "name": "update_physical_environment_context",
        "description": (
            "Guarda o actualiza la descripción del espacio físico de la Sede y Zona de prueba "
            "(altura de APs, obstáculos como racks metálicos o muros, modo de recorrido, "
            "tipo de dispositivo terminal y observaciones del operador)."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "Nombre de la Sede."},
                "zone": {"type": "string", "description": "Nombre de la Zona."},
                "environment_type": {"type": "string", "description": "Tipo de recinto (Bodega, Tienda, Oficina, etc.)."},
                "ceiling_height": {"type": "string", "description": "Altura aproximada de instalación de los APs."},
                "obstacles": {"type": "string", "description": "Obstáculos físicos predominantes (racks metálicos, concreto, etc.)."},
                "test_mode": {"type": "string", "description": "Dinámica de la prueba (Estático, Caminando, Montacargas)."},
                "client_device_type": {"type": "string", "description": "Tipo de terminal evaluada (PDA/Pistola RF, POS, Laptop)."},
                "interference_notes": {"type": "string", "description": "Fuentes de interferencia o concurrencia observadas."},
                "custom_description": {"type": "string", "description": "Descripción libre adicional del entorno físico."},
            },
        },
    },
    {
        "name": "record_situational_observation",
        "description": (
            "Registra una respuesta u observación puntual del operador en tiempo real asociada al "
            "timestamp actual (ej. 'Acabo de cruzar una puerta cortafuego' o 'Hay 30 pistolas RF en este pasillo')."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "question_text": {"type": "string", "description": "Pregunta que originó la observación."},
                "user_answer": {"type": "string", "description": "Respuesta o descripción física dada por el usuario."},
                "location": {"type": "string", "description": "Sede (opcional)."},
                "zone": {"type": "string", "description": "Zona (opcional)."},
            },
            "required": ["user_answer"],
        },
    },
]


def get_mcp_tools_list() -> List[Dict[str, Any]]:
    """Convierte las declaraciones de herramientas al formato estándar MCP `tools/list`."""
    mcp_tools = []
    for t in GEMINI_TOOLS_DECLARATIONS:
        mcp_tools.append({
            "name": t["name"],
            "description": t["description"],
            "inputSchema": t.get("parameters", {"type": "object", "properties": {}}),
        })
    mcp_tools.extend(MCP_EXTRA_TOOLS)
    return mcp_tools


def handle_mcp_tool_call(name: str, arguments: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Ejecuta cualquier herramienta MCP solicitada por el agente."""
    args = arguments or {}
    if name == "update_physical_environment_context":
        saved = database.save_zone_context_profile(args)
        return {"status": "saved", "profile": saved}
    elif name == "record_situational_observation":
        saved = database.save_agent_annotation(args)
        return {"status": "recorded", "annotation": saved}
    else:
        return agent_runtime.execute_tool(name, args)


def run_stdio_jsonrpc_loop():
    """Servidor MCP estándar sobre stdio usando JSON-RPC 2.0 (sin dependencias externas)."""
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue

        msg_id = msg.get("id")
        method = msg.get("method", "")
        params = msg.get("params") or {}

        # Las notificaciones (sin id) no requieren respuesta
        if msg_id is None:
            continue

        if method == "initialize":
            resp = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {"listChanged": False},
                        "resources": {"subscribe": False, "listChanged": False},
                    },
                    "serverInfo": {
                        "name": "wifi-roaming-telemetry-mcp",
                        "version": "4.1.0",
                    },
                },
            }
        elif method == "tools/list":
            resp = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {"tools": get_mcp_tools_list()},
            }
        elif method == "tools/call":
            tool_name = params.get("name", "")
            tool_args = params.get("arguments") or {}
            output = handle_mcp_tool_call(tool_name, tool_args)
            resp = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(output, ensure_ascii=False, indent=2),
                        }
                    ],
                    "isError": "error" in output,
                },
            }
        elif method == "resources/list":
            resp = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "resources": [
                        {
                            "uri": "telemetry://live/snapshot",
                            "name": "Instantánea de Telemetría Wi-Fi + HTTP + Contexto Físico",
                            "mimeType": "application/json",
                        },
                        {
                            "uri": "telemetry://context/questions",
                            "name": "Preguntas Situacionales Activas para Afinar Diagnóstico",
                            "mimeType": "application/json",
                        },
                    ]
                },
            }
        elif method == "resources/read":
            uri = params.get("uri", "")
            if uri == "telemetry://context/questions":
                payload = agent_runtime.generate_situational_questions()
            else:
                payload = agent_runtime.tool_get_live_telemetry_snapshot()
            resp = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "contents": [
                        {
                            "uri": uri,
                            "mimeType": "application/json",
                            "text": json.dumps(payload, ensure_ascii=False, indent=2),
                        }
                    ]
                },
            }
        elif method == "ping":
            resp = {"jsonrpc": "2.0", "id": msg_id, "result": {}}
        else:
            resp = {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }

        try:
            sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
            sys.stdout.flush()
        except BrokenPipeError:
            break


if __name__ == "__main__":
    run_stdio_jsonrpc_loop()
