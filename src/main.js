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
const sshSessions = new Map();
let activeSshSessionId = '';
let sshLastConnectConfig = null;
let sshReconnectTimer = null;
let sshReconnectAttempt = 0;
let sshReconnectInProgress = false;
let sshManualDisconnect = false;
let sshReconnectStartedAt = null;
const sftpPanels = new Map();
let lastCpuTimes = null;
let currentInputBuffer = '';
let localOutputProbeBuffer = '';
let sshOutputProbeBuffer = '';
const modeCwd = {
  local: process.env.HOME || process.cwd(),
  ssh: ''
};
const SSH_SECRET_SERVICE = 'smart-term.ssh';

function getActiveModeCwd() {
  if (activeMode === 'ssh') return modeCwd.ssh || '';
  return modeCwd.local || process.env.HOME || process.cwd();
}

function getActiveSshSession() {
  if (!activeSshSessionId) return null;
  return sshSessions.get(activeSshSessionId) || null;
}

function normalizeSshTarget(input) {
  if (!input || typeof input !== 'object') return null;
  const host = String(input.host || '').trim();
  const username = String(input.username || '').trim();
  const port = Number(input.port) || 22;
  const jumpConfigId = String(input.jumpConfigId || '').trim();
  if (!host || !username) return null;
  return { host, username, port, jumpConfigId };
}

function isSameSshTarget(a, b) {
  const x = normalizeSshTarget(a);
  const y = normalizeSshTarget(b);
  if (!x || !y) return false;
  return x.host === y.host
    && x.username === y.username
    && x.port === y.port
    && x.jumpConfigId === y.jumpConfigId;
}

function decodeFileUriPath(rawPath) {
  try {
    return decodeURIComponent(String(rawPath || ''));
  } catch (_err) {
    return String(rawPath || '');
  }
}

function probeCwdFromOutput(mode, chunk) {
  const text = String(chunk || '');
  if (!text) return;

  const key = mode === 'ssh' ? 'ssh' : 'local';
  const prev = key === 'ssh' ? sshOutputProbeBuffer : localOutputProbeBuffer;
  const merged = `${prev}${text}`.slice(-8192);
  const osc7Pattern = /\x1b\]7;file:\/\/[^/\x07\x1b]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/g;
  let match = null;
  let cwd = '';
  while ((match = osc7Pattern.exec(merged)) !== null) {
    cwd = decodeFileUriPath(match[1] || '');
  }
  if (cwd && modeCwd[key] !== cwd) {
    modeCwd[key] = cwd;
    emitToRenderer('terminal:cwd', { mode: key, cwd, source: 'osc7' });
  }
  if (key === 'ssh') {
    sshOutputProbeBuffer = merged.slice(-1024);
  } else {
    localOutputProbeBuffer = merged.slice(-1024);
  }
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
  const defaults = {
    fontFamily: 'Monaco, Menlo, "Courier New", monospace',
    fontSize: 14,
    theme: 'dark',
    language: 'zh-CN',
    defaultShell: '',
    sshAutoReconnect: true,
    sshReconnectMaxAttempts: 6,
    sshReconnectBaseDelayMs: 1500,
    sshKeepaliveIntervalMs: 15000,
    sshKeepaliveCountMax: 3,
    aiAutoFixEnabled: false,
    aiEnabled: true,
    aiProvider: 'mock',
    aiModel: 'gpt-4o-mini',
    aiBaseUrl: ''
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
  const activeSsh = getActiveSshSession();
  const history = readHistory();
  const last = history[0];
  if (last && last.command === cmd) return;
  history.unshift({
    id: crypto.randomUUID(),
    command: cmd,
    mode: activeMode,
    target: activeMode === 'ssh' && activeSsh
      ? `${activeSsh.config.username}@${activeSsh.config.host}:${activeSsh.config.port}`
      : 'local',
    createdAt: new Date().toISOString()
  });
  writeHistory(history.slice(0, 2000));
}

function clampText(input, maxLen = 3000) {
  return String(input || '').slice(0, Math.max(1, Number(maxLen) || 3000));
}

function stripAnsi(input) {
  return String(input || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

function toRecentCommands(items, maxCount = 3) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => clampText(item, 240).trim())
    .filter(Boolean)
    .slice(0, Math.max(1, Number(maxCount) || 3));
}

