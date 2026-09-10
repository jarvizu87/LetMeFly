(() => {
  'use strict';

  const MODAL_ID = 'lmf-exercise-substitution-modal';
  let activeContext = null;

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('lmf-sub-modal-open');
    activeContext = null;
  }

  function bridge() {
    return window.LetMeFlyWorkoutSubstitutionBridge || null;
  }

  function watchLink(intelligence, rule) {
    if (!rule.alternativeExerciseId) return '';
    const alternative = intelligence.getExercise(rule.alternativeExerciseId);
    const url = alternative?.demo?.currentUrl;
    return url
      ? `<a class="lmf-sub-watch" href="${esc(url)}" target="_blank" rel="noopener noreferrer">WATCH ALTERNATIVE</a>`
      : '';
  }

  function loadPlanMarkup(preview) {
    if (!preview?.eligible || !preview.loadPlan) return '';
    const plan = preview.loadPlan;
    const unit = preview.currentUnit || 'lb';
    if (plan.mode === 'same') {
      return `<div class="lmf-sub-load-plan"><strong>LOAD PREFILL</strong><span>${preview.currentLoad == null ? 'No numeric load is currently prescribed.' : `${esc(preview.currentLoad)} ${esc(unit)} will stay prefilled.`}</span></div>`;
    }
    if (plan.mode === 'factor') {
      const factorPct = Math.round(Number(plan.factor || 0) * 100);
      return `<div class="lmf-sub-load-plan"><strong>LOAD PREFILL</strong><span>${preview.suggestedLoad == null ? `${factorPct}% of the current working load will be used when a numeric load exists.` : `${esc(preview.suggestedLoad)} ${esc(unit)} suggested from the governed ${factorPct}% conversion.`}</span></div>`;
    }
    if (plan.mode === 'none') {
      return `<div class="lmf-sub-load-plan"><strong>LOAD PREFILL</strong><span>No external load will be entered for this substitute.</span></div>`;
    }
    return `<div class="lmf-sub-load-plan is-manual"><strong>STARTING LOAD</strong><span>The rule does not provide a deterministic pound-for-pound conversion. Sets/reps stay programmed; choose an editable starting load.</span><div class="lmf-sub-manual-load"><input type="number" min="0" step="0.5" inputmode="decimal" data-lmf-sub-manual-load placeholder="${preview.currentLoad == null ? 'Optional' : `Current slot: ${esc(preview.currentLoad)}`}"><select data-lmf-sub-manual-unit><option value="lb" ${preview.currentUnit === 'kg' ? '' : 'selected'}>lb</option><option value="kg" ${preview.currentUnit === 'kg' ? 'selected' : ''}>kg</option></select></div></div>`;
  }

  function workoutAction(rule, context) {
    if (!context?.workoutExerciseId || !rule.alternativeExerciseId) return '';
    const api = bridge();
    if (!api?.preview || !api?.apply) return '';
    const preview = api.preview(context.workoutExerciseId, rule.alternativeExerciseId);
    if (!preview?.eligible) {
      return `<div class="lmf-sub-apply-state is-blocked">${esc(preview?.reason || 'This option cannot be applied to the active workout.')}</div>`;
    }
    if (String(preview.performedKey || '') === String(rule.alternativeExerciseId)) {
      return `<div class="lmf-sub-apply-state is-current">CURRENT SUBSTITUTE FOR TODAY</div>`;
    }
    return `${loadPlanMarkup(preview)}<button class="lmf-sub-use" type="button" data-lmf-use-substitute="${esc(rule.alternativeExerciseId)}">USE THIS SUBSTITUTE FOR TODAY</button>`;
  }

  function ruleCard(intelligence, rule, kind, context) {
    const blocked = kind === 'blocked';
    const candidate = kind === 'candidate';
    const label = blocked ? 'NOT A DEFAULT SUBSTITUTE' : candidate ? 'LIBRARY CANDIDATE' : rule.promotionStatus;
    const watch = !blocked && !candidate ? watchLink(intelligence, rule) : '';
    const action = !blocked && !candidate ? workoutAction(rule, context) : '';

    return `<article class="lmf-sub-rule ${blocked ? 'is-blocked' : ''} ${candidate ? 'is-candidate' : ''}" data-lmf-rule-alt="${esc(rule.alternativeExerciseId || '')}">
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
      ${action}
    </article>`;
  }

  function openModal(intelligence, exercise, rules, context = null) {
    closeModal();
    activeContext = context;

    const promotable = rules.filter((rule) =>
      rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT')
    );
    const blocked = rules.filter((rule) => String(rule.promotionStatus || '').startsWith('DO NOT'));
    const candidates = rules.filter((rule) => !rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT'));
    const workoutScoped = Boolean(context?.workoutExerciseId && bridge()?.apply);

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'lmf-sub-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
      <section class="lmf-sub-modal" role="dialog" aria-modal="true" aria-labelledby="lmf-sub-title">
        <button class="lmf-sub-close" type="button" data-lmf-sub-close aria-label="Close substitution guidance">×</button>
        <div class="lmf-sub-kicker">${workoutScoped ? 'ROLE-PRESERVING SUBSTITUTION • WORKOUT INSTANCE ONLY' : 'ROLE-PRESERVING SUBSTITUTION GUIDE • VIEW ONLY'}</div>
        <h2 id="lmf-sub-title">${esc(exercise.canonicalName)}</h2>
        <p class="lmf-sub-intro">A substitute must preserve the programmed job, not merely train a similar muscle. Review the differences before making an intentional coaching decision.</p>

        ${promotable.length ? `<section class="lmf-sub-section"><h3>AVAILABLE OPTIONS</h3>${promotable.map((rule) => ruleCard(intelligence, rule, 'promotable', context)).join('')}</section>` : `<div class="lmf-sub-empty">No current-app default option is approved for this movement.</div>`}
        ${blocked.length ? `<section class="lmf-sub-section lmf-sub-section-blocked"><h3>PROTECTED RELATIONSHIPS</h3>${blocked.map((rule) => ruleCard(intelligence, rule, 'blocked', context)).join('')}</section>` : ''}
        ${candidates.length ? `<section class="lmf-sub-section"><h3>FUTURE LIBRARY CANDIDATES</h3>${candidates.map((rule) => ruleCard(intelligence, rule, 'candidate', context)).join('')}</section>` : ''}

        <div class="lmf-sub-error" data-lmf-sub-error hidden></div>
        <div class="lmf-sub-safety"><strong>PROGRAM PRESCRIPTION LOCKED</strong><span>${workoutScoped ? 'Applying an option changes only this active workout instance. The programmed exercise, sets/reps, rest, grouping, progression, phase, and future workouts remain owned by the program. Load is changed only when the governed rule provides a deterministic conversion or you enter an explicit starting load.' : 'This screen is informational outside Workout Mode. It does not alter sets, reps, load, rest, progression, phase, program position, or athlete history.'}</span></div>
        <div class="lmf-sub-actions"><button class="lmf-sub-btn" type="button" data-lmf-sub-close>CLOSE</button></div>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add('lmf-sub-modal-open');
    overlay.querySelector('.lmf-sub-close')?.focus();
  }

  function showModalError(message) {
    const panel = document.querySelector('[data-lmf-sub-error]');
    if (!(panel instanceof HTMLElement)) return;
    panel.textContent = String(message || 'Substitution could not be applied.');
    panel.hidden = false;
  }

  document.addEventListener('click', async (event) => {
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

    const use = event.target.closest?.('[data-lmf-use-substitute]');
    if (use) {
      event.preventDefault();
      const api = bridge();
      const workoutExerciseId = activeContext?.workoutExerciseId;
      const alternativeExerciseKey = use.getAttribute('data-lmf-use-substitute');
      if (!api?.apply || !workoutExerciseId || !alternativeExerciseKey) return showModalError('Workout substitution bridge is unavailable.');
      const card = use.closest('.lmf-sub-rule');
      const manualInput = card?.querySelector('[data-lmf-sub-manual-load]');
      const manualUnit = card?.querySelector('[data-lmf-sub-manual-unit]');
      const manualRaw = manualInput instanceof HTMLInputElement ? manualInput.value.trim() : '';
      const manualLoadValue = manualRaw === '' ? null : Number(manualRaw);
      if (manualRaw !== '' && (!Number.isFinite(manualLoadValue) || manualLoadValue < 0)) return showModalError('Enter a valid starting load.');
      use.disabled = true;
      use.textContent = 'APPLYING…';
      try {
        await api.apply({
          workoutExerciseId,
          alternativeExerciseKey,
          manualLoadValue,
          manualLoadUnit: manualUnit instanceof HTMLSelectElement && manualUnit.value === 'kg' ? 'kg' : 'lb',
        });
        closeModal();
      } catch (error) {
        use.disabled = false;
        use.textContent = 'USE THIS SUBSTITUTE FOR TODAY';
        showModalError(error?.message || error);
      }
      return;
    }

    const revert = event.target.closest?.('[data-revert-substitution]');
    if (revert) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const api = bridge();
      const workoutExerciseId = revert.getAttribute('data-revert-substitution');
      if (!api?.revert || !workoutExerciseId) return;
      revert.disabled = true;
      try {
        await api.revert(workoutExerciseId);
      } catch (error) {
        revert.disabled = false;
        window.alert(String(error?.message || error || 'Substitution could not be reverted.'));
      }
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

    const workoutCard = button.closest('.exercise-card.active-exercise');
    const workoutExerciseId = button.getAttribute('data-workout-exercise-id') || workoutCard?.getAttribute('data-exercise-id') || null;
    const context = workoutExerciseId ? { workoutExerciseId } : null;

    event.preventDefault();
    event.stopImmediatePropagation();
    openModal(intelligence, exercise, rules, context);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById(MODAL_ID)) closeModal();
  });
})();
