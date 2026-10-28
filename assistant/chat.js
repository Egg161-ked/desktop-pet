(function () {
  const bridge = window.assistantBridge;
  const messages = document.getElementById('messages');
  const form = document.getElementById('message-form');
  const input = document.getElementById('message-input');
  const send = document.getElementById('send');
  const cancel = document.getElementById('cancel');
  const busyStatus = document.getElementById('busy-status');
  const busyText = document.getElementById('busy-text');
  const connectionDot = document.getElementById('connection-dot');
  const connectionText = document.getElementById('connection-text');
  const modelName = document.getElementById('model-name');
  const remindersPanel = document.getElementById('reminders-panel');
  const reminderList = document.getElementById('reminder-list');
  const reminderCount = document.getElementById('reminder-count');
  const appChips = document.getElementById('app-chips');
  let busy = false;
  let pendingAnswer = null;

  function appendMessage(role, text, loading = false) {
    const row = document.createElement('div');
    row.className = `message ${role}${loading ? ' loading' : ''}`;
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = text;
    row.append(bubble);
    messages.append(row);
    messages.scrollTop = messages.scrollHeight;
    return { row, bubble };
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value;
    cancel.hidden = !value;
    busyStatus.hidden = !value;
    if (value) busyText.textContent = '猫咪正在想…';
  }

  function renderReminders(reminders) {
    reminderList.replaceChildren();
    reminderCount.textContent = String(reminders.length);
    reminderCount.hidden = reminders.length === 0;
    if (!reminders.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-reminders';
      empty.textContent = '还没有待办提醒。';
      reminderList.append(empty);
      return;
    }
    for (const reminder of reminders) {
      const row = document.createElement('div');
      row.className = 'reminder-item';
      const info = document.createElement('div');
      info.className = 'reminder-info';
      const title = document.createElement('strong');
      title.textContent = reminder.text;
      const time = document.createElement('time');
      time.dateTime = new Date(reminder.dueAt).toISOString();
      time.textContent = new Intl.DateTimeFormat('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
      }).format(reminder.dueAt);
      info.append(title, time);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '取消';
      button.addEventListener('click', async () => {
        button.disabled = true;
        const result = await bridge.cancelReminder(reminder.id);
        if (result) renderReminders(result.reminders);
        else button.disabled = false;
      });
      row.append(info, button);
      reminderList.append(row);
    }
  }

  function renderApps(apps) {
    appChips.replaceChildren();
    if (!apps.length) {
      appChips.textContent = '暂时没有可打开的应用';
      return;
    }
    for (const app of apps) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'app-chip';
      button.textContent = app.label;
      button.addEventListener('click', () => {
        input.value = `打开 ${app.label}`;
        input.focus();
      });
      appChips.append(button);
    }
  }

  async function refreshState() {
    try {
      const state = await bridge.getState();
      if (!state) return;
      modelName.textContent = state.model;
      connectionDot.classList.toggle('online', state.online);
      connectionDot.classList.toggle('offline', !state.online);
      connectionText.textContent = state.online ? '本地模型已连接' : '模型未连接，快捷任务仍可使用';
      renderReminders(state.reminders);
      renderApps(state.apps);
    } catch {
      connectionText.textContent = '连接状态暂时不可用';
    }
  }

  async function submitMessage() {
    if (busy) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = '';
    appendMessage('user', text);
    pendingAnswer = appendMessage('assistant', '…', true);
    setBusy(true);
    try {
      const result = await bridge.sendMessage(text);
      pendingAnswer.bubble.textContent = result.ok ? result.reply : result.error;
      pendingAnswer.row.classList.remove('loading');
      if (result.reminders) renderReminders(result.reminders);
      if (!result.ok && /Ollama|模型/.test(result.error)) refreshState();
    } catch {
      pendingAnswer.bubble.textContent = '处理失败，请稍后再试。';
      pendingAnswer.row.classList.remove('loading');
    } finally {
      pendingAnswer = null;
      setBusy(false);
      messages.scrollTop = messages.scrollHeight;
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitMessage();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      submitMessage();
    }
  });
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 98)}px`;
  });
  cancel.addEventListener('click', () => bridge.cancel());
  document.getElementById('close').addEventListener('click', () => bridge.close());
  document.getElementById('refresh').addEventListener('click', refreshState);
  document.getElementById('reminders-toggle').addEventListener('click', () => {
    remindersPanel.hidden = !remindersPanel.hidden;
  });
  document.querySelectorAll('.suggestion').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.prompt;
      input.focus();
    });
  });
  bridge.onProgress((progress) => {
    if (!busy || !pendingAnswer) return;
    if (progress.status) busyText.textContent = progress.status;
    if (typeof progress.text === 'string' && progress.text) {
      pendingAnswer.bubble.textContent = progress.text;
      pendingAnswer.row.classList.remove('loading');
      messages.scrollTop = messages.scrollHeight;
    }
  });
  bridge.onNotice((notice) => appendMessage('assistant', notice.text));
  bridge.onRemindersUpdated(renderReminders);
  refreshState();
  input.focus();
})();
