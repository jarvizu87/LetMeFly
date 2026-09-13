(() => {
  'use strict'

  // LetMeFly Approved Tab Redesigns v1
  // Presentation/navigation only. This layer intentionally does not write athlete
  // data, program prescriptions, workout history, training maxes, or readiness.

  // Tag every primary route so the final color-harmonization layer can distinguish
  // Home from Train/Coach/More even when no route-specific DOM bridge is required.
  const ROUTES = new Set(['home', 'train', 'program', 'progress', 'exercises', 'coach', 'profile', 'more'])
  let timer = 0

  const clean = (value) => String(value ?? '').trim()
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const route = () => location.hash.replace(/^#\//, '').split(/[?#]/)[0] || 'home'

  function findPageHead(title) {
    const rx = new RegExp(`^${title}$`, 'i')
    return [...document.querySelectorAll('.page-head.cinematic-head,.page-head')].find((node) => rx.test(clean(node.querySelector('h1')?.textContent))) || null
  }

  function currentRoute() {
    const value = route()
    return ROUTES.has(value) ? value : ''
  }

  function scrollControl(label, target) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.dataset.lmfApprovedScroll = target
    return button
  }

  function mountProgram() {
    if(document.querySelector('.lmf-reference-program-overview'))return
    const head = document.querySelector('.program-page-head') || findPageHead('PROGRAM')
    const hero = document.querySelector('.program-hero')
    if (!(head instanceof HTMLElement) || !(hero instanceof HTMLElement)) return

    head.classList.add('lmf-approved-program-head-v1')
    hero.classList.add('lmf-approved-program-hero-v1')
    hero.id ||= 'lmf-approved-program-overview-v1'

    const roadmap = document.querySelector('.black-crown-panel')
    if (roadmap instanceof HTMLElement) {
      roadmap.classList.add('lmf-approved-program-roadmap-v1')
      roadmap.id ||= 'lmf-approved-program-progression-v1'
    }
    const weeks = document.querySelector('.program-current-week-label') || document.querySelector('.program-week-nav')
    if (weeks instanceof HTMLElement) weeks.id ||= 'lmf-approved-program-weeks-v1'
    const notes = document.querySelector('.source-details')
    if (notes instanceof HTMLElement) notes.id ||= 'lmf-approved-program-notes-v1'

    const parent = hero.parentElement
    if (!(parent instanceof HTMLElement)) return
    if (!parent.querySelector(':scope > .lmf-approved-program-tabs-v1')) {
      const tabs = document.createElement('nav')
      tabs.className = 'lmf-approved-program-tabs-v1'
      tabs.setAttribute('aria-label', 'Program workspace')
      tabs.append(
        scrollControl('Overview', 'lmf-approved-program-overview-v1'),
        scrollControl('Weeks', 'lmf-approved-program-weeks-v1')
      )
      const exercises = document.createElement('a')
      exercises.href = '#/exercises'
      exercises.textContent = 'Exercises'
      tabs.append(exercises)
      tabs.append(
        scrollControl('Progression', 'lmf-approved-program-progression-v1'),
        scrollControl('Notes', 'lmf-approved-program-notes-v1')
      )
      parent.insertBefore(tabs, hero)
    }

    document.querySelectorAll('.program-week-drawer,.week-day-card').forEach((node) => node.classList.add('lmf-approved-program-week-v1'))
    mountProgramOverview(head, parent)
  }

  function mountProgramOverview(head, parent) {
    if(parent.querySelector('.lmf-reference-program-overview'))return
    const selected=parent.querySelector('.program-week.active')
    const days=[...(selected?.querySelectorAll('.week-day-card')||[])]
    if(!days.length)return
    const key=days[0].dataset.openProgram||'crownforge'
    const group=selected.closest('.program-weeks-compact')
    const week=Number(days[0].dataset.openWeek)||1,total=group?.querySelectorAll('.program-week-drawer').length||1
    const source=key==='black-crown'?parent.querySelector('.black-crown-panel'):key==='crown-maintenance'?parent.querySelector('.maintenance-weeks-compact')?.previousElementSibling:parent.querySelector('.program-hero')
    const name=clean(source?.querySelector('h2')?.textContent)||'Your Program'
    const description=clean(source?.querySelector('p')?.textContent)
    const nativeRoadmap=[...parent.querySelectorAll('.bc-phase')].map(node=>{
      const weeks=clean(node.querySelector('small')?.textContent),range=weeks.match(/(\d+)\D+(\d+)/)
      return {title:clean(node.querySelector('strong')?.textContent),weeks,current:key==='black-crown'&&range&&week>=Number(range[1])&&week<=Number(range[2])}
    }).filter(x=>x.title)
    const paths=[
      {key:'crownforge',name:'Crownforge',weeks:parent.querySelector('.program-weeks-compact:not(.maintenance-weeks-compact):not(.black-crown-weeks-compact)')?.querySelectorAll('.program-week-drawer').length},
      {key:'crown-maintenance',name:'Crown Maintenance',weeks:parent.querySelector('.maintenance-weeks-compact')?.querySelectorAll('.program-week-drawer').length},
      {key:'black-crown',name:'Black Crown',weeks:parent.querySelector('.black-crown-weeks-compact')?.querySelectorAll('.program-week-drawer').length},
    ].filter(x=>x.weeks)
    const phases=key==='black-crown'&&nativeRoadmap.length?nativeRoadmap:paths.map(x=>({title:x.name,weeks:`${x.weeks} weeks`,current:x.key===key}))
    const overview=document.createElement('section');overview.className='lmf-reference-program-overview'
    overview.innerHTML=`<section class="lmf-reference-program-hero"><div><h2>${escape(name)}</h2><p>${escape(description)}</p><button type="button" data-reference-program-view="weeks">View Program Details <span>›</span></button></div></section><div class="lmf-reference-program-phases">${phases.map((phase,i)=>`<div class="${phase.current?'is-current':''}"><span>${String(i+1).padStart(2,'0')}</span><strong>${escape(phase.title)}</strong><small>${escape(phase.weeks)}</small></div>`).join('')}</div><section class="lmf-reference-program-position"><header><h3>Week ${week} of ${total}</h3><span>${escape(name)}</span></header><div class="lmf-reference-position-bar" role="meter" aria-label="Current program week" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${week}"><span style="width:${Math.min(100,week/total*100)}%"></span></div><div class="lmf-reference-position-stats"><span><strong>${week}</strong>Current Week</span><span><strong>${total}</strong>Program Weeks</span><span><strong>${days.length}</strong>Days This Week</span></div></section><div class="lmf-reference-program-motto">“Discipline today. Freedom tomorrow.”</div><header class="lmf-reference-program-section-title"><h3>This Week</h3><button type="button" data-reference-program-view="weeks">View Week ›</button></header><div class="lmf-reference-program-days">${days.map((day,i)=>`<button type="button" class="${day.classList.contains('active')?'is-current':''}" data-reference-program-day="${i}"><span>${escape(day.querySelector('span')?.textContent)}</span><strong>${escape(day.querySelector('strong')?.textContent)}</strong><small>${day.classList.contains('active')?'Selected':'View Session'}</small></button>`).join('')}</div><header class="lmf-reference-program-section-title"><h3>${key==='black-crown'?'Phase Timeline':'Training Path'}</h3><button type="button" data-reference-program-view="progression">View Full Timeline ›</button></header><div class="lmf-reference-program-timeline">${phases.map(phase=>`<div class="${phase.current?'is-current':''}"><i></i><strong>${escape(phase.weeks)}</strong><span>${escape(phase.title)}</span></div>`).join('')}</div><div class="lmf-reference-program-footer">THE WORK<br>BUILDS YOU.</div>`
    // Keep every original week/day node and its original click handler together.
    const catalog=document.createElement('section');catalog.className='lmf-reference-program-catalog';catalog.hidden=true
    const tabs=parent.querySelector('.lmf-approved-program-tabs-v1')
    for(const child of [...parent.children])if(child!==head&&child!==tabs)catalog.append(child)
    parent.append(overview,catalog)
    overview.querySelectorAll('[data-reference-program-day]').forEach(button=>button.addEventListener('click',()=>days[Number(button.dataset.referenceProgramDay)]?.click()))
    tabs?.querySelectorAll('[data-lmf-approved-scroll]').forEach(button=>{
      const view=clean(button.textContent).toLowerCase()
      button.dataset.referenceProgramView=view
      button.removeAttribute('data-lmf-approved-scroll')
    })
    const subtitle=head.querySelector('p');if(subtitle)subtitle.textContent='Your Plan • Your Progress • The Crown Awaits'
    setProgramView('overview',false)
  }

  function setProgramView(view,scroll=true){
    const overview=document.querySelector('.lmf-reference-program-overview'),catalog=document.querySelector('.lmf-reference-program-catalog')
    if(!overview||!catalog)return
    overview.hidden=view!=='overview';catalog.hidden=view==='overview'
    document.querySelectorAll('.lmf-approved-program-tabs-v1 [data-reference-program-view]').forEach(button=>button.setAttribute('aria-current',String(button.dataset.referenceProgramView===view)))
    const target=view==='overview'?overview:view==='progression'?catalog.querySelector('.black-crown-panel'):view==='notes'?catalog.querySelector('.source-details'):catalog.querySelector('.program-week.active')?.closest('.program-week-drawer')||catalog
    if(view==='notes'&&target instanceof HTMLDetailsElement)target.open=true
    if(scroll)target?.scrollIntoView({behavior:'smooth',block:'start'})
  }

  function mountProgress() {
    const head = document.querySelector('.progress-page-head') || findPageHead('PROGRESS')
    const dashboard = document.getElementById('lmf-progress-dashboard-v1') || document.querySelector('.lmf-progress-dashboard')
    if (!(head instanceof HTMLElement) || !(dashboard instanceof HTMLElement)) return

    head.classList.add('lmf-approved-progress-head-v1')
    // The dashboard initially mounts after the native h1. Keep its live controls
    // below the cinematic heading once both surfaces are ready.
    if (head.contains(dashboard)) head.insertAdjacentElement('afterend', dashboard)
    const subtitle = head.querySelector(':scope > p')
    if (subtitle && subtitle.textContent !== 'Measure • Improve • Become more.') subtitle.textContent = 'Measure • Improve • Become more.'
    dashboard.classList.add('lmf-approved-progress-v1')
    if (!head.querySelector('.lmf-reference-quote')) {
      const quote = document.createElement('blockquote')
      quote.className = 'lmf-reference-quote'
      quote.innerHTML = '“Discipline turns<br>progress into freedom.”<small>— RAIZEN</small>'
      head.append(quote)
    }
    if (!dashboard.querySelector('.lmf-reference-progress-footer')) {
      const footer = document.createElement('div')
      footer.className = 'lmf-reference-progress-footer'
      footer.setAttribute('role','img')
      footer.setAttribute('aria-label','Higher standards. A stronger you. A freer tomorrow. — Raizen')
      dashboard.append(footer)
    }

    const parent = dashboard.parentElement
    if (parent instanceof HTMLElement && !parent.querySelector(':scope > .lmf-progress-worldbar-v1')) {
      const world = document.createElement('section')
      world.className = 'lmf-progress-worldbar-v1'
      world.setAttribute('aria-label', 'Progress identity')
      world.innerHTML = '<div><span>ATHLETE DEVELOPMENT</span><strong>Build proof. Track the climb.</strong><small>Strength • Body composition • Conditioning • Consistency • Milestones</small></div><b aria-hidden="true">♛</b>'
      parent.insertBefore(world, dashboard)
    }

    dashboard.querySelectorAll('.lmf-pg-tabs button').forEach((button) => {
      const raw = clean(button.textContent).toLowerCase()
      if (raw === 'body') button.textContent = 'Body Comp'
      if (raw === 'prs') button.textContent = 'Milestones / PRs'
    })
  }

  function exerciseSidebarMarkup() {
    const filters = [
      ['all', 'All Exercises'],
      ['barbell', 'Barbell'],
      ['kb', 'Kettlebell'],
      ['machine', 'Machine'],
      ['bodyweight', 'Bodyweight'],
      ['sled', 'Sled'],
      ['carry', 'Carry'],
      ['olympic', 'Olympic'],
    ]
    return `<div class="lmf-exercise-sidebar-title-v1"><strong>LIBRARY</strong><small>Movement intelligence</small></div>${filters.map(([key, label], index) => `<button type="button" data-lmf-exercise-category="${key}" class="${index === 0 ? 'is-active' : ''}">${label}<span>›</span></button>`).join('')}`
  }

  function updateExerciseSidebar(layout) {
    if (!(layout instanceof HTMLElement)) return
    const originals = [...document.querySelectorAll('.exercise-search-card [data-exercise-filter]')]
    const active = originals.find((button) => button.classList.contains('active') || button.getAttribute('aria-pressed') === 'true')
    const value = active?.getAttribute('data-exercise-filter') || 'all'
    layout.querySelectorAll('[data-lmf-exercise-category]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-lmf-exercise-category') === value)
    })
  }

  function mountExercises() {
    const head = document.querySelector('.exercise-page-head') || findPageHead('EXERCISES')
    const search = document.querySelector('.exercise-search-card')
    const library = document.querySelector('.exercise-library')
    if (!(head instanceof HTMLElement) || !(search instanceof HTMLElement) || !(library instanceof HTMLElement)) return

    head.classList.add('lmf-approved-exercises-hero-v1')
    const subtitle = head.querySelector(':scope > p')
    if (subtitle && subtitle.textContent !== 'MOVEMENTS BUILD STRONGER HUMANS') subtitle.textContent = 'MOVEMENTS BUILD STRONGER HUMANS'
    if (!head.querySelector('.lmf-exercises-worldmark-v1')) {
      const mark = document.createElement('div')
      mark.className = 'lmf-exercises-worldmark-v1'
      mark.innerHTML = '<span aria-hidden="true">♛</span><strong>Movement knowledge.<br>Purpose preserved.</strong>'
      head.appendChild(mark)
    }

    let layout = document.querySelector('.lmf-approved-exercises-layout-v1')
    if (!(layout instanceof HTMLElement)) {
      const parent = search.parentElement
      if (!(parent instanceof HTMLElement) || library.parentElement !== parent) return
      layout = document.createElement('div')
      layout.className = 'lmf-approved-exercises-layout-v1'
      parent.insertBefore(layout, search)
      const sidebar = document.createElement('aside')
      sidebar.className = 'lmf-approved-exercises-sidebar-v1'
      sidebar.setAttribute('aria-label', 'Exercise categories')
      sidebar.innerHTML = exerciseSidebarMarkup()
      const content = document.createElement('div')
      content.className = 'lmf-approved-exercises-content-v1'
      layout.append(sidebar, content)
      const summary = document.getElementById('lmf-intel-catalog-summary')
      if (summary) content.appendChild(summary)
      content.append(search, library)
    } else {
      const content = layout.querySelector('.lmf-approved-exercises-content-v1')
      const summary = document.getElementById('lmf-intel-catalog-summary')
      if (content && summary && summary.parentElement !== content) content.insertBefore(summary, search)
    }

    search.classList.add('lmf-approved-exercise-search-v1')
    library.querySelectorAll('[data-library-card]').forEach((card) => card.classList.add('lmf-approved-exercise-card-v1'))
    let detail = layout.querySelector('.lmf-reference-exercise-detail')
    if (!detail) {
      detail = document.createElement('aside')
      detail.className = 'lmf-reference-exercise-detail'
      detail.setAttribute('aria-label','Selected exercise')
      layout.append(detail)
    }
    for (const card of library.querySelectorAll('[data-library-card]')) {
      const thumb = card.querySelector('.library-thumb')
      if (thumb && !thumb.querySelector('[data-reference-select-exercise]')) {
        const select = document.createElement('button')
        select.type='button'; select.dataset.referenceSelectExercise=''
        select.setAttribute('aria-label','Preview '+clean(card.querySelector('h3')?.textContent))
        thumb.append(select)
      }
    }
    if (!detail.dataset.exerciseName) selectReferenceExercise(library.querySelector('[data-library-card]'),detail)
    updateExerciseSidebar(layout)
  }

  function selectReferenceExercise(card, detail=document.querySelector('.lmf-reference-exercise-detail')) {
    if (!(card instanceof HTMLElement) || !detail) return
    const name=clean(card.querySelector('h3')?.textContent)
    const record=window.LetMeFlyExerciseIntelligence?.getExercise(name)
    if (!record) return
    if (detail.dataset.exerciseName===name) return
    detail.dataset.exerciseName=name
    document.querySelectorAll('[data-library-card]').forEach(el=>el.classList.toggle('lmf-reference-selected',el===card))
    const media=card.querySelector('.library-thumb')?.cloneNode(true)
    media?.querySelectorAll('button').forEach(el=>el.remove())
    if(media){media.classList.add('lmf-reference-detail-image');media.removeAttribute('id')}
    detail.innerHTML=`<h2>${escape(name)}</h2><div class="lmf-reference-detail-tags">${[...(record.movementRoles||[]).slice(0,1),...(record.equipment||[]).slice(0,2)].map(s=>`<span>${escape(s)}</span>`).join('')}</div><div class="lmf-reference-detail-tabs"><strong>Overview</strong><button type="button" data-reference-detail-action="info">Cues & Details</button><button type="button" data-reference-detail-action="substitute">Substitutions</button></div><dl><dt>Primary Muscles</dt><dd>${escape((record.primaryMuscles||[]).join(', ')||'—')}</dd><dt>Secondary Muscles</dt><dd>${escape((record.secondaryMuscles||[]).join(', ')||'—')}</dd><dt>Purpose</dt><dd>${escape(record.purpose||'—')}</dd><dt>Equipment</dt><dd>${escape((record.equipment||[]).join(', ')||'—')}</dd></dl><button type="button" class="lmf-reference-watch" data-reference-detail-action="watch">▶ Watch Exercise</button><button type="button" data-reference-detail-action="substitute">Find Substitutes</button><button type="button" data-reference-detail-action="info">Exercise Info</button>`
    if(media)detail.prepend(media)
    for(const button of detail.querySelectorAll('[data-reference-detail-action]')){
      const selectors={watch:'[data-watch],[data-lmf-intel-watch]',info:'[data-exercise-info]',substitute:'[data-substitute]'}
      const original=card.querySelector(selectors[button.dataset.referenceDetailAction])
      button.disabled=!original||original.disabled
    }
  }

  function profileValue(key) {
    const control = document.querySelector(`#lmf-profile-v2 [data-profile-key="${key}"]`)
    return clean(control?.value)
  }

  function goalRow(label, value, empty) {
    const row = document.createElement('div')
    const heading = document.createElement('span')
    const detail = document.createElement('strong')
    heading.textContent = label
    detail.textContent = clean(value) || empty
    row.append(heading, detail)
    return row
  }

  function refreshGoalTracker(section) {
    const tracker = section.querySelector('.lmf-profile-goal-tracker-v1')
    if (!(tracker instanceof HTMLElement)) return
    const primary = profileValue('primaryGoal')
    const strength = profileValue('strengthGoals')
    const development = profileValue('developmentPriorities')
    const signature = JSON.stringify([primary, strength, development])
    if (tracker.dataset.lmfGoalSignature === signature) return
    tracker.dataset.lmfGoalSignature = signature
    tracker.replaceChildren(
      goalRow('Primary Goal', primary, 'Add your primary goal below'),
      goalRow('Strength Targets', strength, 'Add strength targets below'),
      goalRow('Development Focus', development, 'Add development priorities below')
    )
  }

  function mountProfile() {
    const section = document.getElementById('lmf-profile-v2')
    if (!(section instanceof HTMLElement)) return
    section.classList.add('lmf-approved-profile-v1')
    findPageHead('PROFILE')?.classList.add('lmf-reference-profile-head')

    let sheet = section.querySelector(':scope > .lmf-profile-character-sheet-v1')
    if (!(sheet instanceof HTMLElement)) {
      const head = section.querySelector(':scope > .lmf-profile-v2-head')
      const stats = section.querySelector(':scope > .lmf-profile-stat-grid')
      const program = section.querySelector(':scope > .lmf-profile-program-card')
      if (!(head instanceof HTMLElement) || !(stats instanceof HTMLElement) || !(program instanceof HTMLElement)) return

      sheet = document.createElement('section')
      sheet.className = 'lmf-profile-character-sheet-v1'
      sheet.setAttribute('aria-label', 'Athlete character sheet')
      section.insertBefore(sheet, head)

      const visual = document.createElement('div')
      visual.className = 'lmf-profile-character-visual-v1'
      visual.innerHTML = '<div class="lmf-profile-character-seal-v1" aria-hidden="true">♛</div><div class="lmf-profile-character-copy-v1"><span>RAIZEN • FENRIR</span><strong>THE WORK<br>CONTINUES</strong><small>Discipline Builds Freedom.</small></div>'

      const dossier = document.createElement('div')
      dossier.className = 'lmf-profile-character-dossier-v1'
      sheet.append(visual, dossier)
      dossier.append(head, stats, program)

      const goals = document.createElement('article')
      goals.className = 'lmf-profile-goals-card-v1'
      goals.innerHTML = '<header><div><span>GOAL TRACKER</span><strong>What we are building toward</strong></div><button type="button" data-lmf-profile-goals-scroll>EDIT GOALS</button></header><div class="lmf-profile-goal-tracker-v1"></div>'
      dossier.appendChild(goals)

      const tms = section.querySelector(':scope > .lmf-profile-tm-sheet')
      if (tms) dossier.insertBefore(tms, goals)
      const footer = section.querySelector(':scope > .lmf-profile-sheet-footer')
      if (footer) dossier.append(footer)

      const goalsTitle = [...section.querySelectorAll('.lmf-profile-section-title')].find((node) => /GOALS\s*&\s*DEVELOPMENT/i.test(clean(node.textContent)))
      if (goalsTitle instanceof HTMLElement) {
        goalsTitle.id = 'lmf-profile-goals-fields-v1'
        goalsTitle.classList.add('lmf-profile-goals-detail-v1')
      }
    }

    const avatar = section.querySelector('.lmf-profile-v2-avatar')
    if (avatar instanceof HTMLElement) {
      avatar.hidden = true
      avatar.setAttribute('aria-hidden', 'true')
    }
    refreshGoalTracker(section)
  }

  function mountNavigation() {
    const nav=document.querySelector('nav.navbar')
    if (!nav || !nav.querySelector('a[href="#/home"]')) return
    if (!nav.querySelector('a[href="#/profile"]')) {
      const link=document.createElement('a');link.className='nav-item lmf-reference-profile-nav';link.href='#/profile'
      link.innerHTML='<span aria-hidden="true">♙</span>Profile'
      const more=nav.querySelector('a[href="#/more"]');nav.insertBefore(link,more)
    }
    const profile=nav.querySelector('.lmf-reference-profile-nav')
    if(profile)profile.classList.toggle('active',currentRoute()==='profile')
    for (const link of nav.querySelectorAll('.nav-item')) {
      const glyph=link.querySelector(':scope > span'),key=link.getAttribute('href')?.replace('#/','')
      if(glyph&&ICONS[key]&&!glyph.dataset.referenceIcon){glyph.innerHTML=icon(key);glyph.dataset.referenceIcon=key;glyph.setAttribute('aria-hidden','true')}
    }
  }

  const ICONS = {
    home:'<path d="m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10"/>',
    train:'<path d="M3 9v6m4-9v12m10-12v12m4-9v6M7 12h10"/>',
    program:'<path d="m5 6 7-3 7 3v14l-7 2-7-2V6Zm4 3h6m-6 4h6m-6 4h4"/>',
    progress:'<path d="M5 21v-7m7 7V9m7 12V4M3 9l6-4 5 1 7-5"/>',
    exercises:'<path d="M3 8h18M6 5v6m12-6v6M4 16h16m-13-3v6m10-6v6"/>',
    coach:'<path d="M8 4 4 6l-2 5 4 2 2-3v11h8V10l2 3 4-2-2-5-4-2c0 4-8 4-8 0Z"/>',
    profile:'<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 6 0 0 1 16 0v3H4Z"/>',
    more:'<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h2m6 0h2m-10 4h2m6 0h2"/>',
    nutrition:'<path d="M4 3v6c0 4 6 4 6 0V3M7 3v19m11 0V3c-5 3-5 10 0 10"/>',
    readiness:'<path d="M20 5c-3-3-7-1-8 2-2-3-6-5-9-2-5 5 3 12 9 16 5-4 13-11 8-16Z"/><path d="M3 12h5l2-4 3 9 2-5h6"/>',
    testing:'<path d="M4 21V13h3v8m4 0V8h3v13m4 0V3h3v18"/>',
    utilities:'<path d="m21 3-5 3 2 3 4-2a6 6 0 0 1-8 7l-8 8-4-4 8-8a6 6 0 0 1 6-8l-2 4 3 2 4-5Z"/>',
    resources:'<path d="M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1v16M6 7h2m-2 4h2m8-4h2m-2 4h2"/>',
    data:'<path d="M7 19a5 5 0 0 1-1-10 6 6 0 0 1 12-1 5 5 0 0 1 0 11H7Zm5-9v8m-3-3 3 3 3-3"/>',
    settings:'<path d="m9 3-1 3-3 1-2 4 2 2-1 3 4 3 3-1 3 3 4-2v-3l3-2-1-5-3-1-1-4-4-1-3 3Z"/><circle cx="12" cy="12" r="3"/>',
    support:'<circle cx="12" cy="12" r="10"/><path d="M9 8a3 3 0 0 1 6 1c0 3-3 2-3 5m0 3h.01"/>',
  }
  function icon(key){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]||ICONS.more}</svg>`}
  function mountMoreIcons(){
    for(const card of document.querySelectorAll('[data-lmf-more-key]')){
      const glyph=card.querySelector('.lmf-more-card-icon-v1'),key=card.dataset.lmfMoreKey
      if(glyph&&!glyph.dataset.referenceIcon){glyph.innerHTML=icon(key);glyph.dataset.referenceIcon=key}
    }
  }

  function mountTrain() {
    const track=document.getElementById('session-track'),pages=[...document.querySelectorAll('#swipe-viewport > .swipe-page')]
    if (!track || !pages.length) return
    track.classList.add('lmf-reference-workout-flow')
    for(const button of track.querySelectorAll('[data-session-index]')) {
      const i=Number(button.dataset.sessionIndex),pane=pages[i]
      if(!pane)continue
      const name=i===0?'Readiness':i===pages.length-1?'Review':clean(pane.querySelector('h2')?.textContent)||`Block ${i}`
      const count=pane.querySelectorAll('.exercise-stack > .exercise-card').length
      const signature=JSON.stringify([name,count])
      if(button.dataset.referenceFlow===signature)continue
      button.dataset.referenceFlow=signature
      button.innerHTML=`<span>${i===0?'✓':i}</span><strong>${escape(name)}</strong><small>${count?`${count} exercise${count===1?'':'s'}`:i===0?'Start here':'Finish strong'}</small>`
    }
  }

  function mount() {
    timer = 0
    const active = currentRoute()
    if (!active) {
      document.documentElement.removeAttribute('data-lmf-approved-route')
      return
    }
    document.documentElement.setAttribute('data-lmf-approved-route', active)
    mountNavigation()
    if (active === 'more') mountMoreIcons()
    if (active === 'train') mountTrain()
    if (active === 'program') mountProgram()
    if (active === 'progress') mountProgress()
    if (active === 'exercises') mountExercises()
    if (active === 'profile') mountProfile()
  }

  function schedule() {
    if (timer) return
    timer = window.setTimeout(mount, 32)
  }

  document.addEventListener('click', (event) => {
    const target=event.target instanceof Element?event.target:null
    const programView=target?.closest('[data-reference-program-view]')
    if(programView){setProgramView(programView.dataset.referenceProgramView);return}
    if(target?.closest('[data-reference-select-exercise]')) {
      const card=target.closest('[data-library-card]'),detail=document.querySelector('.lmf-reference-exercise-detail')
      if(!detail?.getClientRects().length)card?.querySelector('[data-exercise-info]')?.click()
      else selectReferenceExercise(card,detail)
      return
    }
    const action=target?.closest('[data-reference-detail-action]')
    if(action){
      const name=action.closest('.lmf-reference-exercise-detail')?.dataset.exerciseName
      const card=[...document.querySelectorAll('[data-library-card]')].find(el=>clean(el.querySelector('h3')?.textContent)===name)
      const selectors={watch:'[data-watch],[data-lmf-intel-watch]',info:'[data-exercise-info]',substitute:'[data-substitute]'}
      const native=card?.querySelector(selectors[action.dataset.referenceDetailAction])
      if(native&&!native.disabled)native.click()
      return
    }
    if(target?.closest('[data-lmf-profile-edit-scroll]')){document.querySelector('#lmf-profile-v2 .lmf-profile-form-grid')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    if(target?.closest('[data-lmf-profile-backup-scroll]')){document.querySelector('.data-card')?.scrollIntoView({behavior:'smooth',block:'start'});return}
    const scroll = event.target instanceof Element ? event.target.closest('[data-lmf-approved-scroll]') : null
    if (scroll instanceof HTMLButtonElement) {
      const id = scroll.dataset.lmfApprovedScroll
      const target = id ? document.getElementById(id) : null
      if (target) target.scrollIntoView({ behavior:'smooth', block:'start' })
      return
    }

    const goalScroll = event.target instanceof Element ? event.target.closest('[data-lmf-profile-goals-scroll]') : null
    if (goalScroll instanceof HTMLButtonElement) {
      document.getElementById('lmf-profile-goals-fields-v1')?.scrollIntoView({ behavior:'smooth', block:'start' })
      return
    }

    const category = event.target instanceof Element ? event.target.closest('[data-lmf-exercise-category]') : null
    if (category instanceof HTMLButtonElement) {
      const key = category.dataset.lmfExerciseCategory || 'all'
      const original = [...document.querySelectorAll('.exercise-search-card [data-exercise-filter]')].find((button) => button.getAttribute('data-exercise-filter') === key)
      if (original instanceof HTMLButtonElement) original.click()
      const layout = category.closest('.lmf-approved-exercises-layout-v1')
      if (layout) window.setTimeout(() => updateExerciseSidebar(layout), 0)
    }
  })

  document.addEventListener('input', (event) => {
    if (!(event.target instanceof Element)) return
    if (!event.target.closest('#lmf-profile-v2 [data-profile-key]')) return
    const section = document.getElementById('lmf-profile-v2')
    if (section) refreshGoalTracker(section)
  })

  window.addEventListener('hashchange', schedule)
  window.addEventListener('pageshow', schedule)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule() })
  new MutationObserver(schedule).observe(document.documentElement, { childList:true, subtree:true })
  schedule()
})()