function detectCommandRisk(command) {
  const cmd = String(command || '').trim();
  const tests = [
    { level: 'high', reason: '包含 rm -rf，可能导致不可恢复删除', pattern: /\brm\s+-rf\b/i },
    { level: 'high', reason: '包含磁盘/文件系统改写命令', pattern: /\b(mkfs|fdisk|parted|dd)\b/i },
    { level: 'high', reason: '包含关机或重启命令', pattern: /\b(shutdown|reboot|halt|poweroff)\b/i },
    { level: 'high', reason: '包含高权限危险操作', pattern: /\bsudo\s+.*\b(rm|mkfs|dd|chmod|chown)\b/i },
    { level: 'medium', reason: '包含批量权限变更', pattern: /\bchmod\s+-R\b/i },
    { level: 'medium', reason: '包含递归批量删除', pattern: /\b(find|xargs).*\b(rm)\b/i }
  ];
  const hits = tests.filter((item) => item.pattern.test(cmd));
  const level = hits.some((h) => h.level === 'high')
    ? 'high'
    : hits.some((h) => h.level === 'medium') ? 'medium' : 'low';
  return {
    level,
    reasons: hits.map((h) => h.reason),
    requiresConfirmation: level !== 'low'
  };
}

function buildMockCommandSuggestion(goal, context) {
  const text = String(goal || '').trim();
  const q = text.toLowerCase();
  const mode = context && context.mode === 'ssh' ? 'ssh' : 'local';
  if (!text) {
    return {
      command: '',
      explanation: '请输入明确目标，例如“查看CPU占用前10进程”'
    };
  }
  if (/(内存|memory|ram)/i.test(q)) {
    return {
      command: mode === 'ssh'
        ? 'free -h'
        : 'ps aux | sort -rk4,4 | head -n 10',
      explanation: mode === 'ssh'
        ? '查看远端内存总体使用情况（free -h）。'
        : '按内存占用排序本地进程并展示前10项（%MEM）。'
    };
  }
  if (/(磁盘|disk|storage|空间|容量|df)/i.test(q)) {
    return {
      command: mode === 'ssh'
        ? 'df -h'
        : 'df -h',
      explanation: '查看磁盘使用情况（df -h）。'
    };
  }
  if (/(cpu|资源|占用|load)/i.test(q)) {
    return {
      command: mode === 'ssh'
        ? 'top -b -n 1 | head -n 30'
        : 'ps aux | sort -rk3,3 | head -n 10',
      explanation: mode === 'ssh'
        ? '批量模式查看远端系统资源概览，便于在SSH场景快速诊断。'
        : '按CPU占用排序本地进程并展示前10项（%CPU）。'
    };
  }
  if (/(日志|log|error|异常|筛查|过滤|grep)/i.test(q)) {
    return {
      command: 'journalctl -n 200 --no-pager | grep -Ei "error|fail|warn" | tail -n 60',
      explanation: '先取最近日志，再筛选常见错误关键词，保留末尾片段便于定位。'
    };
  }
  if (/(批处理|批量|目录|文件|rename|重命名|清理)/i.test(q)) {
    return {
      command: 'find . -type f -name "*.log" -mtime +7 -print',
      explanation: '先仅列出候选文件，避免直接删除；确认后可再执行清理命令。'
    };
  }
  return {
    command: 'pwd && ls -lah',
    explanation: '当前目标较泛，先输出目录与文件概览，再逐步细化命令。'
  };
}

function buildMockFixSuggestions(command, errorText) {
  const cmd = String(command || '').trim();
  const err = stripAnsi(errorText).toLowerCase();
  if (/command not found|not recognized/.test(err)) {
    return [
      { command: `which ${cmd.split(/\s+/)[0] || ''}`.trim(), reason: '确认命令是否已安装并在 PATH 中', risk: detectCommandRisk('which x') },
      { command: 'echo $PATH', reason: '检查 PATH 配置是否缺失', risk: detectCommandRisk('echo $PATH') },
      { command: 'uname -a', reason: '确认当前系统环境后再安装对应工具', risk: detectCommandRisk('uname -a') }
    ];
  }
  if (/permission denied|operation not permitted/.test(err)) {
    return [
      { command: `ls -l ${cmd.split(/\s+/).slice(-1)[0] || '.'}`.trim(), reason: '先查看目标权限归属', risk: detectCommandRisk('ls -l .') },
      { command: `sudo ${cmd}`.trim(), reason: '若确需管理员权限可升级执行', risk: detectCommandRisk(`sudo ${cmd}`) },
      { command: 'id', reason: '确认当前用户身份及组权限', risk: detectCommandRisk('id') }
    ];
  }
  if (/no such file|cannot access/.test(err)) {
    return [
      { command: 'pwd', reason: '确认当前目录是否符合预期', risk: detectCommandRisk('pwd') },
      { command: 'ls -lah', reason: '列出当前目录文件验证路径', risk: detectCommandRisk('ls -lah') },
      { command: cmd.replace(/\s+[^ ]+$/, ''), reason: '先去掉可疑路径参数验证基础命令', risk: detectCommandRisk(cmd.replace(/\s+[^ ]+$/, '')) }
    ];
  }
  return [
    { command: 'pwd && ls -lah', reason: '先确认执行上下文是否正确', risk: detectCommandRisk('pwd && ls -lah') },
    { command: cmd, reason: '复核参数后重试原命令', risk: detectCommandRisk(cmd) },
    { command: 'history | tail -n 20', reason: '检查最近命令链路是否有前置步骤遗漏', risk: detectCommandRisk('history | tail -n 20') }
  ];
}

