(() => {
  'use strict'

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const Phrase = window.SpeechRecognitionPhrase
  const NOTE_PATTERN = /\b(note|notes|comment|comments|observation|observations)\b/i
  const enhanced = new WeakSet()
  let active = null
  let scanQueued = false
  let toastTimer = 0

  const TRAINING_TERMS = [
    'RPE','RIR','AMRAP','EMOM','E2MOM','1RM','e1RM','training max','plates per side',
    'Front Squat','Back Squat','Bench Press','Deadlift','Overhead Press','OHP',
    'Romanian Deadlift','RDL','Snatch-Grip RDL','Belt Squat','Leg Extension',
    'Lat Pulldown','Cable Row','Glute Drive','Lateral Raise','Rear Delt Fly','Face Pull',
    'Power Clean','Hang Power Clean','Clean Pull','High Pull','Kettlebell','Sled Push','Sled Drag',
    'Farmer Carry','Suitcase Carry','Overhead Carry','Yoke','tempo','reps','sets','pounds','kilograms',
    'Crownforge','Black Crown','deload','top set','back-off set','warm-up set','working set',
  ]

  const CANONICAL = [
    [/\br\s*p\s*e\b/gi, 'RPE'],
    [/\bare\s+p\s*e\b/gi, 'RPE'],
    [/\br\s*i\s*r\b/gi, 'RIR'],
    [/\bo\s*h\s*p\b/gi, 'OHP'],
    [/\ba\s*m\s*r\s*a\s*p\b/gi, 'AMRAP'],
    [/\be\s*m\s*o\s*m\b/gi, 'EMOM'],
    [/\bone rep max\b/gi, '1RM'],
    [/\bestimated one rep max\b/gi, 'e1RM'],
    [/\bdead lift\b/gi, 'Deadlift'],
    [/\bkettle bell\b/gi, 'Kettlebell'],
    [/\bfront squat\b/gi, 'Front Squat'],
    [/\bback squat\b/gi, 'Back Squat'],
    [/\bbench press\b/gi, 'Bench Press'],
    [/\boverhead press\b/gi, 'Overhead Press'],
    [/\bromanian deadlift\b/gi, 'Romanian Deadlift'],
    [/\bsnatch grip rdl\b/gi, 'Snatch-Grip RDL'],
    [/\bbelt squat\b/gi, 'Belt Squat'],
    [/\bleg extension\b/gi, 'Leg Extension'],
    [/\blat pulldown\b/gi, 'Lat Pulldown'],
    [/\bcable row\b/gi, 'Cable Row'],
    [/\bglute drive\b/gi, 'Glute Drive'],
    [/\blateral raise\b/gi, 'Lateral Raise'],
    [/\brear delt fly\b/gi, 'Rear Delt Fly'],
    [/\bface pull\b/gi, 'Face Pull'],
    [/\bpower clean\b/gi, 'Power Clean'],
    [/\bhang power clean\b/gi, 'Hang Power Clean'],
    [/\bclean pull\b/gi, 'Clean Pull'],
    [/\bfarmer carry\b/gi, 'Farmer Carry'],
    [/\bsuitcase carry\b/gi, 'Suitcase Carry'],
    [/\boverhead carry\b/gi, 'Overhead Carry'],
    [/\bcrown forge\b/gi, 'Crownforge'],
    [/\bblack crown\b/gi, 'Black Crown'],
  ]

  const NUMBER_WORDS = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10 }

  function fieldText(el) {
    const bits = [el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('data-label'), el.getAttribute('data-note-field')].filter(Boolean)
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
        if (label) bits.push(label.textContent || '')
      } catch (_) {}
    }
    const parent = el.closest('label,.field,.form-field,.input-group,.setting-row,.workout-note,.notes,.note-field')
    if (parent) bits.push(parent.textContent || '')
    return bits.join(' ')
  }

  function isEligible(el) {
    if (!(el instanceof HTMLElement)) return false
    if (el.matches('[disabled],[readonly],[aria-disabled="true"]')) return false
    if (el.matches('textarea')) return NOTE_PATTERN.test(fieldText(el)) || el.hasAttribute('data-note-field')
    if (el.matches('input[type="text"],input:not([type])')) return NOTE_PATTERN.test(fieldText(el))
    if (el.isContentEditable) return NOTE_PATTERN.test(fieldText(el))
    return false
  }

  function setValue(el, value) {
    if (el instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      if (setter) setter.call(el, value); else el.value = value
    } else if (el instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(el, value); else el.value = value
    } else if (el.isContentEditable) {
      el.textContent = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function currentValue(el) {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || ''
    return el.textContent || ''
  }

  function normalizeRating(text, label) {
    const words = Object.keys(NUMBER_WORDS).join('|')
    const re = new RegExp(`\\b${label}\\s+(${words})(?:\\s+point\\s+(zero|five))?\\b`, 'gi')
    return text.replace(re, (_, whole, decimal) => `${label} ${NUMBER_WORDS[whole.toLowerCase()]}${decimal ? `.${NUMBER_WORDS[decimal.toLowerCase()]}` : ''}`)
  }

  function normalizeTranscript(raw) {
    let text = String(raw || '').replace(/\s+/g, ' ').trim()
    if (!text) return ''
    for (const [pattern, replacement] of CANONICAL) text = text.replace(pattern, replacement)
    text = normalizeRating(text, 'RPE')
    text = normalizeRating(text, 'RIR')
    text = text.replace(/\b(\d+(?:\.\d+)?)\s*(?:pounds?|lbs?)\b/gi, '$1 lb')
    text = text.replace(/\b(\d+(?:\.\d+)?)\s*(?:kilograms?|kgs?)\b/gi, '$1 kg')
    text = text.replace(/\b(\d+)\s+sets?\s+(?:of\s+)?(\d+)\s+reps?\b/gi, '$1×$2')
    text = text.replace(/\b(\d+)\s+by\s+(\d+)\b/gi, '$1×$2')
    return text
  }

  function appendTranscript(el, transcript) {
    const clean = normalizeTranscript(transcript)
    if (!clean) return
    const current = currentValue(el)
    const spacer = current && !/[\s\n]$/.test(current) ? ' ' : ''
    setValue(el, `${current}${spacer}${clean}`)
    try {
      el.focus({ preventScroll: true })
      if ('selectionStart' in el && typeof el.selectionStart === 'number') {
        const end = currentValue(el).length
        el.setSelectionRange(end, end)
      }
    } catch (_) {}
  }

  function ensureToast() {
    let toast = document.querySelector('.lmf-voice-note-toast')
    if (toast) return toast
    toast = document.createElement('div')
    toast.className = 'lmf-voice-note-toast'
    toast.setAttribute('role', 'status')
    toast.setAttribute('aria-live', 'polite')
    document.body.appendChild(toast)
    return toast
  }

  function showToast(message, kind = '') {
    const toast = ensureToast()
    toast.textContent = message
    toast.dataset.kind = kind
    toast.classList.add('is-visible')
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3200)
  }

  function localContextPhrases(field) {
    const out = []
    const scope = field.closest('.exercise-card,.workout-card,.library-card,.lmf-flow-panel,.session-card,.panel,.card') || field.parentElement
    if (scope) {
      scope.querySelectorAll('h1,h2,h3,h4,.exercise-name,.exercise-title,.movement-name,.lmf-compact-title').forEach((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
        if (text && text.length <= 64) out.push(text)
      })
    }
    document.querySelectorAll('[data-exercise-art]').forEach((el) => {
      const slug = el.getAttribute('data-exercise-art')
      if (slug && slug.length <= 64) out.push(slug.replace(/-/g, ' '))
    })
    return [...new Set(out)].slice(0, 24)
  }

  function addContextBias(recognition, field) {
    if (!Phrase || !('phrases' in recognition)) return false
    try {
      const local = localContextPhrases(field).map((phrase) => new Phrase(phrase, 6.0))
      const core = TRAINING_TERMS.map((phrase) => new Phrase(phrase, /^(RPE|RIR|AMRAP|EMOM|E2MOM|1RM|e1RM|OHP|RDL)$/.test(phrase) ? 6.0 : 4.0))
      recognition.phrases = [...local, ...core]
      return true
    } catch (_) {
      return false
    }
  }

  function chooseAlternative(result) {
    const candidates = []
    for (let i = 0; i < result.length; i += 1) {
      const alt = result[i]
      const transcript = String(alt?.transcript || '')
      const normalized = normalizeTranscript(transcript)
      let score = Number(alt?.confidence || 0)
      for (const term of TRAINING_TERMS) {
        if (normalized.toLowerCase().includes(term.toLowerCase())) score += 0.08
      }
      if (/\b(?:RPE|RIR|AMRAP|EMOM|1RM|e1RM|OHP|RDL)\b/.test(normalized)) score += 0.15
      if (/\b\d+(?:\.\d+)?\s*(?:lb|kg)\b/i.test(normalized)) score += 0.08
      candidates.push({ transcript, score })
    }
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0]?.transcript || result[0]?.transcript || ''
  }

  function resetActive(message) {
    if (!active) return
    const { button } = active
    button.classList.remove('is-listening','is-preparing')
    button.setAttribute('aria-pressed', 'false')
    button.innerHTML = '<span aria-hidden="true">🎙</span><span>VOICE NOTE</span><small>SMART</small>'
    button.setAttribute('aria-label', 'Start smart voice note transcription')
    active = null
    if (message) showToast(message)
  }

  function stopActive() {
    if (!active) return
    try { active.recognition.stop() } catch (_) {}
  }

  async function configureLocalMode(recognition, lang) {
    if (!window.SpeechRecognition || typeof window.SpeechRecognition.available !== 'function' || !('processLocally' in recognition)) return 'browser'
    try {
      const options = { langs: [lang], processLocally: true, quality: 'dictation' }
      const status = await window.SpeechRecognition.available(options)
      if (status === 'available') {
        recognition.processLocally = true
        return 'on-device'
      }
      if ((status === 'downloadable' || status === 'downloading') && typeof window.SpeechRecognition.install === 'function') {
        showToast('Optimizing voice dictation for this device…')
        const installed = await window.SpeechRecognition.install(options)
        if (installed) {
          recognition.processLocally = true
          return 'on-device'
        }
      }
    } catch (_) {}
    try { recognition.processLocally = false } catch (_) {}
    return 'browser'
  }

  async function startRecognition(field, button, retryWithoutPhrases = false) {
    if (!Recognition) {
      showToast('Voice transcription is not supported in this browser.', 'error')
      return
    }
    if (active) {
      if (active.field === field) { stopActive(); return }
      stopActive()
    }

    const recognition = new Recognition()
    const lang = document.documentElement.lang || navigator.language || 'en-US'
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3
    if ('unspokenPunctuation' in recognition) {
      try { recognition.unspokenPunctuation = true } catch (_) {}
    }
    const phrasesApplied = retryWithoutPhrases ? false : addContextBias(recognition, field)

    active = { recognition, field, button, phrasesApplied, retryWithoutPhrases }
    button.classList.add('is-preparing')
    button.setAttribute('aria-pressed', 'true')
    button.innerHTML = '<span class="lmf-voice-pulse" aria-hidden="true"></span><span>PREPARING…</span><small>SMART</small>'
    button.setAttribute('aria-label', 'Preparing smart voice note transcription')

    const mode = await configureLocalMode(recognition, lang)
    if (!active || active.recognition !== recognition) return

    recognition.onstart = () => {
      if (!active || active.recognition !== recognition) return
      button.classList.remove('is-preparing')
      button.classList.add('is-listening')
      button.innerHTML = '<span class="lmf-voice-pulse" aria-hidden="true"></span><span>LISTENING…</span><small>SMART</small>'
      button.setAttribute('aria-label', 'Stop smart voice note transcription')
      showToast(mode === 'on-device' ? 'Smart dictation ready — on-device.' : 'Smart dictation ready — speak your note.')
    }

    recognition.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = chooseAlternative(result)
        if (result.isFinal) appendTranscript(field, text)
        else interim += text
      }
      if (interim && active?.recognition === recognition) button.dataset.heard = normalizeTranscript(interim).slice(0, 80)
    }

    recognition.onerror = (event) => {
      if (event.error === 'phrases-not-supported' && phrasesApplied && !retryWithoutPhrases) {
        resetActive()
        startRecognition(field, button, true)
        return
      }
      const messages = {
        'not-allowed': 'Microphone permission was denied.',
        'service-not-allowed': 'Speech transcription is blocked on this device.',
        'audio-capture': 'No microphone was available.',
        'no-speech': 'No speech was detected.',
        network: 'Speech transcription needs a network connection.',
        'language-not-supported': 'This dictation language is not supported on-device; retrying with browser speech.',
      }
      const message = messages[event.error] || 'Voice transcription stopped.'
      resetActive()
      showToast(message, event.error === 'no-speech' ? '' : 'error')
    }

    recognition.onend = () => {
      if (active?.recognition === recognition) resetActive('Smart voice note added to your notes.')
    }

    try { recognition.start() }
    catch (_) {
      resetActive()
      showToast('Could not start the microphone. Try again.', 'error')
    }
  }

  function addButton(field) {
    if (enhanced.has(field) || field.dataset.lmfVoiceEnhanced === '2' || !isEligible(field)) return
    enhanced.add(field)
    field.dataset.lmfVoiceEnhanced = '2'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lmf-voice-note-btn lmf-voice-note-v2'
    button.setAttribute('aria-pressed', 'false')
    button.setAttribute('aria-label', 'Start smart voice note transcription')
    button.innerHTML = '<span aria-hidden="true">🎙</span><span>VOICE NOTE</span><small>SMART</small>'
    button.addEventListener('click', () => startRecognition(field, button))
    field.insertAdjacentElement('afterend', button)
  }

  function scan() {
    scanQueued = false
    document.querySelectorAll('textarea,input[type="text"],input:not([type]),[contenteditable="true"]').forEach(addButton)
  }

  function queueScan() {
    if (scanQueued) return
    scanQueued = true
    requestAnimationFrame(scan)
  }

  function boot() {
    queueScan()
    const observer = new MutationObserver(queueScan)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('visibilitychange', () => { if (document.hidden && active) stopActive() })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
