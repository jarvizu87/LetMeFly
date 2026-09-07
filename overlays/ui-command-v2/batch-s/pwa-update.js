(() => {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;

  async function refreshRegistration() {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js', {
        updateViaCache: 'none',
      });
      await registration.update();
    } catch (error) {
      console.warn('LetMeFly service-worker update check failed', error);
    }
  }

  window.addEventListener('load', refreshRegistration, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshRegistration();
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
})();
