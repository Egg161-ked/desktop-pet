window.PetPlugins.push({
  id: 'music-link',
  unsubscribe: null,
  active: false,
  lastPlaying: false,
  lastEpoch: 0,
  lastSpoken: 0,

  init(api) {
    this.active = true;
    this.lastPlaying = false;
    this.lastEpoch = 0;
    const onState = (state) => {
      if (!this.active || !state || !state.music) return;
      const { playing, epoch } = state.music;
      const isVideo = state.app && state.app.category === 'video';
      document.body.classList.toggle('music-playing', !!playing && !isVideo);
      const started = playing && !this.lastPlaying;
      const changed = playing && this.lastPlaying && epoch !== this.lastEpoch;
      this.lastPlaying = !!playing;
      this.lastEpoch = epoch;
      if (!isVideo && (started || changed)
        && Date.now() - this.lastSpoken > 12 * 60 * 1000) {
        if (api.sayAmbient(started
          ? '音乐响起来啦，我跟着轻轻摇。'
          : '换歌啦，耳朵已经竖起来了。')) {
          this.lastSpoken = Date.now();
        }
      }
    };
    this.unsubscribe = window.petBridge.onActivityUpdated(onState);
    window.petBridge.getActivityState().then(onState).catch((error) => {
      console.warn('[pet] 音乐状态读取失败:', error);
    });
  },

  stop() {
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    document.body.classList.remove('music-playing');
  },
});
