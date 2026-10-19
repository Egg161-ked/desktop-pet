// 空闲台词：每隔 idleIntervalMinutes 分钟随机冒一句。
// 语气轻松，像一只在桌边陪伴的猫；尽量简短，适合气泡显示。
window.PetPlugins.push({
  id: 'quotes',

  lines: [
    '我盯着光标，它先眨眼了。',
    '这行代码看起来很有精神。',
    '先伸个懒腰，我替你看着。',
    '今天的灵感，正在加载中。',
    '写累了就眨眨眼，像我这样。',
    '有些 bug，睡一觉就肯招了。',
    '保存一下吧，我有点不放心。',
    '这次运行，我押它能过。',
    '先喝口水，思路会更清楚。',
    '慢慢来，猫也不是一天学会跳的。',
    '你写代码，我负责卖萌。',
    '我在桌角值班，一切正常。',
    '休息两分钟，我帮你盯屏幕。',
    '这个变量名，我给九分。',
    '如果卡住了，先换个角度看。',
    '新的一行，也许就是答案。',
    '今晚的计划：收尾，然后休息。',
    '点子还没来？先摸摸猫。',
    '我刚才在认真研究你的鼠标。',
    '今天也要记得给自己留点电。',
    '代码会改好，饭也要记得吃。',
    '不急，先把眼前这一步走完。',
    '要不要听我喵一声？喵。',
  ],

  timerId: null,
  lastIndex: -1,

  init(api) {
    const minutes = (api.config && api.config.idleIntervalMinutes) || 6;
    this.timerId = setInterval(() => {
      let index = Math.floor(Math.random() * this.lines.length);
      if (index === this.lastIndex && this.lines.length > 1) {
        index = (index + 1 + Math.floor(Math.random() * (this.lines.length - 1))) % this.lines.length;
      }
      this.lastIndex = index;
      api.say(this.lines[index]);
    }, minutes * 60 * 1000);
  },

  // 从右键菜单关闭该插件时调用，必须清掉定时器，否则"关了还在跑"
  stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },
});
