(() => {
  'use strict'

  // LetMeFly Approved Tab Redesigns v1
  // Presentation/navigation only. This layer intentionally does not write athlete
  // data, program prescriptions, workout history, training maxes, or readiness.

  const ROUTES = new Set(['program', 'progress', 'exercises', 'profile'])
  let timer = 0

  const clean = (value) => String(value ?? '').trim()
  const route = () => location.hash.replace(/^#\//, '').split(/[?#]/)[0]

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
  }

  function mountProgress() {
    const head = document.querySelector('.progress-page-head') || findPageHead('PROGRESS')
    const dashboard = document.getElementById('lmf-progress-dashboard-v1') || document.querySelector('.lmf-progress-dashboard')
    if (!(head instanceof HTMLElement) || !(dashboard instanceof HTMLElement)) return

    head.classList.add('lmf-approved-progress-head-v1')
    dashboard.classList.add('lmf-approved-progress-v1')

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
    updateExerciseSidebar(layout)
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

  function mount() {
    timer = 0
    const active = currentRoute()
    if (!active) {
      document.documentElement.removeAttribute('data-lmf-approved-route')
      return
    }
    document.documentElement.setAttribute('data-lmf-approved-route', active)
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