function parseJsonObjectFromText(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_err) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (_err2) {
        return null;
      }
    }
    return null;
  }
}

async function callOpenAICompatible(messages, opts) {
  const baseUrl = String(opts.baseUrl || '').replace(/\/$/, '');
  const apiKey = String(opts.apiKey || '');
  if (!baseUrl || !apiKey || typeof fetch !== 'function') {
    throw new Error('openai-compatible provider not configured');
  }
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: opts.model || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages
    })
  });
  if (!response.ok) {
    throw new Error(`provider http ${response.status}`);
  }
  const data = await response.json();
  return String(data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '');
}

function buildAiRuntimeConfig() {
  const settings = readSettings();
  const provider = String(settings.aiProvider || process.env.SMART_TERM_AI_PROVIDER || 'mock').trim().toLowerCase();
  const model = String(settings.aiModel || process.env.SMART_TERM_AI_MODEL || 'gpt-4o-mini').trim();
  const baseUrl = String(
    settings.aiBaseUrl
    || process.env.SMART_TERM_AI_BASE_URL
    || process.env.OPENAI_BASE_URL
    || 'https://api.openai.com/v1'
  ).trim();
  const apiKey = String(
    process.env.SMART_TERM_AI_API_KEY
    || process.env.OPENAI_API_KEY
    || ''
  ).trim();
  return { provider, model, baseUrl, apiKey, enabled: settings.aiEnabled !== false };
}

async function generateCommandByAI(goal, context) {
  const cfg = buildAiRuntimeConfig();
  const fallback = buildMockCommandSuggestion(goal, context);
  if (!cfg.enabled || cfg.provider === 'mock' || !cfg.apiKey) {
    return { ...fallback, provider: 'mock' };
  }
  const prompt = [
    { role: 'system', content: 'You are a terminal assistant. Return strict JSON: {"command": "...", "explanation": "..."}' },
    {
      role: 'user',
      content: JSON.stringify({
        goal,
        mode: context.mode,
        cwd: context.cwd,
        recentCommands: context.recentCommands
      })
    }
  ];
  try {
    const raw = await callOpenAICompatible(prompt, cfg);
    const parsed = parseJsonObjectFromText(raw) || {};
    const command = clampText(parsed.command || fallback.command, 500);
    const explanation = clampText(parsed.explanation || fallback.explanation, 600);
    return { command, explanation, provider: cfg.provider };
  } catch (_err) {
    return { ...fallback, provider: 'mock' };
  }
}

