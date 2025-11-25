// rendimiento_dependientx.js
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  const fechaInput               = $('fechaInput');
  const sucursalFiltro           = $('sucursalFiltro');
  const dependienteSelect        = $('dependienteSelect');
  const sucursalSelect           = $('sucursalSelect');
  const montoInput               = $('montoInput');
  const btnAgregar               = $('btnAgregarRegistro');
  const btnHoy                   = $('btnHoy');
  const btnLimpiarRegistros      = $('btnLimpiarRegistros');
  const btnEstadoCuenta          = $('btnEstadoCuenta');
  const btnTotalesGenerales      = $('btnTotalesGenerales');
  const tbodyRegistros           = $('tbodyRegistros');
  const storeSummary             = $('storeSummary');
  const tbodyResumenDependientes = $('tbodyResumenDependientes');
  const lastSaved                = $('lastSaved');

  const resumenVentaDia          = $('resumenVentaDia');
  const resumenVentaTotal        = $('resumenVentaTotal');
  const resumenNumeroDependientes= $('resumenNumeroDependientes');

  const RENDIMIENTO_BIN_ID = '691cce12d0ea881f40f0a29a';

  let config = {
    dependientes: [],
    sucursales: [],
    metasSucursal: {
      'Avenida Morazán': 0,
      'Sexta Calle': 0,
      'Centro Comercial': 0
    },
    metaPersonal: 0
  };

  let registros = [];
  let lastUpdateISO = null;

  function hoyISO(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth()+1).padStart(2,'0');
    const dd   = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatCurrency(v){
    const n = Number(v) || 0;
    return n.toLocaleString('es-SV',{ style:'currency', currency:'USD' });
  }

  function parseMonto(value){
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const clean = String(value).replace(/[^\d.,]/g,'').replace(',', '.');
    const num   = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  function actualizarLastSaved(){
    lastSaved.textContent = 'Última actualización: ' + formatSV(lastUpdateISO);
  }

  function generarId(){
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

  function barClassSegunPorcentaje(pct){
    if (pct >= 90) return 'bg-success';
    if (pct >= 60) return 'bg-warning';
    if (pct > 0)  return 'bg-danger';
    return 'bg-secondary';
  }

  function setFechaHoy(){
    fechaInput.value = hoyISO();
  }

  function llenarCombosDesdeConfig(){
    // Dependientes
    dependienteSelect.innerHTML = '';
    if (!config.dependientes.length){
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

    // Sucursales
    sucursalSelect.innerHTML = '';
    if (!config.sucursales.length){
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

    // Filtro sucursal
    while (sucursalFiltro.options.length > 1){
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

  function cargarConfigDependientxs(){
    return loadDependientxsConfig()
      .then(cfg => {
        config = cfg;
        llenarCombosDesdeConfig();
      })
      .catch(err => {
        console.error('Error cargando config dependientxs:', err);
        Swal.fire('Error','No se pudo leer la configuración de dependientxs desde Google Sheets.','error');
      });
  }

  function guardarRegistros(){
    const payload = {
      meta: { updatedAt: new Date().toISOString() },
      registros
    };
    return saveToBin(RENIMIENTO_BIN_ID = RENDIMIENTO_BIN_ID, payload)
      .then(() => {
        lastUpdateISO = payload.meta.updatedAt;
        actualizarLastSaved();
      });
  }

  function cargarRegistros(){
    return loadFromBin(RENIMIENTO_BIN_ID = RENDIMIENTO_BIN_ID);
  }

  // ---- Utilidades de cálculo ----

  function registrosDelDiaActual(){
    const fechaSel = fechaInput.value || '';
    const sucSel   = sucursalFiltro.value || 'TODAS';
    return registros.filter(r => {
      if (!r.fecha) return false;
      if (fechaSel && r.fecha !== fechaSel) return false;
      if (sucSel !== 'TODAS' && r.sucursal !== sucSel) return false;
      return true;
    });
  }

  // Totales por sucursal acumulados (toda la historia)
  function totalesPorSucursalAcumulado(){
    const res = {};
    registros.forEach(r => {
      if (!r.fecha || !r.sucursal) return;
      const suc = r.sucursal;
      const monto = parseMonto(r.monto);
      if (!res[suc]) res[suc] = 0;
      res[suc] += monto;
    });
    return res;
  }

  // Totales por sucursal para un día específico
  function totalesDiariosPorSucursal(fechaDia){
    const res = {};
    if (!fechaDia) return res;
    registros.forEach(r => {
      if (!r.fecha || !r.sucursal) return;
      if (r.fecha !== fechaDia) return;
      const suc = r.sucursal;
      const monto = parseMonto(r.monto);
      if (!res[suc]) res[suc] = 0;
      res[suc] += monto;
    });
    return res;
  }

  function calcularTotalesGenerales(){
    const fechaSel = fechaInput.value || '';
    let totalDia   = 0;
    const totAcumSucursal = totalesPorSucursalAcumulado();
    let totalAcum = 0;
    Object.values(totAcumSucursal).forEach(v => { totalAcum += v; });

    if (fechaSel){
      registros.forEach(r => {
        if (r.fecha === fechaSel){
          totalDia += parseMonto(r.monto);
        }
      });
    }

    return { totalDia, totalAcum };
  }

  function calcularEstadoCuentaDependientes(){
    const fechaSel = fechaInput.value || '';
    const mapa = new Map();
    registros.forEach(r => {
      if (!r.fecha || !r.dependiente) return;
      const monto = parseMonto(r.monto);
      const dep   = r.dependiente;
      let info    = mapa.get(dep);
      if (!info){
        info = { dependiente:dep, totalDia:0, totalAcum:0 };
      }
      info.totalAcum += monto;
      if (fechaSel && r.fecha === fechaSel){
        info.totalDia += monto;
      }
      mapa.set(dep, info);
    });
    return Array.from(mapa.values());
  }

  function renderTablaRegistros(){
    const filas = registrosDelDiaActual();
    tbodyRegistros.innerHTML = '';
    if (!filas.length) return;

    const frag = document.createDocumentFragment();
    filas.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.fecha}</td>
        <td>${r.dependiente}</td>
        <td>${r.sucursal}</td>
        <td class="text-end">${formatCurrency(r.monto)}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-danger btn-del" data-id="${r.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      `;
      frag.appendChild(tr);
    });
    tbodyRegistros.appendChild(frag);

    tbodyRegistros.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        Swal.fire({
          title:'¿Eliminar registro?',
          icon:'warning',
          showCancelButton:true,
          confirmButtonText:'Eliminar'
        }).then(res => {
          if (res.isConfirmed){
            registros = registros.filter(r => r.id !== id);
            guardarRegistros().then(recomputarTodo);
          }
        });
      });
    });
  }

  function renderDiasConRegistros(){
    const cont = document.getElementById('diasConRegistros');
    if (!cont) return;
    cont.innerHTML = '';
    if (!registros.length){
      cont.innerHTML = '<span class="text-muted">Sin registros aún.</span>';
      return;
    }
    const setFechas = new Set();
    registros.forEach(r => {
      if (r.fecha) setFechas.add(r.fecha);
    });
    const fechas = Array.from(setFechas).sort();
    if (!fechas.length){
      cont.innerHTML = '<span class="text-muted">Sin registros aún.</span>';
      return;
    }
    const fechaSel = fechaInput.value || '';
    const frag = document.createDocumentFragment();
    const label = document.createElement('div');
    label.className = 'mb-1';
    label.textContent = 'Días con registros:';
    frag.appendChild(label);
    fechas.forEach(f => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm me-1 mb-1 ' + (f === fechaSel ? 'btn-primary' : 'btn-outline-secondary');
      btn.textContent = f;
      btn.addEventListener('click', () => {
        fechaInput.value = f;
        recomputarTodo();
      });
      frag.appendChild(btn);
    });
    cont.appendChild(frag);
  }

  function renderStoreSummary(){
    storeSummary.innerHTML = '';
    const fechaSel = fechaInput.value || '';
    const totalesAcum = totalesPorSucursalAcumulado();        // SIEMPRE acumulado (toda la historia)
    const totalesDia  = totalesDiariosPorSucursal(fechaSel); // Solo para Mostrar venta diaria por sucursal

    const frag = document.createDocumentFragment();
    config.sucursales.forEach(suc => {
      const meta       = config.metasSucursal[suc] || 0;
      const totalAcum  = totalesAcum[suc] || 0;
      const totalDia   = totalesDia[suc] || 0;
      const pctAcum    = meta > 0 ? (totalAcum / meta) * 100 : 0;
      const pctClamped = Math.min(Math.max(pctAcum, 0), 999);
      const barClass   = barClassSegunPorcentaje(pctAcum);

      const col = document.createElement('div');
      col.className = 'col-12 col-md-4';
      col.innerHTML = `
        <div class="card-progress p-3 h-100 border">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-semibold">${suc}</span>
            <span class="badge bg-light text-dark">Meta: ${formatCurrency(meta)}</span>
          </div>
          <div class="progress progress-sm mb-1">
            <div class="progress-bar ${barClass}" role="progressbar" style="width:${Math.min(pctClamped,100).toFixed(1)}%"></div>
          </div>
          <div class="small text-muted mb-2">Avance acumulado: ${pctAcum.toFixed(1)}%</div>
          <div class="d-flex justify-content-between small">
            <span>Día: <strong>${formatCurrency(totalDia)}</strong></span>
            <span>Total: <strong>${formatCurrency(totalAcum)}</strong></span>
          </div>
        </div>
      `;
      frag.appendChild(col);
    });
    storeSummary.appendChild(frag);
  }

  function renderResumenDependientes(){
    tbodyResumenDependientes.innerHTML = '';
    if (!registros.length) return;

    const sucSel = sucursalFiltro.value || 'TODAS';
    const totalesSucursalAcum = totalesPorSucursalAcumulado();

    // Agregamos total por dependientx + sucursal (acumulado, independiente de la fecha)
    const mapa = new Map(); // key: dep||suc
    registros.forEach(r => {
      if (!r.dependiente || !r.sucursal) return;
      if (sucSel !== 'TODAS' && r.sucursal !== sucSel) return;
      const key   = r.dependiente + '||' + r.sucursal;
      const monto = parseMonto(r.monto);
      const actual = mapa.get(key) || 0;
      mapa.set(key, actual + monto);
    });

    const rows = [];
    mapa.forEach((total, key) => {
      const [dep, suc] = key.split('||');
      const sucTotal   = totalesSucursalAcum[suc] || 0;
      rows.push({ dependiente:dep, sucursal:suc, total, sucTotal });
    });

    // Ranking: ordenar por ventas acumuladas desc
    rows.sort((a,b) => b.total - a.total);

    const frag = document.createDocumentFragment();
    const metaPersonalGlobal = config.metaPersonal || 0;

    rows.forEach((row, idx) => {
      const dep   = row.dependiente;
      const suc   = row.sucursal;
      const total = row.total;
      const sucTotal = row.sucTotal;

      const metaSucursal = config.metasSucursal[suc] || 0;
      const metaPersonal = metaPersonalGlobal;

      let pctDepGoal   = 0;
      let pctRestoGoal = 0;
      let pctTotalSuc  = 0;

      if (metaSucursal > 0){
        pctDepGoal   = (total / metaSucursal) * 100;
        const resto  = Math.max(sucTotal - total, 0);
        pctRestoGoal = (resto / metaSucursal) * 100;
        pctTotalSuc  = (sucTotal / metaSucursal) * 100;
      }

      // Ancho de barra (limitado a 100%)
      let depWidth   = Math.max(0, Math.min(pctDepGoal, 100));
      let restoWidth = Math.max(0, Math.min(pctRestoGoal, 100 - depWidth));

      // Meta personal
      let pctPersonal = 0;
      if (metaPersonal > 0){
        pctPersonal = (total / metaPersonal) * 100;
      }
      const pctPersonalClamped = Math.min(Math.max(pctPersonal, 0), 100);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${dep}</td>
        <td>${suc}</td>
        <td class="text-end">${formatCurrency(total)}</td>
        <td>
          <div class="progress progress-xs mb-1">
            <div class="progress-bar bg-primary" style="width:${depWidth.toFixed(1)}%"></div>
            <div class="progress-bar bg-light text-dark" style="width:${restoWidth.toFixed(1)}%"></div>
          </div>
          <div class="small text-muted">
            Tú: ${pctDepGoal.toFixed(1)}% &mdash; Resto: ${pctRestoGoal.toFixed(1)}%<br>
            Avance total sucursal: ${pctTotalSuc.toFixed(1)}%
          </div>
        </td>
        <td>
          <div class="progress progress-xs mb-1">
            <div class="progress-bar ${barClassSegunPorcentaje(pctPersonal)}" style="width:${pctPersonalClamped.toFixed(1)}%"></div>
          </div>
          <div class="small text-muted">
            ${pctPersonal.toFixed(1)}% de meta personal (${formatCurrency(metaPersonal)})
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });

    tbodyResumenDependientes.appendChild(frag);
  }

  function actualizarResumenTop(){
    const fechaSel = fechaInput.value || '';
    const { totalDia, totalAcum } = calcularTotalesGenerales();

    const depActivos = new Set();
    registros.forEach(r => {
      if (r.dependiente && parseMonto(r.monto) > 0){
        depActivos.add(r.dependiente);
      }
    });

    resumenVentaDia.textContent   = formatCurrency(totalDia);
    resumenVentaTotal.textContent = formatCurrency(totalAcum);
    resumenNumeroDependientes.textContent = String(depActivos.size);
  }

  function recomputarTodo(){
    renderDiasConRegistros();
    actualizarResumenTop();
    renderTablaRegistros();
    renderStoreSummary();
    renderResumenDependientes();
  }

  // ---- Eventos UI ----
  btnHoy.addEventListener('click', () => {
    setFechaHoy();
    recomputarTodo();
  });

  fechaInput.addEventListener('change', recomputarTodo);
  sucursalFiltro.addEventListener('change', recomputarTodo);

  btnAgregar.addEventListener('click', () => {
    const fecha = fechaInput.value || hoyISO();
    const dep   = dependienteSelect.value;
    const suc   = sucursalSelect.value;
    const montoVal = parseMonto(montoInput.value);

    if (!dep || !suc || !montoVal){
      Swal.fire('Atención','Completa dependientx, sucursal y un monto válido.','info');
      return;
    }

    const reg = {
      id: generarId(),
      fecha,
      dependiente: dep,
      sucursal: suc,
      monto: montoVal
    };
    registros.push(reg);
    montoInput.value = '';

    guardarRegistros().then(recomputarTodo);
  });

  btnLimpiarRegistros.addEventListener('click', () => {
    if (!registros.length) return;
    Swal.fire({
      title:'¿Limpiar todos los registros?',
      text:'Esto borrará todas las ventas registradas.',
      icon:'warning',
      showCancelButton:true,
      confirmButtonText:'Limpiar'
    }).then(res => {
      if (res.isConfirmed){
        registros = [];
        guardarRegistros().then(recomputarTodo);
      }
    });
  });

  btnTotalesGenerales.addEventListener('click', () => {
    const { totalDia, totalAcum } = calcularTotalesGenerales();
    const fechaSel = fechaInput.value || '(toda la historia)';
    Swal.fire({
      title:'Totales generales',
      html: `
        <p class="mb-1"><strong>Fecha seleccionada:</strong> ${fechaSel}</p>
        <p class="mb-1"><strong>Suma venta diaria:</strong> ${formatCurrency(totalDia)}</p>
        <p class="mb-0"><strong>Suma total acumulada:</strong> ${formatCurrency(totalAcum)}</p>
      `,
      icon:'info'
    });
  });

  btnEstadoCuenta.addEventListener('click', () => {
    const data = calcularEstadoCuentaDependientes();
    if (!data.length){
      Swal.fire('Estado de cuenta','No hay registros para mostrar.','info');
      return;
    }
    const fechaSel = fechaInput.value || '(toda la historia)';
    let rowsHtml = '';
    data.forEach(d => {
      rowsHtml += `
        <tr>
          <td>${d.dependiente}</td>
          <td class="text-end">${formatCurrency(d.totalDia)}</td>
          <td class="text-end">${formatCurrency(d.totalAcum)}</td>
        </tr>
      `;
    });
    Swal.fire({
      title:'Estado de cuenta por dependientx',
      width:700,
      html: `
        <div class="text-start mb-2">
          <small>Fecha corte: <strong>${fechaSel}</strong></small>
        </div>
        <div class="table-responsive" style="max-height:320px; overflow-y:auto;">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Dependientx</th>
                <th class="text-end">Venta diaria</th>
                <th class="text-end">Venta acumulada</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `,
      icon:'info'
    });
  });

  // ---- Init ----
  (async function init(){
    setFechaHoy();
    await cargarConfigDependientxs();
    const rec = await loadFromBin(RENIMIENTO_BIN_ID = RENDIMIENTO_BIN_ID);
    if (rec && Array.isArray(rec.registros)){
      registros    = rec.registros;
      lastUpdateISO = rec.meta?.updatedAt || null;
    } else {
      registros = [];
      lastUpdateISO = null;
    }
    actualizarLastSaved();
    recomputarTodo();
  })();

});
