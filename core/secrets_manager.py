"""
Gestor Seguro de Credenciales y Secretos (core/secrets_manager.py)
Wi-Fi & Enterprise Application Telemetry Analyzer.

Garantiza que las API Keys de Google Gemini (GEMINI_API_KEY) y tokens sensibles:
1. Nunca se almacenen en el código fuente ni en archivos rastreados por Git.
2. Se resuelvan con prioridad:
   a) Variables de entorno del Sistema Operativo (GEMINI_API_KEY / GOOGLE_API_KEY)
   b) Archivo local .env en la raíz del proyecto (ignorado en .gitignore y protegido con chmod 600)
   c) Almacenamiento local cifrado/ofuscado en SQLite (telemetry.db) usando PBKDF2-HMAC-SHA256
      derivado de la identidad de la máquina local.
3. Siempre se entreguen enmascaradas hacia el frontend y la API REST (ej. AIzaSy•••••••••••8x9Q).
"""

import os
import sys
import base64
import hashlib
import uuid
import platform
from typing import Dict, Any, Optional, Tuple

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
DOTENV_PATH = os.path.join(PROJECT_ROOT, ".env")

_ENC_PREFIX = "ENCv1:"


def _get_machine_secret() -> bytes:
    """Deriva una semilla única de la máquina local para cifrado simétrico en reposo."""
    parts = [
        platform.node() or "wifi-analyzer-host",
        platform.system() or "os",
        str(uuid.getnode()),
        PROJECT_ROOT,
    ]
    # Intentar leer /etc/machine-id en Linux para mayor entropía atada al host
    for mid_path in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
        if os.path.exists(mid_path):
            try:
                with open(mid_path, "r", encoding="utf-8", errors="ignore") as f:
                    mid = f.read().strip()
                    if mid:
                        parts.append(mid)
                        break
            except Exception:
                pass
    raw_seed = "|".join(parts).encode("utf-8")
    return hashlib.sha256(raw_seed).digest()


def encrypt_local_secret(plaintext: str) -> str:
    """Ofusca/cifra una cadena usando un flujo derivado con PBKDF2-HMAC-SHA256 + Sal aleatoria."""
    if not plaintext:
        return ""
    if plaintext.startswith(_ENC_PREFIX):
        return plaintext
    salt = os.urandom(16)
    secret = _get_machine_secret()
    raw_bytes = plaintext.encode("utf-8")
    # Generar keystream suficientemente largo en bloques de 32 bytes
    keystream = bytearray()
    block_idx = 1
    while len(keystream) < len(raw_bytes):
        dk = hashlib.pbkdf2_hmac(
            "sha256",
            secret,
            salt + block_idx.to_bytes(4, "big"),
            10000,
            dklen=32,
        )
        keystream.extend(dk)
        block_idx += 1
    cipher_bytes = bytes(b ^ k for b, k in zip(raw_bytes, keystream[: len(raw_bytes)]))
    tag = hashlib.blake2s(salt + cipher_bytes, key=secret[:32], digest_size=16).digest()
    payload = base64.urlsafe_b64encode(salt + tag + cipher_bytes).decode("ascii")
    return f"{_ENC_PREFIX}{payload}"


def decrypt_local_secret(ciphertext: str) -> str:
    """Descifra un secreto previamente almacenado con encrypt_local_secret."""
    if not ciphertext:
        return ""
    if not ciphertext.startswith(_ENC_PREFIX):
        return ciphertext
    try:
        b64_part = ciphertext[len(_ENC_PREFIX) :]
        raw = base64.urlsafe_b64decode(b64_part.encode("ascii"))
        if len(raw) < 32:
            return ""
        salt = raw[:16]
        tag = raw[16:32]
        cipher_bytes = raw[32:]
        secret = _get_machine_secret()
        expected_tag = hashlib.blake2s(
            salt + cipher_bytes, key=secret[:32], digest_size=16
        ).digest()
        if tag != expected_tag:
            return ""
        keystream = bytearray()
        block_idx = 1
        while len(keystream) < len(cipher_bytes):
            dk = hashlib.pbkdf2_hmac(
                "sha256",
                secret,
                salt + block_idx.to_bytes(4, "big"),
                10000,
                dklen=32,
            )
            keystream.extend(dk)
            block_idx += 1
        plain_bytes = bytes(
            c ^ k for c, k in zip(cipher_bytes, keystream[: len(cipher_bytes)])
        )
        return plain_bytes.decode("utf-8")
    except Exception:
        return ""