async function suggestFixByAI(command, errorText, context) {
  const cfg = buildAiRuntimeConfig();
  const fallback = buildMockFixSuggestions(command, errorText).slice(0, 3);
  if (!cfg.enabled || cfg.provider === 'mock' || !cfg.apiKey) {
    return { suggestions: fallback, provider: 'mock' };
  }
  const prompt = [
    { role: 'system', content: 'Return strict JSON: {"suggestions":[{"command":"...","reason":"..."}]}. Max 3 items.' },
    {
      role: 'user',
      content: JSON.stringify({
        command,
        errorText,
        mode: context.mode,
        cwd: context.cwd,
        recentCommands: context.recentCommands
      })
    }
  ];
  try {
    const raw = await callOpenAICompatible(prompt, cfg);
    const parsed = parseJsonObjectFromText(raw) || {};
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.slice(0, 3).map((item) => {
          const cmd = clampText(item && item.command ? item.command : '', 500).trim();
          const reason = clampText(item && item.reason ? item.reason : '', 400).trim();
          return { command: cmd, reason: reason || 'AI suggestion', risk: detectCommandRisk(cmd) };
        }).filter((item) => item.command)
      : [];
    return { suggestions: suggestions.length ? suggestions : fallback, provider: cfg.provider };
  } catch (_err) {
    return { suggestions: fallback, provider: 'mock' };
  }
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

function getSSHSecretsFallbackPath() {
  return path.join(app.getPath('userData'), 'ssh-secrets-fallback.json');
}

function readSSHSecretsFallback() {
  try {
    const p = getSSHSecretsFallbackPath();
    if (!fs.existsSync(p)) return {};
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (_err) {
    return {};
  }
}

function writeSSHSecretsFallback(store) {
  const next = store && typeof store === 'object' && !Array.isArray(store) ? store : {};
  fs.writeFileSync(getSSHSecretsFallbackPath(), JSON.stringify(next, null, 2), 'utf8');
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
  if (!configId) return { ok: false, skipped: true };
  const payload = {};
  if (secret && typeof secret === 'object') {
    if (secret.password) payload.password = String(secret.password);
    if (secret.privateKey) payload.privateKey = String(secret.privateKey);
    if (secret.passphrase) payload.passphrase = String(secret.passphrase);
  }
  const hasAny = !!(payload.password || payload.privateKey || payload.passphrase);
  if (!keytar) {
    const store = readSSHSecretsFallback();
    if (!hasAny) {
      delete store[String(configId)];
      writeSSHSecretsFallback(store);
      return { ok: true, cleared: true, fallback: true };
    }
    store[String(configId)] = payload;
    writeSSHSecretsFallback(store);
    return { ok: true, fallback: true };
  }
  if (!hasAny) {
    await keytar.deletePassword(SSH_SECRET_SERVICE, String(configId));
    return { ok: true, cleared: true };
  }
  await keytar.setPassword(SSH_SECRET_SERVICE, String(configId), JSON.stringify(payload));
  return { ok: true };
}

async function readSSHConfigSecret(configId) {
  if (!configId) return null;
  if (!keytar) {
    const store = readSSHSecretsFallback();
    const raw = store[String(configId)];
    if (!raw || typeof raw !== 'object') return null;
    return {
      password: raw.password ? String(raw.password) : '',
      privateKey: raw.privateKey ? String(raw.privateKey) : '',
      passphrase: raw.passphrase ? String(raw.passphrase) : ''
    };
  }
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
  const spawnCwd = process.env.HOME || process.cwd();
  try {
    localPty = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: currentSize.cols,
      rows: currentSize.rows,
      cwd: spawnCwd,
      env: process.env
    });
    modeCwd.local = spawnCwd;

    localPty.onData((data) => {
      probeCwdFromOutput('local', data);
      if (activeMode === 'local') {
        emitToRenderer('terminal:data', { data, mode: 'local' });
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

function closeSSHSessionById(sessionId, reason = 'manual') {
  const id = String(sessionId || '');
  if (!id) return;
  const session = sshSessions.get(id);
  if (!session) return;
  const snapshot = { ...(session.config || {}) };

  try {
    if (session.stream) {
      session.stream.end();
    }
  } catch (_err) {
    // noop
  }
  try {
    session.client.end();
  } catch (_err) {
    // noop
  }
  try {
    if (session.jumpClient) session.jumpClient.end();
  } catch (_err) {
    // noop
  }

  sshSessions.delete(id);
  const wasActive = activeSshSessionId === id;
  if (wasActive) {
    activeSshSessionId = '';
    activeMode = 'local';
  }
  appendAuditLog('ssh.disconnect', {
    reason,
    host: snapshot.host || '',
    port: snapshot.port || 22,
    username: snapshot.username || '',
    jumpConfigId: snapshot.jumpConfigId || '',
    sessionId: id
  }, reason === 'manual' ? 'info' : 'warn');
  if (wasActive) {
    emitToRenderer('terminal:status', {
      level: 'info',
      message: reason === 'manual' ? 'SSH连接已断开' : `SSH连接已关闭: ${reason}`
    });
  }
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
      sshManualDisconnect = false;
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

          const sessionId = crypto.randomUUID();
          const session = {
            client,
            jumpClient,
            stream,
            config: { host: config.host, port, username: config.username, jumpConfigId: config.jumpConfigId || '' }
          };
          sshSessions.set(sessionId, session);
          activeSshSessionId = sessionId;
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
          emitToRenderer('terminal:cwd', { mode: 'ssh', cwd: modeCwd.ssh || '' });

          stream.on('data', (data) => {
            probeCwdFromOutput('ssh', data.toString('utf8'));
            if (activeMode === 'ssh' && activeSshSessionId === sessionId) {
              emitToRenderer('terminal:data', {
                data: data.toString('utf8'),
                mode: 'ssh',
                sessionId
              });
            }
          });

          stream.on('close', () => {
            const wasActive = activeSshSessionId === sessionId;
            if (wasActive) {
              emitToRenderer('terminal:exit', { exitCode: 0, signal: null, source: 'ssh' });
            }
            closeSSHSessionById(sessionId, 'stream-close');
            if (wasActive) {
              ensureLocalPty();
              emitToRenderer('terminal:status', { level: 'info', message: '已切回本地终端' });
              scheduleSSHReconnect('stream-close');
            }
          });

          client.on('error', (error) => {
            if (activeSshSessionId === sessionId) {
              emitToRenderer('terminal:status', { level: 'error', message: `SSH错误: ${String(error.message || error)}` });
              scheduleSSHReconnect('client-error');
            }
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
              reconnecting: !!opts.reconnecting,
              sessionId
            }, 'info');
            resolve({ ok: true, mode: 'ssh', sessionId });
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

function getSystemInfoLocal() {
  const cpuInfo = getCpuUsageSnapshot();
  const memory = getMemoryInfo();
  const disk = getDiskInfoByPath(os.homedir() || '/');

  return {
    source: 'local',
    cpu: cpuInfo,
    memory,
    disk,
    os: {
      platform: os.platform(),
      release: os.release(),
      hostname: os.hostname(),
      uptimeSec: os.uptime()
    }
  };
}

function parseCpuStatLine(line) {
  const text = String(line || '').trim();
  if (!text.startsWith('cpu')) return null;
  const parts = text.split(/\s+/);
  if (parts.length < 5) return null;
  const id = parts[0];
  const nums = parts.slice(1).map((v) => Number(v) || 0);
  const idle = (nums[3] || 0) + (nums[4] || 0);
  const total = nums.reduce((sum, n) => sum + n, 0);
  return { id, idle, total };
}

function buildCpuUsageFromSnapshots(beforeLines, afterLines, model, load1) {
  const beforeMap = new Map();
  (beforeLines || []).forEach((line) => {
    const parsed = parseCpuStatLine(line);
    if (parsed) beforeMap.set(parsed.id, parsed);
  });
  const afterMap = new Map();
  (afterLines || []).forEach((line) => {
    const parsed = parseCpuStatLine(line);
    if (parsed) afterMap.set(parsed.id, parsed);
  });

  const perCore = [];
  let overallPercent = 0;
  Array.from(afterMap.keys()).forEach((id) => {
    const prev = beforeMap.get(id);
    const next = afterMap.get(id);
    if (!prev || !next) return;
    const totalDelta = Math.max(0, next.total - prev.total);
    const idleDelta = Math.max(0, next.idle - prev.idle);
    const usagePercent = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
    if (id === 'cpu') {
      overallPercent = Math.max(0, Math.min(100, usagePercent));
      return;
    }
    const idxMatch = id.match(/^cpu(\d+)$/);
    if (!idxMatch) return;
    perCore.push({
      index: Number(idxMatch[1]),
      usagePercent: Math.max(0, Math.min(100, usagePercent))
    });
  });
  perCore.sort((a, b) => a.index - b.index);

  return {
    model: String(model || 'Remote CPU'),
    cores: perCore.length,
    load1: Number(load1 || 0),
    load5: 0,
    overallPercent,
    perCore
  };
}

function parseRemoteMemInfo(lines) {
  const map = {};
  (lines || []).forEach((line) => {
    const m = String(line || '').match(/^(MemTotal|MemAvailable|MemFree):\s+(\d+)\s+kB/i);
    if (!m) return;
    map[m[1]] = Number(m[2]) * 1024;
  });
  const total = Number(map.MemTotal || 0);
  const available = Number(map.MemAvailable || map.MemFree || 0);
  const used = Math.max(0, total - available);
  return {
    total,
    used,
    free: available,
    usedPercent: total > 0 ? (used / total) * 100 : 0,
    source: 'remote-proc-meminfo'
  };
}

function parseRemoteDiskInfo(line) {
  const cols = String(line || '').trim().split(/\s+/);
  if (cols.length < 6) {
    return { mount: '/', usedPercent: 0, total: 0, used: 0, available: 0, source: 'remote-unknown' };
  }
  const total = Number(cols[1]) * 1024;
  const used = Number(cols[2]) * 1024;
  const available = Number(cols[3]) * 1024;
  const usedPercent = Number(String(cols[4] || '').replace('%', '')) || 0;
  const mount = cols.slice(5).join(' ') || '/';
  return { mount, usedPercent, total, used, available, source: 'remote-df' };
}

function parseSectionedOutput(text) {
  const sections = {};
  let current = '';
  String(text || '').split(/\r?\n/).forEach((line) => {
    const marker = String(line || '').trim();
    if (/^__ST_[A-Z0-9_]+__$/.test(marker)) {
      current = marker;
      sections[current] = [];
      return;
    }
    if (!current) return;
    sections[current].push(line);
  });
  return sections;
}

function execSshCommand(session, command, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    if (!session || !session.client) {
      reject(new Error('SSH session unavailable'));
      return;
    }
    let done = false;
    let stdout = '';
    let stderr = '';
    let timer = null;
    session.client.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }
      timer = setTimeout(() => {
        if (done) return;
        done = true;
        try {
          stream.close();
        } catch (_e) {
          // noop
        }
        reject(new Error('remote command timeout'));
      }, Math.max(500, Number(timeoutMs) || 4000));
      stream.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      stream.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      stream.on('close', (code) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (code !== 0 && !stdout.trim()) {
          reject(new Error(stderr.trim() || `remote command exit ${code}`));
          return;
        }
        resolve({ stdout, stderr, code: Number(code || 0) });
      });
      stream.on('error', (streamErr) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        reject(streamErr);
      });
    });
  });
}

