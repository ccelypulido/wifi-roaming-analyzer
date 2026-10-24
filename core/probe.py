import socket
import ssl
import time
import base64
import urllib.parse
from typing import Dict, Any, Optional

try:
    from core import ntlm_auth
except ImportError:
    try:
        from . import ntlm_auth
    except ImportError:
        import ntlm_auth

def read_http_response(sock: socket.socket) -> tuple[bytes, dict, int]:
    """Reads HTTP headers and response body from a connected socket."""
    data = b""
    headers_end = -1
    while headers_end == -1:
        chunk = sock.recv(4096)
        if not chunk:
            break
        data += chunk
        headers_end = data.find(b"\r\n\r\n")

    if headers_end == -1:
        return data, {}, 0

    header_bytes = data[:headers_end]
    lines = header_bytes.decode('utf-8', errors='ignore').split('\r\n')
    status_line = lines[0] if lines else ""
    parts = status_line.split()
    status_code = int(parts[1]) if len(parts) >= 2 and parts[1].isdigit() else 0

    headers = {}
    for line in lines[1:]:
        if ':' in line:
            k, v = line.split(':', 1)
            headers[k.strip().lower()] = v.strip()

    content_length = int(headers.get('content-length', 0))
    body_read = len(data) - (headers_end + 4)
    while content_length > 0 and body_read < content_length:
        chunk = sock.recv(min(8192, content_length - body_read))
        if not chunk:
            break
        data += chunk
        body_read += len(chunk)

    return data, headers, status_code

