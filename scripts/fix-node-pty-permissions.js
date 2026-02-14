const fs = require('fs');
const path = require('path');

function setExecutableIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  fs.chmodSync(filePath, 0o755);
  return true;
}

function main() {
  if (process.platform === 'win32') {
    console.log('[postinstall] skip node-pty chmod on Windows');
    return;
  }

  const root = process.cwd();
  const candidates = [
    path.join(root, 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper'),
    path.join(root, 'node_modules', 'node-pty', 'prebuilds', 'darwin-x64', 'spawn-helper'),
    path.join(root, 'node_modules', 'node-pty', 'prebuilds', 'linux-arm64', 'spawn-helper'),
    path.join(root, 'node_modules', 'node-pty', 'prebuilds', 'linux-x64', 'spawn-helper')
  ];

  let changed = 0;
  for (const file of candidates) {
    try {
      if (setExecutableIfExists(file)) {
        changed += 1;
        console.log(`[postinstall] chmod +x ${file}`);
      }
    } catch (err) {
      console.warn(`[postinstall] failed chmod ${file}: ${String(err)}`);
    }
  }

  if (changed === 0) {
    console.log('[postinstall] no spawn-helper found to chmod');
  } else {
    console.log(`[postinstall] done, updated ${changed} helper file(s)`);
  }
}

main();
