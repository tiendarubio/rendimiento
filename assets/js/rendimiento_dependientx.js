// rendimiento_dependientx.js
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  const fechaInput = $('fechaInput');
  const sucursalFiltro = $('sucursalFiltro');
  const dependienteSelect = $('dependienteSelect');
  const sucursalSelect = $('sucursalSelect');
  const montoInput = $('montoInput');
  const btnAgregar = $('btnAgregarRegistro');
  const btnHoy = $('btnHoy');
  const btnLimpiarRegistros = $('btnLimpiarRegistros');
  const tbodyRegistros = $('tbodyRegistros');
  const storeSummary = $('storeSummary');
  const tbodyResumenDependientes = $('tbodyResumenDependientes');
  const lastSaved = $('lastSaved');

  const RENDIMIENTO_BIN_ID = '691cce12d0ea881f40f0a29a';

  let config = {
    dependientes: [],   // solo nombres (columna A)
    sucursales: [],     // solo nombres (columna B)
    metasSucursal: {    // metas por sucursal (columna C2:C4)
      'Avenida Morazán': 0,
      'Sexta Calle': 0,
      'Centro Comercial': 0
    },
    metaPersonal: 0     // meta personal general (columna D2)
  };

  let registros = [];    // [{ id, fecha, dependiente, sucursal, monto }, ...]
  let lastUpdateISO = null;

  // ==== Utilidades ====
  function hoyISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatCurrency(v) {
    const n = Number(v) || 0;
    return n.toLocaleString('es-SV', { style: 'currency', currency: 'USD' });
  }

  function parseMonto(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const clean = String(value).replace(/[^\d.,]/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  function actualizarLastSaved() {
    lastSaved.textContent = 'Última actualización: ' + formatSV(lastUpdateISO);
  }

  function generarId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function barClassSegunPorcentaje(pct) {
    if (pct >= 90) return 'bg-success';
    if (pct >= 60) return 'bg-warning';
    if (pct > 0) return 'bg-danger';
    return 'bg-secondary';
  }

  // ==== Carga inicial ====
  function setFechaHoy() {
    fechaInput.value = hoyISO();
  }

  function llenarCombosDesdeConfig() {
    // Dependientxs (columna A)
    dependienteSelect.innerHTML = '';
    if (!config.dependientes.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Sin dependientxs configuradxs';
      dependienteSelect.appendChild(opt);
    } else {
      const fragDep = document.createDocumentFragment();
      config.dependientes.forEach(nombre => {
        const opt = document.createElement('option');
        opt.value = nombre;
        opt.textContent = nombre;
        fragDep.appendChild(opt);
      });
      dependienteSelect.appendChild(fragDep);
    }

    // Sucursales (columna B) para el registro de ventas
    sucursalSelect.innerHTML = '';
    if (!config.sucursales.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Sin sucursales configuradas';
      sucursalSelect.appendChild(opt);
    } else {
      const fragSuc = document.createDocumentFragment();
      config.sucursales.forEach(suc => {
        const opt = document.createElement('option');
        opt.value = suc;
        opt.textContent = suc;
        fragSuc.appendChild(opt);
      });
      sucursalSelect.appendChild(fragSuc);
    }

    // Filtro de sucursal: mantenemos "TODAS" como primera opción
    while (sucursalFiltro.options.length > 1) {
      sucursalFiltro.remove(1);
    }
    const fragFilt = document.createDocumentFragment();
    config.sucursales.forEach(suc => {
      const opt = document.createElement('option');
      opt.value = suc;
      opt.textContent = suc;
      fragFilt.appendChild(opt);
    });
    sucursalFiltro.appendChild(fragFilt);
  }

  function cargarConfigDependientxs() {
    return loadDependientxsConfig()
      .then(cfg => {
        config = cfg;
        llenarCombosDesdeConfig();
      })
      .catch(err => {
        console.error('Error cargando config dependientxs:', err);
        Swal.fire('Error', 'No se pudo leer la configuración de dependientxs desde Google Sheets.', 'error');
      });
  }

  function cargarRegistros() {
    return loadFromBin(RENDIMIENTO_BIN_ID)
      .then(rec => {
        if (rec && Array.isArray(rec.registros)) {
          registros = rec.registros.map((r, idx) => ({
            id: r.id || generarId() + '_' + idx,
            fecha: r.fecha,
            dependiente: r.dependiente,
            sucursal: r.sucursal,
            monto: parseMonto(r.monto)
          }));
          lastUpdateISO = rec.meta?.updatedAt || null;
        } else {
          registros = [];
          lastUpdateISO = null;
        }
        actualizarLastSaved();
        recomputarTodo();
      })
      .catch(err => {
        console.error('Error cargando bin rendimiento:', err);
        registros = [];
        lastUpdateISO = null;
        actualizarLastSaved();
        recomputarTodo();
      });
  }

  function guardarRegistros(mensajeOK = null) {
    const payload = {
      meta: {
        updatedAt: new Date().toISOString()
      },
      registros: registros.map(r => ({
        id: r.id,
        fecha: r.fecha,
        dependiente: r.dependiente,
        sucursal: r.sucursal,
        monto: r.monto
      }))
    };

    return saveToBin(RENDIMIENTO_BIN_ID, payload)
      .then(() => {
        lastUpdateISO = payload.meta.updatedAt;
        actualizarLastSaved();
        if (mensajeOK) {
          Swal.fire('Guardado', mensajeOK, 'success');
        }
      })
      .catch(err => {
        console.error('Error guardando bin rendimiento:', err);
        Swal.fire('Error', 'No se pudo guardar en JSONBin.', 'error');
      });
  }

  // ==== Lógica de filtrado y agregación ====
  function registrosFiltrados() {
    const fechaSel = fechaInput.value || '';
    const sucSel = sucursalFiltro.value || 'TODAS';

    return registros.filter(r => {
      const fechaOk = !fechaSel || r.fecha === fechaSel;
      const sucOk = sucSel === 'TODAS' || r.sucursal === sucSel;
      return fechaOk && sucOk;
    });
  }

  function totalesPorSucursal(fechaSel) {
    const metas = config.metasSucursal || {};
    const totales = {};

    // Inicializar con las sucursales que tienen meta
    Object.keys(metas).forEach(suc => {
      totales[suc] = 0;
    });

    registros.forEach(r => {
      if (fechaSel && r.fecha !== fechaSel) return;
      const suc = r.sucursal || '';
      const monto = parseMonto(r.monto);
      if (!totales.hasOwnProperty(suc)) {
        totales[suc] = 0;
      }
      totales[suc] += monto;
    });

    return totales;
  }

  // ==== Renderizado ====
  function renderTablaRegistros() {
    const regs = registrosFiltrados();
    tbodyRegistros.innerHTML = '';

    if (!regs.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'text-center text-muted';
      td.textContent = 'Sin registros para la selección actual.';
      tr.appendChild(td);
      tbodyRegistros.appendChild(tr);
      return;
    }

    regs.forEach(r => {
      const tr = document.createElement('tr');

      const tdFecha = document.createElement('td');
      tdFecha.textContent = r.fecha || '';
      tr.appendChild(tdFecha);

      const tdDep = document.createElement('td');
      tdDep.textContent = r.dependiente || '';
      tr.appendChild(tdDep);

      const tdSuc = document.createElement('td');
      tdSuc.textContent = r.sucursal || '';
      tr.appendChild(tdSuc);

      const tdMonto = document.createElement('td');
      tdMonto.className = 'text-end';
      tdMonto.textContent = formatCurrency(r.monto);
      tr.appendChild(tdMonto);

      const tdAcc = document.createElement('td');
      tdAcc.className = 'text-center';
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-sm btn-outline-danger';
      btnDel.innerHTML = '<i class="fa-solid fa-trash"></i>';
      btnDel.dataset.id = r.id;
      btnDel.addEventListener('click', () => {
        Swal.fire({
          title: '¿Eliminar registro?',
          text: `${r.dependiente} - ${r.fecha} - ${formatCurrency(r.monto)}`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Eliminar'
        }).then(res => {
          if (res.isConfirmed) {
            registros = registros.filter(x => x.id !== r.id);
            guardarRegistros('Registro eliminado.').then(() => {
              recomputarTodo();
            });
          }
        });
      });
      tdAcc.appendChild(btnDel);
      tr.appendChild(tdAcc);

      tbodyRegistros.appendChild(tr);
    });
  }

  function renderStoreSummary() {
    const fechaSel = fechaInput.value || '';
    const totales = totalesPorSucursal(fechaSel);
    const metas = config.metasSucursal || {};

    storeSummary.innerHTML = '';

    const sucursalesOrden = Object.keys(metas);
    if (!sucursalesOrden.length) {
      const col = document.createElement('div');
      col.className = 'col-12';
      const div = document.createElement('div');
      div.className = 'text-center text-muted';
      div.textContent = 'Sin metas configuradas para sucursales (columna C).';
      col.appendChild(div);
      storeSummary.appendChild(col);
      return;
    }

    sucursalesOrden.forEach(suc => {
      const meta = metas[suc] || 0;
      const total = totales[suc] || 0;
      const pct = meta > 0 ? (total / meta) * 100 : 0;
      const pctMostrar = Math.min(pct, 150); // visual
      const barClass = barClassSegunPorcentaje(pct);

      const col = document.createElement('div');
      col.className = 'col-12 col-md-4';

      const card = document.createElement('div');
      card.className = 'card card-progress h-100';

      const body = document.createElement('div');
      body.className = 'card-body';

      const headerRow = document.createElement('div');
      headerRow.className = 'd-flex justify-content-between align-items-center mb-1';

      const title = document.createElement('div');
      title.className = 'fw-semibold';
      title.textContent = suc;
      headerRow.appendChild(title);

      const metaTxt = document.createElement('div');
      metaTxt.className = 'small text-muted text-end';
      metaTxt.textContent = meta > 0 ? `Meta: ${formatCurrency(meta)}` : 'Sin meta';
      headerRow.appendChild(metaTxt);

      body.appendChild(headerRow);

      const progress = document.createElement('div');
      progress.className = 'progress progress-sm mb-1';

      const bar = document.createElement('div');
      bar.className = `progress-bar ${barClass}`;
      bar.setAttribute('role', 'progressbar');
      bar.style.width = `${pctMostrar}%`;
      bar.setAttribute('aria-valuenow', pct.toFixed(1));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      progress.appendChild(bar);

      body.appendChild(progress);

      const footerRow = document.createElement('div');
      footerRow.className = 'd-flex justify-content-between small';

      const ventasTxt = document.createElement('span');
      ventasTxt.textContent = `Ventas: ${formatCurrency(total)}`;
      footerRow.appendChild(ventasTxt);

      const pctTxt = document.createElement('span');
      pctTxt.textContent = meta > 0 ? `${pct.toFixed(1)}%` : '-';
      footerRow.appendChild(pctTxt);

      body.appendChild(footerRow);

      card.appendChild(body);
      col.appendChild(card);
      storeSummary.appendChild(col);
    });
  }

  function renderResumenDependientes() {
    const regs = registrosFiltrados();
    tbodyResumenDependientes.innerHTML = '';

    if (!regs.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'text-center text-muted';
      td.textContent = 'Sin datos para calcular rendimiento.';
      tr.appendChild(td);
      tbodyResumenDependientes.appendChild(tr);
      return;
    }

    // Agrupar por dependiente + sucursal (sin suponer relación entre columnas)
    const mapa = new Map(); // key: "dep|||suc" → { dependiente, sucursal, total }

    regs.forEach(r => {
      const key = `${r.dependiente}|||${r.sucursal}`;
      const actual = mapa.get(key) || { dependiente: r.dependiente, sucursal: r.sucursal, total: 0 };
      actual.total += parseMonto(r.monto);
      mapa.set(key, actual);
    });

    const metaPersonal = config.metaPersonal || 0;
    const metasSucursal = config.metasSucursal || {};

    Array.from(mapa.values()).forEach(item => {
      const { dependiente, sucursal, total } = item;
      const metaSuc = metasSucursal[sucursal] || 0;

      const pctSuc = metaSuc > 0 ? (total / metaSuc) * 100 : 0;
      const pctPers = metaPersonal > 0 ? (total / metaPersonal) * 100 : 0;

      const pctSucMostrar = Math.min(pctSuc, 150);
      const pctPersMostrar = Math.min(pctPers, 150);

      const classSuc = barClassSegunPorcentaje(pctSuc);
      const classPers = barClassSegunPorcentaje(pctPers);

      const tr = document.createElement('tr');

      const tdDep = document.createElement('td');
      tdDep.textContent = dependiente;
      tr.appendChild(tdDep);

      const tdSuc = document.createElement('td');
      tdSuc.textContent = sucursal;
      tr.appendChild(tdSuc);

      const tdVentas = document.createElement('td');
      tdVentas.className = 'text-end';
      tdVentas.textContent = formatCurrency(total);
      tr.appendChild(tdVentas);

      // Meta sucursal
      const tdMetaSuc = document.createElement('td');
      tdMetaSuc.innerHTML = `
        <div class="progress progress-xs mb-1">
          <div class="progress-bar ${classSuc}" role="progressbar"
            style="width:${pctSucMostrar}%" aria-valuenow="${pctSuc.toFixed(1)}"
            aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <div class="d-flex justify-content-between small">
          <span>${metaSuc > 0 ? pctSuc.toFixed(1) + '% de meta' : 'Sin meta'}</span>
          <span>${metaSuc > 0 ? formatCurrency(metaSuc) : ''}</span>
        </div>
      `;
      tr.appendChild(tdMetaSuc);

      // Meta personal
      const tdMetaPers = document.createElement('td');
      tdMetaPers.innerHTML = `
        <div class="progress progress-xs mb-1">
          <div class="progress-bar ${classPers}" role="progressbar"
            style="width:${pctPersMostrar}%" aria-valuenow="${pctPers.toFixed(1)}"
            aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <div class="d-flex justify-content-between small">
          <span>${metaPersonal > 0 ? pctPers.toFixed(1) + '% de meta' : 'Sin meta'}</span>
          <span>${metaPersonal > 0 ? formatCurrency(metaPersonal) : ''}</span>
        </div>
      `;
      tr.appendChild(tdMetaPers);

      tbodyResumenDependientes.appendChild(tr);
    });
  }

  function recomputarTodo() {
    renderTablaRegistros();
    renderStoreSummary();
    renderResumenDependientes();
  }

  // ==== Eventos ====
  btnHoy.addEventListener('click', () => {
    setFechaHoy();
    recomputarTodo();
  });

  fechaInput.addEventListener('change', () => {
    recomputarTodo();
  });

  sucursalFiltro.addEventListener('change', () => {
    recomputarTodo();
  });

  btnAgregar.addEventListener('click', () => {
    const fecha = fechaInput.value;
    const dep = dependienteSelect.value;
    const suc = sucursalSelect.value;
    const monto = parseMonto(montoInput.value);

    if (!fecha) {
      Swal.fire('Atención', 'Selecciona una fecha.', 'info');
      return;
    }
    if (!dep) {
      Swal.fire('Atención', 'Selecciona un dependientx.', 'info');
      return;
    }
    if (!suc) {
      Swal.fire('Atención', 'Selecciona una sucursal.', 'info');
      return;
    }
    if (monto <= 0) {
      Swal.fire('Atención', 'Ingresa un monto mayor a 0.', 'info');
      return;
    }

    const nuevo = {
      id: generarId(),
      fecha,
      dependiente: dep,
      sucursal: suc,
      monto
    };

    registros.push(nuevo);
    montoInput.value = '';

    guardarRegistros('Registro agregado correctamente.')
      .then(() => {
        recomputarTodo();
      });
  });

  btnLimpiarRegistros.addEventListener('click', () => {
    if (!registros.length) return;
    Swal.fire({
      title: '¿Limpiar TODOS los registros?',
      text: 'Esta acción eliminará toda la historia guardada de rendimiento.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar todo'
    }).then(res => {
      if (res.isConfirmed) {
        registros = [];
        guardarRegistros('Todos los registros fueron borrados.')
          .then(() => {
            recomputarTodo();
          });
      }
    });
  });

  // ==== Init ====
  (async function init() {
    setFechaHoy();
    await cargarConfigDependientxs();
    await cargarRegistros();
  })();
});
