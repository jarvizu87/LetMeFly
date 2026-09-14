(() => {
  'use strict';

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const SAFETY = /\b(severe pain|acute trauma|cannot bear weight|can't bear weight|major instability|significant swelling|neurolog(?:ic|ical)|numbness|new weakness|worsening symptoms?|hip pinching|anterior hip|knee pain|painful knee flexion)\b/i;
  const SPECIALIZATION = /\b(specialization|weak point|chest progress|glute progress|yoke progress|trap progress|arms progress)\b/i;
  const PROGRESS = /\b(how am i progressing|progressing|my progress|getting stronger|improving|progress check)\b/i;
  const TM = /\b(training max|training maxes|change (?:my )?tm|change (?:my )?training max|update (?:my )?tm|update (?:my )?training max|should we change .*max)\b/i;
  const READINESS = /\b(readiness|how recovered|recovery today|sleep.*today|energy.*today|soreness.*today|stress.*today|fatigue.*today|tired today)\b/i;
  const TIME = /\b(short on time|compressed session|only have \d+|running late|limited time)\b/i;
  const EQUIPMENT = /\b(equipment.*(?:unavailable|missing|dont have|don't have|not available)|(?:dont have|don't have|no) .*equipment)\b/i;
  const POOR = /\b(bad session|poor session|rough session|one bad day|one poor session|two declines|two bad sessions|performance dropped)\b/i;

  function questionFrom(control) {
    return control?.getAttribute?.('data-coach-prompt') || document.querySelector('#coach-question')?.value || '';
  }

  async function snapshot() {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('letmefly-private');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const names = ['athletes','programInstances','workoutSessions','workoutSets','trainingMaxHistory','readinessEntries'].filter(name => db.objectStoreNames.contains(name));
      const tx = db.transaction(names, 'readonly');
      const data = {};
      await Promise.all(names.map(name => new Promise((resolve, reject) => {
        const r = tx.objectStore(name).getAll();
        r.onsuccess = () => { data[name] = r.result; resolve(); };
        r.onerror = () => reject(r.error);
      })));
      const athlete = (data.athletes || []).find(row => !row.deleted_at) || null;
      const athleteId = athlete?.id || null;
      const own = rows => (rows || []).filter(row => !row.deleted_at && (!row.athlete_id || row.athlete_id === athleteId));
      return {
        athlete,
        program: own(data.programInstances).find(row => row.status === 'active') || null,
        sessions: own(data.workoutSessions),
        sets: own(data.workoutSets),
        tms: own(data.trainingMaxHistory),
        readiness: own(data.readinessEntries),
      };
    } finally { db.close(); }
  }

  function render(title, body, extra = '') {
    const host = document.querySelector('#coach-answer');
    if (!host) return false;
    host.innerHTML = `<div class="page-kicker">COACH MODE • ATHLETE-AWARE</div><h2>${esc(title)}</h2><p>${esc(body)}</p>${extra}`;
    return true;
  }

  const stamp = row => Date.parse(row?.completed_at ?? row?.started_at ?? row?.recorded_at ?? row?.effective_at ?? row?.created_at ?? '') || 0;
  const fmtDate = value => {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? new Date(t).toLocaleDateString() : 'unknown date';
  };

  async function progressAnswer() {
    const data = await snapshot();
    const completed = data.sessions.filter(row => row.status === 'completed').sort((a,b) => stamp(b)-stamp(a));
    const recent = completed.filter(row => Date.now() - stamp(row) <= 30*86400000);
    const recentIds = new Set(recent.map(row => row.id));
    const recentSets = data.sets.filter(row => recentIds.has(row.workout_session_id) && row.completed);
    const rated = recentSets.filter(row => Number.isFinite(Number(row.rpe)));
    const loaded = recentSets.filter(row => Number.isFinite(Number(row.load_value)) && Number.isFinite(Number(row.reps)));
    const volume = loaded.reduce((sum,row) => sum + Number(row.load_value)*Number(row.reps), 0);
    const latest = completed[0];
    const body = recent.length
      ? `You have ${recent.length} completed session${recent.length===1?'':'s'} in the last 30 days with ${recentSets.length} completed sets${loaded.length ? ` and ${Math.round(volume).toLocaleString()} logged load-reps` : ''}. ${rated.length ? `${rated.length} sets include RPE.` : 'RPE coverage is still limited.'} ${latest ? `Your latest completed session was ${latest.workout_name || 'Workout'} on ${fmtDate(latest.completed_at || latest.started_at)}.` : ''} Use same-lift, same-rep trends plus program completion before calling a strength change; volume alone is not proof of progress.`
      : `There are no completed sessions in the current 30-day history window yet. I can still coach today's program, but I do not have enough completed training evidence to claim a progress trend.`;
    return render('Progress check', body, '<div class="lmf-coach-prescription-lock"><strong>PROGRAM STAYS GOVERNED</strong><span>Progress evidence can justify a future coaching decision, but it does not silently rewrite today’s prescription.</span></div>');
  }

  async function tmAnswer() {
    const data = await snapshot();
    const latest = new Map();
    for (const row of [...data.tms].sort((a,b) => stamp(b)-stamp(a))) {
      const key = row.exercise_key || row.lift_key;
      if (key && !latest.has(key)) latest.set(key, row);
    }
    const rows = [...latest.entries()].slice(0,8);
    const current = rows.length ? rows.map(([key,row]) => `${key.replace(/[-_]/g,' ')} ${row.tm_value ?? row.value ?? '—'} ${row.tm_unit || row.unit || ''}`.trim()).join(' • ') : 'No current training-max records are available.';
    const program = data.program ? `${data.program.program_name || data.program.program_key} · Week ${data.program.current_week ?? '—'}` : 'No active program';
    return render('Training-max decision', `${current} ${program}. Do not change a TM because one set felt easy or one session felt hard. Update it only at the program’s calibration/testing gate or after an intentional coaching review supported by the required performance evidence.`, '<div class="lmf-coach-prescription-lock"><strong>TM GOVERNANCE</strong><span>Completing a block does not automatically earn an increase. Technique, bar speed, effort, recovery, and the program-specific gate control the decision.</span></div>');
  }

  async function readinessAnswer() {
    const data = await snapshot();
    const latest = [...data.readiness].sort((a,b) => stamp(b)-stamp(a))[0];
    if (!latest) return render('Readiness check', `No scored readiness check-in is saved yet. Use the Train readiness check before loading up; do not rewrite the whole workout from a guess.`);
    const parts = [['sleep_quality','sleep'],['energy','energy'],['soreness','soreness'],['stress','stress']]
      .filter(([key]) => Number.isFinite(Number(latest[key])))
      .map(([key,label]) => `${label} ${latest[key]}/5`);
    return render('Readiness check', `Latest saved check-in: ${parts.join(' • ') || 'scored details unavailable'}. Treat this as context, not a diagnosis. Stay inside the program’s readiness rules: protect mandatory primary work when safe, trim lower-priority work first, and do not turn one poor day into a program rewrite.`);
  }

  function situationalAnswer(kind) {
    if (kind === 'time') return render('Short-on-time decision', `Keep the highest-priority programmed work and full-quality primary sets. Remove optional and lower-priority accessories before compressing rest or changing the main prescription. Use the Coach review’s time check for the governed decision rule.`);
    if (kind === 'equipment') return render('Equipment decision', `Do not invent a same-muscle replacement. Use a governed substitute that preserves movement role, stimulus, phase, fatigue cost, and your available equipment. The substitution tool must keep the original prescription identifiable.`);
    if (kind === 'poor') return render('Performance review', `One poor session is not enough to rewrite the program. If comparable primary sessions decline repeatedly, review the saved evidence, readiness, technique, and fatigue channels before changing loading, volume, or the TM. Use the Coach evidence review rather than guessing from one day.`);
    if (kind === 'specialization') return render('Specialization review', `Judge the specialization target alongside stable primary performance. If the weak point is improving and primary work is stable, preserve what is working. If it is flat or declining, review the evidence and fatigue cost before changing volume. Do not add work automatically.`);
    return false;
  }

  async function handle(question) {
    if (!question.trim() || SAFETY.test(question)) return false;
    // Specific coaching domains must outrank broad wording. A question such as
    // “How is my specialization work progressing?” contains “progressing,” but
    // it is a specialization review first, not a generic progress summary.
    if (SPECIALIZATION.test(question)) return situationalAnswer('specialization');
    if (TM.test(question)) return tmAnswer();
    if (READINESS.test(question)) return readinessAnswer();
    if (TIME.test(question)) return situationalAnswer('time');
    if (EQUIPMENT.test(question)) return situationalAnswer('equipment');
    if (POOR.test(question)) return situationalAnswer('poor');
    if (PROGRESS.test(question)) return progressAnswer();
    return false;
  }

  const ROUTED_INTENTS = [SPECIALIZATION,TM,READINESS,TIME,EQUIPMENT,POOR,PROGRESS];

  window.addEventListener('click', (event) => {
    const control = event.target?.closest?.('.coach-shell [data-coach-prompt], .coach-shell [data-action="ask-coach"]');
    if (!control || control.disabled) return;
    const question = questionFrom(control);
    if (!ROUTED_INTENTS.some(pattern => pattern.test(question)) || SAFETY.test(question)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handle(question).catch(error => {
      console.warn('Coach athlete-aware intent unavailable', error);
      render('Coach context unavailable', 'Your private training data could not be read for this answer. Your program and saved workout data were not changed.');
    });
  }, true);

  window.addEventListener('keydown', (event) => {
    if (event.target?.id !== 'coach-question' || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing) return;
    const question = event.target.value || '';
    if (!ROUTED_INTENTS.some(pattern => pattern.test(question)) || SAFETY.test(question)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handle(question).catch(error => {
      console.warn('Coach athlete-aware intent unavailable', error);
      render('Coach context unavailable', 'Your private training data could not be read for this answer. Your program and saved workout data were not changed.');
    });
  }, true);
})();