document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  // Header badges
  const headerSsid = document.getElementById('header-ssid');
  const headerBssid = document.getElementById('header-bssid');
  const headerPing = document.getElementById('header-ping');
  const headerAppLatency = document.getElementById('header-app-latency');
  const headerAppBadge = document.getElementById('header-app-badge');

  // Toolbar
  const selLocation = document.getElementById('sel-location');
  const selZone = document.getElementById('sel-zone');
  const btnQuickAddZone = document.getElementById('btn-quick-add-zone');
  const inputTargetUrl = document.getElementById('input-target-url');
  const btnApplyUrl = document.getElementById('btn-apply-url');
  const presetButtons = document.querySelectorAll('.preset-btn');

  // Card 1: Signal Gauge
  const gaugeFill = document.getElementById('gauge-fill');
  const gaugeScore = document.getElementById('gauge-score');
  const ratingPill = document.getElementById('rating-pill');
  const signalDbmPill = document.getElementById('signal-dbm-pill');
  const ratingRecommendation = document.getElementById('rating-recommendation');

  // Card 2: Connected AP
  const bandBadge = document.getElementById('band-badge');
  const infoSsid = document.getElementById('info-ssid');
  const infoApName = document.getElementById('info-ap-name');
  const infoBssid = document.getElementById('info-bssid');
  const infoVendor = document.getElementById('info-vendor');
  const infoChanFreq = document.getElementById('info-chan-freq');
  const infoBitrate = document.getElementById('info-bitrate');
  const infoIpGw = document.getElementById('info-ip-gw');

  // Card 3: Application Health & HTTP
  const appStatusBadge = document.getElementById('app-status-badge');
  const appLatencyVal = document.getElementById('app-latency-val');
  const phaseDnsVal = document.getElementById('phase-dns-val');
  const phaseTcpVal = document.getElementById('phase-tcp-val');
  const phaseTlsVal = document.getElementById('phase-tls-val');
  const phaseTtfbVal = document.getElementById('phase-ttfb-val');
  const infoColdTotal = document.getElementById('info-cold-total');
  const infoTargetUrl = document.getElementById('info-target-url');

  // Card 4: Roaming & Mesh
  const roamingCountBadge = document.getElementById('roaming-count-badge');
  const roamingVerdict = document.getElementById('roaming-verdict');
  const infoSameSsidCount = document.getElementById('info-same-ssid-count');
  const infoTotalApsCount = document.getElementById('info-total-aps-count');
  const btnTestRoaming = document.getElementById('btn-test-roaming');
  const btnExportQuick = document.getElementById('btn-export-quick');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Tab 1: Roaming
  const roamingTableBody = document.getElementById('roaming-table-body');
  const btnExportRoamingCsv = document.getElementById('btn-export-roaming-csv');
  const btnClearRoamingLog = document.getElementById('btn-clear-roaming-log');

  // Tab 2: HTTP Phases
  const phasesTargetLabel = document.getElementById('phases-target-label');
  const cardDnsVal = document.getElementById('card-dns-val');
  const cardTcpVal = document.getElementById('card-tcp-val');
  const cardTlsVal = document.getElementById('card-tls-val');
  const cardTtfbVal = document.getElementById('card-ttfb-val');
  const cardTransVal = document.getElementById('card-trans-val');
  const btnManualProbe = document.getElementById('btn-manual-probe');

  // Tab 3: Network Diagnostics
  const btnRunDiag = document.getElementById('btn-run-diag');
  const diagResultsContainer = document.getElementById('diag-results-container');

  // Tab 4: AP Scanner
  const apScannerTableBody = document.getElementById('ap-scanner-table-body');

  // Tab 5: Sedes & Zonas
  const btnSyncSedesJson = document.getElementById('btn-sync-sedes-json');
  const btnAddSedeModal = document.getElementById('btn-add-sede-modal');
  const sedesCardsContainer = document.getElementById('sedes-cards-container');

  // Tab 6: Statistics
  const btnExportTelemetryCsv = document.getElementById('btn-export-telemetry-csv');
  const statTotalSamples = document.getElementById('stat-total-samples');
  const statUptimePct = document.getElementById('stat-uptime-pct');
  const statP50 = document.getElementById('stat-p50');
  const statP95 = document.getElementById('stat-p95');
  const statP99 = document.getElementById('stat-p99');
  const statJitter = document.getElementById('stat-jitter');
  const statAvgDbm = document.getElementById('stat-avg-dbm');
  const statRoamingCount = document.getElementById('stat-roaming-count');

  // Tab 7: Configuration
  const cfgWifiInterface = document.getElementById('cfg-wifi-interface');
  const btnSaveInterface = document.getElementById('btn-save-interface');
  const cfgProbeInterval = document.getElementById('cfg-probe-interval');
  const cfgProbeTimeout = document.getElementById('cfg-probe-timeout');
  const cfgVerifySsl = document.getElementById('cfg-verify-ssl');
  const cfgExtraPing = document.getElementById('cfg-extra-ping');
  const btnSaveConfigGeneral = document.getElementById('btn-save-config-general');
  const inputNewBssid = document.getElementById('input-new-bssid');
  const inputNewApname = document.getElementById('input-new-apname');
  const btnAddApname = document.getElementById('btn-add-apname');
  const apNamesTableBody = document.getElementById('ap-names-table-body');

  // --- Local State ---
  let presetsData = {};
  let locationsData = [];
  let zonesByLocation = {};
  let currentPreset = 'store';
  let isProbing = false;

  // --- Chart 1: Synchronized Telemetry Line Chart ---
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  const maxDataPoints = 40;
  const timeLabels = [];
  const signalData = [];
  const appLatencyData = [];
  const pingData = [];

  const telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [
        {
          label: 'Señal Wi-Fi (dBm)',
          data: signalData,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          borderWidth: 2.2,
          tension: 0.3,
          fill: true,
          yAxisID: 'ySignal'
        },
        {
          label: 'App HTTP (ms)',
          data: appLatencyData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          borderWidth: 2.2,
          tension: 0.25,
          fill: false,
          yAxisID: 'yLatency'
        },
        {
          label: 'Ping Gateway (ms)',
          data: pingData,
          borderColor: '#8b5cf6',
          backgroundColor: 'transparent',
          borderWidth: 1.8,
          borderDash: [4, 4],
          tension: 0.2,
          fill: false,
          yAxisID: 'yLatency'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: false // Using custom badges in header
        },
        tooltip: {
          backgroundColor: 'rgba(11, 15, 25, 0.95)',
          titleFont: { family: 'Outfit', size: 13 },
          bodyFont: { family: 'Outfit', size: 12 },
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b', maxTicksLimit: 10, font: { family: 'Outfit' } }
        },
        ySignal: {
          type: 'linear',
          position: 'left',
          min: -100,
          max: -20,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#06b6d4', callback: (val) => `${val} dBm`, font: { family: 'Outfit' } },
          title: { display: true, text: 'Intensidad RF (dBm)', color: '#06b6d4', font: { family: 'Outfit', weight: 'bold' } }
        },
        yLatency: {
          type: 'linear',
          position: 'right',
          min: 0,
          suggestedMax: 300,
          grid: { drawOnChartArea: false },
          ticks: { color: '#10b981', callback: (val) => `${val} ms`, font: { family: 'Outfit' } },
          title: { display: true, text: 'Latencia (ms)', color: '#10b981', font: { family: 'Outfit', weight: 'bold' } }
        }
      }
    }
  });

  // --- Chart 2: Stacked Phases Horizontal Bar Chart ---
  const ctxPhases = document.getElementById('phasesChart').getContext('2d');
  const phasesChart = new Chart(ctxPhases, {
    type: 'bar',
    data: {
      labels: ['Fases de Conexión HTTP'],
      datasets: [
        { label: 'DNS', data: [0], backgroundColor: '#38bdf8' },
        { label: 'TCP Handshake', data: [0], backgroundColor: '#818cf8' },
        { label: 'TLS Handshake', data: [0], backgroundColor: '#c084fc' },
        { label: 'TTFB (Espera)', data: [0], backgroundColor: '#34d399' },
        { label: 'Transferencia', data: [0], backgroundColor: '#fbbf24' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 }, boxWidth: 14 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} ms`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', callback: (val) => `${val} ms` }
        },
        y: {
          stacked: true,
          display: false
        }
      }
    }
  });

  // --- Gauge Animation ---
  function updateGauge(score, color) {
    gaugeScore.textContent = score;
    const circumference = 440;
    const offset = circumference - (circumference * score / 100);
    gaugeFill.style.strokeDashoffset = offset;
    gaugeFill.style.stroke = color;
  }

  // --- Recommendations ---
  function getRecommendationText(score, dbm, pingMs, appMs) {
    if (appMs !== null && appMs > 400 && dbm >= -65) {
      return "⚠️ Señal Wi-Fi excelente pero latencia HTTP elevada. La demora no proviene del enlace inalámbrico; investiga el servidor, DNS o enlace WAN.";
    }
    if (dbm >= -50) {
      return "📶 Excelente intensidad de señal. Cobertura y estabilidad ideales para cajas POS, terminales PDA y videollamadas fluidas.";
    } else if (dbm >= -60) {
      return "🟢 Muy buena calidad de enlace inalámbrico. Conexión rápida y sin interferencias apreciables.";
    } else if (dbm >= -70) {
      return "🟣 Calidad de señal aceptable. Operación normal, pero con menor margen de tolerancia ante movimiento.";
    } else if (dbm >= -80) {
      return "🟡 Señal débil. Riesgo de desconexiones o congelamiento al desplazarse entre áreas.";
    } else {
      return "🔴 Cobertura crítica. La potencia es insuficiente. Se recomienda acercarse a un AP o instalar un repetidor/nodo mesh.";
    }
  }

  // --- Tab Navigation ---
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) {
        target.classList.add('active');
        if (btn.dataset.tab === 'tab-stats') loadStatistics();
        if (btn.dataset.tab === 'tab-sedes-zonas') loadSedesAndZones();
        if (btn.dataset.tab === 'tab-config') loadConfigView();
        if (btn.dataset.tab === 'tab-roaming-log') loadRoamingHistory();
      }
    });
  });

  // --- Presets Handling ---
  async function loadPresets() {
    try {
      const res = await fetch('/api/presets');
      presetsData = await res.json();
    } catch (e) {
      console.warn("Error cargando presets:", e);
    }
  }

  presetButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const presetId = btn.dataset.preset;
      currentPreset = presetId;
      const preset = presetsData[presetId];
      if (preset) {
        inputTargetUrl.value = preset.default_target_url;
        await saveConfig({
          active_preset: presetId,
          target_url: preset.default_target_url,
          location_name: preset.default_location,
          current_zone: preset.default_zone
        });
        await loadLocationsAndZones();
      }
    });
  });

  // --- Locations & Zones Handling ---
  async function loadLocationsAndZones() {
    try {
      const [resLocs, resZones, resCfg] = await Promise.all([
        fetch('/api/locations'),
        fetch('/api/zones'),
        fetch('/api/config')
      ]);
      const dataLocs = await resLocs.json();
      zonesByLocation = await resZones.json();
      const cfg = await resCfg.json();

      locationsData = dataLocs.locations || [];
      const currentLoc = cfg.location_name || locationsData[0] || 'Tienda_Principal';
      const currentZone = cfg.current_zone || '';

      // Populate Locations dropdown
      selLocation.innerHTML = '';
      locationsData.forEach(loc => {
        const opt = document.createElement('option');
        opt.value = loc;
        opt.textContent = loc.replace(/_/g, ' ');
        if (loc === currentLoc) opt.selected = true;
        selLocation.appendChild(opt);
      });

      // Populate Zones dropdown
      populateZones(currentLoc, currentZone);

      // Set input values
      if (cfg.target_url) inputTargetUrl.value = cfg.target_url;
      if (cfg.active_preset) {
        presetButtons.forEach(b => {
          if (b.dataset.preset === cfg.active_preset) b.classList.add('active');
          else b.classList.remove('active');
        });
      }
    } catch (e) {
      console.error("Error cargando sedes y zonas:", e);
    }
  }

  function populateZones(loc, selectedZone = '') {
    selZone.innerHTML = '';
    const zones = zonesByLocation[loc] || [];
    if (zones.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '(Sin zonas definidas)';
      selZone.appendChild(opt);
      return;
    }
    zones.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z;
      opt.textContent = z;
      if (z === selectedZone) opt.selected = true;
      selZone.appendChild(opt);
    });
  }

  selLocation.addEventListener('change', async () => {
    const loc = selLocation.value;
    populateZones(loc);
    const z = selZone.value;
    await saveConfig({ location_name: loc, current_zone: z });
    loadStatistics();
  });

  selZone.addEventListener('change', async () => {
    const loc = selLocation.value;
    const z = selZone.value;
    await saveConfig({ location_name: loc, current_zone: z });
    loadStatistics();
  });

  btnQuickAddZone.addEventListener('click', async () => {
    const loc = selLocation.value;
    const newZone = prompt(`Añadir nueva zona a "${loc}":\n(Ej: Caja 5, Muelle 8, Sala B)`);
    if (newZone && newZone.trim()) {
      try {
        await fetch('/api/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: loc, zone: newZone.trim() })
        });
        await loadLocationsAndZones();
      } catch (e) {
        alert("Error al agregar zona: " + e);
      }
    }
  });

  btnApplyUrl.addEventListener('click', async () => {
    const url = inputTargetUrl.value.trim();
    if (!url) return;
    btnApplyUrl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    btnApplyUrl.disabled = true;
    try {
      await saveConfig({ target_url: url });
      const res = await fetch('/api/probe/now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url })
      });
      const data = await res.json();
      updateAppCard(data);
    } catch (e) {
      alert("Error probando URL: " + e);
    } finally {
      btnApplyUrl.innerHTML = '<i class="fa-solid fa-play"></i> Probar';
      btnApplyUrl.disabled = false;
    }
  });

  async function saveConfig(updates) {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error("Error guardando config:", e);
    }
  }

  // --- Main Status Update Loop ---
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const data = await res.json();
      updateDashboard(data);
    } catch (e) {
      // Offline or server reloading
    }
  }

  function updateDashboard(data) {
    // 1. Header Badges
    headerSsid.textContent = data.ssid || 'Desconectado';
    headerBssid.textContent = data.bssid || '--:--:--:--:--:--';
    headerPing.textContent = data.ping_ms !== null ? `${data.ping_ms} ms` : 'Timeout';

    if (data.app_latency_ms !== null && data.app_latency_ms !== undefined) {
      if (data.app_is_error) {
        headerAppLatency.textContent = `HTTP: Fallo (${data.app_error_message || 'Error'})`;
        headerAppBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        headerAppBadge.style.color = '#ef4444';
      } else {
        headerAppLatency.textContent = `HTTP: ${data.app_latency_ms} ms (${data.app_status_code || 200})`;
        headerAppBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        headerAppBadge.style.color = '#10b981';
      }
    } else {
      headerAppLatency.textContent = 'HTTP: Sonda inactiva';
    }

    // 2. Card 1: Gauge & Signal
    updateGauge(data.rating_score, data.rating_color);
    signalDbmPill.textContent = `${data.signal_dbm} dBm (${data.signal_pct}%)`;
    ratingPill.textContent = data.rating_text;
    ratingPill.style.background = data.rating_color;
    ratingRecommendation.textContent = getRecommendationText(data.rating_score, data.signal_dbm, data.ping_ms, data.app_latency_ms);

    // 3. Card 2: Connected AP
    bandBadge.textContent = data.band || '-- GHz';
    infoSsid.textContent = data.ssid || 'No conectado';
    infoApName.textContent = data.ap_name || '(Sin alias registrado)';
    infoBssid.textContent = data.bssid || '--:--:--:--:--:--';
    infoVendor.textContent = data.vendor_name || 'Desconocido';
    infoChanFreq.textContent = data.channel ? `Canal ${data.channel} (${data.frequency_mhz} MHz)` : '--';
    infoBitrate.textContent = `${data.tx_bitrate} / ${data.rx_bitrate}`;
    infoIpGw.textContent = `${data.ip_address} / ${data.gateway_ip}`;

    // 4. Card 3: Application Health
    updateAppCard(data);

    // 5. Card 4: Roaming & Mesh
    roamingCountBadge.textContent = `${data.recent_roaming_count || 0} Handoffs`;
    roamingVerdict.textContent = data.roaming_verdict || 'Monitoreando...';
    infoSameSsidCount.textContent = `${data.same_ssid_aps_count || 0} APs`;
    infoTotalApsCount.textContent = `${data.total_neighbor_aps || 0} APs`;

    // 6. Update Synchronized Chart
    const nowStr = data.last_update || new Date().toLocaleTimeString();
    timeLabels.push(nowStr);
    signalData.push(data.signal_dbm);
    pingData.push(data.ping_ms !== null ? data.ping_ms : null);
    appLatencyData.push(data.app_latency_ms !== null && !data.app_is_error ? data.app_latency_ms : null);

    if (timeLabels.length > maxDataPoints) {
      timeLabels.shift();
      signalData.shift();
      pingData.shift();
      appLatencyData.shift();
    }
    telemetryChart.update();
  }

  function updateAppCard(data) {
    if (data.target_url) {
      infoTargetUrl.textContent = data.target_url;
      phasesTargetLabel.textContent = data.target_url;
    }

    if (data.app_latency_ms !== null && data.app_latency_ms !== undefined) {
      appLatencyVal.innerHTML = `${data.app_latency_ms} <small>ms</small>`;
      if (data.app_is_error) {
        appStatusBadge.textContent = `Error: ${data.app_error_message || 'Fallo'}`;
        appStatusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        appStatusBadge.style.color = '#ef4444';
      } else {
        appStatusBadge.textContent = `HTTP ${data.app_status_code || 200} OK`;
        appStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        appStatusBadge.style.color = '#10b981';
      }

      phaseDnsVal.textContent = `${data.app_dns_ms || 0} ms`;
      phaseTcpVal.textContent = `${data.app_tcp_ms || 0} ms`;
      phaseTlsVal.textContent = `${data.app_tls_ms || 0} ms`;
      phaseTtfbVal.textContent = `${data.app_ttfb_ms || 0} ms`;
      infoColdTotal.textContent = `${data.app_cold_total_ms || 0} ms`;

      // Update Phase Tab Values
      cardDnsVal.textContent = `${data.app_dns_ms || 0} ms`;
      cardTcpVal.textContent = `${data.app_tcp_ms || 0} ms`;
      cardTlsVal.textContent = `${data.app_tls_ms || 0} ms`;
      cardTtfbVal.textContent = `${data.app_ttfb_ms || 0} ms`;
      cardTransVal.textContent = `${data.app_transfer_ms || 0} ms`;

      // Update Phases Chart
      phasesChart.data.datasets[0].data = [data.app_dns_ms || 0];
      phasesChart.data.datasets[1].data = [data.app_tcp_ms || 0];
      phasesChart.data.datasets[2].data = [data.app_tls_ms || 0];
      phasesChart.data.datasets[3].data = [data.app_ttfb_ms || 0];
      phasesChart.data.datasets[4].data = [data.app_transfer_ms || 0];
      phasesChart.update();
    }
  }

  // --- Tab 1: Roaming Log ---
  async function loadRoamingHistory() {
    try {
      const loc = selLocation.value;
      const zone = selZone.value;
      const res = await fetch(`/api/roaming-history?location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`);
      const data = await res.json();
      const events = data.events || [];

      if (events.length === 0) {
        roamingTableBody.innerHTML = `
          <tr>
            <td colspan="8">
              <div class="empty-state">
                <i class="fa-solid fa-route"></i>
                <p>No se han registrado eventos de cambio de AP aún en ${loc}.</p>
                <small>Camina entre diferentes áreas con la laptop o PDA para provocar transiciones de roaming.</small>
              </div>
            </td>
          </tr>`;
        return;
      }

      roamingTableBody.innerHTML = events.map(e => `
        <tr>
          <td><strong style="color: var(--accent-cyan);">${e.time || e.timestamp}</strong></td>
          <td><span class="badge" style="font-size: 0.75rem;">${e.location || 'Sede'} - ${e.zone || 'Zona'}</span></td>
          <td>${e.ssid || '--'}</td>
          <td>
            <div class="ap-cell">
              ${e.prev_ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${e.prev_ap_name}</span>` : ''}
              <span class="mac-subtext">${e.prev_bssid || '--'}</span>
              <small style="color: var(--text-muted);">${e.prev_signal_dbm || '--'} dBm</small>
            </div>
          </td>
          <td>
            <div class="ap-cell">
              ${e.new_ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${e.new_ap_name}</span>` : ''}
              <span class="mac-subtext">${e.new_bssid || '--'}</span>
              <small style="color: var(--accent-emerald);">${e.new_signal_dbm || '--'} dBm</small>
            </div>
          </td>
          <td>
            <span class="badge" style="background: ${(e.delta_dbm >= 0) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${(e.delta_dbm >= 0) ? '#10b981' : '#ef4444'};">
              ${e.delta_dbm > 0 ? '+' : ''}${e.delta_dbm} dBm
            </span>
          </td>
          <td>
            <strong style="color: var(--text-primary);">${e.app_latency_ms ? `${e.app_latency_ms} ms` : (e.gw_ping_ms ? `Ping ${e.gw_ping_ms} ms` : '--')}</strong>
          </td>
          <td>
            <span class="badge" style="background: rgba(6, 182, 212, 0.12); color: var(--accent-cyan);">
              ${e.verdict || 'Handoff'}
            </span>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.error("Error cargando historial de roaming:", e);
    }
  }

  btnExportRoamingCsv.addEventListener('click', () => {
    const loc = selLocation.value;
    const zone = selZone.value;
    window.location.href = `/api/export?type=roaming&location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`;
  });

  btnClearRoamingLog.addEventListener('click', async () => {
    if (confirm("¿Estás seguro de limpiar el registro de eventos de roaming?")) {
      await fetch('/api/clear-roaming-log', { method: 'POST' });
      loadRoamingHistory();
    }
  });

  // --- Tab 2: Manual Probe Trigger ---
  btnManualProbe.addEventListener('click', async () => {
    btnManualProbe.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Midiendo...';
    btnManualProbe.disabled = true;
    try {
      const res = await fetch('/api/probe/now', { method: 'POST' });
      const data = await res.json();
      updateAppCard(data);
    } catch (e) {
      alert("Error en medición: " + e);
    } finally {
      btnManualProbe.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Medir Ahora';
      btnManualProbe.disabled = false;
    }
  });

  // --- Tab 3: Network Diagnostics ---
  btnRunDiag.addEventListener('click', async () => {
    btnRunDiag.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ejecutando Diagnóstico (Traceroute)...';
    btnRunDiag.disabled = true;
    diagResultsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Realizando pings paralelos y trazando saltos hacia Puerta de Enlace, DNS y Servidor...</p>
        <small>Esto puede tomar entre 5 y 15 segundos dependiendo de la cantidad de saltos.</small>
      </div>`;

    try {
      const res = await fetch('/api/net-diag/run', { method: 'POST' });
      const data = await res.json();
      renderDiagResults(data.results || []);
    } catch (e) {
      diagResultsContainer.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation" style="color: var(--accent-rose);"></i><p>Error ejecutando diagnóstico: ${e}</p></div>`;
    } finally {
      btnRunDiag.innerHTML = '<i class="fa-solid fa-microscope"></i> Ejecutar Diagnóstico Completo';
      btnRunDiag.disabled = false;
    }
  });

  function renderDiagResults(targets) {
    if (!targets || targets.length === 0) {
      diagResultsContainer.innerHTML = `<div class="empty-state"><p>No se obtuvieron resultados del diagnóstico.</p></div>`;
      return;
    }

    diagResultsContainer.innerHTML = targets.map(t => {
      const ping = t.ping || {};
      const trace = t.traceroute || {};
      const hops = trace.hops || [];
      const statusOk = t.status === 'ok';

      return `
        <div class="diag-target-card">
          <div class="diag-target-header">
            <div>
              <strong style="font-size: 1.05rem; color: ${statusOk ? 'var(--accent-emerald)' : 'var(--accent-rose)'};">
                <i class="fa-solid ${t.type === 'gateway' ? 'fa-network-wired' : (t.type === 'dns' ? 'fa-server' : 'fa-bullseye')}"></i>
                ${t.name}
              </strong>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${t.host}</div>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <span class="badge" style="background: ${ping.loss_pct === 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; color: ${ping.loss_pct === 0 ? '#10b981' : '#ef4444'};">
                Ping: ${ping.avg_ms !== undefined ? `${ping.avg_ms} ms` : '--'} (Pérdida: ${ping.loss_pct}%)
              </span>
              <span class="badge" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan);">
                Saltos: ${hops.length}
              </span>
            </div>
          </div>

          ${hops.length > 0 ? `
            <div class="table-responsive">
              <table class="diag-hops-table">
                <thead>
                  <tr>
                    <th>Salto #</th>
                    <th>Dirección IP / Host</th>
                    <th>RTT (ms)</th>
                    <th>Pérdida</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  ${hops.map(h => `
                    <tr>
                      <td><strong>#${h.hop}</strong></td>
                      <td style="font-family: monospace;">${h.ip}</td>
                      <td>${h.rtt_ms !== null ? `${h.rtt_ms} ms` : '* * *'}</td>
                      <td>${h.loss_pct}%</td>
                      <td>
                        <span class="hop-pill ${h.status === 'ok' ? 'hop-pill-ok' : 'hop-pill-timeout'}">
                          ${h.status === 'ok' ? 'OK' : 'TIMEOUT'}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.5rem;">Traceroute directo o sin saltos intermedios.</p>'}
        </div>
      `;
    }).join('');
  }

  // --- Tab 4: AP Candidate Scanner ---
  async function loadApScanner() {
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      const aps = data.aps || [];

      if (aps.length === 0) {
        apScannerTableBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>No se encontraron APs vecinos.</p></div></td></tr>`;
        return;
      }

      apScannerTableBody.innerHTML = aps.map(ap => `
        <tr style="${ap.active ? 'background: rgba(6, 182, 212, 0.08);' : ''}">
          <td>
            ${ap.active ? '<span class="badge" style="background: var(--accent-emerald); color: #fff;">CONECTADO</span>' : '<span style="color: var(--text-muted); font-size: 0.78rem;">En rango</span>'}
          </td>
          <td><strong>${ap.ssid || 'Oculto'}</strong></td>
          <td>
            <div class="ap-cell">
              ${ap.ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${ap.ap_name}</span>` : ''}
              <span class="mac-subtext">${ap.bssid}</span>
            </div>
          </td>
          <td>${ap.vendor || 'Desconocido'}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-weight: 700; color: ${ap.signal >= 70 ? 'var(--accent-emerald)' : (ap.signal >= 45 ? 'var(--accent-amber)' : 'var(--accent-rose)')};">
                ${ap.signal}%
              </span>
            </div>
          </td>
          <td>${ap.freq || ap.band || '--'}</td>
          <td>Canal ${ap.channel || '--'}</td>
          <td>
            ${ap.is_same_ssid && !ap.active ? '<span class="badge" style="background: rgba(6, 182, 212, 0.2); color: var(--accent-cyan); font-weight: bold;">CANDIDATO ROAMING</span>' : (ap.active ? '<span style="color: var(--accent-emerald); font-size: 0.8rem;">AP Actual</span>' : '<span style="color: var(--text-muted); font-size: 0.78rem;">Otro SSID</span>')}
          </td>
        </tr>
      `).join('');
    } catch (e) {
      console.warn("Error escaneando APs:", e);
    }
  }

  // --- Tab 5: Sedes & Zonas Manager ---
  async function loadSedesAndZones() {
    try {
      const [resLocs, resZones] = await Promise.all([
        fetch('/api/locations'),
        fetch('/api/zones')
      ]);
      const dataLocs = await resLocs.json();
      const zonesMap = await resZones.json();

      const locs = dataLocs.locations || [];
      sedesCardsContainer.innerHTML = locs.map(l => {
        const zones = zonesMap[l] || [];
        return `
          <div class="sede-card">
            <div class="sede-card-header">
              <div class="sede-card-title">
                <i class="fa-solid fa-building"></i> ${l.replace(/_/g, ' ')}
              </div>
              <button class="btn-icon-danger" onclick="deleteSede('${l}')" title="Eliminar Sede"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="zone-chips-container">
              ${zones.map(z => `<span class="zone-chip">${z}</span>`).join('')}
              <button class="zone-chip" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan); border-color: var(--accent-cyan); cursor: pointer;" onclick="promptAddZone('${l}')">
                <i class="fa-solid fa-plus"></i> Añadir Zona
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error("Error cargando gestor de sedes:", e);
    }
  }

  window.promptAddZone = async function(loc) {
    const newZ = prompt(`Añadir zona a ${loc}:`);
    if (newZ && newZ.trim()) {
      await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc, zone: newZ.trim() })
      });
      loadSedesAndZones();
      loadLocationsAndZones();
    }
  };

  window.deleteSede = async function(loc) {
    if (confirm(`¿Eliminar la sede "${loc}" y sus zonas?`)) {
      await fetch('/api/locations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc })
      });
      loadSedesAndZones();
      loadLocationsAndZones();
    }
  };

  btnAddSedeModal.addEventListener('click', async () => {
    const newLoc = prompt("Nombre de la nueva Sede:\n(Ej: Tienda_102_Unicentro, Bodega_Norte, Sede_Cali)");
    if (newLoc && newLoc.trim()) {
      const locClean = newLoc.trim().replace(/\s+/g, '_');
      await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: locClean, zone: 'Zona General' })
      });
      loadSedesAndZones();
      loadLocationsAndZones();
    }
  });

  btnSyncSedesJson.addEventListener('click', async () => {
    await fetch('/api/locations/sync', { method: 'POST' });
    loadSedesAndZones();
    loadLocationsAndZones();
    alert("Sedes y Zonas sincronizadas desde sedes_zonas.json");
  });

  // --- Tab 6: Statistics ---
  async function loadStatistics() {
    try {
      const loc = selLocation.value;
      const zone = selZone.value;
      const res = await fetch(`/api/stats?location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`);
      const s = await res.json();

      statTotalSamples.textContent = s.total_samples || 0;
      statUptimePct.textContent = `${s.uptime_percentage || 100}%`;
      statP50.textContent = `${s.percentiles?.p50 || 0} ms`;
      statP95.textContent = `${s.percentiles?.p95 || 0} ms`;
      statP99.textContent = `${s.percentiles?.p99 || 0} ms`;
      statJitter.textContent = `${s.jitter || 0} ms`;
      statAvgDbm.textContent = s.averages?.signal_dbm ? `${s.averages.signal_dbm} dBm` : '--';
      statRoamingCount.textContent = s.roaming_count || 0;
    } catch (e) {
      console.error("Error cargando estadísticas:", e);
    }
  }

  btnExportTelemetryCsv.addEventListener('click', () => {
    const loc = selLocation.value;
    const zone = selZone.value;
    window.location.href = `/api/export?type=telemetry&location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`;
  });

  btnExportQuick.addEventListener('click', () => {
    const loc = selLocation.value;
    const zone = selZone.value;
    window.location.href = `/api/export?type=telemetry&location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`;
  });

  // --- Tab 7: Configuration & AP Names ---
  async function loadConfigView() {
    try {
      const [resCfg, resIfaces, resAps] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/interfaces'),
        fetch('/api/ap-names')
      ]);
      const cfg = await resCfg.json();
      const ifaces = await resIfaces.json();
      const aps = await resAps.json();

      // Interfaces dropdown
      cfgWifiInterface.innerHTML = '';
      (ifaces.available || []).forEach(iface => {
        const opt = document.createElement('option');
        opt.value = iface;
        opt.textContent = iface;
        if (iface === ifaces.current) opt.selected = true;
        cfgWifiInterface.appendChild(opt);
      });

      // Config inputs
      cfgProbeInterval.value = cfg.probe_interval_seconds || 5;
      cfgProbeTimeout.value = cfg.probe_timeout_seconds || 5;
      cfgVerifySsl.value = cfg.verify_ssl || '1';
      cfgExtraPing.value = cfg.extra_ping_targets || '';

      // AP Names Table
      renderApNamesTable(aps.aps || []);
    } catch (e) {
      console.error("Error cargando configuración:", e);
    }
  }

  function renderApNamesTable(apList) {
    if (apList.length === 0) {
      apNamesTableBody.innerHTML = `<tr><td colspan="3"><div class="empty-state" style="padding: 1rem;"><p>No hay nombres de APs asignados.</p></div></td></tr>`;
      return;
    }
    apNamesTableBody.innerHTML = apList.map(a => `
      <tr>
        <td style="font-family: monospace;">${a.bssid}</td>
        <td><strong style="color: var(--accent-cyan);">${a.name}</strong></td>
        <td>
          <button class="btn-icon-danger" onclick="removeApName('${a.bssid}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `).join('');
  }

  window.removeApName = async function(bssid) {
    await fetch('/api/ap-names/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bssid: bssid })
    });
    loadConfigView();
  };

  btnAddApname.addEventListener('click', async () => {
    const bssid = inputNewBssid.value.trim();
    const name = inputNewApname.value.trim();
    if (!bssid || !name) {
      alert("Por favor ingresa tanto el BSSID (MAC) como el Nombre del AP.");
      return;
    }
    try {
      await fetch('/api/ap-names/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bssid, name })
      });
      inputNewBssid.value = '';
      inputNewApname.value = '';
      loadConfigView();
    } catch (e) {
      alert("Error guardando AP: " + e);
    }
  });

  btnSaveInterface.addEventListener('click', async () => {
    const newIface = cfgWifiInterface.value;
    try {
      const res = await fetch('/api/set-interface', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interface: newIface })
      });
      const data = await res.json();
      if (data.status === 'success') alert("Interfaz cambiada exitosamente.");
      else alert("Error: " + data.message);
    } catch (e) {
      alert("Error cambiando interfaz: " + e);
    }
  });

  btnSaveConfigGeneral.addEventListener('click', async () => {
    await saveConfig({
      probe_interval_seconds: cfgProbeInterval.value,
      probe_timeout_seconds: cfgProbeTimeout.value,
      verify_ssl: cfgVerifySsl.value,
      extra_ping_targets: cfgExtraPing.value.trim()
    });
    alert("Configuración de telemetría guardada.");
  });

  btnTestRoaming.addEventListener('click', async () => {
    btnTestRoaming.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probando...';
    btnTestRoaming.disabled = true;
    try {
      const res = await fetch('/api/trigger-test-ping', { method: 'POST' });
      const data = await res.json();
      alert(`Prueba de Estabilidad Gateway:\nPromedio Ping: ${data.avg_ping_ms} ms\nPérdida de Paquetes: ${data.packet_loss_pct}%\nPings: ${data.pings.join(', ')} ms`);
    } catch (e) {
      alert("Error en prueba de ping: " + e);
    } finally {
      btnTestRoaming.innerHTML = '<i class="fa-solid fa-vial-circle-check"></i> Probar Ping';
      btnTestRoaming.disabled = false;
    }
  });

  // --- Initialization ---
  async function init() {
    await loadPresets();
    await loadLocationsAndZones();
    await fetchStatus();
    loadRoamingHistory();
    loadApScanner();

    // Fast polling for Wi-Fi Telemetry & App probe status (every 1.5s)
    setInterval(fetchStatus, 1500);

    // Medium polling for nearby APs scan (every 4s)
    setInterval(loadApScanner, 4000);
  }

  init();
});
