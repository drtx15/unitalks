/* ═══════════════════════════════════════════════════
   UNITALKS — shared.js
   Shared data factories, JSON storage, utilities
   ═══════════════════════════════════════════════════ */

'use strict';

// ── ID COUNTERS ──────────────────────────────────────
let _sId = 0, _vId = 0, _qId = 0;

function resetCounters() { _sId = 0; _vId = 0; _qId = 0; }

function syncCountersFromData(sections) {
  resetCounters();
  (sections || []).forEach(s => {
    if (s.id > _sId) _sId = s.id;
    (s.variations || []).forEach(v => {
      if (v.id > _vId) _vId = v.id;
      (v.questions || []).forEach(q => {
        if (q.id > _qId) _qId = q.id;
      });
    });
  });
}

// ── FACTORIES ────────────────────────────────────────
function makeSection(name = 'New Section', time = 5, type = 'qa', variations = null) {
  return {
    id: ++_sId,
    name,
    time,
    type,           // 'intro' | 'qa' | 'topic' | 'outro'
    collapsed: false,
    variations: variations || [makeVariation()]
  };
}

function makeVariation(label = 'Questions', questions = null) {
  return {
    id: ++_vId,
    label,
    collapsed: false,
    questions: questions || [makeQuestion()]
  };
}

function makeQuestion(text = '', tip = '') {
  return { id: ++_qId, text, tip };
}

// ── SCRIPT PAYLOAD ───────────────────────────────────
function buildPayload(guest, sections, { title = '', notes = '', id = null } = {}) {
  const totalQuestions = sections.reduce((a, s) =>
    a + s.variations.reduce((b, v) => b + v.questions.length, 0), 0);
  const totalTime = sections.reduce((a, s) => a + (parseInt(s.time) || 0), 0);

  return {
    id:      id || ('ut-' + Date.now()),
    title:   title || (guest.name + ' — UniTalks'),
    notes,
    version: 1,
    savedAt: new Date().toISOString(),
    guest:   deepClone(guest),
    sections: deepClone(sections),
    meta: {
      totalQuestions,
      totalTime,
      sectionCount: sections.length
    }
  };
}

// ── JSON FILE I/O ─────────────────────────────────────
// Download a script as a .json file
function downloadJSON(payload) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = sanitizeFilename(payload.title || 'script') + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Read a .json file from a File input or drop event
function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.name.endsWith('.json')) {
      return reject(new Error('Not a .json file'));
    }
    const reader = new FileReader();
    reader.onload  = e => {
      try { resolve(JSON.parse(e.target.result)); }
      catch { reject(new Error('Invalid JSON')); }
    };
    reader.onerror = () => reject(new Error('Read failed'));
    reader.readAsText(file);
  });
}

// ── MANIFEST (simulated directory of /jsons/) ─────────
// Since browsers can't read directories, we maintain a manifest
// stored in localStorage that mirrors what's "in" /jsons/.
// The editor writes the manifest when saving; the library reads it.
const MANIFEST_KEY = 'unitalks_manifest'; // list of { id, filename, title, savedAt, meta, guest }
const SCRIPTS_KEY  = 'unitalks_scripts';  // id → payload

function getManifest() {
  try { return JSON.parse(localStorage.getItem(MANIFEST_KEY) || '[]'); }
  catch { return []; }
}

function saveToManifest(payload) {
  const manifest = getManifest();
  const entry = {
    id:       payload.id,
    filename: sanitizeFilename(payload.title) + '.json',
    title:    payload.title,
    notes:    payload.notes,
    savedAt:  payload.savedAt,
    meta:     payload.meta,
    guest:    { name: payload.guest.name, role: payload.guest.role, achievements: payload.guest.achievements }
  };
  const existingIdx = manifest.findIndex(e => e.id === payload.id);
  if (existingIdx >= 0) manifest[existingIdx] = entry;
  else manifest.unshift(entry);
  localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
}

function saveScriptBody(payload) {
  const scripts = getScriptBodies();
  scripts[payload.id] = payload;
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
}

function getScriptBodies() {
  try { return JSON.parse(localStorage.getItem(SCRIPTS_KEY) || '{}'); }
  catch { return {}; }
}

function getScriptById(id) {
  return getScriptBodies()[id] || null;
}

function deleteScriptFromStorage(id) {
  const manifest = getManifest().filter(e => e.id !== id);
  localStorage.setItem(MANIFEST_KEY, JSON.stringify(manifest));
  const scripts = getScriptBodies();
  delete scripts[id];
  localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts));
}

// Full save: manifest entry + script body
function persistScript(payload) {
  saveToManifest(payload);
  saveScriptBody(payload);
}

// Import an externally-loaded JSON payload into storage
function importPayload(payload) {
  if (!payload.sections) throw new Error('Not a valid UniTalks script');
  if (!payload.id) payload.id = 'ut-' + Date.now();
  if (!payload.savedAt) payload.savedAt = new Date().toISOString();
  persistScript(payload);
  return payload;
}

