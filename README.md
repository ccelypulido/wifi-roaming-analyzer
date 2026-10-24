# 📶 Wi-Fi & Enterprise Application Telemetry Analyzer

Un analizador multipropósito e interactivo de red y aplicaciones que monitorea **en tiempo real** la intensidad de señal Wi-Fi (RF), el roaming automático entre Access Points y la **latencia HTTP por fases** hacia endpoints corporativos en **Tiendas/POS**, **Sedes Administrativas** y **Centros de Distribución / Bodegas**.

## 🎯 ¿Qué es este proyecto?

Este es un dashboard visual y plataforma de observabilidad de conectividad diseñada para responder de inmediato si un congelamiento o lentitud en terminales o equipos se debe a la **red inalámbrica (Capa 1/2)** o al **servidor/aplicación (Capa 3/4/7)**:

- **Intensidad de Señal Wi-Fi** 📊 - Métricas de dBm, porcentaje de cobertura, canal, banda (2.4/5/6 GHz) y tasas TX/RX.
- **Latencia de Aplicación Multipropósito** ⏱️ - Sonda HTTP de bajo nivel con desglose secuencial de 5 fases: **Resolución DNS**, **Handshake TCP**, **Negociación TLS/SSL**, **Time to First Byte (TTFB)** y **Transferencia**.
- **Perfiles de Entorno Preconfigurados** 🏢 - Ajuste inmediato para:
  - 🏬 **Tienda / Punto de Venta (POS):** Monitoreo de cajas, pasarelas de pago y piso de venta.
  - 🏢 **Sede Administrativa / Oficinas:** Laptops corporativas, videollamadas VoIP, ERP (SAP/Oracle) y Microsoft 365.
  - 🏭 **Centro de Distribución / Bodega:** Terminales PDA, pistolas RF y Manhattan WMS/SCE.
  - ⚙️ **Personalizado / Libre:** Cualquier URL interna o externa en HTTP/HTTPS con o sin autenticación.
- **Diagnóstico Integral de Red** 🛠️ - Pings simultáneos a Puerta de Enlace, Servidores DNS locales y Servidor Aplicativo, junto con **Traceroute paso a paso**.
- **Gestión Jerárquica de Sedes y Zonas** 📍 - Categorización de auditoría por ubicación física (ej. *Tienda 102 -> Cajas 1-4* o *Bodega -> Rack 5*).
- **Eventos de Roaming (Handoffs)** 🔄 - Detección automática de cambios de AP con medición del impacto de latencia antes y después del salto.
- **Persistencia SQLite WAL y Exportación CSV** 💾 - Histórico completo, cálculo de percentiles ($P_{50}, P_{90}, P_{95}, P_{99}$) y auditoría exportable.
- **Zero Pip Dependencies & 100% Offline** ⚡ - Funciona con la biblioteca estándar de Python sin requerir instalación de paquetes externos ni conexión a internet en sitios cerrados.

## 📁 Estructura del Proyecto

```
wifi-roaming-analyzer/
├── README.md                    # Documentación y guía de uso
├── .gitignore                   # Excluye temporales, WAL y base de datos
├── requirements.txt             # Dependencias de Python (0 dependencias externas)
├── requirements-system.txt      # Documentación de herramientas del sistema (Linux)
├── install-dependencies.sh      # Instalador de utilidades para Linux
├── run.bat / run.ps1 / run.sh   # Lanzadores para Windows y Linux
├── stop.sh / stop.ps1 / stop.bat# Scripts para detener y liberar puerto
├── server.py                    # Servidor web, API REST y coordinadores de hilos
├── database.py                  # Persistencia en SQLite (WAL), estadísticas y CSV
├── probe.py                     # Sonda secuencial de latencia HTTP de bajo nivel
├── net_diag.py                  # Diagnóstico de red, Gateway, DNS y Traceroute
├── ntlm_auth.py                 # Generador de tokens NTLM / Hash MD4 puro en Python
├── oui_manager.py               # Identificador de fabricantes por prefijo MAC (IEEE OUI)
├── ap_manager.py                # Mapeo de BSSID a nombres amigables de AP
├── sedes_zonas.json             # Catálogo inicial de sedes y zonas
└── static/                      # Dashboard web (100% offline-ready)
    ├── index.html               # Interfaz visual con pestañas especializadas
    ├── app.js                   # Lógica reactiva, gráficos y comunicación API
    ├── styles.css               # Diseño moderno, glassmorphism y tema oscuro
    ├── chart.umd.min.js         # Motor de gráficos Chart.js local
    └── lucide.min.js            # Iconografía local
```

