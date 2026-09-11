import { recapSession, previousComparable, mountainGeometry } from './workout-recap.mjs'

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const tons = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value)
const fmt = value => value === null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value)
const bridge = () => window.LetMeFlyWorkoutRecap
let generation = 0, dialog = null, returnFocus = null, scheduled = false, pendingHistorySession = null, archiveLoading = false

async function readSnapshot(athleteId) {
  const db = await new Promise((resolve, reject) => {
    const r = indexedDB.open('letmefly-private'); r.onupgradeneeded = () => r.transaction.abort()
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); r.onblocked = () => reject(new Error('Saved history is busy. Try again.'))
  })
  try {
    const stores = { preferences: 'athletePreferences', sessions: 'workoutSessions', exercises: 'workoutExercises', sets: 'workoutSets', outbox: 'syncOutbox' }
    return await new Promise((resolve,reject) => {
      const tx = db.transaction(Object.values(stores), 'readonly'), result = {}
      tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Saved history is unavailable'))
      for (const [key, name] of Object.entries(stores)) {
        const r = tx.objectStore(name).getAll()
        r.onsuccess = () => { result[key] = r.result.filter(row => !row.deleted_at && (key === 'outbox' ? row.athleteId : row.athlete_id) === athleteId) }
      }
    })
  } finally { db.close() }
}

function chart(recap, prior) {
  if (recap.volume === null) return '<p class="lmf-chart-subtitle">No loaded reps were recorded for a lifting peak. Time and distance stay separate below.</p>'
  const g = mountainGeometry(recap.volume, prior?.volume ?? null), rows = prior ? [{ label:'Previous', value:prior.volume, x:173, y:g.previousY, color:'#687781' }, { label:'This session', value:recap.volume, x:371, y:g.currentY, color:'#ff263e' }] : [{ label:'This session', value:recap.volume, x:272, y:g.currentY, color:'#ff263e' }]
  const peak = (r,i) => {
    const rise = g.baseline - r.y, b = prior ? 86 : 110, x = r.x, y = r.y
    const points = [[x-b,g.baseline],[x-b*.55,g.baseline-rise*.43],[x-b*.4,g.baseline-rise*.47],[x,y],[x+b*.28,y+rise*.30],[x+b*.40,y+rise*.35],[x+b,g.baseline]].map(p=>p.join(',')).join(' ')
    return `<defs><linearGradient id="recap-peak-${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${r.color}" stop-opacity=".9"/><stop offset="100%" stop-color="${r.color}" stop-opacity=".13"/></linearGradient></defs><polygon data-peak="${i}" data-value="${r.value}" data-summit-y="${y}" points="${points}" fill="url(#recap-peak-${i})" stroke="${r.color}"/><polygon points="${x},${y} ${x-b*.13},${y+rise*.17} ${x-b*.05},${y+rise*.13} ${x+b*.015},${y+rise*.2} ${x+b*.045},${y+rise*.11} ${x+b*.15},${y+rise*.16}" fill="#f7f8fa" opacity=".6"/><circle cx="${x}" cy="${y}" r="3" fill="#f7f8fa"/><text x="${x}" y="${y-13}" text-anchor="middle" class="lmf-value">${fmt(r.value)} ${recap.unit}</text><text x="${x}" y="232" text-anchor="middle" class="lmf-value">${r.label}</text>`
  }
  const delta = prior ? recap.volume - prior.volume : null
  return `<div class="lmf-panel-head"><h3>Your training peaks</h3>${prior ? `<span class="lmf-delta">${delta >= 0 ? '+' : ''}${fmt(delta)} ${recap.unit}${prior.volume > 0 ? ` · ${delta >= 0 ? '+' : ''}${fmt(delta / prior.volume * 100)}%` : ''}</span>` : ''}</div><p class="lmf-chart-subtitle">${prior ? 'Matching saved program, prescription and performed exercises.' : 'No previous matching session is available.'}</p><svg class="lmf-volume-chart" viewBox="0 0 520 266" role="img" aria-label="${esc(rows.map(r=>`${r.label}: ${fmt(r.value)} ${recap.unit}`).join('; '))}. Summit heights share a linear scale from zero."><desc>Mountain slopes are decorative, not measurements through the session.</desc><path d="M66 36V208H504" fill="none" stroke="#687781"/>${[0,.5,1].map(f => {const value = Math.max(...rows.map(r=>r.value)) * f, y = g.baseline - value/g.max*g.height;return `<line x1="66" x2="504" y1="${y}" y2="${y}" stroke="#28343b"/><text x="58" y="${y+4}" text-anchor="end">${fmt(value)}</text>`}).join('')}${rows.map(peak).join('')}<text x="278" y="258" text-anchor="middle">Saved sessions · lifting volume (${recap.unit})</text></svg><p class="lmf-chart-subtitle">Peak height shows load × completed reps. More volume is not automatically a better session.${prior ? ` Previous: ${esc(new Date(prior.session.completed_at).toLocaleDateString())}.` : ''}</p>`
}

