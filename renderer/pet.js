(function () {
  const petEl = document.getElementById('pet');
  const bubbleEl = document.getElementById('bubble');

  let bubbleTimer = null;
  let dragging = false;
  let feedReady = false;
  let feedBusy = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gestureClasses = ['reacting', 'wiggling', 'tilting', 'stretching', 'chewing'];
  let gestureEndTimer = null;

  function playGesture(name, durationMs) {
    clearTimeout(gestureEndTimer);
    petEl.classList.remove(...gestureClasses);
    void petEl.offsetWidth; // 重播同一个动作时重新开始动画
    petEl.classList.add(name);
    gestureEndTimer = setTimeout(() => petEl.classList.remove(name), durationMs);
  }

  function scheduleBlink() {
    if (reducedMotion) return;
    setTimeout(() => blinkOnce(Math.random() < 0.18), 3500 + Math.random() * 3500);
  }

  function blinkOnce(doubleBlink) {
    if (dragging || feedReady || feedBusy || document.hidden) {
      scheduleBlink();
      return;
    }
    document.body.classList.remove('blink-recover');
    document.body.classList.add('blinking');
    setTimeout(() => {
      document.body.classList.add('blink-recover');
      document.body.classList.remove('blinking');
      setTimeout(() => {
        document.body.classList.remove('blink-recover');
        if (doubleBlink) setTimeout(() => blinkOnce(false), 180);
        else scheduleBlink();
      }, 90);
    }, 130);
  }

  function scheduleIdleGesture() {
    if (reducedMotion) return;
    setTimeout(() => {
      if (!dragging && !feedReady && !feedBusy && !document.hidden
        && !gestureClasses.some((name) => petEl.classList.contains(name))) {
        const gesture = Math.random() < 0.5 ? 'tilting' : 'stretching';
        playGesture(gesture, 1200);
      }
      scheduleIdleGesture();
    }, 12000 + Math.random() * 8000);
  }

  // ---- 姿态（素材库的 idle_center / idle_front / idle_left_tilt）----
  // idle_center : 默认待机
  // idle_left_tilt : 思考 / 关注 / 疑惑
  // idle_front  : 正面自然待机
  // 摸一下（点击）就切到下一个姿态，循环。
  const POSES = ['idle_center', 'idle_left_tilt', 'idle_front'];
  const DEFAULT_POSE = 'idle_center';
  // 语义别名，方便插件用状态名切换
  const POSE_ALIAS = {
    idle: 'idle_center',
    attention: 'idle_left_tilt',
    thinking: 'idle_left_tilt',
    front: 'idle_front',
  };
  let poseIndex = 0;   // 当前处于循环中的第几个姿态

  function renderPose() {
    document.body.dataset.pose = POSES[poseIndex];
  }

  // 切到循环里的下一个形态
  function nextPose() {
    poseIndex = (poseIndex + 1) % POSES.length;
    renderPose();
    return POSES[poseIndex];
  }

  // 显式指定形态（插件用），会同步循环位置以便后续点击从它继续
  function setPose(pose) {
    const name = POSE_ALIAS[pose] || pose;
    const i = POSES.indexOf(name);
    if (i < 0) return;
    poseIndex = i;
    renderPose();
  }

  function resetPose() {
    poseIndex = POSES.indexOf(DEFAULT_POSE);
    renderPose();
  }

  // ---- 暴露给所有插件使用的公共 API ----
  const petAPI = {
    say(text, durationMs = 3500) {
      bubbleEl.textContent = text;
      bubbleEl.classList.add('show');
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => {
        bubbleEl.classList.remove('show');
        updateFromSystemCursor();
      }, durationMs);
      updateFromSystemCursor();
    },
    // 切换姿态：'idle_center' | 'idle_left_tilt' | 'idle_front'
    // （也接受 idle / attention / thinking / front 这类语义别名）
    setPose,
    resetPose,
    // 手动切到下一个姿态（和"摸一下"等效）
    nextPose,
    react() {
      playGesture(Math.random() < 0.5 ? 'reacting' : 'wiggling', 650);
    },
    config: null, // 启动后由 main 注入
  };
  window.petAPI = petAPI;

  // ---- 拖拽(手动实现,避免和点击手势冲突) ----
  let lastX = 0, lastY = 0;
  let moved = false;
  let mousePassthrough = null; // Force an initial sync after a renderer reload.
  const poseImages = Array.from(petEl.querySelectorAll('.pose'));
  const alphaProbe = document.createElement('canvas');
  alphaProbe.width = alphaProbe.height = 1;
  const alphaContext = alphaProbe.getContext('2d', { willReadFrequently: true });
  let canReadAlpha = !!alphaContext;

  function isOverVisiblePet(x, y) {
    for (const img of poseImages) {
      if (Number.parseFloat(getComputedStyle(img).opacity) < 0.08) continue;
      const rect = img.getBoundingClientRect();
      if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) continue;
      if (!canReadAlpha || !img.complete || !img.naturalWidth) return true;

      const sx = Math.min(img.naturalWidth - 1,
        Math.floor((x - rect.left) * img.naturalWidth / rect.width));
      const sy = Math.min(img.naturalHeight - 1,
        Math.floor((y - rect.top) * img.naturalHeight / rect.height));
      try {
        alphaContext.clearRect(0, 0, 1, 1);
        alphaContext.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1);
        if (alphaContext.getImageData(0, 0, 1, 1).data[3] >= 24) return true;
      } catch (e) {
        // If canvas pixel reads are restricted, retain the image bounds as a safe hit area.
        canReadAlpha = false;
        return true;
      }
    }
    return false;
  }

  function isOverInteractiveContent(x, y) {
    if (bubbleEl.classList.contains('show')) {
      const bubbleRect = bubbleEl.getBoundingClientRect();
      if (x >= bubbleRect.left && x < bubbleRect.right
        && y >= bubbleRect.top && y < bubbleRect.bottom) return true;
    }
    return isOverVisiblePet(x, y);
  }

  function setMousePassthrough(ignore) {
    if (mousePassthrough === ignore) return;
    mousePassthrough = ignore;
    window.petBridge.setMousePassthrough(ignore);
  }

  function updateMousePassthrough(x, y) {
    if (!dragging) setMousePassthrough(!isOverInteractiveContent(x, y));
  }

  async function updateFromSystemCursor() {
    try {
      const point = await window.petBridge.getCursorPosition();
      if (point) updateMousePassthrough(point.x, point.y);
    } catch (e) {
      console.warn('[pet] 读取鼠标位置失败:', e);
    }
  }

  poseImages.forEach((img) => img.addEventListener('load', updateFromSystemCursor));
  bubbleEl.addEventListener('click', () => {
    clearTimeout(bubbleTimer);
    bubbleEl.classList.remove('show');
    updateFromSystemCursor();
  });
  window.petBridge.onCursorPosition((point) => updateMousePassthrough(point.x, point.y));
  window.addEventListener('focus', updateFromSystemCursor);
  window.addEventListener('mouseleave', () => {
    setFeedReady(false);
    if (!dragging) setMousePassthrough(true);
  });

  petEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    lastX = e.screenX;
    lastY = e.screenY;
    clearTimeout(gestureEndTimer);
    petEl.classList.remove(...gestureClasses);
    petEl.classList.add('dragging');
  });

  window.addEventListener('mousemove', (e) => {
    updateMousePassthrough(e.clientX, e.clientY);
    if (!dragging) return;
    if (!(e.buttons & 1)) {
      dragging = false;
      petEl.classList.remove('dragging');
      updateMousePassthrough(e.clientX, e.clientY);
      return;
    }
    const dx = e.screenX - lastX;
    const dy = e.screenY - lastY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
    lastX = e.screenX;
    lastY = e.screenY;
    window.petBridge.moveWindowBy(dx, dy);
  });

  // 文件只在猫身上松手时投喂；窗口其它区域不触发删除。
  function hasFileDrag(e) {
    return e.dataTransfer && (Array.from(e.dataTransfer.types).includes('Files')
      || e.dataTransfer.files.length > 0);
  }

  function renderFeedState() {
    document.body.classList.toggle('feeding', feedReady || feedBusy);
    petEl.classList.toggle('ready-to-feed', feedReady && !feedBusy);
    updateFromSystemCursor();
  }

  function setFeedReady(ready) {
    if (feedReady === ready) return;
    feedReady = ready;
    renderFeedState();
  }

  window.addEventListener('dragover', (e) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    const ready = !feedBusy && isOverVisiblePet(e.clientX, e.clientY);
    e.dataTransfer.dropEffect = ready ? 'move' : 'none';
    setFeedReady(ready);
  });

  window.addEventListener('dragleave', (e) => {
    if (e.clientX <= 0 || e.clientY <= 0
      || e.clientX >= innerWidth - 1 || e.clientY >= innerHeight - 1) {
      setFeedReady(false);
    }
  });

  window.addEventListener('drop', async (e) => {
    if (!hasFileDrag(e)) return;
    e.preventDefault();
    const overPet = feedReady && isOverVisiblePet(e.clientX, e.clientY);
    const files = Array.from(e.dataTransfer.files);
    setFeedReady(false);
    if (!overPet || feedBusy) return;
    if (files.length !== 1) {
      petAPI.say('一次只吃一个文件喵。', 2500);
      return;
    }

    feedBusy = true;
    renderFeedState();
    try {
      const result = await window.petBridge.feedFile(files[0]);
      if (result.ok) {
        playGesture('chewing', 650);
        petAPI.say('吃掉啦！回收站还能找回。', 3000);
        setTimeout(() => {
          feedBusy = false;
          renderFeedState();
        }, 650);
        return;
      }
      const messages = {
        'not-a-file': '文件夹先不吃，文件还在。',
        'app-file': '我的文件不能吃喵。',
        'invalid-file': '只吃本地文件喵。',
      };
      petAPI.say(messages[result.reason] || '没吃下去，文件还在原处。', 3000);
    } catch (error) {
      console.warn('[pet] 投喂失败:', error);
      petAPI.say('没吃下去，文件还在原处。', 3000);
    }
    feedBusy = false;
    renderFeedState();
  });

  // ---- 插件运行状态 ----
  // 主进程已经把默认值合并进 config.plugins，所以这里直接按配置判断：
  // 只有显式为 true 的插件才运行；未列出的不运行（避免"偷偷在跑却没有开关"）。
  const runningPlugins = new Map();   // id -> plugin 实例
  const stoppedPlugins = new Set();   // 已执行过 stop 的 id，避免重复清理

  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    petEl.classList.remove('dragging');
    updateMousePassthrough(e.clientX, e.clientY);
    if (!moved) {
      // 视为一次点击（"摸一下"）：弹跳或摇摆，并切到下一个姿态
      petAPI.react();
      nextPose();
      // 只触发正在运行的插件（否则被关掉的插件仍会响应点击）
      runningPlugins.forEach((p) => {
        if (typeof p.onClick === 'function') p.onClick(petAPI);
      });
    }
  });

  window.addEventListener('blur', () => {
    dragging = false;
    petEl.classList.remove('dragging');
    setFeedReady(false);
    updateFromSystemCursor();
  });

  // ---- 右键菜单 ----
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.petBridge.showContextMenu();
  });

  // ---- 插件启停 ----

  function applyPlugins(config) {
    const states = (config && config.plugins) || {};

    window.PetPlugins.forEach((plugin) => {
      const wanted = states[plugin.id] === true;
      const isRunning = runningPlugins.has(plugin.id);
      if (wanted === isRunning) return;

      if (wanted) {
        stoppedPlugins.delete(plugin.id);
        runningPlugins.set(plugin.id, plugin);
        // 单个插件 init 抛错不应影响其它插件
        try {
          if (typeof plugin.init === 'function') plugin.init(petAPI);
          console.log('[pet] 插件已启用:', plugin.id);
        } catch (e) {
          console.warn('[pet] 插件 init 出错:', plugin.id, e);
        }
      } else {
        runningPlugins.delete(plugin.id);
        // 调用 stop 让插件自己清掉 setInterval 之类的副作用
        if (!stoppedPlugins.has(plugin.id) && typeof plugin.stop === 'function') {
          try {
            plugin.stop(petAPI);
          } catch (e) {
            console.warn('[pet] 插件 stop 出错:', plugin.id, e);
          }
        }
        stoppedPlugins.add(plugin.id);
        console.log('[pet] 插件已停用:', plugin.id);
      }
    });
  }

  // ---- 角色显示尺寸 ----
  // 主进程通过 URL 查询参数传入 config.size，这里落到 CSS 变量 --pet-w 上，
  // 保证"改配置就能改大小"，而不是写死在 CSS 里。
  function applySize(config) {
    let s = Number(new URLSearchParams(location.search).get('size'));
    if (!Number.isFinite(s) || s <= 0) s = Number(config && config.size);
    if (!Number.isFinite(s) || s <= 0) s = 99;
    document.documentElement.style.setProperty('--pet-w', s + 'px');
  }

  // ---- 启动:加载配置,应用姿态,初始化插件 ----
  async function boot() {
    renderPose();   // 角色改为实拍素材后不再有皮肤，固定从待机姿态开始
    const config = await window.petBridge.getConfig();
    petAPI.config = config;
    applySize(config);

    // 提醒开发者：注册了插件但没写进 pluginDefaults，会导致它永远不会被启用
    const declared = Object.keys((config && config.plugins) || {});
    window.PetPlugins.forEach((p) => {
      if (!declared.includes(p.id)) {
        console.warn('[pet] 插件 "' + p.id + '" 未在 config.json 的 pluginDefaults 中声明，'
          + '不会启用（请加一行 "' + p.id + '": true）');
      }
    });

    applyPlugins(config);
    updateFromSystemCursor();
    scheduleBlink();
    scheduleIdleGesture();
  }

  window.petBridge.onConfigUpdated((config) => {
    petAPI.config = config;
    applySize(config);      // 尺寸跟随配置
    applyPlugins(config);   // 右键菜单里开关插件后立即生效，无需重启
  });

  boot();
})();