## 🛠️ Personalización

### Cambiar el puerto
Si el puerto 8050 está ocupado, edita `server.py` y cambia:
```python
PORT = 8050  # Cambiar este número
```

O usa la opción de línea de comandos:
```bash
./run.sh --port 9000
```

### Cambiar la interfaz Wi-Fi
Tienes tres formas:

**Opción 1: Línea de comandos (recomendado)**
```bash
./run.sh -i wlan0
```

**Opción 2: Detectar automáticamente**
El programa intenta detectar automáticamente la interfaz, pero si tienes múltiples adaptadores, especifícala.

**Opción 3: Editar directamente**
Si prefieres editar `server.py` directamente:
```python
state = WiFiState(interface="wlan0")  # Cambia esto
```

**Opción 4: API REST en tiempo real**
Puedes cambiar la interfaz mientras el servidor está corriendo:
```bash
curl -X POST http://localhost:8050/api/set-interface \
  -H "Content-Type: application/json" \
  -d '{"interface": "wlan0"}'
```

## � API REST Endpoints

El servidor expone estos endpoints que puedes usar:

### GET `/api/status`
Obtiene el estado actual de la conexión Wi-Fi
```json
{
  "bssid": "AA:BB:CC:DD:EE:FF",
  "ssid": "MiRed",
  "signal_dbm": -65,
  "signal_pct": 70,
  "interface": "wlan0",
  "band": "5.0 GHz",
  "channel": 36,
  ...
}
```

### GET `/api/interfaces`
Lista todas las interfaces Wi-Fi disponibles
```json
{
  "available": ["wlp2s0", "wlan0"],
  "current": "wlp2s0",
  "count": 2
}
```

### POST `/api/set-interface`
Cambia la interfaz Wi-Fi activa
```bash
curl -X POST http://localhost:8050/api/set-interface \
  -H "Content-Type: application/json" \
  -d '{"interface": "wlan0"}'
```

### GET `/api/scan`
Obtiene lista de APs disponibles (red vecinos)

### GET `/api/roaming-history`
Obtiene historial de cambios de AP (roaming events)

### POST `/api/clear-roaming-log`
Limpia el historial de eventos de roaming

### POST `/api/trigger-test-ping`
Ejecuta 5 pings de prueba y mide latencia

## 📝 Notas Técnicas

- **Sistema Operativo**: Optimizado para Linux (requiere herramientas de Wi-Fi de Linux)
- **Lenguaje**: Python 3 para backend, HTML/CSS/JavaScript vanilla para frontend
- **Puerto**: 8050 (configurable con `--port`)
- **Interfaz**: Auto-detectada o especificable con `-i` o `--interface`
- **Refresco**: Datos actualizados cada 1 segundo
- **Argumentos soportados**: Ver `python3 server.py --help` o `./run.sh --help`

## 🐛 Solución de Problemas

### El servidor no inicia
```bash
# Verifica que Python 3 esté instalado
python3 --version

# Instala las herramientas Wi-Fi necesarias
sudo apt-get install iw wireless-tools
```

### No se ve el dashboard
- Asegúrate de que el navegador puede acceder a `http://localhost:8050`
- Verifica que no hay firewall bloqueando el puerto

