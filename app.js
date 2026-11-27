'use strict';
/* Cesťák – sběrný příkaz k pracovním cestám. Vše se ukládá jen v telefonu (localStorage). */

const KEY = 'cestak.v1';
const FONTS = [
  { id: 'Caveat', label: 'Caveat', size: 1.0 },
  { id: 'Oooh Baby', label: 'Oooh Baby', size: 0.95 },
  { id: 'Bad Script', label: 'Bad Script', size: 0.8 },
  { id: 'Dancing Script', label: 'Dancing', size: 0.9 },
  { id: 'Comforter', label: 'Comforter', size: 1.05 },
  { id: 'Kalam', label: 'Kalam', size: 0.8 },
];
const MONTHS = ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'];
const WD = ['ne','po','út','st','čt','pá','so'];
const WD_LONG = ['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'];

const DEFAULT_SETTINGS = {
  name: '', osobni: '', odbor: '',
  origin: 'Vysoké Mýto',
  defTime: '07:00', defEnd: '15:30',
  defTransport: 'A.S.', defSpolu: 'Čermák', defDoba: '7.5 h', defSchvaluje: '',
  font: 'Caveat', ink: '#1b2a8a', fontScale: 1, jitter: 1,
  autoPrompt: true, remindTime: '15:00',
  overlay: false, offX: 0, offY: 0,
  logo: '',
};

let db = load();
let viewMonth = monthKey(new Date());
let editing = null;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && d.trips) { d.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings); d.templates ||= []; d.skipped ||= []; return d; }
  } catch (e) {}
  return { settings: { ...DEFAULT_SETTINGS }, trips: [], templates: [], skipped: [] };
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('Uložení selhalo: ' + e.message); }
}
const S = () => db.settings;

/* ---------- utils ---------- */
function $(s, el = document) { return el.querySelector(s); }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function pad(n) { return String(n).padStart(2, '0'); }
function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function monthLabel(mk) { const [y, m] = mk.split('-'); return MONTHS[+m - 1] + ' ' + y; }
function shiftMonth(mk, n) { const [y, m] = mk.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function hm(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); }
function fmtTime(t) { if (!t) return ''; const [h, m] = t.split(':'); return (+h) + ':' + m; }
function duration(t) {
  if (t.doba) return t.doba;
  const a = hm(t.time), b = hm(t.end);
  if (a == null || b == null || b <= a) return '';
  const h = (b - a) / 60;
  return (Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')) + ' h';
}
function routeText(t) { return (t.from || '').trim(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 2200); }
function tripsOf(mk) { return db.trips.filter(t => t.date.startsWith(mk)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)); }
function shortDate(iso) { const d = parseDate(iso); return d.getDate() + '. ' + (d.getMonth() + 1) + '.'; }
function longDate(iso) { const d = parseDate(iso); return WD_LONG[d.getDay()] + ' ' + shortDate(iso) + ' ' + d.getFullYear(); }
// jiná cesta zapsaná na stejný den (každý den smí být v seznamu jen jednou)
function tripOnDate(iso, exceptId) { return db.trips.find(t => t.date === iso && t.id !== exceptId); }

/* ---------- státní svátky ČR ---------- */
const HOLI_FIXED = {
  '01-01': 'Den obnovy samostatného českého státu', '05-01': 'Svátek práce', '05-08': 'Den vítězství',
  '07-05': 'Den slovanských věrozvěstů Cyrila a Metoděje', '07-06': 'Den upálení mistra Jana Husa',
  '09-28': 'Den české státnosti', '10-28': 'Den vzniku samostatného československého státu',
  '11-17': 'Den boje za svobodu a demokracii', '12-24': 'Štědrý den', '12-25': '1. svátek vánoční', '12-26': '2. svátek vánoční',
};
function easterSunday(y) { // anonymní gregoriánský algoritmus
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(y, Math.floor(n / 31) - 1, (n % 31) + 1);
}
const holiCache = {};
function holidays(y) {
  if (holiCache[y]) return holiCache[y];
  const out = {};
  for (const [md, name] of Object.entries(HOLI_FIXED)) out[y + '-' + md] = name;
  const e = easterSunday(y);
  const add = (off, name) => { out[isoDate(new Date(y, e.getMonth(), e.getDate() + off))] = name; };
  if (y >= 2016) add(-2, 'Velký pátek');
  add(1, 'Velikonoční pondělí');
  return (holiCache[y] = out);
}
function holidayName(iso) { return holidays(+iso.slice(0, 4))[iso] || ''; }
function isOffDay(iso) { const wd = parseDate(iso).getDay(); return wd === 0 || wd === 6 || !!holidayName(iso); }

