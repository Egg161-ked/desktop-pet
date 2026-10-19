// 点击反应：摸一下冒一句（同时会切换形态）。
// 语气偏"打工人共鸣"——被打断时的小吐槽。
window.PetPlugins.push({
  id: 'click-react',

  reactions: [
    '又摸鱼？需求写完了吗。',
    '戳我干嘛，去改 bug 呀。',
    '我不是进度条，戳了也不会动。',
    '别摸了，再摸这个需求也不会自己写完。',
    '嗯？我看看是谁在偷懒。',
    '我在这儿呢，一直都在。',
    '行行行，摸完就去干活。',
    '这一下算你休息时间，下一分钟该写代码了。',
    '你是不是卡住了？卡住了就歇会儿。',
    '摸我可以，别忘了 deadline。',
  ],

  onClick(api) {
    const text = this.reactions[Math.floor(Math.random() * this.reactions.length)];
    api.say(text, 2000);
  },
});
