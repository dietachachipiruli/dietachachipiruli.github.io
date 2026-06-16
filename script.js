import { parseDietMarkdown } from './parser.js';

// ===== STATE =====
let dietData = null;
let currentWeekIdx = 0;
let filterMode = 'all'; // 'all' | 'pending'

const STORAGE_KEY = 'diet_app_v2';

function loadStorage() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
  catch { return {}; }
}
function saveStorage(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

// ===== STORAGE KEYS =====
function dayKey(weekIdx, dayName)          { return `day_w${weekIdx}_${dayName}`; }
function batchKey(weekIdx, dishIdx)        { return `batch_w${weekIdx}_${dishIdx}`; }
function noteKey(weekIdx, dayName)         { return `note_w${weekIdx}_${dayName}`; }

// ===== EMOJI LOOKUP =====
const EMOJI_RULES = [
  [/pizza/i, '🍕'],
  [/tortilla/i, '🍳'],
  [/revuelto/i, '🍳'],
  [/wok|tallarines/i, '🍜'],
  [/poke/i, '🍱'],
  [/hojaldre/i, '🥐'],
  [/empanada/i, '🥟'],
  [/hamburguesa/i, '🍔'],
  [/curry/i, '🍛'],
  [/bolognesa/i, '🍝'],
  [/pasta|gnoccis/i, '🍝'],
  [/crema\s+(de|de\s)/i, '🍲'],
  [/ensaladilla/i, '🥗'],
  [/ensalada/i, '🥗'],
  [/sándwich|sandwich/i, '🥪'],
  [/pita/i, '🫓'],
  [/pollo/i, '🍗'],
  [/pavo/i, '🦃'],
  [/ternera|filetes rusos/i, '🥩'],
  [/salmón|salmon/i, '🐟'],
  [/merluza|bacalao|palitos/i, '🐟'],
  [/gambas/i, '🦐'],
  [/gulas/i, '🦑'],
  [/atún|atun|caballa/i, '🐟'],
  [/lentejas/i, '🫘'],
  [/garbanzo/i, '🫘'],
  [/alubia|alubias/i, '🫘'],
  [/arroz/i, '🍚'],
  [/jamón|jamon/i, '🥓'],
  [/huevo/i, '🥚'],
  [/queso/i, '🧀'],
  [/aguacate/i, '🥑'],
  [/tomate/i, '🍅'],
  [/pimiento/i, '🫑'],
  [/calabacín|calabacin/i, '🥒'],
  [/setas|champiñones|hongos/i, '🍄'],
  [/zanahoria/i, '🥕'],
  [/patata/i, '🥔'],
  [/boniato/i, '🍠'],
  [/cebolla/i, '🧅'],
  [/ajo/i, '🧄'],
  [/quinoa/i, '🌾'],
  [/yogur|kéfir|kefir/i, '🥛'],
  [/arándanos|arandanos/i, '🫐'],
  [/frutos rojos/i, '🍓'],
  [/plátano|platano/i, '🍌'],
  [/mango/i, '🥭'],
  [/manzana/i, '🍎'],
  [/fruta/i, '🍎'],
  [/nueces|almendras|pistachos|anacardos/i, '🌰'],
  [/aceitunas/i, '🫒'],
];

function addEmoji(text) {
  for (const [re, emoji] of EMOJI_RULES) {
    if (re.test(text)) return emoji + ' ' + text;
  }
  return text;
}

// ===== HTML HELPERS =====
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderLabel(text) {
  // Bold the "Primero:", "Segundo:", "Plato principal:", "Postre:" prefix
  return text.replace(
    /^(\*{0,2})(Primero|Segundo|Postre|Plato principal|Postres?)(:?\*{0,2})\s*/i,
    (_, _a, label) => `<strong>${escHtml(label)}:</strong> `
  );
}

// Strip markdown bold markers from display text
function cleanText(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
}

// Render **bold** as <strong> with safe HTML escaping
function safeBold(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map(part => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return `<strong>${escHtml(part.slice(2, -2))}</strong>`;
    }
    return escHtml(part);
  }).join('');
}

