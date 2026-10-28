const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { createSystemActivity } = require('./system-activity');
const { createAssistantCore } = require('./assistant-core');

const USER_CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const DEFAULT_CONFIG_PATH = path.join(__dirname, 'config.json');

// JSON.parse 遇到 UTF-8 BOM 会直接失败。
// 用户如果是用记事本 / PowerShell 的 Set-Content 手改过配置，很容易带上 BOM，
// 那时整个配置就会解析失败并静默回落成默认值（皮肤、插件开关全部丢失），
// 所以这里统一剥掉开头的 BOM。
function readJson(file) {
  const text = fs.readFileSync(file, 'utf-8').replace(/^\uFEFF/, '');
  return JSON.parse(text);
}

function loadConfig() {
  let cfg;
  try {
    if (!fs.existsSync(USER_CONFIG_PATH)) {
      fs.copyFileSync(DEFAULT_CONFIG_PATH, USER_CONFIG_PATH);
    }
    cfg = readJson(USER_CONFIG_PATH);
  } catch (e) {
    console.error('[pet] 读取用户配置失败，回落到默认配置:', e.message);
    cfg = readJson(DEFAULT_CONFIG_PATH);
  }

  // 把默认配置里声明的插件补进用户配置。
  // 这样"新装了一个插件但用户配置里没有这个键"也能自动出现开关；
  // 同时也保证 config.plugins 一定存在，后面可以放心解引用。
  // 注意来源是 pluginDefaults 而不是 plugins：后者代表用户当前状态，不该被覆盖。
  try {
    const defaults = readJson(DEFAULT_CONFIG_PATH);
    const dp = defaults.pluginDefaults || {};
    cfg.plugins = Object.assign({}, dp, cfg.plugins || {});
  } catch (e) {
    cfg.plugins = cfg.plugins || {};
  }
  return cfg;
}

