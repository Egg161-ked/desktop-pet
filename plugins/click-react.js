// 点击反应：摸一下冒一句（同时会切换形态）。
// 点击时给一句短回应，不催促用户继续工作。
window.PetPlugins.push({
  id: 'click-react',

  reactions: [
    '喵，收到。',
    '摸到了，今天运气加一。',
    '欸？刚刚是你在叫我吗？',
    '再摸一下，我就要打呼噜了。',
    '别急，我陪你想想。',
    '我只是刚好路过你的桌面。',
    '手感怎么样？很努力养出来的。',
    '这次允许摸两秒。',
    '喵！差点把灵感拍出来。',
    '我抖抖毛，继续陪你。',
    '猫已充电，继续出发。',
    '要一起盯着这个 bug 吗？',
    '好啦，我在。',
    '嘘，我正在认真卖萌。',
  ],

  lastIndex: -1,

  onClick(api) {
    let index = Math.floor(Math.random() * this.reactions.length);
    if (index === this.lastIndex && this.reactions.length > 1) {
      index = (index + 1 + Math.floor(Math.random() * (this.reactions.length - 1))) % this.reactions.length;
    }
    this.lastIndex = index;
    api.say(this.reactions[index], 2500);
  },
});
