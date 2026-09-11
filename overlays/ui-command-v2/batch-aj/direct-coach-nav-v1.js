(() => {
  'use strict'

  const COACH_SELECTOR = '[data-lmf-direct-coach="true"]'

  function currentRoute() {
    const raw = String(location.hash || '#/home').replace(/^#\//, '').split(/[?&]/)[0]
    return raw || 'home'
  }

  function syncCoachNav() {
    const nav = document.querySelector('.navbar')
    if (!(nav instanceof HTMLElement)) return

    let coach = nav.querySelector(COACH_SELECTOR)
    if (!(coach instanceof HTMLAnchorElement)) {
      coach = document.createElement('a')
      coach.className = 'nav-item lmf-direct-coach-nav'
      coach.dataset.lmfDirectCoach = 'true'
      coach.href = '#/coach'
      coach.setAttribute('aria-label', 'Coach')
      coach.innerHTML = '<span aria-hidden="true">◉</span>Coach'

      const more = Array.from(nav.querySelectorAll('a.nav-item')).find((item) => item.getAttribute('href') === '#/more')
      if (more) nav.insertBefore(coach, more)
      else nav.appendChild(coach)
    }

    nav.classList.add('lmf-navbar-has-coach')
    const route = currentRoute()
    coach.classList.toggle('active', route === 'coach')
    coach.setAttribute('aria-current', route === 'coach' ? 'page' : 'false')

    const more = Array.from(nav.querySelectorAll('a.nav-item')).find((item) => item.getAttribute('href') === '#/more')
    if (more instanceof HTMLElement && route === 'coach') more.classList.remove('active')
  }

  let frame = 0
  function scheduleSync() {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(syncCoachNav)
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
