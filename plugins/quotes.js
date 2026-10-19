// 空闲台词：每隔 idleIntervalMinutes 分钟随机冒一句。
// 语气偏"打工人共鸣"——吐槽加班/需求/bug/开会，但底色是陪着你。
window.PetPlugins.push({
  id: 'quotes',

  lines: [
    '需求又改了？我一点都不意外。',
    '这个 bug 我看了三遍，它也在看我。',
    '别急，先喝口水，代码不会跑。',
    '会议结束了，事情一件没少。',
    '又到下班点了，你猜谁还在工位上。',
    '我看你敲了半天，删掉的那段其实挺好的。',
    '今天也是被 deadline 追着跑的一天。',
    '深呼吸，深呼吸，然后继续改。',
    '你已经做得很好了，真的。',
    '要不要站起来走两步？我等你回来。',
    '窗外的天都黑了，你注意点时间呀。',
    '这版一定能过……吧？',
    '不用回消息，先把手头这个收尾。',
    '我趴这儿看着你干活，不吵你。',
    '累了就揉揉眼睛，我不笑话你。',
  ],

  timerId: null,

  init(api) {
    const minutes = (api.config && api.config.idleIntervalMinutes) || 6;
    this.timerId = setInterval(() => {
      const text = this.lines[Math.floor(Math.random() * this.lines.length)];
      api.say(text);
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
