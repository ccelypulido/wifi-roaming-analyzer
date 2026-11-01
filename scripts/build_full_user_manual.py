#!/usr/bin/env python3
"""
Compilador del Manual de Usuario Oficial Completo e Ilustrado
para Wi-Fi & Enterprise Telemetry Analyzer.
Genera docs/manual_usuario_completo.html y compila docs/Manual_de_Usuario_WiFi_Roaming_Analyzer.pdf
"""

import os
import subprocess
import shutil

BASE_DIR = "/home/cesarcely/Proyectos/wifi-roaming-analyzer"
DOCS_DIR = os.path.join(BASE_DIR, "docs")
STATIC_DIR = os.path.join(BASE_DIR, "static")

def build_html():
    return """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Manual Oficial de Operación • Wi-Fi & Enterprise Telemetry Analyzer</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 15mm 15mm 18mm 15mm;
      @bottom-right {
        content: "Página " counter(page) " de " counter(pages);
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 8pt;
        color: #94a3b8;
      }
      @bottom-left {
        content: "Wi-Fi & Enterprise Telemetry Analyzer • Manual de Operación";
        font-family: 'Plus Jakarta Sans', sans-serif;
        font-size: 8pt;
        color: #94a3b8;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #0f172a;
      background: #ffffff;
      font-size: 8.8pt;
      line-height: 1.55;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page-break {
      page-break-before: always;
    }

    /* COVER PAGE */
    .cover {
      min-height: 250mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 2.5rem 2.2rem;
      background: #ffffff;
      position: relative;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }

    .cover::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 8px;
      background: linear-gradient(90deg, #1e1b4b 0%, #4f46e5 40%, #06b6d4 75%, #10b981 100%);
    }

    .cover-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #e0f2fe;
      color: #0369a1;
      border-radius: 20px;
      font-size: 8.2pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 1.2rem;
    }

    .cover-title {
      font-size: 24pt;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.18;
      margin-bottom: 0.6rem;
      letter-spacing: -0.02em;
    }

    .cover-subtitle {
      font-size: 11pt;
      color: #475569;
      font-weight: 500;
      line-height: 1.45;
      margin-bottom: 1.8rem;
    }

    .cover-highlight-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #4f46e5;
      border-radius: 8px;
      padding: 1.1rem 1.3rem;
      margin-bottom: 1.8rem;
    }

    .cover-highlight-card h4 {
      font-size: 10pt;
      font-weight: 800;
      color: #1e1b4b;
      margin-bottom: 0.35rem;
    }

    .cover-highlight-card p {
      font-size: 8.5pt;
      color: #475569;
      line-height: 1.45;
    }

    .cover-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.9rem;
      background: #f1f5f9;
      border-radius: 8px;
      padding: 1.1rem;
      margin-bottom: 1.8rem;
    }

    .meta-box span {
      display: block;
      font-size: 7.2pt;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .meta-box strong {
      font-size: 9.2pt;
      color: #0f172a;
      font-weight: 700;
    }

    .cover-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 0.9rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 7.6pt;
      color: #64748b;
    }

    /* HEADINGS */
    h1 {
      font-size: 13.5pt;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 0.35rem;
      margin-top: 1.4rem;
      margin-bottom: 0.65rem;
      page-break-after: avoid;
    }

    h2 {
      font-size: 10.6pt;
      font-weight: 700;
      color: #1e1b4b;
      margin-top: 1rem;
      margin-bottom: 0.45rem;
      page-break-after: avoid;
    }

    h3 {
      font-size: 9.3pt;
      font-weight: 700;
      color: #334155;
      margin-top: 0.75rem;
      margin-bottom: 0.3rem;
      page-break-after: avoid;
    }

    p {
      margin-bottom: 0.6rem;
      text-align: justify;
    }

    ul, ol {
      margin-left: 1.3rem;
      margin-bottom: 0.65rem;
    }

    li {
      margin-bottom: 0.25rem;
    }

    /* IMAGES */
    .img-figure {
      margin: 0.75rem 0 1rem 0;
      page-break-inside: avoid;
      text-align: center;
    }

    .img-frame {
      max-width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.04);
      display: block;
      margin: 0 auto;
    }

    .img-caption {
      font-size: 7.8pt;
      color: #64748b;
      font-style: italic;
      margin-top: 0.35rem;
      text-align: center;
    }

    /* TABLES */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 0.65rem 0 0.95rem 0;
      font-size: 8.2pt;
      page-break-inside: avoid;
    }

    th, td {
      border: 1px solid #cbd5e1;
      padding: 0.45rem 0.55rem;
      text-align: left;
      vertical-align: middle;
    }

    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #0f172a;
    }

    tr:nth-child(even) {
      background: #f8fafc;
    }

    /* BADGES */
    .badge {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      font-size: 7.2pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .badge-green { background: #dcfce7; color: #166534; }
    .badge-blue  { background: #e0f2fe; color: #0369a1; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-red   { background: #fee2e2; color: #991b1b; }
    .badge-purple{ background: #f3e8ff; color: #6b21a8; }

    /* CALLOUT BOXES */
    .callout {
      border-radius: 6px;
      padding: 0.75rem 0.95rem;
      margin: 0.8rem 0;
      font-size: 8.3pt;
      page-break-inside: avoid;
    }

    .callout-info {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      color: #1e3a8a;
    }

    .callout-tip {
      background: #f0fdf4;
      border-left: 4px solid #10b981;
      color: #064e3b;
    }

    .callout-warning {
      background: #fffbeb;
      border-left: 4px solid #f59e0b;
      color: #78350f;
    }

    .callout-title {
      font-weight: 800;
      font-size: 8.8pt;
      margin-bottom: 0.2rem;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    code, .mono {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 7.8pt;
      background: #f1f5f9;
      padding: 0.1rem 0.3rem;
      border-radius: 3px;
      color: #0f172a;
    }
  </style>
</head>
<body>

  <!-- ==================== PORTADA ==================== -->
  <div class="cover">
    <div>
      <span class="cover-badge">Documentación Oficial de Usuario • Versión 2.5</span>
      <h1 class="cover-title">Manual de Operación y Guía Visual de Usuario</h1>
      <p class="cover-subtitle">
        Wi-Fi &amp; Enterprise Telemetry Analyzer • Plataforma Integral de Cobertura RF, Handoffs de Roaming, Observabilidad de Aplicaciones y Auditoría Territorial.
      </p>

      <div class="cover-highlight-card">
        <h4>Propósito de esta Guía de Usuario</h4>
        <p>
          Este manual proporciona un recorrido visual y funcional exhaustivo por cada uno de los módulos de la aplicación. Con capturas de pantalla de alta fidelidad, se explica detalladamente la interacción con la barra de control persistente, el panel de telemetría en tiempo real, el analizador de espectro de radiofrecuencia y las siete pestañas de diagnóstico avanzado para recorridos de campo (walk-tests) y auditorías técnicas.
        </p>
      </div>

      <div class="cover-meta-grid">
        <div class="meta-box">
          <span>Plataforma Soportada</span>
          <strong>Microsoft Windows &amp; GNU/Linux</strong>
        </div>
        <div class="meta-box">
          <span>Dependencias Externas</span>
          <strong>0 Pip Dependencies (Python Puro)</strong>
        </div>
        <div class="meta-box">
          <span>Modo de Operación</span>
          <strong>100% Offline-Ready / Air-Gapped</strong>
        </div>
        <div class="meta-box">
          <span>Alcance de Diagnóstico</span>
          <strong>Capas 1, 2, 3, 4 y 7 (RF a HTTP)</strong>
        </div>
        <div class="meta-box">
          <span>Audiencia Objetivo</span>
          <strong>Soporte Nivel 1/2, Redes y TI</strong>
        </div>
        <div class="meta-box">
          <span>Edición / Versión</span>
          <strong>Noviembre 2026 • Release 4.0 Enterprise</strong>
        </div>
      </div>
    </div>

    <div class="cover-footer">
      <div>Sistema: <strong>Wi-Fi &amp; Enterprise Telemetry Analyzer</strong></div>
      <div>Arquitectura: <strong>Navegación por Barra Lateral &amp; Vistas Modulares</strong></div>
    </div>
  </div>

  <!-- ==================== PÁGINA 2: INTRODUCCIÓN Y ARQUITECTURA ==================== -->
  <div class="page-break"></div>

  <h1>1. Introducción y Modos de Puesta en Marcha</h1>
  <p>
    El <strong>Wi-Fi &amp; Enterprise Telemetry Analyzer</strong> es una plataforma de software de diagnóstico en tiempo real diseñada para ingenieros de campo, analistas de infraestructura y personal de soporte de TI. Su objetivo primordial es terminar con la incertidumbre operativa cuando los usuarios reportan que <em>"el Wi-Fi está lento o se cae"</em>, aislando con mediciones cuantitativas si el fallo reside en la antena (RF), en el switch/router local o en los servidores web/aplicaciones de la empresa.
  </p>

  <div class="callout callout-tip">
    <div class="callout-title">💡 Modelo de Aislamiento de Fallas en 3 Capas</div>
    <ul>
      <li><strong>Capa 1/2 (Radiofrecuencia &amp; Antena):</strong> Señal atenuada (&lt; -70 dBm), interferencia co-canal o saltos tardíos de antena (Sticky Clients).</li>
      <li><strong>Capa 3/4 (Red Local e Internet):</strong> Saturación de switches, pérdida de paquetes en el router principal (Gateway) o latencia del proveedor de Internet (ISP).</li>
      <li><strong>Capa 7 (Servidor &amp; Aplicación Web):</strong> El Wi-Fi y el router responden en 4 ms, pero el servidor de base de datos o el microservicio web tarda 3 segundos en procesar la consulta.</li>
    </ul>
  </div>

  <h2>1.1. Iniciar la Aplicación según el Sistema Operativo</h2>
  <p>
    La aplicación no requiere instalación de programas pesados, librerías externas (<span class="mono">pip</span>) ni emuladores. Puede ejecutarse de manera nativa en cualquier laptop, PDA industrial o estación de trabajo:
  </p>

  <table>
    <thead>
      <tr>
        <th>Sistema Operativo</th>
        <th>Comando o Método de Inicio</th>
        <th>Modo de Detención</th>
        <th>Notas de Operación</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Microsoft Windows</strong><br>(10 / 11 / Server)</td>
        <td>Doble clic en <span class="mono">run.bat</span><br>o en PowerShell: <span class="mono">.\\run.ps1</span></td>
        <td>Doble clic en <span class="mono">stop.bat</span><br>o pulsar <span class="mono">Ctrl + C</span></td>
        <td>Interactúa de forma nativa con <span class="mono">netsh</span>, <span class="mono">route</span> y <span class="mono">ping</span>. No requiere privilegios de Administrador.</td>
      </tr>
      <tr>
        <td><strong>GNU/Linux</strong><br>(Debian, Ubuntu, Fedora, Raspberry Pi)</td>
        <td>Terminal: <span class="mono">./run.sh</span></td>
        <td>Terminal: <span class="mono">./stop.sh</span><br>o pulsar <span class="mono">Ctrl + C</span></td>
        <td>Utiliza <span class="mono">nl80211</span> (<span class="mono">iw</span>), <span class="mono">/proc/net/route</span> y sockets de baja latencia.</td>
      </tr>
    </tbody>
  </table>

  <h2>1.2. Nueva Arquitectura: Barra Lateral Izquierda &amp; Workspace Modular</h2>
  <p>
    La versión 4.0 incorpora una arquitectura de interfaz tipo **Enterprise Suite**, organizada en tres componentes coordinados:
  </p>
  <ol>
    <li><strong>Barra Lateral Izquierda (Persistent Sidebar):</strong> Menú vertical que agrupa los módulos por categoría operativa: <em>Operación &amp; Telemetría</em>, <em>Gestión &amp; Auditoría</em> y <em>Sistema</em>. Cuenta con botón de contracción para modo compacto de iconos (76px) optimizado para pantallas panorámicas y laptops de campo.</li>
    <li><strong>Cabecera Superior Fija (Topbar):</strong> Indicador de migas de pan (*breadcrumb*) que muestra la sección activa en todo momento, más la barra de estado en vivo (SSID, BSSID, Ping Gateway, Latencia HTTP y estado de autenticación).</li>
    <li><strong>Área de Trabajo Modular (Workspace):</strong> Cada módulo se despliega a pantalla completa sin necesidad de scroll vertical infinito. El motor de telemetría y detección de handoffs continúa registrando muestras en segundo plano ininterrumpidamente.</li>
  </ol>

  <div class="img-figure">
    <img src="img/01_dashboard_general.png" class="img-frame" alt="Vista General del Dashboard">
    <div class="img-caption">Figura 1: Vista panorámica de la plataforma: Barra lateral izquierda, cabecera superior persistente y área de trabajo modular.</div>
  </div>

  <!-- ==================== PÁGINA 3: NAVEGACIÓN Y CABECERA ==================== -->
  <div class="page-break"></div>

  <h1>2. Barra Lateral Izquierda (Sidebar) y Cabecera Topbar</h1>
  <p>
    El acceso a todos los módulos se realiza de manera instantánea desde la barra lateral izquierda, manteniendo las métricas esenciales siempre a la vista en la cabecera:
  </p>

  <div style="display: grid; grid-template-columns: 240px 1fr; gap: 1rem; align-items: start; margin: 0.8rem 0;">
    <div class="img-figure" style="margin: 0;">
      <img src="img/01_sidebar_navegacion.png" class="img-frame" style="width: 100%;" alt="Barra Lateral de Navegación">
      <div class="img-caption">Figura 2: Barra lateral con grupos funcionales.</div>
    </div>
    <div>
      <h3>Grupos Funcionales de la Barra Lateral:</h3>
      <ul>
        <li><strong>Operación &amp; Telemetría:</strong>
          <ul>
            <li><span class="mono">Dashboard en Vivo:</span> Centro de mando principal con perfiles, métricas RF y gráfico temporal.</li>
            <li><span class="mono">Historial de Roaming:</span> Auditoría de saltos entre APs, variaciones dBm y veredictos.</li>
            <li><span class="mono">Escáner &amp; Espectro:</span> Analizador espectral de canales (2.4/5/6 GHz) y tabla de APs vecinos.</li>
            <li><span class="mono">Fases Latencia HTTP:</span> Desglose físico de Capa 7 (DNS, TCP, TLS, TTFB y Transfer).</li>
            <li><span class="mono">Diagnóstico de Red:</span> Traceroute visual y pings concurrentes a Gateway y DNS.</li>
          </ul>
        </li>
        <li><strong>Gestión &amp; Auditoría:</strong>
          <ul>
            <li><span class="mono">Sedes y Zonas:</span> Administración de sedes físicas y áreas operativas.</li>
            <li><span class="mono">Estadísticas &amp; Auditoría:</span> Percentiles P50/P90/P95/P99 y exportación ZIP probatorio.</li>
          </ul>
        </li>
        <li><strong>Sistema:</strong>
          <ul>
            <li><span class="mono">Configuración:</span> Parámetros de sondeo, umbrales y alias de APs.</li>
            <li><span class="mono">Ayuda &amp; Manuales:</span> Centro de documentación y visores PDF oficiales.</li>
          </ul>
        </li>
        <li><strong>Modo Compacto / Colapsable:</strong> Pulsa el botón <span class="mono">&#x25C4;&#x25C4;</span> en la cabecera del sidebar para reducir su ancho a 76px, maximizando el espacio para tablas y gráficos.</li>
      </ul>
    </div>
  </div>

  <h2>2.1. Cabecera Topbar y Badges en Tiempo Real</h2>
  <div class="img-figure">
    <img src="img/01_cabecera_badges.png" class="img-frame" alt="Cabecera y Badges">
    <div class="img-caption">Figura 3: Cabecera superior con indicador de módulo activo y badges de telemetría viva.</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Badge / Elemento</th>
        <th>Parámetro Monitoreado</th>
        <th>Interpretación Técnica</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><i class="mono">Módulo &gt; ...</i></td>
        <td><strong>Miga de Pan Activa</strong></td>
        <td>Indica la sección activa del workspace en todo momento con actualización reactiva al navegar.</td>
      </tr>
      <tr>
        <td><i class="mono">SSID</i></td>
        <td><strong>Red Wi-Fi Conectada</strong></td>
        <td>Nombre de la red empresarial a la que está asociada la tarjeta inalámbrica.</td>
      </tr>
      <tr>
        <td><i class="mono">BSSID (MAC)</i></td>
        <td><strong>Dirección Física del AP</strong></td>
        <td>MAC única del radio emisor del Access Point que atiende actualmente al cliente.</td>
      </tr>
      <tr>
        <td><i class="mono">Ping GW</i></td>
        <td><strong>Puerta de Enlace Local</strong></td>
        <td>Latencia ICMP RTT hacia el router/switch local (&lt; 10 ms = Excelente).</td>
      </tr>
      <tr>
        <td><i class="mono">HTTP: -- ms</i></td>
        <td><strong>Latencia de Aplicación</strong></td>
        <td>Tiempo de respuesta de Capa 7 hacia la URL objetivo configurada.</td>
      </tr>
      <tr>
        <td><i class="mono">Auth: Inactiva/OK</i></td>
        <td><strong>Autenticación Corporativa</strong></td>
        <td>Estado del esquema de seguridad de capa de aplicación (Bearer, NTLM o Basic).</td>
      </tr>
      <tr>
        <td><i class="mono">Ayuda &amp; Manuales</i></td>
        <td><strong>Acceso Rápido Documental</strong></td>
        <td>Acceso inmediato con un clic al Centro de Ayuda y visor de manuales sin importar la vista actual.</td>
      </tr>
    </tbody>
  </table>

  <!-- ==================== PÁGINA 4: DASHBOARD EN VIVO ==================== -->
  <div class="page-break"></div>

  <h1>3. Módulo 1: Dashboard en Vivo (Centro de Control)</h1>
  <p>
    El módulo principal reúne las herramientas de control contextual, las cuatro tarjetas de estado y el gráfico de telemetría sincronizada en una única vista compacta y sin desplazamientos forzados:
  </p>

  <h2>3.1. Barra de Control de Entorno y Ubicación</h2>
  <div class="img-figure">
    <img src="img/02_barra_control_perfiles.png" class="img-frame" alt="Barra de Control de Perfiles">
    <div class="img-caption">Figura 4: Barra de perfiles de entorno, botón de pausa EN VIVO, ubicación territorial y URL objetivo.</div>
  </div>

  <ul>
    <li><strong>Perfiles Rápidos:</strong> Ajusta en un clic los umbrales de alerta y endpoints sugeridos:
      <ul>
        <li><span class="badge badge-blue">Tienda / POS</span> Ajustado para cajas registradoras y transacciones comerciales.</li>
        <li><span class="badge badge-purple">Oficina</span> Optimizado para sedes administrativas, ERP, videollamadas y correo.</li>
        <li><span class="badge badge-amber">Bodega / CD</span> Configurado para terminales móviles PDA (WMS / SAP), pasillos y estanterías.</li>
        <li><span class="badge badge-green">Personalizado</span> Permite ingresar libremente cualquier URL y parámetros propios.</li>
      </ul>
    </li>
    <li><strong>Botón de Pausa <span class="badge badge-green">● EN VIVO</span> / <span class="badge badge-amber">● PAUSADO</span>:</strong> Pausa la recolección masiva de muestras mientras el técnico se traslada por zonas neutras o escaleras. <em>El detector de eventos de roaming continúa encendido en segundo plano.</em></li>
    <li><strong>Ubicación Activa (Sede y Zona):</strong> Asigna el etiquetado geográfico a todas las muestras registradas. El botón <span class="mono">+</span> permite añadir una zona rápida al vuelo.</li>
    <li><strong>URL Objetivo &amp; Botón Probar:</strong> Permite ingresar cualquier endpoint corporativo y disparar una sonda inmediata.</li>
  </ul>

  <h2>3.2. Tarjetas Principales de Métricas RF</h2>
  <div class="img-figure">
    <img src="img/03_tarjetas_metricas_rf.png" class="img-frame" alt="Tarjetas Principales de Métricas">
    <div class="img-caption">Figura 5: Cuadrícula de métricas: Score de Señal, AP Conectado, Salud de Aplicación y Diagnóstico de Roaming.</div>
  </div>

  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; margin: 0.8rem 0;">
    <div class="mini-card">
      <strong>Calidad de Señal Wi-Fi (Score / 100)</strong>
      <p>Puntaje integral (0-100) ponderando RSSI en dBm, estabilidad del ping y ausencia de pérdidas de paquetes. Indicador semafórico en verde, azul, ámbar o rojo con recomendación contextual.</p>
    </div>
    <div class="mini-card">
      <strong>Punto de Acceso (AP) Conectado</strong>
      <p>SSID, Nombre de AP corporativo, BSSID (MAC), Fabricante IEEE OUI, Canal y Frecuencia exacta en MHz, Tasa de transferencia negociada (TX/RX) y Puerta de enlace.</p>
    </div>
    <div class="mini-card">
      <strong>Salud de Aplicación (Capa 7 HTTP)</strong>
      <p>Latencia operativa activa (TTFB + Transfer), minicards de desglose por fases (DNS, TCP, TLS, TTFB) y tiempo total de conexión en frío con verificación criptográfica.</p>
    </div>
    <div class="mini-card">
      <strong>Diagnóstico de Roaming</strong>
      <p>Contador de handoffs acumulados, estado de cobertura de malla, cantidad de APs con el mismo SSID y botón para ráfaga inmediata de 5 pings.</p>
    </div>
  </div>

  <h2>3.3. Telemetría Sincronizada en Tiempo Real (Chart.js)</h2>
  <div class="img-figure">
    <img src="img/04_diagnostico_roaming_malla.png" class="img-frame" alt="Telemetría Sincronizada en Tiempo Real">
    <div class="img-caption">Figura 6: Gráfico sincrónico multieje con curvas continuas de potencia de señal (dBm), latencia HTTP (ms) y ping al Gateway.</div>
  </div>
  <p>
    Permite correlacionar de forma visual e inmediata si una caída en la potencia de la señal (curva cian) coincide exactamente con un pico de latencia en la aplicación (curva esmeralda) o si la latencia subió con señal perfecta (falla interna de servidor).
  </p>

  <!-- ==================== PÁGINA 5: ROAMING Y ESCÁNER ==================== -->
  <div class="page-break"></div>

  <h1>4. Módulo 2: Historial de Roaming &amp; Auditoría de Handoffs</h1>
  <p>
    Vista dedicada a pantalla completa para supervisar y auditar cada transición entre Access Points ocurrida durante un recorrido de campo (walk-test):
  </p>

  <div class="img-figure">
    <img src="img/06_tab_historial_roaming.png" class="img-frame" alt="Historial de Roaming">
    <div class="img-caption">Figura 7: Módulo 2 con registro cronológico de transiciones de AP, cálculo de variación de señal y veredicto de calidad.</div>
  </div>

  <h3>Veredictos Automáticos de Calidad de Salto:</h3>
  <p>
    En cada conmutación detectada, el analizador calcula la variación de potencia <strong>Δ dBm = Señal Nueva - Señal Anterior</strong> y califica el salto:
  </p>
  <ul>
    <li><span class="badge badge-green">Excelente Mejora (&ge; +10 dBm)</span> El cliente conmutó proactivamente a un AP mucho más cercano y potente.</li>
    <li><span class="badge badge-blue">Mejora Aceptable (+3 a +9 dBm)</span> Salto exitoso con incremento saludable de potencia.</li>
    <li><span class="badge badge-amber">Roaming Lateral (-2 a +2 dBm)</span> Transición entre antenas equidistantes (típico en pasillos largos o racks simétricos).</li>
    <li><span class="badge badge-red">Roaming Degradado (&le; -3 dBm)</span> Salto defectuoso hacia una antena más débil. Evidencia desbalance de potencia de transmisión (Tx Power) en la controladora.</li>
  </ul>
  <p>
    El botón <span class="mono">Descargar CSV Roaming</span> permite exportar la bitácora completa de eventos para adjuntarla como evidencia a los tickets de escalamiento a Redes.
  </p>

  <h1>5. Módulo 3: Escáner de APs Vecinos &amp; Analizador de Espectro RF</h1>
  <p>
    Este módulo fusiona en una única vista el análisis físico del espectro electromagnético junto con el catálogo de Access Points detectados en el aire:
  </p>

  <div class="img-figure">
    <img src="img/05_analizador_espectro_wifi.png" class="img-frame" alt="Analizador de Espectro Wi-Fi">
    <div class="img-caption">Figura 8: Diagrama parabólico de densidad espectral multicanal con soporte para bandas de 2.4 GHz, 5 GHz y 6/7 GHz (Wi-Fi 6E/7).</div>
  </div>

  <div class="img-figure" style="margin-top: 1rem;">
    <img src="img/07_tab_escaner_aps.png" class="img-frame" alt="Escáner de APs Vecinos">
    <div class="img-caption">Figura 9: Tabla detallada de puntos de acceso detectados con identificación de fabricante OUI, porcentaje de señal y candidatos de roaming.</div>
  </div>

  <ul>
    <li><strong>Curvas Parabólicas de Espectro:</strong> La altura de la curva refleja la potencia en dBm y el ancho representa el ancho del canal (20, 40, 80 o 160 MHz). Permite detectar solapamiento de canales y saturación.</li>
    <li><strong>Filtro Multibanda:</strong> Selector instantáneo para <span class="mono">2.4 GHz</span>, <span class="mono">5 GHz</span> y <span class="mono">6 GHz / 7 GHz</span> con contador de APs activos por banda.</li>
    <li><strong>Candidatos de Roaming [Mismo SSID]:</strong> Identifica con un distintivo cian las antenas de la red corporativa a las cuales la terminal puede saltar de forma automática.</li>
  </ul>

  <!-- ==================== PÁGINA 6: LATENCIA Y DIAGNÓSTICO ==================== -->
  <div class="page-break"></div>

  <h1>6. Módulo 4: Fases de Latencia HTTP (Capa 7)</h1>
  <p>
    Descompone con precisión de microsegundos cada etapa del ciclo de vida de una solicitud hacia el servidor web corporativo:
  </p>

  <div class="img-figure">
    <img src="img/08_tab_fases_latencia_http.png" class="img-frame" alt="Fases de Latencia HTTP">
    <div class="img-caption">Figura 10: Módulo 4 con tarjetas por fase de conexión, gráfico de cascada (waterfall) e historial cronológico de sondas.</div>
  </div>

  <h3>Las 5 Fases Físicas de Conexión:</h3>
  <ol>
    <li><strong>1. Resolución DNS:</strong> Tiempo en resolver el nombre de dominio a dirección IP. Valores mayores a 30 ms indican problemas en el servidor DNS corporativo.</li>
    <li><strong>2. Handshake TCP:</strong> Tiempo del saludo de 3 vías (SYN/ACK). Representa el retardo físico puro (RTT) del canal de radio y cableado.</li>
    <li><strong>3. Negociación TLS / SSL:</strong> Intercambio criptográfico y validación de certificados HTTPS.</li>
    <li><strong>4. Time to First Byte (TTFB):</strong> Tiempo de espera hasta recibir el primer byte del servidor. <em>Si el TCP es de 5 ms pero el TTFB es de 3,500 ms, la lentitud es 100% atribuible a la base de datos o lógica interna del servidor.</em></li>
    <li><strong>5. Transferencia de Contenido:</strong> Tiempo que toma la descarga completa del cuerpo de la respuesta por el socket.</li>
  </ol>

  <h1>7. Módulo 5: Diagnóstico de Red y Traceroute</h1>
  <p>
    Herramienta integrada para diagnóstico exhaustivo de la infraestructura de conmutación, enrutamiento y enlaces WAN:
  </p>

  <div class="img-figure">
    <img src="img/09_tab_diagnostico_red_traceroute.png" class="img-frame" alt="Diagnóstico de Red y Traceroute">
    <div class="img-caption">Figura 11: Módulo 5 con pruebas concurrentes de ping a múltiples nodos y tabla de saltos de Traceroute.</div>
  </div>

  <ul>
    <li><strong>Pings Concurrentes Multinodo:</strong> Prueba sincronizada contra la Puerta de Enlace (Gateway), Servidores DNS internos y el Servidor Aplicativo corporativo.</li>
    <li><strong>Traceroute Salto a Salto:</strong> Rastreo de la ruta completa de paquetes identificando la IP, el retardo y el porcentaje de pérdida en cada router intermedio para aislar si el fallo ocurre dentro del edificio o en el proveedor de Internet (ISP).</li>
    <li><strong>Histórico de Pruebas:</strong> Selector desplegable para comparar diagnósticos guardados antes y después de una incidencia.</li>
  </ul>

  <!-- ==================== PÁGINA 7: GESTIÓN Y AUDITORÍA ==================== -->
  <div class="page-break"></div>

  <h1>8. Módulo 6: Gestión de Sedes y Zonas (Walk-Tests)</h1>
  <p>
    Administrador centralizado de la jerarquía física corporativa para organizar los recorridos de campo:
  </p>

  <div class="img-figure">
    <img src="img/10_tab_sedes_zonas.png" class="img-frame" alt="Gestión de Sedes y Zonas">
    <div class="img-caption">Figura 12: Módulo 6 con tarjetas maestras de sedes, chips interactivos de zonas y botones de respaldo JSON/CSV.</div>
  </div>

  <ul>
    <li><strong>Catálogo Jerárquico:</strong> Tarjetas por sede (ej: <em>Tienda Principal</em>, <em>Bodega CLEN</em>, <em>Sede Administrativa</em>) con listado visual de zonas operativas.</li>
    <li><strong>Edición Rápida de Zonas:</strong> Chips interactivos con botón de eliminación individual (<span class="mono">&times;</span>) y modal de creación de sedes y zonas.</li>
    <li><strong>Recarga Limpia (<span class="mono">Recargar sedes_zonas.json</span>):</strong> Sincroniza limpiamente la memoria con el archivo de configuración en disco, eliminando sedes obsoletas sin mezclar datos antiguos.</li>
    <li><strong>Importación / Exportación:</strong> Permite compartir la matriz de sedes y zonas entre múltiples laptops de diagnóstico mediante archivos JSON y CSV.</li>
  </ul>

  <h1>9. Módulo 7: Estadísticas, Percentiles y Paquete ZIP</h1>
  <p>
    Panel analítico consolidado para emitir informes técnicos probatorios y carpetas de evidencia para la gerencia de TI:
  </p>

  <div class="img-figure">
    <img src="img/11_tab_estadisticas_auditoria.png" class="img-frame" alt="Estadísticas y Auditoría">
    <div class="img-caption">Figura 13: Módulo 7 con filtros temporales, percentiles P50/P90/P95/P99, exportación ZIP y compactación de base de datos.</div>
  </div>

  <ul>
    <li><strong>Filtros Combinados:</strong> Acota las estadísticas seleccionando Sede, Alcance territorial (<em>Todas las zonas / Recorrido Completo</em> o una zona específica) y Rango de Fechas (<em>Hoy</em>, <em>Últimos 7 días</em> o <em>Historial Completo</em>).</li>
    <li><strong>Percentiles Clave:</strong>
      <ul>
        <li><span class="mono">P50 (Mediana):</span> Tiempo habitual de respuesta del 50% de las transacciones.</li>
        <li><span class="mono">P95:</span> Desempeño bajo condiciones de carga o tráfico denso.</li>
        <li><span class="mono">P99:</span> El peor 1% de las transacciones. Es el indicador por excelencia para documentar microcortes y congelamientos reportados por los usuarios.</li>
      </ul>
    </li>
    <li><strong>Botón <span class="mono">Exportar Todo (.ZIP)</span>:</strong> Empaqueta en memoria cuatro archivos CSV completos (telemetría, roaming, escaneos y fases HTTP) más una ficha ejecutiva de texto.</li>
    <li><strong>Botón <span class="mono">Limpiar BD</span>:</strong> Vacía de forma segura los registros viejos antes de iniciar un nuevo recorrido, ejecutando un <span class="mono">VACUUM</span> inmediato en SQLite WAL.</li>
  </ul>

  <!-- ==================== PÁGINA 8: CONFIGURACIÓN Y PROTOCOLO ==================== -->
  <div class="page-break"></div>

  <h1>10. Módulo 8: Configuración Centralizada del Sistema</h1>
  <p>
    Consolida en un panel único todas las opciones avanzadas de hardware, red y seguridad:
  </p>

  <div class="img-figure">
    <img src="img/12_tab_configuracion_sistema.png" class="img-frame" alt="Configuración Centralizada">
    <div class="img-caption">Figura 14: Módulo 8 con selector de antena Wi-Fi, parámetros de sondeo, inventario de APs e IEEE OUI.</div>
  </div>

  <ul>
    <li><strong>Interfaz de Red Wi-Fi:</strong> Detecta automáticamente todas las tarjetas inalámbricas instaladas (<span class="mono">wlan0</span>, <span class="mono">Wi-Fi</span>, adaptadores USB) y permite conmutar en caliente la antena monitoreada.</li>
    <li><strong>Parámetros de Sonda:</strong> Intervalo de muestreo (segundos), timeout de peticiones HTTP, validación de certificados SSL y selector de pausa.</li>
    <li><strong>Inventario de Nombres de APs:</strong> Permite asociar direcciones MAC BSSID con los nombres oficiales de la controladora corporativa (Cisco, Aruba, Ruckus, Meraki).</li>
    <li><strong>Base de Datos IEEE OUI:</strong> Catálogo offline de más de 40,395 fabricantes con buscador reactivo y sincronización oficial en 1 clic desde el IEEE.</li>
    <li><strong>Autenticación de Capa 7:</strong> Soporte para <span class="mono">NTLMv1/v2</span> (criptografía nativa en Python puro), <span class="mono">Basic Auth</span> y <span class="mono">Bearer Token</span> con botón para validar credenciales en caliente (<span class="mono">Probar Credenciales Ahora</span>).</li>
  </ul>

  <h1>11. Módulo 9: Centro de Ayuda &amp; Manuales Integrados</h1>
  <p>
    Permite consultar en tiempo real toda la documentación oficial del sistema desde la propia interfaz web:
  </p>
  <ul>
    <li><strong>Manual de Soporte Nivel 1:</strong> Guía práctica rápida para técnicos en sitio y mesa de ayuda con diagramas de resolución de fallas en 3 minutos.</li>
    <li><strong>Manual Oficial Completo:</strong> Este documento técnico con la descripción exhaustiva de todas las métricas, APIs y arquitecturas de hardware.</li>
    <li><strong>Visor PDF Integrado &amp; Descarga Directa:</strong> Permite visualizar los documentos embebidos en el navegador o descargarlos para consulta fuera de línea en campo.</li>
  </ul>

  <h1>12. Metodología Recomendada para Recorridos de Campo (Walk-Tests)</h1>
  <ol>
    <li><strong>Antes de Iniciar:</strong>
      <ul>
        <li>Verificar en la barra superior o en el Dashboard la <strong>Sede</strong> donde se realizará la auditoría.</li>
        <li>Si se va a comenzar una jornada limpia, ir a <em>Estadísticas &amp; Auditoría</em> y pulsar <span class="mono">Limpiar BD</span>.</li>
        <li>Validar en <em>Configuración</em> las credenciales corporativas pulsando <span class="mono">Probar Credenciales Ahora</span>.</li>
      </ul>
    </li>
    <li><strong>Durante el Recorrido:</strong>
      <ul>
        <li>Caminar a velocidad constante atravesando los pasillos críticos, racks o cajas de atención.</li>
        <li>Al cruzar de un área a otra (ej: de <em>Pasillo Central</em> a <em>Despacho</em>), cambiar la <strong>Zona Activa</strong> en la barra de control del Dashboard.</li>
        <li>Si se debe pausar la captura al subir escaleras o cruzar zonas neutras, pulsar el botón <span class="badge badge-green">● EN VIVO</span> para pausar (<span class="badge badge-amber">● PAUSADO</span>) y reanudar al llegar al siguiente punto crítico.</li>
        <li>Revisar el módulo <em>Historial de Roaming</em> para verificar si los saltos de antena ocurren en el momento oportuno o si se presenta el síntoma de "cliente pegajoso".</li>
      </ul>
    </li>
    <li><strong>Al Finalizar:</strong>
      <ul>
        <li>Navegar en la barra lateral a <em>Estadísticas &amp; Auditoría</em>.</li>
        <li>Verificar los percentiles <span class="mono">P50</span>, <span class="mono">P95</span> y <span class="mono">P99</span> acumulados en la sesión.</li>
        <li>Pulsar <span class="mono">Exportar Todo (.ZIP)</span> para descargar el paquete de evidencia probatoria de la auditoría.</li>
      </ul>
    </li>
  </ol>

</body>
</html>
"""

