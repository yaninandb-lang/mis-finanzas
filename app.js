'use strict';
/* Mis Finanzas — app de carga de gastos e ingresos, sin conexión, sincronizada con Google Sheets */

const APP_VERSION = '1.0.0';
const LS_DATA = 'fin.data.v1';
const LS_SET = 'fin.settings.v1';
const TABLES = ['Movimientos', 'Cuentas', 'Categorias', 'Fijos', 'Config'];

const DEFAULT_CATEGORIAS = [
  ['Abastecimiento/Comida', 'Gasto'], ['Limpieza y mantenimiento casa', 'Gasto'], ['Salud/Médicos/Farmacia', 'Gasto'],
  ['Servicios', 'Gasto'], ['Seguros', 'Gasto'], ['Impuestos Varios (ARBA, etc)', 'Gasto'], ['Auto/nafta', 'Gasto'],
  ['Gastos Abuela', 'Gasto'], ['Mesada y gastos Mellis', 'Gasto'], ['Electrodomésticos & Varios Casa', 'Gasto'],
  ['Salidas/esparcimiento/refrigerios', 'Gasto'], ['Mascotas', 'Gasto'], ['Ropa', 'Gasto'], ['Viáticos a rendir', 'Gasto'],
  ['Pago de Deudas', 'Gasto'], ['Otros', 'Gasto'],
  ['Ingresos abuela', 'Ingreso'], ['Adrián (50% gastos abuela)', 'Ingreso'], ['Seguro de desempleo', 'Ingreso'],
  ['Indemnización', 'Ingreso'], ['Recupero de inversiones', 'Ingreso'], ['Cobro de viáticos', 'Ingreso'],
  ['Sueldo en Banco', 'Ingreso'], ['Sueldo en Efectivo', 'Ingreso'], ['Financiación', 'Ingreso'], ['Otros ingresos', 'Ingreso']
];
const TIPOS_CUENTA = { efectivo: 'Efectivo', banco: 'Banco', billetera: 'Billetera virtual', inversion: 'Inversión', tarjeta: 'Tarjeta de crédito' };

/* ---------- Estado ---------- */
let data = loadData();
let settings = loadSettings();
const ui = { tab: 'cargar', tipoCarga: 'Gasto', month: monthKey(today()), movFilter: '', syncing: false, lastError: '' };

function emptyData() {
  const d = { dirty: {}, lastSync: 0 };
  TABLES.forEach(t => { d[t] = {}; d.dirty[t] = {}; });
  const now = Date.now();
  DEFAULT_CATEGORIAS.forEach(([nombre, tipo], i) => {
    const id = slug(tipo + '-' + nombre);
    d.Categorias[id] = { id, nombre, tipo, presupuesto: '', orden: i + 1, activa: 1, modificado: 0 };
  });
  d.Cuentas.efectivo = { id: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo', moneda: 'ARS', fecha_inicial: '', dia_vencimiento: '', orden: 1, activa: 1, modificado: 0 };
  d.Config.cotizacion_usd = { id: 'cotizacion_usd', valor: '1500', modificado: 0 };
  void now;
  return d;
}
function loadData() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) {
      const d = JSON.parse(raw);
      TABLES.forEach(t => { d[t] = d[t] || {}; d.dirty = d.dirty || {}; d.dirty[t] = d.dirty[t] || {}; });
      return d;
    }
  } catch (e) { /* datos dañados: se arranca vacío */ }
  return emptyData();
}
function saveData() {
  try { localStorage.setItem(LS_DATA, JSON.stringify(data)); }
  catch (e) { toast('No se pudo guardar en el teléfono: ' + e.message); }
}
function loadSettings() {
  try { return Object.assign({ url: '', token: '', lastMedio: {} }, JSON.parse(localStorage.getItem(LS_SET) || '{}')); }
  catch (e) { return { url: '', token: '', lastMedio: {} }; }
}
function saveSettings() { try { localStorage.setItem(LS_SET, JSON.stringify(settings)); } catch (e) { /* sin espacio */ } }

