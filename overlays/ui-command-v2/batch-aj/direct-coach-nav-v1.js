(() => {
  'use strict'

  const EXERCISES_SELECTOR = '[data-lmf-direct-exercises="true"]'
  const COACH_SELECTOR = '[data-lmf-direct-coach="true"]'

  function currentRoute() {
    const raw = String(location.hash || '#/home').replace(/^#\//, '').split(/[?&]/)[0]
    return raw || 'home'
  }

  function ensureLink(nav, selector, config) {
    let link = nav.querySelector(selector)
    if (link instanceof HTMLAnchorElement) return link
    link = document.createElement('a')
    link.className = `nav-item ${config.className}`
    link.dataset[config.datasetKey] = 'true'
    link.href = config.href
    link.setAttribute('aria-label', config.label)
    link.innerHTML = `<span aria-hidden="true">${config.icon}</span>${config.label}`
    return link
  }

  function syncPrimaryNav() {
    const nav = document.querySelector('.navbar')
    if (!(nav instanceof HTMLElement)) return

    const more = Array.from(nav.querySelectorAll('a.nav-item')).find((item) => item.getAttribute('href') === '#/more') || null
    const exercises = ensureLink(nav, EXERCISES_SELECTOR, {
      className: 'lmf-direct-exercises-nav', datasetKey: 'lmfDirectExercises', href: '#/exercises', label: 'Exercises', icon: '▤'
    })
    const coach = ensureLink(nav, COACH_SELECTOR, {
      className: 'lmf-direct-coach-nav', datasetKey: 'lmfDirectCoach', href: '#/coach', label: 'Coach', icon: '◉'
    })

    // The desktop Profile shortcut may sit before More. Share that boundary
    // with its owner so the two navigation observers never move each other.
    if (more instanceof HTMLElement) {
      const tail = nav.querySelector('.lmf-reference-profile-nav') || more
      if (coach.parentNode !== nav || coach.nextElementSibling !== tail) nav.insertBefore(coach, tail)
      if (exercises.parentNode !== nav || exercises.nextElementSibling !== coach) nav.insertBefore(exercises, coach)
    } else {
      if (exercises.parentNode !== nav) nav.appendChild(exercises)
      if (coach.parentNode !== nav) nav.appendChild(coach)
    }

    nav.classList.add('lmf-navbar-has-coach', 'lmf-navbar-has-primary-shortcuts')
    const route = currentRoute()
    for (const [link, target] of [[exercises, 'exercises'], [coach, 'coach']]) {
      link.classList.toggle('active', route === target)
      link.setAttribute('aria-current', route === target ? 'page' : 'false')
    }
    if (more instanceof HTMLElement && ['coach', 'exercises'].includes(route)) more.classList.remove('active')
  }

  let frame = 0
  function scheduleSync() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(syncPrimaryNav)
  }

  window.addEventListener('hashchange', scheduleSync)
  window.addEventListener('popstate', scheduleSync)
  document.addEventListener('DOMContentLoaded', scheduleSync, { once:true })

  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === 'childList')) scheduleSync()
  })
  observer.observe(document.documentElement, { childList:true, subtree:true })

  scheduleSync()
  setTimeout(scheduleSync, 350)
  setTimeout(scheduleSync, 1000)
})()
