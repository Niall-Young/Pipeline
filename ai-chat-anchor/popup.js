const PLATFORMS = {
  'claude.ai': { name: 'Claude' },
  'chatgpt.com': { name: 'ChatGPT' },
  'gemini.google.com': { name: 'Gemini' },
  'doubao.com': { name: '豆包' },
  'qianwen.com': { name: '千问' },
};

let activeTabId = null;
let detectedPlatform = null;
let isParallelEnabled = false;

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    renderUnsupported('未找到当前标签页');
    return;
  }

  activeTabId = tab.id;
  detectedPlatform = detectPlatform(tab.url || '');
  updatePlatformBar();

  if (!detectedPlatform) {
    renderUnsupported('请在 Claude、ChatGPT、Gemini、豆包或千问页面中使用');
    return;
  }

  renderMainContent();
  await syncParallelState();
});

function detectPlatform(url) {
  for (const [domain, info] of Object.entries(PLATFORMS)) {
    if (url.includes(domain)) {
      return { domain, ...info };
    }
  }
  return null;
}

function updatePlatformBar() {
  const dot = document.getElementById('platform-dot');
  const name = document.getElementById('platform-name');
  if (!dot || !name) return;

  if (detectedPlatform) {
    dot.classList.add('active');
    name.textContent = detectedPlatform.name;
  } else {
    dot.classList.remove('active');
    name.textContent = '不支持的页面';
  }
}

function renderUnsupported(message) {
  const container = document.getElementById('main-content');
  if (!container) return;

  container.innerHTML = `<div class="unsupported">${escapeHtml(message)}</div>`;
}

function renderMainContent() {
  const container = document.getElementById('main-content');
  if (!container) return;

  container.innerHTML = `
    <div class="composer">
      <button class="parallel-toggle" id="parallel-toggle" type="button" aria-pressed="false">
        <span class="parallel-toggle-main">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="3" width="7" height="18" rx="1"></rect>
            <rect x="14" y="3" width="7" height="18" rx="1"></rect>
          </svg>
          <span id="parallel-toggle-label">并行模式已关闭</span>
        </span>
        <span class="toggle-indicator" aria-hidden="true"></span>
      </button>

      <textarea
        class="parallel-area-input"
        id="parallel-input"
        placeholder="输入问题，Enter 发送，Shift+Enter 换行..."
        rows="4"
        disabled
      ></textarea>

      <div class="parallel-area-actions">
        <span class="parallel-area-count" id="status">打开并行模式后可新建对话</span>
        <button class="parallel-area-send" id="parallel-send" type="button" disabled>新建对话</button>
      </div>
    </div>
  `;

  const toggle = document.getElementById('parallel-toggle');
  const input = document.getElementById('parallel-input');
  const send = document.getElementById('parallel-send');

  toggle?.addEventListener('click', handleToggleParallelMode);
  input?.addEventListener('input', updateComposerState);
  input?.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });
  send?.addEventListener('click', handleSend);
}

function playToggleAnimation(isOpening) {
  const toggle = document.getElementById('parallel-toggle');
  if (!toggle) return;

  const className = isOpening ? 'animating-on' : 'animating-off';
  toggle.classList.remove('animating-on', 'animating-off');
  void toggle.offsetWidth;
  toggle.classList.add(className);

  window.clearTimeout(playToggleAnimation.timer);
  playToggleAnimation.timer = window.setTimeout(() => {
    toggle.classList.remove(className);
  }, 380);
}

async function syncParallelState() {
  const response = await sendTabMessage({ action: 'getParallelState' });
  if (!response?.success) {
    setStatus(response?.error || '无法读取并行模式状态', 'error');
    return;
  }

  isParallelEnabled = !!response.enabled;
  updateComposerState();
}

async function handleToggleParallelMode() {
  const nextEnabled = !isParallelEnabled;
  const response = await sendTabMessage({ action: 'setParallelMode', enabled: nextEnabled });

  if (!response?.success) {
    setStatus(response?.error || '切换并行模式失败', 'error');
    return;
  }

  isParallelEnabled = !!response.enabled;
  playToggleAnimation(isParallelEnabled);
  updateComposerState();
  setStatus(isParallelEnabled ? '并行模式已打开' : '并行模式已关闭', '');
}

async function handleSend() {
  const input = document.getElementById('parallel-input');
  const question = input?.value.trim() || '';
  if (!isParallelEnabled || !question) return;

  const send = document.getElementById('parallel-send');
  if (send) send.disabled = true;
  setStatus('正在新建对话...', '');

  const response = await sendTabMessage({ action: 'openParallelComposer', question });
  if (!response?.success) {
    setStatus(response?.error || '发送失败，请重试', 'error');
    updateComposerState();
    return;
  }

  input.value = '';
  isParallelEnabled = !!response.enabled;
  updateComposerState();
  setStatus('已新建对话', 'success');
}

function updateComposerState() {
  const composer = document.querySelector('.composer');
  const toggle = document.getElementById('parallel-toggle');
  const label = document.getElementById('parallel-toggle-label');
  const input = document.getElementById('parallel-input');
  const send = document.getElementById('parallel-send');

  composer?.classList.toggle('parallel-enabled', isParallelEnabled);

  if (toggle) {
    toggle.classList.toggle('active', isParallelEnabled);
    toggle.setAttribute('aria-pressed', String(isParallelEnabled));
  }

  if (label) {
    label.textContent = isParallelEnabled ? '并行模式已开启' : '并行模式已关闭';
  }

  if (input) {
    input.disabled = !isParallelEnabled;
  }

  if (send) {
    send.disabled = !isParallelEnabled || !(input?.value.trim());
  }

  const statusEl = document.getElementById('status');
  if (!statusEl || statusEl.dataset.locked === 'true') return;

  statusEl.className = 'parallel-area-count';
  statusEl.textContent = isParallelEnabled
    ? '在当前页新增并排对话，Enter 发送'
    : '打开并行模式后可新建对话';
}

function setStatus(message, type) {
  const statusEl = document.getElementById('status');
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `parallel-area-count status${type ? ` ${type}` : ''}`;
  statusEl.dataset.locked = message ? 'true' : 'false';

  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusEl.dataset.locked = 'false';
    updateComposerState();
  }, type ? 2200 : 1400);
}

async function sendTabMessage(message) {
  if (!activeTabId) return null;

  try {
    return await chrome.tabs.sendMessage(activeTabId, message, { frameId: 0 });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
