(() => {
  'use strict'

  // LetMeFly More Workspace v1
  // Presentation/navigation only. This layer does not write athlete data,
  // program prescriptions, workout history, readiness, or training maxes.

  const ROUTE = '#/more'
  const CARDS = [
    {
      key: 'calendar', icon: '▦', title: 'Calendar', route: '#/calendar',
      copy: 'View and manage your training schedule.', action: 'View Calendar'
    },
    {
      key: 'nutrition', icon: '∥', title: 'Nutrition', route: '#/coach',
      copy: 'Ask Coach about fueling, hydration, and nutrition support.', action: 'Ask Coach'
    },
    {
      key: 'readiness', icon: '♥', title: 'Readiness', route: '#/train',
      copy: 'Review sleep, energy, soreness, stress, and daily readiness.', action: 'Check Readiness'
    },
    {
      key: 'testing', icon: '▥', title: 'Testing', route: '#/program',
      copy: 'Review test weeks, phase checks, benchmarks, and TM decisions.', action: 'View Testing'
    },
    {
      key: 'utilities', icon: '✦', title: 'Utilities', route: '#/train',
      copy: 'Use workout tools, bar loading guidance, and exercise actions.', action: 'Open Utilities'
    },
    {
      key: 'resources', icon: '▤', title: 'Resources', route: '#/exercises',
      copy: 'Exercise library, coaching cues, videos, and substitutions.', action: 'Browse Resources'
    },
    {
      key: 'data', icon: '⇩', title: 'Data & Backup', route: '#/profile',
      copy: 'Export, restore, migrate, and protect your athlete data.', action: 'Manage Data'
    },
    {
      key: 'settings', icon: '⚙', title: 'Settings', route: '#/settings',
      copy: 'App preferences, equipment, display, and units.', action: 'Open Settings'
    },
    {
      key: 'support', icon: '?', title: 'Help & Support', route: '#/coach',
      copy: 'Get training guidance and in-app help from Coach.', action: 'Get Help'
    }
  ]

  let timer = 0

  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

  function active() {
    return location.hash === ROUTE || location.hash.startsWith(`${ROUTE}?`)
  }

  function cardMarkup(item) {
    return `
      <a class="more-card lmf-more-card-v1" data-lmf-more-key="${esc(item.key)}" href="${esc(item.route)}">
        <span class="lmf-more-card-icon-v1" aria-hidden="true">${esc(item.icon)}</span>
        <div class="lmf-more-card-copy-v1">
          <strong>${esc(item.title)}</strong>
          <small>${esc(item.copy)}</small>
          <em>${esc(item.action)} <b aria-hidden="true">›</b></em>
        </div>
        <i aria-hidden="true">›</i>
      </a>`
  }

  function sidebarMarkup() {
    return `
      <div class="lmf-more-sidebar-title-v1">
        <strong>MORE</strong>
        <small>Tools. Resources. Settings.<br>All in one place.</small>
      </div>
      <nav class="lmf-more-sidebar-nav-v1" aria-label="More tools">
        <button type="button" class="is-active" data-lmf-more-scroll="top"><span aria-hidden="true">⌂</span>Overview</button>
        ${CARDS.map((item) => `<a href="${esc(item.route)}"><span aria-hidden="true">${esc(item.icon)}</span>${esc(item.title)}</a>`).join('')}
        <button type="button" data-lmf-more-scroll="about"><span aria-hidden="true">i</span>About</button>
      </nav>
      <div class="lmf-more-sidebar-motto-v1">
        <blockquote>“Discipline gives you options and freedom.”</blockquote>
        <small>— RAIZEN</small>
      </div>`
  }

  function makeSidebar(root, head) {
    let sidebar = root.querySelector(':scope > .lmf-more-sidebar-v1')
    if (sidebar instanceof HTMLElement) return sidebar
    sidebar = document.createElement('aside')
    sidebar.className = 'lmf-more-sidebar-v1'
    sidebar.innerHTML = sidebarMarkup()
    root.insertBefore(sidebar, head)
    return sidebar
  }

  function makeAbout(root, brand) {
    let about = root.querySelector(':scope > .lmf-more-about-v1')
    if (about instanceof HTMLElement) return about
    about = document.createElement('section')
    about.className = 'lmf-more-about-v1'
    about.id = 'lmf-more-about-v1'
    about.innerHTML = `
      <div>
        <span>ABOUT LETMEFLY</span>
        <strong>One system. One athlete. One source of training truth.</strong>
        <p>LetMeFly keeps your program, athlete profile, workout history, exercise intelligence, and coaching tools connected without changing program prescriptions just for presentation.</p>
      </div>`
    if (brand?.nextSibling) root.insertBefore(about, brand.nextSibling)
    else root.appendChild(about)
    return about
  }

  function addBrandQuote(brand) {
    if (!(brand instanceof HTMLElement) || brand.querySelector('.lmf-more-brand-quote-v1')) return
    const quote = document.createElement('div')
    quote.className = 'lmf-more-brand-quote-v1'
    quote.innerHTML = '<strong>A stronger tomorrow is built by a more prepared today.</strong><small>DISCIPLINE BUILDS FREEDOM</small>'
    brand.appendChild(quote)
  }

  function wire(root, sidebar, head, about) {
    if (root.dataset.lmfMoreWired === 'true') return
    root.dataset.lmfMoreWired = 'true'
    root.addEventListener('click', (event) => {
      const control = event.target instanceof Element ? event.target.closest('[data-lmf-more-scroll]') : null
      if (!(control instanceof HTMLButtonElement)) return
      const showAbout = control.dataset.lmfMoreScroll === 'about'
      about.classList.toggle('is-visible', showAbout)
      const target = showAbout ? about : head
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      sidebar.querySelectorAll('[data-lmf-more-scroll]').forEach((button) => button.classList.toggle('is-active', button === control))
    })
  }

  function mount() {
    timer = 0
    if (!active()) return
    const grid = document.querySelector('.command-menu-grid')
    if (!(grid instanceof HTMLElement)) return
    const root = grid.parentElement
    if (!(root instanceof HTMLElement)) return

    const head = root.querySelector(':scope > .page-head') || grid.previousElementSibling
    if (!(head instanceof HTMLElement)) return
    const brand = root.querySelector(':scope > .more-brand')

    root.classList.add('lmf-more-v1')
    head.classList.add('lmf-more-hero-v1')
    head.innerHTML = `
      <div class="lmf-more-hero-copy-v1">
        <div class="page-kicker">Everything else</div>
        <h1>MORE</h1>
        <p>Everything else you need to stay on course.</p>
      </div>
      <div class="lmf-more-hero-motto-v1"><strong>Same discipline.<br>More tools.<br>Stronger results.</strong><span aria-hidden="true">♛</span></div>`

    const sidebar = makeSidebar(root, head)
    grid.classList.add('lmf-more-grid-v1')
    if (grid.dataset.lmfMoreV1 !== 'true') {
      grid.dataset.lmfMoreV1 = 'true'
      grid.innerHTML = CARDS.map(cardMarkup).join('')
    }

    if (brand instanceof HTMLElement) {
      brand.classList.add('lmf-more-brand-v1')
      addBrandQuote(brand)
    }
    const about = makeAbout(root, brand)
    wire(root, sidebar, head, about)
  }

  function schedule() {
    if (timer) return
    timer = window.setTimeout(mount, 24)
  }

  window.addEventListener('hashchange', schedule)
  window.addEventListener('pageshow', schedule)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule() })
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true })
  schedule()
})()
