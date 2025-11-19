// app.js — Config & helpers
const googleSheetsApiKey = 'AIzaSyAvWylEG-2jRlgYXZBEcPtAWvV-fyBPZgo';
const jsonBinApiKey = '$2a$10$CyV/uYa20LDnSOfu7H/tTOsf96pmltAC/RkQTx73zfXsbCsXk7BxW';

// ID del libro "BASE DE DATOS" (mismo que usas para TRLista)
const spreadsheetIdBaseDatos = '1b5B9vp0GKc4T_mORssdj-J2vgc-xEO5YAFkcrVX-nHI';

// BIN para rendimiento de dependientxs
const RENDIMIENTO_BIN_ID = '691cce12d0ea881f40f0a29a';

/** BINs por tienda (principal y alterna) para TRLista */
const STORE_BINS = {
  lista_sexta_calle:      { base:'68c5b46ed0ea881f407ce556', alterna:'69174e9943b1c97be9ad5f6b' },
  lista_centro_comercial: { base:'68c5b4add0ea881f407ce586', alterna:'69174eb7d0ea881f40e85786' },
  lista_avenida_morazan:  { base:'68c5b4e043b1c97be941f83f', alterna:'69174e1ad0ea881f40e8565f' }
};

function getBinId(storeKey, versionKey = 'base') {
  const rec = STORE_BINS[storeKey];
  if (!rec) return null;
  return rec[versionKey] || rec.base;
}

/* =======================
   Catálogo TRLista (productos)
   ======================= */
let CATALOGO_CACHE = null;

function preloadCatalog() {
  if (CATALOGO_CACHE) return Promise.resolve(CATALOGO_CACHE);
  const sheetRange = 'bd!A2:D5000';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdBaseDatos}/values/${sheetRange}?key=${googleSheetsApiKey}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then(d => {
      CATALOGO_CACHE = Array.isArray(d.values) ? d.values : [];
      // Exponer también en window por compatibilidad con checklist.js
      try {
        window.CATALOGO_CACHE = CATALOGO_CACHE;
      } catch (e) {}
      return CATALOGO_CACHE;
    })
    .catch(e => {
      console.error('Sheets catálogo error:', e);
      CATALOGO_CACHE = [];
      try {
        window.CATALOGO_CACHE = CATALOGO_CACHE;
      } catch (e2) {}
      return CATALOGO_CACHE;
    });
}

function loadProductsFromGoogleSheets() {
  return preloadCatalog();
}

/* =======================
   Dependientxs (BASE DE DATOS → hoja dependientxs)
   ======================= */

let DEPENDIENTEXS_CACHE = null;

function preloadDependientxs() {
  if (DEPENDIENTEXS_CACHE) return Promise.resolve(DEPENDIENTEXS_CACHE);
  const sheetRange = 'dependientxs!A2:D500';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetIdBaseDatos}/values/${sheetRange}?key=${googleSheetsApiKey}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then(d => {
      DEPENDIENTEXS_CACHE = Array.isArray(d.values) ? d.values : [];
      return DEPENDIENTEXS_CACHE;
    })
    .catch(e => {
      console.error('Sheets dependientxs error:', e);
      DEPENDIENTEXS_CACHE = [];
      return DEPENDIENTEXS_CACHE;
    });
}

function loadDependientxs() {
  return preloadDependientxs();
}

/* =======================
   JSONBin helpers
   ======================= */

function saveToBin(binId, payload) {
  if (!binId) {
    return Promise.reject(new Error('BIN no configurado.'));
  }
  return fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Access-Key': jsonBinApiKey
    },
    body: JSON.stringify(payload)
  }).then(r => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });
}

function loadFromBin(binId) {
  if (!binId) return Promise.resolve(null);
  return fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
    headers: { 'X-Access-Key': jsonBinApiKey }
  })
    .then(r => {
      if (!r.ok) throw new Error(r.statusText);
      return r.json();
    })
    .then(d => d.record || null)
    .catch(e => {
      console.error('JSONBin load error:', e);
      return null;
    });
}

// Formatear fecha/hora para SV
function formatSV(iso) {
  if (!iso) return 'Aún no guardado.';
  try {
    const dt = new Date(iso);
    return dt.toLocaleString('es-SV', {
      timeZone: 'America/El_Salvador',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (e) {
    return 'Aún no guardado.';
  }
}
