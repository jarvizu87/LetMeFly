(() => {
  'use strict';

  const MODAL_ID = 'lmf-exercise-intelligence-modal';

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const list = (items) => (Array.isArray(items) ? items : [])
    .map((item) => `<li>${esc(item)}</li>`)
    .join('');

  const chips = (items) => (Array.isArray(items) ? items : [])
    .map((item) => `<span class="lmf-intel-chip">${esc(item)}</span>`)
    .join('');

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('lmf-intel-modal-open');
  }

  function openModal(exercise) {
    closeModal();

    const overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.className = 'lmf-intel-overlay';
    overlay.setAttribute('role', 'presentation');

    const watchUrl = exercise?.demo?.currentUrl;
    const watchButton = watchUrl
      ? `<a class="lmf-intel-btn lmf-intel-btn-primary" href="${esc(watchUrl)}" target="_blank" rel="noopener noreferrer">WATCH EXERCISE</a>`
      : '';

    overlay.innerHTML = `
      <section class="lmf-intel-modal" role="dialog" aria-modal="true" aria-labelledby="lmf-intel-title">
        <button class="lmf-intel-close" type="button" data-lmf-intel-close aria-label="Close exercise info">×</button>
        <div class="lmf-intel-kicker">EXERCISE INTELLIGENCE</div>
        <h2 id="lmf-intel-title">${esc(exercise.canonicalName)}</h2>
        <p class="lmf-intel-purpose">${esc(exercise.purpose || 'Purpose information is not available.')}</p>
        <div class="lmf-intel-chips">${chips(exercise.movementRoles)}${chips(exercise.equipment)}</div>

        <div class="lmf-intel-grid lmf-intel-muscles">
          <div>
            <span class="lmf-intel-label">PRIMARY</span>
            <p>${esc((exercise.primaryMuscles || []).join(' • ') || '—')}</p>
          </div>
          <div>
            <span class="lmf-intel-label">SECONDARY / STABILIZERS</span>
            <p>${esc((exercise.secondaryMuscles || []).join(' • ') || '—')}</p>
          </div>
        </div>

        <div class="lmf-intel-grid lmf-intel-guidance">
          <div>
            <span class="lmf-intel-label">FOCUS ON</span>
            <ul>${list(exercise.coachingCues)}</ul>
          </div>
          <div>
            <span class="lmf-intel-label">AVOID</span>
            <ul>${list(exercise.commonMistakes)}</ul>
          </div>
        </div>

        <div class="lmf-intel-boundary">
          <strong>PROGRAM SAFETY</strong>
          <span>Exercise Intelligence explains the movement. Your active program still owns the exercise prescription, sets, reps, loading, rest, and progression.</span>
        </div>

        <div class="lmf-intel-actions">
          ${watchButton}
          <button class="lmf-intel-btn" type="button" data-lmf-intel-close>CLOSE</button>
        </div>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add('lmf-intel-modal-open');
    overlay.querySelector('.lmf-intel-close')?.focus();
  }

  document.addEventListener('click', (event) => {
    const close = event.target.closest?.('[data-lmf-intel-close]');
    if (close) {
      event.preventDefault();
      closeModal();
      return;
    }

    if (event.target === document.getElementById(MODAL_ID)) {
      closeModal();
      return;
    }

    const button = event.target.closest?.('[data-exercise-info]');
    if (!button) return;

    const api = window.LetMeFlyExerciseIntelligence;
    if (!api) return; // Preserve the existing LetMeFly INFO behavior if intelligence has not loaded.

    const exercise = api.getExercise(button.getAttribute('data-exercise-info'));
    if (!exercise) return;

    // The richer intelligence UI replaces the old INFO interaction only when a
    // canonical record is already loaded. It never touches Substitute or program state.
    event.preventDefault();
    event.stopImmediatePropagation();
    openModal(exercise);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById(MODAL_ID)) {
      closeModal();
    }
  });
})();