### La señal muestra "Sin Señal"
- Confirma que tu interfaz Wi-Fi está activa
- Revisa que tienes una conexión Wi-Fi establecida

## 🤖 Automatización e Integración CI/CD

### Instalación Automatizada

Para automatizar la instalación en servidores, contenedores o pipelines CI/CD:

```bash
# Instalación automática de dependencias
sudo bash install-dependencies.sh

# Luego iniciar el servidor
./run.sh
```

### Docker (Ejemplo para futura implementación)

```dockerfile
FROM python:3.9-slim

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    iw \
    iproute2 \
    iputils-ping \
    network-manager \
    wireless-tools \
    && rm -rf /var/lib/apt/lists/*

# Copiar proyecto
WORKDIR /app
COPY . .

# Ejecutar servidor
CMD ["python3", "server.py"]
```

### GitHub Actions / CI/CD

Ejemplo de workflow para despliegue automático:

```yaml
name: Setup Wi-Fi Analyzer

on: [push]

jobs:
  setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install system dependencies
        run: |
          sudo bash install-dependencies.sh
      - name: Test server startup
        run: |
          timeout 5 python3 server.py -i $(python3 server.py --list 2>/dev/null | head -1) || true
```

### Verificación de Dependencias

Para verificar que todo está instalado correctamente:

```bash
# Verificar herramientas individuales
which iw
which ip
which ping
which nmcli

# Listar interfaces disponibles
python3 server.py --list

# Ver ayuda de línea de comandos
./run.sh --help
```

---

## 🏢 Gestión y Actualización de Fabricantes de APs (OUI)

El analizador identifica la marca y fabricante de cada Punto de Acceso analizando el **OUI** (*Organizationally Unique Identifier* - los primeros 3 octetos de la dirección MAC del AP).

### 1️⃣ Base de Datos Externa (`oui_vendors.json`)
La base de datos se guarda en un archivo externo independiente: `oui_vendors.json`.
- Viene precargado con los fabricantes más habituales (Aruba/HPE, Cisco/Meraki, Ubiquiti, Ruckus, Fortinet, Mikrotik, TP-Link, Huawei, etc.).
- Permite registros **personalizados** (*custom overrides*) para asignar nombres amigables a APs de laboratorio o routers específicos. Los registros personalizados tienen prioridad absoluta y **no se borran ni sobrescriben** al actualizar.

### 2️⃣ Actualización Automática desde el Registro Oficial IEEE
Puedes sincronizar **más de 40,000 fabricantes** actualizados directamente desde el registro oficial del IEEE (MA-L Registry) de dos formas:

#### A. Desde la Interfaz Web (1 Clic)
1. Abre el dashboard en `http://localhost:8050`.
2. Ve a la pestaña **"Base de Fabricantes (OUI)"**.
3. Haz clic en el botón **"Actualizar desde IEEE"**.
4. Verás una barra de progreso en vivo indicando la descarga y procesamiento.

#### B. Desde la Línea de Comandos (CLI)
Incluye la herramienta `update_oui.py` para automatizaciones y consultas en terminal:

```bash
# Descargar y sincronizar con la base de datos oficial del IEEE
python3 update_oui.py

# Ver estadísticas actuales de la base de datos
python3 update_oui.py --stats

# Consultar el fabricante de una MAC o BSSID
python3 update_oui.py --lookup 00:27:0D:11:22:33

# Buscar fabricantes por nombre o prefijo
python3 update_oui.py --search ubiquiti
python3 update_oui.py --search "cisco"

# Registrar o modificar un fabricante personalizado
python3 update_oui.py --add "00:1A:1E" "Cisco Catalyst Lab AP"
```

---

## 🏷️ Nombres de APs de Controladoras Wi-Fi (Cisco, Aruba, UniFi, Huawei, etc.)