def main():
    html_content = build_html()
    html_path = os.path.join(DOCS_DIR, "manual_usuario_completo.html")
    pdf_path = os.path.join(DOCS_DIR, "Manual_de_Usuario_WiFi_Roaming_Analyzer.pdf")
    static_pdf_path = os.path.join(STATIC_DIR, "Manual_de_Usuario_WiFi_Roaming_Analyzer.pdf")
    root_pdf_path = os.path.join(BASE_DIR, "Manual_de_Usuario_WiFi_Roaming_Analyzer.pdf")

    print("1. Guardando docs/manual_usuario_completo.html...")
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print("2. Compilando Manual_de_Usuario_WiFi_Roaming_Analyzer.pdf con Google Chrome headless...")
    cmd = [
        "google-chrome",
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        html_path
    ]
    subprocess.run(cmd, check=True)

    print("3. Replicando PDF en static/ y raíz del proyecto...")
    shutil.copy(pdf_path, static_pdf_path)
    shutil.copy(pdf_path, root_pdf_path)

    print("4. Verificando páginas del PDF generado...")
    res = subprocess.run(["pdfinfo", pdf_path], capture_output=True, text=True)
    for line in res.stdout.splitlines():
        if "Pages:" in line or "File size:" in line:
            print(f"  • {line}")

    print("\n¡Manual de usuario generado y compilado con éxito!")
    print(f"HTML: {html_path}")
    print(f"PDF : {pdf_path}")

if __name__ == "__main__":
    main()
