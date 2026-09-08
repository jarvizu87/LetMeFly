(() => {
  'use strict';

  const CONTEXT_KEY = 'letmefly:coach-exercise-context-v1';
  const SELECT_ID = 'lmf-coach-exercise-context';

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

  const substitutionQuestion = (value) => /\b(substitute|substitution|swap|alternative|replace|replacement)\b/i.test(String(value || ''));

  function api() {
    return window.LetMeFlyExerciseIntelligence || null;
  }

  function readContext() {
    try {
      const raw = sessionStorage.getItem(CONTEXT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.name === 'string' ? parsed.name : null;
    } catch (_) {
      return null;
    }
  }

  function findExerciseInQuestion(intelligence, question) {
    const normalizedQuestion = ` ${normalizeText(question)} `;
    if (!normalizedQuestion.trim()) return null;

    let best = null;
    let bestLength = 0;
    for (const exercise of intelligence.getAllExercises()) {
      for (const candidate of [exercise.canonicalName, ...(exercise.aliases || [])]) {
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

  function selectedExercise(intelligence, question) {
    const named = findExerciseInQuestion(intelligence, question);
    if (named) return named;

    const select = document.getElementById(SELECT_ID);
    const selected = select?.value ? intelligence.getExercise(select.value) : null;
    if (selected) return selected;

    const remembered = readContext();
    return remembered ? intelligence.getExercise(remembered) : null;
  }

  function ruleRow(rule, kind) {
    const label = kind === 'blocked'
      ? 'DO NOT DEFAULT'
      : kind === 'candidate'
        ? 'LIBRARY CANDIDATE'
        : rule.promotionStatus;

    return `<article class="lmf-coach-sub-rule ${kind === 'blocked' ? 'is-blocked' : ''} ${kind === 'candidate' ? 'is-candidate' : ''}">
      <div class="lmf-coach-sub-rule-head"><div><span>${esc(label)}</span><strong>${esc(rule.alternativeExercise)}</strong></div><b>FIT ${esc(rule.fitGrade)}</b></div>
      <p>${esc(rule.coachExplanation)}</p>
      <dl>
        <div><dt>ROLE</dt><dd>${esc(rule.primaryRole)} • ${esc(rule.rolePreserved)}</dd></div>
        <div><dt>DIFFERENCE</dt><dd>${esc(rule.importantDifference)}</dd></div>
        <div><dt>LOADING</dt><dd>${esc(rule.loadingAdjustment)}</dd></div>
        <div><dt>USE WHEN</dt><dd>${esc(rule.useCondition)}</dd></div>
      </dl>
      ${kind === 'blocked' ? '<small>This changes the training purpose and is not an automatic replacement.</small>' : ''}
      ${kind === 'candidate' ? '<small>This alternative is not a canonical current-app exercise and cannot be offered as an in-app swap.</small>' : ''}
    </article>`;
  }

  function renderSubstitutionAnswer(exercise, rules) {
    const answer = document.getElementById('coach-answer');
    if (!answer) return false;

    const available = rules.filter((rule) =>
      rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT')
    );
    const blocked = rules.filter((rule) => String(rule.promotionStatus || '').startsWith('DO NOT'));
    const candidates = rules.filter((rule) =>
      !rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT')
    );

    answer.innerHTML = `
      <div class="page-kicker">COACH MODE • GOVERNED SUBSTITUTIONS • VIEW ONLY</div>
      <h2>${esc(exercise.canonicalName)} — Substitution Guidance</h2>
      <p>A replacement has to preserve the programmed job, not merely train a similar muscle.</p>
      ${available.length ? `<div class="lmf-coach-sub-section"><strong>AVAILABLE TO CONSIDER</strong>${available.map((rule) => ruleRow(rule, 'available')).join('')}</div>` : '<div class="lmf-coach-sub-empty">No current-app default option is approved for this movement.</div>'}
      ${blocked.length ? `<div class="lmf-coach-sub-section"><strong>PROTECTED RELATIONSHIPS</strong>${blocked.map((rule) => ruleRow(rule, 'blocked')).join('')}</div>` : ''}
      ${candidates.length ? `<div class="lmf-coach-sub-section"><strong>FUTURE LIBRARY CANDIDATES</strong>${candidates.map((rule) => ruleRow(rule, 'candidate')).join('')}</div>` : ''}
      <div class="lmf-coach-prescription-lock"><strong>PROGRAM PRESCRIPTION LOCKED</strong><span>This answer explains governed options only. It does not apply a swap or change the active workout. An actual change still requires a governed program rule or an intentional coaching/program-edit decision.</span></div>`;
    return true;
  }

  function handleSubstitutionQuestion(question) {
    if (!substitutionQuestion(question)) return false;
    const intelligence = api();
    if (!intelligence) return false;
    const exercise = selectedExercise(intelligence, question);
    if (!exercise) return false;

    const rules = intelligence.getSubstitutions(exercise.id, { includeBlocked: true });
    if (!rules.length) return false;
    return renderSubstitutionAnswer(exercise, rules);
  }

  document.addEventListener('click', (event) => {
    const prompt = event.target.closest?.('[data-coach-prompt]');
    const ask = event.target.closest?.('[data-action="ask-coach"]');
    if (!prompt && !ask) return;

    const question = prompt?.getAttribute('data-coach-prompt') || document.getElementById('coach-question')?.value || '';
    if (!substitutionQuestion(question)) return;

    const textarea = document.getElementById('coach-question');
    if (prompt && textarea) textarea.value = question;
    if (!handleSubstitutionQuestion(question)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.target?.id !== 'coach-question' || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    const question = event.target.value || '';
    if (!handleSubstitutionQuestion(question)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
})();