function saveConfig(cfg) {
  fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ---- 开机自启相关常量（必须在使用它的启动逻辑之前声明，避免 TDZ 报错）----
// Windows 上不用 app.setLoginItemSettings：它写的值名是 "electron.app.Electron"，
// 在"任务管理器 → 启动"里显示为 Electron，且开发模式/打包后名字不一致。
// 这里直接写 HKCU 的 Run 项，名字固定为 DesktopPet，且能自己判断是否已存在。
const AUTOSTART_NAME = 'DesktopPet';
// Windows 下值里有空格要加引号；开发模式运行的是 electron.exe，必须把项目目录作为参数传进去，
// 否则开机启动只会打开一个空的 Electron 窗口。
const AUTOSTART_CMD = `"${process.execPath}"` + (app.isPackaged ? '' : ` "${__dirname}"`);

let win;
let assistantWin;
let assistantCore;
let activeAssistantRequest;
const pendingPetNotices = [];
let activityMonitor;
let cursorPollTimer = null;
const CAN_TRACK_CURSOR = process.platform !== 'linux' || process.env.XDG_SESSION_TYPE !== 'wayland';
let config = loadConfig();

// 把合并后的插件列表落盘。否则 pluginDefaults 里新增的插件只存在于内存中，
// 用户打开 config.json 看不到、也就没法手动关掉它。
try {
  saveConfig(config);
} catch (e) {
  console.error('[pet] 写回配置失败:', e.message);
}

// 按配置同步开机自启状态。
// 这样配置就是唯一事实来源：手改 config.json 的 autoStart 也能生效，
// 且系统启动项被外部清理后下次启动会自动补回。

// 单实例锁：避免重复启动叠出多只桌宠（本应用 skipTaskbar，任务栏上没有入口，
// 多开的窗口只能逐个右键退出，所以必须从源头拦住）。
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.setAlwaysOnTop(!!config.alwaysOnTop, 'screen-saver');
    }
  });
  // 只在真正要运行的实例上同步，避免"启动后立刻退出"的实例也去写注册表
  try {
    setAutoStart(!!config.autoStart);
  } catch (e) {
    console.error('[pet] 同步开机自启失败:', e.message);
  }
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea; // { x, y, width, height }
  const size = config.size || 99;
  const winW = size + 50;
  const winH = Math.round(size * 1.15) + 110; // 角色(约 size*1.15 高) + 气泡空间

  win = new BrowserWindow({
    width: winW,
    height: winH,
    transparent: true,
    frame: false,
    resizable: false,
    alwaysOnTop: !!config.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  win.on('closed', () => {
    cancelRoam();
    stopCursorPoll();
    activityMonitor?.stop();
    activityMonitor = null;
    if (assistantWin && !assistantWin.isDestroyed()) assistantWin.close();
  });

  // 落到右下角。
  // 坑：workArea 给的是物理像素，而窗口坐标实际被当作 DIP×scaleFactor 解释，
  // 两者单位不一致，直接按 workArea 反算会把窗口推到屏幕外，
  // 所以这里先除以缩放比换算到同一坐标系。
  const scale = display.scaleFactor || 1;
  const areaW = area.width / scale;
  const areaH = area.height / scale;
  const margin = 40;
  const { width: w, height: h } = win.getBounds();
  const spawnX = Math.min(Math.max(areaW - w - margin, 0), Math.max(0, areaW - w));
  const spawnY = Math.min(Math.max(areaH - h - margin, 0), Math.max(0, areaH - h));
  win.setBounds({ x: spawnX, y: spawnY, width: w, height: h });
  posCache = [spawnX, spawnY];
  roamAnchorX = spawnX;
  winTargetW = w;
  winTargetH = h;

  win.setAlwaysOnTop(!!config.alwaysOnTop, 'screen-saver');
  win.webContents.setVisualZoomLevelLimits(1, 1); // 禁用缩放，避免窗口尺寸错乱

  // 角色是位图素材，显示宽度由 CSS 变量 --pet-w 控制。
  // 这里把配置里的 size 通过 URL 查询参数传给页面，让它自己设置变量
  // （比 insertCSS 可靠：注入时机/优先级都不稳定）。
  win.webContents.on('did-finish-load', () => {
    while (pendingPetNotices.length) win.webContents.send('assistant-say', pendingPetNotices.shift());
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { size: String(config.size || 99) },
  });

  activityMonitor = createSystemActivity({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    isOwnWindow: (owner) => owner.processId === process.pid
      || owner.processId === win.webContents.getOSProcessId(),
    onUpdate: (state) => {
      if (state.music.playing || state.app.category === 'video') cancelRoam();
      if (win && !win.isDestroyed()) win.webContents.send('activity-updated', state);
    },
  });
  syncActivityMonitor();
}

function showPetNotice(message) {
  const line = String(message).replace(/\s+/g, ' ').slice(0, 72);
  if (!line) return;
  if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
    win.webContents.send('assistant-say', line);
  } else {
    pendingPetNotices.push(line);
  }
}

function openAssistantWindow() {
  if (assistantWin && !assistantWin.isDestroyed()) {
    assistantWin.show();
    assistantWin.focus();
    return;
  }
  if (!win || win.isDestroyed()) return;
  const petBounds = win.getBounds();
  const area = screen.getDisplayMatching(petBounds).workArea;
  const width = 410;
  const height = 570;
  const x = Math.min(Math.max(petBounds.x - width - 12, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(petBounds.y + petBounds.height - height, area.y), area.y + area.height - height);
  assistantWin = new BrowserWindow({
    width, height, x, y,
    minWidth: 350,
    minHeight: 450,
    show: false,
    title: '和猫说话',
    backgroundColor: '#F7F3ED',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'assistant-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  assistantWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  assistantWin.webContents.on('will-navigate', (event) => event.preventDefault());
  assistantWin.once('ready-to-show', () => {
    if (assistantWin && !assistantWin.isDestroyed()) assistantWin.show();
  });
  assistantWin.on('closed', () => {
    activeAssistantRequest?.abort('cancel');
    assistantWin = null;
  });
  assistantWin.loadFile(path.join(__dirname, 'assistant', 'index.html'));
}

function syncActivityMonitor() {
  if (!activityMonitor) return;
  const plugins = config.plugins || {};
  activityMonitor.setEnabled({
    music: plugins['music-link'] === true,
    app: plugins['app-link'] === true,
  });
}

// 开机自启的读写实现
function readAutoStart() {
  if (process.platform === 'win32') {
    const r = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      '/v', AUTOSTART_NAME], { encoding: 'utf8', windowsHide: true });
    return r.status === 0;
  }
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return !!config.autoStart;
  }
}