/* ---------- kalendář ---------- */
// zapsané dny = zeleně, víkendy a státní svátky = červeně, dnešek = modrý rámeček, vybraný den = plná modrá
function calendarHtml(mk, { selected = '', exceptId = '' } = {}) {
  const [y, m] = mk.split('-').map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
  const taken = new Set(db.trips.filter(t => t.id !== exceptId).map(t => t.date));
  const today = isoDate(new Date());
  let h = '<div class="cal">' + ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'].map((d, i) => `<div class="cal-h${i > 4 ? ' off' : ''}">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) h += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const iso = mk + '-' + pad(d), cls = ['cal-d'], hn = holidayName(iso);
    if (isOffDay(iso)) cls.push('off');
    if (taken.has(iso)) cls.push('rec');
    if (iso === today) cls.push('today');
    if (iso === selected) cls.push('sel');
    const tip = [taken.has(iso) ? 'zapsáno' : '', hn].filter(Boolean).join(' · ');
    h += `<button type="button" class="${cls.join(' ')}" data-day="${iso}"${tip ? ` title="${esc(tip)}"` : ''}>${d}</button>`;
  }
  return h + '</div>';
}
function calendarLegend(mk) {
  const hs = Object.entries(holidays(+mk.slice(0, 4))).filter(([d]) => d.startsWith(mk)).sort(([a], [b]) => a.localeCompare(b));
  return `<div class="cal-legend"><span><i class="rec"></i>zapsáno</span><span><i class="off"></i>víkend / státní svátek</span></div>`
    + (hs.length ? `<div class="hint">${hs.map(([d, n]) => `${shortDate(d)} ${esc(n)}`).join(' · ')}</div>` : '');
}

