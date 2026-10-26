# 桌面宠物 Desktop Pet

一只可以拖拽、互动、DIY 加功能的桌面猫咪。基于 Electron,角色使用 `assets/` 下的实拍素材
(灰白虎斑猫,白底已抠除为透明通道)。

## 运行

需要先安装 [Node.js](https://nodejs.org/)(建议 LTS 版本)。

```bash
cd desktop-pet
npm install
npm start
```

第一次启动会在屏幕右下角出现一只猫。左键拖拽可以移动它，点击会在三个姿态间切换，
并随机弹跳或摇摆。它会偶尔眨眼（有时连续眨两下），待机时轻轻歪头或伸展。
右键可以打开菜单(开关插件 / 是否置顶 / 开机自动启动 / 退出)。
猫的不透明部分仍可点击和拖拽，窗口中其余透明区域的点击会传给下方窗口；
点击语录气泡会收起气泡，不会影响之后拖拽猫咪。
在 Linux Wayland 上暂不启用此功能。

### 投喂文件

从文件管理器把**一个本地文件或文件夹**拖到猫身上；猫张嘴并显示“松手送进回收站”时，
松开鼠标即可投喂。文件夹会先显示确认框，确认后才会连同其中内容一起移入系统回收站；
文件也会移入回收站。两者都可以从回收站恢复。若系统无法直接识别拖入的文件夹，
桌宠会打开选择框，请再次选中要投喂的文件夹，然后确认。
多个项目、桌宠自身文件、系统重要目录和无效拖入项不会被删除；失败时猫会提示，
原项目仍在原处。拖到猫以外的区域也不会触发投喂。

### Windows 应用联动

右键菜单中的 **音乐联动** 和 **应用联动** 可以分别开关，默认开启，仅在 Windows 10/11 上运行。

- 音乐联动读取系统媒体会话。播放时猫会轻轻摇摆；开始播放或切歌时偶尔说一句，至少间隔 12 分钟。暂停后恢复普通待机。只有向 Windows 发布媒体会话的播放器才能被识别。摇摆是轻量的循环动作，不会精确踩歌曲节拍。
- 应用联动只读取当前窗口所属的应用进程，连续两次识别相同类别后才切换姿态。浏览器、代码编辑器、演示软件、PCB 软件和本地视频播放器有对应反应；说话至少间隔 20 分钟。视频播放器前台时暂停闲聊与音乐摇摆。
- 目前识别浏览器只代表正在使用浏览器，无法判断是在查资料、听歌还是看视频。深度识别需要针对具体浏览器或软件另做扩展。
- 不分析、存储或传递窗口标题、网页和文档内容，也不记录键盘输入、屏幕或声音；状态仅在本机进程间传递。右键关闭插件后会停止相应监听。

### 偶尔挪窝

右键菜单中的 **偶尔挪窝** 默认开启。启动约 45 秒后，猫会在空闲时尝试第一次小跳；之后约每 2–4 分钟尝试一次，每次水平移动约 50–95 像素。活动范围限制在上次手动放置位置左右约 180 像素内，并始终留在当前屏幕的工作区域。

鼠标靠近、拖拽、投喂、气泡显示、音乐播放和已识别的视频播放器前台时不会开始移动；移动过程中靠近或手动拖拽会立即停止。系统开启“减少动态效果”时不会自动挪窝。现有照片没有走路帧，因此采用小跳动作。

> 注意:重复启动只会保留一只猫(单实例锁),第二次启动会让已有窗口重新显示到最前。

## 开机自动启动

在右键菜单里勾选 **"开机自动启动"** 即可,无需重启。

- Windows 上是往 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
  写一条名为 `DesktopPet` 的启动项,可在"任务管理器 → 启动"里查看和管理。
- 配置项是 `config.json` 里的 `autoStart`。程序启动时会按这个值**同步**系统登录项,
  所以手改配置文件同样生效,且系统启动项被外部清理后下次启动会自动补回。
- 取消勾选会删除该启动项。

> 开发模式(`npm start`)下启动项指向 `node_modules/electron/dist/electron.exe`
> 并附带项目路径,因此**移动项目目录后需要重新勾选一次**;
> 打包成 App 后(`npm run build`)指向 App 自身,不存在这个问题。

## 打包成独立 App(不需要 Node 环境也能运行)

```bash
npm run build
```

会在 `dist/` 目录生成 Windows / macOS / Linux 对应的安装包(用的是 electron-builder,按你的系统自动出对应格式)。

## 目录结构

```
desktop-pet/
├── main.js              # Electron 主进程:窗口、右键菜单、配置读写
├── system-activity.js   # Windows 媒体会话和前台应用分类
├── preload.js            # 安全暴露给页面的接口
├── config.json           # 默认配置(尺寸、插件开关等)
├── assets/               # 角色素材(白底已抠成透明,供页面直接使用)
│   ├── pet_idle_center.png      # 居中待机(默认)
│   ├── pet_idle_front.png        # 正面自然待机
│   ├── pet_idle_left_tilt.png    # 左倾:思考/关注/疑惑
│   ├── pet_blink_center.png      # 居中姿态的闭眼帧
│   ├── pet_blink_front.png       # 正面姿态的闭眼帧
│   ├── pet_blink_left_tilt.png   # 左倾姿态的闭眼帧
│   └── pet_mouth_open.png        # 投喂时的张嘴帧
├── renderer/
│   ├── index.html        # 页面结构 + 姿态和眨眼素材
│   ├── style.css         # 姿态切换与动作动画
│   └── pet.js            # 拖拽 / 点击 / 动作调度 / 插件启停
├── plugins/
│   ├── plugin-loader.js   # 插件系统基座
│   ├── clock.js           # 示例插件: 整点报时
│   ├── quotes.js          # 示例插件: 空闲随机台词
│   ├── click-react.js     # 示例插件: 点击互动
│   ├── music-link.js      # 音乐播放联动
│   ├── app-link.js        # 前台应用联动
│   └── roam.js            # 自动小跳挪窝
└── 素材/                  # 原始素材(未处理的白底图 + 参考视频),不参与运行
```

## 角色素材与姿态

角色是三张实拍姿态图,语义沿用素材库的映射:

| 姿态 | 素材 | 何时显示 |
|---|---|---|
| `idle_center` | `pet_idle_center.png` | 默认待机 |
| `idle_left_tilt` | `pet_idle_left_tilt.png` | 点击桌宠、思考、关注 |
| `idle_front` | `pet_idle_front.png` | 正面自然待机 |

**摸一下(点击)会在三个姿态之间循环切换**,不需要插件参与。
眨眼与待机动作也不依赖插件；系统开启“减少动态效果”时会停用自动动作。

- 原始素材是**白底不透明**的,`assets/` 里的是处理后的透明版本。
  处理方式见下文"素材是怎么处理的"。
- 角色显示宽度由 `config.json` 的 `size` 决定(单位 CSS px,默认 99)。
- 插件可以通过 `api.setPose(姿态)` 直接切换,也接受语义别名
  (`idle` / `attention` / `thinking` / `front`);`api.nextPose()` 等效于"摸一下",
  `api.resetPose()` 回到默认待机。

### 素材是怎么处理的

原始 PNG 背景是纯白且不透明,直接放桌面会是一个白方块。`assets/` 里的图经过两步处理:

1. **抠背景**:从画布四边做 flood fill,只删除**与边缘连通的**白色。
   不能按颜色全局抠 —— 猫本身是白毛,全局抠会在身上挖洞。
2. **补小洞**:猫身上的白色高光被上一步吃掉后会留下极小孤岛,对这些
   (小于 80px 的封闭区域)按周围颜色回填。真实镂空结构(如腿间缝隙)不受影响。

处理后运行素材的实际尺寸:

运行用的三张透明图已进一步清理底部视频水印；修改前的图片保存在 Git 基线提交中。
三张闭眼帧按对应姿态生成，背景透明，用于短暂的眨眼切换。

| 文件 | 尺寸 | 说明 |
|---|---|---|
| `pet_idle_center.png` | 1129×1393 | 与原图比例一致 |
| `pet_idle_front.png` | 1092×1440 | 与原图比例一致 |
| `pet_idle_left_tilt.png` | 1118×1407 | 与原图比例一致 |

## 怎么 DIY 一个新功能(插件)

不需要碰 Electron 那部分代码,只在 `plugins/` 里新建一个文件,比如 `plugins/water-reminder.js`:

```js
window.PetPlugins.push({
  id: 'water-reminder',       // 唯一标识,和 config.json 里的开关对应

  timerId: null,

  init(api) {
    // 启动时执行一次;可以用 api.say() 说话、setInterval 做定时任务
    this.timerId = setInterval(() => {
      api.say('该喝水啦 💧');
    }, 45 * 60 * 1000); // 每 45 分钟提醒一次
  },

  stop(api) {
    // 可选,但只要有 setInterval / 事件监听就必须写:
    // 用户在右键菜单里关掉这个插件时会调用它,不清掉定时器就会"关了还在跑"
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },

  onClick(api) {
    // 可选: 用户点击桌宠时触发(仅在该插件处于启用状态时才会触发)
    api.say('已经喝了几杯水了呀?');
  },
});
```

然后两处小改动:

1. 在 `renderer/index.html` 里加一行引入(放在 `pet.js` 之前):
   ```html
   <script src="../plugins/water-reminder.js"></script>
   ```
2. 在 `config.json` 的 `pluginDefaults` 里声明它的初始状态:
   ```json
   "pluginDefaults": {
     "water-reminder": true
   }
   ```

重启 App 就生效了,右键菜单里也会自动出现这个插件的开关。

> `pluginDefaults` 是"插件都有哪些、默认开不开"的声明,`plugins` 是用户当前的实际状态。
> 启动时主进程会把 `pluginDefaults` 里**用户配置还没有的键**补进 `plugins`,
> 所以新增插件不必手动去改用户目录里的配置。
> 没在 `pluginDefaults` 里声明的插件不会启用(控制台会给出提示),避免出现
> "插件偷偷在跑、菜单里却没有开关"的情况。

### 开关是实时生效的

右键菜单里切换插件开关会**立即生效**,不需要重启:`stop()` 会被调用清掉定时器,
再打开时会重新走一次 `init()`。

### 插件能拿到的 API

| 方法 | 作用 |
|---|---|
| `api.say(text, durationMs?)` | 让桌宠冒出一个气泡说话,默认显示 3.5 秒 |
| `api.react()` | 随机触发一次弹跳或摇摆反应动画 |
| `api.setPose(pose)` | 切到指定姿态(见上文"角色素材与姿态") |
| `api.nextPose()` | 切到循环里的下一个姿态(与"摸一下"等效) |
| `api.resetPose()` | 回到默认待机姿态 |
| `api.config` | 读取当前配置(如 `api.config.idleIntervalMinutes`) |

插件对象的可选钩子: `init(api)` / `stop(api)` / `onClick(api)`。
`stop` 在插件被关闭时调用,用来清理 `setInterval`、事件监听等副作用。

你可以在 `init` 里用 `fetch()` 请求接口(比如天气 API)、读取剪贴板、调用系统通知等 —— Electron 渲染进程就是一个浏览器环境,想接什么都可以。

> 注意:插件在 `init` 里创建的定时器/监听要在 `stop` 里清掉,否则用户关掉插件后
> 它仍会继续运行。

## 怎么换外观 / 换角色

角色已改为位图素材,`renderer/index.html` 里是三张姿态图和各自的闭眼帧,
通过 `body[data-pose="..."]` 控制哪一张可见(`renderer/style.css` 顶部)。

**换一套素材**:把新的透明 PNG 放进 `assets/`,然后改两处:

1. `renderer/index.html` 里 `<img>` 的 `src`。
2. 如果姿态名要改,同步改 `renderer/pet.js` 的 `POSES` 数组和 `style.css` 里的
   `body[data-pose="..."]` 规则。

**调整大小**:改 `config.json` 里的 `size`(单位 CSS px,决定角色显示宽度)。
主进程会把它注入成 CSS 变量 `--pet-w`,所以不用动 CSS。

> 早期版本的角色是纯 SVG + CSS 配色皮肤,现已移除 —— 实拍素材无法靠 CSS 变量换色。

## 小贴士

- 想要开机自启动,可以在 `main.js` 里加 `app.setLoginItemSettings({ openAtLogin: true })`。
- 如果想让点击穿透桌宠(不遮挡桌面操作),可以研究 `win.setIgnoreMouseEvents()`,按需在特定状态下切换。
- 配置文件运行后会被复制一份到系统的用户数据目录(不是项目里的 `config.json`),所以你在右键菜单里做的修改是持久化的,不会因为改项目源码丢失。
- 手改配置文件时注意:**别用会写入 UTF-8 BOM 的编辑器**(某些 Windows 工具的默认行为)。
  程序已对 BOM 做了兼容处理,但保持无 BOM 更稳妥。
