(() => {
  'use strict'
  // Presentation-only bridge; never writes athlete/program data.
  // Native workout cards retain authority for every field and tool action.
  const media = matchMedia('(min-width: 1100px)')
  let timer = 0
  const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim()
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))
  const disabled = node => !node || node.disabled || node.getAttribute('aria-disabled') === 'true'
  const page = () => document.querySelector('#swipe-viewport > .swipe-page.active-page')
  const cards = () => [...(page()?.querySelectorAll('.exercise-stack > .active-exercise') || [])]
  const rows = card => [...(card?.querySelectorAll('.set-row[data-set-id]') || [])]
  const done = row => Boolean(row.querySelector('.set-check')?.classList.contains('done'))
  const complete = card => rows(card).length > 0 && rows(card).every(done)
  const current = () => cards().find(c => c.classList.contains('lmf-flow-active')) || cards().find(c => !complete(c)) || cards()[0]
  const currentRow = card => card?.querySelector('.set-row.lmf-set-active') || rows(card).find(r => !done(r)) || rows(card)[0]
  const tools = [
    ['watch','.exercise-actions [data-watch]'], ['info','[data-exercise-info]'], ['substitute','[data-substitute]'],
    ['coach','[data-action="go-coach"]'], ['loader','[data-lmf-bar-loader-open="exercise"]'], ['undo','[data-revert-substitution]'],
  ]
  function schedule() { clearTimeout(timer); timer = setTimeout(render, 35) }
  function render() {
    if (!media.matches) return
    const panel = document.querySelector('.lmf-desktop-context-panel')
    const body = panel?.querySelector('.lmf-desktop-context-body')
    if (!body) return
    panel.classList.add('lmf-desktop-context-panel-v2')
    const card = current(), row = currentRow(card), section = text(page()?.querySelector('.workout-panel-head h2')) || 'Workout'
    const actions = tools.map(([key,selector]) => ({key,node:card?.querySelector(selector)})).filter(a => a.node)
    const load = row?.querySelector('.load-input')?.value || '—'
    const kind = row?.dataset.prescriptionKind || 'reps'
    const target = row?.querySelector('.metric-input') || row?.querySelector('.reps-input')
    const dose = target?.value || '—'
    const doseLabel = kind === 'duration' ? 'Duration' : kind === 'distance' ? 'Distance' : 'Reps'
    const unit = kind === 'reps' ? '' : row?.dataset.metricUnit || ''
    const rpe = row?.querySelector('.rpe-input')?.value || '—'
    const name = text(card?.querySelector('.exercise-title h3'))
    const prescription = text(card?.querySelector('.lmf-compact-copy small')) || text(row?.querySelector('.set-target-cell'))
    const plate = text(row?.querySelector('.lmf-plates-line')) || text(row?.querySelector('.load-field small')) || 'Bar loading follows the active Load field.'
    const signature = JSON.stringify([card?.dataset.exerciseId,row?.dataset.setId,name,prescription,load,dose,rpe,plate,section,cards().map(complete),rows(card).map(done),actions.map(a=>[a.key,text(a.node),disabled(a.node)])])
    if (body.dataset.lmfDesktopV2Signature === signature && body.querySelector('[data-lmf-desktop-v2-content]')) return
    body.innerHTML = card ? `
      <div class="lmf-desktop-context-card" data-lmf-desktop-v2-content><small>Active Exercise</small><strong style="font-size:20px">${esc(name)}</strong><p>${esc(prescription)}</p></div>
      <div class="lmf-desktop-context-card"><small>Live Set</small><div class="lmf-desktop-live-set-grid">
        <div class="lmf-desktop-live-metric"><small>Load</small><strong data-lmf-desktop-v2-load>${esc(load)}${load === '—' ? '' : ' lb'}</strong></div>
        <div class="lmf-desktop-live-metric"><small>${esc(doseLabel)}</small><strong>${esc(dose)} ${esc(unit)}</strong></div>
        <div class="lmf-desktop-live-metric"><small>RPE</small><strong>${esc(rpe)}</strong></div></div>
        <div class="lmf-desktop-plate-readout">${esc(plate)}</div></div>
      <div class="lmf-desktop-context-card"><small>Exercise Tools</small><div class="lmf-desktop-v2-tools">${actions.map(a=>`<button type="button" class="lmf-desktop-v2-tool" data-lmf-desktop-v2-action="${a.key}" data-source-exercise="${esc(card.dataset.exerciseId)}"${disabled(a.node)?' disabled aria-disabled="true"':''}><span>${esc(text(a.node) || a.node.getAttribute('aria-label'))}</span><span aria-hidden="true">›</span></button>`).join('')}</div></div>
      <div class="lmf-desktop-context-card"><small>Section Progress</small><div class="lmf-desktop-v2-progress-row"><strong>${cards().filter(complete).length}/${cards().length}</strong><span>${rows(card).filter(done).length}/${rows(card).length} sets on current exercise<br>${esc(section)}</span></div></div>` : `
      <div class="lmf-desktop-context-card" data-lmf-desktop-v2-content><small>Current Section</small><strong style="font-size:20px">${esc(section)}</strong><p>Live loading, plates, and exercise tools appear when you enter an exercise block.</p></div>`
    body.dataset.lmfDesktopV2Signature = signature
  }
  document.addEventListener('click', event => {
    if (!media.matches || !(event.target instanceof Element)) return
    const forward = event.target.closest('[data-lmf-desktop-v2-action]')
    if (forward) {
      event.preventDefault(); event.stopPropagation()
      const card = current(), selector = tools.find(([key])=>key === forward.dataset.lmfDesktopV2Action)?.[1]
      const action = selector ? card?.querySelector(selector) : null
      if (!disabled(forward) && !disabled(action) && card?.dataset.exerciseId === forward.dataset.sourceExercise) action.click()
    }
    schedule()
  }, true)
  for (const type of ['input','change']) document.addEventListener(type, schedule, true)
  new MutationObserver(changes => {
    if (media.matches && changes.some(m => !(m.target instanceof Element && m.target.closest('.lmf-desktop-context-panel')))) schedule()
  }).observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['class','value','disabled','aria-disabled']})
  media.addEventListener('change', schedule)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule, {once:true})
  else schedule()
})()
