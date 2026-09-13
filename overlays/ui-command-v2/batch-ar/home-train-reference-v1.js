(() => {
  'use strict'
  // Layout and read-only mirrors of original controls. The original application
  // remains the only owner of workout logging, prescriptions and progression.
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const text = el => (el?.textContent || '').replace(/\s+/g,' ').trim()
  const setText = (el,value) => { if (el && el.textContent !== String(value)) el.textContent = String(value) }
  const setAttr = (el,key,value) => { if (el?.getAttribute(key) !== String(value)) el?.setAttribute(key,String(value)) }
  const icons = {
    sleep:'<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/>',
    energy:'<path d="m13 2-8 12h6l-1 8 9-13h-7z"/>',
    soreness:'<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 4 12 8 15 4-3 13-10 8-15Z"/>',
    stress:'<path d="M9 20c-5 1-7-5-4-7-4-3-1-7 2-7 0-5 5-5 5-1v15m3 0c5 1 7-5 4-7 4-3 1-7-2-7 0-5-5-5-5-1m-4 4 4 2m5-2-5 4"/>',
    strength:'<path d="M3 8v8m4-11v14m10-14v14m4-11v8M7 12h10"/>',
    calendar:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 2v6m8-6v6M4 11h16m-12 4 3 3 5-5"/>',
    trophy:'<path d="M7 3h10v7a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v6m-5 0h10"/>',
    body:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="8" r="2"/><path d="m7 18 2-6h6l2 6"/>',
    pulse:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    chart:'<path d="M4 20V12m6 8V8m6 12V4m6 16V1"/>',
    flag:'<path d="M5 22V2m0 1c6-4 8 4 15 0v10c-7 4-9-4-15 0"/>',
    crown:'<path d="m3 6 5 5 4-8 4 8 5-5-3 14H6Z"/>',
    chain:'<path d="m10 14 4-4m-6 6-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>',
    mountain:'<path d="m2 21 10-18 10 18Zm5-9 5 3 5-3"/>',
    cue:'<path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>',
  }
  const icon = key => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key] || icons.strength}</svg>`
  const metrics = [['sleep_quality','Sleep','sleep'],['energy','Energy','energy'],['soreness','Soreness','soreness'],['stress','Stress','stress']]
  const radioNames = {sleep_quality:'sleep-quality',energy:'energy',soreness:'soreness',stress:'stress'}
  let queued = false
  let cardAlignmentFrame = 0
  let timer = {seconds:120,remaining:120,until:0,interval:null,element:null}

  function ensure(parent,selector,tag,className,markup,position='beforeend') {
    let el = parent?.querySelector(selector)
    if (!el && parent) {
      el = document.createElement(tag)
      el.className = className
      el.innerHTML = markup
      parent.insertAdjacentElement(position,el)
    }
    return el
  }

  function home() {
    const shell = document.querySelector('body.lmf-home-ref3-active .lmf-home-command-v4')
    if (!shell) return
    shell.classList.add('lmf-home-reference-final')
    const hero = shell.querySelector('.lmf-home-option1-hero')
    if (!hero) return
    ensure(hero, '.lmf-reference-hero-motto','p','lmf-reference-hero-motto','Higher<br>Stronger<br>Further')
    ensure(shell.querySelector('.lmf-home-v4-command-main'),'.lmf-reference-command-shield','div','lmf-reference-command-shield',
      '<svg viewBox="0 0 110 148" fill="none" aria-hidden="true"><path d="m55 3 50 27v84l-50 31-50-31V30Z" fill="#12090d" stroke="#a8142d"/><path d="m55 9 44 25v76l-44 28-44-28V34Z" stroke="#ff1737"/><path d="m19 63 36-40 35 40-23-14-8 8-8-19-13 24 1-14Z" stroke="#ff2442" stroke-width="2"/><path d="M45 103h20" stroke="#ff1737" stroke-width="2"/></svg><span>Discipline<br>builds<br>freedom</span>')
    const motto = ensure(shell.querySelector('.lmf-home-v4-command-main'),'.lmf-reference-workout-motto','p','lmf-reference-workout-motto','Build strength. Build capacity. Build resilience.')
    const progress = shell.querySelector('.lmf-home-option1-progress')
    if (progress && motto.nextElementSibling !== progress) progress.before(motto)
    const readiness = shell.querySelector('.lmf-home-v4-readiness')
    const readinessHead = readiness?.querySelector('.lmf-home-v4-panel-head b')
    if (readinessHead) setAttr(readinessHead,'data-lmf-home-readiness-date','')
    ensure(readiness,'.lmf-reference-home-readiness','div','lmf-reference-home-readiness',metrics.map(([key,label,symbol]) => `<div>${icon(symbol)}<span>${label}</span><strong data-lmf-home-readiness="${key}">—</strong></div>`).join(''))
    ensure(shell.querySelector('.lmf-home-v4-performance'),'.lmf-reference-performance-metrics','div','lmf-reference-performance-metrics',
      [['volume','Rep volume','strength'],['top','Heaviest rep set','trophy'],['rpe','Avg RPE','pulse']].map(([key,label,symbol]) => `<div>${icon(symbol)}<span>${label}</span><strong data-lmf-home-performance="${key}">—</strong></div>`).join(''))
    const milestone = shell.querySelector('.lmf-home-v4-milestone')
    const sourceMilestone = document.querySelector('.dashboard-grid.lmf-home-source-v4 .milestone-card')
    const title = text(sourceMilestone?.querySelector('h2'))
    if (title) {
      const heading = ensure(milestone,'.lmf-reference-milestone-title','h3','lmf-reference-milestone-title','')
      const copy = milestone.querySelector('[data-lmf-milestone]')
      if (heading.nextElementSibling !== copy) copy?.before(heading)
      setText(heading,title)
      const road = ensure(milestone,'.lmf-reference-milestone-road','div','lmf-reference-milestone-road','<div><i></i><span data-road-current></span><small>Current</small></div><div><i></i><span data-road-target></span><small>Next milestone</small></div>')
      setText(road.querySelector('[data-road-current]'),text(shell.querySelector('[data-lmf-position]')))
      setText(road.querySelector('[data-road-target]'),title)
    }
    for (const [name,symbol] of [['readiness','pulse'],['performance','chart'],['milestone','flag'],['coach','stress']]) {
      const head = shell.querySelector(`.lmf-home-v4-${name} .lmf-home-v4-panel-head`)
      ensure(head, '.lmf-reference-card-icon','span','lmf-reference-card-icon',icon(symbol),'afterbegin')
    }
    const stats = shell.querySelector('.lmf-home-v4-stats')
    ensure(stats,'.lmf-reference-stats-title','h2','lmf-reference-stats-title',`${icon('chart')} Key metrics`,'afterbegin')
    ;['strength','calendar','trophy','body'].forEach((symbol,i) => ensure(stats?.querySelectorAll(':scope > div')[i],'.lmf-reference-stat-icon','span','lmf-reference-stat-icon',icon(symbol),'afterbegin'))
    ensure(shell,'.lmf-reference-home-footer','footer','lmf-reference-home-footer','<strong>LETME<span>FLY</span><small>Discipline builds freedom</small></strong><p>Discipline today.<br>Freedom tomorrow.</p>')
  }

  function panels(shell) { return [...shell.querySelectorAll('#swipe-viewport > .swipe-page')] }
  function nativeSection(shell,index) { return shell.querySelector(`#session-track [data-session-index="${index}"]`) }
  function openSection(shell,index,scroll=true) {
    nativeSection(shell,index)?.click()
    if (scroll) requestAnimationFrame(() => panels(shell)[index]?.scrollIntoView({behavior:'smooth',block:'start'}))
  }

  function alignCardSection(card) {
    cancelAnimationFrame(cardAlignmentFrame)
    cardAlignmentFrame = requestAnimationFrame(() => {
      cardAlignmentFrame = 0
      const viewport = card.closest('#swipe-viewport')
      const pane = card.closest('.swipe-page')
      if (!card.isConnected || !viewport || !pane || viewport.dataset.lmfSectionNavigation !== 'intent-v1') return
      // Focusing or revealing a low control can center that control horizontally
      // inside the native carousel. Keep the whole working section centered;
      // the native scroll listener still owns active-page and section state.
      const a = pane.getBoundingClientRect(), v = viewport.getBoundingClientRect()
      const drift = a.left + a.width / 2 - v.left - v.width / 2
      if (Math.abs(drift) > 1) viewport.scrollTo({left:viewport.scrollLeft + drift,behavior:'instant'})
    })
  }

  function trainHeader(shell) {
    const header = shell.querySelector('.train-header')
    const track = shell.querySelector('#session-track')
    if (!header || !track) return
    const list = panels(shell)
    const blocks = list.filter(panel => panel.querySelector('.exercise-stack'))
    const cards = blocks.flatMap(panel => [...panel.querySelectorAll('.exercise-stack > .exercise-card')])
    const rows = cards.flatMap(card => [...card.querySelectorAll('.set-row')])
    const done = cards.filter(card => {
      const rows = [...card.querySelectorAll('.set-row')]
      return rows.length && rows.every(row => row.querySelector('.set-check.done'))
    }).length
    const progress = cards.length ? Math.round(done / cards.length * 100) : 0
    const routeHead = ensure(shell,'.lmf-reference-train-heading','div','lmf-reference-train-heading','<div><h2>Train</h2><p></p></div><strong>LetMeFly<small>Discipline<br>builds freedom</small></strong>','afterbegin')
    setText(routeHead.querySelector('p'),text(header.querySelector('.page-kicker')))
    header.classList.add('lmf-reference-train-hero')
    ensure(header,'.lmf-reference-train-art','div','lmf-reference-train-art','<img src="/ui/train-lifter.webp" alt="" decoding="async">','afterbegin')
    const source = header.querySelector(':scope > div:not(.lmf-reference-train-art):not(.lmf-reference-train-resume)')
    ensure(source,'.lmf-reference-today','p','lmf-reference-today',"TODAY’S WORKOUT",'afterbegin')
    const meta = ensure(source,'.lmf-reference-train-meta','p','lmf-reference-train-meta','')
    setText(meta,`${blocks.length} blocks · ${cards.length} exercises`)
    const resume = ensure(header,'.lmf-reference-train-resume','div','lmf-reference-train-resume','<button type="button" data-reference-resume></button><div><span data-reference-exercise-progress></span><small data-reference-workout-percent></small></div><progress aria-label="Exercise completion" max="100" value="0"></progress>')
    setText(resume.querySelector('button'),rows.length ? '▶ Resume Workout' : '▶ Start Workout')
    setText(resume.querySelector('[data-reference-exercise-progress]'),`${done} / ${cards.length} exercises`)
    setText(resume.querySelector('[data-reference-workout-percent]'),`${progress}%`)
    setAttr(resume.querySelector('progress'),'value',progress)
    let readiness = shell.querySelector('.lmf-reference-train-readiness')
    if (!readiness) {
      readiness = document.createElement('section')
      readiness.className = 'lmf-reference-train-readiness'
      readiness.setAttribute('aria-label','Workout readiness')
      readiness.innerHTML = metrics.map(([key,label,symbol]) => `<button type="button" data-reference-readiness="${key}">${icon(symbol)}<span>${label}<strong data-reference-readiness-value>—</strong><small data-reference-readiness-state>Check in</small></span><i aria-hidden="true">›</i></button>`).join('')
      header.after(readiness)
    }
    metrics.forEach(([key]) => {
      const selected = shell.querySelector(`input[name="readiness-${radioNames[key]}"]:checked`)
      const tile = readiness.querySelector(`[data-reference-readiness="${key}"]`)
      setText(tile.querySelector('[data-reference-readiness-value]'),selected ? `${selected.value}/5` : '—')
      setText(tile.querySelector('[data-reference-readiness-state]'),selected ? rows.length ? 'Logged' : 'Selected' : 'Check in')
    })
    let flow = shell.querySelector('.lmf-reference-flow-heading')
    if (!flow) {
      flow = document.createElement('div')
      flow.className = 'lmf-reference-flow-heading'
      flow.innerHTML = '<h2>Workout Flow</h2><span></span>'
      track.before(flow)
    }
    setText(flow.querySelector('span'),text(shell.querySelector('#session-position')))
    list.forEach((panel,index) => {
      const button = nativeSection(shell,index)
      if (!button) return
      const sets = [...panel.querySelectorAll('.set-row')]
      const complete = index === 0 ? rows.length > 0 : sets.length > 0 && sets.every(row => row.querySelector('.set-check.done'))
      setAttr(button,'data-reference-complete',complete)
      const state = ensure(button,'.lmf-reference-flow-state','i','lmf-reference-flow-state','')
      state.setAttribute('aria-hidden','true')
      setText(state,complete ? '✓' : '')
    })
    // The native readiness rule and day selector stay available without pushing
    // the actual workout flow away from its heading.
    const days = shell.querySelector('.day-strip')
    if (days && readiness.previousElementSibling !== days) readiness.before(days)
  }

  function summary(card) {
    const rows = [...card.querySelectorAll('.set-table .set-row')]
    if (!rows.length) return
    const table = ensure(card, '.lmf-reference-set-history','div','lmf-reference-set-history','')
    const values = rows.map(row => {
      const completed = Boolean(row.querySelector('.set-check.done'))
      const unit = row.dataset.loadUnit || ''
      const load = row.querySelector('.load-input')?.value
      const metric = row.querySelector('.metric-input') || row.querySelector('.reps-input')
      const metricLabel = row.dataset.prescriptionKind === 'reps' ? 'reps' : row.dataset.metricUnit || ''
      return {id:row.dataset.setId,kind:row.dataset.prescriptionKind,number:text(row.querySelector('.set-label strong')),load:load ? `${load} ${unit}`.trim() : '—',amount:metric?.value ? `${metric.value}${metricLabel === 'reps' ? '' : ` ${metricLabel}`}` : '—',rpe:row.querySelector('.rpe-input')?.value || '—',completed,selected:row.classList.contains('lmf-set-active')}
    })
    const signature = JSON.stringify(values)
    if (table.dataset.signature !== signature) {
      table.dataset.signature = signature
      table.innerHTML = `<div class="lmf-reference-set-head"><span>Set</span><span>Load</span><span>${values.every(row => row.kind === 'reps') ? 'Reps' : 'Work'}</span><span>RPE</span><span></span></div>` + values.map(row => `<button type="button" data-reference-set="${esc(row.id)}" aria-label="Review set ${esc(row.number)}${row.completed ? ', logged' : ''}" aria-pressed="${row.selected}" class="${row.completed ? 'is-logged' : ''}"><span>${esc(row.number)}</span><strong>${esc(row.load)}</strong><span>${esc(row.amount)}</span><span>${esc(row.rpe)}</span><i aria-hidden="true">${row.completed ? '✓' : '○'}</i></button>`).join('')
    }
    const active = rows.find(row => row.classList.contains('lmf-set-active')) || rows[0]
    const title = card.querySelector('.exercise-title > div')
    const prescription = ensure(title,'.lmf-reference-prescription','p','lmf-reference-prescription','')
    const name = title?.querySelector('h3')
    if (name && name.nextElementSibling !== prescription) name.after(prescription)
    setText(prescription,`Set ${text(active.querySelector('.set-label strong'))} of ${rows.length} · ${text(active.querySelector('.set-target-cell strong'))}`)
    const load = active.querySelector('.load-input')?.value
    const plate = text(active.querySelector('.lmf-plates-line strong')) || text(active.querySelector('.load-field small'))
    const loaderSource = card.querySelector('.exercise-actions [data-lmf-bar-loader-open="exercise"]')
    const loader = ensure(card,'.lmf-reference-load-card','section','lmf-reference-load-card','<span>Load the bar</span><strong data-reference-load></strong><p data-reference-plates></p><button type="button" data-reference-load-bar>Bar Loader ↗</button>')
    setText(loader.querySelector('[data-reference-load]'),load ? `${load} ${active.dataset.loadUnit || ''}`.trim() : 'No load entered')
    setText(loader.querySelector('[data-reference-plates]'),plate || 'Choose your bar and plates in the loader.')
    loader.hidden = !loaderSource
    const rack = ensure(loader,'.lmf-reference-plate-rack','div','lmf-reference-plate-rack','')
    setAttr(rack,'aria-label','Plates on each side')
    const eachSide = plate.match(/per side:\s*([\d.\s+]+)$/i)?.[1]?.trim()
    const plateLabels = eachSide ? eachSide.split(/\s*\+\s*/).filter(value => /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0) : []
    const plateCounts = new Map()
    for (const value of plateLabels) plateCounts.set(value,(plateCounts.get(value) || 0)+1)
    const rackMarkup = [...plateCounts].map(([value,count]) => `<span class="lmf-reference-plate"><i aria-hidden="true">${esc(value)}</i><strong>${count} × ${esc(value)}<small>each side</small></strong></span>`).join('')
    if (rack.innerHTML !== rackMarkup) rack.innerHTML = rackMarkup
    rack.hidden = !rackMarkup
    const loaderButton = loader.querySelector('[data-reference-load-bar]')
    if (rack.nextElementSibling !== loaderButton) loaderButton.before(rack)
    const exerciseCue = text(card.querySelector('.exercise-title .muted:last-child'))
    const cue = exerciseCue && !/demo|search fallback/i.test(exerciseCue) ? exerciseCue : text(card.closest('.workout-panel')?.querySelector('.workout-panel-head .muted'))
    if (cue) {
      const block = ensure(card,'.lmf-reference-coaching-cue','div','lmf-reference-coaching-cue','<strong>Coaching cue</strong><p></p>')
      setText(block.querySelector('strong'),cue === exerciseCue ? 'Coaching cue' : 'Block guidance')
      setText(block.querySelector('p'),cue)
      ensure(block,'.lmf-reference-cue-icon','span','lmf-reference-cue-icon',icon('cue'),'afterbegin')
    }
    for (const row of rows) {
      const button = row.querySelector('.set-check')
      if (button) setAttr(button,'aria-label',`${button.classList.contains('done') ? 'Unlog' : 'Log'} set ${text(row.querySelector('.set-label strong'))}`)
    }
  }

  function renderTimer() {
    if (!timer.element?.isConnected) return
    const remaining = timer.until ? Math.max(0,Math.ceil((timer.until - Date.now()) / 1000)) : timer.remaining
    setText(timer.element.querySelector('output'),`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2,'0')}`)
    setText(timer.element.querySelector('[data-reference-timer-toggle]'),timer.until ? 'Pause' : remaining ? 'Start rest' : 'Restart')
    if (timer.until && !remaining) {
      timer.until = 0
      timer.remaining = 0
      clearInterval(timer.interval)
      timer.interval = null
      setText(timer.element.querySelector('[data-reference-timer-status]'),'Timer finished. Continue when ready.')
      setText(timer.element.querySelector('[data-reference-timer-toggle]'),'Restart')
    }
  }

  // A not-yet-started or future day uses native preview-card nodes, not live
  // active-exercise nodes. Give those the same one-open-exercise composition.
  // Selection is DOM-only; the original prescription and action nodes stay put.
  function previewCards(panel) {
    const cards = [...panel.querySelectorAll('.exercise-stack > .preview-card')]
    if (!cards.length) return cards
    const selected = cards.find(card => card.classList.contains('lmf-reference-preview-active')) || cards[0]
    cards.forEach((card,index) => {
      const name = text(card.querySelector('.exercise-title h3'))
      const rows = [...card.querySelectorAll('.prescription-block > .prescription-row')]
      const first = rows[0]
      const detail = rows.length > 1 ? `${rows.length} sets · ${text(first?.querySelector('span'))}` : text(first)
      const button = ensure(card,':scope > .lmf-reference-preview-summary','button','lmf-reference-preview-summary','<span><strong></strong><small></small></span><i aria-hidden="true">›</i>','afterbegin')
      button.type = 'button'
      setAttr(button,'data-reference-preview-exercise',index)
      setAttr(button,'aria-expanded',card === selected)
      setText(button.querySelector('strong'),name)
      setText(button.querySelector('small'),detail)
      card.classList.toggle('lmf-reference-preview-active',card === selected)
      const media = ensure(card,':scope > .lmf-exercise-media','div','lmf-exercise-media','','afterbegin')
      setAttr(media,'data-exercise-art',card.dataset.exerciseArt || '')
      setAttr(media,'role','img')
      setAttr(media,'aria-label',`${name} exercise picture`)
    })
    return cards
  }

  function selectPreview(panel,index) {
    const cards = [...panel.querySelectorAll('.exercise-stack > .preview-card')]
    if (!cards[index]) return
    cards.forEach((card,i) => card.classList.toggle('lmf-reference-preview-active',i === index))
    queue()
  }

  function workout(shell) {
    const list = panels(shell)
    list.forEach((panel,index) => {
      const head = panel.querySelector('.workout-panel-head')
      const stack = panel.querySelector('.exercise-stack')
      if (!head || !stack) return
      panel.classList.add('lmf-reference-block')
      setAttr(head.querySelector('h2'),'data-reference-block-number',index)
      ensure(head,'.lmf-reference-block-icon','span','lmf-reference-block-icon',icon('crown'),'afterbegin')
      const previews = previewCards(panel)
      const cards = previews.length ? previews : [...stack.querySelectorAll(':scope > .active-exercise')]
      let pager = head.querySelector('.lmf-reference-block-pager')
      if (cards.length) {
        pager = ensure(head,'.lmf-reference-block-pager','div','lmf-reference-block-pager','<button type="button" data-reference-exercise-step="-1" aria-label="Previous exercise in block">‹</button><span></span><button type="button" data-reference-exercise-step="1" aria-label="Next exercise in block">›</button>')
        const selected = Math.max(0,cards.findIndex(card => card.classList.contains(previews.length ? 'lmf-reference-preview-active' : 'lmf-flow-active')))
        const resting = Boolean(panel.querySelector('.lmf-round-rest.is-active'))
        setText(pager.querySelector('span'),`${selected+1} of ${cards.length}`)
        pager.querySelector('[data-reference-exercise-step="-1"]').disabled = resting || selected === 0
        pager.querySelector('[data-reference-exercise-step="1"]').disabled = resting || selected === cards.length-1
      }
      if (pager) pager.hidden = !cards.length
    })
    shell.querySelectorAll('.active-exercise').forEach(summary)
    const activePanel = list.find(panel => panel.classList.contains('active-page'))
    const index = list.indexOf(activePanel)
    const activeCard = activePanel?.querySelector('.active-exercise.lmf-flow-active')
    if (activeCard) {
      let clock = shell.querySelector('.lmf-reference-rest-timer')
      if (!clock) {
        clock = document.createElement('section')
        clock.className = 'lmf-reference-rest-timer'
        clock.innerHTML = '<span>Rest</span><output aria-label="Rest time remaining">2:00</output><label>Timer length<select aria-label="Rest timer length"><option value="60">1 min</option><option value="90">90 sec</option><option value="120" selected>2 min</option><option value="180">3 min</option><option value="300">5 min</option></select></label><div><button type="button" data-reference-timer-toggle>Start rest</button><button type="button" data-reference-timer-reset>Reset</button></div><small data-reference-timer-status role="status">Manual timer · follow your programmed rest.</small>'
      }
      if (clock.parentElement !== activeCard) activeCard.append(clock)
      timer.element = clock
      renderTimer()
    }
    const next = ensure(shell,'.lmf-reference-upcoming','section','lmf-reference-upcoming','')
    const nextList = list.map((panel,i) => {
      const title = text(panel.querySelector('.workout-panel-head h2')) || (panel.classList.contains('review-panel') ? 'Review' : '')
      const cards = [...panel.querySelectorAll('.exercise-stack > .exercise-card')]
      const names = cards.map(card => text(card.querySelector('h3')))
      const count = cards.reduce((sum,card) => sum+card.querySelectorAll('.set-row,.prescription-row').length,0)
      const copy = names.length > 2 ? `${names.slice(0,2).join(' + ')} + ${names.length-2} more` : names.join(' + ')
      const detail = title === 'Review' ? 'Finish strong.' : `${cards.length} ${cards.length === 1 ? 'exercise' : 'exercises'}${count ? ` · ${count} sets` : ''}`
      const symbol = title === 'Review' ? 'trophy' : /assist|superset|circuit/i.test(title) ? 'chain' : /carry|condition/i.test(title) ? 'mountain' : 'strength'
      return {i,title,copy,names:names.join(' + '),detail,symbol,tone:/assist|superset|review/i.test(title) ? 'purple' : 'red'}
    }).filter(item => item.i > index && item.title)
    const signature = JSON.stringify(nextList)
    if (next.dataset.signature !== signature) {
      next.dataset.signature = signature
      next.innerHTML = nextList.map(item => `<button type="button" data-reference-section="${item.i}" data-reference-tone="${item.tone}" title="${esc(item.names || item.title)}">${icon(item.symbol)}<span><strong>Block ${item.i} — ${esc(item.title)}</strong><small>${esc(item.copy || 'Session RPE, notes and workout completion')}</small></span><em>${esc(item.detail)}</em><i aria-hidden="true">›</i></button>`).join('')
    }
    ensure(shell,'.lmf-reference-train-footer','footer','lmf-reference-train-footer','<strong>Same work.<br>A stronger you.</strong><span>Discipline<br>builds freedom</span>')
  }

  function train() {
    const shell = location.hash.split('?')[0] === '#/train' ? document.querySelector('.train-shell') : null
    if (!shell) return
    shell.classList.add('lmf-train-reference-final')
    setAttr(shell,'data-lmf-train-block-cards','v1')
    trainHeader(shell)
    workout(shell)
  }

  function queue() {
    if (queued) return
    queued = true
    requestAnimationFrame(() => { queued = false; home(); train() })
  }
  function boot() {
    queue()
    new MutationObserver(records => {
      if (records.some(record => {
        if (record.type !== 'attributes') return true
        const before = (record.oldValue || '').split(/\s+/)
        const node = record.target
        const flag = node.matches('.set-check') ? 'done' : node.matches('.swipe-page') ? 'active-page' : node.matches('.active-exercise') ? 'lmf-flow-active' : null
        return flag && before.includes(flag) !== node.classList.contains(flag)
      })) queue()
    }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeOldValue:true,attributeFilter:['class']})
    document.addEventListener('input',queue)
    document.addEventListener('focusin',event => {
      const card = event.target.closest?.('.lmf-train-reference-final .active-exercise')
      if (card && !event.target.matches(':active')) alignCardSection(card)
    })
    document.addEventListener('change',event => {
      if (event.target.matches('.lmf-reference-rest-timer select')) {
        timer.seconds = Number(event.target.value)
        timer.remaining = timer.seconds
        timer.until = 0
        clearInterval(timer.interval)
        timer.interval = null
        setText(timer.element?.querySelector('[data-reference-timer-status]'),'Manual timer · follow your programmed rest.')
        renderTimer()
      }
      queue()
    })
    document.addEventListener('click',event => {
      const shell = event.target.closest('.lmf-train-reference-final')
      if (!shell) return
      const card = event.target.closest('.active-exercise')
      if (card) alignCardSection(card)
      else if (event.target.closest('[data-session-index],[data-session-step],[data-reference-section],[data-reference-readiness],[data-reference-resume]')) {
        cancelAnimationFrame(cardAlignmentFrame)
        cardAlignmentFrame = 0
      }
      const targetSet = event.target.closest('[data-reference-set]')
      if (targetSet && card) {
        const rows = [...card.querySelectorAll('.set-table .set-row')]
        const index = rows.findIndex(row => row.dataset.setId === targetSet.dataset.referenceSet)
        card.querySelectorAll('.lmf-set-tab')[index]?.click()
      }
      if (event.target.closest('[data-reference-load-bar]')) card?.querySelector('.exercise-actions [data-lmf-bar-loader-open="exercise"]')?.click()
      const exerciseStep = event.target.closest('[data-reference-exercise-step]')
      if (exerciseStep) {
        const panel = exerciseStep.closest('.workout-panel')
        if (panel.querySelector('.lmf-round-rest.is-active')) return
        const previews = [...panel.querySelectorAll('.exercise-stack > .preview-card')]
        if (previews.length) {
          const selected = previews.findIndex(item => item.classList.contains('lmf-reference-preview-active'))
          selectPreview(panel,selected+Number(exerciseStep.dataset.referenceExerciseStep))
        } else {
          const cards = [...panel.querySelectorAll('.exercise-stack > .active-exercise')]
          const selected = cards.findIndex(item => item.classList.contains('lmf-flow-active'))
          cards[selected+Number(exerciseStep.dataset.referenceExerciseStep)]?.querySelector('.lmf-compact-summary')?.click()
        }
      }
      const previewExercise = event.target.closest('[data-reference-preview-exercise]')
      if (previewExercise) selectPreview(previewExercise.closest('.workout-panel'),Number(previewExercise.dataset.referencePreviewExercise))
      const section = event.target.closest('[data-reference-section]')
      if (section) openSection(shell,Number(section.dataset.referenceSection))
      const readiness = event.target.closest('[data-reference-readiness]')
      if (readiness) {
        openSection(shell,0,false)
        requestAnimationFrame(() => shell.querySelector(`input[name="readiness-${radioNames[readiness.dataset.referenceReadiness]}"]`)?.closest('.readiness-field')?.scrollIntoView({behavior:'smooth',block:'center'}))
      }
      if (event.target.closest('[data-reference-resume]')) {
        const list = panels(shell)
        const incomplete = list.findIndex(panel => [...panel.querySelectorAll('.set-check')].some(button => !button.classList.contains('done')))
        openSection(shell,shell.querySelector('.set-row') ? incomplete < 0 ? list.length - 1 : incomplete : 0)
      }
      if (event.target.closest('[data-reference-timer-toggle]')) {
        if (timer.until) {
          timer.remaining = Math.max(0,Math.ceil((timer.until - Date.now()) / 1000))
          timer.until = 0
          clearInterval(timer.interval)
          timer.interval = null
        } else {
          if (!timer.remaining) timer.remaining = timer.seconds
          timer.until = Date.now() + timer.remaining * 1000
          timer.interval = setInterval(renderTimer,250)
        }
        renderTimer()
      }
      if (event.target.closest('[data-reference-timer-reset]')) {
        timer.until = 0
        timer.remaining = timer.seconds
        clearInterval(timer.interval)
        timer.interval = null
        setText(timer.element?.querySelector('[data-reference-timer-status]'),'Manual timer · follow your programmed rest.')
        renderTimer()
      }
      queue()
    })
    window.addEventListener('hashchange',() => {
      cancelAnimationFrame(cardAlignmentFrame)
      cardAlignmentFrame = 0
      if (location.hash.split('?')[0] !== '#/train') {
        clearInterval(timer.interval)
        timer = {seconds:120,remaining:120,until:0,interval:null,element:null}
      }
      queue()
    })
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true})
  else boot()
})()
