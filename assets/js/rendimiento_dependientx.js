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
  const btnCorteMes              = $('btnCorteMes');
  const btnLimpiarRegistros      = $('btnLimpiarRegistros');
  const btnEstadoCuenta          = $('btnEstadoCuenta');
  const tbodyRegistros           = $('tbodyRegistros');
  const storeSummary             = $('storeSummary');
  const tbodyResumenDependientes = $('tbodyResumenDependientes');
  const lastSaved                = $('lastSaved');

  const resumenVentaDia          = $('resumenVentaDia');
  const resumenVentaTotal        = $('resumenVentaTotal');
  const resumenNumeroDependientes= $('resumenNumeroDependientes');

  const RENDIMIENTO_BIN_ID = '691cce12d0ea881f40f0a29a';

  let ultimoCorte = null;
  let metasUltimoCorte = null;

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

  let fpInstance = null;
  let fechasConRegistro = new Set();

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
    const today = hoyISO();
    fechaInput.value = today;
    if (fpInstance){
      fpInstance.setDate(today, false);
    }
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
      meta: { updatedAt: new Date().toISOString(), ultimoCorte, metasUltimoCorte },
      registros
    };
    return saveToBin(RENDIMIENTO_BIN_ID, payload)
      .then(() => {
        lastUpdateISO = payload.meta.updatedAt;
        actualizarLastSaved();
      });
  }

  function cargarRegistros(){
    return loadFromBin(RENDIMIENTO_BIN_ID);
  }

  // ---- Utilidades de fecha para cortes mensuales ----
  function parseISODate(str){
    if (!str) return null;
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    const y = parseInt(parts[0],10);
    const m = parseInt(parts[1],10);
    const d = parseInt(parts[2],10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m-1, d);
  }

  function ultimoDiaMes(dateObj){
    const y = dateObj.getFullYear();
    const m = dateObj.getMonth();
    return new Date(y, m+1, 0);
  }

  function datosMesDesdeFechaStr(fechaStr){
    let base = parseISODate(fechaStr);
    if (!base){
      base = new Date();
    }
    return { year: base.getFullYear(), month: base.getMonth()+1 };
  }

  function mesAnterior(year, month){
    if (month === 1){
      return { year: year-1, month: 12 };
    }
    return { year, month: month-1 };
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

  function esRegistroVigente(r){
    if (!r || !r.fecha) return false;

    const fechaSel = (typeof fechaInput !== 'undefined' && fechaInput && fechaInput.value)
      ? fechaInput.value
      : '';

    // Si nunca se ha hecho corte
    if (!ultimoCorte){
      // Si no hay fecha seleccionada, cuenta todo
      if (!fechaSel) return true;
      // Si hay fecha seleccionada, cuenta todo hasta esa fecha
      return r.fecha <= fechaSel;
    }

    // Con corte definido
    if (!fechaSel){
      // Sin fecha seleccionada: consideramos sólo registros posteriores al corte
      return r.fecha > ultimoCorte;
    }

    if (fechaSel <= ultimoCorte){
      // Estamos consultando una fecha en el periodo ANTES del corte:
      // se comporta como si no existiera corte, acumulando hasta esa fecha
      return r.fecha <= fechaSel;
    } else {
      // Estamos consultando una fecha DESPUÉS del corte:
      // sólo importa lo posterior al corte y hasta la fecha seleccionada
      if (r.fecha <= ultimoCorte) return false;
      return r.fecha <= fechaSel;
    }
  }

  
  function getMetasContextuales(){
    const fechaSel = (typeof fechaInput !== 'undefined' && fechaInput && fechaInput.value)
      ? fechaInput.value
      : '';

    // Si no hay corte o no hay snapshot, usamos siempre las metas actuales
    if (!ultimoCorte || !metasUltimoCorte){
      return {
        metasSucursal: config.metasSucursal,
        metaPersonal: config.metaPersonal
      };
    }

    // Si no hay fecha seleccionada, asumimos contexto actual (después del corte)
    if (!fechaSel){
      return {
        metasSucursal: config.metasSucursal,
        metaPersonal: config.metaPersonal
      };
    }

    if (fechaSel <= ultimoCorte){
      // Consultando histórico antes (o en) el corte: usamos las metas del momento del corte
      return {
        metasSucursal: metasUltimoCorte.metasSucursal || config.metasSucursal,
        metaPersonal: (metasUltimoCorte.metaPersonal ?? config.metaPersonal)
      };
    }

    // Consultando fechas posteriores al corte: usamos metas actuales
    return {
      metasSucursal: config.metasSucursal,
      metaPersonal: config.metaPersonal
    };
  }

function totalesPorSucursalAcumulado(){
    const res = {};
    registros.forEach(r => {
      if (!esRegistroVigente(r) || !r.sucursal) return;
      const suc = r.sucursal;
      const monto = parseMonto(r.monto);
      if (!res[suc]) res[suc] = 0;
      res[suc] += monto;
    });
    return res;
  }

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

  function totalesPorSucursalMes(year, month){
    const res = {};
    registros.forEach(r => {
      if (!r.fecha || !r.sucursal) return;
      const d = parseISODate(r.fecha);
      if (!d) return;
      const y = d.getFullYear();
      const m = d.getMonth()+1;
      if (y === year && m === month){
        const suc = r.sucursal;
        const monto = parseMonto(r.monto);
        if (!res[suc]) res[suc] = 0;
        res[suc] += monto;
      }
    });
    return res;
  }

  function totalesPorDependienteGlobal(){
    const res = {};
    registros.forEach(r => {
      if (!esRegistroVigente(r) || !r.dependiente) return;
      const dep = r.dependiente;
      const monto = parseMonto(r.monto);
      res[dep] = (res[dep] || 0) + monto;
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

      if (fechaSel && r.fecha > fechaSel) return;

      let info = mapa.get(dep);
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

  function registrosPorDependiente(fechaCorte){
    const mapa = new Map();
    registros.forEach(r => {
      if (!r.dependiente || !r.fecha) return;
      if (fechaCorte && r.fecha > fechaCorte) return;
      const dep = r.dependiente;
      let arr = mapa.get(dep);
      if (!arr){
        arr = [];
        mapa.set(dep, arr);
      }
      arr.push(r);
    });
    return mapa;
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

    fechasConRegistro = new Set();
    registros.forEach(r => {
      if (r.fecha) fechasConRegistro.add(r.fecha);
    });

    cont.textContent = 'Los días con un punto azul tienen ventas registradas.';

    if (fpInstance){
      fpInstance.redraw();
    }
  }

  function renderStoreSummary(){
    storeSummary.innerHTML = '';
    const fechaSel = fechaInput.value || '';

    // Totales globales (funcionalidad actual)
    const totalesAcum = totalesPorSucursalAcumulado();
    const totalesDia  = totalesDiariosPorSucursal(fechaSel);

    // Totales por mes (mes actual vs mes anterior) para comparativo discreto
    const { year, month } = datosMesDesdeFechaStr(fechaSel || hoyISO());
    const { year: yearPrev, month: monthPrev } = mesAnterior(year, month);

    const totMesActual   = totalesPorSucursalMes(year, month);
    const totMesAnterior = totalesPorSucursalMes(yearPrev, monthPrev);

    const frag = document.createDocumentFragment();
    const metasCtx1 = getMetasContextuales();
    const metasSuc1 = metasCtx1.metasSucursal || {};
    config.sucursales.forEach(suc => {
      const meta       = metasSuc1[suc] || 0;
      const totalAcum  = totalesAcum[suc] || 0;
      const totalDia   = totalesDia[suc] || 0;
      const pctAcum    = meta > 0 ? (totalAcum / meta) * 100 : 0;
      const pctClamped = Math.min(Math.max(pctAcum, 0), 999);
      const barClass   = barClassSegunPorcentaje(pctAcum);

      const totalMesAct = totMesActual[suc] || 0;
      const totalMesAnt = totMesAnterior[suc] || 0;

      let comparativoTxt = `Mes actual: ${formatCurrency(totalMesAct)} • Mes anterior: ${formatCurrency(totalMesAnt)}`;
      if (totalMesAnt > 0){
        const diff = totalMesAct - totalMesAnt;
        const diffPct = (diff / totalMesAnt) * 100;
        const sign = diffPct >= 0 ? '+' : '';
        comparativoTxt += ` (${sign}${diffPct.toFixed(1)}%)`;
      } else if (totalMesAct > 0){
        comparativoTxt += ' (sin datos comparables del mes anterior)';
      }

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
          <div class="small text-muted mb-1">Avance acumulado: ${pctAcum.toFixed(1)}%</div>
          <div class="small text-muted mb-2">${comparativoTxt}</div>
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

  // Tabla 1 fila por dependientx, sucursales solo texto, barra global en meta personal
  function renderResumenDependientes(){
    tbodyResumenDependientes.innerHTML = '';
    if (!registros.length) return;

    const sucSel = sucursalFiltro.value || 'TODAS';

    const sucList = ['Avenida Morazán','Sexta Calle','Centro Comercial'];

    const perDep = {};

    registros.forEach(r => {
      if (!esRegistroVigente(r) || !r.dependiente || !r.sucursal) return;
      if (!sucList.includes(r.sucursal)) return;

      if (sucSel !== 'TODAS' && r.sucursal !== sucSel) return;

      const dep = r.dependiente;
      const monto = parseMonto(r.monto);

      if (!perDep[dep]){
        perDep[dep] = {
          dependiente: dep,
          ventasGlobal: 0,
          porSucursal: {
            'Avenida Morazán': 0,
            'Sexta Calle': 0,
            'Centro Comercial': 0
          }
        };
      }
      perDep[dep].ventasGlobal += monto;
      perDep[dep].porSucursal[r.sucursal] += monto;
    });

    const totalesPersonalGlobal = totalesPorDependienteGlobal();
    const metasCtx2 = getMetasContextuales();
    const metaPersonalGlobal = metasCtx2.metaPersonal || 0;
    const metasSuc2 = metasCtx2.metasSucursal || {};

    const rows = Object.values(perDep);
    rows.sort((a,b) => b.ventasGlobal - a.ventasGlobal);

    const frag = document.createDocumentFragment();

    function buildSucursalTextCell(row, sucName){
      const montoSuc = row.porSucursal[sucName] || 0;
      const metaSuc  = metasSuc2[sucName] || 0;
      const pctMeta  = metaSuc > 0 ? (montoSuc / metaSuc) * 100 : 0;

      if (metaSuc <= 0 && montoSuc === 0){
        return `<td class="text-muted small text-center">—</td>`;
      }

      return `
        <td>
          <div class="small fw-semibold">${formatCurrency(montoSuc)}</div>
          <div class="small text-muted">${pctMeta.toFixed(1)}% de meta sucursal</div>
        </td>
      `;
    }

    rows.forEach((row, idx) => {
      const dep = row.dependiente;
      const ventasGlobal = row.ventasGlobal;

      const totalPersonalGlobal = totalesPersonalGlobal[dep] || 0;
      let pctPersonal = 0;
      if (metaPersonalGlobal > 0){
        pctPersonal = (totalPersonalGlobal / metaPersonalGlobal) * 100;
      }
      const pctPersonalClamped = Math.min(Math.max(pctPersonal, 0), 100);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td>${dep}</td>
        ${buildSucursalTextCell(row, 'Avenida Morazán')}
        ${buildSucursalTextCell(row, 'Sexta Calle')}
        ${buildSucursalTextCell(row, 'Centro Comercial')}
        <td class="text-end">${formatCurrency(ventasGlobal)}</td>
        <td>
          <div class="progress progress-xs mb-1">
            <div class="progress-bar ${barClassSegunPorcentaje(pctPersonal)}" style="width:${pctPersonalClamped.toFixed(1)}%"></div>
          </div>
          <div class="small text-muted">
            ${pctPersonal.toFixed(1)}% de meta personal global (${formatCurrency(metaPersonalGlobal)})<br>
            Ventas globales: ${formatCurrency(totalPersonalGlobal)}
          </div>
        </td>
      `;
      frag.appendChild(tr);
    });

    tbodyResumenDependientes.appendChild(frag);
  }

  function actualizarResumenTop(){
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

  function initDatePicker(){
    if (typeof flatpickr === 'undefined') return;
    fpInstance = flatpickr(fechaInput, {
      dateFormat:'Y-m-d',
      defaultDate: fechaInput.value || hoyISO(),
      onChange: (selectedDates, dateStr) => {
        fechaInput.value = dateStr;
        recomputarTodo();
      },
      onDayCreate: (dObj, dStr, fp, dayElem) => {
        try{
          const dateObj = dayElem.dateObj;
          if (!dateObj) return;
          const y = dateObj.getFullYear();
          const m = String(dateObj.getMonth()+1).padStart(2,'0');
          const d = String(dateObj.getDate()).padStart(2,'0');
          const iso = `${y}-${m}-${d}`;
          if (fechasConRegistro.has(iso)){
            dayElem.classList.add('has-record');
          }
        }catch(e){}
      }
    });
  }

  function generarPdfEstadoCuenta(data, fechaSel){
    if (!window.jspdf || !window.jspdf.jsPDF || !data || !data.length) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const fechaTitulo = fechaSel || 'todas las fechas';
    const mapaRegistros = registrosPorDependiente(fechaSel);
    const metasCtx3 = getMetasContextuales();
    const metaPersonal = metasCtx3.metaPersonal || 0;

    data.forEach((d, index) => {
      if (index > 0){
        doc.addPage();
      }

      const movimientos = mapaRegistros.get(d.dependiente) || [];

      // Encabezado tipo estado de cuenta
      doc.setFontSize(12);
      doc.text('TRLista — Estado de cuenta', 105, 12, { align:'center' });
      doc.setFontSize(10);
      doc.text(`Dependientx: ${d.dependiente}`, 14, 20);
      doc.text(`Fecha corte: ${fechaTitulo}`, 14, 26);

      // Resumen tipo banco
      const pctMetaPersonal = metaPersonal > 0 ? (d.totalAcum / metaPersonal) * 100 : 0;

      doc.setDrawColor(180);
      doc.setLineWidth(0.2);
      doc.rect(14, 30, 182, 18);

      doc.setFontSize(9);
      doc.text(`Venta diaria: ${formatCurrency(d.totalDia)}`, 18, 36);
      doc.text(`Venta acumulada: ${formatCurrency(d.totalAcum)}`, 18, 42);
      if (metaPersonal > 0){
        doc.text(`Meta personal: ${formatCurrency(metaPersonal)}`, 105, 36);
        doc.text(`Avance meta personal: ${pctMetaPersonal.toFixed(1)}%`, 105, 42);
      } else {
        doc.text('Meta personal: no definida', 105, 36);
      }

      // Detalle de movimientos
      let startY = 54;
      doc.setFontSize(10);
      doc.text('Detalle de movimientos', 14, 50);

      if (movimientos.length && typeof doc.autoTable === 'function'){
        const rows = movimientos.map(r => [
          r.fecha,
          r.sucursal || '',
          (parseMonto(r.monto) || 0).toFixed(2)
        ]);
        doc.autoTable({
          startY,
          head: [['Fecha', 'Sucursal', 'Monto (USD)']],
          body: rows,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [240, 240, 240], textColor: 0, lineWidth: 0.1 },
          theme: 'grid'
        });
      } else if (movimientos.length){
        let y = startY;
        doc.setFontSize(9);
        movimientos.forEach(r => {
          doc.text(`${r.fecha}  ${r.sucursal || ''}  $${(parseMonto(r.monto) || 0).toFixed(2)}`, 14, y);
          y += 4;
        });
      } else {
        doc.setFontSize(9);
        doc.text('Sin movimientos en el período.', 14, startY);
      }
    });

    const fileFecha = (fechaSel || 'todas').replace(/[^0-9]/g,'') || 'todas';
    const fileName = `EstadoCuentaDependientxs_${fileFecha}.pdf`;
    doc.save(fileName);
  }

  // ---- Eventos UI ----
  btnHoy.addEventListener('click', () => {
    setFechaHoy();
    recomputarTodo();
  });

  if (btnCorteMes){
    btnCorteMes.addEventListener('click', () => {
      const baseStr = fechaInput.value || hoyISO();
      const baseDate = parseISODate(baseStr) || new Date();
      const lastDay = ultimoDiaMes(baseDate);
      const yyyy = lastDay.getFullYear();
      const mm   = String(lastDay.getMonth()+1).padStart(2,'0');
      const dd   = String(lastDay.getDate()).padStart(2,'0');
      const isoCorte  = `${yyyy}-${mm}-${dd}`;

      // El corte se guarda hasta el último día del mes seleccionado
      ultimoCorte = isoCorte;

      // Snapshot de metas en el momento del corte
      metasUltimoCorte = {
        metasSucursal: { ...config.metasSucursal },
        metaPersonal: config.metaPersonal
      };


      // Día siguiente al corte: nuevo periodo de recolección
      const nextDate = new Date(lastDay.getTime() + 24*60*60*1000);
      const yyyyN = nextDate.getFullYear();
      const mmN   = String(nextDate.getMonth()+1).padStart(2,'0');
      const ddN   = String(nextDate.getDate()).padStart(2,'0');
      const isoNext = `${yyyyN}-${mmN}-${ddN}`;

      guardarRegistros()
        .then(() => {
          Swal.fire('Corte de mes realizado', `Se aplicó corte al ${isoCorte}.\nDesde el día siguiente el acumulado inicia en cero.`, 'success');
          if (fpInstance){
            fpInstance.setDate(isoNext, true);
          } else {
            fechaInput.value = isoNext;
            recomputarTodo();
          }
        })
        .catch(err => {
          console.error('Error guardando corte:', err);
          Swal.fire('Error','No se pudo guardar el corte.','error');
        });
    });
  }

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

  btnEstadoCuenta.addEventListener('click', () => {
    const data = calcularEstadoCuentaDependientes();
    if (!data.length){
      Swal.fire('Estado de cuenta','No hay registros para mostrar.','info');
      return;
    }
    const fechaCorte = fechaInput.value || '';
    generarPdfEstadoCuenta(data, fechaCorte);
  });

  // ---- Init ----
  (async function init(){
    setFechaHoy();
    await cargarConfigDependientxs();
    initDatePicker();

    const rec = await cargarRegistros();
    if (rec && Array.isArray(rec.registros)){
      registros        = rec.registros;
      lastUpdateISO    = rec.meta?.updatedAt || null;
      ultimoCorte      = rec.meta?.ultimoCorte || null;
      metasUltimoCorte = rec.meta?.metasUltimoCorte || null;
    } else {
      registros        = [];
      lastUpdateISO    = null;
      ultimoCorte      = null;
      metasUltimoCorte = null;
    }
    actualizarLastSaved();
    recomputarTodo();
  })();

});
