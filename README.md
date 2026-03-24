# Pipeline

一个 Chrome 浏览器插件，用于在主流 AI 聊天页面中显示对话目录，并支持并行提问。

## 功能

- 在页面右侧生成对话目录锚点
- 自动提取当前会话中的问答项
- 点击目录项后平滑跳转到对应位置
- 支持在页面内开启并行模式，快速新建并排对话
- 提供扩展弹窗入口，和页面内并行模式状态保持一致
- 自动监听页面变化，新增消息后刷新目录

## 支持平台

- Claude
- ChatGPT
- Gemini
- 豆包
- 千问

## 项目结构

```text
ai-chat-anchor/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── parallel.html
├── parallel.js
├── styles.css
├── rules.json
└── icons/
```

## 本地安装

1. 打开 Chrome，进入 `chrome://extensions/`
2. 打开右上角“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择项目里的 [ai-chat-anchor](/Users/niallyoung/Desktop/pipeline/ai-chat-anchor) 目录

## 开发说明

- 扩展基于 Manifest V3
- 主要逻辑位于 [content.js](/Users/niallyoung/Desktop/pipeline/ai-chat-anchor/content.js)
- 弹窗逻辑位于 [popup.js](/Users/niallyoung/Desktop/pipeline/ai-chat-anchor/popup.js)
- 页面样式位于 [styles.css](/Users/niallyoung/Desktop/pipeline/ai-chat-anchor/styles.css)

如果你修改了扩展代码，回到扩展管理页点击“刷新”即可重新加载。

## 当前版本

- 扩展名称：`Pipeline`
- Manifest 版本：`v3`
- 当前扩展版本：`1.4.0`

## License

本项目采用 [PolyForm Noncommercial 1.0.0](/Users/niallyoung/Desktop/pipeline/LICENSE) 许可。

你可以出于非商业目的使用、学习、修改和分发本项目；如需商用，请先取得作者授权。

说明：这类“禁止商用”许可通常不属于 OSI 定义下的开源许可证，但很适合“源码公开、个人和非商业可用、商业使用需单独授权”的场景。
