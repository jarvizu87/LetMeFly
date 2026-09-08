(() => {
  'use strict';

  const DATA_URL = '/data/exercise-intelligence-v1.json';
  const READY_EVENT = 'letmefly:exercise-intelligence-ready';
  const ERROR_EVENT = 'letmefly:exercise-intelligence-error';
  const SUPPORTED_COUNTS = Object.freeze(['92/25', '94/27']);
  let payload = null;
  let loadPromise = null;

  const normalize = (value) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[’']/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const freezeArray = (value) => Object.freeze(Array.isArray(value) ? [...value] : []);

  function validate(data) {
    if (!data || data.integrationStatus !== 'READY_FOR_NON_PRESCRIPTION_APP_INTEGRATION') {
      throw new Error('Exercise Intelligence payload is not integration-ready');
    }
    const countKey = `${data?.counts?.exercises}/${data?.counts?.substitutionRules}`;
    if (!SUPPORTED_COUNTS.includes(countKey)) {
      throw new Error(`Exercise Intelligence payload count mismatch: ${countKey}`);
    }
    if (!Array.isArray(data.exercises) || !Array.isArray(data.substitutionRules)) {
      throw new Error('Exercise Intelligence payload shape mismatch');
    }
    if (data.exercises.length !== data.counts.exercises || data.substitutionRules.length !== data.counts.substitutionRules) {
      throw new Error('Exercise Intelligence declared/actual count mismatch');
    }
    return data;
  }

  function buildApi(data) {
    const byId = new Map();
    const byName = new Map();
    const byAlias = new Map();

    for (const exercise of data.exercises) {
      byId.set(exercise.id, exercise);
      byName.set(normalize(exercise.canonicalName), exercise);
      for (const alias of exercise.aliases || []) {
        byAlias.set(normalize(alias), exercise);
      }
    }

    const rulesByPrimary = new Map();
    for (const rule of data.substitutionRules) {
      const list = rulesByPrimary.get(rule.primaryExerciseId) || [];
      list.push(rule);
      rulesByPrimary.set(rule.primaryExerciseId, list);
    }

    const resolveExercise = (value) => {
      if (!value) return undefined;
      if (typeof value === 'object' && value.id) return byId.get(value.id);
      const raw = String(value);
      return byId.get(raw) || byName.get(normalize(raw)) || byAlias.get(normalize(raw));
    };

    const substitutionsFor = (value, options = {}) => {
      const exercise = resolveExercise(value);
      if (!exercise) return freezeArray([]);
      const includeBlocked = options.includeBlocked === true;
      const rules = rulesByPrimary.get(exercise.id) || [];
      return freezeArray(
        rules.filter((rule) =>
          includeBlocked ||
          (rule.alternativeInCurrentApp && !String(rule.promotionStatus || '').startsWith('DO NOT'))
        )
      );
    };

    return Object.freeze({
      version: data.schemaVersion,
      integrationStatus: data.integrationStatus,
      counts: Object.freeze({ ...data.counts }),
      getExercise: resolveExercise,
      getSubstitutions: substitutionsFor,
      getAllExercises: () => freezeArray(data.exercises),
      getAllSubstitutionRules: () => freezeArray(data.substitutionRules),
      programPrescriptionOwner: 'program-packages-only',
    });
  }

  async function load() {
    if (payload) return payload;
    if (loadPromise) return loadPromise;

    loadPromise = fetch(DATA_URL, { credentials: 'same-origin', cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(validate)
      .then((data) => {
        payload = buildApi(data);
        window.LetMeFlyExerciseIntelligence = payload;
        window.dispatchEvent(new CustomEvent(READY_EVENT, { detail: { counts: payload.counts } }));
        return payload;
      })
      .catch((error) => {
        loadPromise = null;
        console.warn('LetMeFly Exercise Intelligence unavailable:', error);
        window.dispatchEvent(new CustomEvent(ERROR_EVENT, { detail: { message: String(error?.message || error) } }));
        throw error;
      });

    return loadPromise;
  }

  window.LetMeFlyExerciseIntelligenceLoader = Object.freeze({
    load,
    get loaded() { return Boolean(payload); },
    dataUrl: DATA_URL,
  });

  // Public shell intelligence is safe to load eagerly. It remains read-only and
  // cannot change a program prescription by itself.
  load().catch(() => {});
})();
