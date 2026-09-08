(() => {
  'use strict';

  const READY_EVENT = 'letmefly:exercise-intelligence-ready';
  const CATALOG_ATTR = 'lmfIntelCatalog';
  const SUMMARY_ID = 'lmf-intel-catalog-summary';
  let activeFilter = 'all';
  let enhanceQueued = false;

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const clean = (value) => String(value || '').trim();
  const lower = (value) => clean(value).toLowerCase();

  function api() {
    return window.LetMeFlyExerciseIntelligence || null;
  }

  function filterTags(exercise) {
    const text = lower([
      exercise.canonicalName,
      exercise.trainingCategory,
      ...(exercise.movementRoles || []),
      ...(exercise.equipment || []),
      ...(exercise.primaryMuscles || []),
      ...(exercise.secondaryMuscles || []),
    ].join(' '));

    const tags = [];
    if (/barbell|bench press|front squat|back squat|deadlift|overhead press/.test(text)) tags.push('barbell');
    if (/kettlebell|\bkb\b/.test(text)) tags.push('kb');
    if (/sled/.test(text)) tags.push('sled');
    if (/carry|farmer|suitcase|waiter walk/.test(text)) tags.push('carry');
    if (/bodyweight|no equipment|push-up|pull-up|chin-up|dip|plank|lunge|step-up|calf raise/.test(text)) tags.push('bodyweight');
    if (/core|trunk|anti-rotation|anti extension|anti-extension|pallof|dead bug|ab wheel|hollow/.test(text)) tags.push('core');
    if (/machine|selectorized/.test(text)) tags.push('machine');
    if (/band|mini-band|loop band/.test(text)) tags.push('band');
    if (/clean|snatch|jerk|olympic|weightlifting/.test(text)) tags.push('olympic');
    return [...new Set(tags)];
  }

  function searchText(exercise) {
    return lower([
      exercise.canonicalName,
      ...(exercise.aliases || []),
      exercise.trainingCategory,
      ...(exercise.movementRoles || []),
      ...(exercise.equipment || []),
      ...(exercise.primaryMuscles || []),
      ...(exercise.secondaryMuscles || []),
      exercise.purpose,
    ].join(' '));
  }

  function demoLabel(exercise) {
    const status = exercise?.demo?.currentStatus || exercise?.demo?.status || '';
    if (status === 'direct-verified') return 'DIRECT DEMO VERIFIED';
    if (exercise?.demo?.candidateRequiresValidation) return 'SEARCH DEMO • DIRECT CANDIDATE HELD';
    return 'SEARCH DEMO';
  }

  function substitutionButton(intelligence, exercise) {
    const rules = intelligence.getSubstitutions(exercise, { includeBlocked: true });
    if (!rules.length) {
      return '<button class="btn small ghost lmf-intel-no-sub" type="button" disabled>NO GOVERNED SUBSTITUTE</button>';
    }
    return `<button class="btn small ghost" type="button" data-substitute="${esc(exercise.id)}" data-name="${esc(exercise.canonicalName)}">SUBSTITUTE (${rules.length})</button>`;
  }

  function renderAddedCard(intelligence, exercise, index) {
    const roles = (exercise.movementRoles || []).join(' • ') || 'Training movement';
    const equipment = (exercise.equipment || []).join(' • ') || 'Equipment varies';
    const tags = filterTags(exercise).join(' ');
    return `<article class="library-card lmf-intel-catalog-only" data-library-card data-lmf-intel-added="true" data-lmf-intel-id="${esc(exercise.id)}" data-search-name="${esc(searchText(exercise))}" data-filter-tags="${esc(tags)}">
      <div class="library-thumb" data-exercise-art="${esc(exercise.canonicalName)}"><span>${String(index + 1).padStart(2, '0')}</span><b>⚔</b></div>
      <div class="library-copy">
        <div class="exercise-eyebrow">${esc(exercise.trainingCategory || roles)} • ${esc(equipment)}</div>
        <h3>${esc(exercise.canonicalName)}</h3>
        <p>${esc(exercise.purpose || roles)}</p>
        <div class="lmf-intel-library-meta"><span>${esc(roles)}</span><span>${esc(demoLabel(exercise))}</span></div>
        <div class="btn-row">
          <button class="btn small ghost" type="button" data-lmf-intel-watch="${esc(exercise.id)}">WATCH</button>
          <button class="btn small ghost" type="button" data-exercise-info="${esc(exercise.canonicalName)}">INFO</button>
          ${substitutionButton(intelligence, exercise)}
        </div>
      </div><i>›</i>
    </article>`;
  }

  function ensureExtraFilters() {
    const chips = document.querySelector('.exercise-search-card .filter-chips');
    if (!chips) return;
    for (const [value, label] of [['machine', 'Machine'], ['band', 'Band'], ['olympic', 'Olympic']]) {
      if (chips.querySelector(`[data-exercise-filter="${value}"]`)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-exercise-filter', value);
      button.textContent = label;
      chips.appendChild(button);
    }
  }

  function enrichExistingCard(intelligence, card, seen) {
    const name = clean(card.querySelector('h3')?.textContent);
    if (!name) return;
    const exercise = intelligence.getExercise(name);
    if (!exercise) return;
    card.dataset.lmfIntelId = exercise.id;
    card.dataset.searchName = searchText(exercise);
    card.dataset.filterTags = filterTags(exercise).join(' ');
    seen.add(exercise.id);
  }

  function updatePageCopy(intelligence, addedCount, existingResolved) {
    const muted = document.querySelector('.page-head.cinematic-head .muted');
    if (muted) {
      muted.textContent = `${intelligence.counts.exercises} governed Exercise Intelligence records • ${intelligence.counts.substitutionRules} governed substitution rules • program packages remain prescription authority.`;
    }

    const resultLabel = document.querySelector('.exercise-results span');
    if (resultLabel) resultLabel.textContent = 'governed catalog movements';

    const noResults = document.getElementById('exercise-no-results');
    if (noResults) noResults.textContent = 'No governed exercises match this search and filter.';

    const searchCard = document.querySelector('.exercise-search-card');
    if (!searchCard) return;
    let summary = document.getElementById(SUMMARY_ID);
    if (!summary) {
      summary = document.createElement('div');
      summary.id = SUMMARY_ID;
      summary.className = 'lmf-intel-catalog-summary';
      searchCard.parentNode?.insertBefore(summary, searchCard);
    }
    summary.innerHTML = `<strong>FULL GOVERNED CATALOG</strong><span>${intelligence.counts.exercises} canonical exercises • ${existingResolved} already represented by program-driven cards • ${addedCount} catalog-only card${addedCount === 1 ? '' : 's'} added safely.</span>`;
  }

  function applyFilters() {
    const search = document.getElementById('exercise-search');
    const cards = [...document.querySelectorAll('[data-library-card]')];
    if (!search || !cards.length) return;
    const query = lower(search.value);
    let visible = 0;
    for (const card of cards) {
      const matchesText = !query || lower(card.dataset.searchName).includes(query);
      const tags = clean(card.dataset.filterTags).split(/\s+/).filter(Boolean);
      const matchesFilter = activeFilter === 'all' || tags.includes(activeFilter);
      card.hidden = !(matchesText && matchesFilter);
      if (!card.hidden) visible += 1;
    }
    const count = document.getElementById('exercise-result-count');
    if (count) count.textContent = String(visible);
    const empty = document.getElementById('exercise-no-results');
    if (empty) empty.hidden = visible !== 0;
  }

  function enhanceLibrary() {
    enhanceQueued = false;
    const intelligence = api();
    const library = document.querySelector('.exercise-library');
    const search = document.getElementById('exercise-search');
    if (!intelligence || !library || !search) return;

    const versionKey = `${intelligence.version}:${intelligence.counts.exercises}:${intelligence.counts.substitutionRules}`;
    if (library.dataset[CATALOG_ATTR] === versionKey) return;

    const seen = new Set();
    const existing = [...library.querySelectorAll('[data-library-card]')];
    existing.forEach((card) => enrichExistingCard(intelligence, card, seen));

    const all = [...intelligence.getAllExercises()].sort((a, b) =>
      String(a.canonicalName).localeCompare(String(b.canonicalName))
    );
    const missing = all.filter((exercise) => !seen.has(exercise.id));
    if (missing.length) {
      library.insertAdjacentHTML('beforeend', missing.map((exercise, index) =>
        renderAddedCard(intelligence, exercise, existing.length + index)
      ).join(''));
    }

    library.dataset[CATALOG_ATTR] = versionKey;
    ensureExtraFilters();
    updatePageCopy(intelligence, missing.length, seen.size);
    applyFilters();
  }

  function queueEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    queueMicrotask(enhanceLibrary);
  }

  document.addEventListener('input', (event) => {
    if (event.target?.id !== 'exercise-search') return;
    event.stopImmediatePropagation();
    applyFilters();
  }, true);

  document.addEventListener('click', (event) => {
    const filter = event.target.closest?.('[data-exercise-filter]');
    if (filter && filter.closest('.exercise-search-card')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      activeFilter = filter.getAttribute('data-exercise-filter') || 'all';
      document.querySelectorAll('[data-exercise-filter]').forEach((button) => {
        const active = button === filter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      applyFilters();
      return;
    }

    const watch = event.target.closest?.('[data-lmf-intel-watch]');
    if (!watch) return;
    const intelligence = api();
    const exercise = intelligence?.getExercise(watch.getAttribute('data-lmf-intel-watch'));
    const url = exercise?.demo?.currentUrl;
    if (!url) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  }, true);

  const observer = new MutationObserver(queueEnhance);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', queueEnhance);
  window.addEventListener(READY_EVENT, queueEnhance);
  queueEnhance();
})();
