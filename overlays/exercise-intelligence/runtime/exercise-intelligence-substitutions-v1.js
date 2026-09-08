(() => {
  'use strict';

  const MODAL_ID = 'lmf-exercise-substitution-modal';

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('lmf-sub-modal-open');
  }

  function watchLink(intelligence, rule) {
    if (!rule.alternativeExerciseId) return '';
    const alternative = intelligence.getExercise(rule.alternativeExerciseId);
    const url = alternative?.demo?.currentUrl;
    return url
      ? `<a class="lmf-sub-watch" href="${esc(url)}" target="_blank" rel="noopener noreferrer">WATCH ALTERNATIVE</a>`
      : '';
  }

  function ruleCard(intelligence, rule, kind) {
    const blocked = kind === 'blocked';
    const candidate = kind === 'candidate';
    const label = blocked ? 'NOT A DEFAULT SUBSTITUTE' : candidate ? 'LIBRARY CANDIDATE' : rule.promotionStatus;
    const watch = !blocked && !candidate ? watchLink(intelligence, rule) : '';

    return `<article class="lmf-sub-rule ${blocked ? 'is-blocked' : ''} ${candidate ? 'is-candidate' : ''}">
      <div class="lmf-sub-rule-head"><div><span>${esc(label)}</span><h3>${esc(rule.alternativeExercise)}</h3></div><b>FIT ${esc(rule.fitGrade)}</b></div>
      <p class="lmf-sub-explanation">${esc(rule.coachExplanation)}</p>
      <dl>
        <div><dt>ROLE</dt><dd>${esc(rule.primaryRole)} • ${esc(rule.rolePreserved)}</dd></div>
        <div><dt>DIFFERENCE</dt><dd>${esc(rule.importantDifference)}</dd></div>
        <div><dt>LOADING</dt><dd>${esc(rule.loadingAdjustment)}</dd></div>
        <div><dt>USE WHEN</dt><dd>${esc(rule.useCondition)}</dd></div>
      </dl>
      ${blocked ? `<div class="lmf-sub-blocked-note">This relationship changes the training purpose and requires an intentional coaching/program-edit decision.</div>` : ''}
      ${candidate ? `<div class="lmf-sub-candidate-note">This alternative is not a current canonical app exercise, so LetMeFly will not offer it as an in-app swap.</div>` : ''}
      ${watch}
    </article>`;
  }

  function openModal(intelligence, exercise, rules) {
    closeModal();

    const promotable = rules.filter((rule) =>
      rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT')
    );
    const blocked = rules.filter((rule) => String(rule.promotionStatus || '').startsWith('DO NOT'));
    const candidates = rules.filter((rule) => !rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT'));

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'lmf-sub-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
      <section class="lmf-sub-modal" role="dialog" aria-modal="true" aria-labelledby="lmf-sub-title">
        <button class="lmf-sub-close" type="button" data-lmf-sub-close aria-label="Close substitution guidance">×</button>
        <div class="lmf-sub-kicker">ROLE-PRESERVING SUBSTITUTION GUIDE • VIEW ONLY</div>
        <h2 id="lmf-sub-title">${esc(exercise.canonicalName)}</h2>
        <p class="lmf-sub-intro">A substitute must preserve the programmed job, not merely train a similar muscle. Review the differences before making an intentional coaching decision.</p>

        ${promotable.length ? `<section class="lmf-sub-section"><h3>AVAILABLE OPTIONS</h3>${promotable.map((rule) => ruleCard(intelligence, rule, 'promotable')).join('')}</section>` : `<div class="lmf-sub-empty">No current-app default option is approved for this movement.</div>`}
        ${blocked.length ? `<section class="lmf-sub-section lmf-sub-section-blocked"><h3>PROTECTED RELATIONSHIPS</h3>${blocked.map((rule) => ruleCard(intelligence, rule, 'blocked')).join('')}</section>` : ''}
        ${candidates.length ? `<section class="lmf-sub-section"><h3>FUTURE LIBRARY CANDIDATES</h3>${candidates.map((rule) => ruleCard(intelligence, rule, 'candidate')).join('')}</section>` : ''}

        <div class="lmf-sub-safety"><strong>PROGRAM PRESCRIPTION LOCKED</strong><span>This screen does not apply a substitution or alter sets, reps, load, rest, progression, phase, or program position. Any actual change still requires a governed program rule or an intentional coaching/program-edit decision.</span></div>
        <div class="lmf-sub-actions"><button class="lmf-sub-btn" type="button" data-lmf-sub-close>CLOSE</button></div>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add('lmf-sub-modal-open');
    overlay.querySelector('.lmf-sub-close')?.focus();
  }

  document.addEventListener('click', (event) => {
    const close = event.target.closest?.('[data-lmf-sub-close]');
    if (close) {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.target === document.getElementById(MODAL_ID)) {
      closeModal();
      return;
    }

    const button = event.target.closest?.('[data-substitute]');
    if (!button) return;
    const intelligence = window.LetMeFlyExerciseIntelligence;
    if (!intelligence) return;

    const exercise = intelligence.getExercise(button.getAttribute('data-substitute'))
      || intelligence.getExercise(button.getAttribute('data-name'));
    if (!exercise) return;

    const rules = intelligence.getSubstitutions(exercise.id, { includeBlocked: true });
    if (!rules.length) return; // Keep the existing LetMeFly substitution viewer as fallback.

    event.preventDefault();
    event.stopImmediatePropagation();
    openModal(intelligence, exercise, rules);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById(MODAL_ID)) closeModal();
  });
})();
