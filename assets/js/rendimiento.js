// rendimiento.js — Dashboard de ventas por dependientx

document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  // Elementos UI
  const inputFecha          = $('inputFecha');
  const selectTienda        = $('selectTienda');
  const selectDependientx   = $('selectDependientx');
  const inputMeta           = $('inputMeta');
  const inputVenta          = $('inputVenta');
  const inputNotas          = $('inputNotas');
  const btnAgregarRegistro  = $('btnAgregarRegistro');
  const btnGuardarHist      = $('btnGuardarHist');
  const lastSavedHist       = $('lastSavedHist');

  const inputDesde          = $('inputDesde');
  const inputHasta          = $('inputHasta');
  const filterDependientx   = $('filterDependientx');
  const btnAplicarFiltros   = $('btnAplicarFiltros');

  const cardTotalVenta      = $('cardTotalVenta');
  const cardPorcMeta        = $('cardPorcMeta');
  const cardCumplenMeta     = $('cardCumplenMeta');

  const detalleDependientxSelect = $('detalleDependientx');
  const tablaDetalleDependienteBody = document.querySelector('#tablaDetalleDependiente tbody');
  const tablaHistoricoBody         = document.querySelector('#tablaHistorico tbody');

  // Estado
  let DEPENDIENTES = []; // { id, nombre, tienda, metaDiaria }
  let HISTORICO    = []; // [{fecha, dependientxId, nombre, tienda, venta, meta, notas}]
  let dirty        = false;

  // Gráficos Chart.js
  let chartRanking            = null;
  let chartTendencia          = null;
  let chartDetalleDependiente = null;

  // ===== Helpers básicos =====

  function parseNumber(v) {
    if (v === null || v === undefined) return 0;
    const n = parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  function toISODate(d) {
    const year  = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day   = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function destroyChart(chartRef) {
    if (chartRef && typeof chartRef.destroy === 'function') {
      chartRef.destroy();
    }
  }

  // ===== Carga inicial =====

  async function init() {
    const today = new Date();
    inputFecha.value = toISODate(today);

    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    inputDesde.value = toISODate(firstOfMonth);
    inputHasta.value = toISODate(today);

    lastSavedHist.textContent = 'Histórico: cargando…';

    // 1) Cargar dependientxs desde Google Sheets
    const rowsDepend = await loadDependientxs();
    DEPENDIENTES = buildDependientes(rowsDepend);
    fillSelectsDependientxs();

    // 2) Cargar histórico desde JSONBin
    const rec = await loadFromBin(RENDIMIENTO_BIN_ID);
    if (rec && Array.isArray(rec.records)) {
      HISTORICO = rec.records;
    } else {
      HISTORICO = [];
    }
    const upd = rec?.meta?.updatedAt || null;
    lastSavedHist.textContent = 'Histórico: ' + formatSV(upd);

    // Render inicial
    renderTodo();
  }

  function buildDependientes(rows) {
    const list = [];
    if (!Array.isArray(rows)) return list;
    for (const r of rows) {
      if (!r || r.length === 0) continue;
      const nombre = (r[0] || '').trim();
      if (!nombre) continue;
      const tienda = (r[1] || '').trim();
      const metaStr = (r[2] || '').toString().replace(',', '.');
      const meta = parseFloat(metaStr);

      list.push({
        id: nombre,                // usamos el nombre como ID lógico
        nombre,
        tienda,
        metaDiaria: isFinite(meta) ? meta : 0
      });
    }
    return list;
  }

  function fillSelectsDependientxs() {
    // Tiendas únicas
    const tiendas = [...new Set(DEPENDIENTES.map(d => d.tienda).filter(Boolean))].sort();
    selectTienda.innerHTML = '<option value="">Todas</option>' +
      tiendas.map(t => `<option value="${t}">${t}</option>`).join('');

    rebuildDependientxSelect();
    rebuildFilterDependientxSelect();
  }

  function rebuildDependientxSelect() {
    const tiendaFilter = selectTienda.value;
    const deps = DEPENDIENTES.filter(d => !tiendaFilter || d.tienda === tiendaFilter);
    selectDependientx.innerHTML = '<option value="">Seleccione…</option>' +
      deps.map(d => `<option value="${d.id}">${d.nombre}${d.tienda ? ' — ' + d.tienda : ''}</option>`).join('');
  }

  function rebuildFilterDependientxSelect() {
    const options = DEPENDIENTES
      .map(d => `<option value="${d.id}">${d.nombre}${d.tienda ? ' — ' + d.tienda : ''}</option>`)
      .join('');

    filterDependientx.innerHTML = '<option value="">Todos</option>' + options;
    detalleDependientxSelect.innerHTML = '<option value="">Seleccione…</option>' + options;
  }

  // ===== Eventos UI =====

  selectTienda.addEventListener('change', () => {
    rebuildDependientxSelect();
    autoFillMeta();
  });

  selectDependientx.addEventListener('change', () => {
    autoFillMeta();
  });

  function autoFillMeta() {
    const depId = selectDependientx.value;
    const dep = DEPENDIENTES.find(d => d.id === depId);
    if (dep) {
      if (!inputMeta.value) {
        inputMeta.value = dep.metaDiaria ? dep.metaDiaria.toFixed(2) : '';
      }
      if (!selectTienda.value && dep.tienda) {
        selectTienda.value = dep.tienda;
      }
    }
  }

  btnAgregarRegistro.addEventListener('click', () => {
    const fecha = inputFecha.value || todayISO();
    const depId = selectDependientx.value;

    if (!depId) {
      Swal.fire('Falta dependientx', 'Selecciona un dependientx.', 'warning');
      return;
    }

    const dep = DEPENDIENTES.find(d => d.id === depId);
    const tienda = selectTienda.value || (dep?.tienda || '');
    const meta = parseNumber(inputMeta.value || (dep?.metaDiaria ?? 0));
    const venta = parseNumber(inputVenta.value);

    if (venta <= 0) {
      Swal.fire('Venta inválida', 'Ingresa un valor de venta mayor a cero.', 'warning');
      return;
    }

    const notas = (inputNotas.value || '').trim();

    const existingIndex = HISTORICO.findIndex(r =>
      r.fecha === fecha &&
      r.dependientxId === depId &&
      r.tienda === tienda
    );

    const nuevo = {
      fecha,
      dependientxId: depId,
      nombre: dep?.nombre || depId,
      tienda,
      venta,
      meta,
      notas
    };

    const applyInsert = () => {
      if (existingIndex >= 0) {
        HISTORICO[existingIndex] = nuevo;
      } else {
        HISTORICO.push(nuevo);
      }
      dirty = true;
      inputVenta.value = '';
      inputNotas.value = '';
      renderTodo();
    };

    if (existingIndex >= 0) {
      Swal.fire({
        title: 'Registro existente',
        text: 'Ya existe un registro para ese día, tienda y dependientx. ¿Deseas reemplazarlo?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Reemplazar',
        cancelButtonText: 'Cancelar'
      }).then(res => {
        if (res.isConfirmed) applyInsert();
      });
    } else {
      applyInsert();
    }
  });

  btnGuardarHist.addEventListener('click', () => {
    const payload = {
      meta: { updatedAt: new Date().toISOString() },
      records: HISTORICO
    };

    saveToBin(RENDIMIENTO_BIN_ID, payload)
      .then(() => {
        dirty = false;
        lastSavedHist.textContent = 'Histórico: ' + formatSV(payload.meta.updatedAt);
        Swal.fire('Guardado', 'Histórico actualizado en JSONBin.', 'success');
      })
      .catch(e => {
        Swal.fire('Error', String(e), 'error');
      });
  });

  btnAplicarFiltros.addEventListener('click', () => {
    renderTodo();
  });

  filterDependientx.addEventListener('change', () => {
    renderTodo();
  });

  detalleDependientxSelect.addEventListener('change', () => {
    renderTablaDetalleDependiente();
    renderChartDetalleDependiente();
  });

  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ===== Filtros y render general =====

  function getFilteredRecordsForRange() {
    const desde = inputDesde.value || null;
    const hasta = inputHasta.value || null;
    const depFilter = filterDependientx.value || null;

    return HISTORICO.filter(r => {
      if (desde && r.fecha < desde) return false;
      if (hasta && r.fecha > hasta) return false;
      if (depFilter && r.dependientxId !== depFilter) return false;
      return true;
    }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  function renderTodo() {
    const filtered = getFilteredRecordsForRange();
    renderCards(filtered);
    renderChartRanking(filtered);
    renderChartTendencia(filtered);
    renderTablaHistorico(filtered);
    renderTablaDetalleDependiente();
    renderChartDetalleDependiente();
  }

  function renderCards(records) {
    if (!records || records.length === 0) {
      cardTotalVenta.textContent = '0.00';
      cardPorcMeta.textContent = '0%';
      cardCumplenMeta.textContent = '0 / 0';
      return;
    }

    let totalVenta = 0;
    let totalMeta = 0;
    const porDep = new Map(); // depId -> { venta, meta }

    for (const r of records) {
      const v = parseNumber(r.venta);
      const m = parseNumber(r.meta);
      totalVenta += v;
      totalMeta += m;

      if (!porDep.has(r.dependientxId)) {
        porDep.set(r.dependientxId, { venta: 0, meta: 0 });
      }
      const obj = porDep.get(r.dependientxId);
      obj.venta += v;
      obj.meta += m;
    }

    cardTotalVenta.textContent = totalVenta.toFixed(2);

    const porcMeta = totalMeta > 0 ? (totalVenta / totalMeta) * 100 : 0;
    cardPorcMeta.textContent = `${porcMeta.toFixed(0)}%`;

    let cumplen = 0;
    porDep.forEach(v => {
      const p = v.meta > 0 ? (v.venta / v.meta) * 100 : 0;
      if (p >= 100) cumplen++;
    });
    cardCumplenMeta.textContent = `${cumplen} / ${porDep.size}`;
  }

  function renderChartRanking(records) {
    destroyChart(chartRanking);
    if (!records || records.length === 0) {
      chartRanking = null;
      return;
    }

    const porDep = new Map(); // depId -> { nombre, venta, meta }

    for (const r of records) {
      if (!porDep.has(r.dependientxId)) {
        porDep.set(r.dependientxId, {
          nombre: r.nombre,
          venta: 0,
          meta: 0
        });
      }
      const obj = porDep.get(r.dependientxId);
      obj.venta += parseNumber(r.venta);
      obj.meta += parseNumber(r.meta);
    }

    const arr = [...porDep.values()];
    arr.sort((a, b) => b.venta - a.venta);

    const labels = arr.map(x => x.nombre);
    const dataVenta = arr.map(x => x.venta);
    const dataMeta = arr.map(x => x.meta);

    const ctx = document.getElementById('chartRanking').getContext('2d');
    chartRanking = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Venta', data: dataVenta },
          { label: 'Meta', data: dataMeta }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        },
        scales: {
          x: { ticks: { autoSkip: false } },
          y: { beginAtZero: true }
        }
      }
    });
  }

  function renderChartTendencia(records) {
    destroyChart(chartTendencia);
    if (!records || records.length === 0) {
      chartTendencia = null;
      return;
    }

    const porDia = new Map(); // fecha -> { venta, meta }
    for (const r of records) {
      if (!porDia.has(r.fecha)) {
        porDia.set(r.fecha, { venta: 0, meta: 0 });
      }
      const obj = porDia.get(r.fecha);
      obj.venta += parseNumber(r.venta);
      obj.meta += parseNumber(r.meta);
    }

    const dates = [...porDia.keys()].sort();
    const dataVenta = dates.map(d => porDia.get(d).venta);
    const dataMeta = dates.map(d => porDia.get(d).meta);

    const ctx = document.getElementById('chartTendencia').getContext('2d');
    chartTendencia = new Chart(ctx, {
      type: 'line',
      data: {
        labels: dates,
        datasets: [
          { label: 'Venta', data: dataVenta },
          { label: 'Meta', data: dataMeta }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderTablaHistorico(records) {
    tablaHistoricoBody.innerHTML = '';
    if (!records || records.length === 0) return;

    const rows = records.slice().sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      if (a.nombre !== b.nombre) return a.nombre.localeCompare(b.nombre);
      return (a.tienda || '').localeCompare(b.tienda || '');
    });

    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = document.createElement('tr');
      const venta = parseNumber(r.venta);
      const meta = parseNumber(r.meta);
      const p = meta > 0 ? (venta / meta) * 100 : 0;

      tr.innerHTML = `
        <td>${r.fecha}</td>
        <td>${r.nombre}</td>
        <td>${r.tienda || ''}</td>
        <td>${venta.toFixed(2)}</td>
        <td>${meta.toFixed(2)}</td>
        <td>${p.toFixed(0)}%</td>
        <td>${r.notas || ''}</td>
      `;
      frag.appendChild(tr);
    }
    tablaHistoricoBody.appendChild(frag);
  }

  function getRecordsForDetalleDep() {
    const depId = detalleDependientxSelect.value;
    if (!depId) return [];
    const desde = inputDesde.value || null;
    const hasta = inputHasta.value || null;

    return HISTORICO.filter(r => {
      if (r.dependientxId !== depId) return false;
      if (desde && r.fecha < desde) return false;
      if (hasta && r.fecha > hasta) return false;
      return true;
    }).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  function renderTablaDetalleDependiente() {
    const records = getRecordsForDetalleDep();
    tablaDetalleDependienteBody.innerHTML = '';
    if (!records.length) return;

    const frag = document.createDocumentFragment();
    for (const r of records) {
      const tr = document.createElement('tr');
      const venta = parseNumber(r.venta);
      const meta = parseNumber(r.meta);
      const p = meta > 0 ? (venta / meta) * 100 : 0;
      tr.innerHTML = `
        <td>${r.fecha}</td>
        <td>${r.tienda || ''}</td>
        <td>${venta.toFixed(2)}</td>
        <td>${meta.toFixed(2)}</td>
        <td>${p.toFixed(0)}%</td>
        <td>${r.notas || ''}</td>
      `;
      frag.appendChild(tr);
    }
    tablaDetalleDependienteBody.appendChild(frag);
  }

  function renderChartDetalleDependiente() {
    destroyChart(chartDetalleDependiente);
    const records = getRecordsForDetalleDep();
    if (!records.length) {
      chartDetalleDependiente = null;
      return;
    }

    const labels = records.map(r => r.fecha);
    const dataVenta = records.map(r => parseNumber(r.venta));
    const dataMeta = records.map(r => parseNumber(r.meta));

    const ctx = document.getElementById('chartDetalleDependiente').getContext('2d');
    chartDetalleDependiente = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Venta', data: dataVenta },
          { label: 'Meta', data: dataMeta }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // Lanzar init
  try {
    await init();
  } catch (err) {
    console.error(err);
    Swal.fire('Error', 'No se pudo inicializar el dashboard de rendimiento.', 'error');
  }
});