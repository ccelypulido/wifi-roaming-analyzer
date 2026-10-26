document.addEventListener('DOMContentLoaded', () => {
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Local Time & Date Formatters (Display adjusted to user's local timezone while preserving DB raw data) ---
  function parseToDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    if (typeof val === 'number') {
      return new Date(val > 1e11 ? val : val * 1000);
    }
    const str = String(val).trim();
    if (!isNaN(Number(str)) && !str.includes('-') && !str.includes(':')) {
      const num = Number(str);
      return new Date(num > 1e11 ? num : num * 1000);
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatLocalTime(val, fallback = '--:--:--') {
    const d = parseToDate(val);
    if (!d) return fallback;
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatLocalDate(val, fallback = '') {
    const d = parseToDate(val);
    if (!d) return fallback;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatLocalDateTime(val, fallback = 'Reciente') {
    const d = parseToDate(val);
    if (!d) return fallback;
    return `${formatLocalDate(d)} ${formatLocalTime(d)}`;
  }

  // --- DOM Elements ---
  // Header badges
  const headerSsid = document.getElementById('header-ssid');
  const headerBssid = document.getElementById('header-bssid');
  const headerPing = document.getElementById('header-ping');
  const headerAppLatency = document.getElementById('header-app-latency');
  const headerAppBadge = document.getElementById('header-app-badge');
  const headerAuthBadge = document.getElementById('header-auth-badge');
  const headerAuthStatus = document.getElementById('header-auth-status');

  // Capture Toggle Elements (Pause / Resume continuous data collection without stopping roaming detection)
  const btnToggleCapture = document.getElementById('btn-toggle-capture');
  const captureStatusDot = document.getElementById('capture-status-dot');
  const captureStatusLabel = document.getElementById('capture-status-label');
  const captureStatusIcon = document.getElementById('capture-status-icon');
  const btnChartToggleCapture = document.getElementById('btn-chart-toggle-capture');
  const btnChartCaptureIcon = document.getElementById('btn-chart-capture-icon');
  const btnChartCaptureLabel = document.getElementById('btn-chart-capture-label');
  const cfgCaptureEnabled = document.getElementById('cfg-capture-enabled');
  const cfgCaptureStatusText = document.getElementById('cfg-capture-status-text');

  let currentCaptureState = true;
  let lastKnownRoamingCount = null;
  let lastKnownProbeCount = null;
  let lastKnownProbeTime = null;
  let isLoadingHttpHistory = false;
  let lastKnownNetDiagCount = null;
  let netDiagRunsHistory = [];
  let isLoadingNetDiag = false;

  function updateCaptureUI(isCapturing) {
    currentCaptureState = isCapturing;
    if (isCapturing) {
      if (btnToggleCapture) {
        btnToggleCapture.classList.remove('paused');
        btnToggleCapture.title = 'Captura de telemetría activa (Clic para pausar). El monitoreo de roaming se mantiene siempre activo.';
      }
      if (captureStatusLabel) captureStatusLabel.textContent = 'EN VIVO';
      if (captureStatusIcon) captureStatusIcon.className = 'fa-solid fa-pause';
      if (btnChartCaptureLabel) btnChartCaptureLabel.textContent = 'Pausar Captura';
      if (btnChartCaptureIcon) btnChartCaptureIcon.className = 'fa-solid fa-pause';
      if (btnChartToggleCapture) {
        btnChartToggleCapture.classList.remove('btn-primary');
        btnChartToggleCapture.classList.add('btn-secondary');
        btnChartToggleCapture.title = 'Pausar captura continua de telemetría (El roaming se mantiene activo)';
      }
      if (cfgCaptureEnabled) cfgCaptureEnabled.value = '1';
      if (cfgCaptureStatusText) {
        cfgCaptureStatusText.textContent = 'Activa';
        cfgCaptureStatusText.style.color = 'var(--accent-emerald)';
      }
    } else {
      if (btnToggleCapture) {
        btnToggleCapture.classList.add('paused');
        btnToggleCapture.title = 'Captura de telemetría pausada (Clic para reanudar). El monitoreo de roaming continúa activo.';
      }
      if (captureStatusLabel) captureStatusLabel.textContent = 'PAUSADO';
      if (captureStatusIcon) captureStatusIcon.className = 'fa-solid fa-play';
      if (btnChartCaptureLabel) btnChartCaptureLabel.textContent = 'Reanudar Captura';
      if (btnChartCaptureIcon) btnChartCaptureIcon.className = 'fa-solid fa-play';
      if (btnChartToggleCapture) {
        btnChartToggleCapture.classList.remove('btn-secondary');
        btnChartToggleCapture.classList.add('btn-primary');
        btnChartToggleCapture.title = 'Reanudar captura continua de telemetría';
      }
      if (cfgCaptureEnabled) cfgCaptureEnabled.value = '0';
      if (cfgCaptureStatusText) {
        cfgCaptureStatusText.textContent = 'Pausada';
        cfgCaptureStatusText.style.color = '#f59e0b';
      }
    }
  }

  async function toggleCapture() {
    const btns = [btnToggleCapture, btnChartToggleCapture].filter(Boolean);
    btns.forEach(b => { b.style.pointerEvents = 'none'; b.style.opacity = '0.65'; });
    try {
      const res = await fetch('/api/capture/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        updateCaptureUI(data.capture_enabled !== false);
      }
    } catch (e) {
      console.error('Error toggling capture:', e);
    } finally {
      btns.forEach(b => { b.style.pointerEvents = 'auto'; b.style.opacity = '1'; });
    }
  }

  if (btnToggleCapture) {
    btnToggleCapture.addEventListener('click', toggleCapture);
  }
  if (btnChartToggleCapture) {
    btnChartToggleCapture.addEventListener('click', toggleCapture);
  }
  if (cfgCaptureEnabled) {
    cfgCaptureEnabled.addEventListener('change', async () => {
      const isEn = cfgCaptureEnabled.value === '1';
      try {
        await fetch('/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: isEn })
        });
        updateCaptureUI(isEn);
      } catch (e) {
        console.error('Error setting capture from settings:', e);
      }
    });
  }

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
  const httpHistoryTableBody = document.getElementById('http-history-table-body');
  const httpHistoryCounter = document.getElementById('http-history-counter');
  const btnRefreshHttpHistory = document.getElementById('btn-refresh-http-history');
  const btnExportHttpHistory = document.getElementById('btn-export-http-history');

  // Tab 3: Network Diagnostics
  const btnRunDiag = document.getElementById('btn-run-diag');
  const diagResultsContainer = document.getElementById('diag-results-container');
  const selDiagRunHistory = document.getElementById('sel-diag-run-history');
  const btnRefreshNetDiag = document.getElementById('btn-refresh-net-diag');

  // Tab 4: AP Scanner
  const apScannerTableBody = document.getElementById('ap-scanner-table-body');

  // Tab 5: Sedes & Zonas
  const inputFileSedesZonas = document.getElementById('input-file-sedes-zonas');
  const btnImportSedesFile = document.getElementById('btn-import-sedes-file');
  const btnExportSedesJson = document.getElementById('btn-export-sedes-json');
  const btnExportSedesCsv = document.getElementById('btn-export-sedes-csv');
  const btnSyncSedesJson = document.getElementById('btn-sync-sedes-json');
  const btnAddSedeModal = document.getElementById('btn-add-sede-modal');
  const sedesCardsContainer = document.getElementById('sedes-cards-container');

  // Tab 6: Statistics & Audit Scope
  const btnExportTelemetryCsv = document.getElementById('btn-export-telemetry-csv');
  const statTotalSamples = document.getElementById('stat-total-samples');
  const statUptimePct = document.getElementById('stat-uptime-pct');
  const statP50 = document.getElementById('stat-p50');
  const statP95 = document.getElementById('stat-p95');
  const statP99 = document.getElementById('stat-p99');
  const statJitter = document.getElementById('stat-jitter');
  const statAvgDbm = document.getElementById('stat-avg-dbm');
  const statRoamingCount = document.getElementById('stat-roaming-count');
  const statsStartDate = document.getElementById('stats-start-date');
  const statsEndDate = document.getElementById('stats-end-date');
  const btnStatsToday = document.getElementById('btn-stats-today');
  const btnStats7d = document.getElementById('btn-stats-7d');
  const btnStatsAll = document.getElementById('btn-stats-all');
  const statsLocationSelect = document.getElementById('stats-location-select');
  const statsZoneSelect = document.getElementById('stats-zone-select');
  const btnApplyStatsFilter = document.getElementById('btn-apply-stats-filter');

  // Tab 7: Configuration
  const cfgWifiInterface = document.getElementById('cfg-wifi-interface');
  const btnSaveInterface = document.getElementById('btn-save-interface');
  const cfgProbeInterval = document.getElementById('cfg-probe-interval');
  const cfgProbeTimeout = document.getElementById('cfg-probe-timeout');
  const cfgVerifySsl = document.getElementById('cfg-verify-ssl');
  const cfgExtraPing = document.getElementById('cfg-extra-ping');
  const cfgNetDiagInterval = document.getElementById('cfg-net-diag-interval');
  const diagLastRunBadge = document.getElementById('diag-last-run-badge');
  const btnSaveConfigGeneral = document.getElementById('btn-save-config-general');
  const inputNewBssid = document.getElementById('input-new-bssid');
  const inputNewApname = document.getElementById('input-new-apname');
  const inputNewAploc = document.getElementById('input-new-aploc');
  const btnAddApname = document.getElementById('btnAddApname') || document.getElementById('btn-add-apname');
  const apNamesTableBody = document.getElementById('ap-names-table-body');
  const apCountBadge = document.getElementById('ap-count-badge');
  const inputCsvApNames = document.getElementById('input-csv-ap-names');
  const btnImportApCsv = document.getElementById('btn-import-ap-csv');
  const btnExportApCsv = document.getElementById('btn-export-ap-csv');
  const btnClearAllAps = document.getElementById('btn-clear-all-aps');
  const inputSearchApNames = document.getElementById('input-search-ap-names');
  const apFilteredInfo = document.getElementById('ap-filtered-info');

  // Tab 7: Enterprise Authentication
  const cfgAuthEnabled = document.getElementById('cfg-auth-enabled');
  const authConfigFields = document.getElementById('auth-config-fields');
  const cfgAuthType = document.getElementById('cfg-auth-type');
  const grpAuthDomain = document.getElementById('grp-auth-domain');
  const grpAuthUser = document.getElementById('grp-auth-user');
  const grpAuthPassword = document.getElementById('grp-auth-password');
  const grpAuthToken = document.getElementById('grp-auth-token');
  const cfgAuthDomain = document.getElementById('cfg-auth-domain');
  const cfgAuthUser = document.getElementById('cfg-auth-user');
  const cfgAuthPassword = document.getElementById('cfg-auth-password');
  const cfgAuthToken = document.getElementById('cfg-auth-token');
  const btnTogglePwd = document.getElementById('btn-toggle-pwd');
  const btnTestAuth = document.getElementById('btn-test-auth');
  const btnSaveAuth = document.getElementById('btn-save-auth');

  // Tab 7: IEEE OUI Vendor Database & MAC Management
  const ouiStatBadge = document.getElementById('oui-stat-badge');
  const ouiStatTotal = document.getElementById('oui-stat-total');
  const ouiStatCustom = document.getElementById('oui-stat-custom');
  const ouiStatUpdated = document.getElementById('oui-stat-updated');
  const btnUpdateOui = document.getElementById('btn-update-oui');
  const btnToggleAddOui = document.getElementById('btn-toggle-add-oui');
  const ouiUpdateBanner = document.getElementById('oui-update-banner');
  const ouiUpdateStatusText = document.getElementById('oui-update-status-text');
  const ouiAddFormContainer = document.getElementById('oui-add-form-container');
  const ouiInputPrefix = document.getElementById('oui-input-prefix');
  const ouiInputVendor = document.getElementById('oui-input-vendor');
  const btnSaveCustomOui = document.getElementById('btn-save-custom-oui');
  const btnCancelCustomOui = document.getElementById('btn-cancel-custom-oui');
  const ouiSearchInput = document.getElementById('oui-search-input');
  const ouiTableBody = document.getElementById('oui-table-body');

  // --- Local State ---
  let presetsData = {};
  let locationsData = [];
  let zonesByLocation = {};
  let allApList = [];
  let currentPreset = 'store';
  let isProbing = false;
  let ouiUpdateInterval = null;
  let ouiSearchDebounceTimer = null;

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
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.08)',
          borderWidth: 2.2,
          tension: 0.3,
          fill: true,
          yAxisID: 'ySignal'
        },
        {
          label: 'App HTTP (ms)',
          data: appLatencyData,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.08)',
          borderWidth: 2.2,
          tension: 0.25,
          fill: false,
          yAxisID: 'yLatency'
        },
        {
          label: 'Ping Gateway (ms)',
          data: pingData,
          borderColor: '#0284c7',
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
          backgroundColor: 'rgba(15, 23, 42, 0.94)',
          titleFont: { family: 'Outfit', size: 13, weight: 'bold' },
          bodyFont: { family: 'Outfit', size: 12 },
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: '#e2e8f0' },
          ticks: { color: '#64748b', maxTicksLimit: 10, font: { family: 'Outfit' } }
        },
        ySignal: {
          type: 'linear',
          position: 'left',
          min: -100,
          max: -20,
          grid: { color: '#f1f5f9' },
          ticks: { color: '#4f46e5', callback: (val) => `${val} dBm`, font: { family: 'Outfit' } },
          title: { display: true, text: 'Intensidad RF (dBm)', color: '#4f46e5', font: { family: 'Outfit', weight: 'bold' } }
        },
        yLatency: {
          type: 'linear',
          position: 'right',
          min: 0,
          suggestedMax: 300,
          grid: { drawOnChartArea: false },
          ticks: { color: '#059669', callback: (val) => `${val} ms`, font: { family: 'Outfit' } },
          title: { display: true, text: 'Latencia (ms)', color: '#059669', font: { family: 'Outfit', weight: 'bold' } }
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
        { label: 'DNS', data: [0], backgroundColor: '#0284c7' },
        { label: 'TCP Handshake', data: [0], backgroundColor: '#4f46e5' },
        { label: 'TLS Handshake', data: [0], backgroundColor: '#7c3aed' },
        { label: 'TTFB (Espera)', data: [0], backgroundColor: '#059669' },
        { label: 'Transferencia', data: [0], backgroundColor: '#d97706' }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#334155', font: { family: 'Outfit', size: 11 }, boxWidth: 14 }
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
          grid: { color: '#e2e8f0' },
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
        if (btn.dataset.tab === 'tab-roaming-log') loadRoamingHistory();
        if (btn.dataset.tab === 'tab-ap-scanner') loadApScanner();
        if (btn.dataset.tab === 'tab-http-phases') loadHttpPhasesHistory();
        if (btn.dataset.tab === 'tab-net-diag') loadNetDiagView();
        if (btn.dataset.tab === 'tab-sedes-zonas') loadSedesAndZones();
        if (btn.dataset.tab === 'tab-stats') loadStatistics();
        if (btn.dataset.tab === 'tab-config') loadConfigView();
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

      // Populate Tab 6 Audit Scope dropdowns
      populateStatsScopeFilters();

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

  function populateStatsScopeFilters() {
    if (!statsLocationSelect || !statsZoneSelect) return;
    const currentLoc = statsLocationSelect.value || 'all';
    const currentZone = statsZoneSelect.value || 'all';

    statsLocationSelect.innerHTML = '<option value="all">Todas las Sedes</option>';
    locationsData.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = loc.replace(/_/g, ' ');
      if (loc === currentLoc) opt.selected = true;
      statsLocationSelect.appendChild(opt);
    });

    populateStatsZones(statsLocationSelect.value, currentZone);
  }

  function populateStatsZones(selectedLoc, selectedZone = 'all') {
    if (!statsZoneSelect) return;
    statsZoneSelect.innerHTML = '<option value="all">Todas las Zonas (Recorrido Completo)</option>';

    let zones = [];
    if (selectedLoc === 'all') {
      const zoneSet = new Set();
      Object.values(zonesByLocation).forEach(arr => {
        if (Array.isArray(arr)) arr.forEach(z => zoneSet.add(z));
      });
      zones = Array.from(zoneSet);
    } else {
      zones = zonesByLocation[selectedLoc] || [];
    }

    zones.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z;
      opt.textContent = z;
      if (z === selectedZone) opt.selected = true;
      statsZoneSelect.appendChild(opt);
    });
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
    selLocation.style.borderColor = 'var(--accent-emerald)';
    selLocation.style.boxShadow = '0 0 0 3px rgba(5, 150, 105, 0.2)';
    setTimeout(() => {
      selLocation.style.borderColor = '';
      selLocation.style.boxShadow = '';
    }, 1000);
    await saveConfig({ location_name: loc, current_zone: z });
    loadStatistics();
    loadRoamingHistory();
    loadHttpPhasesHistory();
  });

  selZone.addEventListener('change', async () => {
    const loc = selLocation.value;
    const z = selZone.value;
    selZone.style.borderColor = 'var(--accent-emerald)';
    selZone.style.boxShadow = '0 0 0 3px rgba(5, 150, 105, 0.2)';
    setTimeout(() => {
      selZone.style.borderColor = '';
      selZone.style.boxShadow = '';
    }, 1000);
    await saveConfig({ location_name: loc, current_zone: z });
    loadStatistics();
    loadRoamingHistory();
    loadHttpPhasesHistory();
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

    if (headerAuthStatus && headerAuthBadge) {
      if (data.auth_enabled) {
        const typeUpper = (data.auth_type || 'ntlm').toUpperCase();
        const userOrToken = data.auth_user ? ` (${data.auth_user})` : '';
        headerAuthStatus.textContent = `${typeUpper}${userOrToken}`;
        headerAuthBadge.style.display = 'inline-flex';
        headerAuthBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        headerAuthBadge.style.color = '#10b981';
      } else {
        headerAuthStatus.textContent = 'Inactiva';
        headerAuthBadge.style.display = 'inline-flex';
        headerAuthBadge.style.background = 'rgba(148, 163, 184, 0.12)';
        headerAuthBadge.style.color = '#94a3b8';
      }
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

    // Auto-refresh HTTP Phases History when a new probe is recorded or on initial load
    const newProbeCount = data.http_probe_counter !== undefined ? data.http_probe_counter : 0;
    const newProbeTime = data.last_probe_time || 0;
    if (lastKnownProbeCount === null || newProbeCount !== lastKnownProbeCount || (newProbeTime > 0 && newProbeTime !== lastKnownProbeTime)) {
      loadHttpPhasesHistory();
    }
    lastKnownProbeCount = newProbeCount;
    lastKnownProbeTime = newProbeTime;

    // Auto-refresh Network Diagnostics if a new diagnostic completed in background
    const newNetDiagCount = data.net_diag_counter !== undefined ? data.net_diag_counter : 0;
    if (lastKnownNetDiagCount !== null && newNetDiagCount !== lastKnownNetDiagCount) {
      loadNetDiagView();
    }
    lastKnownNetDiagCount = newNetDiagCount;

    // 5. Card 4: Roaming & Mesh (Always active, regardless of telemetry pause)
    const newRoamingCount = data.recent_roaming_count || 0;
    if (lastKnownRoamingCount !== null && newRoamingCount !== lastKnownRoamingCount) {
      loadRoamingHistory();
    }
    lastKnownRoamingCount = newRoamingCount;

    roamingCountBadge.textContent = `${newRoamingCount} Handoffs`;
    roamingVerdict.textContent = data.roaming_verdict || 'Monitoreando...';
    infoSameSsidCount.textContent = `${data.same_ssid_aps_count || 0} APs`;
    infoTotalApsCount.textContent = `${data.total_neighbor_aps || 0} APs`;

    // 6. Update Synchronized Chart (Pauses advancing graph when capture is paused)
    const isCapturing = data.capture_enabled !== false;
    updateCaptureUI(isCapturing);

    if (isCapturing) {
      const nowStr = formatLocalTime(new Date());
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
      const res = await fetch(`/api/roaming-history?location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}&_t=${Date.now()}`, { cache: 'no-store' });
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

      roamingTableBody.innerHTML = events.map(e => {
        const timeFormatted = formatLocalTime(e.timestamp_raw || e.timestamp || e.created_at);
        const dateFormatted = formatLocalDate(e.timestamp_raw || e.created_at || e.date);
        return `
        <tr>
          <td>
            <strong style="color: var(--accent-cyan); font-size: 0.85rem;">${timeFormatted}</strong>
            ${dateFormatted ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${dateFormatted}</div>` : ''}
          </td>
          <td><span class="badge" style="font-size: 0.75rem;">${escapeHtml(e.location || 'Sede')} - ${escapeHtml(e.zone || 'Zona')}</span></td>
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
      `;
      }).join('');
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

  // --- Tab 2: Manual Probe Trigger & History ---
  btnManualProbe.addEventListener('click', async () => {
    btnManualProbe.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Midiendo...';
    btnManualProbe.disabled = true;
    try {
      const res = await fetch('/api/probe/now', { method: 'POST' });
      const data = await res.json();
      updateAppCard(data);
      loadHttpPhasesHistory();
    } catch (e) {
      alert("Error en medición: " + e);
    } finally {
      btnManualProbe.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Medir Ahora';
      btnManualProbe.disabled = false;
    }
  });

  async function loadHttpPhasesHistory() {
    if (!httpHistoryTableBody || isLoadingHttpHistory) return;
    isLoadingHttpHistory = true;
    try {
      const container = httpHistoryTableBody.closest('.table-responsive');
      const prevScrollTop = container ? container.scrollTop : 0;
      const loc = selLocation.value;
      const zone = selZone.value;
      const res = await fetch(`/api/http-phases/history?limit=50&location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      const records = data.records || [];

      if (httpHistoryCounter) {
        httpHistoryCounter.textContent = `${records.length} prueba${records.length === 1 ? '' : 's'}`;
      }

      if (records.length === 0) {
        httpHistoryTableBody.innerHTML = `
          <tr>
            <td colspan="11">
              <div class="empty-state" style="padding: 2.5rem 1rem; text-align: center;">
                <i class="fa-solid fa-clock-rotate-left" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem; opacity: 0.5;"></i>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">Aún no hay mediciones registradas en el historial.</p>
                <small style="color: rgba(255, 255, 255, 0.4);">Presiona "Medir Ahora" arriba para registrar la primera prueba de latencia.</small>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      httpHistoryTableBody.innerHTML = records.map((r, idx) => {
        const statusCode = r.status_code || 0;
        let badgeHtml = '';
        if (r.is_error || (statusCode >= 500 && statusCode < 600)) {
          badgeHtml = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700;" title="${escapeHtml(r.error_message || 'Error')}"><i class="fa-solid fa-triangle-exclamation"></i> ${statusCode || 'ERR'}</span>`;
        } else if (statusCode >= 200 && statusCode < 300) {
          badgeHtml = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700;"><i class="fa-solid fa-check"></i> ${statusCode}</span>`;
        } else if (statusCode >= 300 && statusCode < 400) {
          badgeHtml = `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; font-weight: 700;">${statusCode}</span>`;
        } else if (statusCode >= 400 && statusCode < 500) {
          badgeHtml = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700;">${statusCode}</span>`;
        } else {
          badgeHtml = `<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: var(--text-muted); font-weight: 600;">${statusCode || '--'}</span>`;
        }

        const sig = r.signal_dbm !== undefined && r.signal_dbm > -100 ? `${r.signal_dbm} dBm` : '';
        const sigColor = r.signal_dbm >= -65 ? 'var(--accent-emerald)' : (r.signal_dbm >= -75 ? 'var(--accent-amber)' : 'var(--accent-rose)');
        const apLabel = r.ap_name ? `<span class="ap-name-tag" style="margin-right: 0.35rem;"><i class="fa-solid fa-tag"></i> ${escapeHtml(r.ap_name)}</span>` : '';
        const bssidLabel = r.bssid ? `<span class="mac-subtext" style="font-family: monospace;">${escapeHtml(r.bssid)}</span>` : '<span style="color: var(--text-muted); font-size: 0.78rem;">--</span>';

        const timeFormatted = formatLocalTime(r.timestamp || r.created_at || r.time);
        const dateFormatted = formatLocalDate(r.timestamp || r.created_at || r.date);

        return `
          <tr>
            <td style="text-align: center; color: var(--text-muted); font-size: 0.8rem; font-family: monospace;">${idx + 1}</td>
            <td>
              <div style="font-weight: 600; color: var(--text-primary); font-size: 0.85rem;">${timeFormatted}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${dateFormatted}</div>
            </td>
            <td>
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${escapeHtml(r.location || 'Sede Principal')}</div>
              ${r.zone ? `<div style="font-size: 0.75rem; color: var(--accent-cyan);"><i class="fa-solid fa-location-dot" style="font-size: 0.7rem;"></i> ${escapeHtml(r.zone)}</div>` : ''}
            </td>
            <td>
              <div class="ap-cell">
                ${apLabel}
                ${bssidLabel}
                ${sig ? `<span style="font-size: 0.75rem; font-weight: 700; color: ${sigColor}; margin-left: 0.35rem;">(${sig})</span>` : ''}
              </div>
            </td>
            <td style="text-align: center;">
              ${badgeHtml}
            </td>
            <td style="text-align: right; font-family: monospace; color: var(--text-muted);">${Number(r.dns_ms || 0).toFixed(1)} ms</td>
            <td style="text-align: right; font-family: monospace; color: var(--text-muted);">${Number(r.tcp_ms || 0).toFixed(1)} ms</td>
            <td style="text-align: right; font-family: monospace; color: var(--text-muted);">${Number(r.tls_ms || 0).toFixed(1)} ms</td>
            <td style="text-align: right; font-family: monospace; font-weight: 600; color: var(--accent-emerald);">${Number(r.ttfb_ms || 0).toFixed(1)} ms</td>
            <td style="text-align: right; font-family: monospace; color: var(--text-muted);">${Number(r.transfer_ms || 0).toFixed(1)} ms</td>
            <td style="text-align: right;">
              <span style="font-family: monospace; font-weight: 700; color: var(--accent-cyan); font-size: 0.92rem;">
                ${Number(r.total_ms || 0).toFixed(1)} ms
              </span>
            </td>
          </tr>
        `;
      }).join('');

      if (container && prevScrollTop > 0) {
        container.scrollTop = prevScrollTop;
      }
    } catch (e) {
      console.warn("Error cargando historial de fases HTTP:", e);
      if (httpHistoryTableBody) {
        httpHistoryTableBody.innerHTML = `
          <tr>
            <td colspan="11" style="text-align: center; color: var(--accent-rose); padding: 1.5rem;">
              <i class="fa-solid fa-circle-exclamation"></i> Error al cargar el historial de pruebas: ${escapeHtml(e.message || String(e))}
            </td>
          </tr>
        `;
      }
    } finally {
      isLoadingHttpHistory = false;
    }
  }

  if (btnRefreshHttpHistory) {
    btnRefreshHttpHistory.addEventListener('click', () => {
      btnRefreshHttpHistory.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      loadHttpPhasesHistory().finally(() => {
        btnRefreshHttpHistory.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Actualizar';
      });
    });
  }

  if (btnExportHttpHistory) {
    btnExportHttpHistory.addEventListener('click', () => {
      const loc = selLocation.value;
      const zone = selZone.value;
      window.location.href = `/api/export?type=http-phases&location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`;
    });
  }

  // --- Tab 3: Network Diagnostics (ICMP & Traceroute) ---
  async function loadNetDiagView() {
    if (isLoadingNetDiag) return;
    isLoadingNetDiag = true;
    try {
      const res = await fetch(`/api/net-diag?_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      netDiagRunsHistory = data.history || [];

      if (selDiagRunHistory) {
        const prevSelectedIdx = selDiagRunHistory.value || '0';
        selDiagRunHistory.innerHTML = '';
        if (netDiagRunsHistory.length === 0) {
          selDiagRunHistory.innerHTML = '<option value="0">Sin diagnósticos previos</option>';
        } else {
          netDiagRunsHistory.forEach((run, idx) => {
            const opt = document.createElement('option');
            opt.value = idx.toString();
            const dateStr = formatLocalDateTime(run.timestamp || run.created_at);
            const locStr = run.location ? ` - ${run.location}` : '';
            const zoneStr = run.zone ? ` (${run.zone})` : '';
            opt.textContent = `${idx === 0 ? '● Más reciente: ' : ''}${dateStr}${locStr}${zoneStr}`;
            selDiagRunHistory.appendChild(opt);
          });
          if (parseInt(prevSelectedIdx, 10) < netDiagRunsHistory.length) {
            selDiagRunHistory.value = prevSelectedIdx;
          } else {
            selDiagRunHistory.value = '0';
          }
        }
      }

      const selectedIdx = selDiagRunHistory ? (parseInt(selDiagRunHistory.value, 10) || 0) : 0;
      const targetRun = netDiagRunsHistory[selectedIdx] || netDiagRunsHistory[0];

      if (targetRun) {
        if (diagLastRunBadge) {
          const runDate = formatLocalDateTime(targetRun.timestamp || targetRun.created_at);
          const targetCount = targetRun.results ? targetRun.results.length : 0;
          diagLastRunBadge.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Histórico (${netDiagRunsHistory.length} ejecuciones): <strong>${runDate}</strong> (${targetCount} objetivos evaluados)`;
        }
        renderDiagResults(targetRun.results || []);
      } else {
        if (diagLastRunBadge) {
          diagLastRunBadge.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Sin diagnósticos automáticos previos.`;
        }
      }
    } catch (e) {
      console.warn("Error cargando vista de diagnóstico:", e);
    } finally {
      isLoadingNetDiag = false;
    }
  }

  if (selDiagRunHistory) {
    selDiagRunHistory.addEventListener('change', () => {
      const idx = parseInt(selDiagRunHistory.value, 10) || 0;
      const run = netDiagRunsHistory[idx];
      if (run) {
        if (diagLastRunBadge) {
          const runDate = formatLocalDateTime(run.timestamp || run.created_at);
          const targetCount = run.results ? run.results.length : 0;
          diagLastRunBadge.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Visualizando ejecución #${idx + 1}: <strong>${runDate}</strong> (${targetCount} objetivos)`;
        }
        renderDiagResults(run.results || []);
      }
    });
  }

  if (btnRefreshNetDiag) {
    btnRefreshNetDiag.addEventListener('click', async () => {
      btnRefreshNetDiag.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      await loadNetDiagView();
      btnRefreshNetDiag.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Actualizar';
    });
  }

  btnRunDiag.addEventListener('click', async () => {
    btnRunDiag.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ejecutando Diagnóstico (Traceroute)...';
    btnRunDiag.disabled = true;
    diagResultsContainer.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <p>Realizando pings paralelos y trazando saltos hacia Puerta de Enlace, DNS y Servidor...</p>
        <small>Esto toma entre 5 y 15 segundos en segundo plano. La telemetría en vivo continúa activa.</small>
      </div>`;

    try {
      const res = await fetch('/api/net-diag/run', { method: 'POST' });
      const data = await res.json();
      await loadNetDiagView();
      if (diagLastRunBadge) {
        diagLastRunBadge.innerHTML = `<i class="fa-solid fa-check-circle" style="color: var(--accent-emerald);"></i> Diagnóstico completado: <strong>${formatLocalTime(new Date())}</strong>`;
      }
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

      // Refresh real-time RF Spectrum Analyzer with scanned APs
      updateSpectrumData(aps);
    } catch (e) {
      console.warn("Error escaneando APs:", e);
    }
  }

  // --- Wi-Fi Spectrum & Channel Analyzer (2.4 GHz, 5 GHz, 6 GHz, 7 GHz) ---
  const wifiSpectrumCanvas = document.getElementById('wifiSpectrumCanvas');
  const spectrumTooltip = document.getElementById('spectrum-tooltip');
  const spectrumBandSelector = document.getElementById('spectrum-band-selector');
  const btnSpectrumFilterSsid = document.getElementById('btn-spectrum-filter-ssid');
  const spectrumFilterLabel = document.getElementById('spectrum-filter-label');
  const btnRefreshSpectrum = document.getElementById('btn-refresh-spectrum');
  const spectrumSummaryText = document.getElementById('spectrum-summary-text');
  const spectrumRecommendation = document.getElementById('spectrum-recommendation');
  const spectrumCount24 = document.getElementById('spectrum-count-24');
  const spectrumCount5 = document.getElementById('spectrum-count-5');
  const spectrumCount6 = document.getElementById('spectrum-count-6');

  let activeSpectrumBand = '2.4';
  let spectrumOnlySameSsid = false;
  let cachedSpectrumAps = [];
  let hoveredSpectrumAp = null;
  let spectrumAutoSwitched = false;

  const SPECTRUM_COLORS = [
    '#4f46e5', // Tech Indigo
    '#0284c7', // Sky Blue
    '#059669', // Emerald
    '#d97706', // Amber
    '#e11d48', // Rose
    '#7c3aed', // Violet
    '#0d9488', // Teal
    '#ea580c', // Orange
    '#2563eb', // Blue
    '#6366f1'  // Indigo Light
  ];

  function getSpectrumColor(ssid, bssid) {
    const str = (ssid || '') + (bssid || '');
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return SPECTRUM_COLORS[Math.abs(h) % SPECTRUM_COLORS.length];
  }

  function hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function normalizeApForSpectrum(ap) {
    let freq = parseFloat(ap.freq || '0');
    let chan = parseInt(ap.channel || '0', 10);
    if (isNaN(chan)) chan = 0;
    if (isNaN(freq)) freq = 0;

    if (chan === 0 && freq > 0) {
      if (freq >= 2400 && freq < 2500) {
        chan = Math.round((freq - 2407) / 5);
        if (chan < 1) chan = 1;
        if (chan > 14) chan = 14;
      } else if (freq >= 5000 && freq < 5900) {
        chan = Math.round((freq - 5000) / 5);
      } else if (freq >= 5900) {
        chan = Math.round((freq - 5950) / 5);
      }
    }

    let band = '2.4';
    if (freq >= 5900 || chan > 177) {
      band = '6';
    } else if (freq >= 5000 || chan > 14) {
      band = '5';
    } else {
      band = '2.4';
    }

    const signalPct = Math.max(0, Math.min(100, Number(ap.signal) || 0));
    let dbm = -100;
    if (ap.signal_dbm !== undefined && ap.signal_dbm !== null) {
      dbm = Number(ap.signal_dbm);
    } else {
      dbm = Math.round((signalPct / 2) - 100);
    }
    dbm = Math.max(-100, Math.min(-10, dbm));

    return {
      ...ap,
      chanNum: chan,
      freqNum: freq,
      band: band,
      dbm: dbm,
      signalPct: signalPct
    };
  }

  function updateSpectrumData(aps) {
    if (!aps || !Array.isArray(aps)) return;
    cachedSpectrumAps = aps.map(normalizeApForSpectrum);

    // Update band badge counters
    const count24 = cachedSpectrumAps.filter(a => a.band === '2.4').length;
    const count5 = cachedSpectrumAps.filter(a => a.band === '5').length;
    const count6 = cachedSpectrumAps.filter(a => a.band === '6').length;

    if (spectrumCount24) spectrumCount24.textContent = count24;
    if (spectrumCount5) spectrumCount5.textContent = count5;
    if (spectrumCount6) spectrumCount6.textContent = count6;

    // Auto-select band of currently connected AP on initial load
    if (!spectrumAutoSwitched && cachedSpectrumAps.length > 0) {
      const activeAp = cachedSpectrumAps.find(a => a.active);
      if (activeAp && (activeAp.band === '5' || activeAp.band === '6')) {
        activeSpectrumBand = activeAp.band;
        if (spectrumBandSelector) {
          spectrumBandSelector.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.band === activeSpectrumBand);
          });
        }
      }
      spectrumAutoSwitched = true;
    }

    drawWifiSpectrum();
  }

  function drawWifiSpectrum() {
    if (!wifiSpectrumCanvas) return;
    const ctx = wifiSpectrumCanvas.getContext('2d');
    if (!ctx) return;

    // Measure parent container to prevent canvas infinite shrink feedback loop
    const container = wifiSpectrumCanvas.parentElement;
    const clientWidth = container ? container.clientWidth : wifiSpectrumCanvas.clientWidth;
    const clientHeight = container ? container.clientHeight : wifiSpectrumCanvas.clientHeight;
    if (!clientWidth || !clientHeight || clientWidth < 50 || clientHeight < 50) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(clientWidth * dpr);
    const targetH = Math.floor(clientHeight * dpr);

    if (wifiSpectrumCanvas.width !== targetW || wifiSpectrumCanvas.height !== targetH) {
      wifiSpectrumCanvas.width = targetW;
      wifiSpectrumCanvas.height = targetH;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const padLeft = 52;
    const padRight = 24;
    const padTop = 26;
    const padBottom = 28;
    const chartW = Math.max(10, clientWidth - padLeft - padRight);
    const chartH = Math.max(10, clientHeight - padTop - padBottom);

    function yToPix(dbm) {
      const clamped = Math.max(-100, Math.min(-10, dbm));
      return padTop + (1 - (clamped - (-100)) / 90) * chartH;
    }

    // Configure coordinate scales based on active band
    let chanToX, channelWidth, ticks = [], bandName = '2.4 GHz';
    if (activeSpectrumBand === '2.4') {
      bandName = 'Banda 2.4 GHz';
      chanToX = (ch) => padLeft + ((ch - 0.5) / 14) * chartW;
      channelWidth = 2.2;
      for (let i = 1; i <= 14; i++) ticks.push(i);
    } else if (activeSpectrumBand === '5') {
      bandName = 'Banda 5 GHz';
      chanToX = (ch) => padLeft + ((ch - 32) / (168 - 32)) * chartW;
      channelWidth = 2.4;
      ticks = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165];
    } else {
      bandName = 'Banda 6 GHz / 7 GHz (Wi-Fi 6E/7)';
      chanToX = (ch) => padLeft + ((ch - 1) / (233 - 1)) * chartW;
      channelWidth = 4.0;
      ticks = [1, 17, 33, 49, 65, 81, 97, 113, 129, 145, 161, 177, 193, 209, 225, 233];
    }

    // 1. Draw horizontal gridlines & Y labels
    ctx.clearRect(0, 0, clientWidth, clientHeight);
    const dbmSteps = [-20, -30, -40, -50, -60, -70, -80, -90, -100];

    dbmSteps.forEach(dbm => {
      const y = yToPix(dbm);
      const isMajor = (dbm % 20 === 0) || dbm === -100;
      ctx.beginPath();
      ctx.strokeStyle = dbm === -100 ? '#cbd5e1' : (isMajor ? '#e2e8f0' : '#f1f5f9');
      ctx.lineWidth = dbm === -100 ? 1.5 : (isMajor ? 1 : 0.8);
      if (dbm === -100) {
        ctx.setLineDash([]);
      } else if (isMajor) {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([2, 4]);
      }
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = isMajor ? '#64748b' : '#94a3b8';
      ctx.font = isMajor ? "10px 'Outfit', -apple-system, sans-serif" : "9px 'Outfit', -apple-system, sans-serif";
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${dbm} dBm`, padLeft - 8, y);
    });

    // 2. Draw vertical ticks and channel labels on X axis
    ctx.setLineDash([]);
    ticks.forEach(ch => {
      const x = chanToX(ch);
      if (x < padLeft || x > padLeft + chartW) return;

      const isKeyChan = (activeSpectrumBand === '2.4' && (ch === 1 || ch === 6 || ch === 11));

      // Tick line
      ctx.beginPath();
      ctx.strokeStyle = isKeyChan ? '#4f46e5' : '#cbd5e1';
      ctx.lineWidth = isKeyChan ? 1.5 : 1;
      ctx.moveTo(x, yToPix(-100));
      ctx.lineTo(x, yToPix(-100) + 5);
      ctx.stroke();

      // Channel label
      ctx.font = isKeyChan ? "bold 10px 'Outfit', sans-serif" : "9px 'Outfit', sans-serif";
      ctx.fillStyle = isKeyChan ? '#4f46e5' : '#64748b';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(ch), x, yToPix(-100) + 7);
    });

    // Watermark band tag
    ctx.font = "bold 9px 'Outfit', sans-serif";
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(bandName, padLeft + 6, padTop + 14);

    // 3. Filter APs for current band
    let visibleAps = cachedSpectrumAps.filter(a => a.band === activeSpectrumBand && a.chanNum > 0);
    if (spectrumOnlySameSsid) {
      visibleAps = visibleAps.filter(a => a.is_same_ssid);
    }

    // Sort APs so weaker ones draw behind stronger ones
    visibleAps.sort((a, b) => a.dbm - b.dbm);

    // Keep references for hover detection
    visibleAps.forEach(ap => {
      ap._curvePeakX = chanToX(ap.chanNum);
      ap._curvePeakY = yToPix(ap.dbm);
      ap._curveStartX = chanToX(ap.chanNum - channelWidth);
      ap._curveEndX = chanToX(ap.chanNum + channelWidth);
      ap._curveBaseY = yToPix(-100);
    });

    // Draw curves
    visibleAps.forEach(ap => {
      const color = getSpectrumColor(ap.ssid, ap.bssid);
      const isHovered = hoveredSpectrumAp && (hoveredSpectrumAp.bssid === ap.bssid);
      const isConnected = !!ap.active;

      const peakX = ap._curvePeakX;
      const peakY = ap._curvePeakY;
      const startX = ap._curveStartX;
      const endX = ap._curveEndX;
      const baseY = ap._curveBaseY;

      // Draw Bell / Parabolic curve
      ctx.beginPath();
      ctx.moveTo(startX, baseY);
      ctx.bezierCurveTo(
        startX + (peakX - startX) * 0.45, baseY,
        peakX - (peakX - startX) * 0.25, peakY,
        peakX, peakY
      );
      ctx.bezierCurveTo(
        peakX + (endX - peakX) * 0.25, peakY,
        endX - (endX - peakX) * 0.45, baseY,
        endX, baseY
      );
      ctx.closePath();

      // Semi-transparent gradient fill
      const grad = ctx.createLinearGradient(0, peakY, 0, baseY);
      const alphaPeak = (isConnected || isHovered) ? 0.38 : 0.18;
      const alphaBase = 0.02;
      grad.addColorStop(0, hexToRgba(color, alphaPeak));
      grad.addColorStop(1, hexToRgba(color, alphaBase));
      ctx.fillStyle = grad;
      ctx.fill();

      // Colored contour stroke
      ctx.strokeStyle = color;
      ctx.lineWidth = (isConnected || isHovered) ? 3.0 : 1.8;
      ctx.stroke();

      // Draw label above the peak
      const rawLabel = ap.ssid || 'Oculto';
      const shortLabel = rawLabel.length > 22 ? rawLabel.substring(0, 21) + '…' : rawLabel;
      ctx.font = (isConnected || isHovered) ? "bold 11px Outfit, sans-serif" : "600 10px Outfit, sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(shortLabel, peakX, Math.max(padTop - 4, peakY - 6));

      if (isConnected || isHovered) {
        ctx.font = "bold 9px Outfit, sans-serif";
        ctx.fillStyle = color;
        ctx.fillText(`${ap.dbm} dBm`, peakX, Math.max(padTop - 16, peakY - 18));
      }

      // Connected AP indicator dot
      if (isConnected) {
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(peakX, peakY, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 4. Update Footer Summary & Recommendations
    const chanCounts = {};
    visibleAps.forEach(a => {
      chanCounts[a.chanNum] = (chanCounts[a.chanNum] || 0) + 1;
    });

    let maxChan = null, maxCount = 0;
    for (const [ch, cnt] of Object.entries(chanCounts)) {
      if (cnt > maxCount) {
        maxCount = cnt;
        maxChan = ch;
      }
    }

    if (spectrumSummaryText) {
      if (visibleAps.length === 0) {
        spectrumSummaryText.innerHTML = `<i class="fa-solid fa-circle-info" style="color: var(--text-muted); margin-right: 0.3rem;"></i> No se detectaron redes en ${bandName}.`;
      } else {
        const congInfo = maxChan ? ` • Canal más ocupado: <strong>Ch ${maxChan}</strong> (${maxCount} redes)` : '';
        spectrumSummaryText.innerHTML = `<i class="fa-solid fa-satellite-dish" style="color: var(--accent-cyan); margin-right: 0.3rem;"></i> <strong>${visibleAps.length}</strong> redes detectadas en ${bandName}${congInfo}`;
      }
    }

    if (spectrumRecommendation) {
      if (activeSpectrumBand === '2.4') {
        const c1 = chanCounts[1] || 0;
        const c6 = chanCounts[6] || 0;
        const c11 = chanCounts[11] || 0;
        let cleanest = 1, minCount = c1;
        if (c6 < minCount) { cleanest = 6; minCount = c6; }
        if (c11 < minCount) { cleanest = 11; minCount = c11; }
        spectrumRecommendation.innerHTML = `<i class="fa-solid fa-lightbulb" style="color: var(--accent-amber); margin-right: 0.3rem;"></i> Canal 2.4 GHz más libre: <strong>Canal ${cleanest}</strong> (${minCount} APs)`;
      } else if (activeSpectrumBand === '5') {
        spectrumRecommendation.innerHTML = `<i class="fa-solid fa-shield-halved" style="color: var(--accent-emerald); margin-right: 0.3rem;"></i> 5 GHz: Menor solapamiento y canales de 40/80 MHz`;
      } else {
        spectrumRecommendation.innerHTML = `<i class="fa-solid fa-bolt" style="color: var(--accent-cyan); margin-right: 0.3rem;"></i> 6 GHz / 7 GHz: Cero interferencia de redes legadas`;
      }
    }
  }

  // --- Spectrum Event Handlers & Tooltips ---
  if (spectrumBandSelector) {
    spectrumBandSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !btn.dataset.band) return;
      activeSpectrumBand = btn.dataset.band;
      spectrumBandSelector.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      drawWifiSpectrum();
    });
  }

  if (btnSpectrumFilterSsid) {
    btnSpectrumFilterSsid.addEventListener('click', () => {
      spectrumOnlySameSsid = !spectrumOnlySameSsid;
      if (spectrumFilterLabel) {
        spectrumFilterLabel.textContent = spectrumOnlySameSsid ? 'Solo mi Red' : 'Todos';
      }
      btnSpectrumFilterSsid.classList.toggle('active', spectrumOnlySameSsid);
      drawWifiSpectrum();
    });
  }

  if (btnRefreshSpectrum) {
    btnRefreshSpectrum.addEventListener('click', () => {
      loadApScanner();
    });
  }

  if (wifiSpectrumCanvas) {
    wifiSpectrumCanvas.addEventListener('mousemove', (e) => {
      const container = wifiSpectrumCanvas.parentElement;
      const rect = container ? container.getBoundingClientRect() : wifiSpectrumCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      let found = null;
      let minDistance = 28;

      const visibleAps = cachedSpectrumAps.filter(a => a.band === activeSpectrumBand && a.chanNum > 0);
      visibleAps.forEach(ap => {
        if (!ap._curvePeakX) return;
        const dx = Math.abs(mx - ap._curvePeakX);
        const dy = Math.abs(my - ap._curvePeakY);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          found = ap;
        }
      });

      if (found !== hoveredSpectrumAp) {
        hoveredSpectrumAp = found;
        drawWifiSpectrum();
      }

      if (found && spectrumTooltip) {
        const color = getSpectrumColor(found.ssid, found.bssid);
        spectrumTooltip.style.display = 'block';
        spectrumTooltip.style.left = `${Math.min(rect.width - 240, Math.max(10, mx - 100))}px`;
        spectrumTooltip.style.top = `${Math.max(10, my - 110)}px`;
        spectrumTooltip.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.4rem; font-weight: 700; margin-bottom: 0.3rem;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
            <span style="color: #fff;">${escapeHtml(found.ssid || 'Oculto')}</span>
            ${found.active ? '<span class="badge" style="font-size: 0.65rem; padding: 0.1rem 0.35rem; background: #059669; color: #fff;">CONECTADO</span>' : ''}
          </div>
          <div style="font-size: 0.74rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 0.2rem;">
            <div>BSSID: <span style="font-family: monospace; color: #fff;">${escapeHtml(found.bssid)}</span></div>
            ${found.ap_name ? `<div>AP Asignado: <strong style="color: #38bdf8;">${escapeHtml(found.ap_name)}</strong></div>` : ''}
            <div>Canal: <strong style="color: #fff;">Ch ${found.chanNum}</strong> (${found.freqNum || '--'} MHz)</div>
            <div>Señal: <strong style="color: ${color};">${found.signalPct}% (${found.dbm} dBm)</strong></div>
            <div>Fabricante: <span style="color: #94a3b8;">${escapeHtml(found.vendor || 'Desconocido')}</span></div>
          </div>
        `;
      } else if (!found && spectrumTooltip) {
        spectrumTooltip.style.display = 'none';
      }
    });

    wifiSpectrumCanvas.addEventListener('mouseleave', () => {
      hoveredSpectrumAp = null;
      if (spectrumTooltip) spectrumTooltip.style.display = 'none';
      drawWifiSpectrum();
    });

    window.addEventListener('resize', () => {
      drawWifiSpectrum();
    });
  }

  // --- Tab 5: Sedes & Zonas Manager ---
  async function loadSedesAndZones() {
    try {
      const [resLocs, resZones] = await Promise.all([
        fetch('/api/locations?configured_only=1'),
        fetch('/api/zones')
      ]);
      const dataLocs = await resLocs.json();
      const zonesMap = await resZones.json();

      const locs = (dataLocs.locations && dataLocs.locations.length > 0)
        ? dataLocs.locations
        : Object.keys(zonesMap);

      sedesCardsContainer.innerHTML = locs.map(l => {
        const zones = zonesMap[l] || [];
        return `
          <div class="sede-card">
            <div class="sede-card-header">
              <div class="sede-card-title">
                <i class="fa-solid fa-building"></i> ${escapeHtml(l.replace(/_/g, ' '))}
                <span class="badge" style="font-size: 0.72rem; padding: 0.15rem 0.45rem; background: rgba(79, 70, 229, 0.1); color: var(--accent-cyan); font-weight: 600;">${zones.length} zonas</span>
              </div>
              <button class="btn-icon-danger" onclick="deleteSede('${escapeHtml(l)}')" title="Eliminar Sede"><i class="fa-solid fa-trash"></i></button>
            </div>
            <div class="zone-chips-container">
              ${zones.map(z => `
                <span class="zone-chip" style="display: inline-flex; align-items: center; gap: 0.35rem;">
                  <span>${escapeHtml(z)}</span>
                  <i class="fa-solid fa-xmark zone-delete-btn" onclick="deleteSingleZone('${escapeHtml(l)}', '${escapeHtml(z)}')" title="Eliminar zona" style="cursor: pointer; opacity: 0.55; font-size: 0.72rem; margin-left: 0.15rem;"></i>
                </span>
              `).join('')}
              <button class="zone-chip" style="background: rgba(79, 70, 229, 0.12); color: var(--accent-cyan); border-color: var(--accent-cyan); cursor: pointer; font-weight: 600;" onclick="promptAddZone('${escapeHtml(l)}')">
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

  window.deleteSingleZone = async function(loc, zone) {
    if (confirm(`¿Eliminar la zona "${zone}" de la sede "${loc.replace(/_/g, ' ')}"?`)) {
      try {
        await fetch('/api/zones/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: loc, zone: zone })
        });
        loadSedesAndZones();
        loadLocationsAndZones();
      } catch (e) {
        console.error("Error eliminando zona:", e);
      }
    }
  };

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
    const origHtml = btnSyncSedesJson.innerHTML;
    btnSyncSedesJson.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Recargando...';
    btnSyncSedesJson.disabled = true;
    try {
      const res = await fetch('/api/locations/sync', { method: 'POST' });
      const data = await res.json();
      await loadSedesAndZones();
      await loadLocationsAndZones();
      alert("Sedes y Zonas recargadas exitosamente desde sedes_zonas.json");
    } catch (e) {
      alert("Error al recargar sedes_zonas.json: " + e.message);
    } finally {
      btnSyncSedesJson.innerHTML = origHtml;
      btnSyncSedesJson.disabled = false;
    }
  });

  if (btnImportSedesFile && inputFileSedesZonas) {
    btnImportSedesFile.addEventListener('click', () => {
      inputFileSedesZonas.click();
    });

    inputFileSedesZonas.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const fileContent = evt.target.result;
        try {
          btnImportSedesFile.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
          btnImportSedesFile.disabled = true;

          const res = await fetch('/api/locations/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: fileContent, overwrite: false })
          });
          const data = await res.json();
          if (res.ok && data.status === 'success') {
            await loadLocationsAndZones();
            await loadSedesAndZones();
            alert(`✅ Archivo cargado correctamente:\n• Total sedes: ${data.sedes_count}\n• Total zonas: ${data.zones_count}\n• Nuevas sedes añadidas: ${data.imported_sedes}\n• Nuevas zonas añadidas: ${data.imported_zones}`);
          } else {
            alert("❌ Error al procesar archivo: " + (data.message || "Formato de archivo no reconocido"));
          }
        } catch (err) {
          alert("❌ Error al cargar archivo: " + err);
        } finally {
          btnImportSedesFile.innerHTML = '<i class="fa-solid fa-file-arrow-up"></i> Cargar Archivo (JSON / CSV)';
          btnImportSedesFile.disabled = false;
          inputFileSedesZonas.value = '';
        }
      };
      reader.readAsText(file, 'UTF-8');
    });
  }

  if (btnExportSedesJson) {
    btnExportSedesJson.addEventListener('click', () => {
      window.location.href = '/api/export?type=sedes-zonas-json';
    });
  }

  if (btnExportSedesCsv) {
    btnExportSedesCsv.addEventListener('click', () => {
      window.location.href = '/api/export?type=sedes-zonas-csv';
    });
  }

  // --- Tab 6: Statistics & Audit Scope ---
  function setDatePreset(preset) {
    if (btnStatsToday) btnStatsToday.classList.remove('active');
    if (btnStats7d) btnStats7d.classList.remove('active');
    if (btnStatsAll) btnStatsAll.classList.remove('active');

    const now = new Date();
    const formatYMD = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (preset === 'today') {
      const todayStr = formatYMD(now);
      if (statsStartDate) statsStartDate.value = todayStr;
      if (statsEndDate) statsEndDate.value = todayStr;
      if (btnStatsToday) btnStatsToday.classList.add('active');
    } else if (preset === '7d') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (statsStartDate) statsStartDate.value = formatYMD(past);
      if (statsEndDate) statsEndDate.value = formatYMD(now);
      if (btnStats7d) btnStats7d.classList.add('active');
    } else if (preset === 'all') {
      if (statsStartDate) statsStartDate.value = '';
      if (statsEndDate) statsEndDate.value = '';
      if (btnStatsAll) btnStatsAll.classList.add('active');
    }
    loadStatistics();
  }

  if (btnStatsToday) btnStatsToday.addEventListener('click', () => setDatePreset('today'));
  if (btnStats7d) btnStats7d.addEventListener('click', () => setDatePreset('7d'));
  if (btnStatsAll) btnStatsAll.addEventListener('click', () => setDatePreset('all'));

  if (statsStartDate) {
    statsStartDate.addEventListener('change', () => {
      if (btnStatsToday) btnStatsToday.classList.remove('active');
      if (btnStats7d) btnStats7d.classList.remove('active');
      if (btnStatsAll) btnStatsAll.classList.remove('active');
      loadStatistics();
    });
  }

  if (statsEndDate) {
    statsEndDate.addEventListener('change', () => {
      if (btnStatsToday) btnStatsToday.classList.remove('active');
      if (btnStats7d) btnStats7d.classList.remove('active');
      if (btnStatsAll) btnStatsAll.classList.remove('active');
      loadStatistics();
    });
  }

  if (statsLocationSelect) {
    statsLocationSelect.addEventListener('change', () => {
      populateStatsZones(statsLocationSelect.value, 'all');
      loadStatistics();
    });
  }

  if (statsZoneSelect) {
    statsZoneSelect.addEventListener('change', () => {
      loadStatistics();
    });
  }

  if (btnApplyStatsFilter) {
    btnApplyStatsFilter.addEventListener('click', () => {
      loadStatistics();
    });
  }

  async function loadStatistics() {
    try {
      const loc = statsLocationSelect ? statsLocationSelect.value : (selLocation ? selLocation.value : 'all');
      const zone = statsZoneSelect ? statsZoneSelect.value : (selZone ? selZone.value : 'all');
      const start = statsStartDate ? statsStartDate.value : '';
      const end = statsEndDate ? statsEndDate.value : '';

      let url = `/api/stats?location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`;
      if (start) url += `&start_date=${encodeURIComponent(start)}`;
      if (end) url += `&end_date=${encodeURIComponent(end)}`;

      const res = await fetch(url);
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

  const btnExportAuditZip = document.getElementById('btn-export-audit-zip');
  const btnExportOptionsToggle = document.getElementById('btn-export-options-toggle');
  const exportOptionsMenu = document.getElementById('export-options-menu');
  const btnExportOptZip = document.getElementById('btn-export-opt-zip');
  const btnExportOptRoaming = document.getElementById('btn-export-opt-roaming');
  const btnExportOptHttp = document.getElementById('btn-export-opt-http');
  const btnExportOptIcmp = document.getElementById('btn-export-opt-icmp');
  const btnExportOptTelemetry = document.getElementById('btn-export-opt-telemetry');
  const btnExportOptClear = document.getElementById('btn-export-opt-clear');
  const btnClearDbStats = document.getElementById('btn-clear-db-stats');

  function triggerExport(type, format = '') {
    const loc = statsLocationSelect ? statsLocationSelect.value : (selLocation ? selLocation.value : 'all');
    const zone = statsZoneSelect ? statsZoneSelect.value : (selZone ? selZone.value : 'all');
    const start = statsStartDate ? statsStartDate.value : '';
    const end = statsEndDate ? statsEndDate.value : '';

    let url = `/api/export?type=${encodeURIComponent(type)}&location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`;
    if (start) url += `&start_date=${encodeURIComponent(start)}`;
    if (end) url += `&end_date=${encodeURIComponent(end)}`;
    if (format) url += `&format=${encodeURIComponent(format)}`;
    window.location.href = url;
  }

  if (btnExportAuditZip) {
    btnExportAuditZip.addEventListener('click', () => triggerExport('all', 'zip'));
  }
  if (btnExportOptZip) {
    btnExportOptZip.addEventListener('click', () => {
      triggerExport('all', 'zip');
      if (exportOptionsMenu) exportOptionsMenu.style.display = 'none';
    });
  }
  if (btnExportOptRoaming) {
    btnExportOptRoaming.addEventListener('click', () => {
      triggerExport('roaming');
      if (exportOptionsMenu) exportOptionsMenu.style.display = 'none';
    });
  }
  if (btnExportOptHttp) {
    btnExportOptHttp.addEventListener('click', () => {
      triggerExport('http');
      if (exportOptionsMenu) exportOptionsMenu.style.display = 'none';
    });
  }
  if (btnExportOptIcmp) {
    btnExportOptIcmp.addEventListener('click', () => {
      triggerExport('icmp');
      if (exportOptionsMenu) exportOptionsMenu.style.display = 'none';
    });
  }
  if (btnExportOptTelemetry) {
    btnExportOptTelemetry.addEventListener('click', () => {
      triggerExport('telemetry');
      if (exportOptionsMenu) exportOptionsMenu.style.display = 'none';
    });
  }
  if (btnExportTelemetryCsv) {
    btnExportTelemetryCsv.addEventListener('click', () => triggerExport('telemetry'));
  }
  if (btnExportQuick) {
    btnExportQuick.addEventListener('click', () => triggerExport('all', 'zip'));
  }

  // Clear Database from Tab 6 (Estadísticas & Auditoría)
  async function handleClearDatabaseAudit() {
    const confirmMsg = 
      "⚠️ ADVERTENCIA: ¿Estás seguro de que deseas vaciar TODOS los registros de auditoría de la Base de Datos?\n\n" +
      "Se eliminarán de forma irreversible:\n" +
      "• Todas las muestras de Telemetría (Señal dBm, Ping, Jitter)\n" +
      "• Todos los eventos de Roaming (Handoffs)\n" +
      "• El historial de fases de Latencia HTTP (Capa 7)\n" +
      "• El historial de diagnóstico de red ICMP y Traceroute\n\n" +
      "(Los nombres de APs, sedes/zonas y parámetros de configuración se conservarán intactos).\n\n" +
      "¿Deseas continuar con la purga total de la base de datos?";

    if (!confirm(confirmMsg)) return;

    if (exportOptionsMenu) exportOptionsMenu.style.display = 'none';

    if (btnClearDbStats) {
      btnClearDbStats.disabled = true;
      btnClearDbStats.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Limpiando...';
    }

    try {
      const res = await fetch('/api/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all' })
      });
      const data = await res.json();
      if (data.status === 'success') {
        alert("¡Base de datos limpiada con éxito!\nSe han reiniciado los contadores y registros de auditoría.");
        loadStatistics();
        loadRoamingHistory();
        loadHttpPhasesHistory();
        loadNetDiagView();
        fetchStatus();
      } else {
        alert("Error al limpiar la base de datos: " + (data.message || 'Error desconocido'));
      }
    } catch (err) {
      alert("Error de conexión al limpiar la base de datos: " + err);
    } finally {
      if (btnClearDbStats) {
        btnClearDbStats.disabled = false;
        btnClearDbStats.innerHTML = '<i class="fa-solid fa-trash-can"></i> Limpiar BD';
      }
    }
  }

  if (btnClearDbStats) {
    btnClearDbStats.addEventListener('click', handleClearDatabaseAudit);
  }
  if (btnExportOptClear) {
    btnExportOptClear.addEventListener('click', handleClearDatabaseAudit);
  }

  if (btnExportOptionsToggle && exportOptionsMenu) {
    btnExportOptionsToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = exportOptionsMenu.style.display === 'block';
      exportOptionsMenu.style.display = isVisible ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      if (!exportOptionsMenu.contains(e.target) && e.target !== btnExportOptionsToggle) {
        exportOptionsMenu.style.display = 'none';
      }
    });
  }

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
      if (cfgNetDiagInterval) cfgNetDiagInterval.value = cfg.net_diag_interval_minutes || 10;
      if (cfgCaptureEnabled) {
        const isCap = !(cfg.capture_enabled === '0' || cfg.capture_enabled === 0 || cfg.capture_enabled === false);
        cfgCaptureEnabled.value = isCap ? '1' : '0';
        if (cfgCaptureStatusText) {
          cfgCaptureStatusText.textContent = isCap ? 'Activa' : 'Pausada';
          cfgCaptureStatusText.style.color = isCap ? 'var(--accent-emerald)' : '#f59e0b';
        }
      }

      // Auth inputs
      if (cfgAuthEnabled) {
        cfgAuthEnabled.checked = (cfg.auth_enabled === '1' || cfg.auth_enabled === 1 || cfg.auth_enabled === true);
      }
      if (cfgAuthType) cfgAuthType.value = cfg.auth_type || 'ntlm';
      if (cfgAuthDomain) cfgAuthDomain.value = cfg.auth_domain || '';
      if (cfgAuthUser) cfgAuthUser.value = cfg.auth_user || '';
      if (cfgAuthPassword) cfgAuthPassword.value = cfg.auth_password || '';
      if (cfgAuthToken) cfgAuthToken.value = cfg.auth_token || '';
      updateAuthFieldsVisibility();

      // AP Names Inventory
      allApList = aps.aps || [];
      if (apCountBadge) apCountBadge.textContent = `${allApList.length} APs`;
      applyApFilterAndRender();

      // IEEE OUI Vendor Database & MAC Management
      fetchOuiInfo();
      searchOuiVendors(ouiSearchInput ? ouiSearchInput.value.trim() : '');
      checkOuiUpdateStatus();
    } catch (e) {
      console.error("Error cargando configuración:", e);
    }
  }

  function applyApFilterAndRender() {
    const q = inputSearchApNames ? inputSearchApNames.value.trim().toLowerCase() : '';
    let filtered = allApList;
    if (q) {
      filtered = allApList.filter(a => {
        const mac = (a.bssid || a.mac || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        const loc = (a.location || '').toLowerCase();
        const mod = (a.model || '').toLowerCase();
        return mac.includes(q) || name.includes(q) || loc.includes(q) || mod.includes(q);
      });
    }

    if (apFilteredInfo) {
      if (q) {
        apFilteredInfo.textContent = `Mostrando ${filtered.length} de ${allApList.length} APs`;
      } else {
        apFilteredInfo.textContent = `Mostrando ${allApList.length} APs registrados`;
      }
    }
    renderApNamesTable(filtered);
  }

  if (inputSearchApNames) {
    inputSearchApNames.addEventListener('input', applyApFilterAndRender);
  }

  function renderApNamesTable(apList) {
    if (!apNamesTableBody) return;
    if (apList.length === 0) {
      apNamesTableBody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding: 1.5rem;"><i class="fa-solid fa-tags"></i><p>No se encontraron Access Points registrados.</p></div></td></tr>`;
      return;
    }
    apNamesTableBody.innerHTML = apList.map(a => {
      const bssid = a.bssid || a.mac || '';
      const locMod = [a.location, a.model].filter(Boolean).join(' • ') || '<span style="color: var(--text-muted); font-size: 0.8rem;">--</span>';
      return `
        <tr>
          <td style="font-family: monospace; font-weight: 600; color: #334155;">${escapeHtml(bssid)}</td>
          <td><strong style="color: var(--accent-cyan);">${escapeHtml(a.name)}</strong></td>
          <td style="color: var(--text-secondary);">${locMod}</td>
          <td style="text-align: center;">
            <button class="btn-icon-danger" onclick="removeApName('${escapeHtml(bssid)}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.removeApName = async function(bssid) {
    await fetch('/api/ap-names/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bssid: bssid })
    });
    loadConfigView();
  };

  if (btnAddApname) {
    btnAddApname.addEventListener('click', async () => {
      const bssid = inputNewBssid.value.trim();
      const name = inputNewApname.value.trim();
      const loc = inputNewAploc ? inputNewAploc.value.trim() : '';
      if (!bssid || !name) {
        alert("Por favor ingresa tanto el BSSID (MAC) como el Nombre del AP.");
        return;
      }
      try {
        const res = await fetch('/api/ap-names/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bssid, name, location: loc })
        });
        const data = await res.json();
        if (data.status === 'success') {
          inputNewBssid.value = '';
          inputNewApname.value = '';
          if (inputNewAploc) inputNewAploc.value = '';
          loadConfigView();
        } else {
          alert("Error: " + data.message);
        }
      } catch (e) {
        alert("Error guardando AP: " + e);
      }
    });
  }

  // --- CSV Import / Export / Clear for AP Names ---
  if (btnImportApCsv && inputCsvApNames) {
    btnImportApCsv.addEventListener('click', () => {
      inputCsvApNames.value = '';
      inputCsvApNames.click();
    });

    inputCsvApNames.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const originalHtml = btnImportApCsv.innerHTML;
      btnImportApCsv.disabled = true;
      btnImportApCsv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analizando CSV...';

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const csvText = evt.target.result;
          const res = await fetch('/api/ap-names/import-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv_content: csvText })
          });
          const data = await res.json();
          if (data.status === 'success') {
            let msg = `¡Importación completada con éxito!\n\n• Nuevos APs registrados: ${data.added}\n• APs actualizados: ${data.updated}\n• Total en inventario: ${data.total}`;
            if (data.errors && data.errors.length > 0) {
              msg += `\n\nAvisos (${data.errors.length}):\n${data.errors.slice(0, 5).join('\n')}`;
            }
            alert(msg);
            loadConfigView();
          } else {
            alert("Error al importar CSV: " + (data.message || 'Formato no reconocido'));
          }
        } catch (err) {
          alert("Error de procesamiento: " + err);
        } finally {
          btnImportApCsv.disabled = false;
          btnImportApCsv.innerHTML = originalHtml;
        }
      };
      reader.onerror = () => {
        alert("Error al leer el archivo seleccionado.");
        btnImportApCsv.disabled = false;
        btnImportApCsv.innerHTML = originalHtml;
      };
      reader.readAsText(file);
    });
  }

  if (btnExportApCsv) {
    btnExportApCsv.addEventListener('click', () => {
      window.location.href = '/api/export?type=ap-names';
    });
  }

  if (btnClearAllAps) {
    btnClearAllAps.addEventListener('click', async () => {
      if (!confirm("¿Estás seguro de que deseas eliminar TODOS los nombres de APs registrados en la base de datos?\nEsta acción no se puede deshacer.")) {
        return;
      }
      try {
        await fetch('/api/ap-names/clear', { method: 'POST' });
        alert("Base de datos de APs limpiada.");
        loadConfigView();
      } catch (e) {
        alert("Error al limpiar APs: " + e);
      }
    });
  }

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
      capture_enabled: cfgCaptureEnabled ? cfgCaptureEnabled.value : '1',
      probe_interval_seconds: cfgProbeInterval.value,
      probe_timeout_seconds: cfgProbeTimeout.value,
      verify_ssl: cfgVerifySsl.value,
      extra_ping_targets: cfgExtraPing.value.trim(),
      net_diag_interval_minutes: cfgNetDiagInterval ? cfgNetDiagInterval.value : 10
    });
    alert("Configuración de telemetría guardada.");
  });

  // --- Enterprise Authentication Controls ---
  function updateAuthFieldsVisibility() {
    if (!cfgAuthType) return;
    const authType = cfgAuthType.value;
    if (authType === 'bearer') {
      if (grpAuthDomain) grpAuthDomain.style.display = 'none';
      if (grpAuthUser) grpAuthUser.style.display = 'none';
      if (grpAuthPassword) grpAuthPassword.style.display = 'none';
      if (grpAuthToken) grpAuthToken.style.display = 'block';
    } else if (authType === 'basic') {
      if (grpAuthDomain) grpAuthDomain.style.display = 'none';
      if (grpAuthUser) grpAuthUser.style.display = 'block';
      if (grpAuthPassword) grpAuthPassword.style.display = 'block';
      if (grpAuthToken) grpAuthToken.style.display = 'none';
    } else { // 'ntlm'
      if (grpAuthDomain) grpAuthDomain.style.display = 'block';
      if (grpAuthUser) grpAuthUser.style.display = 'block';
      if (grpAuthPassword) grpAuthPassword.style.display = 'block';
      if (grpAuthToken) grpAuthToken.style.display = 'none';
    }

    const enabledLabel = document.getElementById('cfg-auth-enabled-label');
    if (cfgAuthEnabled && enabledLabel) {
      enabledLabel.textContent = cfgAuthEnabled.checked ? 'Autenticación Habilitada' : 'Habilitar Autenticación';
      enabledLabel.style.color = cfgAuthEnabled.checked ? 'var(--accent-emerald, #10b981)' : 'var(--text-muted, #94a3b8)';
    }
  }

  if (cfgAuthEnabled) {
    cfgAuthEnabled.addEventListener('change', updateAuthFieldsVisibility);
  }
  if (cfgAuthType) {
    cfgAuthType.addEventListener('change', updateAuthFieldsVisibility);
  }
  if (btnTogglePwd && cfgAuthPassword) {
    btnTogglePwd.addEventListener('click', () => {
      const isPwd = cfgAuthPassword.type === 'password';
      cfgAuthPassword.type = isPwd ? 'text' : 'password';
      btnTogglePwd.innerHTML = isPwd ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    });
  }

  async function collectAndSaveAuth() {
    const payload = {
      auth_enabled: (cfgAuthEnabled && cfgAuthEnabled.checked) ? '1' : '0',
      auth_type: cfgAuthType ? cfgAuthType.value : 'ntlm',
      auth_domain: cfgAuthDomain ? cfgAuthDomain.value.trim() : '',
      auth_user: cfgAuthUser ? cfgAuthUser.value.trim() : '',
      auth_password: cfgAuthPassword ? cfgAuthPassword.value : '',
      auth_token: cfgAuthToken ? cfgAuthToken.value.trim() : ''
    };
    await saveConfig(payload);
    return payload;
  }

  if (btnSaveAuth) {
    btnSaveAuth.addEventListener('click', async () => {
      btnSaveAuth.disabled = true;
      btnSaveAuth.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';
      try {
        await collectAndSaveAuth();
        alert("Configuración de autenticación guardada exitosamente.");
        fetchStatus();
      } catch (e) {
        alert("Error guardando autenticación: " + e);
      } finally {
        btnSaveAuth.disabled = false;
        btnSaveAuth.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Autenticación';
      }
    });
  }

  if (btnTestAuth) {
    btnTestAuth.addEventListener('click', async () => {
      btnTestAuth.disabled = true;
      btnTestAuth.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probando credenciales...';
      try {
        await collectAndSaveAuth();
        const res = await fetch('/api/probe/now', { method: 'POST' });
        const data = await res.json();
        const code = data.status_code || 0;
        const latency = (data.total_ms !== null && data.total_ms !== undefined) ? `${data.total_ms} ms` : 'N/A';
        if (code >= 200 && code < 400) {
          alert(`¡Autenticación Exitosa!\nCódigo HTTP: ${code}\nLatencia Total: ${latency}\nDestino: ${data.target || 'URL configurada'}`);
        } else if (code === 401 || code === 403) {
          alert(`Fallo de Autenticación (Código HTTP ${code}):\nCredenciales rechazadas por el servidor de destino.\nRevisa el dominio, usuario, contraseña o token.`);
        } else {
          alert(`Resultado de Prueba:\nCódigo HTTP: ${code}\nLatencia: ${latency}\n${data.error_message ? 'Detalle: ' + data.error_message : ''}`);
        }
        fetchStatus();
      } catch (e) {
        alert("Error al probar autenticación: " + e);
      } finally {
        btnTestAuth.disabled = false;
        btnTestAuth.innerHTML = '<i class="fa-solid fa-key"></i> Probar Credenciales Ahora';
      }
    });
  }

  // --- IEEE OUI Vendor Database & MAC Management ---
  async function fetchOuiInfo() {
    try {
      const res = await fetch('/api/oui');
      const data = await res.json();
      const total = Number(data.total || 0).toLocaleString();
      const custom = Number(data.custom_count || 0).toLocaleString();
      if (ouiStatTotal) ouiStatTotal.textContent = total;
      if (ouiStatCustom) ouiStatCustom.textContent = custom;
      if (ouiStatUpdated) ouiStatUpdated.textContent = data.last_updated || 'Desconocido';
      if (ouiStatBadge) ouiStatBadge.textContent = `${total} Fabricantes`;
    } catch (e) {
      console.error("Error al cargar estadísticas OUI:", e);
    }
  }

  async function searchOuiVendors(query = '') {
    if (!ouiTableBody) return;
    try {
      ouiTableBody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i><p>Consultando asignaciones OUI...</p></div></td></tr>`;
      const url = query ? `/api/oui/search?q=${encodeURIComponent(query)}&limit=100` : `/api/oui/search?limit=50`;
      const res = await fetch(url);
      const data = await res.json();
      const results = data.results || [];
      if (results.length === 0) {
        ouiTableBody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding: 1.5rem;"><i class="fa-solid fa-magnifying-glass"></i><p>No se encontraron fabricantes que coincidan con "${escapeHtml(query)}".</p></div></td></tr>`;
        return;
      }
      ouiTableBody.innerHTML = results.map(item => {
        const isCustom = item.is_custom;
        const typeBadge = isCustom 
          ? `<span class="badge badge-oui-custom"><i class="fa-solid fa-sliders"></i> Personalizado</span>`
          : `<span class="badge badge-oui-ieee"><i class="fa-solid fa-shield-check"></i> Oficial IEEE</span>`;
        const actionBtn = isCustom
          ? `<button class="btn-icon-danger" onclick="removeCustomOui('${escapeHtml(item.prefix)}')" title="Eliminar prefijo personalizado"><i class="fa-solid fa-trash"></i></button>`
          : `<span style="color: var(--text-muted); font-size: 0.8rem;">--</span>`;
        return `
          <tr>
            <td style="font-family: monospace; font-weight: 700; color: #1e293b; letter-spacing: 0.05em;">${escapeHtml(item.prefix)}</td>
            <td><strong style="color: var(--accent-cyan);">${escapeHtml(item.vendor)}</strong></td>
            <td>${typeBadge}</td>
            <td style="text-align: center;">${actionBtn}</td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error("Error buscando fabricantes OUI:", e);
      ouiTableBody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding: 1.5rem; color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i><p>Error al cargar resultados de fabricantes.</p></div></td></tr>`;
    }
  }

  window.removeCustomOui = async function(prefix) {
    if (!confirm(`¿Eliminar la personalización para el prefijo OUI ${prefix}?`)) return;
    try {
      const res = await fetch('/api/oui/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix })
      });
      const data = await res.json();
      if (data.status === 'success') {
        await fetchOuiInfo();
        const currentQuery = ouiSearchInput ? ouiSearchInput.value.trim() : '';
        searchOuiVendors(currentQuery);
      } else {
        alert("Error al eliminar OUI: " + (data.message || ''));
      }
    } catch (e) {
      alert("Error en la solicitud: " + e);
    }
  };

  async function checkOuiUpdateStatus() {
    try {
      const res = await fetch('/api/oui/status');
      const data = await res.json();
      const isUpdating = (data.status === 'downloading' || data.status === 'processing');
      if (isUpdating) {
        if (ouiUpdateBanner) ouiUpdateBanner.style.display = 'flex';
        if (ouiUpdateStatusText) {
          ouiUpdateStatusText.textContent = data.message || `Actualizando base de datos IEEE (${data.progress}%)...`;
        }
        if (btnUpdateOui) {
          btnUpdateOui.disabled = true;
          btnUpdateOui.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
        }
      } else {
        if (ouiUpdateInterval) {
          clearInterval(ouiUpdateInterval);
          ouiUpdateInterval = null;
        }
        if (btnUpdateOui) {
          btnUpdateOui.disabled = false;
          btnUpdateOui.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Actualizar desde IEEE';
        }
        if (data.status === 'completed') {
          if (ouiUpdateBanner) {
            ouiUpdateBanner.style.display = 'flex';
            if (ouiUpdateStatusText) ouiUpdateStatusText.textContent = data.message || '¡Actualización IEEE completada con éxito!';
            setTimeout(() => {
              if (ouiUpdateBanner && !ouiUpdateInterval) ouiUpdateBanner.style.display = 'none';
            }, 6000);
          }
        } else if (data.status === 'error') {
          if (ouiUpdateBanner) {
            ouiUpdateBanner.style.display = 'flex';
            if (ouiUpdateStatusText) ouiUpdateStatusText.textContent = data.message || 'Error durante la actualización desde IEEE.';
          }
        } else {
          if (ouiUpdateBanner) ouiUpdateBanner.style.display = 'none';
        }
        fetchOuiInfo();
      }
    } catch (e) {
      console.error("Error consultando estado de actualización OUI:", e);
    }
  }

  if (btnUpdateOui) {
    btnUpdateOui.addEventListener('click', async () => {
      if (!confirm("¿Deseas descargar la versión más reciente del registro oficial de fabricantes del IEEE (MA-L)?\nEste proceso se realiza en segundo plano y toma unos segundos.")) {
        return;
      }
      try {
        btnUpdateOui.disabled = true;
        btnUpdateOui.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
        if (ouiUpdateBanner) ouiUpdateBanner.style.display = 'flex';
        if (ouiUpdateStatusText) ouiUpdateStatusText.textContent = 'Iniciando descarga desde IEEE...';

        const res = await fetch('/api/oui/update', { method: 'POST' });
        const data = await res.json();

        if (data.status === 'in_progress' || data.status === 'started' || data.status === 'updating') {
          if (ouiUpdateInterval) clearInterval(ouiUpdateInterval);
          ouiUpdateInterval = setInterval(checkOuiUpdateStatus, 1000);
        } else {
          alert("Respuesta: " + (data.message || data.status));
          checkOuiUpdateStatus();
        }
      } catch (e) {
        alert("Error al iniciar actualización: " + e);
        if (btnUpdateOui) {
          btnUpdateOui.disabled = false;
          btnUpdateOui.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Actualizar desde IEEE';
        }
      }
    });
  }

  if (btnToggleAddOui && ouiAddFormContainer) {
    btnToggleAddOui.addEventListener('click', () => {
      const isHidden = ouiAddFormContainer.style.display === 'none' || !ouiAddFormContainer.style.display;
      ouiAddFormContainer.style.display = isHidden ? 'block' : 'none';
      if (isHidden && ouiInputPrefix) ouiInputPrefix.focus();
    });
  }

  if (btnCancelCustomOui && ouiAddFormContainer) {
    btnCancelCustomOui.addEventListener('click', () => {
      ouiAddFormContainer.style.display = 'none';
      if (ouiInputPrefix) ouiInputPrefix.value = '';
      if (ouiInputVendor) ouiInputVendor.value = '';
    });
  }

  if (btnSaveCustomOui) {
    btnSaveCustomOui.addEventListener('click', async () => {
      const prefix = ouiInputPrefix ? ouiInputPrefix.value.trim() : '';
      const vendor = ouiInputVendor ? ouiInputVendor.value.trim() : '';

      if (!prefix || !vendor) {
        alert("Por favor ingresa tanto el prefijo MAC (3 octetos) como el nombre del fabricante.");
        return;
      }

      btnSaveCustomOui.disabled = true;
      btnSaveCustomOui.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

      try {
        const res = await fetch('/api/oui/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, vendor })
        });
        const data = await res.json();
        if (data.status === 'success') {
          if (ouiInputPrefix) ouiInputPrefix.value = '';
          if (ouiInputVendor) ouiInputVendor.value = '';
          if (ouiAddFormContainer) ouiAddFormContainer.style.display = 'none';
          await fetchOuiInfo();
          const currentQuery = ouiSearchInput ? ouiSearchInput.value.trim() : '';
          searchOuiVendors(currentQuery);
        } else {
          alert("Error: " + (data.message || 'No se pudo guardar'));
        }
      } catch (e) {
        alert("Error de conexión: " + e);
      } finally {
        btnSaveCustomOui.disabled = false;
        btnSaveCustomOui.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Prefijo';
      }
    });
  }

  if (ouiSearchInput) {
    ouiSearchInput.addEventListener('input', () => {
      clearTimeout(ouiSearchDebounceTimer);
      ouiSearchDebounceTimer = setTimeout(() => {
        searchOuiVendors(ouiSearchInput.value.trim());
      }, 300);
    });
  }

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
    loadHttpPhasesHistory();
    loadApScanner();
    loadNetDiagView();

    // Fast polling for Wi-Fi Telemetry & App probe status (every 1.5s)
    setInterval(fetchStatus, 1500);

    // Medium polling for nearby APs scan (every 4s)
    setInterval(loadApScanner, 4000);

    // Auto-refresh HTTP phases history when the tab is active (every 3.5s)
    setInterval(() => {
      const httpTab = document.getElementById('tab-http-phases');
      if (httpTab && httpTab.classList.contains('active')) {
        loadHttpPhasesHistory();
      }
    }, 3500);

    // Auto-refresh Network Diagnostics history when the tab is active (every 4s)
    setInterval(() => {
      const netTab = document.getElementById('tab-net-diag');
      if (netTab && netTab.classList.contains('active')) {
        loadNetDiagView();
      }
    }, 4000);
  }

  init();
});