// ===== PROGRESS =====
function getWeekProgress(weekIdx) {
  const store = loadStorage();
  const week = dietData.weeks[weekIdx];
  if (!week) return { done: 0, total: 0 };
  let done = 0, total = 0;
  week.days.forEach(day => {
    const hasMeals = day.meals.COMIDA || day.meals.CENA;
    const hasFree = day.freeContent && day.freeContent.trim();
    if (!hasMeals && !hasFree) return; // truly empty day
    total++;
    if (store[dayKey(weekIdx, day.name)]) done++;
  });
  return { done, total };
}

function isDayDone(weekIdx, dayName) {
  return !!loadStorage()[dayKey(weekIdx, dayName)];
}

// ===== RENDER BATCH COOKING =====
function renderBatchCooking(week, weekIdx) {
  if (!week.batchCooking || week.batchCooking.length === 0) return '';
  const store = loadStorage();

  const dishesHtml = week.batchCooking.map((dish, di) => {
    const key = batchKey(weekIdx, di);
    const checked = !!store[key];
    const hasIngredients = dish.items.length > 0;
    const dishText = addEmoji(cleanText(dish.name));

    const ingredientsHtml = hasIngredients ? `
      <ul class="batch-ingredients" id="batch-ing-${weekIdx}-${di}">
        ${dish.items.map(item => `<li>${safeBold(item)}</li>`).join('')}
      </ul>` : '';

    return `
      <div class="batch-dish${checked ? ' checked' : ''}" data-batch-key="${escHtml(key)}">
        <div class="batch-dish-row">
          <div class="batch-checkbox" aria-hidden="true"></div>
          <span class="batch-dish-name">${escHtml(dishText)}</span>
          ${hasIngredients ? `<button class="batch-expand-btn" data-target="batch-ing-${weekIdx}-${di}" aria-label="Ver ingredientes">▾</button>` : ''}
        </div>
        ${ingredientsHtml}
      </div>`;
  }).join('');

  return `
    <div class="batch-card" id="batch-card-${weekIdx}">
      <div class="batch-card-header" id="batch-toggle-${weekIdx}">
        <div class="batch-card-title">
          <span class="batch-icon">🥘</span>
          <span>Batch Cooking — ${escHtml(week.title)}</span>
        </div>
        <span class="chevron">▾</span>
      </div>
      <div class="batch-card-body open" id="batch-body-${weekIdx}">
        ${dishesHtml}
      </div>
    </div>`;
}

// ===== RENDER MEAL BLOCK (plain list, no item checkboxes) =====
function renderMealBlock(mealType, items) {
  const label = mealType === 'COMIDA' ? '🥗 Comida' : '🌙 Cena';
  const labelClass = mealType.toLowerCase();

  if (!items || items.length === 0) {
    return `
      <div class="meal-block">
        <div class="meal-header"><span class="meal-label ${labelClass}">${label}</span></div>
        <div class="free-block"><span>🎨</span><p>Comida libre</p></div>
      </div>`;
  }

  const itemsHtml = items.map(item => {
    const withEmoji = addEmoji(cleanText(item));
    return `<li class="meal-item-plain">${renderLabel(escHtml(withEmoji))}</li>`;
  }).join('');

  return `
    <div class="meal-block">
      <div class="meal-header"><span class="meal-label ${labelClass}">${label}</span></div>
      <ul class="meal-list">${itemsHtml}</ul>
    </div>`;
}