En redes corporativas, educativas o de oficina, cada Punto de Acceso tiene un nombre configurado en la controladora (por ejemplo: `AP-Piso2-SalaJuntas`, `AP-Bodega-Norte`, `AP-Auditorio-01`).

Esta función permite asociar cada dirección MAC/BSSID con su nombre en la controladora, mostrando **ambos valores simultáneamente** en todo el dashboard:
- **Cabecera y Tarjeta de AP Conectado:** Muestra el Nombre del AP y su MAC física.
- **Historial de Roaming (Handoffs):** Indica de qué AP a qué AP te moviste (ej: `AP-Piso2-SalaA` ➡️ `AP-Piso2-Pasillo`).
- **Escáner de APs Cercanos (Mesh):** Muestra el nombre asignado junto al BSSID y permite nombrar nuevos APs con un solo clic.

### 1️⃣ Carga Masiva desde CSV de Controladora
Puedes importar el listado completo exportado desde cualquier controladora:
- **Cisco Catalyst Center / DNA Center / Cisco WLC:** Soporta formato de puntos (ej: `b014.df11.2230`).
- **Aruba Central / Mobility Controller:** Exportaciones estándar de AP inventory.
- **Ubiquiti UniFi, Huawei iMaster NCE, FortiGate, Ruijie Reyee, TP-Link Omada.**

#### Cómo importar desde la Web:
1. Abre el dashboard en `http://localhost:8050` y ve a la pestaña **"Nombres APs (Controladora)"**.
2. Haz clic en **"Importar CSV Controladora"**.
3. Selecciona tu archivo `.csv` o pega el texto directamente.
4. Presiona **"Procesar e Importar APs"**. El sistema detecta automáticamente las columnas y normaliza cualquier formato de MAC.

### 2️⃣ Gestión por Línea de Comandos (`manage_aps.py`)
Compatible tanto con **Windows** (PowerShell / CMD) como con **Linux**:

```bash
# En Windows (PowerShell / CMD) o Linux:
python manage_aps.py --list

# Consultar el nombre de un BSSID / MAC:
python manage_aps.py --lookup B0:14:DF:11:22:30

# Buscar APs por nombre, MAC o ubicación:
python manage_aps.py --search "Piso 2"

# Registrar un AP manualmente:
python manage_aps.py --add "B0:14:DF:11:22:30" "AP-Piso2-SalaJuntas" --location "Piso 2" --model "Cisco 9120"

# Importar un archivo CSV desde la consola:
python manage_aps.py --import-csv mis_aps_controladora.csv

# Eliminar un AP:
python manage_aps.py --remove "B0:14:DF:11:22:30"
```

> [!TIP]
> **Compatibilidad con vBSSID / MBSSID:** Los puntos de acceso corporativos suelen emitir múltiples BSSIDs virtuales (uno por SSID y radio). Si tu controladora exporta la MAC Base Ethernet del AP, el analizador detecta automáticamente el prefijo y asocia los vBSSIDs correspondientes a ese mismo nombre.

---

## 📄 Licencia

Este proyecto es libre para usar y modificar. ¡Siéntete libre de adaptarlo a tus necesidades!

## 🎓 Aprende Más

¿Interesado en cómo funciona internamente? Revisa:
- `server.py` - Toda la lógica de captura de datos Wi-Fi y endpoints REST
- `ap_manager.py` - Motor de resolución, almacenamiento y mapeo de nombres de APs
- `manage_aps.py` - Herramienta de línea de comandos para importar y consultar APs
- `oui_manager.py` - Motor de resolución y descarga de fabricantes OUI
- `update_oui.py` - Herramienta de línea de comandos para gestionar la base OUI
- `static/app.js` - Telemetría, gráficos en tiempo real, escáner y módulo de nombres de APs
- `static/index.html` - Estructura del HTML y elementos visuales
- `static/styles.css` - Estilos modernos glassmórficos y temas responsivos
