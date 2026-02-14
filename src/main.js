/**
 * Smart-Term Electron版本
 * 主进程 - 本地PTY + SSH会话管理
 */

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = fs.promises;
const { execSync } = require('child_process');
const crypto = require('crypto');
const pty = require('node-pty');
const { Client } = require('ssh2');
let keytar = null;
try {
  keytar = require('keytar');
} catch (_err) {
  keytar = null;
}

let mainWindow;
let localPty = null;
let activeMode = 'local';
let currentSize = { cols: 80, rows: 24 };
let sshSession = null;
let sshLastConnectConfig = null;
let sshReconnectTimer = null;
let sshReconnectAttempt = 0;
let sshReconnectInProgress = false;
let sshManualDisconnect = false;
let sshReconnectStartedAt = null;
const sftpPanels = new Map();
let lastCpuTimes = null;
let currentInputBuffer = '';
const SSH_SECRET_SERVICE = 'smart-term.ssh';

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  const defaults = {
    fontFamily: 'Monaco, Menlo, "Courier New", monospace',
    fontSize: 14,
    theme: 'dark',
    defaultShell: '',
    sshAutoReconnect: true,
    sshReconnectMaxAttempts: 6,
    sshReconnectBaseDelayMs: 1500,
    sshKeepaliveIntervalMs: 15000,
    sshKeepaliveCountMax: 3
  };
  try {
    const p = getSettingsPath();
    if (!fs.existsSync(p)) return defaults;
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return { ...defaults, ...(parsed || {}) };
  } catch (_err) {
    return defaults;
  }
}

function writeSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8');
}

function getHistoryPath() {
  return path.join(app.getPath('userData'), 'command-history.json');
}