function setAutoStart(enabled) {
  if (process.platform === 'win32') {
    if (enabled) {
      // 加 /f 覆盖同名值，避免重复启动时累积多条
      const r = spawnSync('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v', AUTOSTART_NAME, '/t', 'REG_SZ', '/d', AUTOSTART_CMD, '/f'],
        { encoding: 'utf8', windowsHide: true });
      if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'reg add 失败').trim());
    } else {
      const r = spawnSync('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        '/v', AUTOSTART_NAME, '/f'], { encoding: 'utf8', windowsHide: true });
      // 值本来就不存在时 reg 返回非 0，这不算错误
      if (r.status !== 0 && !/unable to find|找不到/i.test((r.stderr || '') + (r.stdout || ''))) {
        throw new Error((r.stderr || r.stdout || 'reg delete 失败').trim());
      }
    }
    return;
  }
  const opts = { openAtLogin: enabled };
  if (process.platform === 'linux') opts.path = process.execPath;
  app.setLoginItemSettings(opts);
}

function buildContextMenu() {
  const plugins = config.plugins || {};   // 兜底：配置异常时也不要让右键菜单炸掉
  const pluginLabels = { 'music-link': '音乐联动', 'app-link': '应用联动', roam: '偶尔挪窝' };
  const pluginKeys = Object.keys(plugins);
  let autoStart;
  try {
    autoStart = readAutoStart();
  } catch (e) {
    autoStart = !!config.autoStart;
  }

  const template = [
    { label: '和猫说话', click: openAssistantWindow },
    { type: 'separator' },
    {
      label: '插件开关',
      submenu: pluginKeys.map((k) => ({
        label: pluginLabels[k] || k,
        type: 'checkbox',
        checked: !!plugins[k],
        click: (item) => {
          plugins[k] = item.checked;
          if (k === 'roam' && !item.checked) cancelRoam();
          saveConfig(config);
          win.webContents.send('config-updated', config);
          syncActivityMonitor();
        },
      })),
    },
    {
      label: '始终置顶',
      type: 'checkbox',
      checked: !!config.alwaysOnTop,
      click: (item) => {
        config.alwaysOnTop = item.checked;
        saveConfig(config);
        win.setAlwaysOnTop(item.checked, 'screen-saver');
      },
    },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: autoStart,
      click: (item) => {
        config.autoStart = item.checked;
        saveConfig(config);
        try {
          setAutoStart(item.checked);
        } catch (e) {
          console.error('[pet] 设置开机自启失败:', e.message);
          // 写失败就把勾选状态回退，避免界面与实际不一致
          config.autoStart = !item.checked;
          saveConfig(config);
        }
      },
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ];
  return Menu.buildFromTemplate(template);
}

ipcMain.handle('get-config', () => config);
ipcMain.handle('get-activity-state', (event) =>
  isPetSender(event) && activityMonitor ? activityMonitor.getState() : null);

function isAssistantSender(event) {
  return assistantWin && !assistantWin.isDestroyed() && event.sender === assistantWin.webContents;
}

function sendAssistantEvent(channel, payload) {
  if (assistantWin && !assistantWin.isDestroyed()) assistantWin.webContents.send(channel, payload);
}

ipcMain.handle('assistant-get-state', async (event) => {
  if (!isAssistantSender(event) || !assistantCore) return null;
  return {
    apps: assistantCore.getApps(),
    reminders: assistantCore.listReminders(),
    model: config.assistantModel || 'deepseek-r1:7b',
    online: await assistantCore.ollamaOnline(),
  };
});

