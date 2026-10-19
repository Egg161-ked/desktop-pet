window.PetPlugins.push({
  id: 'clock',

  // 定时器句柄存在插件自己身上，stop 时才能清掉
  timerId: null,

  init(api) {
    const check = () => {
      const now = new Date();
      if (now.getMinutes() === 0) {
        const h = now.getHours();
        api.say(`现在是 ${h} 点整啦 🕐`);
      }
    };
    // 每分钟检查一次是否整点
    this.timerId = setInterval(check, 60 * 1000);
  },

  // 从右键菜单关闭该插件时调用，必须清掉定时器，否则"关了还在跑"
  stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },
});
