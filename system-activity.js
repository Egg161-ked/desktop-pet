const path = require('path');

const APP_POLL_MS = 2500;

function appCategory(owner) {
  const executable = path.basename(owner.path || '').toLowerCase();
  const name = (owner.name || '').toLowerCase().trim();
  const matches = (...names) => names.includes(executable) || names.includes(name);

  if (matches('code.exe', 'visual studio code', 'cursor.exe', 'cursor',
    'codium.exe', 'windsurf.exe',
    'webstorm64.exe', 'idea64.exe', 'pycharm64.exe', 'devenv.exe',
    'sublime_text.exe', 'notepad++.exe')) return 'code';
  if (matches('powerpnt.exe', 'microsoft powerpoint', 'wpp.exe',
    'wps presentation', 'impress.exe')) return 'presentation';
  if (matches('pcbnew.exe', 'altiumdesigner.exe', 'dxp.exe', 'easyeda.exe',
    'lceda.exe', 'kicad pcb editor', 'altium designer', 'easyeda')) return 'pcb';
  if (matches('potplayermini64.exe', 'potplayermini.exe', 'vlc.exe',
    'mpv.exe', 'mpc-hc64.exe', 'mpc-hc.exe', 'potplayer',
    'vlc media player')) return 'video';
  if (matches('chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
    'opera.exe', 'vivaldi.exe', 'qqbrowser.exe', '360se.exe',
    'google chrome', 'microsoft edge', 'mozilla firefox', 'brave browser')) return 'browser';
  return 'other';
}

function createSystemActivity({ onUpdate, isOwnWindow, packaged, resourcesPath }) {
  const state = { music: { playing: false, epoch: 0 }, app: { category: 'other' } };
  let musicEnabled = false;
  let appEnabled = false;
  let mediaManager = null;
  let mediaIdentity = '';
  let mediaSessionId = '';
  let appTimer = null;
  let appPolling = false;
  let windowModulePromise = null;
  let candidate = null;
  let candidateCount = 0;

  function publish() {
    onUpdate({ music: { ...state.music }, app: { ...state.app } });
  }

  function readMediaSessions(sessions) {
    if (!musicEnabled) return;
    const playing = sessions.find((s) => s.playbackStatus === 'playing' && s.id === mediaSessionId)
      || sessions.find((s) => s.playbackStatus === 'playing');
    const identity = playing
      ? [playing.id, playing.title || '', playing.artist || ''].join('\u0000') : '';
    const nextPlaying = !!playing;
    if (nextPlaying === state.music.playing && (!nextPlaying || identity === mediaIdentity)) return;
    if (nextPlaying && identity !== mediaIdentity) state.music.epoch += 1;
    if (nextPlaying) {
      mediaIdentity = identity;
      mediaSessionId = playing.id;
    }
    state.music.playing = nextPlaying;
    publish();
  }

  function startMusic() {
    try {
      const { createSessionManager } = require('windows-media-sessions');
      const backendPath = packaged
        ? path.join(resourcesPath, 'activity-backend', 'windows-media-sessions-backend.exe')
        : path.join(path.dirname(require.resolve('windows-media-sessions/package.json')),
          'bin', 'win-x64', 'windows-media-sessions-backend.exe');
      const manager = createSessionManager({ backendPath });
      mediaManager = manager;
      manager.on('error', (error) => console.warn('[pet] 媒体会话读取失败:', error.message));
      manager.onSessionsChanged((sessions) => {
        if (mediaManager === manager) readMediaSessions(sessions);
      });
    } catch (error) {
      console.warn('[pet] 无法启用音乐联动:', error.message);
    }
  }

  function stopMusic() {
    const manager = mediaManager;
    mediaManager = null;
    if (manager) manager.stop().catch((error) => {
      console.warn('[pet] 停止媒体会话失败:', error.message);
    });
    if (state.music.playing) {
      state.music.playing = false;
      publish();
    }
  }

  async function pollApp() {
    if (!appEnabled || appPolling) return;
    appPolling = true;
    try {
      windowModulePromise ||= import('get-windows');
      const { activeWindow } = await windowModulePromise;
      const active = await activeWindow();
      if (!appEnabled || !active || !active.owner || isOwnWindow(active.owner)) return;
      const category = appCategory(active.owner);
      if (category === candidate) candidateCount += 1;
      else {
        candidate = category;
        candidateCount = 1;
      }
      if (candidateCount >= 2 && category !== state.app.category) {
        state.app.category = category;
        publish();
      }
    } catch (error) {
      // 运行中的窗口识别偶尔失败时保持上一个状态，下一轮再试。
      windowModulePromise = null;
      console.warn('[pet] 前台应用读取失败:', error.message);
    } finally {
      appPolling = false;
    }
  }

  function setEnabled({ music, app }) {
    if (process.platform !== 'win32') return;
    if (music !== musicEnabled) {
      musicEnabled = music;
      if (music) startMusic();
      else stopMusic();
    }
    if (app !== appEnabled) {
      appEnabled = app;
      if (app) {
        pollApp();
        appTimer = setInterval(pollApp, APP_POLL_MS);
      } else {
        clearInterval(appTimer);
        appTimer = null;
        candidate = null;
        candidateCount = 0;
        if (state.app.category !== 'other') {
          state.app.category = 'other';
          publish();
        }
      }
    }
  }

  function stop() {
    setEnabled({ music: false, app: false });
  }

  return { getState: () => ({ music: { ...state.music }, app: { ...state.app } }), setEnabled, stop };
}

module.exports = { createSystemActivity };