// ===== RENDER DAY CARD =====
function renderDayCard(weekIdx, day, isOpen) {
  const store = loadStorage();
  const done = isDayDone(weekIdx, day.name);
  const note = store[noteKey(weekIdx, day.name)] || '';
  const safeId = day.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '-');

  const comidaItems = day.meals.COMIDA;
  const cenaItems = day.meals.CENA;
  const hasFree = day.freeContent && day.freeContent.trim();
  const isEmpty = !comidaItems && !cenaItems && !hasFree;

  let bodyHtml = '';
  if (!isEmpty) {
    if (hasFree && !comidaItems && !cenaItems) {
      const text = day.freeContent.trim();
      bodyHtml = `<div class="free-block big"><span>🎨</span><p>Día libre</p></div>`;
    } else {
      bodyHtml += renderMealBlock('COMIDA', comidaItems);
      bodyHtml += renderMealBlock('CENA', cenaItems);
    }
  }

  return `
    <div class="day-card${isOpen ? ' open' : ''}${done ? ' done-day' : ''}"
         id="day-${weekIdx}-${escHtml(safeId)}">
      <div class="day-header" data-day-toggle="${weekIdx}-${escHtml(day.name)}">
        <div class="day-checkbox${done ? ' checked' : ''}"
             data-day-check="${weekIdx}-${escHtml(day.name)}"
             role="checkbox" aria-checked="${done}" tabindex="0"
             title="${done ? 'Marcar como pendiente' : 'Marcar día como hecho'}">
        </div>
        <span class="day-name${done ? ' done-text' : ''}">${escHtml(day.name)}</span>
        <span class="chevron">▾</span>
      </div>
      <div class="day-body">
        ${bodyHtml}
        <div class="note-section">
          <button class="note-toggle" data-note-day="${weekIdx}-${escHtml(day.name)}">
            📝 ${note ? 'Ver nota' : 'Añadir nota'}
          </button>
          ${note ? `<div class="existing-note">${escHtml(note)}</div>` : ''}
          <div class="note-area-wrap" id="note-wrap-${weekIdx}-${escHtml(day.name)}">
            <textarea class="note-textarea"
                      placeholder="Ej: cambiar pollo por tofu..."
                      rows="3">${escHtml(note)}</textarea>
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="note-save-btn"
                      data-note-key="${escHtml(noteKey(weekIdx, day.name))}"
                      data-week="${weekIdx}"
                      data-day="${escHtml(day.name)}">
                Guardar nota
              </button>
              <span class="note-saved-indicator" id="saved-${weekIdx}-${escHtml(day.name)}">✓ Guardado</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

// ===== RENDER WEEK =====
function renderWeek(weekIdx) {
  const week = dietData.weeks[weekIdx];
  if (!week) return '';

  const progress = getWeekProgress(weekIdx);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  let daysHtml = '';
  let visibleCount = 0;
  week.days.forEach((day, di) => {
    const done = isDayDone(weekIdx, day.name);
    const isOpen = di === 0;
    if (filterMode === 'pending' && done) {
      daysHtml += renderDayCard(weekIdx, day, false).replace('class="day-card', 'class="day-card hidden');
    } else {
      visibleCount++;
      daysHtml += renderDayCard(weekIdx, day, isOpen);
    }
  });

  const emptyHtml = visibleCount === 0 ? `
    <div class="empty-state">
      <div class="icon">🎉</div>
      <p>¡Todos los días de esta semana están completados!</p>
    </div>` : '';

  return `
    ${renderBatchCooking(week, weekIdx)}
    <div class="progress-bar-wrap">
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <span class="progress-label">${progress.done}/${progress.total} días</span>
    </div>
    ${daysHtml}
    ${emptyHtml}`;
}

// ===== RENDER WEEK TABS =====
function renderWeekTabs() {
  const container = document.getElementById('week-tabs');
  container.innerHTML = dietData.weeks.map((w, i) => {
    const p = getWeekProgress(i);
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
    return `<button class="week-tab${i === currentWeekIdx ? ' active' : ''}" data-week="${i}">
              ${escHtml(w.title)}<span class="badge">${pct}%</span>
            </button>`;
  }).join('');
}

// ===== FULL RENDER =====
function renderApp() {
  renderWeekTabs();
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <div class="filter-bar">
      <button class="filter-btn${filterMode === 'all' ? ' active' : ''}" data-filter="all">Todos los días</button>
      <button class="filter-btn${filterMode === 'pending' ? ' active' : ''}" data-filter="pending">Solo pendientes</button>
    </div>
    ${renderWeek(currentWeekIdx)}`;
  attachEvents();
}

