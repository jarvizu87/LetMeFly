(() => {
  'use strict'

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  const NOTE_PATTERN = /\b(note|notes|comment|comments|observation|observations)\b/i
  const enhanced = new WeakSet()
  let active = null
  let scanQueued = false
  let toastTimer = 0

  function fieldText(el) {
    const bits = [
      el.getAttribute('name'),
      el.id,
      el.getAttribute('placeholder'),
      el.getAttribute('aria-label'),
      el.getAttribute('data-label'),
      el.getAttribute('data-note-field'),
    ].filter(Boolean)

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
      if (setter) setter.call(el, value)
      else el.value = value
    } else if (el instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (setter) setter.call(el, value)
      else el.value = value
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

  function appendTranscript(el, transcript) {
    const clean = String(transcript || '').trim()
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
    toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600)
  }

  function resetActive(message) {
    if (!active) return
    const { button } = active
    button.classList.remove('is-listening')
    button.setAttribute('aria-pressed', 'false')
    button.innerHTML = '<span aria-hidden="true">🎙</span><span>VOICE NOTE</span>'
    button.setAttribute('aria-label', 'Start voice note transcription')
    active = null
    if (message) showToast(message)
  }

  function stopActive() {
    if (!active) return
    try { active.recognition.stop() } catch (_) {}
  }

  function startRecognition(field, button) {
    if (!SpeechRecognition) {
      showToast('Voice transcription is not supported in this browser.', 'error')
      return
    }

    if (active) {
      if (active.field === field) {
        stopActive()
        return
      }
      stopActive()
    }

    const recognition = new SpeechRecognition()
    recognition.lang = document.documentElement.lang || navigator.language || 'en-US'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    active = { recognition, field, button }
    button.classList.add('is-listening')
    button.setAttribute('aria-pressed', 'true')
    button.innerHTML = '<span class="lmf-voice-pulse" aria-hidden="true"></span><span>LISTENING…</span>'
    button.setAttribute('aria-label', 'Stop voice note transcription')

    recognition.onstart = () => showToast('Listening — speak your note.')
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal && result[0]?.transcript) appendTranscript(field, result[0].transcript)
      }
    }
    recognition.onerror = (event) => {
      const messages = {
        'not-allowed': 'Microphone permission was denied.',
        'service-not-allowed': 'Speech transcription is blocked on this device.',
        'audio-capture': 'No microphone was available.',
        'no-speech': 'No speech was detected.',
        network: 'Speech transcription needs a network connection.',
      }
      const message = messages[event.error] || 'Voice transcription stopped.'
      resetActive()
      showToast(message, 'error')
    }
    recognition.onend = () => {
      if (active?.recognition === recognition) resetActive('Voice note added to your notes.')
    }

    try {
      recognition.start()
    } catch (_) {
      resetActive()
      showToast('Could not start the microphone. Try again.', 'error')
    }
  }

  function addButton(field) {
    if (enhanced.has(field) || field.dataset.lmfVoiceEnhanced === '1' || !isEligible(field)) return
    enhanced.add(field)
    field.dataset.lmfVoiceEnhanced = '1'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lmf-voice-note-btn'
    button.setAttribute('aria-pressed', 'false')
    button.setAttribute('aria-label', 'Start voice note transcription')
    button.innerHTML = '<span aria-hidden="true">🎙</span><span>VOICE NOTE</span>'
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
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && active) stopActive()
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true })
  else boot()
})()
