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
  const btnHeaderLocation = document.getElementById('btn-header-location');
  const headerLocationLabel = document.getElementById('header-location-label');
  const headerSsid = document.getElementById('header-ssid');
  const btnHeaderBssid = document.getElementById('btn-header-bssid');
  const headerBssid = document.getElementById('header-bssid');
  const headerPing = document.getElementById('header-ping');
  const headerAppLatency = document.getElementById('header-app-latency');
  const headerAppBadge = document.getElementById('header-app-badge');
  const headerAuthBadge = document.getElementById('header-auth-badge');
  const headerAuthStatus = document.getElementById('header-auth-status');

  // Toast & Custom Modal Elements
  const toastContainer = document.getElementById('toast-container');
  const customModalOverlay = document.getElementById('custom-modal-overlay');
  const customModalTitle = document.getElementById('custom-modal-title');
  const customModalBody = document.getElementById('custom-modal-body');
  const customModalFooter = document.getElementById('custom-modal-footer');
  const btnCloseCustomModal = document.getElementById('custom-modal-close') || document.getElementById('btn-close-custom-modal');

  function showToast(message, type = 'info', duration = 3800) {
    if (!toastContainer) return;
    const iconMap = {
      success: 'fa-circle-check',
      warn: 'fa-triangle-exclamation',
      error: 'fa-circle-xmark',
      info: 'fa-circle-info'
    };
    const item = document.createElement('div');
    item.className = `toast-item toast-${type}`;
    item.innerHTML = `
      <i class="fa-solid ${iconMap[type] || iconMap.info} toast-icon"></i>
      <div style="flex: 1; white-space: pre-line;">${escapeHtml(message)}</div>
      <button type="button" class="toast-close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
    `;
    const closeBtn = item.querySelector('.toast-close');
    const removeToast = () => {
      if (item.parentNode) item.parentNode.removeChild(item);
    };
    if (closeBtn) closeBtn.addEventListener('click', removeToast);
    toastContainer.appendChild(item);
    if (duration > 0) {
      setTimeout(removeToast, duration);
    }
  }

  function closeCustomModal() {
    if (customModalOverlay) customModalOverlay.style.display = 'none';
  }

  if (btnCloseCustomModal) {
    btnCloseCustomModal.addEventListener('click', closeCustomModal);
  }
  if (customModalOverlay) {
    customModalOverlay.addEventListener('click', (e) => {
      if (e.target === customModalOverlay) closeCustomModal();
    });
  }

  function openCustomModal({ title, icon = 'fa-sliders', bodyHtml, confirmText = 'Guardar', cancelText = 'Cancelar', danger = false, onConfirm }) {
    if (!customModalOverlay || !customModalTitle || !customModalBody || !customModalFooter) return;
    customModalTitle.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(title)}</span>`;
    customModalBody.innerHTML = bodyHtml;
    customModalFooter.innerHTML = `
      <button type="button" class="btn-secondary" id="modal-btn-cancel" style="padding: 0.45rem 0.9rem; font-size: 0.82rem;">${escapeHtml(cancelText)}</button>
      <button type="button" class="${danger ? 'btn-icon-danger' : 'btn-primary'}" id="modal-btn-confirm" style="padding: 0.45rem 1rem; font-size: 0.82rem; ${danger ? 'font-weight: 700;' : ''}">${escapeHtml(confirmText)}</button>
    `;
    customModalOverlay.style.display = 'flex';

    const firstInput = customModalBody.querySelector('input, select, textarea');
    if (firstInput) {
      setTimeout(() => {
        firstInput.focus();
        if (typeof firstInput.select === 'function') firstInput.select();
      }, 40);
    }

    const btnCancel = document.getElementById('modal-btn-cancel');
    const btnConfirm = document.getElementById('modal-btn-confirm');
    if (btnCancel) btnCancel.addEventListener('click', closeCustomModal);
    if (btnConfirm) {
      btnConfirm.addEventListener('click', async () => {
        if (onConfirm) {
          const shouldClose = await onConfirm();
          if (shouldClose !== false) closeCustomModal();
        } else {
          closeCustomModal();
        }
      });
    }
    customModalBody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && btnConfirm) {
          ev.preventDefault();
          btnConfirm.click();
        }
      });
    });
  }

  window.openQuickNameApModal = function (bssid, currentName = '', currentLoc = '') {
    const cleanBssid = (bssid || '').trim();
    if (!cleanBssid || cleanBssid === '--:--:--:--:--:--') {
      showToast('No hay un BSSID (MAC) válido seleccionado para etiquetar.', 'warn');
      return;
    }
    const defaultLoc = currentLoc || (selLocation && selLocation.value ? `${selLocation.value.replace(/_/g, ' ')}${selZone && selZone.value ? ' - ' + selZone.value : ''}` : '');
    openCustomModal({
      title: 'Asignar Alias / Nombre al AP',
      icon: 'fa-tag',
      confirmText: 'Guardar Alias',
      bodyHtml: `
        <div class="form-group" style="margin-bottom: 0.4rem;">
          <label class="form-label">Dirección MAC (BSSID)</label>
          <input type="text" id="modal-ap-bssid" class="toolbar-input" value="${escapeHtml(cleanBssid)}" readonly style="width: 100%; font-family: monospace; background: #f1f5f9; color: var(--text-secondary);">
        </div>
        <div class="form-group" style="margin-bottom: 0.4rem;">
          <label class="form-label">Nombre / Alias del AP (Controladora)</label>
          <input type="text" id="modal-ap-name" class="toolbar-input" value="${escapeHtml(currentName === '(Sin alias)' || currentName === '(Sin alias registrado)' ? '' : currentName)}" placeholder="Ej: AP-Cajas-01, AP-Bodega-Norte" style="width: 100%;">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Ubicación / Referencia Física (Opcional)</label>
          <input type="text" id="modal-ap-loc" class="toolbar-input" value="${escapeHtml(defaultLoc)}" placeholder="Ej: Pasillo Central / Columna 4" style="width: 100%;">
        </div>
      `,
      onConfirm: async () => {
        const nameVal = (document.getElementById('modal-ap-name')?.value || '').trim();
        const locVal = (document.getElementById('modal-ap-loc')?.value || '').trim();
        if (!nameVal) {
          showToast('Ingresa un nombre o alias para identificar el AP.', 'warn');
          return false;
        }
        try {
          const res = await fetch('/api/ap-names/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bssid: cleanBssid, name: nameVal, location: locVal })
          });
          const data = await res.json();
          if (data.status === 'success') {
            showToast(`AP ${cleanBssid} etiquetado como "${nameVal}"`, 'success');
            fetchStatus();
            loadApScanner();
            loadRoamingHistory();
            loadHttpPhasesHistory();
            if (document.getElementById('tab-config')?.classList.contains('active')) {
              loadConfigView();
            }
            return true;
          } else {
            showToast(data.message || 'No se pudo guardar el alias del AP.', 'error');
            return false;
          }
        } catch (err) {
          showToast('Error guardando alias del AP: ' + err, 'error');
          return false;
        }
      }
    });
  };

  function formatCompactBitrate(txRaw, rxRaw) {
    const extractMbps = (val) => {
      if (val === null || val === undefined) return '--';
      const str = String(val).trim();
      const m = str.match(/(\d+(?:\.\d+)?)\s*Mbit\/s/i) || str.match(/(\d+(?:\.\d+)?)\s*Mbps/i) || str.match(/^(\d+(?:\.\d+)?)$/);
      if (m) return m[1];
      return str.length > 12 ? str.substring(0, 12) + '…' : str;
    };
    const txMbps = extractMbps(txRaw);
    const rxMbps = extractMbps(rxRaw);
    const hasNumeric = /\d/.test(txMbps) || /\d/.test(rxMbps);
    return {
      shortText: hasNumeric ? `${txMbps} / ${rxMbps} Mbps` : `${txRaw || '--'} / ${rxRaw || '--'}`,
      fullTooltip: `TX: ${txRaw || '--'} | RX: ${rxRaw || '--'}`
    };
  }

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
  const btnQuickEditCurrentAp = document.getElementById('btn-quick-edit-current-ap');
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
  const phaseTransVal = document.getElementById('phase-trans-val');
  const barSegDns = document.getElementById('bar-seg-dns');
  const barSegTcp = document.getElementById('bar-seg-tcp');
  const barSegTls = document.getElementById('bar-seg-tls');
  const barSegTtfb = document.getElementById('bar-seg-ttfb');
  const barSegTrans = document.getElementById('bar-seg-trans');
  const infoColdTotal = document.getElementById('info-cold-total');
  const infoTargetUrl = document.getElementById('info-target-url');

  // Card 4: Roaming & Mesh
  const roamingCountBadge = document.getElementById('roaming-count-badge');
  const roamingVerdict = document.getElementById('roaming-verdict');
  const infoSameSsidCount = document.getElementById('info-same-ssid-count');
  const infoTotalApsCount = document.getElementById('info-total-aps-count');
  const btnTestRoaming = document.getElementById('btn-test-roaming');
  const btnExportQuick = document.getElementById('btn-export-quick');
  const roamingPingInlineResult = document.getElementById('roaming-ping-inline-result');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  // Tab 1: Roaming
  const roamingTableBody = document.getElementById('roaming-table-body');
  const roamingTotalCounter = document.getElementById('roaming-total-counter');
  const roamingScopeFilter = document.getElementById('roaming-scope-filter');
  const btnExportRoamingCsv = document.getElementById('btn-export-roaming-csv');
  const btnClearRoamingLog = document.getElementById('btn-clear-roaming-log');

  // Tab 2: HTTP Phases
  const phasesTargetLabel = document.getElementById('phases-target-label');
  const cardDnsVal = document.getElementById('card-dns-val');
  const cardTcpVal = document.getElementById('card-tcp-val');
  const cardTlsVal = document.getElementById('card-tls-val');
  const cardTtfbVal = document.getElementById('card-ttfb-val');
  const cardTransVal = document.getElementById('card-trans-val');
  const phaseBoxDns = document.getElementById('phase-box-dns');
  const phaseBoxTcp = document.getElementById('phase-box-tcp');
  const phaseBoxTls = document.getElementById('phase-box-tls');
  const phaseBoxTtfb = document.getElementById('phase-box-ttfb');
  const phaseBoxTrans = document.getElementById('phase-box-trans');
  const phaseBadgeDns = document.getElementById('phase-badge-dns');
  const phaseBadgeTcp = document.getElementById('phase-badge-tcp');
  const phaseBadgeTls = document.getElementById('phase-badge-tls');
  const phaseBadgeTtfb = document.getElementById('phase-badge-ttfb');
  const phaseBadgeTrans = document.getElementById('phase-badge-trans');
  const btnManualProbe = document.getElementById('btn-manual-probe');
  const httpHistoryTableBody = document.getElementById('http-history-table-body');
  const httpHistoryCounter = document.getElementById('http-history-counter');
  const httpScopeFilter = document.getElementById('http-scope-filter');
  const btnRefreshHttpHistory = document.getElementById('btn-refresh-http-history');
  const btnExportHttpHistory = document.getElementById('btn-export-http-history');

  // Tab 3: Network Diagnostics
  const btnRunDiag = document.getElementById('btn-run-diag');
  const diagResultsContainer = document.getElementById('diag-results-container');
  const selDiagRunHistory = document.getElementById('sel-diag-run-history');
  const btnRefreshNetDiag = document.getElementById('btn-refresh-net-diag');

  // Tab 4: AP Scanner
  const apScannerTableBody = document.getElementById('ap-scanner-table-body');
  const scannerApCountBadge = document.getElementById('scanner-ap-count-badge');
  const inputSearchScanner = document.getElementById('input-search-scanner');
  const btnScannerFilterSsid = document.getElementById('btn-scanner-filter-ssid');
  const scannerFilterSsidLabel = document.getElementById('scanner-filter-ssid-label');

  // Tab 5: Sedes & Zonas
  const inputFileSedesZonas = document.getElementById('input-file-sedes-zonas');
  const btnImportSedesFile = document.getElementById('btn-import-sedes-file');
  const btnExportSedesJson = document.getElementById('btn-export-sedes-json');
  const btnExportSedesCsv = document.getElementById('btn-export-sedes-csv');
  const btnSyncSedesJson = document.getElementById('btn-sync-sedes-json');
  const btnAddSedeModal = document.getElementById('btn-add-sede-modal');
  const sedesCardsContainer = document.getElementById('sedes-cards-container');
  const sedesTotalSummary = document.getElementById('sedes-total-summary');
  const inputSearchSedes = document.getElementById('input-search-sedes');

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
  const apPageSizeSelect = document.getElementById('ap-page-size-select');
  const apPaginationSummary = document.getElementById('ap-pagination-summary');
  const btnApFirstPage = document.getElementById('btn-ap-first-page');
  const btnApPrevPage = document.getElementById('btn-ap-prev-page');
  const apCurrentPageBadge = document.getElementById('ap-current-page-badge');
  const btnApNextPage = document.getElementById('btn-ap-next-page');
  const btnApLastPage = document.getElementById('btn-ap-last-page');

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
  let apPaginationState = {
    query: '',
    page: 1,
    pageSize: 50,
    total: 0,
    totalPages: 1,
    loading: false
  };
  let apSearchDebounceTimer = null;
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

  // --- Tab & Sidebar Navigation ---
  const viewTitles = {
    'tab-dashboard': 'Dashboard en Vivo',
    'tab-roaming-log': 'Historial de Roaming',
    'tab-ap-scanner': 'Escáner de APs & Espectro RF',
    'tab-http-phases': 'Fases de Latencia HTTP',
    'tab-net-diag': 'Diagnóstico de Red (Traceroute)',
    'tab-ai-agent': 'Copiloto IA Gemini & MCP',
    'tab-sedes-zonas': 'Gestión de Sedes y Zonas',
    'tab-stats': 'Estadísticas & Auditoría',
    'tab-config': 'Configuración del Sistema',
    'tab-help': 'Centro de Ayuda & Manuales'
  };

  const topbarCurrentView = document.getElementById('topbar-current-view');
  const appSidebar = document.getElementById('app-sidebar');
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  const btnMobileSidebar = document.getElementById('btn-mobile-sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) {
        target.classList.add('active');

        // Update Topbar Breadcrumb
        if (topbarCurrentView && viewTitles[btn.dataset.tab]) {
          topbarCurrentView.textContent = viewTitles[btn.dataset.tab];
        }

        // Close mobile drawer if open
        if (window.innerWidth <= 992 && appSidebar) {
          appSidebar.classList.remove('mobile-open');
          if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        }

        // Trigger view-specific data refresh & chart resizing
        if (btn.dataset.tab === 'tab-dashboard') {
          if (typeof telemetryChart !== 'undefined' && telemetryChart) {
            setTimeout(() => telemetryChart.resize(), 60);
          }
        }
        if (btn.dataset.tab === 'tab-roaming-log') loadRoamingHistory();
        if (btn.dataset.tab === 'tab-ap-scanner') {
          loadApScanner();
          setTimeout(() => {
            if (typeof drawWifiSpectrum === 'function') drawWifiSpectrum();
          }, 60);
        }
        if (btn.dataset.tab === 'tab-http-phases') loadHttpPhasesHistory();
        if (btn.dataset.tab === 'tab-net-diag') loadNetDiagView();
        if (btn.dataset.tab === 'tab-ai-agent') loadAiAgentView();
        if (btn.dataset.tab === 'tab-sedes-zonas') loadSedesAndZones();
        if (btn.dataset.tab === 'tab-stats') loadStatistics();
        if (btn.dataset.tab === 'tab-config') loadConfigView();
        if (btn.dataset.tab === 'tab-help') initHelpView();
      }
    });
  });

  // Sidebar Collapse / Expand Toggle
  if (btnToggleSidebar && appSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      appSidebar.classList.toggle('collapsed');
      const isCollapsed = appSidebar.classList.contains('collapsed');
      try {
        localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
      } catch (e) { }
      setTimeout(() => {
        if (typeof telemetryChart !== 'undefined' && telemetryChart) telemetryChart.resize();
        if (typeof drawWifiSpectrum === 'function') drawWifiSpectrum();
      }, 260);
    });

    try {
      if (localStorage.getItem('sidebar_collapsed') === '1') {
        appSidebar.classList.add('collapsed');
      }
    } catch (e) { }
  }

  // Mobile Drawer Toggle
  if (btnMobileSidebar && appSidebar) {
    btnMobileSidebar.addEventListener('click', () => {
      appSidebar.classList.toggle('mobile-open');
      if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
    });
  }

  if (sidebarOverlay && appSidebar) {
    sidebarOverlay.addEventListener('click', () => {
      appSidebar.classList.remove('mobile-open');
      sidebarOverlay.classList.remove('active');
    });
  }

  // URL Hash / Query Parameter direct tab navigation
  function checkUrlTab() {
    const hash = window.location.hash.replace('#', '');
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab') || hash;
    if (tabParam) {
      const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabParam}"]`);
      if (targetBtn) {
        targetBtn.click();
      }
    }
  }
  checkUrlTab();
  window.addEventListener('hashchange', checkUrlTab);

  // Header Help & AI Copilot buttons listeners
  const btnHeaderAiCopilot = document.getElementById('btn-header-ai-copilot');
  if (btnHeaderAiCopilot) {
    btnHeaderAiCopilot.addEventListener('click', () => {
      const tabAiBtn = document.getElementById('tab-btn-ai-agent');
      if (tabAiBtn) tabAiBtn.click();
    });
  }
  const btnOpenZoneContext = document.getElementById('btn-open-zone-context');
  if (btnOpenZoneContext) {
    btnOpenZoneContext.addEventListener('click', () => {
      const tabAiBtn = document.getElementById('tab-btn-ai-agent');
      if (tabAiBtn) {
        tabAiBtn.click();
        setTimeout(() => {
          const cardCtx = document.getElementById('card-physical-context-editor');
          if (cardCtx) cardCtx.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 120);
      }
    });
  }

  // Header Help, Location & BSSID button listeners
  const btnHeaderHelp = document.getElementById('btn-header-help');
  if (btnHeaderHelp) {
    btnHeaderHelp.addEventListener('click', () => {
      const tabHelpBtn = document.getElementById('tab-btn-help');
      if (tabHelpBtn) {
        tabHelpBtn.click();
        const helpContainer = document.getElementById('tab-help');
        if (helpContainer) {
          helpContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    });
  }

  let latestStatusSnapshot = {};

  function updateHeaderLocationBadge() {
    if (!headerLocationLabel) return;
    const loc = (selLocation && selLocation.value) ? selLocation.value.replace(/_/g, ' ') : 'Sede';
    const zone = (selZone && selZone.value) ? selZone.value : '';
    headerLocationLabel.textContent = zone ? `${loc} • ${zone}` : loc;
  }

  if (btnHeaderLocation) {
    btnHeaderLocation.addEventListener('click', () => {
      const dashTabBtn = document.querySelector('.tab-btn[data-tab="tab-dashboard"]');
      if (dashTabBtn && !dashTabBtn.classList.contains('active')) {
        dashTabBtn.click();
      }
      if (selLocation) {
        selLocation.focus();
        selLocation.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  if (btnHeaderBssid) {
    btnHeaderBssid.addEventListener('click', () => {
      window.openQuickNameApModal(
        latestStatusSnapshot.bssid || (infoBssid ? infoBssid.textContent : ''),
        latestStatusSnapshot.ap_name || ''
      );
    });
  }

  if (btnQuickEditCurrentAp) {
    btnQuickEditCurrentAp.addEventListener('click', () => {
      window.openQuickNameApModal(
        latestStatusSnapshot.bssid || (infoBssid ? infoBssid.textContent : ''),
        latestStatusSnapshot.ap_name || ''
      );
    });
  }

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
      updateHeaderLocationBadge();

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
    updateHeaderLocationBadge();
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
    loadZonePhysicalContext();
  });

  selZone.addEventListener('change', async () => {
    const loc = selLocation.value;
    const z = selZone.value;
    updateHeaderLocationBadge();
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
    loadZonePhysicalContext();
  });

  btnQuickAddZone.addEventListener('click', () => {
    const loc = selLocation.value;
    openCustomModal({
      title: `Añadir Zona a ${loc.replace(/_/g, ' ')}`,
      icon: 'fa-location-dot',
      confirmText: 'Añadir Zona',
      bodyHtml: `
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Nombre de la nueva zona o sub-ubicación</label>
          <input type="text" id="modal-quick-zone-input" class="toolbar-input" placeholder="Ej: Caja 5, Muelle 8, Pasillo Central" style="width: 100%;">
        </div>
      `,
      onConfirm: async () => {
        const newZone = (document.getElementById('modal-quick-zone-input')?.value || '').trim();
        if (!newZone) {
          showToast('Ingresa un nombre válido para la zona.', 'warn');
          return false;
        }
        try {
          await fetch('/api/zones', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location: loc, zone: newZone })
          });
          await saveConfig({ location_name: loc, current_zone: newZone });
          await loadLocationsAndZones();
          showToast(`Zona "${newZone}" añadida y seleccionada en ${loc.replace(/_/g, ' ')}`, 'success');
          return true;
        } catch (e) {
          showToast('Error al agregar zona: ' + e, 'error');
          return false;
        }
      }
    });
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
      showToast(`Sonda HTTP medida hacia ${url}`, 'success');
    } catch (e) {
      showToast('Error probando URL: ' + e, 'error');
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
    latestStatusSnapshot = data || {};

    // 1. Header Badges
    updateHeaderLocationBadge();
    headerSsid.textContent = data.ssid || 'Desconectado';
    if (data.ap_name && data.bssid) {
      headerBssid.textContent = data.ap_name;
      if (btnHeaderBssid) btnHeaderBssid.title = `AP Conectado: ${data.ap_name} (${data.bssid}) — Clic para editar alias`;
    } else {
      headerBssid.textContent = data.bssid || '--:--:--:--:--:--';
      if (btnHeaderBssid) btnHeaderBssid.title = `BSSID actual: ${data.bssid || '--'} — Clic para asignar alias al AP`;
    }
    headerPing.textContent = data.ping_ms !== null ? `${data.ping_ms} ms` : 'Timeout';

    if (data.app_latency_ms !== null && data.app_latency_ms !== undefined) {
      if (data.app_is_error) {
        headerAppLatency.textContent = `Fallo (${data.app_status_code || 'ERR'})`;
        headerAppBadge.title = `Error HTTP: ${data.app_error_message || 'Fallo de conexión'}`;
        headerAppBadge.style.background = 'rgba(239, 68, 68, 0.15)';
        headerAppBadge.style.color = '#ef4444';
      } else {
        headerAppLatency.textContent = `${data.app_latency_ms} ms`;
        headerAppBadge.title = `Latencia HTTP activa: ${data.app_latency_ms} ms (Código HTTP ${data.app_status_code || 200})`;
        headerAppBadge.style.background = 'rgba(16, 185, 129, 0.15)';
        headerAppBadge.style.color = '#10b981';
      }
    } else {
      headerAppLatency.textContent = '-- ms';
      headerAppBadge.title = 'Sonda HTTP inactiva o sin respuesta';
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
    infoSsid.title = data.ssid || '';
    infoApName.textContent = data.ap_name || '(Sin alias)';
    infoApName.title = data.ap_name || 'Sin alias asignado en base de datos';
    infoBssid.textContent = data.bssid || '--:--:--:--:--:--';
    infoVendor.textContent = data.vendor_name || 'Desconocido';
    infoVendor.title = data.vendor_name || '';
    infoChanFreq.textContent = data.channel ? `Ch ${data.channel} (${data.frequency_mhz} MHz)` : '--';
    const brFormatted = formatCompactBitrate(data.tx_bitrate, data.rx_bitrate);
    infoBitrate.textContent = brFormatted.shortText;
    infoBitrate.title = brFormatted.fullTooltip;
    infoIpGw.textContent = `${data.ip_address} / ${data.gateway_ip}`;
    infoIpGw.title = `IP Local: ${data.ip_address} | Gateway: ${data.gateway_ip}`;

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

  function updatePhaseHealthChip(boxEl, badgeEl, valMs, warnThreshold, dangerThreshold) {
    if (!badgeEl) return;
    const ms = Number(valMs || 0);
    badgeEl.classList.remove('chip-ok', 'chip-warn', 'chip-danger');
    if (boxEl) boxEl.classList.remove('phase-card-warn', 'phase-card-danger');
    if (ms >= dangerThreshold) {
      badgeEl.textContent = 'Cuello de Botella';
      badgeEl.classList.add('chip-danger');
      if (boxEl) boxEl.classList.add('phase-card-danger');
    } else if (ms >= warnThreshold) {
      badgeEl.textContent = 'Elevado';
      badgeEl.classList.add('chip-warn');
      if (boxEl) boxEl.classList.add('phase-card-warn');
    } else {
      badgeEl.textContent = 'Normal';
      badgeEl.classList.add('chip-ok');
    }
  }

  function updateAppCard(data) {
    if (data.target_url) {
      infoTargetUrl.textContent = data.target_url;
      infoTargetUrl.title = data.target_url;
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

      const dnsMs = Number(data.app_dns_ms || 0);
      const tcpMs = Number(data.app_tcp_ms || 0);
      const tlsMs = Number(data.app_tls_ms || 0);
      const ttfbMs = Number(data.app_ttfb_ms || 0);
      const transMs = Number(data.app_transfer_ms || 0);
      const sumMs = Math.max(1, dnsMs + tcpMs + tlsMs + ttfbMs + transMs);

      phaseDnsVal.textContent = `${dnsMs} ms`;
      phaseTcpVal.textContent = `${tcpMs} ms`;
      phaseTlsVal.textContent = `${tlsMs} ms`;
      phaseTtfbVal.textContent = `${ttfbMs} ms`;
      if (phaseTransVal) phaseTransVal.textContent = `${transMs} ms`;
      infoColdTotal.textContent = `${data.app_cold_total_ms || 0} ms`;

      // Update Card 3 Mini Stacked Progress Bar
      if (barSegDns) barSegDns.style.width = `${Math.max(4, (dnsMs / sumMs) * 100)}%`;
      if (barSegTcp) barSegTcp.style.width = `${Math.max(4, (tcpMs / sumMs) * 100)}%`;
      if (barSegTls) barSegTls.style.width = `${Math.max(4, (tlsMs / sumMs) * 100)}%`;
      if (barSegTtfb) barSegTtfb.style.width = `${Math.max(4, (ttfbMs / sumMs) * 100)}%`;
      if (barSegTrans) barSegTrans.style.width = `${Math.max(4, (transMs / sumMs) * 100)}%`;

      // Update Phase Tab Values & Bottleneck Health Chips
      cardDnsVal.textContent = `${dnsMs} ms`;
      cardTcpVal.textContent = `${tcpMs} ms`;
      cardTlsVal.textContent = `${tlsMs} ms`;
      cardTtfbVal.textContent = `${ttfbMs} ms`;
      cardTransVal.textContent = `${transMs} ms`;

      updatePhaseHealthChip(phaseBoxDns, phaseBadgeDns, dnsMs, 40, 100);
      updatePhaseHealthChip(phaseBoxTcp, phaseBadgeTcp, tcpMs, 50, 120);
      updatePhaseHealthChip(phaseBoxTls, phaseBadgeTls, tlsMs, 90, 200);
      updatePhaseHealthChip(phaseBoxTtfb, phaseBadgeTtfb, ttfbMs, 150, 350);
      updatePhaseHealthChip(phaseBoxTrans, phaseBadgeTrans, transMs, 80, 200);

      // Update Phases Chart
      phasesChart.data.datasets[0].data = [dnsMs];
      phasesChart.data.datasets[1].data = [tcpMs];
      phasesChart.data.datasets[2].data = [tlsMs];
      phasesChart.data.datasets[3].data = [ttfbMs];
      phasesChart.data.datasets[4].data = [transMs];
      phasesChart.update();
    }
  }

  // --- Tab 1: Roaming Log ---
  function getEffectiveScopeParams(scopeSelectEl) {
    const mode = scopeSelectEl ? scopeSelectEl.value : 'all';
    const activeLoc = selLocation ? selLocation.value : 'all';
    const activeZone = selZone ? selZone.value : 'all';
    if (mode === 'zone') {
      return { loc: activeLoc || 'all', zone: activeZone || 'all', mode };
    }
    if (mode === 'location') {
      return { loc: activeLoc || 'all', zone: 'all', mode };
    }
    return { loc: 'all', zone: 'all', mode: 'all' };
  }

  if (roamingScopeFilter) {
    roamingScopeFilter.addEventListener('change', () => loadRoamingHistory());
  }

  async function loadRoamingHistory() {
    try {
      const { loc, zone, mode } = getEffectiveScopeParams(roamingScopeFilter);
      const res = await fetch(`/api/roaming-history?location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      const events = data.events || [];

      if (roamingTotalCounter) {
        roamingTotalCounter.textContent = `${events.length} evento${events.length === 1 ? '' : 's'}`;
      }

      if (events.length === 0) {
        const scopeDesc = mode === 'all'
          ? 'en la base de datos'
          : (mode === 'location' ? `en la sede "${(selLocation?.value || '').replace(/_/g, ' ')}"` : `en "${(selLocation?.value || '').replace(/_/g, ' ')} • ${selZone?.value || ''}"`);
        roamingTableBody.innerHTML = `
          <tr>
            <td colspan="8">
              <div class="empty-state">
                <i class="fa-solid fa-route"></i>
                <p>No se encontraron eventos de cambio de AP (Handoffs) ${escapeHtml(scopeDesc)}.</p>
                ${mode !== 'all' ? `<div style="margin-top: 0.6rem;"><button type="button" class="btn-secondary" onclick="document.getElementById('roaming-scope-filter').value='all'; document.getElementById('roaming-scope-filter').dispatchEvent(new Event('change'));" style="font-size: 0.78rem; padding: 0.35rem 0.75rem;"><i class="fa-solid fa-globe"></i> Ver todas las sedes y zonas</button></div>` : '<small>Camina entre diferentes áreas con la laptop o PDA para provocar transiciones de roaming.</small>'}
              </div>
            </td>
          </tr>`;
        return;
      }

      roamingTableBody.innerHTML = events.map(e => {
        const timeFormatted = formatLocalTime(e.timestamp_raw || e.timestamp || e.created_at);
        const dateFormatted = formatLocalDate(e.timestamp_raw || e.created_at || e.date);
        const prevBssid = e.prev_bssid || '';
        const newBssid = e.new_bssid || '';
        const rowLoc = `${e.location || ''} ${e.zone ? '- ' + e.zone : ''}`.trim();
        return `
        <tr>
          <td>
            <strong style="color: var(--accent-cyan); font-size: 0.85rem;">${timeFormatted}</strong>
            ${dateFormatted ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${dateFormatted}</div>` : ''}
          </td>
          <td><span class="badge" style="font-size: 0.75rem;">${escapeHtml((e.location || 'Sede').replace(/_/g, ' '))} - ${escapeHtml(e.zone || 'Zona')}</span></td>
          <td>${escapeHtml(e.ssid || '--')}</td>
          <td>
            <div class="ap-cell">
              ${e.prev_ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${escapeHtml(e.prev_ap_name)}</span>` : ''}
              <div style="display: flex; align-items: center; gap: 0.25rem;">
                <span class="mac-subtext">${escapeHtml(prevBssid || '--')}</span>
                ${prevBssid ? `<button type="button" class="btn-quick-name-ap" onclick="openQuickNameApModal('${escapeHtml(prevBssid)}', '${escapeHtml(e.prev_ap_name || '')}', '${escapeHtml(rowLoc)}')" title="Asignar o editar alias de este AP"><i class="fa-solid fa-tag"></i></button>` : ''}
              </div>
              <small style="color: var(--text-muted);">${e.prev_signal_dbm || '--'} dBm</small>
            </div>
          </td>
          <td>
            <div class="ap-cell">
              ${e.new_ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${escapeHtml(e.new_ap_name)}</span>` : ''}
              <div style="display: flex; align-items: center; gap: 0.25rem;">
                <span class="mac-subtext">${escapeHtml(newBssid || '--')}</span>
                ${newBssid ? `<button type="button" class="btn-quick-name-ap" onclick="openQuickNameApModal('${escapeHtml(newBssid)}', '${escapeHtml(e.new_ap_name || '')}', '${escapeHtml(rowLoc)}')" title="Asignar o editar alias de este AP"><i class="fa-solid fa-tag"></i></button>` : ''}
              </div>
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
              ${escapeHtml(e.verdict || 'Handoff')}
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
    const { loc, zone } = getEffectiveScopeParams(roamingScopeFilter);
    window.location.href = `/api/export?type=roaming&location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}`;
  });

  btnClearRoamingLog.addEventListener('click', () => {
    openCustomModal({
      title: 'Limpiar Historial de Roaming',
      icon: 'fa-trash-can',
      confirmText: 'Sí, Limpiar Historial',
      danger: true,
      bodyHtml: `<p>¿Estás seguro de que deseas eliminar todos los eventos de cambio de AP (Roaming) registrados?</p>`,
      onConfirm: async () => {
        await fetch('/api/clear-roaming-log', { method: 'POST' });
        loadRoamingHistory();
        showToast('Historial de eventos de roaming limpiado.', 'success');
        return true;
      }
    });
  });

  // --- Tab 2: Manual Probe Trigger & History ---
  if (httpScopeFilter) {
    httpScopeFilter.addEventListener('change', () => loadHttpPhasesHistory());
  }

  btnManualProbe.addEventListener('click', async () => {
    btnManualProbe.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Midiendo...';
    btnManualProbe.disabled = true;
    try {
      const res = await fetch('/api/probe/now', { method: 'POST' });
      const data = await res.json();
      updateAppCard(data);
      loadHttpPhasesHistory();
      showToast(`Medición HTTP completada (${data.total_ms || data.app_latency_ms || 0} ms)`, 'success');
    } catch (e) {
      showToast('Error en medición HTTP: ' + e, 'error');
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
      const { loc, zone, mode } = getEffectiveScopeParams(httpScopeFilter);
      const res = await fetch(`/api/http-phases/history?limit=50&location=${encodeURIComponent(loc)}&zone=${encodeURIComponent(zone)}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      const records = data.records || [];

      if (httpHistoryCounter) {
        httpHistoryCounter.textContent = `${records.length} prueba${records.length === 1 ? '' : 's'}`;
      }

      if (records.length === 0) {
        const scopeDesc = mode === 'all'
          ? 'en el historial'
          : (mode === 'location' ? `en la sede "${(selLocation?.value || '').replace(/_/g, ' ')}"` : `en "${(selLocation?.value || '').replace(/_/g, ' ')} • ${selZone?.value || ''}"`);
        httpHistoryTableBody.innerHTML = `
          <tr>
            <td colspan="11">
              <div class="empty-state" style="padding: 2.5rem 1rem; text-align: center;">
                <i class="fa-solid fa-clock-rotate-left" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.5rem; opacity: 0.5;"></i>
                <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 0.5rem;">No hay mediciones HTTP registradas ${escapeHtml(scopeDesc)}.</p>
                ${mode !== 'all' ? `<div style="margin-top: 0.6rem;"><button type="button" class="btn-secondary" onclick="document.getElementById('http-scope-filter').value='all'; document.getElementById('http-scope-filter').dispatchEvent(new Event('change'));" style="font-size: 0.78rem; padding: 0.35rem 0.75rem;"><i class="fa-solid fa-globe"></i> Ver todas las sedes y zonas</button></div>` : '<small style="color: var(--text-muted);">Presiona "Medir Ahora" arriba para registrar una prueba de latencia.</small>'}
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
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary);">${escapeHtml((r.location || 'Sede Principal').replace(/_/g, ' '))}</div>
              ${r.zone ? `<div style="font-size: 0.75rem; color: var(--accent-cyan);"><i class="fa-solid fa-location-dot" style="font-size: 0.7rem;"></i> ${escapeHtml(r.zone)}</div>` : ''}
            </td>
            <td>
              <div class="ap-cell">
                ${apLabel}
                <div style="display: flex; align-items: center; gap: 0.25rem;">
                  ${bssidLabel}
                  ${r.bssid ? `<button type="button" class="btn-quick-name-ap" onclick="openQuickNameApModal('${escapeHtml(r.bssid)}', '${escapeHtml(r.ap_name || '')}', '${escapeHtml((r.location || '') + (r.zone ? ' - ' + r.zone : ''))}')" title="Asignar o editar alias de este AP"><i class="fa-solid fa-tag"></i></button>` : ''}
                  ${sig ? `<span style="font-size: 0.75rem; font-weight: 700; color: ${sigColor}; margin-left: 0.2rem;">(${sig})</span>` : ''}
                </div>
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
      const { loc, zone } = getEffectiveScopeParams(httpScopeFilter);
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
  let cachedScannerAps = [];
  let scannerOnlySameSsid = false;

  function renderApScannerTable() {
    if (!apScannerTableBody) return;
    const query = (inputSearchScanner ? inputSearchScanner.value : '').trim().toLowerCase();

    let filtered = cachedScannerAps.filter(ap => {
      if (scannerOnlySameSsid && !ap.is_same_ssid && !ap.active) return false;
      if (!query) return true;
      const hay = [
        ap.ssid || '',
        ap.bssid || '',
        ap.ap_name || '',
        ap.vendor || '',
        `canal ${ap.channel || ''}`,
        `ch ${ap.channel || ''}`,
        ap.freq || '',
        ap.band || ''
      ].join(' ').toLowerCase();
      return hay.includes(query);
    });

    if (scannerApCountBadge) {
      scannerApCountBadge.textContent = filtered.length === cachedScannerAps.length
        ? `${cachedScannerAps.length} APs`
        : `${filtered.length} / ${cachedScannerAps.length} APs`;
    }

    if (filtered.length === 0) {
      apScannerTableBody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><p>${cachedScannerAps.length === 0 ? 'No se encontraron APs vecinos.' : 'Ningún AP coincide con el filtro actual.'}</p></div></td></tr>`;
      return;
    }

    apScannerTableBody.innerHTML = filtered.map(ap => {
      const sigPct = Math.max(0, Math.min(100, Number(ap.signal) || 0));
      const sigDbm = (ap.signal_dbm !== undefined && ap.signal_dbm !== null)
        ? Number(ap.signal_dbm)
        : Math.round((sigPct / 2) - 100);
      const sigColor = sigDbm >= -65 ? 'var(--accent-emerald)' : (sigDbm >= -75 ? 'var(--accent-amber)' : 'var(--accent-rose)');

      return `
        <tr style="${ap.active ? 'background: rgba(6, 182, 212, 0.08);' : ''}">
          <td>
            ${ap.active ? '<span class="badge" style="background: var(--accent-emerald); color: #fff;">CONECTADO</span>' : '<span style="color: var(--text-muted); font-size: 0.78rem;">En rango</span>'}
          </td>
          <td><strong>${escapeHtml(ap.ssid || 'Oculto')}</strong></td>
          <td>
            <div class="ap-cell">
              ${ap.ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${escapeHtml(ap.ap_name)}</span>` : ''}
              <div style="display: flex; align-items: center; gap: 0.25rem;">
                <span class="mac-subtext">${escapeHtml(ap.bssid)}</span>
                <button type="button" class="btn-quick-name-ap" onclick="openQuickNameApModal('${escapeHtml(ap.bssid)}', '${escapeHtml(ap.ap_name || '')}')" title="Asignar o editar alias de este AP">
                  <i class="fa-solid fa-tag"></i> ${ap.ap_name ? 'Editar' : 'Etiquetar'}
                </button>
              </div>
            </div>
          </td>
          <td>${escapeHtml(ap.vendor || 'Desconocido')}</td>
          <td>
            <div class="signal-cell-wrap">
              <div class="signal-cell-top">
                <span style="font-weight: 800; font-family: monospace; color: ${sigColor}; font-size: 0.86rem;">
                  ${sigDbm} dBm
                </span>
                <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted);">
                  ${sigPct}%
                </span>
              </div>
              <div class="signal-bar-wrap">
                <div class="signal-bar-fill" style="width: ${sigPct}%; background: ${sigColor};"></div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(ap.freq || ap.band || '--')}</td>
          <td>Canal ${escapeHtml(ap.channel || '--')}</td>
          <td>
            ${ap.is_same_ssid && !ap.active ? '<span class="badge" style="background: rgba(6, 182, 212, 0.2); color: var(--accent-cyan); font-weight: bold;">CANDIDATO ROAMING</span>' : (ap.active ? '<span style="color: var(--accent-emerald); font-size: 0.8rem; font-weight: 700;">AP Actual</span>' : '<span style="color: var(--text-muted); font-size: 0.78rem;">Otro SSID</span>')}
          </td>
        </tr>
      `;
    }).join('');
  }

  if (inputSearchScanner) {
    inputSearchScanner.addEventListener('input', renderApScannerTable);
  }

  if (btnScannerFilterSsid) {
    btnScannerFilterSsid.addEventListener('click', () => {
      scannerOnlySameSsid = !scannerOnlySameSsid;
      btnScannerFilterSsid.classList.toggle('active', scannerOnlySameSsid);
      if (scannerFilterSsidLabel) {
        scannerFilterSsidLabel.textContent = scannerOnlySameSsid ? 'Solo mi SSID' : 'Todos los SSID';
      }
      renderApScannerTable();
    });
  }

  async function loadApScanner() {
    try {
      const res = await fetch('/api/scan');
      const data = await res.json();
      cachedScannerAps = data.aps || [];
      renderApScannerTable();

      // Refresh real-time RF Spectrum Analyzer with scanned APs
      updateSpectrumData(cachedScannerAps);
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
  const spectrumApRetentionCache = new Map();
  const SPECTRUM_RETENTION_TTL_MS = 45000;
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
    const now = Date.now();

    // Ingest new/updated APs into sliding retention cache
    aps.forEach(rawAp => {
      const norm = normalizeApForSpectrum(rawAp);
      const key = (norm.bssid || norm.ssid || `${norm.chanNum}-${norm.band}`).toUpperCase();
      norm._lastSeen = now;
      spectrumApRetentionCache.set(key, norm);
    });

    // Sliding window eviction: retain APs seen within 45 seconds or currently active
    for (const [key, item] of spectrumApRetentionCache.entries()) {
      if (!item.active && (now - (item._lastSeen || 0) > SPECTRUM_RETENTION_TTL_MS)) {
        spectrumApRetentionCache.delete(key);
      }
    }

    cachedSpectrumAps = Array.from(spectrumApRetentionCache.values());

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
      // Extended from ch 30 to 184 so UNII-4 channels (169, 173, 177) have full visibility and margins
      chanToX = (ch) => padLeft + ((ch - 30) / (184 - 30)) * chartW;
      channelWidth = 2.4;
      ticks = [36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165, 169, 173, 177];
    } else {
      bandName = 'Banda 6 GHz / 7 GHz (Wi-Fi 6E/7)';
      // Extended scale up to 241 so high channels don't clip at right border
      chanToX = (ch) => padLeft + ((ch - 1) / (241 - 1)) * chartW;
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

      const isKeyChan = (activeSpectrumBand === '2.4' && (ch === 1 || ch === 6 || ch === 11)) ||
                        (activeSpectrumBand === '5' && (ch === 36 || ch === 149 || ch === 169));

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

      // Connected AP indicator dot
      if (isConnected) {
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.arc(peakX, peakY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Anti-collision label pass: prioritize Connected > Hovered > Same SSID > Strongest signal
    const labelCandidates = [...visibleAps].sort((a, b) => {
      const aHov = hoveredSpectrumAp && hoveredSpectrumAp.bssid === a.bssid ? 1 : 0;
      const bHov = hoveredSpectrumAp && hoveredSpectrumAp.bssid === b.bssid ? 1 : 0;
      if (aHov !== bHov) return bHov - aHov;
      if (!!a.active !== !!b.active) return a.active ? -1 : 1;
      if (!!a.is_same_ssid !== !!b.is_same_ssid) return a.is_same_ssid ? -1 : 1;
      return b.dbm - a.dbm;
    });

    const placedBoxes = [];
    const maxLabelsPerChannel = {};

    labelCandidates.forEach(ap => {
      const color = getSpectrumColor(ap.ssid, ap.bssid);
      const isHovered = hoveredSpectrumAp && (hoveredSpectrumAp.bssid === ap.bssid);
      const isConnected = !!ap.active;
      const chKey = String(ap.chanNum);
      maxLabelsPerChannel[chKey] = (maxLabelsPerChannel[chKey] || 0) + 1;

      // Limit non-active co-channel labels to top 3 per channel to keep canvas clean
      if (!isConnected && !isHovered && maxLabelsPerChannel[chKey] > 3) return;

      const peakX = ap._curvePeakX;
      const peakY = ap._curvePeakY;
      const baseTitle = ap.ap_name ? `${ap.ap_name}` : (ap.ssid || 'Oculto');
      const shortLabel = baseTitle.length > 18 ? baseTitle.substring(0, 17) + '…' : baseTitle;
      const labelText = (isConnected || isHovered) ? `${shortLabel} (${ap.dbm}dBm)` : shortLabel;

      ctx.font = (isConnected || isHovered) ? "bold 10.5px Outfit, sans-serif" : "600 9.5px Outfit, sans-serif";
      const textW = ctx.measureText(labelText).width + 8;
      const textH = 13;

      // Horizontal clamping: keep labels strictly within chart bounds with 4px margin
      let boxLeft = peakX - textW / 2;
      const minLeft = padLeft + 4;
      const maxLeft = padLeft + chartW - textW - 4;
      boxLeft = Math.max(minLeft, Math.min(maxLeft, boxLeft));
      const boxRight = boxLeft + textW;
      const drawCenterX = boxLeft + textW / 2;

      let candidateY = Math.max(padTop + 10, peakY - 7);
      let attempts = 0;
      while (attempts < 4) {
        const box = {
          left: boxLeft,
          right: boxRight,
          top: candidateY - textH,
          bottom: candidateY
        };
        const hasOverlap = placedBoxes.some(b =>
          !(box.right < b.left || box.left > b.right || box.bottom < b.top || box.top > b.bottom)
        );
        if (!hasOverlap) {
          placedBoxes.push(box);
          break;
        }
        candidateY -= 14;
        attempts++;
      }

      if (attempts >= 4 && !isConnected && !isHovered) return;
      candidateY = Math.max(padTop + 10, candidateY);

      // Leader line if label was staggered upward or shifted horizontally
      if (peakY - candidateY > 12 || Math.abs(drawCenterX - peakX) > 4) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = hexToRgba(color, 0.55);
        ctx.lineWidth = 1;
        ctx.moveTo(peakX, peakY - 2);
        ctx.lineTo(drawCenterX, candidateY + 1);
        ctx.stroke();
        ctx.restore();
      }

      // Subtle pill background behind text for high contrast
      ctx.fillStyle = (isConnected || isHovered) ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.86)';
      const bgW = textW;
      const bgH = textH;
      ctx.fillRect(boxLeft, candidateY - bgH + 1, bgW, bgH);

      ctx.fillStyle = (isConnected || isHovered) ? '#ffffff' : color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(labelText, drawCenterX, candidateY);
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
  let cachedSedesLocations = [];
  let cachedSedesZonesMap = {};
  const expandedSedesSet = new Set();

  window.toggleExpandSedeZones = function (loc) {
    if (expandedSedesSet.has(loc)) {
      expandedSedesSet.delete(loc);
    } else {
      expandedSedesSet.add(loc);
    }
    renderSedesCards();
  };

  window.selectActiveLocationZone = async function (loc, zone) {
    if (!loc) return;
    await saveConfig({ location_name: loc, current_zone: zone || '' });
    await loadLocationsAndZones();
    renderSedesCards();
    loadStatistics();
    loadRoamingHistory();
    loadHttpPhasesHistory();
    showToast(`Ubicación activa fijada en: ${loc.replace(/_/g, ' ')}${zone ? ' • ' + zone : ''}`, 'success');
  };

  function renderSedesCards() {
    if (!sedesCardsContainer) return;
    const query = (inputSearchSedes ? inputSearchSedes.value : '').trim().toLowerCase();
    const activeLoc = selLocation ? selLocation.value : '';
    const activeZone = selZone ? selZone.value : '';

    let totalZonesCount = 0;
    cachedSedesLocations.forEach(l => {
      totalZonesCount += (cachedSedesZonesMap[l] || []).length;
    });
    if (sedesTotalSummary) {
      sedesTotalSummary.textContent = `${cachedSedesLocations.length} Sedes • ${totalZonesCount} Zonas`;
    }

    const filteredLocs = cachedSedesLocations.filter(l => {
      if (!query) return true;
      const locDisplay = l.replace(/_/g, ' ').toLowerCase();
      if (locDisplay.includes(query) || l.toLowerCase().includes(query)) return true;
      const zones = cachedSedesZonesMap[l] || [];
      return zones.some(z => z.toLowerCase().includes(query));
    });

    if (filteredLocs.length === 0) {
      sedesCardsContainer.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><i class="fa-solid fa-magnifying-glass-location"></i><p>No se encontraron sedes ni zonas que coincidan con "${escapeHtml(query)}".</p></div>`;
      return;
    }

    sedesCardsContainer.innerHTML = filteredLocs.map(l => {
      const allZones = cachedSedesZonesMap[l] || [];
      const matchingZones = query
        ? allZones.filter(z => z.toLowerCase().includes(query) || l.replace(/_/g, ' ').toLowerCase().includes(query))
        : allZones;

      const isCurrentSede = l === activeLoc;
      const isExpanded = expandedSedesSet.has(l) || Boolean(query);
      const maxInitial = 12;
      const visibleZones = isExpanded ? matchingZones : matchingZones.slice(0, maxInitial);
      const hiddenCount = matchingZones.length - visibleZones.length;

      return `
        <div class="sede-card ${isCurrentSede ? 'is-active-sede' : ''}">
          <div class="sede-card-header">
            <div class="sede-card-title" style="flex-wrap: wrap;">
              <i class="fa-solid fa-building"></i> ${escapeHtml(l.replace(/_/g, ' '))}
              <span class="badge" style="font-size: 0.72rem; padding: 0.15rem 0.45rem; background: rgba(79, 70, 229, 0.1); color: var(--accent-cyan); font-weight: 600;">${allZones.length} zonas</span>
              ${isCurrentSede ? '<span class="badge" style="font-size: 0.68rem; padding: 0.12rem 0.45rem; background: #dcfce7; color: #166534; border-color: #86efac;">ACTIVA</span>' : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <button type="button" class="btn-secondary" onclick="selectActiveLocationZone('${escapeHtml(l)}', '${escapeHtml(allZones[0] || '')}')" title="Usar esta sede como ubicación activa" style="padding: 0.24rem 0.55rem; font-size: 0.72rem;">
                <i class="fa-solid fa-location-crosshairs"></i> Activar
              </button>
              <button type="button" class="btn-icon-danger" onclick="deleteSede('${escapeHtml(l)}')" title="Eliminar Sede"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          <div class="zone-chips-container">
            ${visibleZones.map(z => {
        const isCurrentZone = isCurrentSede && z === activeZone;
        return `
                <span class="zone-chip zone-chip-selectable ${isCurrentZone ? 'is-active-zone' : ''}" onclick="selectActiveLocationZone('${escapeHtml(l)}', '${escapeHtml(z)}')" title="Clic para activar ${escapeHtml(l.replace(/_/g, ' '))} • ${escapeHtml(z)}">
                  ${isCurrentZone ? '<i class="fa-solid fa-circle-check" style="font-size: 0.68rem;"></i>' : ''}
                  <span>${escapeHtml(z)}</span>
                  <i class="fa-solid fa-xmark zone-delete-btn" onclick="event.stopPropagation(); deleteSingleZone('${escapeHtml(l)}', '${escapeHtml(z)}')" title="Eliminar zona" style="cursor: pointer; opacity: 0.55; font-size: 0.72rem; margin-left: 0.15rem;"></i>
                </span>
              `;
      }).join('')}
            ${hiddenCount > 0 ? `
              <button type="button" class="btn-toggle-more-zones" onclick="toggleExpandSedeZones('${escapeHtml(l)}')">
                + Ver ${hiddenCount} zonas más
              </button>
            ` : (allZones.length > maxInitial && !query ? `
              <button type="button" class="btn-toggle-more-zones" onclick="toggleExpandSedeZones('${escapeHtml(l)}')">
                Mostrar menos
              </button>
            ` : '')}
            <button type="button" class="zone-chip" style="background: rgba(79, 70, 229, 0.12); color: var(--accent-cyan); border-color: var(--accent-cyan); cursor: pointer; font-weight: 600;" onclick="promptAddZone('${escapeHtml(l)}')">
              <i class="fa-solid fa-plus"></i> Añadir Zona
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  if (inputSearchSedes) {
    inputSearchSedes.addEventListener('input', renderSedesCards);
  }

  async function loadSedesAndZones() {
    try {
      const [resLocs, resZones] = await Promise.all([
        fetch('/api/locations?configured_only=1'),
        fetch('/api/zones')
      ]);
      const dataLocs = await resLocs.json();
      const zonesMap = await resZones.json();

      cachedSedesZonesMap = zonesMap || {};
      cachedSedesLocations = (dataLocs.locations && dataLocs.locations.length > 0)
        ? dataLocs.locations
        : Object.keys(cachedSedesZonesMap);

      renderSedesCards();
    } catch (e) {
      console.error("Error cargando gestor de sedes:", e);
    }
  }

  window.deleteSingleZone = function (loc, zone) {
    openCustomModal({
      title: 'Eliminar Zona',
      icon: 'fa-trash-can',
      confirmText: 'Eliminar Zona',
      danger: true,
      bodyHtml: `<p>¿Deseas eliminar la zona <strong>"${escapeHtml(zone)}"</strong> de la sede <strong>"${escapeHtml(loc.replace(/_/g, ' '))}"</strong>?</p>`,
      onConfirm: async () => {
        try {
          await fetch('/api/zones/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ location: loc, zone: zone })
          });
          await loadSedesAndZones();
          await loadLocationsAndZones();
          showToast(`Zona "${zone}" eliminada.`, 'success');
          return true;
        } catch (e) {
          showToast('Error eliminando zona: ' + e, 'error');
          return false;
        }
      }
    });
  };

  window.promptAddZone = function (loc) {
    openCustomModal({
      title: `Añadir Zona a ${loc.replace(/_/g, ' ')}`,
      icon: 'fa-location-dot',
      confirmText: 'Añadir Zona',
      bodyHtml: `
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Nombre de la nueva zona</label>
          <input type="text" id="modal-sede-add-zone" class="toolbar-input" placeholder="Ej: Caja 4, Pasillo Norte, Recepción" style="width: 100%;">
        </div>
      `,
      onConfirm: async () => {
        const newZ = (document.getElementById('modal-sede-add-zone')?.value || '').trim();
        if (!newZ) {
          showToast('Ingresa un nombre para la zona.', 'warn');
          return false;
        }
        await fetch('/api/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: loc, zone: newZ })
        });
        await loadSedesAndZones();
        await loadLocationsAndZones();
        showToast(`Zona "${newZ}" añadida a ${loc.replace(/_/g, ' ')}.`, 'success');
        return true;
      }
    });
  };

  window.deleteSede = function (loc) {
    openCustomModal({
      title: 'Eliminar Sede Completa',
      icon: 'fa-building-circle-xmark',
      confirmText: 'Sí, Eliminar Sede',
      danger: true,
      bodyHtml: `<p>¿Eliminar la sede <strong>"${escapeHtml(loc.replace(/_/g, ' '))}"</strong> y todas sus zonas configuradas?</p>`,
      onConfirm: async () => {
        await fetch('/api/locations/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: loc })
        });
        await loadSedesAndZones();
        await loadLocationsAndZones();
        showToast(`Sede "${loc.replace(/_/g, ' ')}" eliminada.`, 'success');
        return true;
      }
    });
  };

  btnAddSedeModal.addEventListener('click', () => {
    openCustomModal({
      title: 'Crear Nueva Sede',
      icon: 'fa-building',
      confirmText: 'Crear Sede',
      bodyHtml: `
        <div class="form-group" style="margin-bottom: 0.5rem;">
          <label class="form-label">Nombre de la Sede / Tienda / Bodega</label>
          <input type="text" id="modal-new-sede-name" class="toolbar-input" placeholder="Ej: Tienda 102 Unicentro, Bodega Norte" style="width: 100%;">
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Zona Inicial</label>
          <input type="text" id="modal-new-sede-zone" class="toolbar-input" value="Zona General" placeholder="Ej: Zona General, Cajas, piso 1" style="width: 100%;">
        </div>
      `,
      onConfirm: async () => {
        const newLoc = (document.getElementById('modal-new-sede-name')?.value || '').trim();
        const firstZone = (document.getElementById('modal-new-sede-zone')?.value || 'Zona General').trim() || 'Zona General';
        if (!newLoc) {
          showToast('Ingresa un nombre válido para la nueva sede.', 'warn');
          return false;
        }
        const locClean = newLoc.replace(/\s+/g, '_');
        await fetch('/api/zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location: locClean, zone: firstZone })
        });
        await loadSedesAndZones();
        await loadLocationsAndZones();
        showToast(`Sede "${newLoc}" creada con éxito.`, 'success');
        return true;
      }
    });
  });

  btnSyncSedesJson.addEventListener('click', async () => {
    const origHtml = btnSyncSedesJson.innerHTML;
    btnSyncSedesJson.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Recargando...';
    btnSyncSedesJson.disabled = true;
    try {
      const res = await fetch('/api/locations/sync', { method: 'POST' });
      await res.json();
      await loadSedesAndZones();
      await loadLocationsAndZones();
      showToast('Sedes y Zonas recargadas exitosamente desde sedes_zonas.json', 'success');
    } catch (e) {
      showToast('Error al recargar sedes_zonas.json: ' + e.message, 'error');
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
            showToast(`Archivo cargado: ${data.sedes_count} sedes, ${data.zones_count} zonas (+${data.imported_sedes} sedes / +${data.imported_zones} zonas nuevas)`, 'success', 5500);
          } else {
            showToast('Error al procesar archivo: ' + (data.message || 'Formato no reconocido'), 'error');
          }
        } catch (err) {
          showToast('Error al cargar archivo: ' + err, 'error');
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
  function handleClearDatabaseAudit() {
    if (exportOptionsMenu) exportOptionsMenu.style.display = 'none';

    openCustomModal({
      title: 'Vaciar Registros de Auditoría (BD)',
      icon: 'fa-triangle-exclamation',
      confirmText: 'Sí, Vaciar Base de Datos',
      danger: true,
      bodyHtml: `
        <p style="color: var(--text-primary); font-weight: 600;">¿Estás seguro de que deseas vaciar TODOS los registros de auditoría de la Base de Datos?</p>
        <ul style="padding-left: 1.2rem; font-size: 0.82rem; line-height: 1.5; color: var(--text-secondary);">
          <li>Muestras de Telemetría (Señal dBm, Ping, Jitter)</li>
          <li>Eventos de Roaming (Handoffs)</li>
          <li>Historial de fases de Latencia HTTP (Capa 7)</li>
          <li>Historial de diagnóstico de red ICMP y Traceroute</li>
        </ul>
        <small style="color: var(--text-muted);">Los nombres de APs, sedes/zonas y parámetros de configuración se conservarán intactos.</small>
      `,
      onConfirm: async () => {
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
            showToast('Base de datos limpiada con éxito. Se reiniciaron los registros de auditoría.', 'success');
            loadStatistics();
            loadRoamingHistory();
            loadHttpPhasesHistory();
            loadNetDiagView();
            fetchStatus();
          } else {
            showToast('Error al limpiar la base de datos: ' + (data.message || 'Error desconocido'), 'error');
          }
        } catch (err) {
          showToast('Error de conexión al limpiar la base de datos: ' + err, 'error');
        } finally {
          if (btnClearDbStats) {
            btnClearDbStats.disabled = false;
            btnClearDbStats.innerHTML = '<i class="fa-solid fa-trash-can"></i> Limpiar BD';
          }
        }
        return true;
      }
    });
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
      const [resCfg, resIfaces] = await Promise.all([
        fetch('/api/config'),
        fetch('/api/interfaces')
      ]);
      const cfg = await resCfg.json();
      const ifaces = await resIfaces.json();

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

      // AP Names Inventory - Carga paginada sobre la totalidad de APs registrados
      loadApNamesPage(apPaginationState.page || 1);

      // IEEE OUI Vendor Database & MAC Management
      fetchOuiInfo();
      searchOuiVendors(ouiSearchInput ? ouiSearchInput.value.trim() : '');
      checkOuiUpdateStatus();
      loadGeminiCredentialsStatus();
    } catch (e) {
      console.error("Error cargando configuración:", e);
    }
  }

  async function loadApNamesPage(page = 1) {
    if (!apNamesTableBody) return;
    try {
      apPaginationState.loading = true;
      apPaginationState.page = Math.max(1, page);
      const q = inputSearchApNames ? inputSearchApNames.value.trim() : '';
      apPaginationState.query = q;

      apNamesTableBody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i><p>Consultando base de APs (${apPaginationState.pageSize} por página)...</p></div></td></tr>`;

      const params = new URLSearchParams({
        q: q,
        page: apPaginationState.page,
        page_size: apPaginationState.pageSize
      });

      const res = await fetch(`/api/ap-names?${params.toString()}`);
      const data = await res.json();

      const aps = data.aps || [];
      const total = data.total ?? 0;
      const totalPages = data.total_pages || 1;
      const infoTotal = (data.info && data.info.total !== undefined) ? data.info.total : total;

      allApList = aps;
      apPaginationState.total = total;
      apPaginationState.totalPages = totalPages;
      apPaginationState.page = data.page || page;

      // Actualizar insignia superior con la totalidad real en base de datos
      if (apCountBadge) {
        apCountBadge.textContent = `${infoTotal.toLocaleString()} APs`;
      }

      // Actualizar resumen de filtrado
      if (apFilteredInfo) {
        if (q) {
          apFilteredInfo.innerHTML = `Encontrados <strong>${total.toLocaleString()}</strong> de ${infoTotal.toLocaleString()} APs para "<em>${escapeHtml(q)}</em>"`;
        } else {
          apFilteredInfo.textContent = `Total registrados: ${total.toLocaleString()} APs en inventario`;
        }
      }

      renderApNamesTable(aps);
      updateApPaginationUI(total, infoTotal);
    } catch (e) {
      console.error("Error cargando página de APs:", e);
      if (apNamesTableBody) {
        apNamesTableBody.innerHTML = `<tr><td colspan="4"><div class="empty-state" style="padding: 1.5rem; color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i><p>Error al consultar los Access Points registrados.</p></div></td></tr>`;
      }
    } finally {
      apPaginationState.loading = false;
    }
  }

  function updateApPaginationUI(total, infoTotal) {
    const page = apPaginationState.page;
    const totalPages = apPaginationState.totalPages;
    const pageSize = apPaginationState.pageSize;

    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);

    if (apPaginationSummary) {
      if (total === 0) {
        apPaginationSummary.textContent = '0 resultados';
      } else {
        apPaginationSummary.textContent = `Mostrando ${from.toLocaleString()} - ${to.toLocaleString()} de ${total.toLocaleString()}`;
      }
    }

    if (apCurrentPageBadge) {
      apCurrentPageBadge.textContent = `Pág. ${page} / ${totalPages}`;
    }

    if (btnApFirstPage) btnApFirstPage.disabled = (page <= 1);
    if (btnApPrevPage) btnApPrevPage.disabled = (page <= 1);
    if (btnApNextPage) btnApNextPage.disabled = (page >= totalPages);
    if (btnApLastPage) btnApLastPage.disabled = (page >= totalPages);
  }

  if (inputSearchApNames) {
    inputSearchApNames.addEventListener('input', () => {
      clearTimeout(apSearchDebounceTimer);
      apSearchDebounceTimer = setTimeout(() => {
        loadApNamesPage(1);
      }, 250);
    });
  }

  if (apPageSizeSelect) {
    apPageSizeSelect.addEventListener('change', () => {
      apPaginationState.pageSize = parseInt(apPageSizeSelect.value, 10) || 50;
      loadApNamesPage(1);
    });
  }

  if (btnApFirstPage) {
    btnApFirstPage.addEventListener('click', () => {
      if (apPaginationState.page > 1) loadApNamesPage(1);
    });
  }

  if (btnApPrevPage) {
    btnApPrevPage.addEventListener('click', () => {
      if (apPaginationState.page > 1) loadApNamesPage(apPaginationState.page - 1);
    });
  }

  if (btnApNextPage) {
    btnApNextPage.addEventListener('click', () => {
      if (apPaginationState.page < apPaginationState.totalPages) loadApNamesPage(apPaginationState.page + 1);
    });
  }

  if (btnApLastPage) {
    btnApLastPage.addEventListener('click', () => {
      if (apPaginationState.page < apPaginationState.totalPages) loadApNamesPage(apPaginationState.totalPages);
    });
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

  window.removeApName = async function (bssid) {
    await fetch('/api/ap-names/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bssid: bssid })
    });
    showToast(`Alias eliminado para ${bssid}`, 'info');
    loadApNamesPage(apPaginationState.page);
  };

  if (btnAddApname) {
    btnAddApname.addEventListener('click', async () => {
      const bssid = inputNewBssid.value.trim();
      const name = inputNewApname.value.trim();
      const loc = inputNewAploc ? inputNewAploc.value.trim() : '';
      if (!bssid || !name) {
        showToast('Por favor ingresa tanto el BSSID (MAC) como el Nombre del AP.', 'warn');
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
          showToast(`AP ${bssid} registrado como "${name}"`, 'success');
          loadApNamesPage(1);
        } else {
          showToast('Error: ' + data.message, 'error');
        }
      } catch (e) {
        showToast('Error guardando AP: ' + e, 'error');
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
            showToast(`CSV importado: +${data.added} nuevos, ${data.updated} actualizados (Total: ${data.total})`, 'success', 5500);
            loadApNamesPage(1);
          } else {
            showToast('Error al importar CSV: ' + (data.message || 'Formato no reconocido'), 'error');
          }
        } catch (err) {
          showToast('Error de procesamiento: ' + err, 'error');
        } finally {
          btnImportApCsv.disabled = false;
          btnImportApCsv.innerHTML = originalHtml;
        }
      };
      reader.onerror = () => {
        showToast('Error al leer el archivo seleccionado.', 'error');
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
    btnClearAllAps.addEventListener('click', () => {
      openCustomModal({
        title: 'Vaciar Inventario de APs',
        icon: 'fa-trash-can',
        confirmText: 'Sí, Eliminar Todos',
        danger: true,
        bodyHtml: `<p>¿Estás seguro de que deseas eliminar <strong>TODOS</strong> los nombres y alias de APs registrados en la base de datos? Esta acción no se puede deshacer.</p>`,
        onConfirm: async () => {
          try {
            await fetch('/api/ap-names/clear', { method: 'POST' });
            showToast('Inventario de nombres de APs limpiado.', 'success');
            loadApNamesPage(1);
            return true;
          } catch (e) {
            showToast('Error al limpiar APs: ' + e, 'error');
            return false;
          }
        }
      });
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
      if (data.status === 'success') showToast(`Interfaz Wi-Fi cambiada a ${newIface}`, 'success');
      else showToast('Error: ' + data.message, 'error');
    } catch (e) {
      showToast('Error cambiando interfaz: ' + e, 'error');
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
    showToast('Parámetros de telemetría guardados exitosamente.', 'success');
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
        showToast('Configuración de autenticación guardada exitosamente.', 'success');
        fetchStatus();
      } catch (e) {
        showToast('Error guardando autenticación: ' + e, 'error');
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
          showToast(`Autenticación exitosa (HTTP ${code}) • Latencia: ${latency}`, 'success', 5000);
        } else if (code === 401 || code === 403) {
          showToast(`Fallo de autenticación (HTTP ${code}): Credenciales rechazadas.`, 'error', 6000);
        } else {
          showToast(`Prueba HTTP ${code} • Latencia: ${latency}${data.error_message ? ' (' + data.error_message + ')' : ''}`, 'warn', 5000);
        }
        fetchStatus();
      } catch (e) {
        showToast('Error al probar autenticación: ' + e, 'error');
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

  window.removeCustomOui = function (prefix) {
    openCustomModal({
      title: 'Eliminar Prefijo OUI Personalizado',
      icon: 'fa-trash-can',
      confirmText: 'Eliminar Prefijo',
      danger: true,
      bodyHtml: `<p>¿Eliminar la personalización para el prefijo OUI <strong>${escapeHtml(prefix)}</strong>?</p>`,
      onConfirm: async () => {
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
            showToast(`Prefijo ${prefix} eliminado.`, 'success');
          } else {
            showToast('Error al eliminar OUI: ' + (data.message || ''), 'error');
          }
        } catch (e) {
          showToast('Error en la solicitud: ' + e, 'error');
        }
        return true;
      }
    });
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
    btnUpdateOui.addEventListener('click', () => {
      openCustomModal({
        title: 'Actualizar Base OUI desde IEEE',
        icon: 'fa-cloud-arrow-down',
        confirmText: 'Iniciar Descarga',
        bodyHtml: `<p>¿Deseas descargar la versión más reciente del registro oficial de fabricantes del IEEE (MA-L)? Este proceso se ejecuta en segundo plano.</p>`,
        onConfirm: async () => {
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
              showToast(data.message || data.status, 'info');
              checkOuiUpdateStatus();
            }
          } catch (e) {
            showToast('Error al iniciar actualización: ' + e, 'error');
            if (btnUpdateOui) {
              btnUpdateOui.disabled = false;
              btnUpdateOui.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> Actualizar desde IEEE';
            }
          }
          return true;
        }
      });
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
        showToast('Ingresa tanto el prefijo MAC (3 octetos) como el nombre del fabricante.', 'warn');
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
          showToast(`Prefijo OUI ${prefix} (${vendor}) guardado.`, 'success');
        } else {
          showToast('Error: ' + (data.message || 'No se pudo guardar'), 'error');
        }
      } catch (e) {
        showToast('Error de conexión: ' + e, 'error');
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
      const loss = Number(data.packet_loss_pct || 0);
      const avg = data.avg_ping_ms !== null && data.avg_ping_ms !== undefined ? `${data.avg_ping_ms} ms` : 'Timeout';
      const pingsStr = Array.isArray(data.pings) && data.pings.length > 0 ? data.pings.join(', ') + ' ms' : 'Sin respuesta';

      if (roamingPingInlineResult) {
        roamingPingInlineResult.style.display = 'block';
        roamingPingInlineResult.classList.remove('ping-ok', 'ping-warn', 'ping-danger');
        roamingPingInlineResult.classList.add(loss === 0 ? 'ping-ok' : (loss < 50 ? 'ping-warn' : 'ping-danger'));
        roamingPingInlineResult.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem;">
            <strong><i class="fa-solid fa-bolt"></i> Ráfaga Gateway (${escapeHtml(data.gateway || 'GW')}): ${avg}</strong>
            <span class="badge" style="font-size: 0.68rem; padding: 0.1rem 0.45rem;">Pérdida: ${loss}%</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--text-muted); font-family: monospace;">Muestras: ${escapeHtml(pingsStr)}</div>
        `;
      }
      showToast(`Ráfaga Gateway: Promedio ${avg} (Pérdida: ${loss}%)`, loss === 0 ? 'success' : 'warn');
    } catch (e) {
      showToast('Error en prueba de ping: ' + e, 'error');
    } finally {
      btnTestRoaming.innerHTML = '<i class="fa-solid fa-vial-circle-check"></i> Probar Ping';
      btnTestRoaming.disabled = false;
    }
  });

  // =========================================================================
  // Help Center & Manual Viewer Controller (Tab: tab-help)
  // =========================================================================
  let helpCurrentManual = 'completo'; // 'completo' | 'l1'
  let helpCurrentFormat = 'html';     // 'html' | 'pdf'
  let helpInitialized = false;

  const MANUAL_DATA = {
    completo: {
      title: 'Manual de Operación y Arquitectura del Sistema (Oficial Release 4.0)',
      subtitle: 'Manual Maestro Oficial • Release 4.0 • Vistas Modulares con Barra Lateral Vertical',
      iconClass: 'fa-solid fa-book-open',
      iconColor: 'var(--accent-cyan)',
      htmlUrl: '/docs/manual_operacion_y_arquitectura.html',
      pdfUrl: '/Manual_de_Operacion_y_Arquitectura.pdf',
      downloadFilename: 'Manual_de_Operacion_y_Arquitectura.pdf'
    },
    l1: {
      title: 'Guía de Campo para Soporte Técnico Nivel 1',
      subtitle: 'Guía Rápida de Campo • 5 Páginas • Checklist & Semáforos de Diagnóstico',
      iconClass: 'fa-solid fa-screwdriver-wrench',
      iconColor: 'var(--accent-emerald)',
      htmlUrl: '/docs/manual_soporte_nivel1.html',
      pdfUrl: '/Manual_Usuario_Soporte_Nivel_1.pdf',
      downloadFilename: 'Manual_Usuario_Soporte_Nivel_1.pdf'
    }
  };

  function updateHelpViewer() {
    const data = MANUAL_DATA[helpCurrentManual];
    if (!data) return;

    const titleEl = document.getElementById('viewer-doc-title');
    const metaEl = document.getElementById('viewer-doc-meta');
    const badgeIconEl = document.getElementById('viewer-badge-icon');
    const iframeEl = document.getElementById('help-doc-iframe');
    const downloadBtn = document.getElementById('btn-viewer-download');
    const formatBtnHtml = document.getElementById('btn-format-html');
    const formatBtnPdf = document.getElementById('btn-format-pdf');
    const loadingOverlay = document.getElementById('viewer-loading');

    if (titleEl) titleEl.textContent = data.title;
    if (metaEl) {
      const formatLabel = helpCurrentFormat === 'html' ? 'Versión Web HTML interactiva' : 'Versión PDF original';
      metaEl.textContent = `Visualizando: ${formatLabel} • ${data.subtitle}`;
    }
    if (badgeIconEl) {
      badgeIconEl.innerHTML = `<i class="${data.iconClass}" style="color: ${data.iconColor};"></i>`;
    }
    if (downloadBtn) {
      downloadBtn.href = data.pdfUrl;
      downloadBtn.setAttribute('download', data.downloadFilename);
    }

    if (formatBtnHtml && formatBtnPdf) {
      if (helpCurrentFormat === 'html') {
        formatBtnHtml.classList.add('active');
        formatBtnPdf.classList.remove('active');
      } else {
        formatBtnPdf.classList.add('active');
        formatBtnHtml.classList.remove('active');
      }
    }

    // Update active state in cards
    document.querySelectorAll('.manual-card').forEach(card => {
      if (card.dataset.manual === helpCurrentManual) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // Update iframe source
    const targetUrl = helpCurrentFormat === 'html' ? data.htmlUrl : data.pdfUrl;
    if (iframeEl) {
      const currentSrc = iframeEl.getAttribute('src');
      if (currentSrc !== targetUrl) {
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        iframeEl.src = targetUrl;
        iframeEl.onload = () => {
          if (loadingOverlay) loadingOverlay.style.display = 'none';
        };
      }
    }
  }

  function initHelpView() {
    if (!helpInitialized) {
      helpInitialized = true;

      // Card selection buttons
      document.querySelectorAll('.btn-select-manual').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const target = btn.dataset.target;
          if (target && MANUAL_DATA[target]) {
            helpCurrentManual = target;
            updateHelpViewer();
            const viewer = document.getElementById('help-viewer-container');
            if (viewer) {
              viewer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
        });
      });

      // Card click
      document.querySelectorAll('.manual-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('a') || e.target.closest('button')) return;
          const target = card.dataset.manual;
          if (target && MANUAL_DATA[target]) {
            helpCurrentManual = target;
            updateHelpViewer();
          }
        });
      });

      // Format switch buttons
      const btnFormatHtml = document.getElementById('btn-format-html');
      const btnFormatPdf = document.getElementById('btn-format-pdf');

      if (btnFormatHtml) {
        btnFormatHtml.addEventListener('click', () => {
          helpCurrentFormat = 'html';
          updateHelpViewer();
        });
      }

      if (btnFormatPdf) {
        btnFormatPdf.addEventListener('click', () => {
          helpCurrentFormat = 'pdf';
          updateHelpViewer();
        });
      }

      // Reload button
      const btnReload = document.getElementById('btn-viewer-reload');
      if (btnReload) {
        btnReload.addEventListener('click', () => {
          const iframeEl = document.getElementById('help-doc-iframe');
          if (iframeEl) {
            const loadingOverlay = document.getElementById('viewer-loading');
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            iframeEl.src = iframeEl.src;
          }
        });
      }

      // New tab button
      const btnNewtab = document.getElementById('btn-viewer-newtab');
      if (btnNewtab) {
        btnNewtab.addEventListener('click', () => {
          const data = MANUAL_DATA[helpCurrentManual];
          const targetUrl = helpCurrentFormat === 'html' ? data.htmlUrl : data.pdfUrl;
          window.open(targetUrl, '_blank');
        });
      }

      // Fullscreen button
      const btnFullscreen = document.getElementById('btn-viewer-fullscreen');
      const viewerContainer = document.getElementById('help-viewer-container');
      const iconFullscreen = document.getElementById('icon-viewer-fullscreen');

      if (btnFullscreen && viewerContainer) {
        btnFullscreen.addEventListener('click', () => {
          viewerContainer.classList.toggle('is-fullscreen');
          const isFs = viewerContainer.classList.contains('is-fullscreen');
          if (iconFullscreen) {
            iconFullscreen.className = isFs ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
          }
        });
      }
    }

    updateHelpViewer();
  }

  // =========================================================================
  // --- Google Gemini Copilot, MCP Credentials & Physical Context Engine ---
  // =========================================================================

  let currentAiInteractionId = null;

  function renderSimpleMarkdown(mdText) {
    if (!mdText) return '';
    let html = escapeHtml(mdText);
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    html = html.replace(/\n\n/g, '<br><br>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  async function loadGeminiCredentialsStatus() {
    try {
      const res = await fetch('/api/agent/credentials');
      if (!res.ok) return;
      const cred = await res.json();

      const aiCredBadge = document.getElementById('ai-cred-badge');
      const cfgStatusPill = document.getElementById('cfg-gemini-status-pill');
      const cfgSourceBox = document.getElementById('cfg-gemini-source-box');
      const cfgModelSel = document.getElementById('cfg-gemini-model');
      const aiModelSel = document.getElementById('ai-model-selector');

      if (cred.model) {
        if (cfgModelSel) cfgModelSel.value = cred.model;
        if (aiModelSel) aiModelSel.value = cred.model;
      }

      if (cred.has_api_key) {
        const label = `Conectado (${cred.masked_key}) • ${cred.source.toUpperCase()}`;
        if (aiCredBadge) {
          aiCredBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHtml(label)}`;
          aiCredBadge.style.background = 'rgba(16, 185, 129, 0.14)';
          aiCredBadge.style.color = '#059669';
        }
        if (cfgStatusPill) {
          cfgStatusPill.textContent = `Clave Activa (${cred.masked_key})`;
          cfgStatusPill.style.background = 'rgba(16, 185, 129, 0.14)';
          cfgStatusPill.style.color = '#059669';
        }
        if (cfgSourceBox) {
          cfgSourceBox.innerHTML = `✅ <strong>Clave activa:</strong> <code>${escapeHtml(cred.masked_key)}</code><br>🔒 <strong>Origen seguro:</strong> ${escapeHtml(cred.source_label)}`;
        }
      } else {
        if (aiCredBadge) {
          aiCredBadge.innerHTML = `<i class="fa-solid fa-plug"></i> Modo MCP / Heurístico Local (Configurar API Key en Sistema)`;
          aiCredBadge.style.background = 'rgba(245, 158, 11, 0.14)';
          aiCredBadge.style.color = '#b45309';
        }
        if (cfgStatusPill) {
          cfgStatusPill.textContent = 'Sin API Key (Modo MCP Externo)';
          cfgStatusPill.style.background = 'rgba(245, 158, 11, 0.14)';
          cfgStatusPill.style.color = '#b45309';
        }
        if (cfgSourceBox) {
          cfgSourceBox.innerHTML = `ℹ️ <strong>Estado:</strong> ${escapeHtml(cred.source_label)}`;
        }
      }
    } catch (e) {
      console.warn('Error verificando credenciales Gemini:', e);
    }
  }

  async function loadZonePhysicalContext() {
    try {
      const loc = selLocation ? selLocation.value : '';
      const zone = selZone ? selZone.value : '';
      const q = new URLSearchParams({ location: loc, zone: zone }).toString();
      const [resCtx, resQuestions] = await Promise.all([
        fetch(`/api/zone-context?${q}`),
        fetch('/api/agent/context-questions')
      ]);
      const ctxData = await resCtx.json();
      const qData = await resQuestions.json();

      const profile = ctxData.profile || {};
      const locZoneEl = document.getElementById('ai-ctx-loc-zone');
      const summaryPillsEl = document.getElementById('ai-ctx-summary-pills');
      const savedBadge = document.getElementById('ai-profile-saved-badge');
      const lblZoneCtxStatus = document.getElementById('lbl-zone-ctx-status');

      if (locZoneEl) {
        locZoneEl.textContent = `${profile.location || loc} ➔ ${profile.zone || zone}`;
      }

      // Populate form fields
      const envEl = document.getElementById('ctx-env-type');
      const ceilEl = document.getElementById('ctx-ceiling-height');
      const obsEl = document.getElementById('ctx-obstacles');
      const modeEl = document.getElementById('ctx-test-mode');
      const devEl = document.getElementById('ctx-device-type');
      const intfEl = document.getElementById('ctx-interference');
      const descEl = document.getElementById('ctx-custom-desc');

      if (envEl) envEl.value = profile.environment_type || '';
      if (ceilEl) ceilEl.value = profile.ceiling_height || '';
      if (obsEl) obsEl.value = profile.obstacles || '';
      if (modeEl) modeEl.value = profile.test_mode || '';
      if (devEl) devEl.value = profile.client_device_type || '';
      if (intfEl) intfEl.value = profile.interference_notes || '';
      if (descEl) descEl.value = profile.custom_description || '';

      if (profile.configured) {
        const parts = [
          profile.is_inherited ? '🚶 Recorrido Heredado de Sede' : '',
          profile.environment_type,
          profile.ceiling_height ? `APs: ${profile.ceiling_height}` : '',
          profile.obstacles ? `Obstáculos: ${profile.obstacles}` : '',
          profile.test_mode ? `Modo: ${profile.test_mode}` : '',
          profile.client_device_type ? `Terminal: ${profile.client_device_type}` : ''
        ].filter(Boolean);
        if (summaryPillsEl) {
          summaryPillsEl.innerHTML = parts.map(p => {
            const isHeredado = p.includes('Heredado');
            const bg = isHeredado ? 'rgba(99, 102, 241, 0.12)' : '#ffffff';
            const color = isHeredado ? '#4338ca' : 'inherit';
            const border = isHeredado ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid #cbd5e1';
            return `<span class="badge" style="margin-right:0.35rem; background:${bg}; color:${color}; border:${border}; font-weight:600;">${escapeHtml(p)}</span>`;
          }).join('');
        }

        // Calculate completeness
        const totalFields = 7;
        let filledCount = 0;
        if (profile.environment_type) filledCount++;
        if (profile.ceiling_height) filledCount++;
        if (profile.obstacles) filledCount++;
        if (profile.test_mode) filledCount++;
        if (profile.client_device_type) filledCount++;
        if (profile.interference_notes) filledCount++;
        if (profile.custom_description) filledCount++;
        const pct = Math.round((filledCount / totalFields) * 100);

        if (savedBadge) {
          if (profile.is_inherited) {
            savedBadge.innerHTML = `<i class="fa-solid fa-person-walking"></i> Recorrido Sede ${pct}%`;
            savedBadge.title = `Heredado de: ${profile.inherited_from || 'Perfil de Recorrido Maestro de la Sede'}`;
            savedBadge.style.background = 'rgba(99, 102, 241, 0.14)';
            savedBadge.style.color = '#4338ca';
          } else {
            savedBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Calibrado ${pct}%`;
            savedBadge.title = 'Perfil calibrado específicamente para esta zona';
            savedBadge.style.background = pct >= 70 ? 'rgba(16, 185, 129, 0.14)' : 'rgba(139, 92, 246, 0.14)';
            savedBadge.style.color = pct >= 70 ? '#059669' : '#6d28d9';
          }
        }
        if (lblZoneCtxStatus) {
          lblZoneCtxStatus.textContent = profile.is_inherited ? `Recorrido ${pct}% ✓` : (pct >= 70 ? `Contexto ${pct}% ✓` : 'Contexto Físico');
        }
      } else {
        if (summaryPillsEl) {
          summaryPillsEl.innerHTML = '<span style="color:#b45309; font-weight:600;"><i class="fa-solid fa-triangle-exclamation"></i> Sin perfil físico registrado para esta zona. Completa las preguntas de la izquierda para mejorar la precisión del modelo.</span>';
        }
        if (savedBadge) {
          savedBadge.textContent = 'Pendiente 0%';
          savedBadge.style.background = 'rgba(245, 158, 11, 0.14)';
          savedBadge.style.color = '#b45309';
        }
        if (lblZoneCtxStatus) {
          lblZoneCtxStatus.textContent = 'Contexto Físico';
        }
      }

      renderSituationalQuestions(qData.questions || []);
    } catch (e) {
      console.warn('Error cargando contexto físico de zona:', e);
    }
  }

  function renderSituationalQuestions(questions) {
    const listEl = document.getElementById('ai-situational-questions-list');
    const countEl = document.getElementById('ai-questions-count');
    if (!listEl) return;

    if (countEl) {
      countEl.textContent = `${questions.length} ${questions.length === 1 ? 'activa' : 'activas'}`;
    }

    if (!questions || questions.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 0.9rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 0.8rem; color: var(--text-secondary);">
          <i class="fa-solid fa-circle-check" style="color: var(--accent-emerald);"></i>
          No se detectan ambigüedades críticas en este instante. Puedes lanzar una auditoría directa o consultar al agente en el chat.
        </div>
      `;
      return;
    }

    listEl.innerHTML = questions.map(q => {
      const sevClass = q.severity === 'danger' ? 'sev-danger' : (q.severity === 'warning' ? 'sev-warning' : '');
      const optsHtml = (q.quick_options || []).map(opt => `
        <button type="button" class="ai-q-opt-btn" data-qtitle="${escapeHtml(q.title)}" data-qtext="${escapeHtml(q.question)}" data-tigger="${escapeHtml(q.trigger_type)}" data-ans="${escapeHtml(opt)}">
          ${escapeHtml(opt)}
        </button>
      `).join('');
      return `
        <div class="ai-question-card ${sevClass}">
          <div class="ai-q-title"><i class="fa-solid fa-bolt"></i> ${escapeHtml(q.title)}</div>
          <div class="ai-q-text">${escapeHtml(q.question)}</div>
          <div class="ai-q-options">${optsHtml}</div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.ai-q-opt-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const qText = btn.dataset.qtext || '';
        const ans = btn.dataset.ans || '';
        const trig = btn.dataset.tigger || 'situational';
        
        // Immediate visual state on the card
        const card = btn.closest('.ai-question-card');
        if (card) {
          card.classList.add('answered');
          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
              <span style="font-size: 0.8rem; font-weight: 600; color: #059669;">
                <i class="fa-solid fa-circle-check"></i> ${escapeHtml(qText)}: <strong>${escapeHtml(ans)}</strong>
              </span>
              <span class="badge" style="background: #dcfce7; color: #166534; font-size: 0.68rem; font-weight: 700; flex-shrink: 0;">Calibrado</span>
            </div>
          `;
        }

        try {
          await fetch('/api/agent/annotate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trigger_type: trig,
              question_text: qText,
              user_answer: ans
            })
          });
          await sendAiPrompt(`Observación física en campo confirmada sobre "${qText}": **${ans}**. Con base en este contexto físico y la telemetría actual, ¿cuál es tu diagnóstico y recomendación?`, 'situational_answer');
        } catch (err) {
          console.error(err);
        }
      });
    });
  }

  function appendAiMessage(role, headerLabel, bodyHtml, toolsUsed = []) {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `ai-msg ${role === 'user' ? 'ai-msg-user' : 'ai-msg-assistant'}`;

    let toolsHtml = '';
    if (toolsUsed && toolsUsed.length > 0) {
      const toolPills = toolsUsed.map(t => `<code class="mcp-tool-pill"><i class="fa-solid fa-gear"></i> ${escapeHtml(t)}</code>`).join(' ');
      toolsHtml = `
        <details class="mcp-tool-details">
          <summary class="mcp-tool-summary">
            <i class="fa-solid fa-screwdriver-wrench"></i> ${toolsUsed.length} herramienta${toolsUsed.length > 1 ? 's' : ''} MCP ejecutada${toolsUsed.length > 1 ? 's' : ''}
          </summary>
          <div class="mcp-tool-payload">
            ${toolPills}
          </div>
        </details>
      `;
    }

    div.innerHTML = `
      <div class="ai-msg-header">
        <strong>${role === 'user' ? '<i class="fa-solid fa-user-astronaut"></i> Operador / Ingeniero' : '<i class="fa-solid fa-robot"></i> ' + escapeHtml(headerLabel)}</strong>
        <span>${new Date().toLocaleTimeString([], { hour12: false })}</span>
      </div>
      ${toolsHtml}
      <div class="ai-msg-body">${bodyHtml}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  async function sendAiPrompt(promptText, mode = 'chat') {
    const sendBtn = document.getElementById('btn-ai-send-chat');
    const auditBtn = document.getElementById('btn-ai-quick-audit');
    const modelSel = document.getElementById('ai-model-selector');
    const chosenModel = modelSel ? modelSel.value : 'gemini-3.8-flash';

    appendAiMessage('user', 'Consulta Técnica', renderSimpleMarkdown(promptText));
    const loadingCard = appendAiMessage(
      'assistant',
      `Analizando con ${chosenModel}...`,
      `<i class="fa-solid fa-spinner fa-spin" style="color:#7c3aed;"></i> Consultando telemetría en vivo (RF, Roaming, Espectro, Fases HTTP) y cruzando con el contexto físico de la zona...`
    );

    if (sendBtn) sendBtn.disabled = true;
    if (auditBtn) auditBtn.disabled = true;

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          mode: mode,
          model: chosenModel,
          previous_interaction_id: currentAiInteractionId
        })
      });
      const data = await res.json();
      if (loadingCard) loadingCard.remove();

      if (data.status === 'error') {
        appendAiMessage('assistant', 'Aviso del Agente', `<span style="color:#ef4444; font-weight:600;">Error: ${escapeHtml(data.message)}</span>`);
      } else {
        if (data.interaction_id) {
          currentAiInteractionId = data.interaction_id;
        }
        appendAiMessage(
          'assistant',
          `Agente CWNE (${data.model || chosenModel})`,
          renderSimpleMarkdown(data.response_markdown || ''),
          data.tools_used || []
        );
        if (Array.isArray(data.situational_questions)) {
          renderSituationalQuestions(data.situational_questions);
        }
      }
    } catch (e) {
      if (loadingCard) loadingCard.remove();
      appendAiMessage('assistant', 'Error de Conexión', `<span style="color:#ef4444;">No se pudo completar la consulta: ${escapeHtml(String(e))}</span>`);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (auditBtn) auditBtn.disabled = false;
    }
  }

  const PHYSICAL_TEMPLATES = {
    retail: {
      env: 'Piso de Venta / Tienda Retail',
      ceiling: 'Techo bajo (< 3.5 m) - Omnidireccional',
      obstacles: 'Góndolas comerciales, Clientes/público, Vidrios',
      mode: 'Caminando a paso normal (Walk-Test por pasillos)',
      device: 'Caja Registradora POS / Datáfono Inalámbrico',
      intf: 'Datáfonos Bluetooth, alta concurrencia de clientes, microondas cafetería',
      desc: 'Recorrido por pasillos de tienda y cajas de cobro. Verificando persistencia de transacciones POS y roaming entre APs del techo comercial.'
    },
    bodega: {
      env: 'Bodega / Centro de Distribución (Estanterías altas)',
      ceiling: 'Gran altura industrial (7 a 12 m) - Techo/Cercha',
      obstacles: 'Racks metálicos llenos, Puerta cortafuego, Muros de concreto',
      mode: 'Desplazamiento rápido (Montacargas / Estibadora eléctrica)',
      device: 'Terminal Portátil PDA / Pistola RF (Zebra / Honeywell - WMS)',
      intf: 'Tráfico de montacargas, densidad RF industrial, reflexión en estanterías metálicas',
      desc: 'Walk-test y test en estibadora por pasillos de estantería pesada. Validación de desconexión de sesiones telnet/WMS y handoffs lentos.'
    },
    oficina: {
      env: 'Oficina Abierta / Corporativo',
      ceiling: 'Techo bajo (< 3.5 m) - Omnidireccional',
      obstacles: 'Muros de drywall, Divisiones de vidrio, Mobiliario de oficina',
      mode: 'Caminando a paso normal (Walk-Test por pasillos)',
      device: 'Laptop Corporativa (ERP / Videollamadas / Office)',
      intf: 'Redes vecinas 2.4/5GHz, concurrencia de laptops y smartphones corporativos',
      desc: 'Recorrido entre salas de reuniones y puestos operativos. Verificando jitter y micro-cortes en llamadas Teams/Zoom y roaming entre APs de pasillo.'
    }
  };

  function applyPhysicalContextTemplate(tplKey) {
    const tpl = PHYSICAL_TEMPLATES[tplKey];
    if (!tpl) return;
    const envEl = document.getElementById('ctx-env-type');
    const ceilEl = document.getElementById('ctx-ceiling-height');
    const obsEl = document.getElementById('ctx-obstacles');
    const modeEl = document.getElementById('ctx-test-mode');
    const devEl = document.getElementById('ctx-device-type');
    const intfEl = document.getElementById('ctx-interference');
    const descEl = document.getElementById('ctx-custom-desc');

    if (envEl) envEl.value = tpl.env;
    if (ceilEl) ceilEl.value = tpl.ceiling;
    if (obsEl) obsEl.value = tpl.obstacles;
    if (modeEl) modeEl.value = tpl.mode;
    if (devEl) devEl.value = tpl.device;
    if (intfEl) intfEl.value = tpl.intf;
    if (descEl) descEl.value = tpl.desc;

    // Visual feedback
    const savedBadge = document.getElementById('ai-profile-saved-badge');
    if (savedBadge) {
      savedBadge.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Plantilla cargada (100%)';
      savedBadge.style.background = 'rgba(139, 92, 246, 0.16)';
      savedBadge.style.color = '#6d28d9';
    }
  }

  async function saveZonePhysicalContextForm(andAudit = false) {
    const loc = selLocation ? selLocation.value : '';
    const zone = selZone ? selZone.value : '';
    const isScopeAll = document.getElementById('ctx-scope-all')?.checked ?? true;
    const payload = {
      location: loc,
      zone: zone,
      apply_to_all_zones: isScopeAll,
      environment_type: (document.getElementById('ctx-env-type') || {}).value || '',
      ceiling_height: (document.getElementById('ctx-ceiling-height') || {}).value || '',
      obstacles: (document.getElementById('ctx-obstacles') || {}).value || '',
      test_mode: (document.getElementById('ctx-test-mode') || {}).value || '',
      client_device_type: (document.getElementById('ctx-device-type') || {}).value || '',
      interference_notes: (document.getElementById('ctx-interference') || {}).value || '',
      custom_description: (document.getElementById('ctx-custom-desc') || {}).value || ''
    };

    const res = await fetch('/api/zone-context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    await loadZonePhysicalContext();

    if (andAudit) {
      const scopeDesc = isScopeAll ? `para todo el recorrido en "${loc}"` : `de la zona "${loc} / ${zone}"`;
      await sendAiPrompt(
        `He actualizado la ficha física de entorno ${scopeDesc}. Con este contexto físico y la telemetría en tiempo real que se está capturando ahora mismo, realiza un diagnóstico completo y dime qué está afectando o qué optimizar.`,
        'context_calibrated_audit'
      );
    } else if (data.status === 'success') {
      const savedBadge = document.getElementById('ai-profile-saved-badge');
      if (savedBadge) {
        savedBadge.textContent = isScopeAll ? '¡Recorrido Guardado!' : '¡Zona Guardada!';
      }
    }
  }

  function initAiAgentEvents() {
    // Walk-Test scope toggle
    const radioScopeAll = document.getElementById('ctx-scope-all');
    const radioScopeZone = document.getElementById('ctx-scope-zone');
    const lblScopeAll = document.getElementById('lbl-scope-all');
    const lblScopeZone = document.getElementById('lbl-scope-zone');
    const lblBtnSaveCtx = document.getElementById('lbl-btn-save-ctx');

    function updateScopeRadioUI() {
      const isAll = radioScopeAll?.checked ?? true;
      if (lblScopeAll) lblScopeAll.classList.toggle('active', isAll);
      if (lblScopeZone) lblScopeZone.classList.toggle('active', !isAll);
      if (lblBtnSaveCtx) {
        lblBtnSaveCtx.textContent = isAll ? 'Guardar Recorrido (Toda la Sede)' : 'Guardar Solo Zona Actual';
      }
    }

    if (radioScopeAll) radioScopeAll.addEventListener('change', updateScopeRadioUI);
    if (radioScopeZone) radioScopeZone.addEventListener('change', updateScopeRadioUI);

    // 1-Click Templates
    document.querySelectorAll('.btn-preset-tpl').forEach(btn => {
      btn.addEventListener('click', () => {
        const tplKey = btn.dataset.tpl;
        if (tplKey) applyPhysicalContextTemplate(tplKey);
      });
    });

    // Quick obstacle chips
    document.querySelectorAll('.chip-option').forEach(chip => {
      chip.addEventListener('click', () => {
        const inputEl = document.getElementById('ctx-obstacles');
        if (!inputEl) return;
        const val = chip.dataset.val || '';
        const current = inputEl.value.trim();
        if (!current) {
          inputEl.value = val;
        } else if (!current.toLowerCase().includes(val.toLowerCase())) {
          inputEl.value = `${current}, ${val}`;
        }
      });
    });

    const btnSaveCtx = document.getElementById('btn-save-zone-context');
    if (btnSaveCtx) {
      btnSaveCtx.addEventListener('click', () => saveZonePhysicalContextForm(false));
    }

    const btnSaveAuditCtx = document.getElementById('btn-save-and-audit-context');
    if (btnSaveAuditCtx) {
      btnSaveAuditCtx.addEventListener('click', () => saveZonePhysicalContextForm(true));
    }

    const btnQuickAudit = document.getElementById('btn-ai-quick-audit');
    if (btnQuickAudit) {
      btnQuickAudit.addEventListener('click', () => {
        sendAiPrompt(
          'Realiza una auditoría integral en tiempo real de la captura actual en esta Sede y Zona. Evalúa Capa 1/2 (Señal RF, Roaming, Espectro de canales), Capa 3/4 (Gateway, DNS) y Capa 7 (Fases HTTP/TTFB), tomando en cuenta el contexto físico del sitio.',
          'quick_audit'
        );
      });
    }

    const btnEditCtx = document.getElementById('btn-ai-edit-context');
    if (btnEditCtx) {
      btnEditCtx.addEventListener('click', () => {
        const card = document.getElementById('card-physical-context-editor');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    const btnRefreshQ = document.getElementById('btn-ai-refresh-questions');
    if (btnRefreshQ) {
      btnRefreshQ.addEventListener('click', () => loadZonePhysicalContext());
    }

    const btnResetSession = document.getElementById('btn-ai-reset-session');
    if (btnResetSession) {
      btnResetSession.addEventListener('click', () => {
        currentAiInteractionId = null;
        const container = document.getElementById('ai-chat-messages');
        if (container) {
          container.innerHTML = '';
          appendAiMessage(
            'assistant',
            'Agente CWNE Gemini',
            'Sesión reiniciada. El contexto físico de la Sede/Zona y la telemetría en tiempo real están listos para tu próxima consulta.'
          );
        }
      });
    }

    const btnSendChat = document.getElementById('btn-ai-send-chat');
    const chatInput = document.getElementById('ai-chat-input');
    if (btnSendChat && chatInput) {
      btnSendChat.addEventListener('click', () => {
        const txt = chatInput.value.trim();
        if (!txt) return;
        chatInput.value = '';
        sendAiPrompt(txt, 'chat');
      });
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          btnSendChat.click();
        }
      });
    }

    document.querySelectorAll('.ai-prompt-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const p = chip.dataset.prompt;
        if (p) sendAiPrompt(p, 'preset_prompt');
      });
    });

    // Credentials save & clear in Configuration tab
    const btnSaveGeminiCreds = document.getElementById('btn-save-gemini-creds');
    if (btnSaveGeminiCreds) {
      btnSaveGeminiCreds.addEventListener('click', async () => {
        const keyInput = document.getElementById('cfg-gemini-api-key');
        const storageSel = document.getElementById('cfg-gemini-storage');
        const modelSel = document.getElementById('cfg-gemini-model');
        const apiKey = keyInput ? keyInput.value.trim() : '';
        const storage = storageSel ? storageSel.value : 'dotenv';
        const model = modelSel ? modelSel.value : 'gemini-3.8-flash';

        try {
          const res = await fetch('/api/agent/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'save',
              api_key: apiKey,
              storage: storage,
              model: model
            })
          });
          const data = await res.json();
          if (keyInput) keyInput.value = '';
          await loadGeminiCredentialsStatus();
          showToast(data.message || 'Credenciales guardadas de forma segura.', 'success');
        } catch (err) {
          showToast('Error guardando credenciales Gemini: ' + err, 'error');
        }
      });
    }

    const btnClearGeminiCreds = document.getElementById('btn-clear-gemini-creds');
    if (btnClearGeminiCreds) {
      btnClearGeminiCreds.addEventListener('click', () => {
        openCustomModal({
          title: 'Eliminar Clave de API Gemini',
          icon: 'fa-solid fa-triangle-exclamation',
          message: '¿Deseas eliminar la clave de API de Gemini almacenada localmente (.env y SQLite)? Deberás ingresarla nuevamente para habilitar el Copiloto IA.',
          confirmText: 'Sí, eliminar',
          confirmClass: 'btn-danger',
          onConfirm: async () => {
            try {
              const res = await fetch('/api/agent/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'clear' })
              });
              const data = await res.json();
              await loadGeminiCredentialsStatus();
              showToast(data.message || 'Clave local eliminada.', 'info');
              return true;
            } catch (err) {
              showToast('Error eliminando clave: ' + err, 'error');
              return false;
            }
          }
        });
      });
    }

    // Cross-view shortcuts to AI Agent
    const btnRoamingAskAi = document.getElementById('btn-roaming-ask-ai');
    if (btnRoamingAskAi) {
      btnRoamingAskAi.addEventListener('click', () => {
        const tabAiBtn = document.getElementById('tab-btn-ai-agent');
        if (tabAiBtn) tabAiBtn.click();
        sendAiPrompt(
          'Audita el comportamiento reciente de Roaming y Hand-offs en esta zona. ¿Detectas eventos de Sticky Client, Ping-Pong Roaming o caídas anormales tras la transición?',
          'roaming_anomaly_audit'
        );
      });
    }

    const btnHttpAskAi = document.getElementById('btn-http-ask-ai');
    if (btnHttpAskAi) {
      btnHttpAskAi.addEventListener('click', () => {
        const tabAiBtn = document.getElementById('tab-btn-ai-agent');
        if (tabAiBtn) tabAiBtn.click();
        sendAiPrompt(
          'Audita las fases de la sonda de latencia HTTP (DNS, TCP, TLS, TTFB y Transferencia). ¿El cuello de botella está en la señal Wi-Fi RF, en la pasarela o en el backend de la aplicación?',
          'http_latency_audit'
        );
      });
    }
  }

  async function loadAiAgentView() {
    await Promise.all([
      loadGeminiCredentialsStatus(),
      loadZonePhysicalContext()
    ]);
  }

  // --- Initialization ---
  async function init() {
    initAiAgentEvents();
    await loadPresets();
    await loadLocationsAndZones();
    await fetchStatus();
    loadGeminiCredentialsStatus();
    loadZonePhysicalContext();
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
