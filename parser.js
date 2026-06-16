/**
 * parser.js
 * Parses the diet plan Markdown into a structured data model:
 * {
 *   weeks: [{
 *     id, title,
 *     batchCooking: [{ name, items[] }],  // dishes to cook + optional ingredients
 *     days: [{ name, meals: { COMIDA, CENA } }]
 *   }]
 * }
 */

const DAYS_ES = ['lunes','martes','miércoles','miercoles','jueves','viernes','sábado','sabado','domingo'];

function normalizeDay(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function parseDietMarkdown(markdownText) {
  const lines = markdownText.split('\n');
  const weeks = [];
  let currentWeek = null;
  let currentDay = null;
  let currentMealType = null;
  let currentItems = [];
  let inBatchSection = false;
  let currentBatchDish = null; // { name, items[] }

  function flushMeal() {
    if (currentDay && currentMealType) {
      currentDay.meals[currentMealType] = currentItems.length > 0 ? currentItems.slice() : null;
    }
    currentItems = [];
  }

  function flushDay() {
    flushMeal();
    currentMealType = null;
    if (currentDay && currentWeek) {
      currentWeek.days.push(currentDay);
    }
    currentDay = null;
  }

  function flushWeek() {
    flushDay();
    if (currentWeek) weeks.push(currentWeek);
    currentWeek = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // --- SEMANA X header ---
    const weekMatch = line.match(/^#\s+(SEMANA\s+\d+)/i);
    if (weekMatch) {
      flushWeek();
      currentWeek = {
        id: weeks.length + 1,
        title: weekMatch[1].toUpperCase(),
        batchCooking: [],
        days: []
      };
      inBatchSection = false;
      currentBatchDish = null;
      continue;
    }

    if (!currentWeek) continue;

    // --- Batch cooking section (### heading before any ## day) ---
    const h3Match = line.match(/^###\s+/);
    if (h3Match && currentWeek.days.length === 0) {
      inBatchSection = true;
      currentBatchDish = null;
      continue;
    }

    // --- Day header (## Lunes, ## Martes, etc.) ---
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      const dayNameRaw = h2Match[1].trim();
      const dayNorm = normalizeDay(dayNameRaw);
      const isDay = DAYS_ES.some(d => dayNorm.startsWith(d));
      if (isDay) {
        inBatchSection = false;
        currentBatchDish = null;
        flushDay();
        currentDay = { name: dayNameRaw, meals: { COMIDA: null, CENA: null } };
        continue;
      }
    }

    // --- Inside batch section: #### headings are dishes ---
    if (inBatchSection) {
      const h4Match = line.match(/^####\s+(.+)/);
      if (h4Match) {
        currentBatchDish = { name: h4Match[1].trim(), items: [] };
        currentWeek.batchCooking.push(currentBatchDish);
        continue;
      }
      if (line.startsWith('-') && !line.startsWith('---') && currentBatchDish) {
        currentBatchDish.items.push(line.replace(/^-\s*/, '').trim());
        continue;
      }
      // skip other lines in batch section (horizontal rules, blank lines)
      continue;
    }

    if (!currentDay) continue;

    // --- COMIDA / CENA detection ---
    // Strip bold markers then test the content
    const stripped = line.replace(/^\*+/, '').replace(/\*+$/, '').trim();
    const mealTypeMatch = stripped.match(/^(COMIDA|CENA)([\s\S]*)$/);
    if (mealTypeMatch) {
      const trailing = mealTypeMatch[2].trim();
      // Reject multi-word phrases like "COMIDA y CENA", "COMIDA principal"
      // Allow trailing emoji only (no Latin word characters)
      const isValidMealLine = trailing === '' || /^[^\p{L}]+$/u.test(trailing);
      if (isValidMealLine) {
        flushMeal();
        currentMealType = mealTypeMatch[1];
        if (trailing) {
          // Trailing content like 🎨 → free meal, keep null
          flushMeal();
          currentDay.meals[currentMealType] = null;
          currentMealType = null;
        }
        continue;
      }
    }

    // --- List items inside a meal ---
    if (currentMealType && line.startsWith('-')) {
      const item = line.replace(/^-\s*/, '').trim();
      if (item) currentItems.push(item);
      continue;
    }

    // --- Free-form / emoji lines inside a day (like 🎨) ---
    if (currentDay && line && !line.startsWith('#')) {
      // If we haven't hit a meal type yet for this day, treat as free content
      if (!currentMealType) {
        if (line.length > 0 && !line.startsWith('**')) {
          // store as special "free" content
          currentDay.freeContent = (currentDay.freeContent || '') + line + '\n';
        }
      } else {
        // Free-form text after a COMIDA/CENA header but before a list
        if (!line.startsWith('-') && line.length > 0) {
          currentItems.push(line.replace(/\*/g, ''));
        }
      }
    }
  }

  flushWeek();

  return { weeks };
}

export { parseDietMarkdown };
