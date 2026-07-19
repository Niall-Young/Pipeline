'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const extensionFiles = require('./extension-files');

const extensionRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(extensionRoot, '..');

const validation = spawnSync(process.execPath, [path.join(__dirname, 'validate-extension.js')], {
  encoding: 'utf8',
  stdio: 'inherit'
});
if (validation.status !== 0) process.exit(validation.status || 1);

const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8')
);
const outputDirectory = path.join(repositoryRoot, 'dist');
const archivePath = path.join(outputDirectory, `pipeline-${manifest.version}.zip`);
const stagingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-extension-'));

try {
  for (const relativePath of extensionFiles) {
    const source = path.join(extensionRoot, relativePath);
    const destination = path.join(stagingDirectory, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.rmSync(archivePath, { force: true });

  const zip = spawnSync('zip', ['-X', '-q', '-r', archivePath, ...extensionFiles], {
    cwd: stagingDirectory,
    encoding: 'utf8'
  });
  if (zip.status !== 0) {
    throw new Error(zip.stderr.trim() || 'zip 命令执行失败');
  }

  const sizeInKb = Math.ceil(fs.statSync(archivePath).size / 1024);
  console.log(`已生成 ${archivePath}（${sizeInKb} KB）`);
} finally {
  fs.rmSync(stagingDirectory, { recursive: true, force: true });
}