/* ---------- tabs ---------- */
let tab = 'list';
document.querySelectorAll('nav.tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
function showTab(t) {
  tab = t;
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  ['list', 'form', 'settings'].forEach(x => $('#tab-' + x).hidden = x !== t);
  $('#fab').style.display = t === 'list' ? '' : 'none';
  $('header.top .monthnav').style.visibility = t === 'settings' ? 'hidden' : '';
  render();
  window.scrollTo(0, 0);
}
$('#mPrev').onclick = () => { viewMonth = shiftMonth(viewMonth, -1); render(); };
$('#mNext').onclick = () => { viewMonth = shiftMonth(viewMonth, 1); render(); };
$('#fab').onclick = () => openEdit(null);

function render() {
  $('#mLabel').textContent = monthLabel(viewMonth);
  if (tab === 'list') renderList();
  if (tab === 'form') renderFormTab();
  if (tab === 'settings') renderSettings();
}

/* ---------- list ---------- */
function todayMissing() {
  const d = isoDate(new Date());
  if (isOffDay(d)) return false;
  if (db.trips.some(t => t.date === d) || db.skipped.includes(d)) return false;
  return true;
}
function renderList() {
  const el = $('#tab-list');
  const list = tripsOf(viewMonth);
  let h = '';
  if (todayMissing() && viewMonth === monthKey(new Date())) {
    h += `<div class="banner"><p><b>Dnes ještě nemáš zápis.</b><br><span class="hint" style="margin:0">Jel jsi dnes služebně?</span></p>
      <button class="btn" id="bAdd">Zapsat</button><button class="btn sec" id="bSkip">Ne</button></div>`;
  }
  if (!S().name) h += `<div class="banner"><p>Nejdřív si v <b>Nastavení</b> vyplň jméno, osobní číslo a odbor. Předvyplní se do hlavičky.</p></div>`;
  // starší data / obnovená záloha můžou mít jeden den vícekrát – upozornit, nic nemazat samo
  const seen = new Set(), dup = new Set();
  for (const t of list) { if (seen.has(t.date)) dup.add(t.date); seen.add(t.date); }
  if (dup.size) h += `<div class="banner warn"><p><b>Den ${[...dup].map(shortDate).join(', ')} je zapsaný vícekrát.</b><br>Každý den může být v seznamu jen jednou. Jeden ze záznamů smaž, nebo mu změň datum.</p></div>`;
  h += `<div class="card">${calendarHtml(viewMonth)}${calendarLegend(viewMonth)}</div>`;
  const pages = Math.max(1, Math.ceil(list.length / 15));
  h += `<div class="count">${list.length} ${list.length === 1 ? 'cesta' : list.length >= 2 && list.length <= 4 ? 'cesty' : 'cest'} · ${pages} ${pages === 1 ? 'list' : 'listy'} formuláře</div>`;
  if (!list.length) h += `<div class="card empty">V tomto měsíci zatím nic.<br>Přidej cestu tlačítkem +.</div>`;
  for (const t of list) {
    const d = parseDate(t.date);
    h += `<div class="card trip${dup.has(t.date) ? ' dup' : ''}" data-id="${t.id}"><div class="d">${d.getDate()}.${d.getMonth() + 1}.<small>${WD[d.getDay()]}</small></div>
      <div class="b"><b>${esc(t.misto || '—')}</b><div>${esc(t.ucel || '')}</div><div>${esc([routeText(t), duration(t), t.doprava].filter(Boolean).join(' · '))}</div></div></div>`;
  }
  el.innerHTML = h;
  el.querySelectorAll('.trip').forEach(c => c.onclick = () => openEdit(db.trips.find(t => t.id === c.dataset.id)));
  // ťuk na den v kalendáři: zapsaný den otevře jeho záznam, volný den založí novou cestu s tím datem
  el.querySelectorAll('.cal-d').forEach(b => b.onclick = () => { const t = tripOnDate(b.dataset.day); t ? openEdit(t) : openEdit(null, b.dataset.day); });
  const ba = $('#bAdd'); if (ba) ba.onclick = () => openEdit(null);
  const bs = $('#bSkip'); if (bs) bs.onclick = () => { db.skipped.push(isoDate(new Date())); db.skipped = db.skipped.slice(-60); save(); render(); };
}

/* ---------- edit sheet ---------- */
function lastTrip() { return [...db.trips].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0]; }
function suggestions(field) {
  const m = new Map();
  for (const t of db.trips) { const v = (t[field] || '').trim(); if (v) m.set(v, (m.get(v) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(x => x[0]);
}
function newTrip(preset) {
  const s = S();
  let date = preset || isoDate(new Date());
  if (!date.startsWith(viewMonth)) date = viewMonth + '-01';
  if (tripOnDate(date)) date = ''; // den už je zapsaný → nechat vybrat v kalendáři
  return { id: uid(), date, time: s.defTime, end: s.defEnd, from: s.origin, to: s.origin, misto: '', ucel: '', spolu: s.defSpolu, doba: s.defDoba, doprava: s.defTransport, zaloha: '', schvaluje: s.defSchvaluje };
}
const FIELDS = [
  ['misto', 'Místo pracovního výkonu'], ['ucel', 'Účel cesty'], ['spolu', 'Spolucestující'],
  ['doprava', 'Dopravní prostředek'], ['zaloha', 'Měsíční záloha'], ['schvaluje', 'Schvaluje'],
];
let pickMonth = viewMonth;
function renderPicker() {
  const sel = $('#f-date').value;
  $('#calLbl').textContent = monthLabel(pickMonth);
  $('#calPick').innerHTML = calendarHtml(pickMonth, { selected: sel, exceptId: editing.id }) + calendarLegend(pickMonth);
  const hn = sel && holidayName(sel);
  $('#dateHint').textContent = sel ? longDate(sel) + (hn ? ' · ' + hn : '') : 'Vyber den v kalendáři.';
}
function pickDay(iso) {
  if (tripOnDate(iso, editing.id)) return toast(shortDate(iso) + ' už je zapsaný');
  $('#f-date').value = iso;
  renderPicker();
}
function openEdit(trip, presetDate) {
  const isNew = !trip;
  editing = isNew ? newTrip(presetDate) : { ...trip };
  pickMonth = editing.date ? editing.date.slice(0, 7) : viewMonth;
  const sh = $('#editSheet');
  const chips = [];
  const lt = lastTrip();
  if (isNew && lt) chips.push(`<button class="chip" data-act="last">↻ Jako minule</button>`);
  db.templates.forEach((tp, i) => chips.push(`<button class="chip" data-tpl="${i}">${esc(tp.label)}</button>`));
  const dl = f => `<datalist id="dl-${f}">${suggestions(f).map(v => `<option value="${esc(v)}">`).join('')}</datalist>`;
  sh.innerHTML = `
  <header><button data-act="close">Zrušit</button><h2 style="text-align:center">${isNew ? 'Nová cesta' : 'Upravit cestu'}</h2><button data-act="save">Uložit</button></header>
  ${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}
  <div class="card">
    <label>Datum</label><input type="hidden" id="f-date" value="${editing.date}">
    <div class="calnav"><button type="button" data-act="calPrev" aria-label="Předchozí měsíc">‹</button><b id="calLbl"></b><button type="button" data-act="calNext" aria-label="Další měsíc">›</button></div>
    <div id="calPick"></div>
    <div class="hint" id="dateHint"></div>
    <label>Východisko a místo ukončení cesty</label><input id="f-from" list="dl-from" value="${esc(editing.from)}">
    <label>Místo pracovního výkonu</label><input id="f-misto" list="dl-misto" value="${esc(editing.misto)}" placeholder="např. VD Rozkoš">
    <label>Účel cesty</label><textarea id="f-ucel" placeholder="např. kontrola objektu">${esc(editing.ucel)}</textarea>
    <div class="hint" id="ucelHint"></div>
    <div class="row"><div><label>Spolucestující</label><input id="f-spolu" list="dl-spolu" value="${esc(editing.spolu)}"></div>
      <div><label>Doba trvání</label><input id="f-doba" placeholder="auto" value="${esc(editing.doba)}"></div></div>
    <div class="hint" id="dobaHint"></div>
    <div class="row"><div><label>Dopravní prostředek</label><input id="f-doprava" list="dl-doprava" value="${esc(editing.doprava)}"></div>
      <div><label>Měsíční záloha</label><input id="f-zaloha" value="${esc(editing.zaloha)}"></div></div>
    <label>Schvaluje</label><input id="f-schvaluje" list="dl-schvaluje" value="${esc(editing.schvaluje)}" placeholder="obvykle nechat prázdné (podpis)">
  </div>
  ${['from', 'to', 'misto', 'spolu', 'doprava', 'schvaluje'].map(dl).join('')}
  <button class="btn sec block" data-act="tpl">☆ Uložit jako šablonu</button>
  ${isNew ? '' : '<button class="btn danger block" data-act="del">Smazat cestu</button>'}
  <div class="hint">Šablona si pamatuje místo, účel, dobu, spolucestující a dopravu. Pak ji jedním ťuknutím použiješ nahoře.</div>`;
  sh.classList.add('open');
  document.body.style.overflow = 'hidden';
  const upd = () => { const t = readEdit(); $('#dobaHint').textContent = ''; };
  $('#f-doba', sh).addEventListener('input', upd); upd();
  renderPicker();
  sh.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tpl != null) return applyTpl(db.templates[+b.dataset.tpl]);
    if (b.dataset.day) return pickDay(b.dataset.day);
    const a = b.dataset.act;
    if (a === 'calPrev' || a === 'calNext') { pickMonth = shiftMonth(pickMonth, a === 'calPrev' ? -1 : 1); renderPicker(); }
    if (a === 'close') closeEdit();
    if (a === 'last') applyTpl(lastTrip());
    if (a === 'save') saveEdit();
    if (a === 'del') { if (confirmDel()) { db.trips = db.trips.filter(t => t.id !== editing.id); save(); closeEdit(); toast('Smazáno'); } }
    if (a === 'tpl') {
      const t = readEdit();
      const label = (t.misto || 'Šablona') + (t.ucel ? ' – ' + t.ucel.slice(0, 20) : '');
      db.templates.push({ label, time: t.time, end: t.end, from: t.from, to: t.to, misto: t.misto, ucel: t.ucel, spolu: t.spolu, doprava: t.doprava, doba: t.doba });
      save(); toast('Šablona uložena');
    }
  };
}
let delArmed = 0;
function confirmDel() { const now = Date.now(); if (now - delArmed < 3000) return true; delArmed = now; toast('Ťukni znovu pro smazání'); return false; }
function applyTpl(tp) {
  if (!tp) return;
  const keep = { id: editing.id, date: $('#f-date').value };
  const t = Object.assign({}, readEdit(), ['time', 'end', 'from', 'to', 'misto', 'ucel', 'spolu', 'doprava', 'doba'].reduce((o, k) => (tp[k] !== undefined && (o[k] = tp[k]), o), {}), keep);
  for (const k of ['time', 'end', 'from', 'to', 'misto', 'ucel', 'spolu', 'doprava', 'doba']) { const el = $('#f-' + k); if (el) el.value = t[k] || ''; }
  $('#f-doba').dispatchEvent(new Event('input'));
  toast('Předvyplněno');
}
function readEdit() {
  const t = { ...editing };
  for (const k of ['date', 'time', 'end', 'from', 'to', 'misto', 'ucel', 'spolu', 'doba', 'doprava', 'zaloha', 'schvaluje']) { const el = $('#f-' + k); if (el) t[k] = el.value.trim(); }
  return t;
}
function saveEdit() {
  const t = readEdit();
  if (!t.date) return toast('Vyber den v kalendáři');
  if (tripOnDate(t.date, t.id)) return toast(shortDate(t.date) + ' už je zapsaný, každý den jen jednou');
  const i = db.trips.findIndex(x => x.id === t.id);
  if (i >= 0) db.trips[i] = t; else db.trips.push(t);
  save();
  viewMonth = t.date.slice(0, 7);
  closeEdit();
  toast('Uloženo');
}
function closeEdit() { $('#editSheet').classList.remove('open'); document.body.style.overflow = ''; editing = null; render(); }

/* ---------- form rendering (canvas) ---------- */
// rozměry v mm, A4 na šířku; poměry sloupců odměřené z fotky papírového formuláře
const PAGE = { w: 297, h: 210 };
const FRAME = { x: 14, y: 18, w: 269, h: 176 };
const COLS = [7.3, 13.0, 13.4, 25.8, 10.1, 5.9, 6.0, 6.0, 12.5];
const COL_TITLES = [['Datum', 'hodina', 'nástup'], ['Východisko a místo', 'ukončení cesty'], ['Místo pracovního', 'výkonu'], ['Účel cesty'], ['Spolucestující'], ['Doba', 'trvání'], ['Dopravní', 'prostř.'], ['Měsíční', 'záloha'], ['Schvaluje']];
const HEAD_H = 28, COLHEAD_H = 13, ROWS = 15;

function colX() { const xs = [FRAME.x]; let acc = 0; const tot = COLS.reduce((a, b) => a + b, 0); for (const c of COLS) { acc += c; xs.push(FRAME.x + FRAME.w * acc / tot); } return xs; }

function rng(seedStr) { let h = 2166136261; for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }

function cellTexts(t) {
  const d = parseDate(t.date);
  return [
    `${d.getDate()}. ${d.getMonth() + 1}.`,
    routeText(t), t.misto, t.ucel, t.spolu, duration(t), t.doprava, t.zaloha, t.schvaluje,
  ];
}

function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test; else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

function handText(ctx, text, x, y, w, h, opts, seed) {
  if (!text) return;
  const s = S(), f = FONTS.find(f => f.id === s.font) || FONTS[0];
  const k = opts.k;
  let size = 5.2 * f.size * (+s.fontScale || 1);
  let lines;
  for (let i = 0; i < 30; i++) {
    ctx.font = `${size * k}px "${f.id}"`;
    lines = wrapLines(ctx, text, (w - 2.2) * k);
    const lh = size * 0.95;
    const tooWide = lines.some(l => ctx.measureText(l).width > (w - 2.2) * k);
    if (lines.length * lh <= h - 1 && !tooWide) break;
    size *= 0.92;
  }
  const r = rng(seed), J = +s.jitter;
  const lh = size * 0.95;
  const total = lines.length * lh;
  let cy = y + (h - total) / 2 + lh * 0.78;
  ctx.fillStyle = s.ink;
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    let cx = x + 1.1 + (r() - 0.3) * 0.6 * J;
    const lineRot = (r() - 0.5) * 0.02 * J;
    for (const word of line.split(' ')) {
      const ww = ctx.measureText(word).width / k;
      ctx.save();
      ctx.translate(cx * k, (cy + (r() - 0.5) * 0.5 * J) * k);
      ctx.rotate(lineRot + (r() - 0.5) * 0.03 * J);
      ctx.globalAlpha = 0.88 + r() * 0.1;
      ctx.fillText(word, 0, 0);
      ctx.restore();
      cx += ww + ctx.measureText(' ').width / k;
    }
    cy += lh;
  }
  ctx.globalAlpha = 1;
}

