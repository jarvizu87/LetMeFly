(() => {
  'use strict'

  const PACK_ID = 'train-heroes-v1'
  const FALLBACK_KEY = 'accessory-recovery-work-capacity'
  const ROOT = '/ui/train-heroes-v1/'
  const HEROES = Object.freeze({
    'squat-lower-strength': ROOT + 'train-hero-v1-squat-lower-strength.webp',
    'bench-upper-push': ROOT + 'train-hero-v1-bench-upper-push.webp',
    'deadlift-posterior-chain': ROOT + 'train-hero-v1-deadlift-posterior-chain.webp',
    'olympic-explosive': ROOT + 'train-hero-v1-olympic-explosive.webp',
    'conditioning-carries': ROOT + 'train-hero-v1-conditioning-carries.webp',
    'accessory-recovery-work-capacity': ROOT + 'train-hero-v1-accessory-recovery-work-capacity.webp',
    'yoke-trap-strength': ROOT + 'train-hero-v1-yoke-trap-strength.webp',
    'overhead-vertical-strength': ROOT + 'train-hero-v1-overhead-vertical-strength.webp',
    'realization-testing-crown-day': ROOT + 'train-hero-v1-realization-testing-crown-day.webp',
  })

  const REALIZATION = /\b(?:testing|test day|1\s*rm|max(?:imum)?(?:\s+(?:effort|attempt))?|pr(?:\s+attempt)?|peak(?:ing)?|crown day|realization\s+(?:test|testing|peak|crown))\b/i
  const RULES = Object.freeze([
    ['yoke-trap-strength', /\byoke\b|\btrap(?:s)?\b|\bshrug(?:s)?\b|\bupper[- ]back\b/i],
    ['olympic-explosive', /\b(?:power\s+|hang\s+|muscle\s+)?clean\b|\bsnatch\b|\bhigh[- ]?pull\b|\bclean pull\b|\bsnatch pull\b|\bolympic\b|\bjump shrug\b|\bexplosive pull\b/i],
    ['overhead-vertical-strength', /\boverhead press\b|\bstrict press\b|\bpush press\b|\bohp\b|\bjerk\b|\bvertical strength\b/i],
    ['deadlift-posterior-chain', /\bdeadlift\b|\brdl\b|\bromanian deadlift\b|\bhinge\b|\bposterior[- ]chain\b|\bblock pull\b|\brack pull\b|\bgood morning\b/i],
    ['squat-lower-strength', /\bsquat\b|\bleg press\b|\blunge\b|\bsplit squat\b|\blower[- ](?:body|strength)\b|\bquad(?:s)?\b/i],
    ['conditioning-carries', /\bconditioning\b|\bsled\b|\bfarmer(?:'s)? carry\b|\bcarry\b|\bwork[- ]capacity\b|\brow(?:er| erg)?\b|\bbike\b|\bincline walk\b/i],
    ['bench-upper-push', /\bbench(?: press)?\b|\bchest press\b|\bincline (?:db |dumbbell |barbell )?press\b|\bdumbbell press\b|\bdb press\b|\bhorizontal press\b|\bchest\b/i],
  ])

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim()
  const texts = nodes => [...nodes].map(node => clean(node.textContent)).filter(Boolean)
  const asList = value => Array.isArray(value) ? value.map(clean).filter(Boolean) : value ? [clean(value)] : []
  const normalize = input => {
    if (typeof input === 'string') return {titles:[clean(input)], blocks:[], exercises:[]}
    return {
      titles: asList(input?.titles ?? input?.title),
      blocks: asList(input?.blocks),
      exercises: asList(input?.exercises),
    }
  }
  const scoreParts = (parts, regex, weight) => parts.reduce((score, part) => score + (regex.test(part) ? weight : 0), 0)

  function selectKey(input) {
    const descriptor = normalize(input)
    if ([...descriptor.titles, ...descriptor.blocks].some(value => REALIZATION.test(value))) return 'realization-testing-crown-day'

    let bestKey = FALLBACK_KEY
    let bestScore = 0
    for (const [key, regex] of RULES) {
      const score = scoreParts(descriptor.titles, regex, 20) + scoreParts(descriptor.blocks, regex, 6) + scoreParts(descriptor.exercises, regex, 3)
      if (score > bestScore) {
        bestKey = key
        bestScore = score
      }
    }
    return bestKey
  }

  function currentDescriptor(shell) {
    const selectedDay = shell.querySelector('.day-strip .day-chip.active, .day-strip .day-chip[aria-current="true"], .day-strip .day-chip[aria-selected="true"], .day-strip .day-chip.is-active, .day-strip .day-chip[data-active="true"]')
    const header = shell.querySelector('.train-header')
    const titles = [
      clean(selectedDay?.textContent),
      clean(header?.querySelector('.page-kicker')?.textContent),
      clean(header?.querySelector('h1')?.textContent),
      clean(header?.querySelector('h2')?.textContent),
    ].filter(Boolean)
    const blocks = texts(shell.querySelectorAll('#swipe-viewport .workout-panel-head h2, #swipe-viewport .workout-panel-head .muted'))
    const exercises = texts(shell.querySelectorAll('#swipe-viewport .exercise-title h3, #swipe-viewport .preview-card h3, #swipe-viewport .active-exercise h3'))
    return {titles, blocks, exercises}
  }

  function applyHero(shell) {
    const header = shell?.querySelector('.train-header.lmf-reference-train-hero, .train-header')
    const art = header?.querySelector('.lmf-reference-train-art')
    const image = art?.querySelector('img')
    if (!header || !art || !image) return false

    const key = selectKey(currentDescriptor(shell))
    const url = HEROES[key] || HEROES[FALLBACK_KEY]
    if (art.dataset.lmfTrainHeroKey === key && image.getAttribute('src') === url) return true

    image.onerror = () => {
      if (image.dataset.lmfHeroFallbackApplied === '1') return
      image.dataset.lmfHeroFallbackApplied = '1'
      image.src = HEROES[FALLBACK_KEY]
      art.dataset.lmfTrainHeroKey = FALLBACK_KEY
      shell.dataset.lmfTrainHeroKey = FALLBACK_KEY
    }
    image.dataset.lmfHeroFallbackApplied = '0'
    image.setAttribute('src', url)
    image.setAttribute('decoding', 'async')
    image.setAttribute('fetchpriority', 'high')
    image.setAttribute('alt', '')
    art.dataset.lmfTrainHeroPack = PACK_ID
    art.dataset.lmfTrainHeroKey = key
    shell.dataset.lmfTrainHeroPack = PACK_ID
    shell.dataset.lmfTrainHeroKey = key
    return true
  }

  let queued = false
  function update() {
    if (typeof document === 'undefined') return false
    const shell = location.hash.split('?')[0] === '#/train' ? document.querySelector('.train-shell') : null
    return shell ? applyHero(shell) : false
  }
  function schedule() {
    if (queued || typeof requestAnimationFrame !== 'function') return
    queued = true
    requestAnimationFrame(() => { queued = false; update() })
  }

  const api = Object.freeze({packId:PACK_ID, fallbackKey:FALLBACK_KEY, heroes:HEROES, selectKey, update})
  if (typeof window !== 'undefined') window.__LMF_TRAIN_HERO_V1__ = api
  if (typeof document === 'undefined') return

  const boot = () => {
    schedule()
    new MutationObserver(records => {
      if (records.some(record => record.type === 'childList' || record.type === 'characterData' || ['class','aria-current','aria-selected'].includes(record.attributeName))) schedule()
    }).observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['class','aria-current','aria-selected']})
    document.addEventListener('click', event => {
      if (!event.target.closest?.('.day-strip .day-chip, [data-action="start-workout"], [data-reference-resume]')) return
      schedule()
      setTimeout(schedule, 40)
      setTimeout(schedule, 120)
    }, true)
    window.addEventListener('hashchange', schedule)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true})
  else boot()
})()
