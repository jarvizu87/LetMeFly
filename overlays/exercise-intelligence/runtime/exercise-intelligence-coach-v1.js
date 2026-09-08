(() => {
  'use strict';

  const CONTEXT_KEY = 'letmefly:coach-exercise-context-v1';
  const SELECT_ID = 'lmf-coach-exercise-context';
  const CONTEXT_ID = 'lmf-coach-intelligence-context';
  const READY_EVENT = 'letmefly:exercise-intelligence-ready';

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const normalizeText = (value) => String(value || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const focusQuestion = (value) => /\b(focus|cue|cues|technique|form)\b|\b(this|my)\s+set\b|during\s+(this|the)\s+set/i.test(String(value || ''));

  function writeContext(name) {
    try {
      if (!name) {
        sessionStorage.removeItem(CONTEXT_KEY);
        return;
      }
      sessionStorage.setItem(CONTEXT_KEY, JSON.stringify({ name, updatedAt: Date.now() }));
    } catch (_) {
      // Transient context is optional; Coach Mode still works through explicit selection.
    }
  }

  function readContext() {
    try {
      const raw = sessionStorage.getItem(CONTEXT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.name === 'string' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function api() {
    return window.LetMeFlyExerciseIntelligence || null;
  }

  function findExerciseInQuestion(intelligence, question) {
    const normalizedQuestion = ` ${normalizeText(question)} `;
    if (!normalizedQuestion.trim()) return null;

    let best = null;
    let bestLength = 0;
    for (const exercise of intelligence.getAllExercises()) {
      const candidates = [exercise.canonicalName, ...(exercise.aliases || [])];
      for (const candidate of candidates) {
        const normalizedCandidate = normalizeText(candidate);
        if (!normalizedCandidate || normalizedCandidate.length <= bestLength) continue;
        if (normalizedQuestion.includes(` ${normalizedCandidate} `)) {
          best = exercise;
          bestLength = normalizedCandidate.length;
        }
      }
    }
    return best;
  }

  function selectedExercise(intelligence, question = '') {
    const named = findExerciseInQuestion(intelligence, question);
    if (named) return named;

    const select = document.getElementById(SELECT_ID);
    const selected = select?.value ? intelligence.getExercise(select.value) : null;
    if (selected) return selected;

    const remembered = readContext();
    return remembered?.name ? intelligence.getExercise(remembered.name) : null;
  }

  function renderSetFocus(exercise) {
    const answer = document.getElementById('coach-answer');
    if (!answer) return false;

    const cues = (exercise.coachingCues || []).slice(0, 3);
    const mistakes = (exercise.commonMistakes || []).slice(0, 2);
    const muscles = (exercise.primaryMuscles || []).slice(0, 3);

    answer.innerHTML = `
      <div class="page-kicker">COACH MODE • EXERCISE INTELLIGENCE</div>
      <h2>${esc(exercise.canonicalName)} — Set Focus</h2>
      <p>${esc(exercise.purpose || 'Preserve the intended movement and execute clean reps.')}</p>
      ${cues.length ? `<div class="lmf-coach-focus-block"><strong>FOCUS ON</strong><ul>${cues.map((cue) => `<li>${esc(cue)}</li>`).join('')}</ul></div>` : ''}
      ${mistakes.length ? `<div class="lmf-coach-focus-block lmf-coach-focus-avoid"><strong>AVOID</strong><ul>${mistakes.map((mistake) => `<li>${esc(mistake)}</li>`).join('')}</ul></div>` : ''}
      ${muscles.length ? `<p class="lmf-coach-focus-muscles"><strong>Primary:</strong> ${esc(muscles.join(' • '))}</p>` : ''}
      <div class="lmf-coach-prescription-lock"><strong>PROGRAM PRESCRIPTION LOCKED</strong><span>These cues coach execution only. Your active program still owns the exercise, sets, reps, load, rest, and progression.</span></div>`;
    return true;
  }

  function handleFocusQuestion(question) {
    if (!focusQuestion(question)) return false;
    const intelligence = api();
    if (!intelligence) return false;
    const exercise = selectedExercise(intelligence, question);
    if (!exercise) return false;

    writeContext(exercise.canonicalName);
    const select = document.getElementById(SELECT_ID);
    if (select) select.value = exercise.id;
    return renderSetFocus(exercise);
  }

  function ensureCoachContext() {
    const intelligence = api();
    const answer = document.getElementById('coach-answer');
    if (!intelligence || !answer || document.getElementById(CONTEXT_ID)) return;

    const chat = answer.closest('.coach-chat');
    if (!chat) return;
    const quickPrompts = chat.querySelector('.quick-prompts');
    if (!quickPrompts) return;

    const wrapper = document.createElement('div');
    wrapper.id = CONTEXT_ID;
    wrapper.className = 'lmf-coach-intel-context';

    const exercises = [...intelligence.getAllExercises()]
      .sort((a, b) => String(a.canonicalName).localeCompare(String(b.canonicalName)));
    const remembered = readContext();
    const rememberedExercise = remembered?.name ? intelligence.getExercise(remembered.name) : null;

    wrapper.innerHTML = `
      <div class="lmf-coach-intel-context-head">
        <div><span>SET COACHING CONTEXT</span><strong>${rememberedExercise ? esc(rememberedExercise.canonicalName) : 'Choose an exercise'}</strong></div>
        <button type="button" data-lmf-coach-clear-context ${rememberedExercise ? '' : 'disabled'}>CLEAR</button>
      </div>
      <label for="${SELECT_ID}">Exercise</label>
      <select id="${SELECT_ID}">
        <option value="">Choose an exercise for set-specific cues…</option>
        ${exercises.map((exercise) => `<option value="${esc(exercise.id)}"${rememberedExercise?.id === exercise.id ? ' selected' : ''}>${esc(exercise.canonicalName)}</option>`).join('')}
      </select>
      <small>Tap ASK COACH on a workout exercise to carry that movement here automatically, or choose one manually.</small>`;

    quickPrompts.parentNode.insertBefore(wrapper, quickPrompts);

    const select = wrapper.querySelector(`#${SELECT_ID}`);
    const clear = wrapper.querySelector('[data-lmf-coach-clear-context]');
    select?.addEventListener('change', () => {
      const exercise = select.value ? intelligence.getExercise(select.value) : null;
      writeContext(exercise?.canonicalName || '');
      const strong = wrapper.querySelector('.lmf-coach-intel-context-head strong');
      if (strong) strong.textContent = exercise?.canonicalName || 'Choose an exercise';
      if (clear) clear.disabled = !exercise;
    });
    clear?.addEventListener('click', () => {
      writeContext('');
      if (select) select.value = '';
      const strong = wrapper.querySelector('.lmf-coach-intel-context-head strong');
      if (strong) strong.textContent = 'Choose an exercise';
      clear.disabled = true;
    });
  }

  // Carry transient movement context when Coach is opened from a workout exercise.
  document.addEventListener('click', (event) => {
    const goCoach = event.target.closest?.('[data-action="go-coach"]');
    if (!goCoach) return;
    const card = goCoach.closest('.active-exercise, .exercise-card');
    const name = card?.querySelector('h3')?.textContent?.trim();
    if (name) writeContext(name);
  }, true);

  // Intercept only set-focus/cue questions when a canonical exercise is available.
  // All other Coach Mode questions continue through LetMeFly's existing program-aware handler.
  document.addEventListener('click', (event) => {
    const prompt = event.target.closest?.('[data-coach-prompt]');
    const ask = event.target.closest?.('[data-action="ask-coach"]');
    if (!prompt && !ask) return;

    const question = prompt?.getAttribute('data-coach-prompt') || document.getElementById('coach-question')?.value || '';
    if (!focusQuestion(question)) return;

    const textarea = document.getElementById('coach-question');
    if (prompt && textarea) textarea.value = question;
    if (!handleFocusQuestion(question)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.target?.id !== 'coach-question' || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    const question = event.target.value || '';
    if (!handleFocusQuestion(question)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const observer = new MutationObserver(() => ensureCoachContext());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => queueMicrotask(ensureCoachContext));
  window.addEventListener(READY_EVENT, () => ensureCoachContext());
  ensureCoachContext();
})();
