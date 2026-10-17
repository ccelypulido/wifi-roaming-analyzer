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
      headerBssid.textContent = data.bssid || '--:--:--:--:--:--';
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
          <td><code style="color: var(--text-muted);">${e.prev_bssid}</code> (${e.prev_signal_dbm} dBm)</td>
          <td><code style="color: var(--accent-cyan);">${e.new_bssid}</code> (${e.new_signal_dbm} dBm)</td>
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
          <td><code>${ap.bssid}</code></td>
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
    });
  });

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

  setInterval(fetchStatus, 1500);
  setInterval(fetchRoamingHistory, 3000);
  setInterval(fetchApScan, 5000);
});
