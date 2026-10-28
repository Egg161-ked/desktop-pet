const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const OLLAMA_CHAT_URL = 'http://127.0.0.1:11434/api/chat';
const MAX_REMINDER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TIMER_MS = 2 ** 31 - 1;

function startMenuPaths(...names) {
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    process.env.ProgramData && path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);
  return roots.flatMap((root) => names.map((name) => path.join(root, name)));
}

function availableApps(config) {
  const system = process.env.SystemRoot || 'C:\\Windows';
  const definitions = [
    { id: 'vscode', label: 'VS Code', aliases: ['vscode', 'vs code', 'visual studio code', '代码编辑器'],
      paths: startMenuPaths('Visual Studio Code.lnk', 'Visual Studio Code/Visual Studio Code.lnk') },
    { id: 'powerpoint', label: 'PowerPoint', aliases: ['ppt', 'powerpoint', '幻灯片'],
      paths: startMenuPaths('PowerPoint.lnk', 'Microsoft Office/PowerPoint.lnk') },
    { id: 'altium', label: 'Altium Designer', aliases: ['altium', 'altium designer', 'pcb软件', '画板软件'],
      paths: startMenuPaths('Altium/Altium Designer Agile.lnk', 'Altium/Altium Designer.lnk') },
    { id: 'notepad', label: '记事本', aliases: ['记事本', 'notepad'],
      paths: [path.join(system, 'System32', 'notepad.exe')] },
    { id: 'calculator', label: '计算器', aliases: ['计算器', 'calc'],
      paths: [path.join(system, 'System32', 'calc.exe')] },
    { id: 'explorer', label: '文件管理器', aliases: ['文件管理器', '资源管理器', 'explorer'],
      paths: [path.join(system, 'explorer.exe')] },
  ];

  // 用户可以在自己的 config.json 里明确加入其它程序；模型不能提供任意路径。
  if (Array.isArray(config.assistantApps)) {
    for (const item of config.assistantApps) {
      if (!item || !/^[a-z0-9_-]{1,32}$/i.test(item.id || '')
        || typeof item.label !== 'string' || item.label.length > 32
        || typeof item.path !== 'string' || !path.isAbsolute(item.path)
        || !/\.(exe|lnk)$/i.test(item.path)) continue;
      definitions.push({ id: item.id, label: item.label, aliases: [item.label], paths: [item.path] });
    }
  }

  const seen = new Set();
  return definitions.flatMap((item) => {
    if (seen.has(item.id)) return [];
    const executable = item.paths.find((candidate) => fs.existsSync(candidate));
    if (!executable) return [];
    seen.add(item.id);
    return [{ id: item.id, label: item.label, aliases: item.aliases, executable }];
  });
}