async function getSystemInfoRemote(session) {
  const script = [
    'echo "__ST_CPU_MODEL__"',
    '(grep -m1 "^model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed "s/^ *//" || uname -m 2>/dev/null || echo "Remote CPU")',
    'echo "__ST_LOAD__"',
    '(awk \'{print $1}\' /proc/loadavg 2>/dev/null || echo "0")',
    'echo "__ST_CPU_A__"',
    'cat /proc/stat 2>/dev/null | grep "^cpu"',
    'sleep 0.25',
    'echo "__ST_CPU_B__"',
    'cat /proc/stat 2>/dev/null | grep "^cpu"',
    'echo "__ST_MEM__"',
    'cat /proc/meminfo 2>/dev/null | grep -E "^(MemTotal|MemAvailable|MemFree):"',
    'echo "__ST_DISK__"',
    'df -kP "$HOME" 2>/dev/null | tail -n 1',
    'echo "__ST_HOST__"',
    '(hostname 2>/dev/null || echo unknown)',
    'echo "__ST_OS__"',
    '(uname -s 2>/dev/null || echo linux)'
  ].join('\n');
  const result = await execSshCommand(session, script, 4500);
  const sections = parseSectionedOutput(result.stdout);

  const cpu = buildCpuUsageFromSnapshots(
    sections.__ST_CPU_A__ || [],
    sections.__ST_CPU_B__ || [],
    (sections.__ST_CPU_MODEL__ && sections.__ST_CPU_MODEL__[0]) || 'Remote CPU',
    (sections.__ST_LOAD__ && sections.__ST_LOAD__[0]) || 0
  );
  const memory = parseRemoteMemInfo(sections.__ST_MEM__ || []);
  const disk = parseRemoteDiskInfo((sections.__ST_DISK__ && sections.__ST_DISK__[0]) || '');
  const hostname = String((sections.__ST_HOST__ && sections.__ST_HOST__[0]) || '').trim() || 'remote';
  const platform = String((sections.__ST_OS__ && sections.__ST_OS__[0]) || '').trim().toLowerCase() || 'linux';

  return {
    source: 'remote',
    cpu,
    memory,
    disk,
    os: {
      platform,
      release: '',
      hostname,
      uptimeSec: 0
    }
  };
}