ipcMain.handle('assistant-send', async (event, input) => {
  if (!isAssistantSender(event) || !assistantCore) return { ok: false, error: '聊天窗已关闭。' };
  if (activeAssistantRequest) return { ok: false, error: '上一条消息还在处理。' };
  if (typeof input !== 'string' || !input.trim() || input.length > 400) {
    return { ok: false, error: '请输入不超过 400 字的消息。' };
  }

  const controller = new AbortController();
  activeAssistantRequest = controller;
  const timeout = setTimeout(() => controller.abort('timeout'), 90_000);
  try {
    const result = await assistantCore.handleMessage(input, {
      context: activityMonitor?.getState(),
      signal: controller.signal,
      onPartial: (text) => sendAssistantEvent('assistant-progress', { text }),
      onStatus: (text) => sendAssistantEvent('assistant-progress', { status: text }),
    });
    if (controller.signal.aborted) throw new Error('cancelled');
    const bubble = result.reply.length > 60 ? '我答好啦，来聊天窗看。' : result.reply;
    showPetNotice(bubble);
    return { ok: true, ...result, reminders: assistantCore.listReminders() };
  } catch (error) {
    if (controller.signal.aborted) {
      return { ok: false, error: controller.signal.reason === 'timeout'
        ? '等候模型超时，请稍后再试。' : '已取消。' };
    }
    console.warn('[pet] 聊天处理失败:', error);
    return { ok: false, error: error.message || '处理失败，请稍后再试。' };
  } finally {
    clearTimeout(timeout);
    activeAssistantRequest = null;
  }
});

ipcMain.on('assistant-cancel', (event) => {
  if (isAssistantSender(event)) activeAssistantRequest?.abort('cancel');
});

ipcMain.handle('assistant-cancel-reminder', (event, id) => {
  if (!isAssistantSender(event) || !assistantCore || typeof id !== 'string') return null;
  const removed = assistantCore.cancelReminder(id);
  return { removed, reminders: assistantCore.listReminders() };
});

ipcMain.on('assistant-close', (event) => {
  if (isAssistantSender(event)) assistantWin.close();
});

function isWithinDir(dir, target) {
  const relative = path.relative(dir, target);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep)
    && !path.isAbsolute(relative));
}

async function feedPath(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
    return { ok: false, reason: 'invalid-file' };
  }

  const resolved = path.resolve(filePath);
  try {
    const info = await fs.promises.lstat(resolved);
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) {
      return { ok: false, reason: 'unsupported-item' };
    }

    const isFolder = info.isDirectory();
    const protectedDirs = [app.getAppPath(), app.getPath('userData')];
    if (app.isPackaged) protectedDirs.push(path.dirname(process.execPath));
    if (process.platform === 'win32') {
      protectedDirs.push(process.env.SystemRoot, process.env.ProgramFiles,
        process.env['ProgramFiles(x86)']);
    }
    const protectedPaths = protectedDirs.filter(Boolean);
    const specialFolders = isFolder
      ? ['home', 'desktop', 'documents', 'downloads', 'music', 'pictures', 'videos']
        .flatMap((name) => {
          try { return [app.getPath(name)]; } catch { return []; }
        })
      : [];
    if (protectedPaths.some((dir) => isWithinDir(dir, resolved)
      || (isFolder && isWithinDir(resolved, dir)))
      || (isFolder && (path.parse(resolved).root === resolved
        || specialFolders.some((dir) => isWithinDir(resolved, dir))))) {
      return { ok: false, reason: 'protected-path' };
    }

    if (isFolder) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        title: '投喂文件夹',
        message: `把“${path.basename(resolved)}”及其中的所有内容移入回收站？`,
        detail: resolved,
        buttons: ['取消', '移入回收站'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response !== 1) return { ok: false, reason: 'cancelled' };
      const current = await fs.promises.lstat(resolved);
      if (!current.isDirectory() || current.isSymbolicLink()) {
        return { ok: false, reason: 'changed' };
      }
    }
    await shell.trashItem(resolved);
    return { ok: true, kind: isFolder ? 'folder' : 'file' };
  } catch (error) {
    console.warn('[pet] 投喂文件失败:', error);
    return { ok: false, reason: 'trash-failed' };
  }
}

