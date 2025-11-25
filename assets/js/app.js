// app.js — Config & helpers para TRLista / Rendimiento dependientxs
const googleSheetsApiKey = 'AIzaSyAvWylEG-2jRlgYXZBEcPtAWvV-fyBPZgo';
const jsonBinApiKey      = '$2a$10$CyV/uYa20LDnSOfu7H/tTOsf96pmltAC/RkQTx73zfXsbCsXk7BxW';

// Helpers JSONBin genéricos
function saveToBin(binId, payload){
  if(!binId){ return Promise.reject(new Error('BIN no configurado.')); }
  return fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method:'PUT',
    headers:{
      'Content-Type':'application/json',
      'X-Access-Key':jsonBinApiKey
    },
    body: JSON.stringify(payload)
  }).then(r => {
    if(!r.ok) throw new Error(r.statusText);
    return r.json();
  });
}

function loadFromBin(binId){
  if(!binId){ return Promise.resolve(null); }
  return fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
    headers:{ 'X-Access-Key':jsonBinApiKey }
  }).then(r => {
    if(!r.ok) throw new Error(r.statusText);
    return r.json();
  }).then(d => d.record || null)
  .catch(e => {
    console.error('JSONBin load error:', e);
    return null;
  });
}

// Formato de fecha/hora local (El Salvador)
function formatSV(iso){
  if(!iso) return 'Aún no guardado.';
  try{
    const dt = new Date(iso);
    return dt.toLocaleString('es-SV',{
      timeZone:'America/El_Salvador',
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
  }catch(e){
    return 'Aún no guardado.';
  }
}

// ===== Helpers para Google Sheets generales =====
function fetchSheetRange(sheetId, sheetRange){
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetRange}?key=${googleSheetsApiKey}`;
  return fetch(url)
    .then(r => {
      if(!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then(d => Array.isArray(d.values) ? d.values : [])
    .catch(e => {
      console.error('Sheets error:', e);
      return [];
    });
}

// ===== Configuración de dependientxs y metas (cada columna es tabla distinta) =====
const DEPENDIENTXS_SHEET_ID = '1b5B9vp0GKc4T_mORssdj-J2vgc-xEO5YAFkcrVX-nHI';

// Estructura de la hoja "dependientxs":
// Columna A (A2:A…): lista de dependientxs
// Columna B (B2:B…): lista de sucursales
// Columna C (C2, C3, C4): metas para Avenida Morazán, Sexta Calle, Centro Comercial
// Columna D (D2): meta personal (común)
function loadDependientxsConfig(){
  const sheetId = DEPENDIENTXS_SHEET_ID;

  const depsPromise       = fetchSheetRange(sheetId, 'dependientxs!A2:A200');
  const sucsPromise       = fetchSheetRange(sheetId, 'dependientxs!B2:B200');
  const metasSucPromise   = fetchSheetRange(sheetId, 'dependientxs!C2:C4');
  const metaPersonalPromise = fetchSheetRange(sheetId, 'dependientxs!D2:D2');

  return Promise.all([depsPromise, sucsPromise, metasSucPromise, metaPersonalPromise])
    .then(([rowsDep, rowsSuc, rowsMetasSuc, rowsMetaPers]) => {
      const dependientes = (rowsDep || [])
        .map(r => (r[0] || '').toString().trim())
        .filter(v => v.length > 0);

      const sucursalesList = (rowsSuc || [])
        .map(r => (r[0] || '').toString().trim())
        .filter(v => v.length > 0);
      const sucursales = Array.from(new Set(sucursalesList));

      const metasSucursal = {
        'Avenida Morazán': parseFloat(rowsMetasSuc[0]?.[0] || '0') || 0,
        'Sexta Calle':     parseFloat(rowsMetasSuc[1]?.[0] || '0') || 0,
        'Centro Comercial':parseFloat(rowsMetasSuc[2]?.[0] || '0') || 0
      };

      const metaPersonal = parseFloat(rowsMetaPers[0]?.[0] || '0') || 0;

      return { dependientes, sucursales, metasSucursal, metaPersonal };
    });
}