function readHistory() {
  try {
    const p = getHistoryPath();
    if (!fs.existsSync(p)) return [];
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function writeHistory(items) {
  fs.writeFileSync(getHistoryPath(), JSON.stringify(items, null, 2), 'utf8');
}

function getAuditPath() {
  return path.join(app.getPath('userData'), 'audit-log.json');
}

function readAuditLogs() {
  try {
    const p = getAuditPath();
    if (!fs.existsSync(p)) return [];
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function writeAuditLogs(items) {
  fs.writeFileSync(getAuditPath(), JSON.stringify(items, null, 2), 'utf8');
}

function appendAuditLog(event, payload = {}, level = 'info') {
  const logs = readAuditLogs();
  logs.unshift({
    id: crypto.randomUUID(),
    event: String(event || 'unknown'),
    level: String(level || 'info'),
    payload: payload && typeof payload === 'object' ? payload : { value: String(payload || '') },
    createdAt: new Date().toISOString()
  });
  writeAuditLogs(logs.slice(0, 5000));
}

function addCommandHistory(command) {
  const cmd = String(command || '').trim();
  if (!cmd) return;
  const history = readHistory();
  const last = history[0];
  if (last && last.command === cmd) return;
  history.unshift({
    id: crypto.randomUUID(),
    command: cmd,
    mode: activeMode,
    target: activeMode === 'ssh' && sshSession ? `${sshSession.config.username}@${sshSession.config.host}:${sshSession.config.port}` : 'local',
    createdAt: new Date().toISOString()
  });
  writeHistory(history.slice(0, 2000));
}

function emitToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function getSSHConfigPath() {
  return path.join(app.getPath('userData'), 'ssh-configs.json');
}

function getKnownHostsPath() {
  return path.join(app.getPath('userData'), 'ssh-known-hosts.json');
}

function readKnownHosts() {
  try {
    const p = getKnownHostsPath();
    if (!fs.existsSync(p)) return {};
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (_err) {
    return {};
  }
}

function writeKnownHosts(items) {
  fs.writeFileSync(getKnownHostsPath(), JSON.stringify(items, null, 2), 'utf8');
}

function hostTrustKey(host, port) {
  return `${String(host || '').trim().toLowerCase()}:${Number(port) || 22}`;
}

function getHostFingerprint(rawHostKey) {
  const buf = Buffer.isBuffer(rawHostKey) ? rawHostKey : Buffer.from(rawHostKey || '');
  const digest = crypto.createHash('sha256').update(buf).digest('base64');
  return `SHA256:${digest}`;
}

async function saveSSHConfigSecret(configId, secret) {
  if (!keytar || !configId) return { ok: false, skipped: true };
  const payload = {};
  if (secret && typeof secret === 'object') {
    if (secret.password) payload.password = String(secret.password);
    if (secret.privateKey) payload.privateKey = String(secret.privateKey);
    if (secret.passphrase) payload.passphrase = String(secret.passphrase);
  }
  const hasAny = !!(payload.password || payload.privateKey || payload.passphrase);
  if (!hasAny) {
    await keytar.deletePassword(SSH_SECRET_SERVICE, String(configId));
    return { ok: true, cleared: true };
  }
  await keytar.setPassword(SSH_SECRET_SERVICE, String(configId), JSON.stringify(payload));
  return { ok: true };
}

async function readSSHConfigSecret(configId) {
  if (!keytar || !configId) return null;
  try {
    const raw = await keytar.getPassword(SSH_SECRET_SERVICE, String(configId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      password: parsed.password ? String(parsed.password) : '',
      privateKey: parsed.privateKey ? String(parsed.privateKey) : '',
      passphrase: parsed.passphrase ? String(parsed.passphrase) : ''
    };
  } catch (_err) {
    return null;
  }
}

function readSSHConfigs() {
  try {
    const configPath = getSSHConfigPath();
    if (!fs.existsSync(configPath)) {
      return [];
    }
    const content = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('读取SSH配置失败:', err);
    return [];
  }
}

function writeSSHConfigs(configs) {
  const configPath = getSSHConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(configs, null, 2), 'utf8');
}

function getSSHConfigById(id) {
  if (!id) return null;
  const list = readSSHConfigs();
  return list.find((item) => item.id === id) || null;
}

async function buildConnectConfigFromSaved(saved) {
  if (!saved) return null;
  const payload = {
    host: saved.host,
    port: Number(saved.port) || 22,
    username: saved.username,
    authType: saved.authType || 'password',
    keyPath: saved.keyPath || '',
    jumpConfigId: saved.jumpConfigId || ''
  };
  const secret = await readSSHConfigSecret(saved.id);
  if (payload.authType === 'key') {
    if (secret && secret.privateKey) payload.privateKey = secret.privateKey;
    if (secret && secret.passphrase) payload.passphrase = secret.passphrase;
  } else if (secret && secret.password) {
    payload.password = secret.password;
  }
  return payload;
}

function ensureLocalPty() {
  if (localPty) {
    return { ok: true, reused: true, mode: 'local' };
  }

  const settings = readSettings();
  const preferredShell = String(settings.defaultShell || '').trim();
  const shell = os.platform() === 'win32'
    ? 'powershell.exe'
    : preferredShell || process.env.SHELL || '/bin/zsh';
  try {
    localPty = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: currentSize.cols,
      rows: currentSize.rows,
      cwd: process.env.HOME || process.cwd(),
      env: process.env
    });

    localPty.onData((data) => {
      if (activeMode === 'local') {
        emitToRenderer('terminal:data', data);
      }
    });

    localPty.onExit(({ exitCode, signal }) => {
      if (activeMode === 'local') {
        emitToRenderer('terminal:exit', { exitCode, signal, source: 'local' });
      }
      localPty = null;
    });

    console.log(`✅ 本地PTY已创建: shell=${shell}, pid=${localPty.pid}`);
    return { ok: true, shell, pid: localPty.pid, mode: 'local' };
  } catch (error) {
    console.error('❌ 创建本地PTY失败:', error);
    localPty = null;
    return { ok: false, error: String(error) };
  }
}

function closeSSHSession(reason = 'manual') {
  if (!sshSession) return;
  const snapshot = { ...(sshSession.config || {}) };

  try {
    if (sshSession.stream) {
      sshSession.stream.end();
    }
  } catch (_err) {
    // noop
  }
  try {
    sshSession.client.end();
  } catch (_err) {
    // noop
  }
  try {
    if (sshSession.jumpClient) sshSession.jumpClient.end();
  } catch (_err) {
    // noop
  }

  sshSession = null;
  appendAuditLog('ssh.disconnect', {
    reason,
    host: snapshot.host || '',
    port: snapshot.port || 22,
    username: snapshot.username || '',
    jumpConfigId: snapshot.jumpConfigId || ''
  }, reason === 'manual' ? 'info' : 'warn');
  emitToRenderer('terminal:status', {
    level: 'info',
    message: reason === 'manual' ? 'SSH连接已断开' : `SSH连接已关闭: ${reason}`
  });
}

function clearReconnectTimer() {
  if (sshReconnectTimer) {
    clearTimeout(sshReconnectTimer);
    sshReconnectTimer = null;
  }
}

function emitReconnectState(payload) {
  emitToRenderer('terminal:reconnect-state', payload);
}

function shouldAutoReconnect() {
  const settings = readSettings();
  return !!settings.sshAutoReconnect;
}

function scheduleSSHReconnect(triggerReason = 'closed') {
  if (sshManualDisconnect || !sshLastConnectConfig || sshReconnectInProgress || !shouldAutoReconnect()) {
    return;
  }
  const settings = readSettings();
  const maxAttempts = Math.max(1, Number(settings.sshReconnectMaxAttempts || 6));
  if (sshReconnectAttempt >= maxAttempts) {
    const elapsedMs = sshReconnectStartedAt ? Date.now() - sshReconnectStartedAt : 0;
    sshReconnectStartedAt = null;
    emitReconnectState({
      active: false,
      failed: true,
      elapsedMs,
      maxAttempts
    });
    emitToRenderer('terminal:status', {
      level: 'error',
      message: `SSH自动重连失败，已达到最大重试次数(${maxAttempts})`
    });
    return;
  }
  const baseDelay = Math.max(500, Number(settings.sshReconnectBaseDelayMs || 1500));
  const delay = Math.min(15000, baseDelay * Math.pow(2, sshReconnectAttempt));
  const attemptNo = sshReconnectAttempt + 1;
  if (!sshReconnectStartedAt) {
    sshReconnectStartedAt = Date.now();
  }
  emitReconnectState({
    active: true,
    attempt: attemptNo,
    maxAttempts,
    nextRetryInMs: delay,
    reason: triggerReason
  });
  emitToRenderer('terminal:status', {
    level: 'info',
    message: `SSH连接中断(${triggerReason})，${Math.round(delay / 1000)}s后自动重连(${attemptNo}/${maxAttempts})`
  });

  clearReconnectTimer();
  sshReconnectTimer = setTimeout(async () => {
    sshReconnectTimer = null;
    sshReconnectInProgress = true;
    sshReconnectAttempt += 1;
    try {
      const result = await connectSSH(sshLastConnectConfig, { reconnecting: true, skipClose: true });
      if (result && result.ok) {
        sshReconnectAttempt = 0;
        const elapsedMs = sshReconnectStartedAt ? Date.now() - sshReconnectStartedAt : 0;
        sshReconnectStartedAt = null;
        emitReconnectState({
          active: false,
          success: true,
          elapsedMs
        });
        emitToRenderer('terminal:status', { level: 'success', message: 'SSH已自动重连' });
      } else {
        scheduleSSHReconnect('reconnect-failed');
      }
    } catch (_err) {
      scheduleSSHReconnect('reconnect-error');
    } finally {
      sshReconnectInProgress = false;
    }
  }, delay);
}

function createHostVerifierContext(config, port, trustStore) {
  const trustKey = hostTrustKey(config.host, port);
  const knownEntry = trustStore[trustKey] || null;
  let decision = null;
  return {
    hostVerifier: (hostKey) => {
      const fingerprint = getHostFingerprint(hostKey);
      if (knownEntry && knownEntry.fingerprint) {
        const matched = knownEntry.fingerprint === fingerprint;
        if (!matched) {
          decision = {
            reason: 'mismatch',
            fingerprint,
            expectedFingerprint: knownEntry.fingerprint,
            host: config.host,
            port
          };
        }
        return matched;
      }
      if (config.trustNewHost === true) {
        decision = { reason: 'accepted-new', fingerprint, host: config.host, port };
        return true;
      }
      decision = { reason: 'unknown-host', fingerprint, host: config.host, port };
      return false;
    },
    getDecision: () => decision,
    commitTrust: () => {
      if (decision && decision.reason === 'accepted-new') {
        trustStore[trustKey] = {
          host: config.host,
          port,
          fingerprint: decision.fingerprint,
          addedAt: new Date().toISOString()
        };
        writeKnownHosts(trustStore);
      }
    }
  };
}

function buildTrustFailureResponse(decision) {
  if (!decision) return null;
  if (decision.reason === 'unknown-host') {
    return {
      ok: false,
      needsHostTrust: true,
      host: decision.host,
      port: decision.port,
      fingerprint: decision.fingerprint,
      error: '主机指纹未信任'
    };
  }
  if (decision.reason === 'mismatch') {
    return {
      ok: false,
      hostKeyMismatch: true,
      host: decision.host,
      port: decision.port,
      fingerprint: decision.fingerprint,
      expectedFingerprint: decision.expectedFingerprint,
      error: '主机指纹与历史记录不一致'
    };
  }
  return null;
}

function applySshAuthToConnectOptions(connectOptions, config) {
  if (config.privateKey) {
    connectOptions.privateKey = config.privateKey;
    if (config.passphrase) {
      connectOptions.passphrase = config.passphrase;
    }
    return;
  }
  const keyPath = String(config.privateKeyPath || config.keyPath || '').trim();
  if (keyPath) {
    connectOptions.privateKey = fs.readFileSync(expandHomePath(keyPath), 'utf8');
    if (config.passphrase) {
      connectOptions.passphrase = config.passphrase;
    }
    return;
  }
  connectOptions.password = config.password || '';
}

function connectSSH(config, opts = {}) {
  return new Promise((resolve) => {
    if (!config || !config.host || !config.username) {
      resolve({ ok: false, error: 'host 和 username 为必填项' });
      return;
    }

    if (!opts.skipClose) {
      sshManualDisconnect = true;
      clearReconnectTimer();
      sshReconnectStartedAt = null;
      emitReconnectState({ active: false, reason: 'manual-stop' });
      closeSSHSession('replace');
    }
    appendAuditLog('ssh.connect.attempt', {
      host: config.host,
      port: Number(config.port) || 22,
      username: config.username,
      jumpConfigId: config.jumpConfigId || '',
      reconnecting: !!opts.reconnecting
    }, 'info');

    const client = new Client();
    let jumpClient = null;
    let resolved = false;
    const port = Number(config.port) || 22;
    const settings = readSettings();
    const trustStore = readKnownHosts();
    const targetTrust = createHostVerifierContext(config, port, trustStore);
    const connectOptions = {
      host: config.host,
      port,
      username: config.username,
      readyTimeout: 15000,
      keepaliveInterval: Math.max(3000, Number(settings.sshKeepaliveIntervalMs || 15000)),
      keepaliveCountMax: Math.max(1, Number(settings.sshKeepaliveCountMax || 3)),
      hostVerifier: targetTrust.hostVerifier
    };
    try {
      applySshAuthToConnectOptions(connectOptions, config);
    } catch (err) {
      resolve({ ok: false, error: `读取私钥失败: ${String(err.message || err)}` });
      return;
    }

    const failWith = (payload) => {
      if (resolved) return;
      if (payload && payload.ok === false) {
        appendAuditLog('ssh.connect.failed', {
          host: config.host,
          port,
          username: config.username,
          jumpConfigId: config.jumpConfigId || '',
          error: payload.error || 'unknown'
        }, 'error');
      }
      resolved = true;
      resolve(payload);
    };

    const beginTargetShell = () => {
      targetTrust.commitTrust();
      client.shell(
        {
          term: 'xterm-256color',
          cols: currentSize.cols,
          rows: currentSize.rows
        },
        (err, stream) => {
          if (err) {
            if (!resolved) {
              resolved = true;
              resolve({ ok: false, error: `创建SSH shell失败: ${String(err)}` });
            }
            client.end();
            return;
          }

          sshSession = {
            client,
            jumpClient,
            stream,
            config: { host: config.host, port, username: config.username, jumpConfigId: config.jumpConfigId || '' }
          };
          sshLastConnectConfig = { ...config };
          sshManualDisconnect = false;
          sshReconnectAttempt = 0;
          clearReconnectTimer();
          if (opts.reconnecting) {
            const elapsedMs = sshReconnectStartedAt ? Date.now() - sshReconnectStartedAt : 0;
            sshReconnectStartedAt = null;
            emitReconnectState({
              active: false,
              success: true,
              elapsedMs
            });
          } else {
            emitReconnectState({ active: false });
          }
          activeMode = 'ssh';

          stream.on('data', (data) => {
            if (activeMode === 'ssh') {
              emitToRenderer('terminal:data', data.toString('utf8'));
            }
          });

          stream.on('close', () => {
            emitToRenderer('terminal:exit', { exitCode: 0, signal: null, source: 'ssh' });
            closeSSHSession('stream-close');
            activeMode = 'local';
            ensureLocalPty();
            emitToRenderer('terminal:status', { level: 'info', message: '已切回本地终端' });
            scheduleSSHReconnect('stream-close');
          });

          client.on('error', (error) => {
            emitToRenderer('terminal:status', { level: 'error', message: `SSH错误: ${String(error.message || error)}` });
            scheduleSSHReconnect('client-error');
          });

          if (!resolved) {
            resolved = true;
            emitToRenderer('terminal:status', {
              level: 'success',
              message: `SSH已连接 ${config.username}@${config.host}:${port}`
            });
            appendAuditLog('ssh.connect.success', {
              host: config.host,
              port,
              username: config.username,
              jumpConfigId: config.jumpConfigId || '',
              reconnecting: !!opts.reconnecting
            }, 'info');
            resolve({ ok: true, mode: 'ssh' });
          }
        }
      );
    };

    client.on('error', (error) => {
      const trustFailure = buildTrustFailureResponse(targetTrust.getDecision());
      if (trustFailure) {
        failWith(trustFailure);
        return;
      }
      if (!resolved) {
        failWith({ ok: false, error: `SSH连接失败: ${String(error.message || error)}` });
      }
      scheduleSSHReconnect('connect-error');
    });

    client.on('close', () => {
      if (!resolved) failWith({ ok: false, error: 'SSH连接已关闭' });
      scheduleSSHReconnect('connect-close');
    });

    const startTargetConnect = (sock) => {
      try {
        if (sock) {
          client.connect({ ...connectOptions, sock });
        } else {
          client.connect(connectOptions);
        }
      } catch (error) {
        failWith({ ok: false, error: `SSH连接异常: ${String(error)}` });
      }
    };

    client.on('ready', beginTargetShell);

    if (!config.jumpConfigId) {
      startTargetConnect();
      return;
    }

    (async () => {
      const jumpSaved = getSSHConfigById(config.jumpConfigId);
      if (!jumpSaved) {
        failWith({ ok: false, error: '跳板机配置不存在，请重新选择' });
        return;
      }
      const jumpConfig = await buildConnectConfigFromSaved(jumpSaved);
      if (!jumpConfig || !jumpConfig.host || !jumpConfig.username) {
        failWith({ ok: false, error: '跳板机配置不完整' });
        return;
      }
      jumpConfig.trustNewHost = config.trustNewHost === true;

      const jumpPort = Number(jumpConfig.port) || 22;
      const jumpTrust = createHostVerifierContext(jumpConfig, jumpPort, trustStore);
      const jumpOptions = {
        host: jumpConfig.host,
        port: jumpPort,
        username: jumpConfig.username,
        readyTimeout: 15000,
        keepaliveInterval: Math.max(3000, Number(settings.sshKeepaliveIntervalMs || 15000)),
        keepaliveCountMax: Math.max(1, Number(settings.sshKeepaliveCountMax || 3)),
        hostVerifier: jumpTrust.hostVerifier
      };
      try {
        applySshAuthToConnectOptions(jumpOptions, jumpConfig);
      } catch (err) {
        failWith({ ok: false, error: `读取跳板机私钥失败: ${String(err.message || err)}` });
        return;
      }

      jumpClient = new Client();
      jumpClient.on('ready', () => {
        jumpTrust.commitTrust();
        jumpClient.forwardOut('127.0.0.1', 0, config.host, port, (err, stream) => {
          if (err) {
            failWith({ ok: false, error: `跳板机转发失败: ${String(err.message || err)}` });
            try {
              jumpClient.end();
            } catch (_err) {
              // noop
            }
            return;
          }
          startTargetConnect(stream);
        });
      });
      jumpClient.on('error', (err) => {
        const trustFailure = buildTrustFailureResponse(jumpTrust.getDecision());
        if (trustFailure) {
          failWith(trustFailure);
          return;
        }
        failWith({ ok: false, error: `跳板机连接失败: ${String(err.message || err)}` });
      });
      jumpClient.on('close', () => {
        if (!resolved) {
          failWith({ ok: false, error: '跳板机连接已关闭' });
        }
      });

      try {
        jumpClient.connect(jumpOptions);
      } catch (err) {
        failWith({ ok: false, error: `跳板机连接异常: ${String(err.message || err)}` });
      }
    })();
  });
}

function normalizeConfigName(name, fallback) {
  return String(name || fallback || '')
    .trim()
    .toLowerCase();
}

function getCpuUsageSnapshot() {
  const cpus = os.cpus() || [];
  const currentTimes = cpus.map((cpu) => ({ ...cpu.times }));
  if (!lastCpuTimes || lastCpuTimes.length !== currentTimes.length) {
    lastCpuTimes = currentTimes;
    return {
      model: cpus[0] ? cpus[0].model : 'Unknown',
      cores: cpus.length,
      load1: os.loadavg()[0] || 0,
      load5: os.loadavg()[1] || 0,
      overallPercent: 0,
      perCore: currentTimes.map((_t, idx) => ({ index: idx, usagePercent: 0 }))
    };
  }

  const perCore = currentTimes.map((times, idx) => {
    const prev = lastCpuTimes[idx];
    const idleDelta = Math.max(0, (times.idle || 0) - (prev.idle || 0));
    const totalDelta =
      Math.max(0, (times.user || 0) - (prev.user || 0)) +
      Math.max(0, (times.nice || 0) - (prev.nice || 0)) +
      Math.max(0, (times.sys || 0) - (prev.sys || 0)) +
      Math.max(0, (times.irq || 0) - (prev.irq || 0)) +
      idleDelta;
    const usagePercent = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
    return { index: idx, usagePercent: Math.max(0, Math.min(100, usagePercent)) };
  });

  lastCpuTimes = currentTimes;
  const overallPercent = perCore.length
    ? perCore.reduce((sum, c) => sum + c.usagePercent, 0) / perCore.length
    : 0;

  return {
    model: cpus[0] ? cpus[0].model : 'Unknown',
    cores: cpus.length,
    load1: os.loadavg()[0] || 0,
    load5: os.loadavg()[1] || 0,
    overallPercent,
    perCore
  };
}

function getSystemInfo() {
  const cpuInfo = getCpuUsageSnapshot();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);
  let disk = { mount: '/', usedPercent: 0, total: 0, used: 0, available: 0 };

  try {
    const out = execSync('df -k /', { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    if (lines.length >= 2) {
      const cols = lines[1].trim().split(/\s+/);
      if (cols.length >= 6) {
        const total = Number(cols[1]) * 1024;
        const used = Number(cols[2]) * 1024;
        const avail = Number(cols[3]) * 1024;
        const usedPercent = Number(String(cols[4]).replace('%', '')) || 0;
        disk = {
          mount: cols[5] || '/',
          usedPercent,
          total,
          used,
          available: avail
        };
      }
    }
  } catch (_err) {
    // noop
  }

  return {
    cpu: cpuInfo,
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      usedPercent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0
    },
    disk,
    os: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
      uptimeSec: os.uptime()
    }
  };
}

function expandHomePath(inputPath) {
  const raw = String(inputPath || '').trim();
  if (!raw) return raw;
  if (raw.startsWith('~/')) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return raw;
}

function getSftpPanel(panelId) {
  const panel = sftpPanels.get(panelId);
  if (!panel) {
    throw new Error(`面板未连接: ${panelId}`);
  }
  return panel;
}

function isLocalPanel(panel) {
  return !!panel && panel.type === 'local';
}

function panelJoin(panel, basePath, leaf) {
  return isLocalPanel(panel)
    ? path.join(basePath, leaf)
    : path.posix.join(basePath, leaf);
}

function panelBasename(panel, filePath) {
  return isLocalPanel(panel)
    ? path.basename(filePath)
    : path.posix.basename(filePath);
}

function panelDirname(panel, filePath) {
  return isLocalPanel(panel)
    ? path.dirname(filePath)
    : path.posix.dirname(filePath);
}

function panelExtname(panel, filePath) {
  return isLocalPanel(panel)
    ? path.extname(filePath)
    : path.posix.extname(filePath);
}

function normalizePanelPath(panel, inputPath) {
  const current = panel.cwd || (isLocalPanel(panel) ? os.homedir() : '/');
  const raw = String(inputPath || '').trim();
  if (isLocalPanel(panel)) {
    if (!raw) return path.normalize(current);
    if (path.isAbsolute(raw)) return path.normalize(raw);
    return path.normalize(path.resolve(current, raw));
  }
  if (!raw) return path.posix.normalize(current || '/');
  if (raw.startsWith('/')) return path.posix.normalize(raw);
  return path.posix.normalize(path.posix.join(current || '/', raw));
}

function sftpReaddirRaw(sftp, dirPath) {
  return new Promise((resolve, reject) => {
    sftp.readdir(dirPath, (err, list) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(list || []);
    });
  });
}

async function panelReaddir(panel, dirPath) {
  if (isLocalPanel(panel)) {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    const items = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      const st = await fsp.stat(fullPath);
      return {
        name: entry.name,
        longname: entry.name,
        isDirectory: entry.isDirectory(),
        size: Number(st.size || 0),
        mtime: Number(Math.floor((st.mtimeMs || 0) / 1000))
      };
    }));
    items.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return items;
  }

  const raw = await sftpReaddirRaw(panel.sftp, dirPath);
  const items = raw.map((entry) => ({
    name: entry.filename,
    longname: entry.longname,
    isDirectory: !!(entry.attrs && typeof entry.attrs.isDirectory === 'function' && entry.attrs.isDirectory()),
    size: Number(entry.attrs && entry.attrs.size ? entry.attrs.size : 0),
    mtime: Number(entry.attrs && entry.attrs.mtime ? entry.attrs.mtime : 0)
  }));
  items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return items;
}

