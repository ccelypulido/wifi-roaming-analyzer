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

Necesitas tener instalado:
- **Python 3.6+** 🐍
- Herramientas de Wi-Fi: `iw`, `iwconfig` (en Linux)
- Una conexión Wi-Fi activa

En Ubuntu/Debian:
```bash
sudo apt-get install iw wireless-tools
```

### 2️⃣ Ejecutar el Proyecto

Es muy fácil, solo dos pasos:

```bash
# Dale permisos de ejecución al script
chmod +x run.sh

# Ejecuta el analizador
./run.sh
```

¡Eso es todo! El servidor se iniciará en `http://localhost:8050` y tu navegador se abrirá automáticamente.

### 3️⃣ Detener el Proyecto

Para parar el servidor:
```bash
./stop.sh
```

## 📁 Estructura del Proyecto

```
wifi-roaming-analyzer/
├── README.md              # Este archivo (documentación)
├── run.sh                 # Script para iniciar fácilmente
├── stop.sh                # Script para detener el servidor
├── server.py              # Cerebro del proyecto (backend en Python)
└── static/                # Dashboard web (frontend)
    ├── index.html         # Página principal
    ├── app.js             # Lógica interactiva
    └── styles.css         # Estilos y diseño
```

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

### Cambiar la interfaz Wi-Fi
Si usas otro adaptador (ej: `wlan0`), edita `server.py`:
```python
self.interface = "wlp2s0"  # Cambia esto por tu interfaz
```

## 📝 Notas Técnicas

- **Sistema Operativo**: Optimizado para Linux (requiere herramientas de Wi-Fi de Linux)
- **Lenguaje**: Python 3 para backend, HTML/CSS/JavaScript vanilla para frontend
- **Puerto**: 8050 (configurable)
- **Refresco**: Datos actualizados cada 1 segundo

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

## 📄 Licencia

Este proyecto es libre para usar y modificar. ¡Siéntete libre de adaptarlo a tus necesidades!

## 🎓 Aprende Más

¿Interesado en cómo funciona internamente? Revisa:
- `server.py` - Toda la lógica de captura de datos Wi-Fi
- `app.js` - Cómo actualiza el dashboard en tiempo real
- `index.html` - Estructura del HTML y elementos visuales