def mask_api_key(key: Optional[str]) -> str:
    """Devuelve una versión enmascarada segura de la API Key para mostrar en UI/logs."""
    if not key:
        return ""
    clean = key.strip()
    if len(clean) <= 8:
        return "•" * len(clean)
    return f"{clean[:6]}{'•' * 14}{clean[-4:]}"


def read_dotenv_values() -> Dict[str, str]:
    """Lee pares CLAVE=VALOR desde el archivo .env local sin dependencias externas."""
    values: Dict[str, str] = {}
    if not os.path.exists(DOTENV_PATH):
        return values
    try:
        with open(DOTENV_PATH, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                k, v = s.split("=", 1)
                k = k.strip()
                v = v.strip()
                if len(v) >= 2 and ((v[0] == '"' and v[-1] == '"') or (v[0] == "'" and v[-1] == "'")):
                    v = v[1:-1]
                if k:
                    values[k] = v
    except Exception:
        pass
    return values


def write_dotenv_value(key: str, value: str) -> bool:
    """Escribe o actualiza una variable en .env local y aplica permisos 0600 (solo propietario)."""
    try:
        lines = []
        found = False
        if os.path.exists(DOTENV_PATH):
            with open(DOTENV_PATH, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()

        new_lines = []
        for line in lines:
            s = line.strip()
            if s and not s.startswith("#") and "=" in s:
                k = s.split("=", 1)[0].strip()
                if k == key:
                    if value:
                        new_lines.append(f'{key}="{value}"\n')
                    found = True
                    continue
            new_lines.append(line)

        if not found and value:
            if new_lines and not new_lines[-1].endswith("\n"):
                new_lines[-1] += "\n"
            new_lines.append(f'{key}="{value}"\n')

        with open(DOTENV_PATH, "w", encoding="utf-8") as f:
            f.writelines(new_lines)

        if sys.platform != "win32":
            try:
                os.chmod(DOTENV_PATH, 0o600)
            except Exception:
                pass
        return True
    except Exception:
        return False


def resolve_gemini_api_key(db_encrypted_value: str = "") -> Tuple[str, str]:
    """
    Resuelve la API Key de Gemini según orden de prioridad:
    1. Variable de entorno del sistema (GEMINI_API_KEY o GOOGLE_API_KEY)
    2. Archivo local .env (GEMINI_API_KEY o GOOGLE_API_KEY)
    3. Valor cifrado en SQLite local (telemetry.db)

    Retorna: (api_key_en_claro, fuente: 'env' | 'dotenv' | 'db' | 'none')
    """
    env_key = (
        os.environ.get("GEMINI_API_KEY", "").strip()
        or os.environ.get("GOOGLE_API_KEY", "").strip()
    )
    if env_key:
        return env_key, "env"

    dotenv_vals = read_dotenv_values()
    dotenv_key = (
        dotenv_vals.get("GEMINI_API_KEY", "").strip()
        or dotenv_vals.get("GOOGLE_API_KEY", "").strip()
    )
    if dotenv_key:
        return dotenv_key, "dotenv"

    if db_encrypted_value:
        decrypted = decrypt_local_secret(db_encrypted_value).strip()
        if decrypted:
            return decrypted, "db"

    return "", "none"


def get_credentials_status(db_encrypted_value: str = "", model_name: str = "gemini-3.8-flash") -> Dict[str, Any]:
    """Devuelve el estado seguro y enmascarado de las credenciales para la UI y API REST."""
    key, source = resolve_gemini_api_key(db_encrypted_value)
    source_labels = {
        "env": "Variable de Entorno del Sistema (GEMINI_API_KEY)",
        "dotenv": "Archivo Local Protegido (.env con permisos 600)",
        "db": "Almacenamiento Local Cifrado (SQLite PBKDF2-SHA256)",
        "none": "Sin clave API configurada (Modo MCP Externo disponible)",
    }
    return {
        "has_api_key": bool(key),
        "masked_key": mask_api_key(key) if key else "",
        "source": source,
        "source_label": source_labels.get(source, source),
        "model": model_name or "gemini-3.8-flash",
        "dotenv_exists": os.path.exists(DOTENV_PATH),
        "git_protected": True,
    }