function sftpStat(sftp, filePath) {
  return new Promise((resolve, reject) => {
    sftp.stat(filePath, (err, stats) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(stats);
    });
  });
}

async function panelStat(panel, filePath) {
  if (isLocalPanel(panel)) {
    return fsp.stat(filePath);
  }
  return sftpStat(panel.sftp, filePath);
}

async function panelPathInfo(panel, filePath) {
  try {
    const st = await panelStat(panel, filePath);
    return {
      exists: true,
      isDirectory: !!(st && typeof st.isDirectory === 'function' && st.isDirectory())
    };
  } catch (_err) {
    return { exists: false, isDirectory: false };
  }
}

async function resolveTransferConflictPath(panel, desiredPath, strategy = 'overwrite') {
  const normalized = ['overwrite', 'skip', 'rename'].includes(strategy) ? strategy : 'overwrite';
  const info = await panelPathInfo(panel, desiredPath);
  if (!info.exists) {
    return { action: 'write', path: desiredPath };
  }
  if (normalized === 'skip') {
    return { action: 'skip', path: desiredPath };
  }
  if (normalized === 'overwrite') {
    if (info.isDirectory) {
      throw new Error(`目标路径是目录，无法覆盖文件: ${desiredPath}`);
    }
    return { action: 'write', path: desiredPath };
  }
  const baseName = panelBasename(panel, desiredPath);
  const dirName = panelDirname(panel, desiredPath);
  const ext = panelExtname(panel, baseName);
  const stem = ext ? baseName.slice(0, -ext.length) : baseName;
  for (let i = 1; i <= 999; i += 1) {
    const candidateName = `${stem} (${i})${ext}`;
    const candidatePath = panelJoin(panel, dirName, candidateName);
    const candidateInfo = await panelPathInfo(panel, candidatePath);
    if (!candidateInfo.exists) {
      return { action: 'rename', path: candidatePath };
    }
  }
  throw new Error(`无法为文件生成可用重命名路径: ${desiredPath}`);
}