function performed(row) {
  if (!row.completed) return row.status
  return [row.reps !== null ? `${fmt(row.reps)} reps` : null, row.distanceM !== null ? `${fmt(row.distanceM)} m` : null, row.durationSeconds !== null ? `${fmt(row.durationSeconds)} sec` : null,
    row.rawLoad !== null && row.rawLoad >= 0 ? `${fmt(row.rawLoad)} ${esc(row.loadUnit ?? 'unit unknown')}` : null,
    row.rpe !== null ? `RPE ${fmt(row.rpe)}` : null, row.rir !== null ? `RIR ${fmt(row.rir)}` : null].filter(Boolean).join(' · ') || 'Completed · measurement unavailable'
}

function markup(recap, prior, snapshot, context) {
  const c=recap.counts, completed = recap.session.status === 'completed'
  const ids = new Set([recap.sessionId, ...recap.exercises.map(e=>e.id), ...recap.exercises.flatMap(e=>e.rows.map(s=>s.id))])
  const pending = snapshot.outbox.filter(row => ids.has(row.entityId) && row.status !== 'synced').length
  const measured = recap.exercises.filter(e=> e.distanceM !== null || e.durationSeconds !== null)
  return `<div id="lmf-session-results-mountain" data-recap-session="${esc(recap.sessionId)}"><section class="lmf-screen"><header class="lmf-chrome"><div class="lmf-brand"><img src="/brand/letmefly-logo-display-512.png?v=9" alt="LetMeFly"><div><div class="lmf-wordmark">LETMEFLY</div><div class="lmf-brand-label">Workout recap</div></div></div><button type="button" class="btn ghost" data-recap-close aria-label="Close session recap">Close</button></header><div class="lmf-content"><div class="lmf-eyebrow">${completed ? 'Session saved' : 'Review & finish'}</div><h2>${completed ? 'WORKOUT COMPLETE' : 'YOUR RECORDED WORK'}</h2><p class="lmf-session-name">${esc(recap.session.workout_name)} · W${esc(recap.session.week_number)} · ${esc(recap.session.day_key)}<br>${esc(new Date(recap.session.started_at).toLocaleString())}</p><section class="lmf-tonnage"><img class="lmf-fenrir" src="/ui/fenrir.webp" alt=""><div class="lmf-program">${esc(String(recap.session.program_key).replace(/-/g,' ').toUpperCase())} · SESSION RECAP</div><div class="lmf-tonnage-label">Total weight lifted</div><div class="lmf-weight"><strong data-recap-volume>${fmt(recap.volume)}</strong><span>${recap.unit}</span></div><div class="lmf-tons">${recap.tonnage === null ? 'No usable loaded reps recorded' : `${tons(recap.tonnage)} ${recap.tonnageUnit} of logged lifting volume`}</div><div class="lmf-earned"><strong>${esc(recap.encouragement.title)}</strong><p>${esc(recap.encouragement.body)}</p></div></section><div class="lmf-session-stats"><div><strong>${c.completed} / ${c.planned ?? '—'}</strong><span>Sets logged${c.extra ? ` · ${c.extra} extra` : ''}</span></div><div><strong>${c.completedExercises} / ${c.exercises}</strong><span>Exercises completed</span></div><div><strong>${recap.elapsedSeconds === null ? '—' : `${fmt(Math.floor(recap.elapsedSeconds / 60))} min`}</strong><span>Elapsed time</span></div></div><p class="lmf-record-state">${c.unlogged} unlogged · ${c.optionalUnlogged} optional unlogged · ${c.skipped} explicitly skipped</p>${!completed && (c.unlogged || c.optionalUnlogged) ? '<p class="lmf-record-state">Review the breakdown or return to the workout to correct your saved sets before finishing. Unlogged work stays unlogged.</p>' : ''}<section class="lmf-panel">${chart(recap,prior)}</section><details data-recap-detail><summary>View workout breakdown · ${c.completed} logged ${c.completed === 1 ? 'set' : 'sets'}</summary><p class="lmf-chart-subtitle">Load is the saved value, counted once. Bodyweight is not invented; dumbbell and per-side wording does not add a multiplier. Carries, sled, timed and distance work are reported separately.</p>${recap.exercises.map(e=>`<article class="lmf-exercise"><div class="lmf-exercise-head"><strong>${esc(e.name)}</strong><span>${e.volumeKg === null ? '—' : fmt(recap.unit === 'kg' ? e.volumeKg : e.volumeKg / .45359237)} ${recap.unit}</span></div><p class="lmf-prescription">${esc(e.group)} · ${esc(e.priority)}${e.substituted ? ` · Programmed: ${esc(e.prescribedName)} · Performed: ${esc(e.name)}${e.prescription.substitution?.reason ? ` · ${esc(e.prescription.substitution.reason)}` : ''}` : ''}</p>${e.rows.map(s=>`<div class="lmf-set-detail" data-recap-set="${esc(s.id)}"><strong>Set ${esc(s.number)}${s.extra ? ' · extra' : ''} · ${esc(s.status)}</strong><span>Prescribed: ${esc(s.prescribed.join(' · ') || 'Unavailable')}</span><span>Performed: ${performed(s)}</span>${s.notes ? `<small>${esc(s.notes)}</small>` : ''}${!completed && !s.completed ? `<button type="button" class="btn ghost small" data-recap-correct="${esc(s.id)}">Review this set</button>` : ''}</div>`).join('')}</article>`).join('')}</details>${measured.length ? `<section class="lmf-mixed-work"><h3>Measured time & distance</h3><div class="lmf-work-grid">${measured.map(e=>`<div class="lmf-work"><div class="lmf-work-label">${esc(e.name)}</div><strong>${[e.distanceM !== null ? `${fmt(e.distanceM)} m` : null,e.durationSeconds !== null ? `${fmt(e.durationSeconds)} sec` : null].filter(Boolean).join(' · ')}</strong><small>${e.completedSets} logged sets · recorded loads in breakdown</small></div>`).join('')}</div></section>` : ''}${recap.warnings.length ? `<details><summary>Measurement notes · ${recap.warnings.length}</summary><ul>${recap.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}<footer class="lmf-footer"><span>Saved on this device. ${pending ? 'Cloud sync pending for this session.' : 'No pending cloud sync for this session.'}<br>Cloud: ${esc(context.cloudLabel || 'Status unavailable')}.<br>${completed && context.next ? `Next governed workout: ${esc(context.next)}` : completed ? 'Open Train to review your current governed program position.' : 'Completing the session uses the existing governed program flow.'}</span><strong>THE CROWN IS EARNED.</strong></footer><div class="lmf-recap-actions"><button type="button" class="btn ghost" data-recap-close>${completed ? 'Close recap' : 'Back to workout'}</button>${completed ? '<a class="btn primary" href="#/progress" data-recap-history>Open History</a>' : '<button type="button" class="btn primary" data-recap-finish>Finish workout</button>'}</div></div></section></div>`
}

function close() { generation++; dialog?.close(); dialog?.remove(); dialog=null; returnFocus?.focus?.() }
async function mountArchive(context, host) {
  if (archiveLoading || host.querySelector('#lmf-recap-archive')) return
  archiveLoading=true
  try {
    const snapshot=await readSnapshot(context.athleteId)
    if (!host.isConnected || location.hash!=='#/progress' || bridge()?.context()?.athleteId!==context.athleteId) return
    const sessions=snapshot.sessions.filter(s=>s.status==='completed').sort((a,b)=>String(b.completed_at??'').localeCompare(String(a.completed_at??'')))
    const archive=document.createElement('details');archive.id='lmf-recap-archive'
    archive.innerHTML=`<summary>All saved session recaps (${sessions.length})</summary><p>Every completed session stored on this device, including older workouts.</p><div class="lmf-recap-archive-list">${sessions.map(s=>`<button class="btn ghost" type="button" data-workout-recap="${esc(s.id)}"><strong>${esc(s.workout_name??'Completed workout')}</strong><span>${esc(String(s.completed_at??'').slice(0,10))} · ${esc(s.program_key)} · W${esc(s.week_number)} · ${esc(s.day_key)}</span></button>`).join('')||'<p>No completed sessions are saved yet.</p>'}</div>`
    host.append(archive)
  } catch(error) {console.warn('Older workout recaps unavailable',error)}
  finally {archiveLoading=false}
}
async function open(sessionId) {
  const context = bridge()?.context(); if (!context?.athleteId) return
  const token = ++generation; returnFocus = document.activeElement
  try {
    const snapshot = await readSnapshot(context.athleteId)
    if (token !== generation || bridge()?.context()?.athleteId !== context.athleteId) return
    const unit = snapshot.preferences[0]?.weight_unit === 'kg' ? 'kg' : 'lb'
    const recap = recapSession(snapshot, {athleteId:context.athleteId,sessionId,unit}), prior = previousComparable(snapshot,recap)
    dialog?.remove(); dialog=document.createElement('dialog'); dialog.className='lmf-recap-dialog'
    dialog.setAttribute('aria-label', recap.session.status === 'completed' ? 'Saved workout recap' : 'Review recorded workout')
    dialog.innerHTML=markup(recap,prior,snapshot,context);document.body.append(dialog);dialog.showModal()
    dialog.addEventListener('cancel',e=>{e.preventDefault();close()})
    dialog.addEventListener('click',e=>{
      const button=e.target.closest('button,a')
      if (button?.hasAttribute('data-recap-history')) pendingHistorySession=sessionId
      if (button?.matches('[data-recap-close],[data-recap-history]')) close()
      if (button?.hasAttribute('data-recap-correct')) { const set=button.dataset.recapCorrect;close();bridge()?.reviewSet(set) }
      if (button?.hasAttribute('data-recap-finish')) {close();bridge()?.finish(sessionId)}
    })
  } catch(error) { if(token===generation) { const host=document.querySelector('[data-recap-review]');if(host)host.textContent='Saved recap unavailable. Your native workout and completion controls remain available.';console.warn('Workout recap unavailable',error) } }
}

function refreshControls() {
  const context=bridge()?.context(); if(!context?.athleteId) return
  const historyHost=document.querySelector('#lmf-pg-native-tools .lmf-pg-native-tools-body')
  if (location.hash==='#/progress' && historyHost) void mountArchive(context,historyHost)
  if (pendingHistorySession && location.hash === '#/progress') {
    const history = document.querySelector(`[data-workout-recap="${CSS.escape(pendingHistorySession)}"]`), tools = history?.closest('details')
    if (tools) { tools.open=true;pendingHistorySession=null;requestAnimationFrame(()=>history.scrollIntoView({block:'center'})) }
  }
  const review=document.querySelector('.review-panel [data-action="complete-workout"]')?.closest('.review-panel')
  if(review && context.sessionId && !review.querySelector('[data-recap-review]')) {
    const button=document.createElement('button');button.type='button';button.className='btn ghost';button.dataset.recapReview=context.sessionId;button.textContent='REVIEW SAVED WORK & TONNAGE'
    review.querySelector('.btn-row')?.before(button)
  }
}
function schedule() {if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refreshControls()})}
document.addEventListener('click',e=>{const el=e.target.closest('[data-recap-review],[data-workout-recap]');if(el)void open(el.dataset.recapReview||el.dataset.workoutRecap)})
window.addEventListener('lmf:workout-completed',e=>void open(e.detail.sessionId))
window.addEventListener('hashchange',()=>{close();schedule()})
for(const name of ['lmf:athlete-changed','lmf:profile-v2-updated','lmf:exercise-art-context-changed'])window.addEventListener(name,()=>{close();schedule()})
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})
schedule()