def measure_latency(
    url: str,
    timeout: float = 6.0,
    auth_config: Optional[Dict[str, str]] = None,
    verify_ssl: bool = True
) -> Dict[str, Any]:
    """
    Measures sequential latency phases for any HTTP/HTTPS endpoint:
    - DNS Resolution (dns_ms)
    - TCP Handshake (tcp_ms)
    - TLS/SSL Handshake (tls_ms)
    - Time To First Byte (ttfb_ms)
    - Data Transfer (transfer_ms)
    - Browser / Application Active Latency (total_ms = ttfb + transfer)
    - Cold Start Total Latency (cold_total_ms = dns + tcp + tls + ttfb + transfer)
    """
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        return {
            'url': url,
            'timestamp': time.time(),
            'ip': None,
            'status_code': 0,
            'dns_ms': 0.0,
            'tcp_ms': 0.0,
            'tls_ms': 0.0,
            'ttfb_ms': 0.0,
            'transfer_ms': 0.0,
            'total_ms': 0.0,
            'cold_total_ms': 0.0,
            'is_error': True,
            'error_message': 'URL inválida o sin hostname',
            'response_size_bytes': 0
        }

    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    path = parsed.path or '/'
    if parsed.query:
        path += '?' + parsed.query

    res = {
        'url': url,
        'timestamp': time.time(),
        'ip': None,
        'status_code': 0,
        'dns_ms': 0.0,
        'tcp_ms': 0.0,
        'tls_ms': 0.0,
        'ttfb_ms': 0.0,
        'transfer_ms': 0.0,
        'total_ms': 0.0,
        'cold_total_ms': 0.0,
        'is_error': False,
        'error_message': None,
        'response_size_bytes': 0
    }

    auth_enabled = False
    auth_type = 'none'
    domain, user, password, token = '', '', '', ''
    if auth_config:
        auth_enabled = (auth_config.get('auth_enabled') in ('1', True, 'true', 1))
        auth_type = auth_config.get('auth_type', 'none')
        domain = auth_config.get('auth_domain', '')
        user = auth_config.get('auth_user', '')
        password = auth_config.get('auth_password', '')
        token = auth_config.get('auth_token', '')

    user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Enterprise-Telemetry-Analyzer/2.0"

    t0 = time.perf_counter()
    sock = None
    ssl_sock = None

    try:
        # 1. DNS Resolution
        t_dns_start = time.perf_counter()
        ip = socket.gethostbyname(hostname)
        t_dns_end = time.perf_counter()
        res['ip'] = ip
        res['dns_ms'] = round((t_dns_end - t_dns_start) * 1000, 2)

        # 2. TCP Connection Handshake
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        t_tcp_start = time.perf_counter()
        sock.connect((ip, port))
        t_tcp_end = time.perf_counter()
        res['tcp_ms'] = round((t_tcp_end - t_tcp_start) * 1000, 2)

        # 3. TLS Handshake
        if parsed.scheme == 'https':
            if verify_ssl:
                context = ssl.create_default_context()
            else:
                context = ssl._create_unverified_context()
                context.check_hostname = False
                context.verify_mode = ssl.CERT_NONE

            t_tls_start = time.perf_counter()
            ssl_sock = context.wrap_socket(sock, server_hostname=hostname)
            t_tls_end = time.perf_counter()
            res['tls_ms'] = round((t_tls_end - t_tls_start) * 1000, 2)
        else:
            ssl_sock = sock
            res['tls_ms'] = 0.0

        # 4. HTTP Headers & Authentication
        extra_headers = ""
        if auth_enabled:
            if auth_type == 'basic' and (user or password):
                full_user = f"{domain}\\{user}" if domain and '\\' not in user else user
                creds = base64.b64encode(f"{full_user}:{password}".encode('utf-8')).decode('ascii')
                extra_headers += f"Authorization: Basic {creds}\r\n"
            elif auth_type == 'bearer' and token:
                token_clean = token.strip()
                if token_clean.lower().startswith('cookie:'):
                    extra_headers += token_clean + '\r\n'
                elif token_clean.lower().startswith('authorization:'):
                    extra_headers += token_clean + '\r\n'
                elif '=' in token_clean and (';' in token_clean or not token_clean.lower().startswith('bearer ')):
                    extra_headers += 'Cookie: ' + token_clean + '\r\n'
                else:
                    auth_val = token_clean if token_clean.lower().startswith('bearer ') else 'Bearer ' + token_clean
                    extra_headers += 'Authorization: ' + auth_val + '\r\n'

        if auth_enabled and auth_type == 'ntlm' and (user or password):
            # NTLM Type 1 Negotiate
            ntlm_type1 = ntlm_auth.get_ntlm_type1()
            req_type1 = (
                f"GET {path} HTTP/1.1\r\n"
                f"Host: {hostname}\r\n"
                f"User-Agent: {user_agent}\r\n"
                f"Accept: */*\r\n"
                f"Authorization: NTLM {ntlm_type1}\r\n"
                f"Connection: keep-alive\r\n\r\n"
            )
            ssl_sock.sendall(req_type1.encode('utf-8'))
            data1, headers1, status1 = read_http_response(ssl_sock)

            www_auth = headers1.get('www-authenticate', '')
            challenge_b64 = None
            if 'ntlm' in www_auth.lower():
                parts = www_auth.split()
                for i, p in enumerate(parts):
                    if p.lower() == 'ntlm' and i + 1 < len(parts):
                        challenge_b64 = parts[i + 1]
                        break

            if challenge_b64:
                full_user = f"{domain}\\{user}" if domain and '\\' not in user else user
                type3_b64 = ntlm_auth.create_ntlm_type3(challenge_b64, full_user, domain, password)
                req_type3 = (
                    f"GET {path} HTTP/1.1\r\n"
                    f"Host: {hostname}\r\n"
                    f"User-Agent: {user_agent}\r\n"
                    f"Accept: */*\r\n"
                    f"Authorization: NTLM {type3_b64}\r\n"
                    f"Connection: close\r\n\r\n"
                )
                t_ttfb_start = time.perf_counter()
                ssl_sock.sendall(req_type3.encode('utf-8'))
                first_byte = ssl_sock.recv(1)
                t_ttfb_end = time.perf_counter()
                res['ttfb_ms'] = round((t_ttfb_end - t_ttfb_start) * 1000, 2)

                t_trans_start = time.perf_counter()
                data = first_byte
                while True:
                    chunk = ssl_sock.recv(8192)
                    if not chunk:
                        break
                    data += chunk
                t_trans_end = time.perf_counter()
                res['transfer_ms'] = round((t_trans_end - t_trans_start) * 1000, 2)
                res['response_size_bytes'] = len(data)
                ssl_sock.close()

                status_line = data.split(b'\r\n')[0].decode('utf-8', errors='ignore')
                sp = status_line.split()
                if len(sp) >= 2 and sp[1].isdigit():
                    res['status_code'] = int(sp[1])

                res['total_ms'] = round(res['ttfb_ms'] + res['transfer_ms'], 2)
                res['cold_total_ms'] = round(res['dns_ms'] + res['tcp_ms'] + res['tls_ms'] + res['ttfb_ms'] + res['transfer_ms'], 2)
                return res

        # Standard Request
        req_headers = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {hostname}\r\n"
            f"User-Agent: {user_agent}\r\n"
            f"Accept: */*\r\n"
            f"{extra_headers}"
            f"Connection: close\r\n\r\n"
        )
        t_ttfb_start = time.perf_counter()
        ssl_sock.sendall(req_headers.encode('utf-8'))
        first_byte = ssl_sock.recv(1)
        t_ttfb_end = time.perf_counter()
        res['ttfb_ms'] = round((t_ttfb_end - t_ttfb_start) * 1000, 2)

        if not first_byte:
            raise Exception("El servidor cerró la conexión sin retornar datos")

        t_trans_start = time.perf_counter()
        data = first_byte
        while True:
            chunk = ssl_sock.recv(8192)
            if not chunk:
                break
            data += chunk
        t_trans_end = time.perf_counter()
        res['transfer_ms'] = round((t_trans_end - t_trans_start) * 1000, 2)
        res['response_size_bytes'] = len(data)
        ssl_sock.close()

        status_line = data.split(b'\r\n')[0].decode('utf-8', errors='ignore')
        parts = status_line.split()
        if len(parts) >= 2 and parts[1].isdigit():
            res['status_code'] = int(parts[1])

        res['total_ms'] = round(res['ttfb_ms'] + res['transfer_ms'], 2)
        res['cold_total_ms'] = round(res['dns_ms'] + res['tcp_ms'] + res['tls_ms'] + res['ttfb_ms'] + res['transfer_ms'], 2)

    except socket.timeout:
        res['is_error'] = True
        res['error_message'] = f"Timeout ({timeout}s)"
        res['total_ms'] = round((time.perf_counter() - t0) * 1000, 2)
        res['cold_total_ms'] = res['total_ms']
    except Exception as e:
        res['is_error'] = True
        res['error_message'] = str(e)
        res['total_ms'] = round((time.perf_counter() - t0) * 1000, 2)
        res['cold_total_ms'] = res['total_ms']
    finally:
        if ssl_sock:
            try:
                ssl_sock.close()
            except Exception:
                pass
        elif sock:
            try:
                sock.close()
            except Exception:
                pass

    return res

if __name__ == '__main__':
    test_url = "https://1.1.1.1"
    print("Testing multipurpose probe on:", test_url)
    metrics = measure_latency(test_url)
    print("Results:", metrics)
