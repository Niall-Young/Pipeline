// AI Chat Anchor - Parallel Page Script

const PLATFORMS = {
  claude:  { name: 'Claude',   url: 'https://claude.ai/new' },
  chatgpt: { name: 'ChatGPT',  url: 'https://chatgpt.com/' },
  gemini:  { name: 'Gemini',   url: 'https://gemini.google.com/' },
  doubao:  { name: '豆包',      url: 'https://www.doubao.com/chat/' },
  qianwen: { name: '千问',      url: 'https://qianwen.com/' },
};

// ── DOM refs ─────────────────────────────────────────────────
const platformSelect  = document.getElementById('platform-select');
const questionInput   = document.getElementById('question-input');
const sendBtn         = document.getElementById('send-btn');
const panesContainer  = document.getElementById('panes-container');
const emptyState      = document.getElementById('empty-state');
const paneCountEl     = document.getElementById('pane-count');

// ── State ────────────────────────────────────────────────────
let paneSeq = 0; // monotonically increasing pane ID

// ── Init from URL params ──────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const initialPlatform  = params.get('platform') || 'claude';
const initialQuestion  = params.get('q') || '';

if (PLATFORMS[initialPlatform]) {
  platformSelect.value = initialPlatform;
}

// ── Toolbar events ────────────────────────────────────────────
questionInput.addEventListener('input', () => {
  sendBtn.disabled = questionInput.value.trim().length === 0;
});

questionInput.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) sendBtn.click();
  }
});

sendBtn.addEventListener('click', () => {
  const question = questionInput.value.trim();
  if (!question) return;
  addPane(platformSelect.value, question);
  questionInput.value = '';
  sendBtn.disabled = true;
  questionInput.focus();
});

// ── Add a pane ────────────────────────────────────────────────
function addPane(platformKey, question) {
  const platform = PLATFORMS[platformKey];
  if (!platform) return;

  // Hide empty state
  emptyState.style.display = 'none';

  paneSeq++;
  const seq = paneSeq;

  // Build pane shell
  const pane = document.createElement('div');
  pane.className = 'pane';

  const shortQ = question.length > 40 ? question.substring(0, 40) + '…' : question;

  const header = document.createElement('div');
  header.className = 'pane-header';
  header.innerHTML = `
    <div class="pane-meta">
      <span class="pane-title">${escapeHtml(platform.name)} · 窗格 ${seq}</span>
      <span class="pane-question" title="${escapeAttr(question)}">${escapeHtml(shortQ)}</span>
    </div>
    <button class="pane-close" title="关闭窗格">×</button>
  `;

  const iframe = document.createElement('iframe');
  iframe.src = platform.url;
  iframe.title = `${platform.name} 窗格 ${seq}`;
  // allow clipboard so AI paste/copy works
  iframe.setAttribute('allow', 'clipboard-read; clipboard-write');

  // Close button
  header.querySelector('.pane-close').addEventListener('click', () => {
    pane.remove();
    updatePaneCount();
    if (panesContainer.querySelectorAll('.pane').length === 0) {
      emptyState.style.display = '';
    }
  });

  // Inject question after iframe content loads
  iframe.addEventListener('load', () => {
    // Give the page's JS time to render its input (React/Vue SPA hydration)
    setTimeout(() => {
      try {
        iframe.contentWindow.postMessage(
          { type: 'AI_ANCHOR_INJECT', question },
          '*'
        );
      } catch (e) {
        console.warn(`[AI Parallel] 窗格 ${seq} postMessage 失败:`, e);
      }
    }, 1800);
  });

  pane.appendChild(header);
  pane.appendChild(iframe);
  panesContainer.appendChild(pane);

  updatePaneCount();
}

function updatePaneCount() {
  const n = panesContainer.querySelectorAll('.pane').length;
  paneCountEl.textContent = n > 0 ? `${n} 个窗格` : '';
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Auto-launch first pane from URL param ─────────────────────
if (initialQuestion) {
  setTimeout(() => {
    questionInput.value = initialQuestion;
    sendBtn.disabled = false;
    sendBtn.click();
  }, 100);
}
