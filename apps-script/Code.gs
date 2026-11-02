/**
 * Mis Finanzas - servicio de sincronización
 * Pegá este código en Extensiones > Apps Script de tu planilla de Google.
 * 1) Ejecutá la función "setup" una vez (crea las hojas y te muestra la clave).
 * 2) Implementar > Nueva implementación > Aplicación web
 *    - Ejecutar como: yo
 *    - Quién tiene acceso: cualquier usuario
 * 3) Copiá la URL de la aplicación web y la clave en la app (Ajustes).
 */

const TOKEN_PROP = 'SYNC_TOKEN';

const SCHEMA = {
  Movimientos: ['id', 'fecha', 'tipo', 'categoria', 'concepto', 'monto', 'moneda', 'cuenta',
    'cuenta_destino', 'monto_destino', 'fijo_id', 'origen', 'creado', 'modificado', 'borrado'],
  Cuentas: ['id', 'nombre', 'tipo', 'moneda', 'fecha_inicial', 'dia_vencimiento', 'orden', 'activa', 'modificado'],
  Categorias: ['id', 'nombre', 'tipo', 'presupuesto', 'orden', 'activa', 'modificado'],
  Fijos: ['id', 'concepto', 'categoria', 'tipo', 'monto', 'moneda', 'dia', 'meses', 'cuenta',
    'desde', 'hasta', 'activo', 'modificado'],
  Config: ['id', 'valor', 'modificado']
};

const DATE_COLS = { fecha: true, fecha_inicial: true, desde: true, hasta: true };
const TEXT_COLS = { id: true, concepto: true, meses: true, fijo_id: true, nombre: true, categoria: true, valor: true };

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SCHEMA).forEach(function (name) { sheetOf_(name); });
  const def = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty(TOKEN_PROP);
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '');
    props.setProperty(TOKEN_PROP, token);
  }
  Logger.log('Tu clave de sincronización es: ' + token);
  return token;
}

function mostrarClave() {
  Logger.log('Tu clave de sincronización es: ' + PropertiesService.getScriptProperties().getProperty(TOKEN_PROP));
}

function doGet() {
  return out_({ ok: true, msg: 'Mis Finanzas: servicio activo' });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = PropertiesService.getScriptProperties().getProperty(TOKEN_PROP);
    if (!token || body.token !== token) return out_({ ok: false, error: 'Clave incorrecta' });
    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      const changes = body.changes || {};
      Object.keys(changes).forEach(function (name) {
        if (SCHEMA[name] && Array.isArray(changes[name])) upsert_(name, changes[name]);
      });
      return out_({ ok: true, data: readAll_(), serverTime: Date.now() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheetOf_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  const h = SCHEMA[name];
  if (!sh) sh = ss.insertSheet(name);
  const first = sh.getRange(1, 1, 1, h.length).getValues()[0];
  if (first.join('') === '') {
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function upsert_(name, rows) {
  if (!rows.length) return;
  const sh = sheetOf_(name);
  const h = SCHEMA[name];
  const mi = h.indexOf('modificado');
  const last = sh.getLastRow();
  let vals = [];
  if (last > 1) vals = sh.getRange(2, 1, last - 1, h.length).getValues();
  const idx = {};
  vals.forEach(function (r, i) { if (r[0] !== '') idx[String(r[0])] = { where: 'old', i: i }; });
  const appends = [];
  let changed = false;
  rows.forEach(function (o) {
    if (!o || o.id === undefined || o.id === null || o.id === '') return;
    const row = h.map(function (k) {
      const v = o[k];
      if (v === undefined || v === null) return '';
      // Texto que Sheets podría convertir en número o fórmula: se guarda como texto
      if (TEXT_COLS[k] && typeof v === 'string' && v !== '') return "'" + v;
      return v;
    });
    const key = String(o.id);
    const hit = idx[key];
    if (!hit) {
      appends.push(row);
      idx[key] = { where: 'new', i: appends.length - 1 };
    } else if (hit.where === 'new') {
      appends[hit.i] = row;
    } else {
      const cur = Number(vals[hit.i][mi]) || 0;
      if ((Number(o.modificado) || 0) >= cur) { vals[hit.i] = row; changed = true; }
    }
  });
  if (changed && vals.length) {
    // Al reescribir filas existentes, mantener como texto las columnas de texto
    const textIdx = h.map(function (k) { return !!TEXT_COLS[k]; });
    vals = vals.map(function (r) {
      return r.map(function (v, j) {
        return (textIdx[j] && typeof v === 'string' && v !== '' && v.charAt(0) !== "'") ? "'" + v : v;
      });
    });
    sh.getRange(2, 1, vals.length, h.length).setValues(vals);
  }
  if (appends.length) sh.getRange(Math.max(last, 1) + 1, 1, appends.length, h.length).setValues(appends);
}

function readAll_() {
  const tz = Session.getScriptTimeZone();
  const res = {};
  Object.keys(SCHEMA).forEach(function (name) {
    const sh = sheetOf_(name);
    const h = SCHEMA[name];
    const last = sh.getLastRow();
    const list = [];
    if (last > 1) {
      sh.getRange(2, 1, last - 1, h.length).getValues().forEach(function (r) {
        if (r[0] === '' || r[0] === null) return;
        const o = {};
        h.forEach(function (k, j) {
          let v = r[j];
          if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
          else if (DATE_COLS[k] && typeof v === 'number') v = '';
          o[k] = v;
        });
        list.push(o);
      });
    }
    res[name] = list;
  });
  return res;
}
