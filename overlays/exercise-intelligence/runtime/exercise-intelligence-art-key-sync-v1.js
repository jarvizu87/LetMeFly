(() => {
  'use strict';

  // Exercise Intelligence owns the canonical exercise identity. Existing program-
  // driven library cards predate the full catalog and can carry older art slugs.
  // Private exercise art is keyed by the governed thumbnail canonicalKey, so keep
  // every resolved library card on that exact key. Presentation-only: no writes.
  const READY_EVENT = 'letmefly:exercise-intelligence-ready';
  let queued = false;

  const clean = (value) => String(value || '').trim();
  const intelligence = () => window.LetMeFlyExerciseIntelligence || null;

  function exerciseForCard(api, card) {
    const id = clean(card?.dataset?.lmfIntelId);
    if (id) {
      const byId = api.getExercise?.(id);
      if (byId) return byId;
    }
    const name = clean(card?.querySelector?.('h3')?.textContent);
    return name ? api.getExercise?.(name) : null;
  }

  function syncCard(api, card) {
    const exercise = exerciseForCard(api, card);
    if (!exercise?.id) return false;
    const expected = clean(exercise?.thumbnail?.canonicalKey || exercise.id);
    if (!expected) return false;
    const art = card.matches?.('[data-exercise-art]')
      ? card
      : card.querySelector?.('[data-exercise-art]');
    if (!art) return false;

    // Changing data-exercise-art intentionally wakes the existing private-art
    // MutationObserver, which clears any stale fallback and reloads the approved
    // private override for the canonical key when an authenticated athlete exists.
    if (art.getAttribute('data-exercise-art') !== expected) {
      art.setAttribute('data-exercise-art', expected);
    }
    card.dataset.lmfCanonicalExerciseArt = expected;
    return true;
  }

  function syncLibrary() {
    queued = false;
    const api = intelligence();
    if (!api?.getExercise) return;
    document.querySelectorAll('.exercise-library [data-library-card]').forEach((card) => syncCard(api, card));
  }

  function queueSync() {
    if (queued) return;
    queued = true;
    queueMicrotask(syncLibrary);
  }

  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' || record.addedNodes.length) {
        queueSync();
        return;
      }
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-lmf-intel-id'],
  });

  window.addEventListener('hashchange', queueSync);
  window.addEventListener(READY_EVENT, queueSync);
  queueSync();
})();