/* ---------- Utilidades ---------- */
function today() { const d = new Date(); return iso(d); }
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function monthKey(s) { return String(s).slice(0, 7); }
function addMonths(mk, n) { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); }
function daysIn(mk) { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function monthName(mk) { const [y, m] = mk.split('-').map(Number); const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); }
function dayLabel(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }); }
function shortDate(s) { if (!s) return ''; const [, m, d] = s.split('-'); return d + '/' + m; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function slug(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function truthy(v) { return v === true || v === 1 || v === '1' || String(v).toUpperCase() === 'TRUE' || String(v).toUpperCase() === 'SI' || String(v).toUpperCase() === 'VERDADERO'; }
function parseMonto(s) {
  let t = String(s || '').replace(/[^\d.,-]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{3}$/.test(t) || (t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  return parseFloat(t);
}
const fmtARS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmtUSD = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
function money(v, moneda) { const n = num(v); const s = moneda === 'USD' ? 'u$s ' + fmtUSD.format(Math.abs(n)) : '$ ' + fmtARS.format(Math.abs(n)); return (n < 0 ? '−' : '') + s; }
function cot() { return num((data.Config.cotizacion_usd || {}).valor) || 1; }
function toARS(monto, moneda) { return moneda === 'USD' ? num(monto) * cot() : num(monto); }

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- Acceso a datos ---------- */
function rows(t) { return Object.values(data[t]); }
function movs() { return rows('Movimientos').filter(m => !truthy(m.borrado)); }
function cuentas(incluirInactivas) {
  return rows('Cuentas').filter(c => incluirInactivas || c.activa === '' || c.activa === undefined || truthy(c.activa))
    .sort((a, b) => num(a.orden) - num(b.orden) || String(a.nombre).localeCompare(b.nombre));
}
function cuenta(id) { return data.Cuentas[id]; }
function cuentaNombre(id) { const c = cuenta(id); return c ? c.nombre : (id || '—'); }
function categorias(tipo) {
  return rows('Categorias').filter(c => c.tipo === tipo && (c.activa === '' || c.activa === undefined || truthy(c.activa)))
    .sort((a, b) => num(a.orden) - num(b.orden));
}
function fijos() { return rows('Fijos').filter(f => f.activo === '' || f.activo === undefined || truthy(f.activo)); }

function put(t, obj) {
  obj.modificado = Date.now();
  data[t][obj.id] = obj;
  data.dirty[t][obj.id] = true;
  saveData();
  refreshChrome();
  queueSync();
}
function newMov(fields) {
  const now = Date.now();
  return Object.assign({
    id: uid(), fecha: today(), tipo: 'Gasto', categoria: '', concepto: '', monto: 0, moneda: 'ARS', cuenta: '',
    cuenta_destino: '', monto_destino: '', fijo_id: '', origen: 'app', creado: now, modificado: now, borrado: 0
  }, fields);
}

/* ---------- Saldos ----------
   Los movimientos históricos (origen "historico") sólo cuentan para reportes, no para saldos.
   Cada cuenta toma movimientos desde su fecha_inicial (si la tiene). */
function balances() {
  const b = {};
  cuentas(true).forEach(c => { b[c.id] = { ARS: 0, USD: 0 }; });
  const add = (id, mon, v) => { if (!b[id]) b[id] = { ARS: 0, USD: 0 }; b[id][mon === 'USD' ? 'USD' : 'ARS'] += v; };
  movs().forEach(m => {
    if (m.origen === 'historico' || m.tipo === 'Omitido') return;
    const c = cuenta(m.cuenta);
    if (c && c.fecha_inicial && m.fecha < c.fecha_inicial) return;
    const v = num(m.monto);
    if (m.tipo === 'Gasto') add(m.cuenta, m.moneda, -v);
    else if (m.tipo === 'Ingreso' || m.tipo === 'Ajuste') add(m.cuenta, m.moneda, v);
    else if (m.tipo === 'Transferencia') {
      add(m.cuenta, m.moneda, -v);
      const dest = cuenta(m.cuenta_destino);
      const md = m.monto_destino === '' || m.monto_destino === undefined ? v : num(m.monto_destino);
      add(m.cuenta_destino, dest ? dest.moneda : m.moneda, md);
    }
  });
  return b;
}
function resumenSaldos() {
  const b = balances();
  const r = { disponible: 0, invertido: 0, usd: 0, tarjetasARS: 0, tarjetasUSD: 0 };
  cuentas().forEach(c => {
    const s = b[c.id] || { ARS: 0, USD: 0 };
    if (c.tipo === 'tarjeta') { r.tarjetasARS += -s.ARS; r.tarjetasUSD += -s.USD; return; }
    if (c.tipo === 'inversion') r.invertido += s.ARS;
    else r.disponible += s.ARS;
    r.usd += s.USD;
  });
  return r;
}

/* ---------- Pendientes (gastos fijos, ingresos previstos y resúmenes de tarjeta) ---------- */
function pendientes(mk) {
  const done = new Set(movs().filter(m => m.fijo_id).map(m => m.fijo_id));
  const [, mm] = mk.split('-').map(Number);
  const out = [];
  fijos().forEach(f => {
    const meses = String(f.meses || '').split(/[,; ]+/).filter(Boolean).map(Number);
    if (meses.length && !meses.includes(mm)) return;
    if (f.desde && mk < monthKey(f.desde)) return;
    if (f.hasta && mk > monthKey(f.hasta)) return;
    const key = f.id + '|' + mk;
    if (done.has(key)) return;
    const dia = Math.min(Math.max(1, num(f.dia) || 1), daysIn(mk));
    out.push({ kind: 'fijo', key, fecha: mk + '-' + String(dia).padStart(2, '0'), f });
  });
  const b = balances();
  cuentas().filter(c => c.tipo === 'tarjeta' && num(c.dia_vencimiento)).forEach(c => {
    const key = 'resumen:' + c.id + '|' + mk;
    if (done.has(key)) return;
    const deuda = -(b[c.id] ? b[c.id].ARS : 0);
    const deudaUSD = -(b[c.id] ? b[c.id].USD : 0);
    if (deuda <= 0 && deudaUSD <= 0) return;
    const dia = Math.min(num(c.dia_vencimiento), daysIn(mk));
    out.push({ kind: 'resumen', key, fecha: mk + '-' + String(dia).padStart(2, '0'), c, deuda, deudaUSD });
  });
  return out.sort((a, b2) => a.fecha.localeCompare(b2.fecha));
}
function pendientesActuales() {
  const mk = monthKey(today());
  const prev = pendientes(addMonths(mk, -1)).filter(p => p.kind === 'fijo');
  return prev.concat(pendientes(mk));
}

/* ---------- Render general ---------- */
const VIEWS = { cargar: viewCargar, movs: viewMovs, pend: viewPend, panel: viewPanel, cuentas: viewCuentas };
const TITLES = { cargar: 'Cargar', movs: 'Movimientos', pend: 'Pendientes', panel: 'Panel', cuentas: 'Cuentas' };

function render() {
  document.getElementById('title').textContent = TITLES[ui.tab];
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  document.getElementById('view').innerHTML = VIEWS[ui.tab]();
  refreshChrome();
}
function refreshChrome() {
  const n = pendientesActuales().filter(p => p.fecha <= addDays(today(), 3)).length;
  const badge = document.getElementById('pendBadge');
  badge.hidden = !n; badge.textContent = n;
  const btn = document.getElementById('syncBtn');
  const txt = document.getElementById('syncText');
  const dirty = TABLES.reduce((s, t) => s + Object.keys(data.dirty[t] || {}).length, 0);
  btn.className = 'sync';
  if (ui.syncing) { btn.classList.add('busy'); txt.textContent = 'Sincronizando'; }
  else if (!settings.url) { btn.classList.add('off'); txt.textContent = 'Sin configurar'; }
  else if (!navigator.onLine) { btn.classList.add('off'); txt.textContent = dirty ? 'Sin conexión · ' + dirty : 'Sin conexión'; }
  else if (dirty) { btn.classList.add('pending'); txt.textContent = dirty + ' sin subir'; }
  else if (ui.lastError) { btn.classList.add('off'); txt.textContent = 'Error'; }
  else { btn.classList.add('ok'); txt.textContent = 'Al día'; }
}
function addDays(s, n) { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); }

/* ---------- Vista: Cargar ---------- */
function gastoMes(mk) {
  const g = {};
  movs().forEach(m => { if (m.tipo === 'Gasto' && monthKey(m.fecha) === mk) g[m.categoria] = (g[m.categoria] || 0) + toARS(m.monto, m.moneda); });
  return g;
}
function viewCargar() {
  const t = ui.tipoCarga;
  let html = `<div class="seg">${['Gasto', 'Ingreso', 'Transferencia'].map(x => `<button data-action="tipo" data-v="${x}" class="${x === t ? 'active' : ''}">${x}</button>`).join('')}</div>`;
  if (!settings.url) html += `<div class="hint">Todavía no conectaste la planilla de Google. Podés cargar igual: todo queda guardado en el teléfono y se sube cuando la configures en <b>Ajustes</b>.</div>`;
  if (t === 'Transferencia') {
    html += `<div class="card"><p class="muted small" style="margin-top:0">Movimientos entre tus cuentas: suscribir o rescatar del FCI, pagar el resumen de una tarjeta, comprar dólares, pasar plata a una billetera.</p>
      <button class="btn" data-action="new-transfer">Nueva transferencia</button></div>`;
    return html + recientes();
  }
  const mk = monthKey(today());
  const g = t === 'Gasto' ? gastoMes(mk) : {};
  html += `<div class="cats">` + categorias(t).map(c => {
    let extra = '';
    if (t === 'Gasto') {
      const p = num(c.presupuesto), v = g[c.nombre] || 0;
      if (p > 0) {
        const pct = Math.min(100, v / p * 100);
        extra = `<div class="bar"><i class="${v > p ? 'over' : ''}" style="width:${pct}%"></i></div><span>${money(v)} de ${money(p)}</span>`;
      } else if (v) extra = `<span>${money(v)} este mes</span>`;
    }
    return `<button class="cat" data-action="new-mov" data-cat="${esc(c.nombre)}"><b>${esc(c.nombre).replace(/\//g, '/<wbr>')}</b>${extra}</button>`;
  }).join('') + `</div>`;
  return html + recientes();
}
function recientes() {
  const l = movs().filter(m => m.origen !== 'historico' && m.tipo !== 'Omitido').sort((a, b) => num(b.creado) - num(a.creado)).slice(0, 5);
  if (!l.length) return '';
  return `<div class="card" style="margin-top:14px"><h2>Últimos cargados</h2><ul class="list">${l.map(movItem).join('')}</ul></div>`;
}
function movItem(m) {
  let sign = '', cls = '';
  if (m.tipo === 'Gasto') { sign = num(m.monto) < 0 ? '+' : '−'; cls = num(m.monto) < 0 ? 'pos' : ''; }
  else if (m.tipo === 'Ingreso') { sign = '+'; cls = 'pos'; }
  else if (m.tipo === 'Ajuste') { sign = num(m.monto) >= 0 ? '+' : '−'; }
  const title = m.tipo === 'Transferencia' ? `${cuentaNombre(m.cuenta)} → ${cuentaNombre(m.cuenta_destino)}` : (m.concepto || m.categoria || m.tipo);
  const sub = m.tipo === 'Transferencia' ? (m.concepto || 'Transferencia') : `${m.categoria && m.concepto ? esc(m.categoria) + ' · ' : ''}${esc(cuentaNombre(m.cuenta))}`;
  const amt = (sign ? sign + ' ' : '') + money(Math.abs(num(m.monto)), m.moneda).replace('−', '');
  return `<li><button class="item" data-action="edit-mov" data-id="${esc(m.id)}"><div class="grow"><div class="t">${esc(title)}</div><div class="s">${shortDate(m.fecha)} · ${m.tipo === 'Transferencia' ? esc(sub) : sub}</div></div><div class="amt ${cls}">${amt}</div></button></li>`;
}

/* ---------- Formulario de gasto / ingreso ---------- */
function openMovForm(opts) {
  const m = opts.mov || newMov({ tipo: opts.tipo || ui.tipoCarga, categoria: opts.categoria || '', concepto: opts.concepto || '', monto: opts.monto || '', moneda: opts.moneda || 'ARS', cuenta: opts.cuenta || '', fecha: opts.fecha || today(), fijo_id: opts.fijo_id || '' });
  const isNew = !opts.mov;
  const tipo = m.tipo;
  const medios = cuentas().filter(c => tipo === 'Gasto' || c.tipo !== 'tarjeta');
  const def = m.cuenta || settings.lastMedio[m.categoria] || (medios[0] && medios[0].id) || '';
  const reintegro = tipo === 'Gasto' && num(m.monto) < 0;
  const conceptos = [...new Set(movs().filter(x => x.categoria === m.categoria && x.concepto).sort((a, b) => num(b.creado) - num(a.creado)).map(x => x.concepto))].slice(0, 40);
  const cats = categorias(tipo);
  sheet(`
    <h3>${isNew ? (tipo === 'Gasto' ? 'Nuevo gasto' : 'Nuevo ingreso') : 'Editar ' + tipo.toLowerCase()}</h3>
    <form id="movForm" autocomplete="off">
      <input type="hidden" name="id" value="${esc(m.id)}">
      <label class="f" for="fMonto">Monto</label>
      <div class="row"><input id="fMonto" class="in amount-in grow" name="monto" inputmode="decimal" placeholder="0" value="${m.monto === '' ? '' : esc(String(Math.abs(num(m.monto))).replace('.', ','))}" required>
        <select class="in" name="moneda" style="width:96px">${['ARS', 'USD'].map(x => `<option ${x === m.moneda ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      ${tipo === 'Gasto' ? `<label class="check"><input type="checkbox" name="reintegro" ${reintegro ? 'checked' : ''}> Es un reintegro o devolución (resta del gasto de la categoría)</label>` : ''}
      <label class="f">Categoría</label>
      <select class="in" name="categoria">${cats.map(c => `<option ${c.nombre === m.categoria ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}${m.categoria && !cats.some(c => c.nombre === m.categoria) ? `<option selected>${esc(m.categoria)}</option>` : ''}</select>
      <label class="f">${tipo === 'Gasto' ? 'Medio de pago' : 'Cuenta donde entra'}</label>
      <div class="chips" id="medioChips">${medios.map(c => `<button type="button" class="chip ${c.id === def ? 'active' : ''}" data-medio="${esc(c.id)}">${esc(c.nombre)}</button>`).join('') || '<span class="muted small">Sin cuentas: agregalas en Cuentas.</span>'}</div>
      <input type="hidden" name="cuenta" value="${esc(def)}">
      <label class="f" for="fConcepto">Concepto (opcional)</label>
      <input id="fConcepto" class="in" name="concepto" list="concList" value="${esc(m.concepto)}" placeholder="Ej.: carnicería, Ale, nafta">
      <datalist id="concList">${conceptos.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <label class="f" for="fFecha">Fecha</label>
      <input id="fFecha" class="in" type="date" name="fecha" value="${esc(m.fecha)}" required>
      <input type="hidden" name="fijo_id" value="${esc(m.fijo_id || '')}">
      <input type="hidden" name="tipo" value="${esc(tipo)}">
      <div class="btns">${isNew ? `<button type="button" class="btn secondary" data-action="close-sheet">Cancelar</button>` : `<button type="button" class="btn danger" data-action="delete-mov" data-id="${esc(m.id)}">Borrar</button>`}<button class="btn" type="submit">Guardar</button></div>
    </form>`);
  setTimeout(() => { const el = document.getElementById('fMonto'); if (el && isNew) el.focus(); }, 60);
}
function saveMovForm(form) {
  const fd = new FormData(form);
  let monto = parseMonto(fd.get('monto'));
  if (!isFinite(monto) || monto === 0) { toast('Ingresá un monto'); return; }
  monto = Math.abs(monto);
  if (fd.get('reintegro')) monto = -monto;
  const cuentaId = fd.get('cuenta');
  if (!cuentaId) { toast('Elegí el medio de pago'); return; }
  const id = fd.get('id');
  const base = data.Movimientos[id] || newMov({ id });
  const m = Object.assign({}, base, {
    id, tipo: fd.get('tipo'), categoria: fd.get('categoria'), concepto: String(fd.get('concepto') || '').trim(),
    monto, moneda: fd.get('moneda'), cuenta: cuentaId, fecha: fd.get('fecha') || today(), fijo_id: fd.get('fijo_id') || base.fijo_id || ''
  });
  settings.lastMedio[m.categoria] = cuentaId; saveSettings();
  put('Movimientos', m);
  closeSheet();
  toast((m.tipo === 'Gasto' ? 'Gasto' : 'Ingreso') + ' guardado: ' + money(Math.abs(monto), m.moneda));
  render();
}

/* ---------- Formulario de transferencia ---------- */
function openTransferForm(opts) {
  opts = opts || {};
  const m = opts.mov || newMov({ tipo: 'Transferencia', cuenta: opts.desde || '', cuenta_destino: opts.hacia || '', monto: opts.monto || '', concepto: opts.concepto || '', fijo_id: opts.fijo_id || '', fecha: opts.fecha || today() });
  const isNew = !opts.mov;
  const cs = cuentas();
  const sel = (name, v) => `<select class="in" name="${name}">${cs.map(c => `<option value="${esc(c.id)}" ${c.id === v ? 'selected' : ''}>${esc(c.nombre)}${c.moneda === 'USD' ? ' (u$s)' : ''}</option>`).join('')}</select>`;
  sheet(`
    <h3>${isNew ? 'Nueva transferencia' : 'Editar transferencia'}</h3>
    <form id="trfForm" autocomplete="off">
      <input type="hidden" name="id" value="${esc(m.id)}"><input type="hidden" name="fijo_id" value="${esc(m.fijo_id || '')}">
      <label class="f">Desde</label>${sel('cuenta', m.cuenta || (cs[0] && cs[0].id))}
      <label class="f">Hacia</label>${sel('cuenta_destino', m.cuenta_destino || (cs[1] && cs[1].id))}
      <label class="f" for="tMonto">Monto que sale</label>
      <div class="row"><input id="tMonto" class="in amount-in grow" name="monto" inputmode="decimal" value="${m.monto === '' ? '' : esc(String(num(m.monto)).replace('.', ','))}" required>
        <select class="in" name="moneda" style="width:96px">${['ARS', 'USD'].map(x => `<option ${x === m.moneda ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <label class="f" for="tDest">Monto que entra (sólo si cambia la moneda, por ejemplo al comprar dólares)</label>
      <input id="tDest" class="in" name="monto_destino" inputmode="decimal" value="${m.monto_destino === '' || m.monto_destino === undefined ? '' : esc(String(num(m.monto_destino)).replace('.', ','))}" placeholder="Igual al monto que sale">
      <label class="f">Concepto (opcional)</label>
      <input class="in" name="concepto" value="${esc(m.concepto)}" placeholder="Ej.: suscripción FCI, pago resumen Visa">
      <label class="f">Fecha</label><input class="in" type="date" name="fecha" value="${esc(m.fecha)}" required>
      <div class="btns">${isNew ? `<button type="button" class="btn secondary" data-action="close-sheet">Cancelar</button>` : `<button type="button" class="btn danger" data-action="delete-mov" data-id="${esc(m.id)}">Borrar</button>`}<button class="btn" type="submit">Guardar</button></div>
    </form>`);
}
function saveTransferForm(form) {
  const fd = new FormData(form);
  const monto = parseMonto(fd.get('monto'));
  if (!isFinite(monto) || monto <= 0) { toast('Ingresá un monto'); return; }
  if (fd.get('cuenta') === fd.get('cuenta_destino')) { toast('Elegí dos cuentas distintas'); return; }
  const md = String(fd.get('monto_destino') || '').trim() ? parseMonto(fd.get('monto_destino')) : '';
  const id = fd.get('id');
  const base = data.Movimientos[id] || newMov({ id });
  const m = Object.assign({}, base, {
    id, tipo: 'Transferencia', categoria: '', cuenta: fd.get('cuenta'), cuenta_destino: fd.get('cuenta_destino'),
    monto, moneda: fd.get('moneda'), monto_destino: md === '' || !isFinite(md) ? '' : md,
    concepto: String(fd.get('concepto') || '').trim(), fecha: fd.get('fecha') || today(), fijo_id: fd.get('fijo_id') || base.fijo_id || ''
  });
  put('Movimientos', m);
  closeSheet(); toast('Transferencia guardada'); render();
}

/* ---------- Vista: Movimientos ---------- */
function viewMovs() {
  const mk = ui.month;
  const f = ui.movFilter.toLowerCase();
  const l = movs().filter(m => monthKey(m.fecha) === mk && m.tipo !== 'Omitido')
    .filter(m => !f || [m.concepto, m.categoria, cuentaNombre(m.cuenta), cuentaNombre(m.cuenta_destino)].join(' ').toLowerCase().includes(f))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || num(b.creado) - num(a.creado));
  let gas = 0, ing = 0;
  l.forEach(m => { if (m.tipo === 'Gasto') gas += toARS(m.monto, m.moneda); if (m.tipo === 'Ingreso') ing += toARS(m.monto, m.moneda); });
  let html = monthNav() + `<input class="in" type="search" placeholder="Buscar por concepto, categoría o cuenta" value="${esc(ui.movFilter)}" data-input="movFilter" style="margin-bottom:12px">`;
  html += `<div class="kpis"><div class="kpi"><div class="l">Gastos</div><div class="v">${money(gas)}</div></div><div class="kpi"><div class="l">Ingresos</div><div class="v pos">${money(ing)}</div></div></div>`;
  if (!l.length) return html + `<div class="empty">No hay movimientos en este mes.</div>`;
  let cur = '', out = '';
  l.forEach(m => {
    if (m.fecha !== cur) { if (cur) out += '</ul></div>'; cur = m.fecha; out += `<div class="day">${esc(dayLabel(m.fecha))}</div><div class="card" style="padding:4px 12px"><ul class="list">`; }
    out += movItem(m);
  });
  return html + out + '</ul></div>';
}
function monthNav() {
  return `<div class="monthnav"><button data-action="month" data-v="-1" aria-label="Mes anterior">‹</button><b>${esc(monthName(ui.month))}</b><button data-action="month" data-v="1" aria-label="Mes siguiente">›</button></div>`;
}

/* ---------- Vista: Pendientes ---------- */
function viewPend() {
  const l = pendientesActuales();
  let html = `<p class="muted small" style="margin-top:0">Gastos fijos, ingresos previstos y resúmenes de tarjeta de este mes. Confirmá el importe cuando lo pagues o lo cobres.</p>`;
  if (!l.length) return html + `<div class="empty">No hay pendientes. ¡Todo al día!</div>`;
  const hoy = today();
  html += `<div class="card" style="padding:4px 12px"><ul class="list">` + l.map(p => {
    const vencido = p.fecha < hoy;
    if (p.kind === 'resumen') {
      return `<li><div class="grow"><div class="t">Pagar resumen ${esc(p.c.nombre)}</div><div class="s">${shortDate(p.fecha)} · Deuda cargada: ${money(p.deuda)}${p.deudaUSD > 0 ? ' + ' + money(p.deudaUSD, 'USD') : ''} ${vencido ? '<span class="tag" style="color:var(--danger)">vencido</span>' : ''}</div></div>
        <button class="btn small" data-action="pay-card" data-key="${esc(p.key)}">Pagar</button></li>`;
    }
    const f = p.f;
    return `<li><div class="grow"><div class="t">${esc(f.concepto)}</div><div class="s">${shortDate(p.fecha)} · ${esc(f.tipo === 'Ingreso' ? 'Ingreso' : f.categoria)} · ${money(f.monto, f.moneda)} ${vencido ? '<span class="tag" style="color:var(--danger)">vencido</span>' : ''}</div></div>
      <button class="btn small secondary" data-action="skip-fijo" data-key="${esc(p.key)}" aria-label="Omitir este mes">Omitir</button>
      <button class="btn small" data-action="confirm-fijo" data-key="${esc(p.key)}">${f.tipo === 'Ingreso' ? 'Cobré' : 'Pagué'}</button></li>`;
  }).join('') + `</ul></div>`;
  return html;
}
function findPend(key) { return pendientesActuales().find(p => p.key === key); }

/* ---------- Vista: Panel ---------- */
function viewPanel() {
  const mk = ui.month;
  const r = resumenSaldos();
  let ing = 0, gas = 0, rend = 0;
  const porCat = {};
  movs().forEach(m => {
    if (monthKey(m.fecha) !== mk) return;
    const v = toARS(m.monto, m.moneda);
    if (m.tipo === 'Gasto') { gas += v; porCat[m.categoria] = (porCat[m.categoria] || 0) + v; }
    else if (m.tipo === 'Ingreso') ing += v;
    else if (m.tipo === 'Ajuste' && m.categoria === 'Rendimiento') rend += v;
  });
  let html = monthNav();
  html += `<div class="kpis">
    <div class="kpi"><div class="l">Disponible</div><div class="v">${money(r.disponible)}</div><div class="d">Efectivo, bancos y billeteras</div></div>
    <div class="kpi"><div class="l">Invertido</div><div class="v">${money(r.invertido)}</div><div class="d">FCI y Balanz</div></div>
    <div class="kpi"><div class="l">Dólares</div><div class="v">${money(r.usd, 'USD')}</div><div class="d">≈ ${money(r.usd * cot())}</div></div>
    <div class="kpi"><div class="l">Comprometido en tarjetas</div><div class="v ${r.tarjetasARS > 0 ? 'neg' : ''}">${money(r.tarjetasARS)}</div><div class="d">${r.tarjetasUSD > 0 ? '+ ' + money(r.tarjetasUSD, 'USD') : 'Próximos resúmenes'}</div></div>
  </div>`;
  html += `<div class="card"><h2>Resultado del mes</h2>
    <div class="row between"><span>Ingresos</span><span class="amt pos">${money(ing)}</span></div>
    <div class="row between" style="margin-top:6px"><span>Gastos</span><span class="amt">${money(gas)}</span></div>
    ${rend ? `<div class="row between" style="margin-top:6px"><span>Rendimiento de inversiones</span><span class="amt pos">${money(rend)}</span></div>` : ''}
    <div class="row between" style="margin-top:8px;padding-top:8px;border-top:1px solid var(--line)"><b>Resultado</b><b class="amt ${ing + rend - gas < 0 ? 'neg' : 'pos'}">${money(ing + rend - gas)}</b></div></div>`;
  // Gasto por categoría vs presupuesto
  const cats = categorias('Gasto');
  const items = cats.map(c => ({ n: c.nombre, v: porCat[c.nombre] || 0, p: num(c.presupuesto) }))
    .concat(Object.keys(porCat).filter(k => !cats.some(c => c.nombre === k)).map(k => ({ n: k, v: porCat[k], p: 0 })))
    .filter(x => x.v || x.p).sort((a, b) => b.v - a.v);
  const totP = items.reduce((s, x) => s + x.p, 0);
  html += `<div class="card"><h2>Gastos por categoría</h2>${totP ? `<p class="small muted" style="margin:0 0 4px">Presupuesto total: ${money(totP)} · usado ${Math.round(gas / totP * 100)}%</p>` : ''}<div class="bars">` +
    (items.length ? items.map(x => {
      const pct = x.p ? Math.min(100, x.v / x.p * 100) : 100;
      const cls = x.p && x.v > x.p ? 'over' : (x.p && x.v > x.p * 0.85 ? 'near' : '');
      const w = x.p ? pct : (items[0].v ? x.v / items[0].v * 100 : 0);
      return `<div class="b"><div class="top"><span>${esc(x.n)}</span><span class="amt">${money(x.v)}${x.p ? ` <span class="muted small">/ ${money(x.p)}</span>` : ''}</span></div><div class="track"><i class="${cls}" style="width:${Math.max(0, w)}%"></i></div></div>`;
    }).join('') : '<div class="empty">Sin gastos en este mes.</div>') + `</div></div>`;
  html += `<div class="card chart"><h2>Últimos 6 meses</h2>${evolucion(mk)}<div class="legend"><span><i style="background:var(--accent)"></i>Ingresos</span><span><i style="background:var(--brand-2)"></i>Gastos</span></div></div>`;
  html += `<div class="card"><h2>Próximos vencimientos</h2>${proximos()}</div>`;
  return html;
}
function evolucion(mk) {
  const months = []; for (let i = 5; i >= 0; i--) months.push(addMonths(mk, -i));
  const vals = months.map(m => ({ m, i: 0, g: 0 }));
  movs().forEach(x => {
    const k = months.indexOf(monthKey(x.fecha)); if (k < 0) return;
    if (x.tipo === 'Gasto') vals[k].g += toARS(x.monto, x.moneda);
    if (x.tipo === 'Ingreso') vals[k].i += toARS(x.monto, x.moneda);
  });
  const max = Math.max(1, ...vals.map(v => Math.max(v.i, v.g)));
  const W = 320, H = 150, pad = 22, bw = 16;
  const step = (W - 10) / 6;
  let s = `<svg viewBox="0 0 ${W} ${H + pad}" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">`;
  vals.forEach((v, k) => {
    const x = 8 + k * step + step / 2;
    const hi = v.i / max * (H - 10), hg = v.g / max * (H - 10);
    s += `<rect x="${x - bw - 1}" y="${H - hi}" width="${bw}" height="${hi}" rx="3" fill="var(--accent)"><title>Ingresos ${esc(money(v.i))}</title></rect>`;
    s += `<rect x="${x + 1}" y="${H - hg}" width="${bw}" height="${hg}" rx="3" fill="var(--brand-2)"><title>Gastos ${esc(money(v.g))}</title></rect>`;
    const [y, m] = v.m.split('-').map(Number);
    s += `<text x="${x}" y="${H + 15}" text-anchor="middle" font-size="11" fill="var(--muted)">${new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' })}</text>`;
  });
  s += `<line x1="4" x2="${W - 4}" y1="${H}" y2="${H}" stroke="var(--line)"/></svg>`;
  const ult = vals[vals.length - 1];
  return s + `<p class="small muted" style="margin:6px 0 0">Este mes: ingresos ${money(ult.i)} · gastos ${money(ult.g)}</p>`;
}
function proximos() {
  const hoy = today(), lim = addDays(hoy, 20);
  const mk = monthKey(hoy);
  const l = pendientes(mk).concat(pendientes(addMonths(mk, 1))).filter(p => p.fecha <= lim && (p.kind === 'resumen' || p.f.tipo !== 'Ingreso'));
  if (!l.length) return '<div class="muted small">Nada en los próximos 20 días.</div>';
  return `<ul class="list">` + l.map(p => `<li><div class="grow"><div class="t">${esc(p.kind === 'resumen' ? 'Resumen ' + p.c.nombre : p.f.concepto)}</div><div class="s">${shortDate(p.fecha)}${p.fecha < hoy ? ' · vencido' : ''}</div></div><div class="amt">${p.kind === 'resumen' ? money(p.deuda) : money(p.f.monto, p.f.moneda)}</div></li>`).join('') + `</ul>`;
}

/* ---------- Vista: Cuentas ---------- */
function viewCuentas() {
  const b = balances();
  const groups = {};
  cuentas().forEach(c => { (groups[c.tipo] = groups[c.tipo] || []).push(c); });
  let html = '';
  Object.keys(TIPOS_CUENTA).forEach(t => {
    if (!groups[t]) return;
    html += `<div class="card" style="padding:6px 12px"><h2 style="margin:8px 0 2px">${TIPOS_CUENTA[t]}</h2><ul class="list">` + groups[t].map(c => {
      const s = b[c.id] || { ARS: 0, USD: 0 };
      const isCard = c.tipo === 'tarjeta';
      const main = c.moneda === 'USD' ? money(s.USD, 'USD') : money(isCard ? -s.ARS : s.ARS);
      const extra = c.moneda !== 'USD' && Math.abs(s.USD) > 0.004 ? `<div class="s right">${money(isCard ? -s.USD : s.USD, 'USD')}</div>` : '';
      return `<li><button class="item" data-action="account" data-id="${esc(c.id)}"><div class="grow"><div class="t">${esc(c.nombre)}</div><div class="s">${isCard ? 'Deuda cargada' + (num(c.dia_vencimiento) ? ' · vence el ' + num(c.dia_vencimiento) : '') : (c.moneda === 'USD' ? 'En dólares' : 'Saldo')}</div></div><div><div class="amt right ${isCard && s.ARS < 0 ? 'neg' : ''}">${main}</div>${extra}</div></button></li>`;
    }).join('') + `</ul></div>`;
  });
  html += `<button class="btn secondary" data-action="new-account" style="margin-top:4px">Agregar cuenta</button>`;
  html += `<p class="small muted">Tocá una cuenta para ajustar su saldo al valor real (por ejemplo, el que te muestra la app del banco o del FCI).</p>`;
  return html;
}
function openAccount(id) {
  const c = cuenta(id); if (!c) return;
  const s = balances()[id] || { ARS: 0, USD: 0 };
  const isCard = c.tipo === 'tarjeta';
  const curMon = c.moneda === 'USD' ? 'USD' : 'ARS';
  const tieneMovs = movs().some(m => m.origen !== 'historico' && (m.cuenta === id || m.cuenta_destino === id));
  const motivoDef = !tieneMovs ? 'Saldo inicial' : (c.tipo === 'inversion' ? 'Rendimiento' : 'Corrección');
  sheet(`
    <h3>${esc(c.nombre)}</h3>
    <p class="muted small" style="margin-top:0">${TIPOS_CUENTA[c.tipo] || c.tipo} · Saldo calculado: <b>${isCard ? money(-s.ARS) + ' de deuda' : money(s[curMon], curMon)}</b>${!isCard && c.moneda !== 'USD' && s.USD ? ' · ' + money(s.USD, 'USD') : ''}</p>
    ${isCard ? `<button class="btn" data-action="pay-card-direct" data-id="${esc(id)}">Pagar resumen</button>` : ''}
    <form id="adjForm" autocomplete="off">
      <input type="hidden" name="id" value="${esc(id)}">
      <label class="f">${isCard ? 'Deuda real de la tarjeta' : 'Saldo real hoy'}</label>
      <div class="row"><input class="in amount-in grow" name="real" inputmode="decimal" placeholder="0">
      <select class="in" name="moneda" style="width:96px">${['ARS', 'USD'].map(x => `<option ${x === curMon ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
      <label class="f">Motivo de la diferencia</label>
      <select class="in" name="motivo">${['Saldo inicial', 'Rendimiento', 'Corrección'].map(x => `<option ${x === motivoDef ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <div class="btns"><button type="button" class="btn secondary" data-action="edit-account" data-id="${esc(id)}">Editar cuenta</button><button class="btn" type="submit">Ajustar saldo</button></div>
    </form>`);
}
function saveAdjust(form) {
  const fd = new FormData(form);
  const id = fd.get('id'), c = cuenta(id), mon = fd.get('moneda');
  let real = parseMonto(fd.get('real'));
  if (!isFinite(real)) { toast('Ingresá el saldo real'); return; }
  const s = balances()[id] || { ARS: 0, USD: 0 };
  if (c.tipo === 'tarjeta') real = -real; // la deuda se guarda como saldo negativo
  const diff = Math.round((real - s[mon === 'USD' ? 'USD' : 'ARS']) * 100) / 100;
  if (!diff) { toast('El saldo ya coincide'); closeSheet(); return; }
  put('Movimientos', newMov({ tipo: 'Ajuste', categoria: fd.get('motivo'), concepto: 'Ajuste de saldo ' + c.nombre, monto: diff, moneda: mon, cuenta: id }));
  closeSheet(); toast('Saldo ajustado (' + (diff > 0 ? '+' : '') + money(diff, mon) + ')'); render();
}
function openAccountEdit(id) {
  const c = id ? Object.assign({}, cuenta(id)) : { id: '', nombre: '', tipo: 'billetera', moneda: 'ARS', fecha_inicial: today(), dia_vencimiento: '', orden: cuentas(true).length + 1, activa: 1 };
  sheet(`
    <h3>${id ? 'Editar cuenta' : 'Nueva cuenta'}</h3>
    <form id="accForm" autocomplete="off">
      <input type="hidden" name="id" value="${esc(c.id)}">
      <label class="f">Nombre</label><input class="in" name="nombre" value="${esc(c.nombre)}" required>
      <label class="f">Tipo</label><select class="in" name="tipo">${Object.keys(TIPOS_CUENTA).map(t => `<option value="${t}" ${t === c.tipo ? 'selected' : ''}>${TIPOS_CUENTA[t]}</option>`).join('')}</select>
      <label class="f">Moneda principal</label><select class="in" name="moneda">${['ARS', 'USD'].map(x => `<option ${x === c.moneda ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label class="f">Día de vencimiento del resumen (sólo tarjetas)</label><input class="in" name="dia_vencimiento" inputmode="numeric" value="${esc(c.dia_vencimiento)}">
      <label class="f">Contar movimientos desde</label><input class="in" type="date" name="fecha_inicial" value="${esc(c.fecha_inicial)}">
      <label class="check"><input type="checkbox" name="activa" ${truthy(c.activa) || c.activa === '' ? 'checked' : ''}> Cuenta activa</label>
      <div class="btns"><button type="button" class="btn secondary" data-action="close-sheet">Cancelar</button><button class="btn" type="submit">Guardar</button></div>
    </form>`);
}
function saveAccount(form) {
  const fd = new FormData(form);
  const nombre = String(fd.get('nombre') || '').trim(); if (!nombre) return;
  const id = fd.get('id') || slug(nombre) || uid();
  const base = data.Cuentas[id] || {};
  put('Cuentas', Object.assign({}, base, { id, nombre, tipo: fd.get('tipo'), moneda: fd.get('moneda'), dia_vencimiento: fd.get('dia_vencimiento') || '', fecha_inicial: fd.get('fecha_inicial') || '', orden: base.orden || cuentas(true).length + 1, activa: fd.get('activa') ? 1 : 0 }));
  closeSheet(); toast('Cuenta guardada'); render();
}

/* ---------- Ajustes ---------- */
function openSettings() {
  const dirty = TABLES.reduce((s, t) => s + Object.keys(data.dirty[t] || {}).length, 0);
  sheet(`
    <h3>Ajustes</h3>
    <form id="setForm" autocomplete="off">
      <label class="f">URL del servicio de Google (Apps Script)</label>
      <input class="in" name="url" value="${esc(settings.url)}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url">
      <label class="f">Clave de sincronización</label>
      <input class="in" name="token" value="${esc(settings.token)}" placeholder="La clave que te mostró la función setup">
      <label class="f">Cotización del dólar (para convertir a pesos en los reportes)</label>
      <input class="in" name="cot" inputmode="decimal" value="${esc(String(cot()).replace('.', ','))}">
      <div class="btns"><button type="button" class="btn secondary" data-action="close-sheet">Cerrar</button><button class="btn" type="submit">Guardar</button></div>
    </form>
    <div class="card" style="margin-top:16px">
      <div class="small muted">Última sincronización: ${data.lastSync ? new Date(data.lastSync).toLocaleString('es-AR') : 'nunca'}<br>Cambios sin subir: ${dirty}<br>Movimientos guardados: ${movs().length}${ui.lastError ? '<br><span class="neg">Último error: ' + esc(ui.lastError) + '</span>' : ''}<br>Versión ${APP_VERSION}</div>
      <div class="btns"><button class="btn secondary small" data-action="sync" style="width:100%">Sincronizar ahora</button><button class="btn secondary small" data-action="export" style="width:100%">Exportar CSV</button></div>
    </div>`);
}
function saveSettingsForm(form) {
  const fd = new FormData(form);
  settings.url = String(fd.get('url') || '').trim();
  settings.token = String(fd.get('token') || '').trim();
  saveSettings();
  const c = parseMonto(fd.get('cot'));
  if (isFinite(c) && c > 0 && c !== cot()) put('Config', { id: 'cotizacion_usd', valor: String(c) });
  closeSheet(); toast('Ajustes guardados'); render(); sync();
}
function exportCSV() {
  const cols = ['fecha', 'tipo', 'categoria', 'concepto', 'monto', 'moneda', 'cuenta', 'cuenta_destino', 'monto_destino', 'origen'];
  const lines = [cols.join(';')].concat(movs().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m => cols.map(k => {
    let v = k === 'cuenta' || k === 'cuenta_destino' ? (m[k] ? cuentaNombre(m[k]) : '') : m[k];
    if (k === 'monto' || k === 'monto_destino') v = v === '' ? '' : String(v).replace('.', ',');
    return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  }).join(';')));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'movimientos-' + today() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- Hoja inferior ---------- */
function sheet(html) {
  document.getElementById('sheet').innerHTML = `<div class="grip"></div>` + html;
  document.getElementById('sheetWrap').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeSheet() {
  document.getElementById('sheetWrap').hidden = true;
  document.getElementById('sheet').innerHTML = '';
  document.body.style.overflow = '';
}

/* ---------- Sincronización ---------- */
let syncTimer;
function queueSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1500); }
async function sync() {
  if (ui.syncing || !settings.url || !settings.token) { refreshChrome(); return; }
  if (!navigator.onLine) { refreshChrome(); return; }
  ui.syncing = true; refreshChrome();
  const sent = {}; const changes = {};
  TABLES.forEach(t => {
    const ids = Object.keys(data.dirty[t] || {});
    if (!ids.length) return;
    sent[t] = {};
    changes[t] = ids.map(id => { const r = data[t][id]; if (r) sent[t][id] = r.modificado; return r; }).filter(Boolean);
  });
  try {
    const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 45000);
    const res = await fetch(settings.url, { method: 'POST', body: JSON.stringify({ token: settings.token, changes }), signal: ctrl.signal, redirect: 'follow' });
    clearTimeout(to);
    const j = await res.json();
    if (!j.ok) throw new Error(j.error || 'Respuesta inválida');
    TABLES.forEach(t => {
      const fresh = {};
      (j.data[t] || []).forEach(r => { fresh[String(r.id)] = normalize(t, r); });
      Object.keys(data.dirty[t] || {}).forEach(id => {
        const local = data[t][id];
        if (local && (!sent[t] || sent[t][id] !== local.modificado)) fresh[id] = local; // editado durante la subida
        else delete data.dirty[t][id];
      });
      // Si la planilla todavía no tiene categorías o config, se conservan las locales
      if ((t === 'Categorias' || t === 'Config') && !(j.data[t] || []).length) return;
      data[t] = fresh;
    });
    data.lastSync = Date.now(); ui.lastError = '';
    saveData();
  } catch (e) {
    ui.lastError = e.name === 'AbortError' ? 'Tiempo de espera agotado' : (e.message || String(e));
  } finally {
    ui.syncing = false;
    if (document.getElementById('sheetWrap').hidden) render(); else refreshChrome();
  }
}
function normalize(t, r) {
  const o = Object.assign({}, r);
  o.id = String(o.id);
  ['monto', 'monto_destino', 'presupuesto', 'dia', 'dia_vencimiento', 'orden', 'creado', 'modificado'].forEach(k => {
    if (k in o && o[k] !== '' && o[k] !== null) o[k] = num(o[k]);
  });
  ['fecha', 'fecha_inicial', 'desde', 'hasta'].forEach(k => { if (o[k]) o[k] = String(o[k]).slice(0, 10); });
  if (t === 'Movimientos') o.borrado = truthy(o.borrado) ? 1 : 0;
  return o;
}

/* ---------- Eventos ---------- */
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; closeSheet(); render(); window.scrollTo(0, 0); return; }
  const chip = e.target.closest('[data-medio]');
  if (chip) {
    chip.parentElement.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === chip));
    chip.closest('form').querySelector('input[name="cuenta"]').value = chip.dataset.medio;
    return;
  }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  if (act === 'tipo') { ui.tipoCarga = a.dataset.v; render(); }
  else if (act === 'new-mov') openMovForm({ tipo: ui.tipoCarga, categoria: a.dataset.cat });
  else if (act === 'new-transfer') openTransferForm();
  else if (act === 'edit-mov') { const m = data.Movimientos[a.dataset.id]; if (!m) return; if (m.tipo === 'Transferencia') openTransferForm({ mov: m }); else if (m.tipo === 'Gasto' || m.tipo === 'Ingreso') openMovForm({ mov: m }); else openAdjInfo(m); }
  else if (act === 'delete-mov') { const m = data.Movimientos[a.dataset.id]; if (m && confirm('¿Borrar este movimiento?')) { put('Movimientos', Object.assign({}, m, { borrado: 1 })); closeSheet(); toast('Movimiento borrado'); render(); } }
  else if (act === 'close-sheet') closeSheet();
  else if (act === 'month') { ui.month = addMonths(ui.month, Number(a.dataset.v)); render(); }
  else if (act === 'sync') { if (!settings.url) openSettings(); else sync(); }
  else if (act === 'settings') openSettings();
  else if (act === 'export') exportCSV();
  else if (act === 'account') openAccount(a.dataset.id);
  else if (act === 'edit-account') openAccountEdit(a.dataset.id);
  else if (act === 'new-account') openAccountEdit('');
  else if (act === 'confirm-fijo') {
    const p = findPend(a.dataset.key); if (!p) return;
    const f = p.f;
    if (f.tipo === 'Transferencia') openTransferForm({ desde: f.cuenta, monto: f.monto, concepto: f.concepto, fijo_id: p.key, fecha: p.fecha <= today() ? today() : p.fecha });
    else openMovForm({ tipo: f.tipo || 'Gasto', categoria: f.categoria, concepto: f.concepto, monto: f.monto, moneda: f.moneda || 'ARS', cuenta: f.cuenta, fijo_id: p.key, fecha: p.fecha <= today() ? today() : p.fecha });
  }
  else if (act === 'skip-fijo') {
    const p = findPend(a.dataset.key); if (!p) return;
    put('Movimientos', newMov({ tipo: 'Omitido', concepto: p.f.concepto, categoria: p.f.categoria, monto: 0, fijo_id: p.key, fecha: p.fecha }));
    toast('Omitido este mes'); render();
  }
  else if (act === 'pay-card' || act === 'pay-card-direct') {
    let c, monto = '', key = '';
    if (act === 'pay-card') { const p = findPend(a.dataset.key); if (!p) return; c = p.c; monto = Math.round(p.deuda); key = p.key; }
    else { c = cuenta(a.dataset.id); const s = balances()[c.id]; monto = Math.max(0, Math.round(-(s ? s.ARS : 0))); key = 'resumen:' + c.id + '|' + monthKey(today()); }
    const banco = cuentas().find(x => x.tipo === 'banco' && x.moneda !== 'USD');
    openTransferForm({ desde: banco ? banco.id : '', hacia: c.id, monto, concepto: 'Pago resumen ' + c.nombre, fijo_id: key });
  }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  // getAttribute: los formularios tienen un campo llamado "id" que tapa la propiedad f.id
  const fid = f.getAttribute('id');
  if (fid === 'movForm') saveMovForm(f);
  else if (fid === 'trfForm') saveTransferForm(f);
  else if (fid === 'adjForm') saveAdjust(f);
  else if (fid === 'accForm') saveAccount(f);
  else if (fid === 'setForm') saveSettingsForm(f);
});
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.input;
  if (k === 'movFilter') {
    ui.movFilter = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = document.querySelector('[data-input="movFilter"]');
    if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (er) { /* */ } }
  }
});
function openAdjInfo(m) {
  sheet(`<h3>${esc(m.tipo === 'Ajuste' ? 'Ajuste de saldo' : m.tipo)}</h3>
    <p>${esc(m.concepto)}<br><span class="muted small">${esc(m.categoria || '')} · ${shortDate(m.fecha)} · ${money(m.monto, m.moneda)}</span></p>
    <div class="btns"><button class="btn secondary" data-action="close-sheet">Cerrar</button><button class="btn danger" data-action="delete-mov" data-id="${esc(m.id)}">Borrar</button></div>`);
}
window.addEventListener('online', () => { refreshChrome(); sync(); });
window.addEventListener('offline', refreshChrome);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });

/* ---------- Inicio ---------- */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo sin conexión */ });
}
render();
sync();