async function getSystemInfo() {
  if (activeMode === 'ssh') {
    const activeSsh = getActiveSshSession();
    if (activeSsh) {
      try {
        return await getSystemInfoRemote(activeSsh);
      } catch (_err) {
        const local = getSystemInfoLocal();
        return { ...local, source: 'local-fallback' };
      }
    }
  }
  return getSystemInfoLocal();
}

function parseMemInfoFromProc() {
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const map = {};
    raw.split('\n').forEach((line) => {
      const m = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);
      if (m) map[m[1]] = Number(m[2]) * 1024;
    });
    const total = Number(map.MemTotal || 0);
    const available = Number(map.MemAvailable || map.MemFree || 0);
    if (total <= 0) return null;
    const used = Math.max(0, total - available);
    return {
      total,
      used,
      free: available,
      usedPercent: total > 0 ? (used / total) * 100 : 0,
      source: 'proc-meminfo'
    };
  } catch (_err) {
    return null;
  }
}

function parseMemInfoFromVmStat() {
  try {
    const vmOut = execSync('vm_stat', { encoding: 'utf8' });
    const pageSizeMatch = vmOut.match(/page size of (\d+) bytes/);
    const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 4096;
    const pageMap = {};
    vmOut.split('\n').forEach((line) => {
      const m = line.match(/^([^:]+):\s+([0-9.]+)\.?$/);
      if (!m) return;
      const key = String(m[1] || '').trim().toLowerCase();
      pageMap[key] = Number(m[2] || 0);
    });

    const total = Number(os.totalmem() || 0);
    if (total <= 0) return null;

    // Closer to memory pressure available memory on macOS.
    const freePages = Number(pageMap['pages free'] || 0);
    const inactivePages = Number(pageMap['pages inactive'] || 0);
    const speculativePages = Number(pageMap['pages speculative'] || 0);
    const available = Math.max(0, (freePages + inactivePages + speculativePages) * pageSize);
    const used = Math.max(0, total - available);
    return {
      total,
      used,
      free: available,
      usedPercent: total > 0 ? (used / total) * 100 : 0,
      source: 'vm_stat'
    };
  } catch (_err) {
    return null;
  }
}