async function ensureFonts() {
  const f = S().font;
  try { await document.fonts.load(`40px "${f}"`, 'ěščřžýáíéůú'); } catch (e) {}
  await document.fonts.ready;
}

let logoImg = null, logoSrc = '';
function getLogo() {
  if (!S().logo) return Promise.resolve(null);
  if (logoImg && logoSrc === S().logo) return Promise.resolve(logoImg);
  return new Promise(res => { const im = new Image(); im.onload = () => { logoImg = im; logoSrc = S().logo; res(im); }; im.onerror = () => res(null); im.src = S().logo; });
}

async function drawPage(canvas, trips, mk, pageNo, pageCount, k) {
  await ensureFonts();
  const logo = await getLogo();
  const s = S();
  canvas.width = Math.round(PAGE.w * k); canvas.height = Math.round(PAGE.h * k);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const overlay = s.overlay;
  ctx.save();
  if (overlay) ctx.translate((+s.offX || 0) * k, (+s.offY || 0) * k);
  const xs = colX();
  const top = FRAME.y, y1 = top + HEAD_H, y2 = y1 + COLHEAD_H, rowH = (FRAME.h - HEAD_H - COLHEAD_H) / ROWS;
  const xLogoEnd = FRAME.x + FRAME.w * 0.204, xRight = xs[4], xOsobni = FRAME.x + FRAME.w * 0.874, xOdbor = xs[7];
  const yMid = top + HEAD_H * 0.55;
  const L = (x1, y1_, x2, y2_) => { ctx.beginPath(); ctx.moveTo(x1 * k, y1_ * k); ctx.lineTo(x2 * k, y2_ * k); ctx.stroke(); };
  const T = (txt, x, y, size, bold, align = 'left') => { ctx.font = `${bold ? 'bold ' : ''}${size * k}px Arial, Helvetica, sans-serif`; ctx.textAlign = align; ctx.fillStyle = '#111'; ctx.fillText(txt, x * k, y * k); ctx.textAlign = 'left'; };

  if (!overlay) {
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.35 * k;
    ctx.strokeRect(FRAME.x * k, FRAME.y * k, FRAME.w * k, FRAME.h * k);
    L(xLogoEnd, top, xLogoEnd, y1);
    L(xRight, top, xRight, y1);
    L(xRight, yMid, FRAME.x + FRAME.w, yMid);
    L(xOsobni, top, xOsobni, yMid);
    L(xOdbor, yMid, xOdbor, y1);
    L(FRAME.x, y1, FRAME.x + FRAME.w, y1);
    L(FRAME.x, y2, FRAME.x + FRAME.w, y2);
    for (let i = 1; i < ROWS; i++) L(FRAME.x, y2 + i * rowH, FRAME.x + FRAME.w, y2 + i * rowH);
    for (let i = 1; i < xs.length - 1; i++) L(xs[i], y1, xs[i], FRAME.y + FRAME.h);
    // hlavička
    T('SBĚRNÝ PŘÍKAZ K PRACOVNÍM CESTÁM', (xLogoEnd + xRight) / 2, top + HEAD_H * 0.58, 4.6, true, 'center');
    T('Pracovník:', xRight + 1, top + 4, 3.0); T('Osobní číslo:', xOsobni + 1, top + 4, 3.0);
    T('Měsíc:', xRight + 1, yMid + 4, 3.0); T('Odbor:', xOdbor + 1, yMid + 4, 3.0);
    COL_TITLES.forEach((ls, i) => {
      const cx = (xs[i] + xs[i + 1]) / 2, n = ls.length, sz = i >= 5 && i <= 7 ? 2.8 : 3.3, lh = sz * 1.15;
      ls.forEach((l, j) => T(l, cx, y1 + COLHEAD_H / 2 - (n * lh) / 2 + lh * (j + 0.8), sz, false, 'center'));
    });
    // logo
    const lb = { x: FRAME.x + 3, y: top + 3, w: xLogoEnd - FRAME.x - 6, h: HEAD_H - 6 };
    if (logo) {
      const r = Math.min(lb.w / logo.width, lb.h / logo.height), w = logo.width * r, h = logo.height * r;
      ctx.drawImage(logo, (lb.x + (lb.w - w) / 2) * k, (lb.y + (lb.h - h) / 2) * k, w * k, h * k);
    }
    if (pageCount > 1) T(`list ${pageNo}/${pageCount}`, FRAME.x + FRAME.w, FRAME.y + FRAME.h + 4, 2.6, false, 'right');
  }
  // předvyplněné hodnoty
  const hd = (txt, x, y, w, h, seed) => handText(ctx, txt, x, y, w, h, { k }, seed);
  hd(s.name, xRight + 14, top, xOsobni - xRight - 15, yMid - top, 'name');
  hd(s.osobni, xOsobni + 1, top + 4, FRAME.x + FRAME.w - xOsobni - 2, yMid - top - 4, 'osobni');
  hd(monthLabel(mk), xRight + 10, yMid, xOdbor - xRight - 11, y1 - yMid, 'mesic' + mk);
  hd(s.odbor, xOdbor + 10, yMid, FRAME.x + FRAME.w - xOdbor - 11, y1 - yMid, 'odbor');
  trips.forEach((t, r) => {
    const cells = cellTexts(t), ry = y2 + r * rowH;
    cells.forEach((txt, c) => hd(txt, xs[c], ry, xs[c + 1] - xs[c], rowH, t.id + ':' + c));
  });
  ctx.restore();
}

