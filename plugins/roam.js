window.PetPlugins.push({
  id: 'roam',
  timerId: null,
  offStarted: null,
  offEnded: null,
  active: false,

  schedule(api, first = false) {
    clearTimeout(this.timerId);
    const delay = first ? 45_000 : 120_000 + Math.random() * 120_000;
    this.timerId = setTimeout(() => {
      if (!this.active) return;
      if (api.canRoam()) window.petBridge.requestRoam();
      this.schedule(api);
    }, delay);
  },

  init(api) {
    this.active = true;
    this.offStarted = window.petBridge.onRoamStarted((durationMs) => {
      if (!this.active || !api.hop(durationMs)) window.petBridge.cancelRoam();
    });
    this.offEnded = window.petBridge.onRoamEnded(() => api.stopHop());
    this.schedule(api, true);
  },

  stop(api) {
    this.active = false;
    clearTimeout(this.timerId);
    this.timerId = null;
    this.offStarted?.();
    this.offEnded?.();
    this.offStarted = null;
    this.offEnded = null;
    window.petBridge.cancelRoam();
    api.stopHop();
  },
});