function isPetSender(event) {
  return win && !win.isDestroyed() && event.sender === win.webContents;
}

ipcMain.handle('feed-file', (event, filePath) => {
  if (!isPetSender(event)) return { ok: false, reason: 'invalid-request' };
  return feedPath(filePath);
});

ipcMain.handle('pick-and-feed-folder', async (event) => {
  if (!isPetSender(event)) return { ok: false, reason: 'invalid-request' };
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: '选择要投喂的文件夹',
    buttonLabel: '选择文件夹',
    properties: ['openDirectory'],
  });
  if (canceled || filePaths.length !== 1) return { ok: false, reason: 'cancelled' };
  const selected = await fs.promises.lstat(filePaths[0]);
  if (!selected.isDirectory() || selected.isSymbolicLink()) {
    return { ok: false, reason: 'unsupported-item' };
  }
  return feedPath(filePaths[0]);
});

function stopCursorPoll() {
  if (cursorPollTimer !== null) {
    clearInterval(cursorPollTimer);
    cursorPollTimer = null;
  }
}

function cursorPositionInWindow() {
  const point = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  return { x: point.x - bounds.x, y: point.y - bounds.y };
}

function setMousePassthrough(ignore) {
  if (!win || win.isDestroyed() || !CAN_TRACK_CURSOR) return;
  stopCursorPoll();
  // Windows/macOS can forward movement while clicks pass to the window below.
  // Poll as a fallback while ignored, including after focus moves to another app.
  if (ignore && process.platform !== 'linux') {
    win.setIgnoreMouseEvents(true, { forward: true });
  } else {
    win.setIgnoreMouseEvents(ignore);
  }
  // 点击气泡或其它窗口后，转发的 mousemove 可能停止；轮询可让猫身上的点击恢复。
  if (ignore) {
    cursorPollTimer = setInterval(() => {
      if (!win || win.isDestroyed()) return stopCursorPoll();
      const point = cursorPositionInWindow();
      const bounds = win.getBounds();
      if (point.x >= 0 && point.y >= 0 && point.x < bounds.width && point.y < bounds.height) {
        win.webContents.send('cursor-position', point);
      }
    }, 75);
  }
}

ipcMain.handle('get-cursor-position', (event) => {
  if (!win || win.isDestroyed() || !CAN_TRACK_CURSOR || event.sender !== win.webContents) return null;
  return cursorPositionInWindow();
});

ipcMain.on('set-mouse-passthrough', (event, ignore) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return;
  setMousePassthrough(ignore === true);
});

ipcMain.on('show-context-menu', () => {
  cancelRoam();
  buildContextMenu().popup({ window: win });
});

// 拖拽用的窗口位置与尺寸。
// 不能每次都用 win.getPosition() 读回再写：在非整数 DPI 缩放（本机 168dpi/1.75x）下，
// 每次 SetWindowPos 都会因 DIP↔物理像素取整让窗口宽高各涨 1px，
// 拖拽时 mousemove 每秒触发几十次，窗口就会越拖越大。
// 修复办法：位置用缓存（不读回），并在每次移动后用 setContentSize 把尺寸钉回目标值。
let posCache = null;        // [x, y] 目标位置（DIP）
let winTargetW = 0;         // 目标窗口宽（含边框）
let winTargetH = 0;
let pendingDelta = null;
let flushScheduled = false;
let roamTimer = null;
let roamAnchorX = null;

function currentPos() {
  if (!posCache) posCache = win.getPosition();
  return posCache;
}

function setStablePosition(x, y) {
  const w = winTargetW || win.getBounds().width;
  const h = winTargetH || win.getBounds().height;
  posCache = [x, y];
  win.setBounds({ x, y, width: w, height: h });
  // 非整数 DPI 下反复移动会扩大窗口，移动后把尺寸钉回原值。
  win.setContentSize(w, h);
}

function cancelRoam() {
  if (roamTimer === null) return;
  clearInterval(roamTimer);
  roamTimer = null;
  if (win && !win.isDestroyed()) win.webContents.send('roam-ended');
}