function pagesFor(mk) {
  const list = tripsOf(mk), pages = [];
  for (let i = 0; i < Math.max(1, list.length); i += ROWS) pages.push(list.slice(i, i + ROWS));
  return pages;
}

/* ---------- PDF (vlastní minimalistický generátor, JPEG stránky) ---------- */
function buildPdf(images) {
  const enc = new TextEncoder(), parts = [], offsets = [];
  let len = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const W = 841.89, H = 595.28, n = images.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const kids = images.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  images.forEach((im, i) => {
    const p = 3 + i * 3;
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`));
    obj(p + 1, () => { push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.bytes.length} >>\nstream\n`); push(im.bytes); push('\nendstream'); });
    obj(p + 2, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  });
  const xref = len, total = 3 + n * 3;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));

async function exportMonth(kind) {
  const mk = viewMonth, pages = pagesFor(mk), K = 11; // ~280 dpi
  const files = [];
  const base = `cestak-${mk}`;
  if (kind === 'pdf') {
    const imgs = [];
    for (let i = 0; i < pages.length; i++) {
      const c = document.createElement('canvas');
      await drawPage(c, pages[i], mk, i + 1, pages.length, K);
      const b = await toBlob(c, 'image/jpeg', 0.9);
      imgs.push({ w: c.width, h: c.height, bytes: new Uint8Array(await b.arrayBuffer()) });
    }
    files.push(new File([buildPdf(imgs)], base + '.pdf', { type: 'application/pdf' }));
  } else {
    for (let i = 0; i < pages.length; i++) {
      const c = document.createElement('canvas');
      await drawPage(c, pages[i], mk, i + 1, pages.length, K);
      const b = await toBlob(c, 'image/jpeg', 0.92);
      files.push(new File([b], base + (pages.length > 1 ? `-${i + 1}` : '') + '.jpg', { type: 'image/jpeg' }));
    }
  }
  await shareFiles(files, 'Cesťák ' + monthLabel(mk));
}
async function shareFiles(files, title) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
}