// ===== REFRESH HELPERS =====
function refreshProgressBar() {
  const progress = getWeekProgress(currentWeekIdx);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const fill = document.querySelector('.progress-bar-fill');
  const label = document.querySelector('.progress-label');
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = `${progress.done}/${progress.total} días`;
}

function refreshWeekBadge(weekIdx) {
  const tab = document.querySelector(`.week-tab[data-week="${weekIdx}"]`);
  if (!tab) return;
  const p = getWeekProgress(weekIdx);
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  const badge = tab.querySelector('.badge');
  if (badge) badge.textContent = pct + '%';
}

function refreshDayCard(weekIdx, dayName) {
  const week = dietData.weeks[weekIdx];
  if (!week) return;
  const day = week.days.find(d => d.name === dayName);
  if (!day) return;
  const safeId = dayName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '-');
  const card = document.getElementById(`day-${weekIdx}-${safeId}`);
  if (!card) return;
  const wasOpen = card.classList.contains('open');
  const tmp = document.createElement('div');
  tmp.innerHTML = renderDayCard(weekIdx, day, wasOpen);
  card.replaceWith(tmp.firstElementChild);
  attachEvents();
}

// ===== EVENTS =====
function attachEvents() {
  // Week tabs
  document.querySelectorAll('.week-tab').forEach(btn => {
    btn.addEventListener('click', () => { currentWeekIdx = parseInt(btn.dataset.week); renderApp(); });
  });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => { filterMode = btn.dataset.filter; renderApp(); });
  });

  // Day accordion toggle (click on header but not on checkbox)
  document.querySelectorAll('[data-day-toggle]').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('[data-day-check]')) return;
      header.closest('.day-card').classList.toggle('open');
    });
  });

  // Day checkbox (mark whole day done)
  document.querySelectorAll('[data-day-check]').forEach(cb => {
    const toggle = (e) => {
      e.stopPropagation();
      const [wi, ...rest] = cb.dataset.dayCheck.split('-');
      const weekIdx = parseInt(wi);
      const dayName = rest.join('-');
      const store = loadStorage();
      const key = dayKey(weekIdx, dayName);
      const wasDone = !!store[key];
      if (wasDone) { delete store[key]; } else { store[key] = true; }
      saveStorage(store);
      refreshDayCard(weekIdx, dayName);
      refreshProgressBar();
      refreshWeekBadge(weekIdx);
      showToast(!wasDone ? `${dayName} completado ✓` : `${dayName} desmarcado`);
    };
    cb.addEventListener('click', toggle);
    cb.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(e); } });
  });

  // Batch cooking dish checkboxes
  document.querySelectorAll('.batch-dish').forEach(dish => {
    const row = dish.querySelector('.batch-dish-row');
    if (!row) return;
    const toggle = (e) => {
      if (e.target.closest('.batch-expand-btn')) return;
      const key = dish.dataset.batchKey;
      const store = loadStorage();
      if (store[key]) { delete store[key]; } else { store[key] = true; }
      saveStorage(store);
      dish.classList.toggle('checked', !!store[key]);
      dish.querySelector('.batch-checkbox').classList.toggle('checked', !!store[key]);
    };
    row.addEventListener('click', toggle);
  });

  // Batch cooking ingredient expand button
  document.querySelectorAll('.batch-expand-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      target.classList.toggle('open');
      btn.textContent = target.classList.contains('open') ? '▴' : '▾';
    });
  });

  // Batch card header toggle
  document.querySelectorAll('[id^="batch-toggle-"]').forEach(header => {
    header.addEventListener('click', () => {
      const id = header.id.replace('batch-toggle-', '');
      const body = document.getElementById(`batch-body-${id}`);
      if (!body) return;
      body.classList.toggle('open');
      header.querySelector('.chevron').style.transform =
        body.classList.contains('open') ? 'rotate(180deg)' : '';
    });
  });

  // Note toggle
  document.querySelectorAll('.note-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = document.getElementById(`note-wrap-${btn.dataset.noteDay}`);
      if (wrap) wrap.classList.toggle('open');
    });
  });

  // Note save
  document.querySelectorAll('.note-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nKey = btn.dataset.noteKey;
      const weekIdx = parseInt(btn.dataset.week);
      const dayName = btn.dataset.day;
      const textarea = btn.closest('.note-area-wrap').querySelector('.note-textarea');
      const val = textarea ? textarea.value.trim() : '';
      const store = loadStorage();
      if (val) { store[nKey] = val; } else { delete store[nKey]; }
      saveStorage(store);
      const ind = document.getElementById(`saved-${weekIdx}-${dayName}`);
      if (ind) { ind.classList.add('show'); setTimeout(() => ind.classList.remove('show'), 2000); }
      const toggle = document.querySelector(`[data-note-day="${weekIdx}-${dayName}"]`);
      if (toggle) toggle.textContent = val ? '📝 Ver nota' : '📝 Añadir nota';
    });
  });
}

