// app.js — Config & helpers
const googleSheetsApiKey = 'AIzaSyAvWylEG-2jRlgYXZBEcPtAWvV-fyBPZgo';
const jsonBinApiKey = '$2a$10$CyV/uYa20LDnSOfu7H/tTOsf96pmltAC/RkQTx73zfXsbCsXk7BxW';

/** BINs por tienda (principal y alterna) — por compatibilidad con TRLista */
const STORE_BINS = {
  lista_sexta_calle:      { base:'68c5b46ed0ea881f407ce556', alterna:'69174e9943b1c97be9ad5f6b' },
  lista_centro_comercial: { base:'68c5b4add0ea881f407ce586', alterna:'69174eb7d0ea881f40e85786' },
  lista_avenida_morazan:  { base:'68c5b4e043b1c97be941f83f', alterna:'69174e1ad0ea881f40e8565f' }
};

function getBinId(storeKey, versionKey='base'){
  const rec = STORE_BINS[storeKey];
  if (!rec) return null;
  return rec[versionKey] || rec.base;
}

// ===== Catálogo (TRLista) =====
let CATALOGO_CACHE = null;
function preloadCatalog(){
  if (CATALOGO_CACHE) return Promise.resolve(CATALOGO_CACHE);
  const sheetId = '1b5B9vp0GKc4T_mORssdj-J2vgc-xEO5YAFkcrVX-nHI';
  const sheetRange = 'bd!A2:D5000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetRange}?key=${googleSheetsApiKey}`;
  return fetch(url).then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(d => { CATALOGO_CACHE = Array.isArray(d.values) ? d.values : []; return CATALOGO_CACHE; })
    .catch(e => { console.error('Sheets catálogo error:', e); CATALOGO_CACHE = []; return CATALOGO_CACHE; });
}
function loadProductsFromGoogleSheets(){ return preloadCatalog(); }

// ===== JSONBin helpers =====
function saveToBin(binId, payload){
  if(!binId){ return Promise.reject(new Error('BIN no configurado.')); }
  return fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method:'PUT',
    headers:{'Content-Type':'application/json','X-Access-Key':jsonBinApiKey},
    body: JSON.stringify(payload)
  }).then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); });
}

function loadFromBin(binId){
  if(!binId){ return Promise.resolve(null); }
  return fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
    headers:{'X-Access-Key': jsonBinApiKey}
  }).then(r => { if(!r.ok) throw new Error(r.statusText); return r.json(); })
    .then(d => d.record || null)
    .catch(e => { console.error('JSONBin load error:', e); return null; });
}

// ===== Formato fecha/hora SV =====
function formatSV(iso){
  if(!iso) return 'Aún no guardado.';
  try{
    const dt = new Date(iso);
    return dt.toLocaleString('es-SV',{
      timeZone:'America/El_Salvador',
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', second:'2-digit'
    });
  }catch(e){ return 'Aún no guardado.'; }
}

// ===== Helpers genéricos para Sheets =====
function fetchSheetRange(sheetId, sheetRange) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${sheetRange}?key=${googleSheetsApiKey}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then(d => Array.isArray(d.values) ? d.values : [])
    .catch(e => {
      console.error('Sheets error:', e);
      return [];
    });
}

// ===== Configuración de dependientxs (cada columna es una tabla) =====
// A: tabla de dependientxs (nombres)
// B: tabla de sucursales
// C: tabla de metas por sucursal (C2 Morazán, C3 Sexta, C4 Centro)
// D: tabla de metas personales (D2 meta personal general)
const DEPENDIENTXS_SHEET_ID = '1b5B9vp0GKc4T_mORssdj-J2vgc-xEO5YAFkcrVX-nHI';

function loadDependientxsConfig() {
  const sheetId = DEPENDIENTXS_SHEET_ID;

  const depsPromise = fetchSheetRange(sheetId, 'dependientxs!A2:A200');
  const sucsPromise = fetchSheetRange(sheetId, 'dependientxs!B2:B200');
  const metasSucPromise = fetchSheetRange(sheetId, 'dependientxs!C2:C4');
  const metaPersonalPromise = fetchSheetRange(sheetId, 'dependientxs!D2:D2');

  return Promise.all([depsPromise, sucsPromise, metasSucPromise, metaPersonalPromise])
    .then(([rowsDep, rowsSuc, rowsMetasSuc, rowsMetaPers]) => {
      // Columna A → solo nombres
      const dependientes = (rowsDep || [])
        .map(r => (r[0] || '').toString().trim())
        .filter(v => v.length > 0);

      // Columna B → solo nombres de sucursales, sin relación fila a fila
      const sucursalesList = (rowsSuc || [])
        .map(r => (r[0] || '').toString().trim())
        .filter(v => v.length > 0);
      const sucursales = Array.from(new Set(sucursalesList)); // únicas

      // Columna C → metas por sucursal, en filas específicas
      const metasSucursal = {
        'Avenida Morazán': parseFloat(rowsMetasSuc[0]?.[0] || '0') || 0,
        'Sexta Calle': parseFloat(rowsMetasSuc[1]?.[0] || '0') || 0,
        'Centro Comercial': parseFloat(rowsMetasSuc[2]?.[0] || '0') || 0
      };

      // Columna D → meta personal general
      const metaPersonal = parseFloat(rowsMetaPers[0]?.[0] || '0') || 0;

      return { dependientes, sucursales, metasSucursal, metaPersonal };
    });
}