// ── UTILS ─────────────────────────────────────────────
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function sanitizeFilename(str) {
  return String(str || 'script')
    .replace(/[^\w\s\u0400-\u04FF-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str || '')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('ru-RU', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function formatRuntime(minutes) {
  if (!minutes) return '0 min';
  if (minutes < 60) return minutes + ' min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function autoResizeAll() {
  document.querySelectorAll('textarea.editable-field, textarea.q-text-field, textarea.q-tip-field')
    .forEach(autoResize);
}

// ── TOAST ─────────────────────────────────────────────
function toast(msg, type = 'default') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.color = type === 'error' ? 'var(--red)' : type === 'warn' ? 'var(--orange)' : 'var(--green)';
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── MODAL ─────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
function handleOverlayClick(e, id) { if (e.target.id === id) closeModal(id); }

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// ── DROP ZONE HELPER ──────────────────────────────────
function setupDropZone(el, onFile) {
  if (!el) return;
  el.addEventListener('dragover',  e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', e => { el.classList.remove('drag-over'); });
  el.addEventListener('drop',      e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  });
}

// ── LIVE TIMER ────────────────────────────────────────
class LiveTimer {
  constructor(displayEl, widgetEl) {
    this.displayEl = displayEl;
    this.widgetEl  = widgetEl;
    this.seconds   = 0;
    this.running   = false;
    this._interval = null;
  }
  toggle() {
    if (this.running) this.stop(); else this.start();
  }
  start() {
    this.running = true;
    this.widgetEl?.classList.add('running');
    this._interval = setInterval(() => {
      this.seconds++;
      this._render();
    }, 1000);
  }
  stop() {
    this.running = false;
    this.widgetEl?.classList.remove('running');
    clearInterval(this._interval);
  }
  reset() {
    this.stop();
    this.seconds = 0;
    this._render();
  }
  _render() {
    const m = Math.floor(this.seconds / 60).toString().padStart(2, '0');
    const s = (this.seconds % 60).toString().padStart(2, '0');
    if (this.displayEl) this.displayEl.textContent = `${m}:${s}`;
  }
}

// ── DEFAULT SCRIPT DATA ───────────────────────────────
function buildDefaultSections() {
  return [
    makeSection('Интро', 2, 'intro', [
      makeVariation('Вариант A — Энергичный', [
        makeQuestion('Сегодня у нас гость, который начал строить свой проект ещё во время учёбы и уже успел добиться заметных результатов. Поговорим о пути, ошибках и реальном опыте запуска продукта.')
      ]),
      makeVariation('Вариант B — Загадочный', [
        makeQuestion('Что происходит, когда человек решает не ждать идеального момента, а начинает действовать? Сегодня узнаем историю создания проекта с нуля.')
      ]),
      makeVariation('Вариант C — Статистический', [
        makeQuestion('Большинство идей так и остаются идеями. Но некоторым удаётся превратить их в работающий продукт. Сегодня разберёмся, как это происходит на практике.')
      ]),
    ]),

    makeSection('О себе', 3, 'qa', [
      makeVariation('Основной вопрос', [
        makeQuestion('Расскажите немного о себе — чем вы занимаетесь и как пришли к текущей деятельности?')
      ]),
      makeVariation('Альтернативы', [
        makeQuestion('Как вы себя позиционируете — больше как специалист или как предприниматель?'),
        makeQuestion('Если описать себя тремя словами — какие это будут слова?'),
        makeQuestion('Каким вы были несколько лет назад и что изменилось?'),
      ])
    ]),

    makeSection('Путь в проект', 5, 'qa', [
      makeVariation('Основной вопрос', [
        makeQuestion('Как начался ваш путь в создании собственного проекта?')
      ]),
      makeVariation('Глубже в историю', [
        makeQuestion('Был ли конкретный момент, когда вы решили начать своё дело?'),
        makeQuestion('Были ли сомнения на старте и как вы с ними справлялись?'),
        makeQuestion('Как отреагировало ваше окружение на это решение?'),
      ])
    ]),

    makeSection('О проекте', 5, 'topic', [
      makeVariation('Основной', [
        makeQuestion('Расскажите о вашем проекте — какую проблему он решает и для кого предназначен?')
      ]),
      makeVariation('Структурирующие вопросы', [
        makeQuestion('Объясните идею максимально просто — в двух предложениях.'),
        makeQuestion('Есть ли уже пользователи или первые результаты?'),
        makeQuestion('Какая метрика или показатель сейчас для вас самый важный?'),
      ])
    ]),

    makeSection('Трудности и уроки', 10, 'topic', [
      makeVariation('Основной вопрос', [
        makeQuestion('С какими основными трудностями вы столкнулись при запуске?')
      ]),
      makeVariation('Конкретные углы', [
        makeQuestion('Был ли момент, когда хотелось всё остановить?'),
        makeQuestion('Как вы управляете временем и приоритетами?'),
        makeQuestion('Какая ошибка оказалась самой ценной по опыту?'),
        makeQuestion('Как вы находили первых клиентов или пользователей?'),
        makeQuestion('Что бы вы изменили, если бы начинали заново?'),
      ])
    ]),

    makeSection('Советы начинающим', 5, 'outro', [
      makeVariation('Финальный блок', [
        makeQuestion('Что бы вы посоветовали тем, кто только начинает?'),
        makeQuestion('Какие три шага стоит сделать в самом начале?'),
        makeQuestion('Какой популярный совет вы считаете переоценённым?'),
        makeQuestion('Где можно следить за развитием вашего проекта?'),
      ])
    ]),
  ];
}

function buildDefaultGuest() {
  return {
    name: 'Имя Фамилия',
    role: 'Founder · Product Builder',
    achievements: ['Project Creator', 'Startup Enthusiast', 'Community Member']
  };
}