function sftpMkdir(sftp, dirPath) {
  return new Promise((resolve, reject) => {
    sftp.mkdir(dirPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function sftpRename(sftp, oldPath, newPath) {
  return new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function sftpUnlink(sftp, filePath) {
  return new Promise((resolve, reject) => {
    sftp.unlink(filePath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

function sftpRmdir(sftp, dirPath) {
  return new Promise((resolve, reject) => {
    sftp.rmdir(dirPath, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function panelEnsureDir(panel, dirPath) {
  if (isLocalPanel(panel)) {
    await fsp.mkdir(dirPath, { recursive: true });
    return;
  }

  if (!dirPath || dirPath === '/') return;
  const parts = dirPath.split('/').filter(Boolean);
  let cursor = '/';
  for (const part of parts) {
    cursor = path.posix.join(cursor, part);
    try {
      const st = await panelStat(panel, cursor);
      if (!(st && typeof st.isDirectory === 'function' && st.isDirectory())) {
        throw new Error(`路径不是目录: ${cursor}`);
      }
    } catch (_err) {
      await sftpMkdir(panel.sftp, cursor);
    }
  }
}

async function panelMkdir(panel, dirPath) {
  if (isLocalPanel(panel)) {
    await fsp.mkdir(dirPath, { recursive: true });
    return;
  }
  await panelEnsureDir(panel, dirPath);
}

async function panelRename(panel, oldPath, newPath) {
  if (isLocalPanel(panel)) {
    await fsp.rename(oldPath, newPath);
    return;
  }
  await sftpRename(panel.sftp, oldPath, newPath);
}

async function panelUnlink(panel, filePath) {
  if (isLocalPanel(panel)) {
    await fsp.unlink(filePath);
    return;
  }
  await sftpUnlink(panel.sftp, filePath);
}

async function panelRmdir(panel, dirPath) {
  if (isLocalPanel(panel)) {
    await fsp.rmdir(dirPath);
    return;
  }
  await sftpRmdir(panel.sftp, dirPath);
}

async function panelDeleteRecursive(panel, targetPath) {
  const st = await panelStat(panel, targetPath);
  if (st && typeof st.isDirectory === 'function' && st.isDirectory()) {
    const children = await panelReaddir(panel, targetPath);
    for (const child of children) {
      const childPath = panelJoin(panel, targetPath, child.name);
      await panelDeleteRecursive(panel, childPath);
    }
    await panelRmdir(panel, targetPath);
    return;
  }
  await panelUnlink(panel, targetPath);
}

function createPanelReadStream(panel, filePath) {
  return isLocalPanel(panel)
    ? fs.createReadStream(filePath)
    : panel.sftp.createReadStream(filePath);
}

function createPanelWriteStream(panel, filePath) {
  return isLocalPanel(panel)
    ? fs.createWriteStream(filePath)
    : panel.sftp.createWriteStream(filePath);
}

async function collectTransferEntries(panel, sourcePath) {
  const stats = await panelStat(panel, sourcePath);
  const rootName = panelBasename(panel, sourcePath);

  const result = {
    rootType: (stats && typeof stats.isDirectory === 'function' && stats.isDirectory()) ? 'directory' : 'file',
    rootName,
    files: [],
    dirs: []
  };

  async function walkDirectory(absPath, relDir) {
    result.dirs.push(relDir);
    const children = await panelReaddir(panel, absPath);
    for (const child of children) {
      const childAbs = panelJoin(panel, absPath, child.name);
      const childRel = relDir ? panelJoin({ type: 'remote' }, relDir, child.name) : child.name;
      if (child.isDirectory) {
        await walkDirectory(childAbs, childRel);
      } else {
        result.files.push({
          absPath: childAbs,
          relPath: childRel,
          size: Number(child.size || 0)
        });
      }
    }
  }

  if (result.rootType === 'directory') {
    await walkDirectory(sourcePath, rootName);
  } else {
    result.files.push({
      absPath: sourcePath,
      relPath: rootName,
      size: Number(stats.size || 0)
    });
  }

  return result;
}

function sftpConnectPanel(panelId, config) {
  return new Promise((resolve) => {
    if (!panelId) {
      resolve({ ok: false, error: 'panelId 不能为空' });
      return;
    }

    const oldPanel = sftpPanels.get(panelId);
    if (oldPanel) {
      try {
        if (oldPanel.sftp) oldPanel.sftp.end();
      } catch (_err) {
        // noop
      }
      try {
        if (oldPanel.client) oldPanel.client.end();
      } catch (_err) {
        // noop
      }
      sftpPanels.delete(panelId);
    }

    if (config && config.type === 'local') {
      const cwd = path.resolve(config.cwd || os.homedir());
      sftpPanels.set(panelId, {
        type: 'local',
        cwd,
        config: { type: 'local' }
      });
      resolve({ ok: true, cwd, type: 'local' });
      return;
    }
    if (!config || !config.host || !config.username) {
      resolve({ ok: false, error: 'host 和 username 为必填项' });
      return;
    }

    const client = new Client();
    const port = Number(config.port) || 22;
    const options = {
      host: config.host,
      port,
      username: config.username,
      readyTimeout: 15000
    };

    if (config.privateKey) {
      options.privateKey = config.privateKey;
    } else if (config.privateKeyPath) {
      try {
        options.privateKey = fs.readFileSync(expandHomePath(config.privateKeyPath), 'utf8');
      } catch (err) {
        resolve({ ok: false, error: `读取私钥失败: ${String(err.message || err)}` });
        return;
      }
    }

    if (options.privateKey) {
      if (config.passphrase) {
        options.passphrase = config.passphrase;
      }
    } else {
      options.password = config.password || '';
    }

    let resolved = false;

    client.on('ready', () => {
      client.sftp(async (err, sftp) => {
        if (err) {
          if (!resolved) {
            resolved = true;
            resolve({ ok: false, error: `SFTP初始化失败: ${String(err.message || err)}` });
          }
          client.end();
          return;
        }

        let cwd = '.';
        try {
          cwd = await new Promise((res, rej) => {
            sftp.realpath('.', (realPathErr, absPath) => {
              if (realPathErr) {
                rej(realPathErr);
                return;
              }
              res(absPath || '.');
            });
          });
        } catch (_err) {
          cwd = '.';
        }

        sftpPanels.set(panelId, {
          type: 'ssh',
          client,
          sftp,
          cwd,
          config: { host: config.host, port, username: config.username }
        });

        client.on('close', () => {
          const current = sftpPanels.get(panelId);
          if (current && current.client === client) {
            sftpPanels.delete(panelId);
          }
        });

        if (!resolved) {
          resolved = true;
          resolve({ ok: true, cwd });
        }
      });
    });

    client.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, error: `SFTP连接失败: ${String(err.message || err)}` });
      }
    });

    try {
      client.connect(options);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, error: `SFTP连接异常: ${String(err.message || err)}` });
      }
    }
  });
}

async function sftpList(panelId, dirPath) {
  const panel = getSftpPanel(panelId);
  const target = normalizePanelPath(panel, dirPath);
  const list = await panelReaddir(panel, target);
  panel.cwd = target;
  return { ok: true, cwd: target, items: list };
}

async function transferPathBetweenPanels(sourcePanel, targetPanel, sourcePath, targetDir, transferId, meta = {}, options = {}) {

  const src = String(sourcePath || '').trim();
  if (!src) {
    throw new Error('sourcePath 不能为空');
  }

  const sourceAbs = normalizePanelPath(sourcePanel, src);
  const targetBase = normalizePanelPath(targetPanel, targetDir || targetPanel.cwd || (isLocalPanel(targetPanel) ? os.homedir() : '/'));
  appendAuditLog('transfer.start', {
    transferId: transferId || '',
    sourcePath: sourceAbs,
    targetDir: targetBase,
    fromPanelId: meta.fromPanelId || '',
    toPanelId: meta.toPanelId || ''
  }, 'info');
  const transferSet = await collectTransferEntries(sourcePanel, sourceAbs);
  const totalBytes = transferSet.files.reduce((sum, f) => sum + Number(f.size || 0), 0);
  const rootDest = panelJoin(targetPanel, targetBase, transferSet.rootName);
  const conflictStrategy = ['overwrite', 'skip', 'rename'].includes(options.conflictStrategy)
    ? options.conflictStrategy
    : 'overwrite';
  const fileName = transferSet.rootName;
  let copiedBytes = 0;
  let skippedFiles = 0;

  const progressEvent = (sentBytes, status = 'running') => {
    emitToRenderer('sftp:transfer-progress', {
      transferId,
      fromPanelId: meta.fromPanelId || '',
      toPanelId: meta.toPanelId || '',
      fileName,
      sourcePath: sourceAbs,
      targetPath: rootDest,
      bytesTransferred: sentBytes,
      totalBytes,
      percent: totalBytes > 0 ? Math.min(100, Math.floor((sentBytes / totalBytes) * 100)) : 100,
      status
    });
  };

  progressEvent(0, 'running');

  if (transferSet.rootType === 'directory') {
    for (const dirRel of transferSet.dirs) {
      const dirDest = panelJoin(targetPanel, targetBase, dirRel);
      await panelEnsureDir(targetPanel, dirDest);
    }
  } else {
    await panelEnsureDir(targetPanel, targetBase);
  }

  for (const file of transferSet.files) {
    const desiredPath = panelJoin(targetPanel, targetBase, file.relPath);
    const resolvedDest = await resolveTransferConflictPath(targetPanel, desiredPath, conflictStrategy);
    if (resolvedDest.action === 'skip') {
      skippedFiles += 1;
      continue;
    }
    const destPath = resolvedDest.path;
    await panelEnsureDir(targetPanel, panelDirname(targetPanel, destPath));
    await new Promise((resolve, reject) => {
      const rs = createPanelReadStream(sourcePanel, file.absPath);
      const ws = createPanelWriteStream(targetPanel, destPath);
      let localBytes = 0;
      let lastEmitAt = 0;

      rs.on('data', (chunk) => {
        const chunkBytes = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
        localBytes += chunkBytes;
        copiedBytes += chunkBytes;
        const now = Date.now();
        if (now - lastEmitAt >= 120 || copiedBytes >= totalBytes) {
          progressEvent(copiedBytes, 'running');
          lastEmitAt = now;
        }
      });

      rs.on('error', (err) => {
        progressEvent(copiedBytes, 'error');
        reject(err);
      });
      ws.on('error', (err) => {
        progressEvent(copiedBytes, 'error');
        reject(err);
      });
      ws.on('close', resolve);
      rs.pipe(ws);
    });
  }

  progressEvent(totalBytes > 0 ? totalBytes : copiedBytes, 'done');
  appendAuditLog('transfer.success', {
    transferId: transferId || '',
    sourcePath: sourceAbs,
    targetPath: rootDest,
    bytes: totalBytes > 0 ? totalBytes : copiedBytes,
    skippedFiles,
    conflictStrategy,
    fromPanelId: meta.fromPanelId || '',
    toPanelId: meta.toPanelId || ''
  }, 'info');
  return { ok: true, targetPath: rootDest, skippedFiles, conflictStrategy };
}

async function sftpTransferBetweenPanels(fromPanelId, toPanelId, sourcePath, targetDir, transferId, options = {}) {
  const sourcePanel = getSftpPanel(fromPanelId);
  const targetPanel = getSftpPanel(toPanelId);
  return transferPathBetweenPanels(sourcePanel, targetPanel, sourcePath, targetDir, transferId, {
    fromPanelId,
    toPanelId
  }, options);
}

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: '🚀 Smart-Term - Electron Edition',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    backgroundColor: '#1e1e1e'
  });

  // 加载index.html
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // 将渲染进程控制台输出转发到主进程，便于定位黑屏问题
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error(`页面加载失败: code=${code}, desc=${desc}, url=${url}`);
  });

  // 需要调试时可取消下行注释
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  console.log('✅ Smart-Term主窗口已创建');
}

