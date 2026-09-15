(() => {
  'use strict';

  // Exercise Intelligence owns canonical exercise identity. Program-driven cards
  // can carry older display-name slugs, while approved private art is keyed by the
  // governed thumbnail canonicalKey. Keep every rendered Exercise Library and
  // Train art surface on that exact key. Presentation-only: no program/data writes.
  const READY_EVENT = 'letmefly:exercise-intelligence-ready';
  const CARD_SELECTOR = '.exercise-library [data-library-card], .train-shell .exercise-card[data-exercise-art]';
  let queued = false;

  const clean = (value) => String(value || '').trim();
  const intelligence = () => window.LetMeFlyExerciseIntelligence || null;

  function titleFor(card) {
    return clean(card?.querySelector?.('.exercise-title h3, h3')?.textContent);
  }

  function exerciseForCard(api, card) {
    const id = clean(card?.dataset?.lmfIntelId); // data-lmf-intel-id
    if (id) {
      const byId = api.getExercise?.(id);
      if (byId) return byId;
    }
    const name = titleFor(card);
    if (name) {
      const byName = api.getExercise?.(name);
      if (byName) return byName;
    }
    const currentKey = clean(card?.getAttribute?.('data-exercise-art'));
    return currentKey ? api.getExercise?.(currentKey) : null;
  }

  function artNodes(card) {
    const nodes = [];
    if (card.matches?.('[data-exercise-art]')) nodes.push(card);
    card.querySelectorAll?.('[data-exercise-art]').forEach((node) => nodes.push(node));
    return [...new Set(nodes)];
  }

  function syncCard(api, card) {
    const exercise = exerciseForCard(api, card);
    if (!exercise?.id) return false;
    const expected = clean(exercise?.thumbnail?.canonicalKey || exercise.id);
    if (!expected) return false;
    const nodes = artNodes(card);
    if (!nodes.length) return false;

    // Changing data-exercise-art intentionally wakes the private-art observer.
    // Updating every descendant matters in Train: Workout Flow copies the card key
    // into the main media and compact/next surfaces after the card first renders.
    for (const art of nodes) {
      if (art.getAttribute('data-exercise-art') !== expected) {
        art.setAttribute('data-exercise-art', expected);
      }
    }
    card.dataset.lmfCanonicalExerciseArt = expected;
    return true;
  }

  function syncAll() {
    queued = false;
    const api = intelligence();
    if (!api?.getExercise) return;
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => syncCard(api, card));
  }

  function queueSync() {
    if (queued) return;
    queued = true;
    queueMicrotask(syncAll);
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
    attributeFilter: ['data-lmf-intel-id', 'data-exercise-art'],
  });

  window.addEventListener('hashchange', queueSync);
  window.addEventListener('pageshow', queueSync);
  window.addEventListener(READY_EVENT, queueSync);
  queueSync();
})();
