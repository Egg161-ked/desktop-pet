window.PetPlugins.push({
  id: 'app-link',
  unsubscribe: null,
  active: false,
  lastCategory: null,
  lastSpoken: 0,

  lines: {
    browser: '在浏览器里转转，我陪你找思路。',
    code: '写代码啦，我在桌角给你加油。',
    presentation: '做幻灯片啦，我陪你慢慢排版。',
    pcb: '画板中，愿走线都顺顺利利喵。',
    video: '观影时间，我安静陪你。',
  },

  init(api) {
    this.active = true;
    this.lastCategory = null;
    const onState = (state) => {
      if (!this.active || !state || !state.app) return;
      const category = state.app.category;
      if (category === this.lastCategory) return;
      this.lastCategory = category;
      document.body.dataset.activity = category;
      if (category === 'other') {
        api.resetPose();
        return;
      }
      api.setPose(category === 'code' || category === 'presentation' ? 'front' : 'attention');
      if (this.lines[category] && Date.now() - this.lastSpoken > 20 * 60 * 1000
        && api.sayAmbient(this.lines[category])) {
        this.lastSpoken = Date.now();
      }
    };
    this.unsubscribe = window.petBridge.onActivityUpdated(onState);
    window.petBridge.getActivityState().then(onState).catch((error) => {
      console.warn('[pet] 应用状态读取失败:', error);
    });
  },

  stop(api) {
    this.active = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    delete document.body.dataset.activity;
    api.resetPose();
  },
});