function cleanReply(value) {
  return String(value || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

function durationFromText(text) {
  const match = text.match(/(半\s*小时|\d+(?:\.\d+)?\s*(?:个?\s*小时|分钟?|分|天))\s*(?:后|以后)?/);
  if (!match) return null;
  const phrase = match[1];
  let minutes;
  if (/半/.test(phrase)) minutes = 30;
  else {
    const amount = Number.parseFloat(phrase);
    minutes = /天/.test(phrase) ? amount * 1440
      : /小时/.test(phrase) ? amount * 60 : amount;
  }
  const hasDelay = /后|以后/.test(match[0]) || /计时|倒计时|定时器/.test(text);
  if (!hasDelay || !Number.isFinite(minutes)) return null;
  return { minutes, phrase: match[0] };
}

function reminderTextFrom(input, durationPhrase) {
  return input.replace(durationPhrase, '')
    .replace(/帮我|请|设置|设个|一个|提醒我|提醒|叫我|通知我|计时器|倒计时|定时器/g, '')
    .replace(/^[\s，,：:。]+|[\s，,：:。]+$/g, '')
    .slice(0, 80) || '时间到了';
}

function mentionedApp(input, apps) {
  const normalized = input.toLowerCase().replace(/[\s._-]/g, '');
  return apps.find((item) => item.aliases.some((alias) =>
    normalized.includes(alias.toLowerCase().replace(/[\s._-]/g, ''))));
}

function hasLaunchRequest(input) {
  return /^(?:请(?:你)?|麻烦你)?\s*(?:打开|启动|运行)/.test(input)
    || /(?:帮我|替我|给我).*(?:打开|启动|运行)/.test(input)
    || /把.+(?:打开|启动|运行)/.test(input);
}

function directIntent(input, apps) {
  const search = input.match(/^(?:请|帮我)?\s*(?:网页搜索|必应搜索|搜索|搜一下|搜一搜|上网查)\s*[：:，,]?\s*(.+)$/);
  if (search) return { kind: 'search', query: search[1].trim() };
  const duration = durationFromText(input);
  if (/(提醒|叫我|通知我|计时|倒计时|定时器)/.test(input) && duration) {
    return { kind: 'reminder', minutes: duration.minutes,
      reminderText: reminderTextFrom(input, duration.phrase) };
  }
  if (hasLaunchRequest(input)) {
    const item = mentionedApp(input, apps);
    return item ? { kind: 'open_app', appId: item.id } : { kind: 'unknown_app' };
  }
  return null;
}

function createAssistantCore({ userDataPath, getConfig, openPath, openExternal, onReminder }) {
  const reminderFile = path.join(userDataPath, 'assistant-reminders.json');
  let reminders = [];
  let reminderTimer = null;
  const history = [];

  try {
    const saved = JSON.parse(fs.readFileSync(reminderFile, 'utf8').replace(/^\uFEFF/, ''));
    if (Array.isArray(saved)) reminders = saved.filter((item) => item
      && typeof item.id === 'string' && typeof item.text === 'string'
      && Number.isFinite(item.dueAt));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[pet] 读取提醒失败:', error.message);
  }

  function saveReminders() {
    fs.writeFileSync(reminderFile, JSON.stringify(reminders, null, 2), 'utf8');
  }

  function scheduleReminders() {
    clearTimeout(reminderTimer);
    reminderTimer = null;
    if (!reminders.length) return;
    const next = Math.min(...reminders.map((item) => item.dueAt));
    const delay = Math.min(Math.max(next - Date.now(), 0), MAX_TIMER_MS);
    reminderTimer = setTimeout(() => {
      const now = Date.now();
      const due = reminders.filter((item) => item.dueAt <= now);
      if (due.length) {
        reminders = reminders.filter((item) => item.dueAt > now);
        try { saveReminders(); } catch (error) {
          console.warn('[pet] 保存提醒失败:', error.message);
        }
        for (const item of due) onReminder(item);
      }
      scheduleReminders();
    }, delay);
  }
  scheduleReminders();

  function listReminders() {
    return reminders.map((item) => ({ ...item })).sort((a, b) => a.dueAt - b.dueAt);
  }

  function addReminder(minutes, text) {
    const delay = Math.round(minutes * 60_000);
    if (!Number.isFinite(delay) || delay < 60_000 || delay > MAX_REMINDER_MS) {
      return { reply: '提醒时间请设在 1 分钟到 7 天之间。', kind: 'message' };
    }
    const item = { id: randomUUID(), dueAt: Date.now() + delay,
      text: String(text || '时间到了').trim().slice(0, 80) || '时间到了' };
    reminders.push(item);
    try { saveReminders(); } catch (error) {
      reminders.pop();
      console.warn('[pet] 保存提醒失败:', error.message);
      return { reply: '提醒没保存成功，请稍后再试。', kind: 'message' };
    }
    scheduleReminders();
    return { reply: `好，${Math.round(minutes)} 分钟后提醒你：${item.text}`, kind: 'reminder' };
  }

  function cancelReminder(id) {
    const previous = reminders;
    reminders = reminders.filter((item) => item.id !== id);
    if (reminders.length === previous.length) return false;
    try { saveReminders(); } catch (error) {
      reminders = previous;
      console.warn('[pet] 取消提醒失败:', error.message);
      return false;
    }
    scheduleReminders();
    return true;
  }

  function remember(input, reply) {
    history.push({ role: 'user', content: input }, { role: 'assistant', content: reply });
    if (history.length > 8) history.splice(0, history.length - 8);
  }

  async function ollamaRequest(payload, signal) {
    let response;
    try {
      response = await fetch(OLLAMA_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('连不上本机 Ollama。打开 Ollama 后再和我聊吧。');
    }
    if (!response.ok) throw new Error(`Ollama 返回 ${response.status}，请确认模型已安装。`);
    return response;
  }

  function systemPrompt(context) {
    const activity = context?.app?.category || 'other';
    const music = context?.music?.playing ? '正在播放媒体' : '没有播放媒体';
    return `你是用户桌面上的猫咪助手。用自然、简短的中文回答，通常不超过 100 字。`
      + `可以有一点猫的语气，但不要反复卖萌。不能声称自己执行了尚未执行的操作。`
      + `你只知道当前应用类别是 ${activity}，${music}；不知道网页、文档或屏幕内容。`;
  }

  async function chat(input, context, onPartial, signal) {
    const payload = {
      model: getConfig().assistantModel || 'deepseek-r1:7b',
      messages: [{ role: 'system', content: systemPrompt(context) }, ...history, { role: 'user', content: input }],
      think: false,
      stream: true,
      keep_alive: '2m',
      options: { temperature: 0.65, num_predict: 180, num_ctx: 2048 },
    };
    const response = await ollamaRequest(payload, signal);
    if (!response.body) throw new Error('Ollama 没有返回内容。');
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        const part = JSON.parse(line);
        if (part.error) throw new Error(part.error);
        content += part.message?.content || '';
        onPartial(cleanReply(content).slice(0, 2000));
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const part = JSON.parse(buffer.trim());
      if (part.error) throw new Error(part.error);
      content += part.message?.content || '';
    }
    const reply = cleanReply(content).slice(0, 2000) || '我刚才没想好，可以再说一次吗？';
    remember(input, reply);
    return { reply, kind: 'chat' };
  }

  async function classify(input, apps, context, signal) {
    const ids = apps.map((item) => item.id);
    const schema = {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['chat', 'reminder', 'open_app', 'search'] },
        reply: { type: 'string' },
        minutes: { type: 'number' },
        reminder_text: { type: 'string' },
        app_id: { type: 'string', enum: ['', ...ids] },
        query: { type: 'string' },
      },
      required: ['kind', 'reply'],
      additionalProperties: false,
    };
    const payload = {
      model: getConfig().assistantModel || 'deepseek-r1:7b',
      messages: [
        { role: 'system', content: systemPrompt(context)
          + ' 判断用户是否明确要求设置提醒、打开应用或网页搜索。只有明确要求才选相应 kind。'
          + `可打开的应用 ID：${ids.join('、') || '无'}。若不确定，选 chat 并在 reply 中回答或询问。`
          + ' 提醒只支持几分钟或几小时后；其它时间表达请在 reply 中请用户改说。' },
        { role: 'user', content: input },
      ],
      format: schema,
      think: false,
      stream: false,
      keep_alive: '2m',
      options: { temperature: 0, num_predict: 200, num_ctx: 2048 },
    };
    const response = await ollamaRequest(payload, signal);
    const data = await response.json();
    try { return JSON.parse(cleanReply(data.message?.content)); }
    catch { return { kind: 'chat', reply: '我没听懂这项操作，可以换个说法吗？' }; }
  }

  async function execute(intent, input, apps) {
    if (intent.kind === 'reminder') {
      const duration = durationFromText(input);
      if (!/(提醒|叫我|通知我|计时|倒计时|定时器)/.test(input) || !duration) {
        return { reply: '请告诉我“多少分钟后提醒你做什么”。', kind: 'message' };
      }
      return addReminder(duration.minutes, reminderTextFrom(input, duration.phrase));
    }
    if (intent.kind === 'open_app') {
      const item = apps.find((app) => app.id === intent.appId);
      if (!hasLaunchRequest(input) || !item || mentionedApp(input, apps)?.id !== item.id) {
        return { reply: `我能打开：${apps.map((app) => app.label).join('、') || '暂无应用'}。`, kind: 'message' };
      }
      const error = await openPath(item.executable);
      return error
        ? { reply: `没能打开 ${item.label}：${error}`, kind: 'message' }
        : { reply: `${item.label} 已打开。`, kind: 'open_app' };
    }
    if (intent.kind === 'unknown_app') {
      return { reply: `我现在能打开：${apps.map((app) => app.label).join('、') || '暂无应用'}。`, kind: 'message' };
    }
    if (intent.kind === 'search') {
      if (!/(搜索|搜一下|搜一搜|上网查|必应搜索)/.test(input)) {
        return { reply: '请直接说“搜索＋要查的内容”。', kind: 'message' };
      }
      const query = String(intent.query || '').trim().slice(0, 160);
      if (!query) return { reply: '你想搜索什么？', kind: 'message' };
      await openExternal(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
      return { reply: `已在浏览器搜索：${query}`, kind: 'search' };
    }
    return { reply: cleanReply(intent.reply).slice(0, 2000) || '能再说详细一点吗？', kind: 'chat' };
  }

  async function handleMessage(input, { context, onPartial, onStatus, signal }) {
    const text = String(input || '').trim().slice(0, 400);
    if (!text) return { reply: '你想让我做什么？', kind: 'message' };
    const apps = availableApps(getConfig());
    const direct = directIntent(text, apps);
    if (direct) {
      onStatus('正在处理…');
      return execute(direct, text, apps);
    }
    if (/(提醒|计时|倒计时|定时器|打开|启动|运行|搜索|搜一下|查资料|查一下)/.test(text)) {
      onStatus('正在理解你的意思…');
      const intent = await classify(text, apps, context, signal);
      const result = await execute(intent, text, apps);
      if (result.kind === 'chat') remember(text, result.reply);
      return result;
    }
    onStatus('猫咪正在想…');
    return chat(text, context, onPartial, signal);
  }

  async function ollamaOnline() {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1800) });
      return response.ok;
    } catch { return false; }
  }

  return {
    getApps: () => availableApps(getConfig()).map(({ id, label }) => ({ id, label })),
    listReminders,
    cancelReminder,
    handleMessage,
    ollamaOnline,
    stop: () => clearTimeout(reminderTimer),
  };
}

module.exports = { createAssistantCore };
