(async () => {
  const status = document.getElementById('status')
  const setStatus = (message) => {
    if (status) status.innerHTML = `<span class="spinner"></span>${message}`
  }

  try {
    setStatus('Removing obsolete service workers…')
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }

    setStatus('Clearing cached app shells…')
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }

    setStatus('Loading Command V2…')
    const target = `/?command-v2-refresh=${Date.now()}`
    window.location.replace(target)
  } catch (error) {
    console.error('LetMeFly refresh failed', error)
    if (status) {
      status.textContent = 'Refresh could not finish automatically. Reload this page once and try again.'
    }
  }
})()