/* ---------- tab Formulář ---------- */
async function renderFormTab() {
  const el = $('#tab-form');
  const pages = pagesFor(viewMonth);
  el.innerHTML = `<div class="count">${monthLabel(viewMonth)} · ${tripsOf(viewMonth).length} cest · náhled</div>
    <div id="pv"></div>
    <div class="row"><button class="btn block" id="ePdf">Sdílet PDF</button><button class="btn sec block" id="eJpg">Sdílet obrázek</button></div>
    <div class="hint">Sdílení otevře nabídku iPhonu: Mail, WhatsApp, uložit do Souborů, tisk… Před odesláním můžeš cokoli opravit v záložce Cesty.</div>
    <div class="card"><h3>Písmo</h3><div class="fontpick">${FONTS.map(f => `<button data-f="${f.id}" class="${S().font === f.id ? 'on' : ''}" style="font-family:'${f.id}'">Vysoké Mýto</button>`).join('')}</div>
    <label>Velikost písma</label><input type="range" min="0.7" max="1.3" step="0.05" id="fs" value="${S().fontScale}">
    <label>Nepravidelnost (jako ruka)</label><input type="range" min="0" max="2" step="0.1" id="fj" value="${S().jitter}">
    <label>Barva propisky</label><div class="chips">${[['#1b2a8a', 'modrá'], ['#0d3b9c', 'světlejší modrá'], ['#151515', 'černá']].map(([c, n]) => `<button class="chip" data-ink="${c}"><span style="color:${c}">●</span> ${n}</button>`).join('')}</div></div>`;
  const pv = $('#pv');
  for (let i = 0; i < pages.length; i++) {
    const c = document.createElement('canvas'); c.className = 'preview'; c.style.marginBottom = '10px';
    pv.appendChild(c);
    await drawPage(c, pages[i], viewMonth, i + 1, pages.length, 5);
  }
  $('#ePdf').onclick = () => exportMonth('pdf').catch(e => toast('Chyba: ' + e.message));
  $('#eJpg').onclick = () => exportMonth('jpg').catch(e => toast('Chyba: ' + e.message));
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S().font = b.dataset.f; save(); renderFormTab(); });
  el.querySelectorAll('[data-ink]').forEach(b => b.onclick = () => { S().ink = b.dataset.ink; save(); renderFormTab(); });
  $('#fs').onchange = e => { S().fontScale = +e.target.value; save(); renderFormTab(); };
  $('#fj').onchange = e => { S().jitter = +e.target.value; save(); renderFormTab(); };
}

