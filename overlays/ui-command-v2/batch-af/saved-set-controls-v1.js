(() => {
  'use strict'

  // LetMeFly Saved Set Recovery v1
  // This layer never persists workout data directly. Edit, Undo, and Restore
  // always delegate completion/reopen/save to the native LetMeFly set button.
  const SAVED_SET_ACTIONS = Object.freeze({
    edit: 'Edit',
    undo: 'Undo',
    restore: 'Restore',
  })

  const recovery = new Map()
  let nativeToggleInFlight = null
  let refreshTimer = 0

  const rows = () => [...document.querySelectorAll('.set-row[data-set-id]')]
  const isDone = row => Boolean(row?.querySelector('.set-check[data-action="toggle-set"]')?.classList.contains('done'))
  const setIdFor = row => String(row?.dataset?.setId || '')
  const inputValue = (row, selector) => String(row?.querySelector(selector)?.value ?? '')

  function snapshotRow(row) {
    return {
      reps: inputValue(row, '.reps-input'),
      load: inputValue(row, '.load-input'),
      rpe: inputValue(row, '.rpe-input'),
    }
  }

  function setInput(row, selector, value) {
    const input = row?.querySelector(selector)
    if (!(input instanceof HTMLInputElement)) return
    input.value = String(value ?? '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function applySnapshot(row, snapshot) {
    if (!row || !snapshot) return
    setInput(row, '.reps-input', snapshot.reps)
    setInput(row, '.load-input', snapshot.load)
    setInput(row, '.rpe-input', snapshot.rpe)
  }

  function findRow(setId) {
    return rows().find(row => setIdFor(row) === setId) || null
  }

  function scheduleForRow(setId, callback) {
    let finished = false
    for (const delay of [30, 100, 220, 420, 700]) {
      window.setTimeout(() => {
        if (finished) return
        const row = findRow(setId)
        if (!row) return
        finished = callback(row) === true
      }, delay)
    }
  }

  function nativeSetToggle(row, reason) {
    const setId = setIdFor(row)
    const button = row?.querySelector('.set-check[data-action="toggle-set"]')
    if (!setId || !(button instanceof HTMLButtonElement)) return false
    nativeToggleInFlight = { setId, reason }
    try {
      button.click()
    } finally {
      nativeToggleInFlight = null
    }
    return true
  }

  function makeAction(action, label) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `lmf-saved-set-action lmf-saved-set-${action}`
    button.dataset.lmfSavedSetAction = action
    button.textContent = label
    return button
  }

  function ensureHost(row) {
    let host = row.querySelector(':scope > .lmf-saved-set-actions')
    if (!host) {
      host = document.createElement('div')
      host.className = 'lmf-saved-set-actions'
      row.appendChild(host)
    }
    return host
  }

  function renderRow(row) {
    if (!(row instanceof Element)) return
    const setId = setIdFor(row)
    if (!setId) return

    const pending = recovery.get(setId)
    const done = isDone(row)
    const existing = row.querySelector(':scope > .lmf-saved-set-actions')

    if (done) {
      if (pending?.mode === 'saving' || pending?.mode === 'restoring') recovery.delete(setId)
      const host = ensureHost(row)
      host.className = 'lmf-saved-set-actions is-saved'
      host.replaceChildren(
        makeAction('edit', SAVED_SET_ACTIONS.edit),
        makeAction('undo', SAVED_SET_ACTIONS.undo),
      )
      row.classList.remove('lmf-saved-set-reopened', 'lmf-saved-set-editing')
      return
    }

    if (pending && (pending.mode === 'edit' || pending.mode === 'undo')) {
      const host = ensureHost(row)
      const status = document.createElement('span')
      status.className = 'lmf-saved-set-status'
      status.textContent = pending.mode === 'edit' ? 'EDITING SAVED SET' : 'SET UNDONE'
      host.className = 'lmf-saved-set-actions is-reopened'
      host.replaceChildren(status, makeAction('restore', SAVED_SET_ACTIONS.restore))
      row.classList.add('lmf-saved-set-reopened')
      row.classList.toggle('lmf-saved-set-editing', pending.mode === 'edit')
      return
    }

    existing?.remove()
    row.classList.remove('lmf-saved-set-reopened', 'lmf-saved-set-editing')
  }

  function enhanceAll() {
    refreshTimer = 0
    rows().forEach(renderRow)
  }

  function scheduleEnhance(delay = 30) {
    if (refreshTimer) window.clearTimeout(refreshTimer)
    refreshTimer = window.setTimeout(enhanceAll, delay)
  }

  function reopenSavedSet(row, mode) {
    if (!isDone(row)) return
    const setId = setIdFor(row)
    if (!setId) return
    const snapshot = snapshotRow(row)
    recovery.set(setId, { mode, snapshot })

    if (!nativeSetToggle(row, mode)) {
      recovery.delete(setId)
      return
    }

    scheduleForRow(setId, current => {
      if (isDone(current)) return false
      const pending = recovery.get(setId)
      if (!pending) return true
      applySnapshot(current, pending.snapshot)
      renderRow(current)
      if (mode === 'edit') {
        const focusTarget = current.querySelector('.reps-input, .load-input, .rpe-input')
        if (focusTarget instanceof HTMLInputElement) {
          focusTarget.focus({ preventScroll: true })
          focusTarget.select()
        }
      }
      return true
    })
  }

  function restoreSavedSet(row) {
    const setId = setIdFor(row)
    const pending = recovery.get(setId)
    if (!setId || !pending || isDone(row)) return

    applySnapshot(row, pending.snapshot)
    pending.mode = 'restoring'
    recovery.set(setId, pending)
    if (!nativeSetToggle(row, 'restore')) {
      pending.mode = 'undo'
      recovery.set(setId, pending)
      return
    }

    scheduleForRow(setId, current => {
      if (!isDone(current)) return false
      recovery.delete(setId)
      renderRow(current)
      return true
    })
  }

  function noteNativeSave(row) {
    const setId = setIdFor(row)
    const pending = recovery.get(setId)
    if (!setId || !pending || isDone(row)) return
    pending.mode = 'saving'
    recovery.set(setId, pending)
    scheduleForRow(setId, current => {
      if (!isDone(current)) return false
      recovery.delete(setId)
      renderRow(current)
      return true
    })
  }

  function handleClick(event) {
    const target = event.target instanceof Element ? event.target : null
    if (!target) return

    const actionButton = target.closest('[data-lmf-saved-set-action]')
    if (actionButton) {
      const row = actionButton.closest('.set-row[data-set-id]')
      if (!row) return
      event.preventDefault()
      event.stopPropagation()
      const action = actionButton.getAttribute('data-lmf-saved-set-action')
      if (action === 'edit') reopenSavedSet(row, 'edit')
      else if (action === 'undo') reopenSavedSet(row, 'undo')
      else if (action === 'restore') restoreSavedSet(row)
      return
    }

    const nativeButton = target.closest('.set-check[data-action="toggle-set"]')
    if (!nativeButton) return
    const row = nativeButton.closest('.set-row[data-set-id]')
    if (!row) return
    const setId = setIdFor(row)
    if (nativeToggleInFlight?.setId === setId) return
    noteNativeSave(row)
  }

  function start() {
    enhanceAll()
    document.addEventListener('click', handleClick, true)
    new MutationObserver(mutations => {
      if (mutations.some(mutation => mutation.addedNodes.length || mutation.type === 'attributes')) scheduleEnhance()
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    })
    window.addEventListener('hashchange', () => scheduleEnhance(20))
    window.__LMF_SAVED_SET_RECOVERY_V1__ = {
      version: 1,
      actions: SAVED_SET_ACTIONS,
      refresh: enhanceAll,
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
  else start()
})()