function cursorNearPet() {
  const point = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  const margin = 20;
  return point.x >= bounds.x - margin && point.x <= bounds.x + bounds.width + margin
    && point.y >= bounds.y - margin && point.y <= bounds.y + bounds.height + margin;
}

function flushMove() {
  flushScheduled = false;
  if (!pendingDelta || !win || win.isDestroyed()) return;
  const { dx, dy } = pendingDelta;
  pendingDelta = null;
  if (!dx && !dy) return;

  const area = screen.getPrimaryDisplay().workArea;
  const [x, y] = currentPos();
  const w = winTargetW || win.getBounds().width;
  const h = winTargetH || win.getBounds().height;
  const nx = Math.min(Math.max(x + dx, area.x), Math.max(area.x, area.x + area.width - w));
  const ny = Math.min(Math.max(y + dy, area.y), Math.max(area.y, area.y + area.height - h));

  setStablePosition(nx, ny);
  roamAnchorX = nx;
}

ipcMain.on('move-window-by', (event, { dx, dy }) => {
  if (!isPetSender(event)) return;
  cancelRoam();
  // 把一帧内的多次 mousemove 合并成一次移动
  if (pendingDelta) {
    pendingDelta.dx += dx;
    pendingDelta.dy += dy;
  } else {
    pendingDelta = { dx, dy };
  }
  if (!flushScheduled) {
    flushScheduled = true;
    setImmediate(flushMove);
  }
});

ipcMain.on('request-roam', (event) => {
  if (!isPetSender(event) || config.plugins?.roam !== true || roamTimer !== null
    || !win.isVisible() || win.isMinimized() || pendingDelta
    || (process.platform === 'linux' && process.env.XDG_SESSION_TYPE === 'wayland')
    || cursorNearPet()) return;

  const activity = activityMonitor?.getState();
  if (activity?.music.playing || activity?.app.category === 'video') return;

  const [startX, y] = currentPos();
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const anchor = Math.min(Math.max(roamAnchorX ?? startX, area.x),
    area.x + area.width - bounds.width);
  const minX = Math.max(area.x, anchor - 180);
  const maxX = Math.min(area.x + area.width - bounds.width, anchor + 180);
  if (maxX - minX < 35) return;

  const distance = 50 + Math.round(Math.random() * 45);
  const direction = Math.random() < 0.5 ? -1 : 1;
  const clamp = (value) => Math.min(Math.max(value, minX), maxX);
  let targetX = clamp(startX + direction * distance);
  if (Math.abs(targetX - startX) < 35) targetX = clamp(startX - direction * distance);
  if (Math.abs(targetX - startX) < 35) return;

  const durationMs = 1300;
  const startedAt = performance.now();
  win.webContents.send('roam-started', durationMs);
  roamTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return cancelRoam();
    if (cursorNearPet() || config.plugins?.roam !== true) return cancelRoam();
    const progress = Math.min(1, (performance.now() - startedAt) / durationMs);
    const eased = progress < 0.5
      ? 2 * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const nextX = Math.round(startX + (targetX - startX) * eased);
    if (nextX !== currentPos()[0]) setStablePosition(nextX, y);
    if (progress >= 1) cancelRoam();
  }, 32);
});

ipcMain.on('cancel-roam', (event) => {
  if (isPetSender(event)) cancelRoam();
});

app.whenReady().then(() => {
  assistantCore = createAssistantCore({
    userDataPath: app.getPath('userData'),
    getConfig: () => config,
    openPath: (file) => shell.openPath(file),
    openExternal: (url) => shell.openExternal(url),
    onReminder: (item) => {
      const message = `提醒你：${item.text}`;
      showPetNotice(message);
      sendAssistantEvent('assistant-notice', { text: message });
      sendAssistantEvent('assistant-reminders-updated', assistantCore.listReminders());
    },
  });
  createWindow();
});

app.on('before-quit', () => {
  activeAssistantRequest?.abort('cancel');
  assistantCore?.stop();
  activityMonitor?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
