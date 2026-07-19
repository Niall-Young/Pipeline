'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const extensionFiles = require('./extension-files');

const extensionRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(extensionRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8')
);

const errors = [];
const expectedPermissions = ['activeTab', 'declarativeNetRequest'];

if (manifest.manifest_version !== 3) {
  errors.push('manifest_version 必须为 3');
}

if (manifest.version !== packageJson.version) {
  errors.push('manifest.json 与 package.json 的版本号不一致');
}

if (JSON.stringify(manifest.permissions) !== JSON.stringify(expectedPermissions)) {
  errors.push(`权限必须严格为：${expectedPermissions.join(', ')}`);
}

if (manifest.web_accessible_resources) {
  errors.push('当前功能不需要 web_accessible_resources，不应扩大网页访问范围');
}

for (const relativePath of extensionFiles) {
  if (!fs.existsSync(path.join(extensionRoot, relativePath))) {
    errors.push(`缺少发布文件：${relativePath}`);
  }
}

for (const script of ['background.js', 'content.js']) {
  const result = spawnSync(process.execPath, ['--check', path.join(extensionRoot, script)], {
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    errors.push(`${script} 语法检查失败：${result.stderr.trim()}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Pipeline ${manifest.version} 发布校验通过（${extensionFiles.length} 个运行文件）`);