ipcMain.handle('pty:start', () => {
  // backward compatibility no-op
  return ensureLocalPty();
});

ipcMain.handle('terminal:start-local', () => {
  activeMode = 'local';
  const result = ensureLocalPty();
  if (result.ok) {
    emitToRenderer('terminal:status', { level: 'info', message: '已切换到本地终端' });
  }
  return result;
});

ipcMain.handle('terminal:connect-ssh', (_event, config) => {
  sshManualDisconnect = false;
  clearReconnectTimer();
  sshReconnectStartedAt = null;
  emitReconnectState({ active: false });
  return connectSSH(config);
});

ipcMain.handle('terminal:disconnect-ssh', () => {
  sshManualDisconnect = true;
  clearReconnectTimer();
  sshReconnectStartedAt = null;
  emitReconnectState({ active: false, reason: 'manual-disconnect' });
  closeSSHSession('manual');
  activeMode = 'local';
  const result = ensureLocalPty();
  return { ok: result.ok, mode: 'local' };
});

ipcMain.handle('terminal:get-state', () => {
  return { mode: activeMode, sshConnected: !!sshSession };
});

ipcMain.on('terminal:write', (_event, data) => {
  if (typeof data !== 'string') return;

  // Track user-entered command line for history persistence.
  for (const ch of data) {
    if (ch === '\r' || ch === '\n') {
      addCommandHistory(currentInputBuffer);
      currentInputBuffer = '';
      continue;
    }
    if (ch === '\x03' || ch === '\x15') {
      currentInputBuffer = '';
      continue;
    }
    if (ch === '\x7f' || ch === '\b') {
      currentInputBuffer = currentInputBuffer.slice(0, -1);
      continue;
    }
    if (ch >= ' ' && ch !== '\u007f') {
      currentInputBuffer += ch;
    }
  }

  if (activeMode === 'ssh' && sshSession && sshSession.stream) {
    sshSession.stream.write(data);
    return;
  }
  const started = ensureLocalPty();
  if (started.ok && localPty) {
    localPty.write(data);
  }
});

