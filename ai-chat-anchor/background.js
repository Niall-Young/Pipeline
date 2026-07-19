// Pipeline - Background Script

const SUPPORTED_DOMAINS = [
  'claude.ai',
  'chatgpt.com',
  'gemini.google.com',
  'doubao.com',
  'qianwen.com'
];

function isSupportedUrl(url = '') {
  try {
    const { hostname } = new URL(url);
    return SUPPORTED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Pipeline] 插件已安装', details.reason);
});

// 点击浏览器工具栏图标，直接开启当前页面的并行工作区。
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  if (!isSupportedUrl(tab.url || '')) {
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: '请在支持的 AI 聊天页面中开启 Pipeline'
    });
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(
      tab.id,
      { action: 'openParallelComposer', question: '' },
      { frameId: 0 }
    );

    if (!response?.success) {
      throw new Error(response?.error || '无法开启并行模式');
    }

    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'Pipeline 并行模式' });
  } catch (error) {
    console.warn('[Pipeline] 开启并行模式失败:', error.message);
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: '页面尚未就绪，请刷新页面后重试'
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !isSupportedUrl(tab.url || '')) return;
  chrome.action.setBadgeText({ tabId, text: '' });
  chrome.action.setTitle({ tabId, title: '开启 Pipeline 并行模式' });
});