function getMemoryInfo() {
  const platform = os.platform();
  if (platform === 'darwin') {
    const vm = parseMemInfoFromVmStat();
    if (vm) return vm;
  }
  if (platform === 'linux') {
    const procMem = parseMemInfoFromProc();
    if (procMem) return procMem;
  }
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  return {
    total,
    used,
    free,
    usedPercent: total > 0 ? (used / total) * 100 : 0,
    source: 'os'
  };
}

function getDiskInfoByPath(targetPath) {
  const safePath = String(targetPath || '/').trim() || '/';
  let disk = { mount: safePath, usedPercent: 0, total: 0, used: 0, available: 0, source: 'unknown' };
  try {
    const out = execSync(`df -kP "${safePath}"`, { encoding: 'utf8' });
    const lines = out.trim().split('\n');
    if (lines.length >= 2) {
      const cols = lines[1].trim().split(/\s+/);
      if (cols.length >= 6) {
        const total = Number(cols[1]) * 1024;
        const used = Number(cols[2]) * 1024;
        const avail = Number(cols[3]) * 1024;
        const usedPercent = Number(String(cols[4]).replace('%', '')) || 0;
        const mount = cols.slice(5).join(' ') || safePath;
        disk = {
          mount,
          usedPercent,
          total,
          used,
          available: avail,
          source: 'df'
        };
      }
    }
  } catch (_err) {
    // noop
  }
  return disk;
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
    emitToRenderer('terminal:cwd', { mode: 'local', cwd: modeCwd.local || '' });
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

ipcMain.handle('terminal:disconnect-ssh', (_event, payload) => {
  const targetSessionId = payload && payload.sessionId ? String(payload.sessionId) : '';
  sshManualDisconnect = true;
  clearReconnectTimer();
  sshReconnectStartedAt = null;
  emitReconnectState({ active: false, reason: 'manual-disconnect' });
  if (targetSessionId) {
    closeSSHSessionById(targetSessionId, 'manual');
  } else if (activeSshSessionId) {
    closeSSHSessionById(activeSshSessionId, 'manual');
  }
  activeMode = 'local';
  const result = ensureLocalPty();
  emitToRenderer('terminal:cwd', { mode: 'local', cwd: modeCwd.local || '' });
  return { ok: result.ok, mode: 'local' };
});

ipcMain.handle('terminal:get-state', () => {
  const activeSsh = getActiveSshSession();
  return {
    mode: activeMode,
    sshConnected: !!activeSsh,
    sshSessionId: activeSshSessionId || '',
    sshTarget: activeSsh ? normalizeSshTarget(activeSsh.config || {}) : null
  };
});

ipcMain.handle('terminal:activate-ssh', (_event, payload) => {
  const requestedId = payload && payload.sessionId ? String(payload.sessionId) : '';
  if (!requestedId) {
    return { ok: false, error: 'missing-ssh-session-id' };
  }
  const bySessionId = sshSessions.get(requestedId);
  if (bySessionId) {
    activeSshSessionId = requestedId;
    activeMode = 'ssh';
    emitToRenderer('terminal:cwd', { mode: 'ssh', cwd: modeCwd.ssh || '' });
    return {
      ok: true,
      mode: 'ssh',
      sessionId: activeSshSessionId,
      target: normalizeSshTarget(bySessionId.config || {})
    };
  }
  return { ok: false, error: 'no-active-ssh-session' };
});

ipcMain.handle('terminal:get-cwd', () => {
  return {
    mode: activeMode,
    cwd: getActiveModeCwd(),
    all: {
      local: modeCwd.local || '',
      ssh: modeCwd.ssh || ''
    }
  };
});

ipcMain.on('terminal:write', (_event, data) => {
  if (typeof data !== 'string') return;

  // Track user-entered command line for history persistence.
  for (const ch of data) {
    if (ch === '\r' || ch === '\n') {
      const submitted = currentInputBuffer.trim();
      addCommandHistory(submitted);
      if (submitted) {
        emitToRenderer('terminal:command-boundary', {
          mode: activeMode,
          cwd: getActiveModeCwd(),
          command: submitted,
          submittedAt: new Date().toISOString()
        });
      }
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

  const activeSsh = getActiveSshSession();
  if (activeMode === 'ssh' && activeSsh && activeSsh.stream) {
    activeSsh.stream.write(data);
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
  const activeSsh = getActiveSshSession();
  if (activeSsh && activeSsh.stream && typeof activeSsh.stream.setWindow === 'function') {
    try {
      activeSsh.stream.setWindow(rows, cols, 0, 0);
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

ipcMain.handle('ai:generate-command', async (_event, payload) => {
  const goal = clampText(payload && payload.goal ? payload.goal : '', 500).trim();
  if (!goal) {
    return { ok: false, error: 'goal is required' };
  }
  const mode = payload && payload.mode === 'ssh' ? 'ssh' : activeMode;
  const cwd = clampText(payload && payload.cwd ? payload.cwd : getActiveModeCwd(), 400);
  const recentCommands = toRecentCommands(
    payload && Array.isArray(payload.recentCommands)
      ? payload.recentCommands
      : readHistory().slice(0, 3).map((item) => item && item.command ? item.command : '')
  );
  const context = { mode, cwd, recentCommands };
  const suggestion = await generateCommandByAI(goal, context);
  const risk = detectCommandRisk(suggestion.command || '');
  const result = {
    ok: true,
    goal,
    command: suggestion.command || '',
    explanation: suggestion.explanation || '',
    risk,
    context,
    provider: suggestion.provider || 'mock'
  };
  appendAuditLog('ai.suggested', {
    goal,
    command: result.command,
    riskLevel: risk.level,
    mode,
    cwd,
    provider: result.provider
  }, risk.level === 'high' ? 'warn' : 'info');
  return result;
});

ipcMain.handle('ai:suggest-fix', async (_event, payload) => {
  const command = clampText(payload && payload.command ? payload.command : '', 500).trim();
  const errorText = clampText(payload && payload.errorText ? payload.errorText : '', 1200).trim();
  if (!command || !errorText) {
    return { ok: false, error: 'command and errorText are required' };
  }
  const mode = payload && payload.mode === 'ssh' ? 'ssh' : activeMode;
  const cwd = clampText(payload && payload.cwd ? payload.cwd : getActiveModeCwd(), 400);
  const recentCommands = toRecentCommands(
    payload && Array.isArray(payload.recentCommands)
      ? payload.recentCommands
      : readHistory().slice(0, 3).map((item) => item && item.command ? item.command : '')
  );
  const context = { mode, cwd, recentCommands };
  const generated = await suggestFixByAI(command, errorText, context);
  const suggestions = (generated.suggestions || []).slice(0, 3).map((item) => ({
    command: clampText(item && item.command ? item.command : '', 500).trim(),
    reason: clampText(item && item.reason ? item.reason : '', 400).trim(),
    risk: item && item.risk ? item.risk : detectCommandRisk(item && item.command ? item.command : '')
  })).filter((item) => item.command);
  appendAuditLog('ai.fix_suggested', {
    command,
    errorText: clampText(stripAnsi(errorText), 400),
    suggestionCount: suggestions.length,
    mode,
    cwd,
    provider: generated.provider || 'mock'
  }, 'info');
  return { ok: true, suggestions, provider: generated.provider || 'mock' };
});

ipcMain.handle('ai:log-action', (_event, payload) => {
  const action = clampText(payload && payload.action ? payload.action : 'unknown', 80);
  const level = action.includes('execute') ? 'warn' : 'info';
  appendAuditLog('ai.user_action', {
    action,
    goal: clampText(payload && payload.goal ? payload.goal : '', 500),
    command: clampText(payload && payload.command ? payload.command : '', 500),
    mode: payload && payload.mode === 'ssh' ? 'ssh' : activeMode,
    cwd: clampText(payload && payload.cwd ? payload.cwd : getActiveModeCwd(), 400),
    riskLevel: clampText(payload && payload.riskLevel ? payload.riskLevel : '', 20),
    provider: clampText(payload && payload.provider ? payload.provider : '', 40)
  }, level);
  return { ok: true };
});

ipcMain.handle('system:get-info', async () => {
  return await getSystemInfo();
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
  for (const sessionId of Array.from(sshSessions.keys())) {
    closeSSHSessionById(sessionId, 'app-exit');
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
