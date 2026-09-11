(() => {
  if (!('serviceWorker' in navigator)) return;

  let refreshing = false;
  let previousController = navigator.serviceWorker.controller;

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
    const nextController = navigator.serviceWorker.controller;
    const hadController = previousController;
    previousController = nextController;
    // First installation already serves this build. Reloading here can erase
    // an athlete name or interrupt the first native save between input and click.
    if (!hadController || !nextController || hadController === nextController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });
})();