// ===== TOAST =====
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2200);
}

// ===== SWIPE NAVIGATION =====
function initSwipe() {
  let startX = 0;
  document.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 60) return;
    if (dx < 0 && currentWeekIdx < dietData.weeks.length - 1) { currentWeekIdx++; renderApp(); showToast(`📅 ${dietData.weeks[currentWeekIdx].title}`); }
    else if (dx > 0 && currentWeekIdx > 0) { currentWeekIdx--; renderApp(); showToast(`📅 ${dietData.weeks[currentWeekIdx].title}`); }
  }, { passive: true });
}

// ===== RESET =====
function resetAll() {
  if (!confirm('¿Seguro que quieres borrar todo el progreso y notas?')) return;
  localStorage.removeItem(STORAGE_KEY);
  renderApp();
  showToast('Progreso borrado');
}

// ===== BOTTOM NAV =====
function getTodayDayName() {
  const DAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  return DAYS[new Date().getDay()];
}

function goToToday() {
  const todayNorm = getTodayDayName().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const week = dietData.weeks[currentWeekIdx];
  if (!week) return;
  const day = week.days.find(d =>
    d.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().startsWith(todayNorm)
  );
  if (!day) { showToast('Día no encontrado'); return; }
  const safeId = day.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s/g, '-');
  const card = document.getElementById(`day-${currentWeekIdx}-${safeId}`);
  if (card) { if (!card.classList.contains('open')) card.classList.add('open'); card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  showToast(`📅 ${day.name}`);
}

window.__dietPrevWeek = () => {
  if (currentWeekIdx > 0) { currentWeekIdx--; renderApp(); showToast(`📅 ${dietData.weeks[currentWeekIdx].title}`); }
  else showToast('Ya estás en la primera semana');
};
window.__dietNextWeek = () => {
  if (currentWeekIdx < dietData.weeks.length - 1) { currentWeekIdx++; renderApp(); showToast(`📅 ${dietData.weeks[currentWeekIdx].title}`); }
  else showToast('Ya estás en la última semana');
};
window.__dietGoToday = goToToday;

// ===== INIT =====
async function init() {
  const loading = document.getElementById('loading');
  const app = document.getElementById('app');
  try {
    const res = await fetch('./README.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = await res.text();
    dietData = parseDietMarkdown(md);
    if (!dietData.weeks.length) throw new Error('No se encontraron semanas en el Markdown');
    loading.style.display = 'none';
    app.style.display = '';
    renderApp();
    initSwipe();
    document.getElementById('btn-reset').addEventListener('click', resetAll);
  } catch (err) {
    loading.innerHTML = `
      <div style="font-size:2rem">⚠️</div>
      <p style="color:#c62828;font-size:.9rem;max-width:280px;text-align:center">
        No se pudo cargar el README.md.<br><small>${err.message}</small></p>`;
  }
}

document.addEventListener('DOMContentLoaded', init);

