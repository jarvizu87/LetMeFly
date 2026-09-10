(() => {
  'use strict';

  const MODAL_ID = 'lmf-exercise-substitution-modal';
  let activeContext = null;
  let activeExercise = null;
  let activeRules = [];

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
    activeExercise = null;
    activeRules = [];
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

  function formatEquipment(equipment) {
    const list = Array.isArray(equipment) ? equipment.filter(Boolean) : [];
    return list.length ? list.join(' / ') : 'No special equipment';
  }

  function equipmentMarkup(preview) {
    const state = preview?.equipment;
    if (!state) return '';
    const names = formatEquipment(state.equipment);
    if (state.status === 'available') {
      const label = state.source === 'today-only' ? 'Available today' : state.source === 'none-required' ? 'No special equipment needed' : 'Available from athlete profile';
      return `<div class="lmf-sub-equipment is-available"><strong>EQUIPMENT</strong><span>${esc(label)}${state.equipment?.length ? ` • ${esc(names)}` : ''}</span>${state.equipment?.length ? `<button type="button" class="lmf-sub-equipment-link" data-lmf-equipment-answer="unavailable" data-lmf-equipment-persist="false">NOT AVAILABLE TODAY</button>` : ''}</div>`;
    }
    if (state.status === 'unavailable') {
      return `<div class="lmf-sub-equipment is-unavailable"><strong>EQUIPMENT UNAVAILABLE</strong><span>${esc(names)}</span><small>This option is not offered until you confirm the setup is available.</small><div class="lmf-sub-equipment-actions"><button type="button" data-lmf-equipment-answer="available" data-lmf-equipment-persist="false">AVAILABLE TODAY</button><button type="button" data-lmf-equipment-answer="available" data-lmf-equipment-persist="true">AVAILABLE • SAVE TO PROFILE</button></div></div>`;
    }
    return `<div class="lmf-sub-equipment is-unknown"><strong>DO YOU HAVE THIS EQUIPMENT?</strong><span>${esc(names)}</span><small>LetMeFly does not know yet. Your answer can also fill this gap in your athlete profile.</small><div class="lmf-sub-equipment-actions"><button type="button" data-lmf-equipment-answer="available" data-lmf-equipment-persist="true">YES • SAVE TO PROFILE</button><button type="button" data-lmf-equipment-answer="available" data-lmf-equipment-persist="false">YES • TODAY ONLY</button><button type="button" data-lmf-equipment-answer="unavailable" data-lmf-equipment-persist="true">NO • SAVE TO PROFILE</button><button type="button" data-lmf-equipment-answer="unavailable" data-lmf-equipment-persist="false">NO • TODAY ONLY</button></div><div class="lmf-sub-equipment-unsure">Not sure? Leave this unanswered and choose another option.</div></div>`;
  }

  function loadPlanMarkup(preview) {
    if (!preview?.eligible || !preview.loadPlan) return '';
    const plan = preview.loadPlan;
    const unit = preview.currentUnit || 'lb';
    if (plan.mode === 'same') {
      return `<div class="lmf-sub-load-plan"><strong>LOAD PREFILL • SAME-LOAD</strong><span>${preview.currentLoad == null ? 'No numeric load is currently prescribed.' : `${esc(preview.currentLoad)} ${esc(unit)} will stay prefilled.`}</span><small>${esc(plan.explanation || '')}</small></div>`;
    }
    if (plan.mode === 'factor') {
      const factorPct = Math.round(Number(plan.factor || 0) * 100);
      return `<div class="lmf-sub-load-plan"><strong>LOAD PREFILL • GOVERNED CONVERSION</strong><span>${preview.suggestedLoad == null ? `${factorPct}% of the current working load will be used when a numeric load exists.` : `${esc(preview.suggestedLoad)} ${esc(unit)} suggested from the governed ${factorPct}% conversion.`}</span><small>${esc(plan.explanation || '')}</small></div>`;
    }
    if (plan.mode === 'none') {
      return `<div class="lmf-sub-load-plan"><strong>LOAD • DO NOT TRANSFER</strong><span>No pounds are copied to this substitute.</span><small>${esc(plan.explanation || '')}</small></div>`;
    }
    const label = plan.strategy === 'rep-guided' ? 'REP-GUIDED' : 'RPE-GUIDED';
    return `<div class="lmf-sub-load-plan is-manual"><strong>STARTING LOAD • ${esc(label)}</strong><span>No verified pound-for-pound conversion exists. Sets/reps and effort stay programmed; choose an editable starting load if this movement uses external resistance.</span><small>${esc(plan.explanation || '')}</small><div class="lmf-sub-manual-load"><input type="number" min="0" step="0.5" inputmode="decimal" data-lmf-sub-manual-load placeholder="${preview.currentLoad == null ? 'Optional' : `Program slot: ${esc(preview.currentLoad)}`}"><select data-lmf-sub-manual-unit><option value="lb" ${preview.currentUnit === 'kg' ? '' : 'selected'}>lb</option><option value="kg" ${preview.currentUnit === 'kg' ? 'selected' : ''}>kg</option></select></div></div>`;
  }

  function reasonMarkup() {
    return `<div class="lmf-sub-reason"><label><span>WHY ARE YOU SUBSTITUTING? <small>OPTIONAL</small></span><select data-lmf-sub-reason><option value="">No reason selected</option><option value="Equipment unavailable">Equipment unavailable</option><option value="Discomfort / possible strain">Discomfort / possible strain</option><option value="Fatigue">Fatigue</option><option value="Preference">Preference</option><option value="Travel / temporary setup">Travel / temporary setup</option><option value="Other">Other</option></select></label><input type="text" maxlength="120" data-lmf-sub-reason-detail placeholder="Optional note" hidden><div class="lmf-sub-discomfort" data-lmf-sub-discomfort hidden><strong>SAFETY CHECK</strong><span>A substitute can reduce or change the training stress, but it does not diagnose an injury or make pain medically safe. Stop if symptoms are sharp, worsening, or concerning and seek professional evaluation when appropriate.</span><label><input type="checkbox" data-lmf-sub-safety-ack> I understand and want to continue with a governed substitute.</label></div></div>`;
  }

  function historyPlaceholder(rule) {
    return rule.alternativeExerciseId
      ? `<div class="lmf-sub-history" data-lmf-sub-history="${esc(rule.alternativeExerciseId)}"><strong>LAST PERFORMANCE</strong><span>Checking your private workout history…</span></div>`
      : '';
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
      return `<div class="lmf-sub-apply-state is-current">CURRENT SUBSTITUTE FOR TODAY</div>${historyPlaceholder(rule)}`;
    }
    const equipment = equipmentMarkup(preview);
    if (preview.equipment?.status !== 'available') {
      return `${equipment}${historyPlaceholder(rule)}`;
    }
    return `${equipment}${loadPlanMarkup(preview)}${historyPlaceholder(rule)}${reasonMarkup()}<button class="lmf-sub-use" type="button" data-lmf-use-substitute="${esc(rule.alternativeExerciseId)}">USE THIS SUBSTITUTE FOR TODAY</button>`;
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

  function fitRank(rule) {
    const grade = String(rule.fitGrade || '').toUpperCase();
    return grade.startsWith('A') ? 0 : grade.startsWith('B') ? 1 : grade.startsWith('C') ? 2 : 3;
  }

  function optionRank(rule, context) {
    if (!context?.workoutExerciseId || !rule.alternativeExerciseId) return fitRank(rule) * 10;
    const preview = bridge()?.preview?.(context.workoutExerciseId, rule.alternativeExerciseId);
    const equipmentRank = preview?.equipment?.status === 'available' ? 0 : preview?.equipment?.status === 'unknown' ? 1 : 2;
    return equipmentRank * 100 + fitRank(rule) * 10;
  }

  function formatPreviousPerformance(previous) {
    if (!previous?.sets?.length) return 'No previous completed performance for this movement yet.';
    const parts = previous.sets.slice(0, 4).map((set) => {
      if (set.metricKind && set.metricValue != null) return `${set.metricValue}${set.metricUnit ? ` ${set.metricUnit}` : ''}`;
      const rep = set.reps != null ? `${set.reps} rep${Number(set.reps) === 1 ? '' : 's'}` : 'set';
      const load = set.loadValue != null ? ` @ ${set.loadValue} ${set.loadUnit || 'lb'}` : '';
      const effort = set.rpe != null ? ` • RPE ${set.rpe}` : set.rir != null ? ` • ${set.rir} RIR` : '';
      return `${rep}${load}${effort}`;
    });
    const date = previous.completedAt ? new Date(previous.completedAt).toLocaleDateString() : '';
    return `${date ? `${date} • ` : ''}${parts.join(' | ')}${previous.sets.length > 4 ? ` +${previous.sets.length - 4} more` : ''}`;
  }

  async function hydrateHistory() {
    const context = activeContext;
    const api = bridge();
    if (!context?.workoutExerciseId || !api?.previousPerformance) return;
    const panels = [...document.querySelectorAll('#' + MODAL_ID + ' [data-lmf-sub-history]')];
    await Promise.all(panels.map(async (panel) => {
      const alternativeExerciseKey = panel.getAttribute('data-lmf-sub-history');
      if (!alternativeExerciseKey) return;
      const span = panel.querySelector('span');
      try {
        const previous = await api.previousPerformance(context.workoutExerciseId, alternativeExerciseKey);
        if (span) span.textContent = formatPreviousPerformance(previous);
      } catch (_) {
        if (span) span.textContent = 'Previous performance unavailable right now.';
      }
    }));
  }

  function openModal(intelligence, exercise, rules, context = null) {
    closeModal();
    activeContext = context;
    activeExercise = exercise;
    activeRules = [...rules];

    const promotable = rules
      .filter((rule) => rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT'))
      .sort((a, b) => optionRank(a, context) - optionRank(b, context));
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
        <p class="lmf-sub-intro">A substitute must preserve the programmed job, not merely train a similar muscle. LetMeFly ranks stronger fits and known-available equipment first.</p>

        ${promotable.length ? `<section class="lmf-sub-section"><h3>AVAILABLE OPTIONS</h3>${promotable.map((rule) => ruleCard(intelligence, rule, 'promotable', context)).join('')}</section>` : `<div class="lmf-sub-empty">No current-app default option is approved for this movement.</div>`}
        ${blocked.length ? `<section class="lmf-sub-section lmf-sub-section-blocked"><h3>PROTECTED RELATIONSHIPS</h3>${blocked.map((rule) => ruleCard(intelligence, rule, 'blocked', context)).join('')}</section>` : ''}
        ${candidates.length ? `<section class="lmf-sub-section"><h3>FUTURE LIBRARY CANDIDATES</h3>${candidates.map((rule) => ruleCard(intelligence, rule, 'candidate', context)).join('')}</section>` : ''}

        <div class="lmf-sub-error" data-lmf-sub-error hidden></div>
        <div class="lmf-sub-safety"><strong>PROGRAM PRESCRIPTION LOCKED</strong><span>${workoutScoped ? 'Applying an option changes only this active workout instance. The programmed slot, dose, grouping, progression, phase, and future workouts remain owned by the program. Performed-exercise history and PR data stay attached to the movement you actually do.' : 'This screen is informational outside Workout Mode. It does not alter sets, reps, load, rest, progression, phase, program position, or athlete history.'}</span></div>
        <div class="lmf-sub-actions"><button class="lmf-sub-btn" type="button" data-lmf-sub-close>CLOSE</button></div>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add('lmf-sub-modal-open');
    overlay.querySelector('.lmf-sub-close')?.focus();
    void hydrateHistory();
  }

  function rerenderActiveModal() {
    const intelligence = window.LetMeFlyExerciseIntelligence;
    const exercise = activeExercise;
    const rules = [...activeRules];
    const context = activeContext ? { ...activeContext } : null;
    if (intelligence && exercise && rules.length) openModal(intelligence, exercise, rules, context);
  }

  function showModalError(message) {
    const panel = document.querySelector('[data-lmf-sub-error]');
    if (!(panel instanceof HTMLElement)) return;
    panel.textContent = String(message || 'Substitution could not be applied.');
    panel.hidden = false;
  }

  function updateReasonState(select) {
    const card = select.closest('.lmf-sub-rule');
    const detail = card?.querySelector('[data-lmf-sub-reason-detail]');
    const safety = card?.querySelector('[data-lmf-sub-discomfort]');
    const other = select.value === 'Other';
    const discomfort = select.value === 'Discomfort / possible strain';
    if (detail instanceof HTMLInputElement) detail.hidden = !other;
    if (safety instanceof HTMLElement) safety.hidden = !discomfort;
  }

  document.addEventListener('change', (event) => {
    const select = event.target.closest?.('[data-lmf-sub-reason]');
    if (select instanceof HTMLSelectElement) updateReasonState(select);
  });

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

    const equipmentAnswer = event.target.closest?.('[data-lmf-equipment-answer]');
    if (equipmentAnswer) {
      event.preventDefault();
      const api = bridge();
      const alternativeExerciseKey = equipmentAnswer.closest('.lmf-sub-rule')?.getAttribute('data-lmf-rule-alt');
      const availability = equipmentAnswer.getAttribute('data-lmf-equipment-answer');
      const persist = equipmentAnswer.getAttribute('data-lmf-equipment-persist') === 'true';
      if (!api?.setEquipmentAvailability || !alternativeExerciseKey || !['available', 'unavailable'].includes(availability)) return showModalError('Equipment preference could not be updated.');
      equipmentAnswer.disabled = true;
      try {
        await api.setEquipmentAvailability({ alternativeExerciseKey, availability, persist });
        rerenderActiveModal();
      } catch (error) {
        equipmentAnswer.disabled = false;
        showModalError(error?.message || error);
      }
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
      const reasonSelect = card?.querySelector('[data-lmf-sub-reason]');
      const reasonDetailInput = card?.querySelector('[data-lmf-sub-reason-detail]');
      const safetyAck = card?.querySelector('[data-lmf-sub-safety-ack]');
      const manualRaw = manualInput instanceof HTMLInputElement ? manualInput.value.trim() : '';
      const manualLoadValue = manualRaw === '' ? null : Number(manualRaw);
      if (manualRaw !== '' && (!Number.isFinite(manualLoadValue) || manualLoadValue < 0)) return showModalError('Enter a valid starting load.');
      const reason = reasonSelect instanceof HTMLSelectElement ? reasonSelect.value || null : null;
      const reasonDetail = reasonDetailInput instanceof HTMLInputElement && !reasonDetailInput.hidden ? reasonDetailInput.value.trim() || null : null;
      if (reason === 'Discomfort / possible strain' && !(safetyAck instanceof HTMLInputElement && safetyAck.checked)) {
        return showModalError('Review the discomfort safety note and confirm before continuing.');
      }
      use.disabled = true;
      use.textContent = 'APPLYING…';
      try {
        await api.apply({
          workoutExerciseId,
          alternativeExerciseKey,
          manualLoadValue,
          manualLoadUnit: manualUnit instanceof HTMLSelectElement && manualUnit.value === 'kg' ? 'kg' : 'lb',
          reason,
          reasonDetail,
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
    if (!rules.length) return;

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
