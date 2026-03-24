// AI Chat Anchor - Background Script

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[AI Chat Anchor] 插件已安装', details.reason);
  chrome.storage.sync.set({ enabled: true });
});

// 标签页加载完成后更新图标
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const supported = [
      'claude.ai', 'chatgpt.com', 'gemini.google.com', 'doubao.com', 'qianwen.com'
    ].some(p => tab.url.includes(p));

    if (supported) {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  }
});

// 消息监听
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'parallelSend') {
    handleParallelSend(message.questions, message.baseUrl)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'openParallelWindow') {
    const windowId = sender.tab.windowId;
    const tabId = sender.tab.id;
    handleOpenParallelWindow(message, windowId, tabId)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ─── 并行发送 ──────────────────────────────────────────────

async function handleParallelSend(questions, baseUrl) {
  // 1. 获取当前窗口，在其中创建所有新标签页
  const currentWindow = await chrome.windows.getCurrent();

  const tabPromises = questions.map(() =>
    chrome.tabs.create({ url: baseUrl, windowId: currentWindow.id, active: false })
  );
  const tabs = await Promise.all(tabPromises);
  const tabIds = tabs.map(t => t.id);

  // 2. 创建 Tab Group，标注为新建对话
  try {
    const groupId = await chrome.tabs.group({ tabIds, windowId: currentWindow.id });
    await chrome.tabGroups.update(groupId, { title: '新建对话', color: 'blue' });
  } catch (e) {
    // tabGroups API 不可用时静默跳过
    console.warn('[AI Chat Anchor] tabGroups 不可用:', e.message);
  }

  // 3. 激活第一个标签页
  await chrome.tabs.update(tabIds[0], { active: true });

  // 4. 等待每个标签页加载完成后注入问题
  const injectPromises = tabs.map((tab, i) =>
    waitForTabReady(tab.id).then(() => injectQuestionToTab(tab.id, questions[i]))
  );

  await Promise.allSettled(injectPromises);

  return { success: true };
}

// 等待标签页加载完成（onUpdated status=complete）
function waitForTabReady(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Tab ${tabId} 加载超时`));
    }, timeout);

    function listener(id, changeInfo) {
      if (id === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

// 注入问题到标签页（等待页面 JS 渲染完成后再发消息）
async function injectQuestionToTab(tabId, question) {
  // AI 页面 JS 渲染需要额外时间，等待 2s 后发送消息
  await delay(2000);

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: 'injectQuestion', question },
      response => {
        if (chrome.runtime.lastError) {
          console.warn(`[AI Chat Anchor] Tab ${tabId} 注入失败:`, chrome.runtime.lastError.message);
        }
        resolve(response);
      }
    );
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── 分屏并行窗口 ──────────────────────────────────────────

// 每个"源窗口"的分屏会话记录
// originWindowId -> { originalBounds, parallelWindowIds: [] }
const parallelSessions = new Map();

const NEW_CHAT_URLS = {
  'claude.ai':         'https://claude.ai/new',
  'chatgpt.com':       'https://chatgpt.com/',
  'gemini.google.com': 'https://gemini.google.com/',
  'doubao.com':        'https://www.doubao.com/chat/',
  'qianwen.com':       'https://qianwen.com/',
};

function getPlatformUrl(tabUrl) {
  for (const [domain, url] of Object.entries(NEW_CHAT_URLS)) {
    if (tabUrl.includes(domain)) return url;
  }
  return null;
}

async function handleOpenParallelWindow(message, originWindowId, originTabId) {
  const { question, screenAvailWidth, screenAvailHeight, screenAvailLeft, screenAvailTop } = message;

  // 获取原始 tab URL 以确定平台
  const originTab = await chrome.tabs.get(originTabId);
  const platformUrl = getPlatformUrl(originTab.url);
  if (!platformUrl) throw new Error('不支持的平台');

  // 获取当前窗口信息
  const originWin = await chrome.windows.get(originWindowId);

  // 初始化或读取本次分屏会话
  if (!parallelSessions.has(originWindowId)) {
    parallelSessions.set(originWindowId, {
      originalBounds: {
        left:   originWin.left,
        top:    originWin.top,
        width:  originWin.width,
        height: originWin.height,
      },
      parallelWindowIds: [],
    });
  }

  const session = parallelSessions.get(originWindowId);
  const { originalBounds, parallelWindowIds } = session;

  // 清理已关闭的并行窗口
  const openParallelIds = [];
  for (const wid of parallelWindowIds) {
    try { await chrome.windows.get(wid); openParallelIds.push(wid); } catch (_) {}
  }
  session.parallelWindowIds = openParallelIds;

  // 新的总窗口数 = 原窗口 + 已有并行窗口 + 这次新开的 1 个
  const totalPanes = 1 + openParallelIds.length + 1;

  // 始终用全屏可用区域平铺，保证铺满屏幕
  const paneWidth  = Math.floor(screenAvailWidth / totalPanes);
  const paneHeight = screenAvailHeight;
  const baseLeft   = screenAvailLeft;
  const baseTop    = screenAvailTop;

  // 调整原始窗口到第一格
  await chrome.windows.update(originWindowId, {
    left:   baseLeft,
    top:    baseTop,
    width:  paneWidth,
    height: paneHeight,
  });

  // 调整已有并行窗口，重新等分
  for (let i = 0; i < openParallelIds.length; i++) {
    await chrome.windows.update(openParallelIds[i], {
      left:   baseLeft + paneWidth * (i + 1),
      top:    baseTop,
      width:  paneWidth,
      height: paneHeight,
    });
  }

  // 创建新分屏窗口（最后一格）
  const newLeft = baseLeft + paneWidth * (openParallelIds.length + 1);
  const newWin = await chrome.windows.create({
    url:     platformUrl,
    left:    newLeft,
    top:     baseTop,
    width:   paneWidth,
    height:  paneHeight,
    focused: false,
  });

  session.parallelWindowIds.push(newWin.id);

  // 等待新窗口的标签页加载完成后注入问题
  const newTab = newWin.tabs[0];
  await waitForTabReady(newTab.id);
  await injectQuestionToTab(newTab.id, question);

  // 聚焦回原窗口
  await chrome.windows.update(originWindowId, { focused: true });

  return { success: true };
}

// 监听窗口关闭，清理会话
chrome.windows.onRemoved.addListener((windowId) => {
  // 如果关闭的是源窗口，删除整个会话
  parallelSessions.delete(windowId);
  // 如果关闭的是某个并行窗口，从对应会话中移除
  for (const [originId, session] of parallelSessions.entries()) {
    const idx = session.parallelWindowIds.indexOf(windowId);
    if (idx !== -1) {
      session.parallelWindowIds.splice(idx, 1);
    }
  }
});