/* ---------- nastavení ---------- */
function renderSettings() {
  const s = S(), el = $('#tab-settings');
  const inp = (k, l, ph = '', type = 'text') => `<label>${l}</label><input data-k="${k}" type="${type}" value="${esc(s[k])}" placeholder="${esc(ph)}">`;
  el.innerHTML = `
  <div class="card"><h3>Hlavička formuláře</h3>
    ${inp('name', 'Pracovník', 'Jméno Příjmení')}
    <div class="row"><div>${inp('osobni', 'Osobní číslo')}</div><div>${inp('odbor', 'Odbor')}</div></div>
    <label>Logo do levého horního rohu (volitelné)</label>
    <input type="file" accept="image/*" id="logoIn">
    ${s.logo ? '<button class="btn danger" id="logoDel" style="padding:8px 0">Odebrat logo</button>' : '<div class="hint">Vyfoť nebo nahraj logo z papíru, jinak zůstane rámeček prázdný.</div>'}
  </div>
  <div class="card"><h3>Výchozí hodnoty nové cesty</h3>
    ${inp('origin', 'Výchozí místo / ukončení', 'Vysoké Mýto')}
    ${inp('defDoba', 'Doba trvání', '7.5 h')}
    ${inp('defTransport', 'Dopravní prostředek', 'A.S.')}
    ${inp('defSpolu', 'Spolucestující')}
    ${inp('defSchvaluje', 'Schvaluje', 'obvykle prázdné')}
  </div>
  <div class="card"><h3>Šablony</h3>
    ${db.templates.length ? db.templates.map((t, i) => `<div class="tpl"><span>${esc(t.label)}</span><button data-deltpl="${i}">✕</button></div>`).join('') : '<div class="hint">Zatím žádné. Ulož si je při úpravě cesty.</div>'}
  </div>
  <div class="card"><h3>Denní připomínka</h3>
    <div class="switch"><input type="checkbox" id="ap" ${s.autoPrompt ? 'checked' : ''}><span>Po otevření aplikace rovnou nabídnout zápis dne (od zvoleného času)</span></div>
    ${inp('remindTime', 'Čas připomínky', '', 'time')}
    <button class="btn sec block" id="ics">📅 Přidat připomínku do Kalendáře (po–pá)</button>
    <div class="hint">iPhone neumí webové aplikaci bez serveru naplánovat notifikaci. Tohle přidá do Kalendáře opakovanou událost s upozorněním. Když na ni ťukneš, otevři Cesťák z plochy a zápis se nabídne sám.</div>
  </div>
  <div class="card"><h3>Tisk na předtištěný papír</h3>
    <div class="switch"><input type="checkbox" id="ov" ${s.overlay ? 'checked' : ''}><span>Exportovat jen text bez tabulky</span></div>
    <div class="row"><div>${inp('offX', 'Posun vpravo (mm)', '0', 'number')}</div><div>${inp('offY', 'Posun dolů (mm)', '0', 'number')}</div></div>
    <div class="hint">Pro případ, že chceš tisknout přímo do papírových formulářů. Posunem doladíš, aby text seděl v kolonkách.</div>
  </div>
  <div class="card"><h3>Záloha dat</h3>
    <div class="hint">Data jsou jen v tomhle telefonu. Občas si udělej zálohu (třeba do Souborů / iCloudu).</div>
    <div class="row"><button class="btn sec block" id="bk">Uložit zálohu</button><label class="btn sec block" style="margin:10px 0 0;color:var(--accent);font-size:16px">Obnovit<input type="file" accept=".json,application/json" id="rs" hidden></label></div>
  </div>
  <div class="hint" style="text-align:center;margin:16px">Cesťák v1 · data se nikam neodesílají</div>`;
  el.querySelectorAll('input[data-k]').forEach(i => i.onchange = () => { s[i.dataset.k] = i.type === 'number' ? +i.value : i.value.trim(); save(); });
  $('#ap').onchange = e => { s.autoPrompt = e.target.checked; save(); };
  $('#ov').onchange = e => { s.overlay = e.target.checked; save(); };
  el.querySelectorAll('[data-deltpl]').forEach(b => b.onclick = () => { db.templates.splice(+b.dataset.deltpl, 1); save(); renderSettings(); });
  $('#logoIn').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const im = await createImageBitmap(f); const c = document.createElement('canvas'); const r = Math.min(1, 900 / im.width);
    c.width = im.width * r; c.height = im.height * r; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    s.logo = c.toDataURL('image/png'); save(); renderSettings(); toast('Logo uloženo');
  };
  const ld = $('#logoDel'); if (ld) ld.onclick = () => { s.logo = ''; save(); renderSettings(); };
  $('#ics').onclick = () => {
    const [h, m] = (s.remindTime || '15:00').split(':');
    const d = new Date(); const ds = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Cestak//CZ', 'BEGIN:VEVENT', `UID:cestak-${uid()}@local`, `DTSTAMP:${ds}T000000Z`,
      `DTSTART;TZID=Europe/Prague:${ds}T${pad(h)}${pad(m)}00`, `DURATION:PT5M`, 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'SUMMARY:Cesťák – zapsat dnešní cestu',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Zapsat cestu do Cesťáku', 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    shareFiles([new File([ics], 'cestak-pripominka.ics', { type: 'text/calendar' })], 'Připomínka');
  };
  $('#bk').onclick = () => shareFiles([new File([JSON.stringify(db, null, 1)], `cestak-zaloha-${isoDate(new Date())}.json`, { type: 'application/json' })], 'Záloha Cesťáku');
  $('#rs').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!Array.isArray(d.trips)) throw new Error('neplatný soubor'); db = d; db.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings); db.templates ||= []; db.skipped ||= []; save(); toast('Obnoveno: ' + d.trips.length + ' cest'); render(); }
    catch (err) { toast('Chyba: ' + err.message); }
  };
}

/* ---------- start ---------- */
function maybePrompt() {
  const s = S(); if (!s.autoPrompt || editing) return;
  const now = new Date();
  if (!todayMissing()) return;
  if (now.getHours() * 60 + now.getMinutes() < (hm(s.remindTime) ?? 0)) return;
  const k = 'cestak.prompted', today = isoDate(now);
  try { if (sessionStorage.getItem(k) === today) return; sessionStorage.setItem(k, today); } catch (e) {}
  viewMonth = monthKey(now);
  openEdit(null);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { render(); maybePrompt(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
render();
maybePrompt();
