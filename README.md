# 📶 Wi-Fi & AP Roaming Telemetry Analyzer

Un analizador interactivo de Wi-Fi que monitorea **en tiempo real** la intensidad de señal, la calidad de conexión y el roaming automático entre puntos de acceso.

## 🎯 ¿Qué es este proyecto?

Este es un dashboard visual que te muestra todo lo que necesitas saber sobre tu conexión Wi-Fi:

- **Intensidad de Señal** 📊 - Ve gráficos en vivo de cómo varía la potencia de señal
- **Latencia de Red** ⏱️ - Monitorea el ping hacia el gateway en tiempo real
- **Puntos de Acceso** 🔍 - Descubre y analiza todos los AP disponibles en tu red
- **Eventos de Roaming** 🔄 - Registra automáticamente cada cambio de AP
- **Calidad de Conexión** 🎯 - Obtén una puntuación visual de qué tan buena es tu conexión

## 🚀 Inicio Rápido

### 1️⃣ Requisitos Previos

- **Python 3.6+** 🐍 (instalado en el sistema)
- Una conexión Wi-Fi activa

> [!NOTE]
> **En Windows:** ¡No necesitas instalar nada más! Windows ya incluye todas las utilidades de red necesarias (`netsh`, `route`, `ping`) de forma nativa.
> 
> **En Linux:** Se requieren herramientas del sistema (`iw`, `iproute2`, `ping`).

#### ⚙️ Instalación de Dependencias del Sistema (Solo Linux)

El proyecto incluye un script automático para Linux:

```bash
sudo chmod +x install-dependencies.sh
sudo ./install-dependencies.sh
```

O instala manualmente según tu distribución ([ver requirements-system.txt](requirements-system.txt)):
- **Ubuntu/Debian:** `sudo apt-get install -y iw iproute2 iputils-ping network-manager wireless-tools`
- **Fedora/RHEL:** `sudo dnf install -y iw iproute iputils NetworkManager wireless-tools`
- **Arch/Manjaro:** `sudo pacman -S iw iproute2 iputils networkmanager wireless_tools`

---

### 2️⃣ Ejecutar el Proyecto

#### 🪟 En Windows (PowerShell o CMD)

Solo necesitas abrir tu terminal (PowerShell o Símbolo del sistema / CMD) en la carpeta del proyecto y ejecutar:

```powershell
# Opción 1: Directamente con Python (Recomendado)
python server.py

# Opción 2: Usando el script de PowerShell
.\run.ps1

# Opción 3: Usando el script Batch (o doble clic en run.bat)
run.bat
```

#### 🐧 En Linux

```bash
# Con el script de inicio
chmod +x run.sh
./run.sh

# O directamente con Python:
python3 server.py
```

¡Eso es todo! El servidor se iniciará en `http://localhost:8050` y tu navegador se abrirá automáticamente.

---

### 3️⃣ Detener el Proyecto

- En la consola donde se está ejecutando, presiona **`Ctrl + C`**.
- O usa los scripts de detención y liberación de puerto incluidos:
  - **Windows (PowerShell):** `.\stop.ps1`
  - **Windows (CMD / Doble clic):** `stop.bat`
  - **Linux:** `./stop.sh`

---

## 🎯 Seleccionar Interfaz Wi-Fi

Si tienes múltiples adaptadores Wi-Fi o deseas especificar uno concreto:

### Listar interfaces disponibles
```bash
# En Windows (PowerShell / CMD):
python server.py --list

# En Linux:
./run.sh --list
# O:
python3 server.py --list
```

Ejemplo de salida en Windows:
```
Interfaces Wi-Fi disponibles:
  - Wi-Fi
  - Wi-Fi 2
```

Ejemplo de salida en Linux:
```
Interfaces Wi-Fi disponibles:
  - wlp2s0
  - wlan0
```

### Usar una interfaz específica
```bash
# En Windows:
python server.py -i "Wi-Fi"

# En Linux:
./run.sh -i wlan0
# O:
python3 server.py -i wlan0
```

### Cambiar de puerto (opcional)
```bash
python server.py --port 9000
```

**Nota**: El dashboard web también permite cambiar la interfaz en tiempo real desde la API (`/api/set-interface`).

---

## 📁 Estructura del Proyecto