ipcMain.on('terminal:resize', (_event, payload) => {
  if (!payload) return;
  const cols = Number(payload.cols);
  const rows = Number(payload.rows);
  if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) {
    return;
  }
  currentSize = { cols, rows };

  if (localPty) {
    try {
      localPty.resize(cols, rows);
    } catch (_err) {
      // noop
    }
  }
  if (sshSession && sshSession.stream && typeof sshSession.stream.setWindow === 'function') {
    try {
      sshSession.stream.setWindow(rows, cols, 0, 0);
    } catch (_err) {
      // noop
    }
  }
});

ipcMain.handle('ssh-config:list', async () => {
  const list = readSSHConfigs();
  const enriched = await Promise.all(list.map(async (item) => {
    const secret = await readSSHConfigSecret(item.id);
    return { ...item, hasSecret: !!(secret && (secret.password || secret.privateKey || secret.passphrase)) };
  }));
  return enriched;
});

ipcMain.handle('ssh-config:save', async (_event, config) => {
  if (!config || !config.host || !config.username) {
    return { ok: false, error: 'host 和 username 不能为空' };
  }

  const configs = readSSHConfigs();
  const item = {
    id: config.id || crypto.randomUUID(),
    name: config.name || `${config.username}@${config.host}`,
    host: config.host,
    port: Number(config.port) || 22,
    username: config.username,
    authType: config.authType || 'password',
    keyPath: config.keyPath || '',
    jumpConfigId: config.jumpConfigId || ''
  };

  const normalized = normalizeConfigName(item.name, `${item.username}@${item.host}`);
  const existingIndex = configs.findIndex((c) => normalizeConfigName(c.name, `${c.username}@${c.host}`) === normalized);
  if (existingIndex >= 0) {
    item.id = configs[existingIndex].id;
    configs[existingIndex] = item;
  } else {
    configs.push(item);
  }
  writeSSHConfigs(configs);
  try {
    await saveSSHConfigSecret(item.id, config.secret || null);
  } catch (err) {
    return { ok: false, error: `保存凭据失败: ${String(err.message || err)}` };
  }
  return { ok: true, item };
});

