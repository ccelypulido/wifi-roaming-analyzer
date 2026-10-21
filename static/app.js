document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const headerSsid = document.getElementById('header-ssid');
  const headerBssid = document.getElementById('header-bssid');
  const headerPing = document.getElementById('header-ping');
  const signalDbmPill = document.getElementById('signal-dbm-pill');
  
  const gaugeFill = document.getElementById('gauge-fill');
  const gaugeScore = document.getElementById('gauge-score');
  const ratingPill = document.getElementById('rating-pill');
  const ratingRecommendation = document.getElementById('rating-recommendation');
  
  const bandBadge = document.getElementById('band-badge');
  const infoSsid = document.getElementById('info-ssid');
  const infoApName = document.getElementById('info-ap-name');
  const infoBssid = document.getElementById('info-bssid');
  const infoVendor = document.getElementById('info-vendor');
  const infoChanFreq = document.getElementById('info-chan-freq');
  const infoBitrate = document.getElementById('info-bitrate');
  const infoIpGw = document.getElementById('info-ip-gw');
  
  const roamingCountBadge = document.getElementById('roaming-count-badge');
  const roamingVerdict = document.getElementById('roaming-verdict');
  const infoSameSsidCount = document.getElementById('info-same-ssid-count');
  const infoTotalApsCount = document.getElementById('info-total-aps-count');
  
  const btnTestRoaming = document.getElementById('btn-test-roaming');
  const btnExportReport = document.getElementById('btn-export-report');
  const btnClearLog = document.getElementById('btn-clear-log');
  
  const roamingTableBody = document.getElementById('roaming-table-body');
  const apScannerTableBody = document.getElementById('ap-scanner-table-body');

  // Chart setup
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  const maxDataPoints = 40;
  const timeLabels = [];
  const signalData = [];
  const pingData = [];

  const telemetryChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: timeLabels,
      datasets: [
        {
          label: 'Intensidad Señal (dBm)',
          data: signalData,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.1)',
          borderWidth: 2,
          tension: 0.3,
          fill: true,
          yAxisID: 'ySignal'
        },
        {
          label: 'Latencia Ping (ms)',
          data: pingData,
          borderColor: '#8b5cf6',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [4, 4],
          tension: 0.2,
          yAxisID: 'yPing'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Outfit' } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          ticks: { color: '#64748b' }
        },
        ySignal: {
          type: 'linear',
          position: 'left',
          min: -100,
          max: -20,
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#06b6d4', callback: (val) => `${val} dBm` },
          title: { display: true, text: 'dBm', color: '#06b6d4' }
        },
        yPing: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 200,
          grid: { drawOnChartArea: false },
          ticks: { color: '#8b5cf6', callback: (val) => `${val} ms` },
          title: { display: true, text: 'ms', color: '#8b5cf6' }
        }
      }
    }
  });

  // Gauge animation helper
  function updateGauge(score, color) {
    gaugeScore.textContent = score;
    const circumference = 440;
    const offset = circumference - (circumference * score / 100);
    gaugeFill.style.strokeDashoffset = offset;
    gaugeFill.style.stroke = color;
  }

  // Recommendation builder
  function getRecommendationText(score, dbm, pingMs) {
    if (dbm >= -50) {
      return "📶 Excelente intensidad de señal. La cobertura y velocidad son ideales para streaming 4K, videoconferencias HD y juegos sin jitter.";
    } else if (dbm >= -60) {
      return "🟢 Muy buena calidad de enlace. Navegación fluida y rápida transmisión de datos sin interferencias apreciables.";
    } else if (dbm >= -70) {
      return "🟡 Calidad de señal aceptable. Funcionamiento correcto para uso general, aunque con menor margen ante interferencias.";
    } else if (dbm >= -80) {
      return "🟠 Señal débil. Si estás caminando, tu tarjeta de red debería evaluar hacer Roaming hacia un AP más cercano.";
    } else {
      return "🔴 Señal crítica. Cobertura deficiente. Se recomienda acercarse al AP o instalar un repetidor/nodo Mesh adicional.";
    }
  }

  // Status fetch & render
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      const data = await res.json();

      // Header
      headerSsid.textContent = data.ssid || 'Desconectado';
      headerBssid.textContent = data.ap_name ? `${data.ap_name} (${data.bssid})` : (data.bssid || '--:--:--:--:--:--');
      headerPing.textContent = data.ping_ms ? `${data.ping_ms} ms` : 'Sin Respuesta';
      signalDbmPill.textContent = `${data.signal_dbm} dBm (${data.signal_pct}%)`;

      // Gauge & Score
      updateGauge(data.rating_score, data.rating_color);
      ratingPill.textContent = data.rating_text;
      ratingPill.style.backgroundColor = data.rating_color;
      ratingRecommendation.textContent = getRecommendationText(data.rating_score, data.signal_dbm, data.ping_ms);

      // Connected AP Details
      bandBadge.textContent = data.band;
      infoSsid.textContent = data.ssid;
      if (infoApName) {
        infoApName.textContent = data.ap_name || 'Sin nombre asignado';
      }
      infoBssid.textContent = data.bssid;
      infoVendor.textContent = data.vendor_name;
      infoChanFreq.textContent = `Canal ${data.channel} (${data.frequency_mhz} MHz)`;
      infoBitrate.textContent = `TX: ${data.tx_bitrate} | RX: ${data.rx_bitrate}`;
      infoIpGw.textContent = `${data.ip_address} (GW: ${data.gateway_ip})`;

      // Roaming Card
      roamingCountBadge.textContent = `${data.recent_roaming_count} Handoffs`;
      roamingVerdict.textContent = data.roaming_verdict;
      infoSameSsidCount.textContent = `${data.same_ssid_aps_count} AP(s)`;
      infoTotalApsCount.textContent = `${data.total_neighbor_aps} AP(s)`;

      // Update Chart with persistence across page refresh
      if (timeLabels.length === 0 && data.telemetry_history && data.telemetry_history.length > 0) {
        data.telemetry_history.forEach(item => {
          timeLabels.push(item.time);
          signalData.push(item.signal_dbm);
          pingData.push(item.ping_ms || 0);
        });
        telemetryChart.update();
      } else {
        const timeStr = data.last_update || new Date().toLocaleTimeString();
        if (timeLabels.length === 0 || timeLabels[timeLabels.length - 1] !== timeStr) {
          timeLabels.push(timeStr);
          signalData.push(data.signal_dbm);
          pingData.push(data.ping_ms || 0);

          if (timeLabels.length > maxDataPoints) {
            timeLabels.shift();
            signalData.shift();
            pingData.shift();
          }

          telemetryChart.update();
        }
      }

    } catch (err) {
      console.error('Error al actualizar telemetría:', err);
    }
  }

  // Fetch Roaming History
  async function fetchRoamingHistory() {
    try {
      const res = await fetch('/api/roaming-history');
      if (!res.ok) return;
      const data = await res.json();
      
      if (!data.events || data.events.length === 0) {
        roamingTableBody.innerHTML = `
          <tr>
            <td colspan="7">
              <div class="empty-state">
                <i class="fa-solid fa-route"></i>
                <p>No se han registrado eventos de cambio de AP (Roaming) aún.</p>
                <small>Camina hacia otro AP para provocar una conmutación de BSSID y verificar el roaming.</small>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      roamingTableBody.innerHTML = data.events.map(e => `
        <tr>
          <td><i class="fa-regular fa-clock"></i> ${e.timestamp}</td>
          <td style="font-weight: 600;">${e.ssid}</td>
          <td>
            <div class="ap-cell">
              ${e.prev_ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${e.prev_ap_name}</span>` : ''}
              <code class="${e.prev_ap_name ? 'mac-subtext' : ''}" style="color: var(--text-muted);">${e.prev_bssid}</code>
              <small style="color: var(--text-muted); font-size: 0.75rem;">(${e.prev_signal_dbm} dBm)</small>
            </div>
          </td>
          <td>
            <div class="ap-cell">
              ${e.new_ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${e.new_ap_name}</span>` : ''}
              <code class="${e.new_ap_name ? 'mac-subtext' : ''}" style="color: var(--accent-cyan); font-weight: 600;">${e.new_bssid}</code>
              <small style="color: var(--accent-cyan); font-size: 0.75rem;">(${e.new_signal_dbm} dBm)</small>
            </div>
          </td>
          <td>
            <span style="color: ${e.delta_dbm >= 0 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}; font-weight: bold;">
              ${e.delta_dbm >= 0 ? '+' : ''}${e.delta_dbm} dBm
            </span>
          </td>
          <td>${e.ping_ms ? e.ping_ms + ' ms' : 'N/A'}</td>
          <td>
            <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-emerald);">
              <i class="fa-solid fa-check-circle"></i> ${e.verdict}
            </span>
          </td>
        </tr>
      `).join('');

    } catch (err) {
      console.error('Error al obtener historial de roaming:', err);
    }
  }

  // Fetch Neighbor AP Scanner
  async function fetchApScan() {
    try {
      const res = await fetch('/api/scan');
      if (!res.ok) return;
      const data = await res.json();

      if (!data.aps || data.aps.length === 0) {
        apScannerTableBody.innerHTML = `
          <tr>
            <td colspan="8">
              <div class="empty-state">
                <i class="fa-solid fa-wifi"></i>
                <p>No se detectaron APs durante el escaneo.</p>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      // Ordenar APs: Conectado/activo primero, luego por mayor potencia de señal
      const sortedAps = [...data.aps].sort((a, b) => {
        if (a.active && !b.active) return -1;
        if (!a.active && b.active) return 1;
        return (b.signal || 0) - (a.signal || 0);
      });

      apScannerTableBody.innerHTML = sortedAps.map(ap => `
        <tr style="${ap.active ? 'background: rgba(6, 182, 212, 0.08); font-weight: 600;' : ''}">
          <td>
            ${ap.active 
              ? '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: var(--accent-emerald);"><i class="fa-solid fa-link"></i> CONECTADO</span>'
              : '<span style="color: var(--text-muted);">Disponible</span>'}
          </td>
          <td>${ap.ssid || '<i style="color: var(--text-muted);">(Oculto)</i>'}</td>
          <td>
            <div class="ap-cell">
              ${ap.ap_name ? `<span class="ap-name-tag"><i class="fa-solid fa-tag"></i> ${ap.ap_name}</span>` : ''}
              <div style="display: flex; align-items: center;">
                <code class="${ap.ap_name ? 'mac-subtext' : ''}">${ap.bssid}</code>
                <button class="btn-quick-name-ap" data-bssid="${ap.bssid}" data-name="${ap.ap_name || ''}" title="Asignar o editar nombre para este AP">
                  <i class="fa-solid ${ap.ap_name ? 'fa-pen' : 'fa-plus'}"></i>
                </button>
              </div>
            </div>
          </td>
          <td>${ap.vendor}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="width: 35px;">${ap.signal}%</span>
              <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
                <div style="width: ${ap.signal}%; height: 100%; background: ${ap.signal > 70 ? 'var(--accent-emerald)' : (ap.signal > 40 ? 'var(--accent-amber)' : 'var(--accent-rose)')};"></div>
              </div>
            </div>
          </td>
          <td>${ap.freq}</td>
          <td>Ch ${ap.channel}</td>
          <td>
            ${ap.is_same_ssid
              ? '<span class="badge" style="background: rgba(6, 182, 212, 0.15); color: var(--accent-cyan);"><i class="fa-solid fa-network-wired"></i> Mismo SSID (Roaming OK)</span>'
              : '<span style="color: var(--text-muted); font-size: 0.8rem;">Otra Red</span>'}
          </td>
        </tr>
      `).join('');

      // Quick name button listener
      apScannerTableBody.querySelectorAll('.btn-quick-name-ap').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const bssid = btn.getAttribute('data-bssid');
          const current = btn.getAttribute('data-name');
          const newName = prompt(`Asignar nombre en controladora para el AP con MAC:\n${bssid}`, current);
          if (newName !== null && newName.trim()) {
            await fetch('/api/ap-names/add', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mac: bssid, name: newName.trim() })
            });
            fetchStatus();
            fetchApScan();
            if (typeof fetchApInfo === 'function') fetchApInfo();
            if (typeof searchAps === 'function') searchAps();
          }
        });
      });


    } catch (err) {
      console.error('Error al obtener escaneo de APs:', err);
    }
  }

  // Tab Navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const target = btn.getAttribute('data-tab');
      document.getElementById(target).classList.add('active');

      if (target === 'tab-roaming-log') fetchRoamingHistory();
      if (target === 'tab-ap-scanner') fetchApScan();
      if (target === 'tab-ap-names') {
        fetchApInfo();
        searchAps(apSearchInput ? apSearchInput.value : '');
      }
      if (target === 'tab-oui-manager') {
        fetchOuiInfo();
        searchOuiVendors(ouiSearchInput ? ouiSearchInput.value : '');
      }
    });
  });

  // AP Manager DOM Elements
  const apStatTotal = document.getElementById('ap-stat-total');
  const apStatCurrent = document.getElementById('ap-stat-current');
  const apStatUpdated = document.getElementById('ap-stat-updated');
  const btnToggleImportCsv = document.getElementById('btn-toggle-import-csv');
  const btnToggleAddAp = document.getElementById('btn-toggle-add-ap');
  const apImportPanel = document.getElementById('ap-import-panel');
  const apAddFormContainer = document.getElementById('ap-add-form-container');
  const apCsvFileInput = document.getElementById('ap-csv-file-input');
  const btnSelectCsvFile = document.getElementById('btn-select-csv-file');
  const apCsvFileName = document.getElementById('ap-csv-file-name');
  const apCsvTextarea = document.getElementById('ap-csv-textarea');
  const btnProcessCsv = document.getElementById('btn-process-csv');
  const btnCancelImportCsv = document.getElementById('btn-cancel-import-csv');
  const apInputMac = document.getElementById('ap-input-mac');
  const apInputName = document.getElementById('ap-input-name');
  const apInputLocation = document.getElementById('ap-input-location');
  const apInputModel = document.getElementById('ap-input-model');
  const btnSaveAp = document.getElementById('btn-save-ap');
  const btnCancelAddAp = document.getElementById('btn-cancel-add-ap');
  const apSearchInput = document.getElementById('ap-search-input');
  const apTableBody = document.getElementById('ap-table-body');

  let apSearchTimeout = null;

  async function fetchApInfo() {
    try {
      const res = await fetch('/api/ap-names');
      if (!res.ok) return;
      const data = await res.json();
      if (apStatTotal) apStatTotal.textContent = Number(data.info.total || 0).toLocaleString();
      if (apStatUpdated) apStatUpdated.textContent = data.info.last_updated ? data.info.last_updated.split(' ')[0] : 'Sin datos';
      
      // Update current connected AP name in stat card
      if (apStatCurrent) {
        const curName = infoApName ? infoApName.textContent : '--';
        apStatCurrent.textContent = curName && curName !== 'Sin nombre asignado' ? curName : 'No asignado';
      }
    } catch (e) {
      console.error('Error cargando información de APs:', e);
    }
  }

  async function searchAps(query = '') {
    if (!apTableBody) return;
    try {
      const res = await fetch(`/api/ap-names?q=${encodeURIComponent(query)}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      const aps = data.aps || [];

      if (aps.length === 0) {
        apTableBody.innerHTML = `
          <tr>
            <td colspan="5">
              <div class="empty-state">
                <i class="fa-solid fa-tags"></i>
                <p>No se encontraron APs${query ? ` para "${query}"` : ' registrados aún'}.</p>
                <small>Usa "Registrar AP" o "Importar CSV Controladora" para vincular nombres a direcciones MAC.</small>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      apTableBody.innerHTML = aps.map(item => `
        <tr>
          <td><code style="color: var(--accent-cyan); font-weight: 700; font-size: 0.9rem;">${item.mac}</code></td>
          <td style="font-weight: 600; color: var(--text-primary);">
            <i class="fa-solid fa-tag" style="color: var(--accent-purple); font-size: 0.8rem; margin-right: 0.35rem;"></i>${item.name}
          </td>
          <td>${item.location || '<span style="color: var(--text-muted); font-size: 0.8rem;">--</span>'}</td>
          <td>${item.model || '<span style="color: var(--text-muted); font-size: 0.8rem;">--</span>'}</td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 0.35rem; justify-content: center;">
              <button class="btn-icon-danger btn-edit-ap" data-mac="${item.mac}" data-name="${item.name}" data-loc="${item.location || ''}" data-mod="${item.model || ''}" title="Editar este AP" style="background: rgba(139, 92, 246, 0.15); border-color: rgba(139, 92, 246, 0.3); color: var(--accent-purple);">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn-icon-danger btn-remove-ap" data-mac="${item.mac}" title="Eliminar este AP">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `).join('');

      // Attach edit & remove handlers
      apTableBody.querySelectorAll('.btn-edit-ap').forEach(btn => {
        btn.addEventListener('click', () => {
          if (apAddFormContainer) {
            apAddFormContainer.style.display = 'block';
            if (apInputMac) apInputMac.value = btn.getAttribute('data-mac');
            if (apInputName) apInputName.value = btn.getAttribute('data-name');
            if (apInputLocation) apInputLocation.value = btn.getAttribute('data-loc');
            if (apInputModel) apInputModel.value = btn.getAttribute('data-mod');
            if (apInputName) apInputName.focus();
          }
        });
      });

      apTableBody.querySelectorAll('.btn-remove-ap').forEach(btn => {
        btn.addEventListener('click', async () => {
          const mac = btn.getAttribute('data-mac');
          if (confirm(`¿Eliminar el AP con MAC ${mac}?`)) {
            await fetch('/api/ap-names/remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mac })
            });
            fetchApInfo();
            searchAps(apSearchInput ? apSearchInput.value : '');
            fetchStatus();
            fetchApScan();
          }
        });
      });

    } catch (e) {
      console.error('Error buscando APs:', e);
    }
  }

  // Toggle Forms
  if (btnToggleAddAp && apAddFormContainer) {
    btnToggleAddAp.addEventListener('click', () => {
      const isVisible = apAddFormContainer.style.display !== 'none';
      apAddFormContainer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible && apInputMac) apInputMac.focus();
    });
  }

  if (btnCancelAddAp && apAddFormContainer) {
    btnCancelAddAp.addEventListener('click', () => {
      apAddFormContainer.style.display = 'none';
      if (apInputMac) apInputMac.value = '';
      if (apInputName) apInputName.value = '';
      if (apInputLocation) apInputLocation.value = '';
      if (apInputModel) apInputModel.value = '';
    });
  }

  if (btnToggleImportCsv && apImportPanel) {
    btnToggleImportCsv.addEventListener('click', () => {
      const isVisible = apImportPanel.style.display !== 'none';
      apImportPanel.style.display = isVisible ? 'none' : 'block';
    });
  }

  if (btnCancelImportCsv && apImportPanel) {
    btnCancelImportCsv.addEventListener('click', () => {
      apImportPanel.style.display = 'none';
      if (apCsvTextarea) apCsvTextarea.value = '';
      if (apCsvFileName) apCsvFileName.textContent = '';
      if (apCsvFileInput) apCsvFileInput.value = '';
    });
  }

  // File picker handler for CSV
  if (btnSelectCsvFile && apCsvFileInput) {
    btnSelectCsvFile.addEventListener('click', () => {
      apCsvFileInput.click();
    });
  }

  if (apCsvFileInput) {
    apCsvFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        if (apCsvFileName) apCsvFileName.textContent = `Archivo: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        const reader = new FileReader();
        reader.onload = (event) => {
          if (apCsvTextarea) apCsvTextarea.value = event.target.result;
        };
        reader.readAsText(file);
      }
    });
  }

  // Process CSV import
  if (btnProcessCsv) {
    btnProcessCsv.addEventListener('click', async () => {
      const csvText = (apCsvTextarea ? apCsvTextarea.value : '').trim();
      if (!csvText) {
        alert('Por favor pega contenido CSV o selecciona un archivo antes de importar.');
        return;
      }

      btnProcessCsv.disabled = true;
      btnProcessCsv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
      try {
        const res = await fetch('/api/ap-names/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv: csvText })
        });
        const data = await res.json();
        if (data.status === 'success') {
          let msg = `¡Importación exitosa!\n\n• Nuevos APs agregados: ${data.added}\n• APs actualizados: ${data.updated}\n• Total en base de datos: ${data.total}`;
          if (data.errors && data.errors.length > 0) {
            msg += `\n\nAdvertencias (${data.errors.length}):\n${data.errors.join('\n')}`;
          }
          alert(msg);
          if (apImportPanel) apImportPanel.style.display = 'none';
          if (apCsvTextarea) apCsvTextarea.value = '';
          if (apCsvFileName) apCsvFileName.textContent = '';
          fetchApInfo();
          searchAps();
          fetchStatus();
          fetchApScan();
        } else {
          alert(`Error al importar: ${data.message || 'Formato no reconocido'}`);
        }
      } catch (e) {
        alert('Error de conexión al importar CSV.');
      } finally {
        btnProcessCsv.disabled = false;
        btnProcessCsv.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Procesar e Importar APs';
      }
    });
  }

  // Save single AP
  if (btnSaveAp) {
    btnSaveAp.addEventListener('click', async () => {
      const mac = (apInputMac ? apInputMac.value : '').trim();
      const name = (apInputName ? apInputName.value : '').trim();
      const location = (apInputLocation ? apInputLocation.value : '').trim();
      const model = (apInputModel ? apInputModel.value : '').trim();

      if (!mac || !name) {
        alert('Por favor ingresa al menos la dirección MAC y el nombre del AP.');
        return;
      }

      btnSaveAp.disabled = true;
      try {
        const res = await fetch('/api/ap-names/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mac, name, location, model })
        });
        const data = await res.json();
        if (data.status === 'success') {
          if (apAddFormContainer) apAddFormContainer.style.display = 'none';
          if (apInputMac) apInputMac.value = '';
          if (apInputName) apInputName.value = '';
          if (apInputLocation) apInputLocation.value = '';
          if (apInputModel) apInputModel.value = '';
          fetchApInfo();
          searchAps(apSearchInput ? apSearchInput.value : '');
          fetchStatus();
          fetchApScan();
        } else {
          alert(`Error: ${data.message || 'No se pudo guardar el AP'}`);
        }
      } catch (e) {
        alert('Error de conexión al guardar el AP.');
      } finally {
        btnSaveAp.disabled = false;
      }
    });
  }

  // AP search debounce
  if (apSearchInput) {
    apSearchInput.addEventListener('input', (e) => {
      clearTimeout(apSearchTimeout);
      apSearchTimeout = setTimeout(() => {
        searchAps(e.target.value);
      }, 250);
    });
  }

  // OUI Manager DOM Elements
  const ouiStatTotal = document.getElementById('oui-stat-total');
  const ouiStatCustom = document.getElementById('oui-stat-custom');
  const ouiStatUpdated = document.getElementById('oui-stat-updated');
  const btnUpdateOui = document.getElementById('btn-update-oui');
  const ouiUpdateBanner = document.getElementById('oui-update-banner');
  const ouiUpdateStatusText = document.getElementById('oui-update-status-text');
  const ouiSearchInput = document.getElementById('oui-search-input');
  const btnToggleAddOui = document.getElementById('btn-toggle-add-oui');
  const ouiAddFormContainer = document.getElementById('oui-add-form-container');
  const ouiInputPrefix = document.getElementById('oui-input-prefix');
  const ouiInputVendor = document.getElementById('oui-input-vendor');
  const btnSaveCustomOui = document.getElementById('btn-save-custom-oui');
  const btnCancelCustomOui = document.getElementById('btn-cancel-custom-oui');
  const ouiTableBody = document.getElementById('oui-table-body');

  let ouiSearchTimeout = null;

  // Fetch OUI Stats
  async function fetchOuiInfo() {
    try {
      const res = await fetch('/api/oui');
      if (!res.ok) return;
      const data = await res.json();
      if (ouiStatTotal) ouiStatTotal.textContent = Number(data.total).toLocaleString();
      if (ouiStatCustom) ouiStatCustom.textContent = Number(data.custom_count).toLocaleString();
      if (ouiStatUpdated) ouiStatUpdated.textContent = data.last_updated ? data.last_updated.split(' ')[0] : 'Sin datos';
    } catch (e) {
      console.error('Error cargando estadísticas OUI:', e);
    }
  }

  // Search & Render OUI Table
  async function searchOuiVendors(query = '') {
    if (!ouiTableBody) return;
    try {
      const res = await fetch(`/api/oui/search?q=${encodeURIComponent(query)}&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      const results = data.results || [];

      if (results.length === 0) {
        ouiTableBody.innerHTML = `
          <tr>
            <td colspan="4">
              <div class="empty-state">
                <i class="fa-solid fa-folder-open"></i>
                <p>No se encontraron fabricantes que coincidan con "${query}".</p>
                <small>Verifica el prefijo MAC o prueba buscar una palabra clave como "Cisco", "Aruba" o "Ubiquiti".</small>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      ouiTableBody.innerHTML = results.map(item => `
        <tr>
          <td><code style="color: var(--accent-cyan); font-weight: 700; font-size: 0.9rem;">${item.prefix}</code></td>
          <td style="font-weight: 500;">${item.vendor}</td>
          <td>
            ${item.is_custom 
              ? '<span class="badge-oui-custom"><i class="fa-solid fa-star"></i> Personalizado</span>' 
              : '<span class="badge-oui-ieee"><i class="fa-solid fa-check-double"></i> Registro IEEE</span>'}
          </td>
          <td style="text-align: center;">
            ${item.is_custom 
              ? `<button class="btn-icon-danger btn-remove-custom-oui" data-prefix="${item.prefix}" title="Eliminar registro personalizado">
                   <i class="fa-solid fa-trash"></i>
                 </button>` 
              : '<span style="color: var(--text-muted); font-size: 0.8rem;">Estándar</span>'}
          </td>
        </tr>
      `).join('');

      // Attach remove events
      ouiTableBody.querySelectorAll('.btn-remove-custom-oui').forEach(btn => {
        btn.addEventListener('click', async () => {
          const prefix = btn.getAttribute('data-prefix');
          if (confirm(`¿Eliminar la entrada personalizada para ${prefix}?`)) {
            await fetch('/api/oui/remove', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prefix })
            });
            fetchOuiInfo();
            searchOuiVendors(ouiSearchInput.value);
          }
        });
      });

    } catch (e) {
      console.error('Error buscando OUI:', e);
    }
  }

  // Update from IEEE with Polling
  let isUpdatingOui = false;
  if (btnUpdateOui) {
    btnUpdateOui.addEventListener('click', async () => {
      if (isUpdatingOui) return;
      if (!confirm('¿Deseas descargar y actualizar la base de datos completa de fabricantes desde el registro oficial del IEEE?\n\nEsto sincronizará más de 40,000 fabricantes conservando tus registros personalizados.')) {
        return;
      }

      isUpdatingOui = true;
      btnUpdateOui.disabled = true;
      btnUpdateOui.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...';
      ouiUpdateBanner.style.display = 'flex';
      ouiUpdateStatusText.textContent = 'Iniciando conexión con el IEEE...';

      try {
        await fetch('/api/oui/update', { method: 'POST' });
        
        // Poll status
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch('/api/oui/status');
            const status = await res.json();
            
            if (status.status === 'downloading' || status.status === 'processing') {
              ouiUpdateStatusText.textContent = `${status.message} (${status.progress}%)`;
            } else if (status.status === 'completed') {
              clearInterval(pollInterval);
              ouiUpdateStatusText.textContent = status.message;
              setTimeout(() => {
                ouiUpdateBanner.style.display = 'none';
              }, 4000);
              fetchOuiInfo();
              searchOuiVendors(ouiSearchInput.value);
              btnUpdateOui.disabled = false;
              btnUpdateOui.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Actualizar desde IEEE';
              isUpdatingOui = false;
              alert(`¡Base de datos OUI actualizada con éxito!\n\n${status.message}`);
            } else if (status.status === 'error') {
              clearInterval(pollInterval);
              ouiUpdateStatusText.textContent = status.message;
              btnUpdateOui.disabled = false;
              btnUpdateOui.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Actualizar desde IEEE';
              isUpdatingOui = false;
              alert(`Error al actualizar la base de datos: ${status.message}`);
            }
          } catch (err) {
            console.error('Error consultando estado OUI:', err);
          }
        }, 1500);

      } catch (err) {
        btnUpdateOui.disabled = false;
        btnUpdateOui.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Actualizar desde IEEE';
        isUpdatingOui = false;
        ouiUpdateBanner.style.display = 'none';
        alert('Error al iniciar la actualización de fabricantes.');
      }
    });
  }

  // Toggle Add Form
  if (btnToggleAddOui && ouiAddFormContainer) {
    btnToggleAddOui.addEventListener('click', () => {
      const isVisible = ouiAddFormContainer.style.display !== 'none';
      ouiAddFormContainer.style.display = isVisible ? 'none' : 'block';
      if (!isVisible && ouiInputPrefix) {
        ouiInputPrefix.focus();
      }
    });
  }

  if (btnCancelCustomOui && ouiAddFormContainer) {
    btnCancelCustomOui.addEventListener('click', () => {
      ouiAddFormContainer.style.display = 'none';
      if (ouiInputPrefix) ouiInputPrefix.value = '';
      if (ouiInputVendor) ouiInputVendor.value = '';
    });
  }

  // Save Custom OUI
  if (btnSaveCustomOui) {
    btnSaveCustomOui.addEventListener('click', async () => {
      const prefix = (ouiInputPrefix.value || '').trim();
      const vendor = (ouiInputVendor.value || '').trim();

      if (!prefix || !vendor) {
        alert('Por favor completa tanto el prefijo MAC como el nombre del fabricante.');
        return;
      }

      try {
        btnSaveCustomOui.disabled = true;
        const res = await fetch('/api/oui/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefix, vendor })
        });
        const data = await res.json();
        if (data.status === 'success') {
          ouiInputPrefix.value = '';
          ouiInputVendor.value = '';
          ouiAddFormContainer.style.display = 'none';
          fetchOuiInfo();
          searchOuiVendors(ouiSearchInput.value);
        } else {
          alert(`Error: ${data.message || 'No se pudo guardar la entrada'}`);
        }
      } catch (e) {
        alert('Error de conexión al guardar fabricante.');
      } finally {
        btnSaveCustomOui.disabled = false;
      }
    });
  }

  // Search input debounce
  if (ouiSearchInput) {
    ouiSearchInput.addEventListener('input', (e) => {
      clearTimeout(ouiSearchTimeout);
      ouiSearchTimeout = setTimeout(() => {
        searchOuiVendors(e.target.value);
      }, 250);
    });
  }

  // Action Buttons
  btnTestRoaming.addEventListener('click', async () => {
    btnTestRoaming.disabled = true;
    btnTestRoaming.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probando Ping...';
    try {
      const res = await fetch('/api/trigger-test-ping', { method: 'POST' });
      const data = await res.json();
      alert(`Prueba de Latencia de Ping completada:\n• Latencia Promedio: ${data.avg_ping_ms || 'N/A'} ms\n• Pérdida de paquetes: ${data.packet_loss_pct}%\n• Detalle de Pings: ${data.pings.join(', ')} ms`);
    } catch (e) {
      alert('Error ejecutando prueba de ping.');
    } finally {
      btnTestRoaming.disabled = false;
      btnTestRoaming.innerHTML = '<i class="fa-solid fa-vial-circle-check"></i> Probar Estabilidad Ping';
    }
  });

  btnClearLog.addEventListener('click', async () => {
    if (confirm('¿Deseas borrar el registro de eventos de roaming?')) {
      await fetch('/api/clear-roaming-log', { method: 'POST' });
      fetchRoamingHistory();
    }
  });

  btnExportReport.addEventListener('click', async () => {
    const resStatus = await fetch('/api/status');
    const statusData = await resStatus.json();
    const resRoaming = await fetch('/api/roaming-history');
    const roamingData = await resRoaming.json();
    const resScan = await fetch('/api/scan');
    const scanData = await resScan.json();

    const report = {
      title: "Informe Diagnóstico de Cobertura Wi-Fi & Roaming",
      timestamp: new Date().toISOString(),
      current_status: statusData,
      roaming_history: roamingData.events,
      neighbor_aps: scanData.aps
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wifi_roaming_report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Initial Loop
  fetchStatus();
  fetchRoamingHistory();
  fetchApScan();
  fetchApInfo();

  setInterval(fetchStatus, 1500);
  setInterval(fetchRoamingHistory, 3000);
  setInterval(fetchApScan, 5000);
});