```
wifi-roaming-analyzer/
├── README.md                    # Documentación y guía de uso
├── .gitignore                   # Excluye archivos temporales
├── requirements.txt             # Dependencias de Python (solo librerías estándar)
├── requirements-system.txt      # Documentación de herramientas del sistema
├── install-dependencies.sh      # Instalador de herramientas para Linux
├── run.bat                      # Lanzador para Windows CMD y doble clic
├── run.ps1                      # Lanzador para Windows PowerShell
├── run.sh                       # Lanzador para Linux (Bash)
├── stop.sh                      # Script para detener en Linux
├── server.py                    # Cerebro multiplataforma (Windows y Linux)
└── static/                      # Dashboard web (frontend)
    ├── index.html               # Página principal
    ├── app.js                   # Lógica interactiva y gráficos
    └── styles.css               # Estilos y diseño
```

### 📦 Archivos de Configuración

| Archivo | Descripción |
|---------|-------------|
| **requirements.txt** | Dependencias de Python (actualmente vacío, solo usa librerías estándar) |
| **requirements-system.txt** | Lista detallada de herramientas del sistema necesarias (iw, nmcli, etc.) |
| **install-dependencies.sh** | Script automático que detecta tu distribución e instala todo |
| **.gitignore** | Excluye carpetas ocultas, entornos virtuales y archivos temporales |

## 🔧 Cómo Funciona

### Backend (server.py)
El servidor Python hace el trabajo pesado:

1. **Recolecta datos** 📡 de tu adaptador Wi-Fi usando comandos Linux
2. **Analiza la señal** 📊 y asigna una calificación (Excelente, Muy Buena, Buena, Débil, Crítica)
3. **Monitorea cambios** 🔄 en los puntos de acceso conectados
4. **Registra eventos** 📝 cada vez que cambias de AP
5. **Expone una API REST** 🔌 que entrega los datos en JSON

### Frontend (app.js + index.html)
La interfaz visual actualiza en tiempo real:

1. **Conecta con el servidor** 🔗 vía peticiones AJAX
2. **Actualiza gráficos** 📈 cada segundo con nuevos datos
3. **Muestra métricas** 🎯 en tarjetas visuales hermosas
4. **Registra historial** 📋 de cambios y eventos

## 📊 Métricas que Verás

| Métrica | Qué Significa |
|---------|---------------|
| **dBm (Potencia)** | Intensidad de señal (-50 a -100). Más cercano a -50 = mejor |
| **Ping (ms)** | Latencia hacia el gateway. Menor = más rápido |
| **Velocidad TX/RX** | Ancho de banda de transmisión y recepción |
| **Frecuencia/Canal** | En qué banda 2.4GHz o 5GHz estás, y qué canal |
| **BSSID/SSID** | Identificador único y nombre de tu AP |
| **Vendor** | Fabricante del punto de acceso (TP-Link, Huawei, etc.) |

## 🎨 Calificaciones de Señal

El proyecto te da una puntuación visual:

- 🟢 **Excelente** (-50 a -60 dBm): Conexión perfecta
- 🔵 **Muy Buena** (-60 a -70 dBm): Muy buena para trabajar
- 🟣 **Buena** (-70 a -80 dBm): Acceptable pero no ideal
- 🟡 **Débil** (-80 a -90 dBm): Conexión problemática
- 🔴 **Crítica** (< -90 dBm): Conexión muy mala

## 🔍 Funcionalidades Principales

✅ **Dashboard en vivo** - Datos actualizando cada segundo  
✅ **Gráficos históricos** - Ve tendencias de señal y latencia  
✅ **Detector de APs** - Escanea redes disponibles  
✅ **Registro de roaming** - Historial de cambios de AP  
✅ **Identificación de vendor** - Sabe qué marca es cada AP  
✅ **Interfaz amigable** - Bonita, intuitiva y responsive  

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

## 📄 Licencia

Este proyecto es libre para usar y modificar. ¡Siéntete libre de adaptarlo a tus necesidades!

## 🎓 Aprende Más

¿Interesado en cómo funciona internamente? Revisa:
- `server.py` - Toda la lógica de captura de datos Wi-Fi
- `app.js` - Cómo actualiza el dashboard en tiempo real
- `index.html` - Estructura del HTML y elementos visuales