ipcMain.handle('ssh-config:remove', async (_event, id) => {
  const configs = readSSHConfigs();
  const next = configs.filter((c) => c.id !== id);
  writeSSHConfigs(next);
  try {
    await saveSSHConfigSecret(id, null);
  } catch (_err) {
    // noop
  }
  return { ok: true };
});

ipcMain.handle('ssh-config:get-secret', async (_event, id) => {
  const secret = await readSSHConfigSecret(id);
  return {
    ok: true,
    secret: secret || { password: '', privateKey: '', passphrase: '' }
  };
});

ipcMain.handle('history:list', (_event, payload) => {
  const query = String(payload && payload.query ? payload.query : '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(500, Number(payload && payload.limit ? payload.limit : 150)));
  const list = readHistory();
  const filtered = query
    ? list.filter((item) => String(item.command || '').toLowerCase().includes(query))
    : list;
  return filtered.slice(0, limit);
});

ipcMain.handle('history:clear', () => {
  writeHistory([]);
  return { ok: true };
});

ipcMain.handle('audit:list', (_event, payload) => {
  const query = String(payload && payload.query ? payload.query : '').trim().toLowerCase();
  const limit = Math.max(1, Math.min(2000, Number(payload && payload.limit ? payload.limit : 300)));
  const logs = readAuditLogs();
  const filtered = query
    ? logs.filter((item) => {
        const main = `${item.event || ''} ${JSON.stringify(item.payload || {})} ${item.level || ''}`.toLowerCase();
        return main.includes(query);
      })
    : logs;
  return filtered.slice(0, limit);
});

ipcMain.handle('audit:clear', () => {
  writeAuditLogs([]);
  appendAuditLog('audit.cleared', { by: 'user' }, 'warn');
  return { ok: true };
});

ipcMain.handle('settings:get', () => {
  return readSettings();
});

ipcMain.handle('settings:save', (_event, patch) => {
  const current = readSettings();
  const next = { ...current, ...(patch || {}) };
  writeSettings(next);
  return { ok: true, settings: next };
});

ipcMain.handle('system:get-info', () => {
  return getSystemInfo();
});

ipcMain.handle('sftp:connect-panel', (_event, payload) => {
  return sftpConnectPanel(payload && payload.panelId, payload && payload.config);
});

ipcMain.handle('sftp:list', async (_event, payload) => {
  try {
    return await sftpList(payload && payload.panelId, payload && payload.path);
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('sftp:mkdir', async (_event, payload) => {
  try {
    const panel = getSftpPanel(payload && payload.panelId);
    const parentPath = normalizePanelPath(panel, payload && payload.parentPath ? payload.parentPath : panel.cwd);
    const dirName = String(payload && payload.dirName ? payload.dirName : '').trim();
    if (!dirName) return { ok: false, error: '目录名不能为空' };
    const targetPath = panelJoin(panel, parentPath, dirName);
    await panelMkdir(panel, targetPath);
    appendAuditLog('sftp.mkdir', { panelId: payload && payload.panelId, path: targetPath }, 'info');
    return { ok: true, path: targetPath };
  } catch (err) {
    appendAuditLog('sftp.mkdir.failed', {
      panelId: payload && payload.panelId,
      parentPath: payload && payload.parentPath ? payload.parentPath : '',
      dirName: payload && payload.dirName ? payload.dirName : '',
      error: String(err.message || err)
    }, 'error');
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('sftp:rename', async (_event, payload) => {
  try {
    const panel = getSftpPanel(payload && payload.panelId);
    const oldPath = normalizePanelPath(panel, payload && payload.oldPath ? payload.oldPath : '');
    const newName = String(payload && payload.newName ? payload.newName : '').trim();
    if (!newName) return { ok: false, error: '新名称不能为空' };
    const newPath = panelJoin(panel, panelDirname(panel, oldPath), newName);
    await panelRename(panel, oldPath, newPath);
    appendAuditLog('sftp.rename', { panelId: payload && payload.panelId, oldPath, newPath }, 'info');
    return { ok: true, oldPath, newPath };
  } catch (err) {
    appendAuditLog('sftp.rename.failed', {
      panelId: payload && payload.panelId,
      oldPath: payload && payload.oldPath ? payload.oldPath : '',
      newName: payload && payload.newName ? payload.newName : '',
      error: String(err.message || err)
    }, 'error');
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('sftp:delete', async (_event, payload) => {
  try {
    const panel = getSftpPanel(payload && payload.panelId);
    const targetPath = normalizePanelPath(panel, payload && payload.targetPath ? payload.targetPath : '');
    await panelDeleteRecursive(panel, targetPath);
    appendAuditLog('sftp.delete', { panelId: payload && payload.panelId, targetPath }, 'warn');
    return { ok: true };
  } catch (err) {
    appendAuditLog('sftp.delete.failed', {
      panelId: payload && payload.panelId,
      targetPath: payload && payload.targetPath ? payload.targetPath : '',
      error: String(err.message || err)
    }, 'error');
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('sftp:disconnect-panel', (_event, payload) => {
  const panelId = payload && payload.panelId;
  if (!panelId) return { ok: true };
  const panel = sftpPanels.get(panelId);
  if (panel) {
    try {
      if (panel.sftp) panel.sftp.end();
    } catch (_err) {
      // noop
    }
    try {
      if (panel.client) panel.client.end();
    } catch (_err) {
      // noop
    }
    sftpPanels.delete(panelId);
  }
  return { ok: true };
});

ipcMain.handle('sftp:transfer-r2r', async (_event, payload) => {
  try {
    return await sftpTransferBetweenPanels(
      payload && payload.fromPanelId,
      payload && payload.toPanelId,
      payload && payload.sourcePath,
      payload && payload.targetDir,
      payload && payload.transferId,
      { conflictStrategy: payload && payload.conflictStrategy ? payload.conflictStrategy : 'overwrite' }
    );
  } catch (err) {
    appendAuditLog('transfer.failed', {
      transferId: payload && payload.transferId ? payload.transferId : '',
      fromPanelId: payload && payload.fromPanelId ? payload.fromPanelId : '',
      toPanelId: payload && payload.toPanelId ? payload.toPanelId : '',
      sourcePath: payload && payload.sourcePath ? payload.sourcePath : '',
      targetDir: payload && payload.targetDir ? payload.targetDir : '',
      error: String(err.message || err)
    }, 'error');
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('dialog:pick-local-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections']
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:pick-local-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.canceled ? '' : (result.filePaths[0] || '');
});

ipcMain.handle('sftp:upload-local', async (_event, payload) => {
  try {
    const targetPanel = getSftpPanel(payload && payload.panelId);
    const targetDir = normalizePanelPath(targetPanel, payload && payload.targetDir ? payload.targetDir : targetPanel.cwd);
    const localPaths = Array.isArray(payload && payload.localPaths) ? payload.localPaths : [];
    if (!localPaths.length) return { ok: false, error: '未选择本地文件' };
    const localPanel = { type: 'local', cwd: os.homedir() };
    let lastPath = '';
    let skippedFiles = 0;
    for (const p of localPaths) {
      const r = await transferPathBetweenPanels(localPanel, targetPanel, p, targetDir, payload && payload.transferId, {
        fromPanelId: 'local',
        toPanelId: payload && payload.panelId ? payload.panelId : ''
      }, {
        conflictStrategy: payload && payload.conflictStrategy ? payload.conflictStrategy : 'overwrite'
      });
      lastPath = r.targetPath;
      skippedFiles += Number(r && r.skippedFiles ? r.skippedFiles : 0);
    }
    appendAuditLog('transfer.upload-local.success', {
      panelId: payload && payload.panelId ? payload.panelId : '',
      fileCount: localPaths.length,
      targetDir
    }, 'info');
    return { ok: true, targetPath: lastPath, skippedFiles };
  } catch (err) {
    appendAuditLog('transfer.upload-local.failed', {
      panelId: payload && payload.panelId ? payload.panelId : '',
      targetDir: payload && payload.targetDir ? payload.targetDir : '',
      error: String(err.message || err)
    }, 'error');
    return { ok: false, error: String(err.message || err) };
  }
});

ipcMain.handle('sftp:download-to-local', async (_event, payload) => {
  try {
    const sourcePanel = getSftpPanel(payload && payload.panelId);
    const localDir = String(payload && payload.localDir ? payload.localDir : '').trim();
    const sourcePaths = Array.isArray(payload && payload.sourcePaths) ? payload.sourcePaths : [];
    if (!localDir) return { ok: false, error: '未选择本地目录' };
    if (!sourcePaths.length) return { ok: false, error: '未选择下载文件' };
    const localPanel = { type: 'local', cwd: localDir };
    let lastPath = '';
    let skippedFiles = 0;
    for (const src of sourcePaths) {
      const r = await transferPathBetweenPanels(sourcePanel, localPanel, src, localDir, payload && payload.transferId, {
        fromPanelId: payload && payload.panelId ? payload.panelId : '',
        toPanelId: 'local'
      }, {
        conflictStrategy: payload && payload.conflictStrategy ? payload.conflictStrategy : 'overwrite'
      });
      lastPath = r.targetPath;
      skippedFiles += Number(r && r.skippedFiles ? r.skippedFiles : 0);
    }
    appendAuditLog('transfer.download-local.success', {
      panelId: payload && payload.panelId ? payload.panelId : '',
      sourceCount: sourcePaths.length,
      localDir
    }, 'info');
    return { ok: true, targetPath: lastPath, skippedFiles };
  } catch (err) {
    appendAuditLog('transfer.download-local.failed', {
      panelId: payload && payload.panelId ? payload.panelId : '',
      localDir: payload && payload.localDir ? payload.localDir : '',
      error: String(err.message || err)
    }, 'error');
    return { ok: false, error: String(err.message || err) };
  }
});

// 当Electron完成初始化时创建窗口
app.whenReady().then(() => {
  console.log('=== Smart-Term Electron版本启动 ===');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出
app.on('window-all-closed', () => {
  sshManualDisconnect = true;
  clearReconnectTimer();
  sshReconnectStartedAt = null;
  emitReconnectState({ active: false, reason: 'app-exit' });
  if (localPty) {
    try {
      localPty.kill();
    } catch (_err) {
      // noop
    }
    localPty = null;
  }
  if (sshSession) {
    closeSSHSession('app-exit');
  }
  for (const [panelId, panel] of sftpPanels.entries()) {
    try {
      if (panel.sftp) panel.sftp.end();
    } catch (_err) {
      // noop
    }
    try {
      if (panel.client) panel.client.end();
    } catch (_err) {
      // noop
    }
    sftpPanels.delete(panelId);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

console.log('Smart-Term主进程已启动');
