/**
 * Smart-Term Electron版本
 * 渲染进程 - 本地PTY + SSH交互
 */

document.addEventListener('DOMContentLoaded', async () => {
  const TerminalCtor =
    (typeof window.Terminal === 'function' && window.Terminal) ||
    (window.Terminal && typeof window.Terminal.Terminal === 'function' && window.Terminal.Terminal);
  const FitAddonCtor =
    (typeof window.FitAddon === 'function' && window.FitAddon) ||
    (window.FitAddon && typeof window.FitAddon.FitAddon === 'function' && window.FitAddon.FitAddon);

  if (!TerminalCtor || !FitAddonCtor) {
    document.getElementById('status').textContent = 'xterm加载失败';
    return;
  }
  if (!window.terminal) {
    document.getElementById('status').textContent = 'preload bridge丢失';
    return;
  }

  const term = new TerminalCtor({
    cursorBlink: true,
    cursorStyle: 'block',
    fontSize: 14,
    fontFamily: 'Monaco, Menlo, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#569cd6'
    },
    scrollback: 10000,
    allowProposedApi: true
  });
  const fitAddon = new FitAddonCtor();
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));
  fitAddon.fit();

  const els = {
    status: document.getElementById('status'),
    btnLocal: document.getElementById('btn-local'),
    btnOpenSsh: document.getElementById('btn-open-ssh'),
    btnDisconnectSsh: document.getElementById('btn-disconnect-ssh'),
    btnOpenR2R: document.getElementById('btn-open-r2r'),
    btnOpenHistory: document.getElementById('btn-open-history'),
    btnOpenSettings: document.getElementById('btn-open-settings'),
    btnSaveSession: document.getElementById('btn-save-session'),
    btnLoadSession: document.getElementById('btn-load-session'),
    savedSelect: document.getElementById('saved-ssh-select'),
    connSearch: document.getElementById('conn-search'),
    connSort: document.getElementById('conn-sort'),
    btnLoadSaved: document.getElementById('btn-load-saved'),
    btnDeleteSaved: document.getElementById('btn-delete-saved'),
    btnQuickReconnect: document.getElementById('btn-quick-reconnect'),
    navTerminal: document.getElementById('nav-terminal'),
    navConnections: document.getElementById('nav-connections'),
    navTransfer: document.getElementById('nav-transfer'),
    navHistory: document.getElementById('nav-history'),
    navAudit: document.getElementById('nav-audit'),
    navSettings: document.getElementById('nav-settings'),
    navMonitor: document.getElementById('nav-monitor'),
    sidebar: document.getElementById('sidebar'),
    workspace: document.getElementById('workspace'),
    workspaceViewTitle: document.getElementById('workspace-view-title'),
    workspaceViewSubtitle: document.getElementById('workspace-view-subtitle'),
    workspacePrimaryAction: document.getElementById('workspace-primary-action'),
    workspaceActionOpenSsh: document.getElementById('workspace-action-open-ssh'),
    workspaceActionOpenConnections: document.getElementById('workspace-action-open-connections'),
    workspaceActionOpenTransfer: document.getElementById('workspace-action-open-transfer'),
    workspaceActionOpenHistory: document.getElementById('workspace-action-open-history'),
    workspaceActionOpenAudit: document.getElementById('workspace-action-open-audit'),
    workspaceActionOpenSettings: document.getElementById('workspace-action-open-settings'),
    workspaceActionDisconnect: document.getElementById('workspace-action-disconnect'),
    workspaceActionSaveSession: document.getElementById('workspace-action-save-session'),
    workspaceActionLoadSession: document.getElementById('workspace-action-load-session'),
    tabsBar: document.getElementById('tabs-bar'),
    terminalContainer: document.getElementById('terminal-container'),
    connectionsPanel: document.getElementById('connections-panel'),
    tabsList: document.getElementById('tabs-list'),
    modal: document.getElementById('ssh-modal'),
    inputName: document.getElementById('ssh-name'),
    inputHost: document.getElementById('ssh-host'),
    inputPort: document.getElementById('ssh-port'),
    inputUser: document.getElementById('ssh-username'),
    authType: document.getElementById('ssh-auth-type'),
    inputJumpConfig: document.getElementById('ssh-jump-config'),
    passwordRow: document.getElementById('password-row'),
    keyRow: document.getElementById('key-row'),
    inputPassword: document.getElementById('ssh-password'),
    inputKey: document.getElementById('ssh-key'),
    saveConfig: document.getElementById('ssh-save-config'),
    btnCancelSsh: document.getElementById('btn-cancel-ssh'),
    btnConnectSsh: document.getElementById('btn-connect-ssh'),
    r2rModal: document.getElementById('r2r-modal'),
    r2rPanels: document.querySelector('.r2r-panels'),
    panelLeft: document.getElementById('panel-left'),
    panelRight: document.getElementById('panel-right'),
    r2rSplitter: document.getElementById('r2r-splitter'),
    btnTransferRecover: document.getElementById('btn-transfer-recover'),
    transferQueueSummary: document.getElementById('transfer-queue-summary'),
    transferLastResult: document.getElementById('transfer-last-result'),
    transferConflictStrategy: document.getElementById('transfer-conflict-strategy'),
    btnTransferQueueClear: document.getElementById('btn-transfer-queue-clear'),
    btnTransferRetryFailed: document.getElementById('btn-transfer-retry-failed'),
    btnTransferShowFailed: document.getElementById('btn-transfer-show-failed'),
    transferFailedList: document.getElementById('transfer-failed-list'),
    transferFailedDetail: document.getElementById('transfer-failed-detail'),
    transferFailedDetailText: document.getElementById('transfer-failed-detail-text'),
    btnTransferRetrySelected: document.getElementById('btn-transfer-retry-selected'),
    btnCloseR2R: document.getElementById('btn-close-r2r'),
    r2rLeftConfig: document.getElementById('r2r-left-config'),
    r2rRightConfig: document.getElementById('r2r-right-config'),
    r2rLeftPassword: document.getElementById('r2r-left-password'),
    r2rLeftPassphrase: document.getElementById('r2r-left-passphrase'),
    r2rRightPassword: document.getElementById('r2r-right-password'),
    r2rRightPassphrase: document.getElementById('r2r-right-passphrase'),
    r2rLeftConnect: document.getElementById('r2r-left-connect'),
    r2rRightConnect: document.getElementById('r2r-right-connect'),
    r2rLeftUp: document.getElementById('r2r-left-up'),
    r2rRightUp: document.getElementById('r2r-right-up'),
    r2rLeftRefresh: document.getElementById('r2r-left-refresh'),
    r2rRightRefresh: document.getElementById('r2r-right-refresh'),
    r2rLeftUpload: document.getElementById('r2r-left-upload'),
    r2rRightUpload: document.getElementById('r2r-right-upload'),
    r2rLeftDownload: document.getElementById('r2r-left-download'),
    r2rRightDownload: document.getElementById('r2r-right-download'),
    r2rLeftMkdir: document.getElementById('r2r-left-mkdir'),
    r2rRightMkdir: document.getElementById('r2r-right-mkdir'),
    r2rLeftRename: document.getElementById('r2r-left-rename'),
    r2rRightRename: document.getElementById('r2r-right-rename'),
    r2rLeftDelete: document.getElementById('r2r-left-delete'),
    r2rRightDelete: document.getElementById('r2r-right-delete'),
    r2rLeftOpname: document.getElementById('r2r-left-opname'),
    r2rRightOpname: document.getElementById('r2r-right-opname'),
    r2rLeftPath: document.getElementById('r2r-left-path'),
    r2rRightPath: document.getElementById('r2r-right-path'),
    r2rLeftRecent: document.getElementById('r2r-left-recent'),
    r2rRightRecent: document.getElementById('r2r-right-recent'),
    r2rLeftFavorite: document.getElementById('r2r-left-favorite'),
    r2rRightFavorite: document.getElementById('r2r-right-favorite'),
    r2rLeftFavAdd: document.getElementById('r2r-left-fav-add'),
    r2rRightFavAdd: document.getElementById('r2r-right-fav-add'),
    r2rLeftFavDel: document.getElementById('r2r-left-fav-del'),
    r2rRightFavDel: document.getElementById('r2r-right-fav-del'),
    r2rLeftList: document.getElementById('r2r-left-list'),
    r2rRightList: document.getElementById('r2r-right-list'),
    transferProgress: document.getElementById('transfer-progress'),
    transferProgressTitle: document.getElementById('transfer-progress-title'),
    transferProgressMeta: document.getElementById('transfer-progress-meta'),
    transferProgressFill: document.getElementById('transfer-progress-fill'),
    transferProgressRetry: document.getElementById('transfer-progress-retry'),
    historyModal: document.getElementById('history-modal'),
    historySearch: document.getElementById('history-search'),
    historyList: document.getElementById('history-list'),
    btnHistoryClear: document.getElementById('btn-history-clear'),
    btnHistoryClose: document.getElementById('btn-history-close'),
    auditModal: document.getElementById('audit-modal'),
    auditSearch: document.getElementById('audit-search'),
    auditList: document.getElementById('audit-list'),
    btnAuditClear: document.getElementById('btn-audit-clear'),
    btnAuditRefresh: document.getElementById('btn-audit-refresh'),
    settingsModal: document.getElementById('settings-modal'),
    settingFontFamily: document.getElementById('setting-font-family'),
    settingFontSize: document.getElementById('setting-font-size'),
    settingTheme: document.getElementById('setting-theme'),
    settingShell: document.getElementById('setting-shell'),
    settingSshAutoReconnect: document.getElementById('setting-ssh-auto-reconnect'),
    settingSshRetryMax: document.getElementById('setting-ssh-retry-max'),
    settingSshRetryDelay: document.getElementById('setting-ssh-retry-delay'),
    settingSshKeepalive: document.getElementById('setting-ssh-keepalive'),
    settingSshKeepaliveMax: document.getElementById('setting-ssh-keepalive-max'),
    btnSettingsClose: document.getElementById('btn-settings-close'),
    btnSettingsSave: document.getElementById('btn-settings-save'),
    connName: document.getElementById('conn-name'),
    connHost: document.getElementById('conn-host'),
    connPort: document.getElementById('conn-port'),
    connUsername: document.getElementById('conn-username'),
    connAuthType: document.getElementById('conn-auth-type'),
    connJumpConfig: document.getElementById('conn-jump-config'),
    connPasswordRow: document.getElementById('conn-password-row'),
    connKeyRow: document.getElementById('conn-key-row'),
    connPassphraseRow: document.getElementById('conn-passphrase-row'),
    connPassword: document.getElementById('conn-password'),
    connKey: document.getElementById('conn-key'),
    connPassphrase: document.getElementById('conn-passphrase'),
    btnConnNew: document.getElementById('btn-conn-new'),
    btnConnConnect: document.getElementById('btn-conn-connect'),
    btnConnSave: document.getElementById('btn-conn-save'),
    cpuSummary: document.getElementById('cpu-summary'),
    cpuOverviewLine: document.getElementById('cpu-overview-line'),
    cpuCoreList: document.getElementById('cpu-core-list'),
    cpuModeToggle: document.getElementById('cpu-mode-toggle'),
    memLine: document.getElementById('mem-line'),
    memLine2: document.getElementById('mem-line2'),
    memBar: document.getElementById('mem-bar'),
    diskLine: document.getElementById('disk-line'),
    diskLine2: document.getElementById('disk-line2'),
    diskBar: document.getElementById('disk-bar')
  };

  let cachedConfigs = [];
  const SESSION_KEY = 'smart-term-electron.workspace.v1';
  const CPU_MONITOR_MODE_KEY = 'smart-term-electron.cpu.monitor.mode';
  const R2R_DIR_PREFS_KEY = 'smart-term-electron.r2r.dirprefs.v1';
  const TRANSFER_RECOVERY_KEY = 'smart-term-electron.transfer.recovery.v1';
  let tabs = [];
  let currentTabId = null;
  let pendingTabForConnect = null;
  const r2rState = {
    left: { cwd: '', connected: false, mode: '', selectedPath: '', selectedName: '', selectedIsDirectory: false, recentDirs: [], favoriteDirs: [] },
    right: { cwd: '', connected: false, mode: '', selectedPath: '', selectedName: '', selectedIsDirectory: false, recentDirs: [], favoriteDirs: [] }
  };
  let activeTransferId = null;
  let transferSpeedCtx = { bytes: 0, ts: 0 };
  let lastFailedTransfer = null;
  let pendingTransferRecovery = null;
  let transferQueue = [];
  let transferQueueRunning = false;
  let transferFailedListVisible = false;
  let selectedFailedTransferId = '';
  let r2rSplitRatio = 0.5;
  let r2rSplitDragging = false;
  let cpuMonitorMode = localStorage.getItem(CPU_MONITOR_MODE_KEY) === 'overview' ? 'overview' : 'detailed';
  let currentSettings = null;
  let reconnectStateActive = false;
  let reconnectInputWarned = false;
  let workspacePrimaryActionHandler = null;
  let editingConfigId = '';
  let connectionFilterQuery = '';
  let connectionSortMode = 'name-asc';

  function loadR2RDirPrefs() {
    try {
      const parsed = JSON.parse(localStorage.getItem(R2R_DIR_PREFS_KEY) || '{}');
      ['left', 'right'].forEach((side) => {
        const node = parsed[side] || {};
        r2rState[side].recentDirs = Array.isArray(node.recentDirs) ? node.recentDirs.slice(0, 30) : [];
        r2rState[side].favoriteDirs = Array.isArray(node.favoriteDirs) ? node.favoriteDirs.slice(0, 30) : [];
      });
      const splitRatio = Number(parsed.splitRatio);
      if (Number.isFinite(splitRatio) && splitRatio >= 0.2 && splitRatio <= 0.8) {
        r2rSplitRatio = splitRatio;
      }
    } catch (_err) {
      // noop
    }
  }

  function saveR2RDirPrefs() {
    const payload = {
      left: {
        recentDirs: r2rState.left.recentDirs.slice(0, 30),
        favoriteDirs: r2rState.left.favoriteDirs.slice(0, 30)
      },
      right: {
        recentDirs: r2rState.right.recentDirs.slice(0, 30),
        favoriteDirs: r2rState.right.favoriteDirs.slice(0, 30)
      },
      splitRatio: r2rSplitRatio
    };
    localStorage.setItem(R2R_DIR_PREFS_KEY, JSON.stringify(payload));
  }

  function isR2RStackMode() {
    return window.matchMedia('(max-width: 1080px)').matches;
  }

  function applyR2RSplitRatio(ratio, options = {}) {
    if (!els.panelLeft || !els.panelRight) return;
    if (isR2RStackMode()) {
      els.panelLeft.style.flex = '1 1 0';
      els.panelRight.style.flex = '1 1 0';
      return;
    }
    const next = Math.max(0.2, Math.min(0.8, Number(ratio) || 0.5));
    r2rSplitRatio = next;
    els.panelLeft.style.flex = `${next} 1 0`;
    els.panelRight.style.flex = `${1 - next} 1 0`;
    if (options.save) {
      saveR2RDirPrefs();
    }
  }

  function bindR2RSplitter() {
    if (!els.r2rSplitter || !els.r2rPanels || !els.panelLeft || !els.panelRight) return;
    const onPointerMove = (event) => {
      if (!r2rSplitDragging || isR2RStackMode()) return;
      const rect = els.r2rPanels.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      applyR2RSplitRatio(ratio);
    };
    const stopDragging = () => {
      if (!r2rSplitDragging) return;
      r2rSplitDragging = false;
      els.r2rSplitter.classList.remove('is-dragging');
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', stopDragging);
      saveR2RDirPrefs();
    };
    els.r2rSplitter.addEventListener('mousedown', (event) => {
      if (isR2RStackMode()) return;
      event.preventDefault();
      r2rSplitDragging = true;
      els.r2rSplitter.classList.add('is-dragging');
      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('mouseup', stopDragging);
    });
  }

  function updateTransferRecoverButton() {
    if (!els.btnTransferRecover) return;
    const hasPending = !!(pendingTransferRecovery && pendingTransferRecovery.request);
    els.btnTransferRecover.disabled = !hasPending;
    if (!hasPending) {
      els.btnTransferRecover.textContent = '恢复中断传输';
      els.btnTransferRecover.title = '';
      return;
    }
    const req = pendingTransferRecovery.request || {};
    const label = req.kind === 'upload-local'
      ? '恢复中断传输(上传)'
      : req.kind === 'download-local'
        ? '恢复中断传输(下载)'
        : '恢复中断传输(R2R)';
    els.btnTransferRecover.textContent = label;
    const savedAt = pendingTransferRecovery.savedAt || '';
    els.btnTransferRecover.title = savedAt ? `中断时间: ${savedAt}` : '';
  }

  function loadPendingTransferRecovery() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TRANSFER_RECOVERY_KEY) || 'null');
      if (parsed && parsed.request && typeof parsed.request === 'object') {
        pendingTransferRecovery = parsed;
      } else {
        pendingTransferRecovery = null;
      }
    } catch (_err) {
      pendingTransferRecovery = null;
    }
    updateTransferRecoverButton();
  }

  function persistPendingTransferRecovery(request) {
    if (!request || typeof request !== 'object') return;
    pendingTransferRecovery = {
      request,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(TRANSFER_RECOVERY_KEY, JSON.stringify(pendingTransferRecovery));
    updateTransferRecoverButton();
  }

  function clearPendingTransferRecovery() {
    pendingTransferRecovery = null;
    localStorage.removeItem(TRANSFER_RECOVERY_KEY);
    updateTransferRecoverButton();
  }

  function updateTransferQueueSummary() {
    if (!els.transferQueueSummary) return;
    const pending = transferQueue.filter((item) => item.status === 'pending').length;
    const running = transferQueue.filter((item) => item.status === 'running').length;
    const failed = transferQueue.filter((item) => item.status === 'failed').length;
    els.transferQueueSummary.textContent = `队列: ${pending} (运行中: ${running}, 失败: ${failed})`;
    if (els.btnTransferQueueClear) {
      els.btnTransferQueueClear.disabled = pending === 0;
    }
    if (els.btnTransferRetryFailed) {
      els.btnTransferRetryFailed.disabled = failed === 0;
    }
    if (els.btnTransferShowFailed) {
      els.btnTransferShowFailed.disabled = failed === 0;
      els.btnTransferShowFailed.textContent = transferFailedListVisible ? '收起失败项' : '查看失败项';
    }
    if (els.btnTransferRetrySelected) {
      const selected = transferQueue.find((item) => item.id === selectedFailedTransferId && item.status === 'failed');
      els.btnTransferRetrySelected.disabled = !selected;
    }
    if (!failed) {
      transferFailedListVisible = false;
      selectedFailedTransferId = '';
      if (els.transferFailedList) {
        els.transferFailedList.classList.add('hidden');
      }
      if (els.transferFailedDetail) {
        els.transferFailedDetail.classList.add('hidden');
      }
    }
  }

  function setTransferLastResult(message, level = 'info') {
    if (!els.transferLastResult) return;
    const colors = {
      info: '#9aa0a6',
      success: '#4ec9b0',
      warn: '#dcdcaa',
      error: '#f48771'
    };
    els.transferLastResult.textContent = `最近结果: ${message || '-'}`;
    els.transferLastResult.style.color = colors[level] || colors.info;
  }

  function transferRequestLabel(req) {
    if (!req || typeof req !== 'object') return '未知任务';
    if (req.kind === 'upload-local') {
      return `上传 ${Array.isArray(req.localPaths) ? req.localPaths[0] || '' : ''}`;
    }
    if (req.kind === 'download-local') {
      return `下载 ${Array.isArray(req.sourcePaths) ? req.sourcePaths[0] || '' : ''}`;
    }
    return `R2R ${req.sourcePath || ''}`;
  }

  function classifyTransferError(message) {
    const text = String(message || '').toLowerCase();
    if (text.includes('permission denied') || text.includes('权限')) return '权限问题';
    if (text.includes('no such file') || text.includes('not exist') || text.includes('不存在')) return '路径不存在';
    if (text.includes('auth') || text.includes('认证') || text.includes('password') || text.includes('private key')) return '认证失败';
    if (text.includes('timeout') || text.includes('timed out') || text.includes('超时')) return '网络超时';
    if (text.includes('conflict') || text.includes('冲突') || text.includes('exists')) return '文件冲突';
    return '未知错误';
  }

  function showFailedTransferDetail(item) {
    if (!els.transferFailedDetail || !els.transferFailedDetailText) return;
    if (!item || item.status !== 'failed') {
      els.transferFailedDetail.classList.add('hidden');
      return;
    }
    const req = item.request || {};
    const category = classifyTransferError(item.error || '');
    const sourcePath = req.kind === 'upload-local'
      ? (Array.isArray(req.localPaths) ? req.localPaths[0] || '' : '')
      : req.kind === 'download-local'
        ? (Array.isArray(req.sourcePaths) ? req.sourcePaths[0] || '' : '')
        : (req.sourcePath || '');
    const targetPath = req.kind === 'upload-local'
      ? `${req.side || '?'}:${req.targetDirSnapshot || ''}`
      : req.kind === 'download-local'
        ? (req.localDir || '')
        : `${req.toPanel || '?'}:${req.targetDirSnapshot || ''}`;
    const details = [
      `任务: ${transferRequestLabel(req)}`,
      `类型: ${req.kind || 'unknown'}`,
      `来源: ${sourcePath || '-'}`,
      `目标: ${targetPath || '-'}`,
      `错误分类: ${category}`,
      `错误: ${item.error || 'unknown'}`
    ].join('\n');
    els.transferFailedDetailText.textContent = details;
    els.transferFailedDetail.classList.remove('hidden');
    if (els.btnTransferRetrySelected) {
      els.btnTransferRetrySelected.disabled = false;
    }
  }

  function retryFailedQueueItem(itemId) {
    const target = transferQueue.find((item) => item.id === itemId && item.status === 'failed');
    if (!target) return false;
    target.status = 'pending';
    target.error = '';
    target.request = { ...(target.request || {}), _fromRecovery: true };
    if (selectedFailedTransferId === itemId) {
      selectedFailedTransferId = '';
      if (els.transferFailedDetail) {
        els.transferFailedDetail.classList.add('hidden');
      }
    }
    updateTransferQueueSummary();
    renderTransferFailedList();
    processTransferQueue();
    return true;
  }

  function renderTransferFailedList() {
    if (!els.transferFailedList) return;
    const failedItems = transferQueue.filter((item) => item.status === 'failed');
    if (!failedItems.length) {
      selectedFailedTransferId = '';
      els.transferFailedList.innerHTML = '<div class="transfer-failed-item">暂无失败项</div>';
      if (els.transferFailedDetail) {
        els.transferFailedDetail.classList.add('hidden');
      }
      return;
    }
    if (!failedItems.some((item) => item.id === selectedFailedTransferId)) {
      selectedFailedTransferId = failedItems[0].id;
    }
    els.transferFailedList.innerHTML = '';
    failedItems.forEach((item) => {
      const label = transferRequestLabel(item.request || {});
      const row = document.createElement('div');
      row.className = `transfer-failed-item${item.id === selectedFailedTransferId ? ' is-active' : ''}`;
      const rowInner = document.createElement('div');
      rowInner.className = 'transfer-failed-row';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'transfer-failed-label';
      labelSpan.textContent = `${label} -> ${item.error || 'unknown'}`;
      labelSpan.title = labelSpan.textContent;
      labelSpan.addEventListener('click', () => {
        selectedFailedTransferId = item.id;
        renderTransferFailedList();
      });
      const retryBtn = document.createElement('button');
      retryBtn.className = 'transfer-failed-retry';
      retryBtn.textContent = '重试';
      retryBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const ok = retryFailedQueueItem(item.id);
        if (ok) {
          setStatus('已重试该失败任务', 'info');
        }
      });
      rowInner.appendChild(labelSpan);
      rowInner.appendChild(retryBtn);
      row.appendChild(rowInner);
      els.transferFailedList.appendChild(row);
    });
    if (!transferFailedListVisible) {
      if (els.transferFailedDetail) {
        els.transferFailedDetail.classList.add('hidden');
      }
      return;
    }
    const selected = transferQueue.find((item) => item.id === selectedFailedTransferId && item.status === 'failed');
    showFailedTransferDetail(selected || null);
  }

  function enqueueTransferRequest(request) {
    if (!request || typeof request !== 'object') return null;
    const normalizedRequest = {
      ...request,
      localPaths: Array.isArray(request.localPaths) ? [...request.localPaths] : request.localPaths,
      sourcePaths: Array.isArray(request.sourcePaths) ? [...request.sourcePaths] : request.sourcePaths
    };
    // Snapshot target context at queue time for stable failure details.
    if (normalizedRequest.kind === 'r2r' && normalizedRequest.toPanel && !normalizedRequest.targetDirSnapshot) {
      normalizedRequest.targetDirSnapshot = (r2rState[normalizedRequest.toPanel] && r2rState[normalizedRequest.toPanel].cwd) || '/';
    }
    if (normalizedRequest.kind === 'upload-local' && normalizedRequest.side && !normalizedRequest.targetDirSnapshot) {
      normalizedRequest.targetDirSnapshot = (r2rState[normalizedRequest.side] && r2rState[normalizedRequest.side].cwd) || '/';
    }
    const item = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      request: normalizedRequest,
      status: 'pending',
      error: '',
      createdAt: Date.now()
    };
    transferQueue.push(item);
    updateTransferQueueSummary();
    setStatus('传输任务已加入队列', 'info');
    processTransferQueue();
    return item.id;
  }

  function getTransferConflictStrategy() {
    const value = els.transferConflictStrategy ? String(els.transferConflictStrategy.value || 'overwrite') : 'overwrite';
    return ['overwrite', 'skip', 'rename'].includes(value) ? value : 'overwrite';
  }

  function canRecoverTransferRequest(request) {
    if (!request || typeof request !== 'object') {
      return { ok: false, error: '恢复任务不存在或已损坏' };
    }
    if (request.kind === 'r2r') {
      const fromReady = !!(r2rState[request.fromPanel] && r2rState[request.fromPanel].connected);
      const toReady = !!(r2rState[request.toPanel] && r2rState[request.toPanel].connected);
      if (!fromReady || !toReady) {
        return { ok: false, error: '请先连接传输两侧面板后再恢复 R2R 任务' };
      }
      return { ok: true };
    }
    if (request.kind === 'upload-local' || request.kind === 'download-local') {
      const sideReady = !!(r2rState[request.side] && r2rState[request.side].connected);
      if (!sideReady) {
        return { ok: false, error: '请先连接目标面板后再恢复本地传输任务' };
      }
      return { ok: true };
    }
    return { ok: false, error: `不支持恢复任务类型: ${request.kind}` };
  }

  function renderR2RQuickNav(side) {
    const recentSelect = side === 'left' ? els.r2rLeftRecent : els.r2rRightRecent;
    const favSelect = side === 'left' ? els.r2rLeftFavorite : els.r2rRightFavorite;
    const state = r2rState[side];

    recentSelect.innerHTML = '';
    const rDefault = document.createElement('option');
    rDefault.value = '';
    rDefault.textContent = state.recentDirs.length ? '最近目录' : '最近目录(空)';
    recentSelect.appendChild(rDefault);
    state.recentDirs.forEach((dir) => {
      const opt = document.createElement('option');
      opt.value = dir;
      opt.textContent = dir;
      recentSelect.appendChild(opt);
    });

    favSelect.innerHTML = '';
    const fDefault = document.createElement('option');
    fDefault.value = '';
    fDefault.textContent = state.favoriteDirs.length ? '收藏目录' : '收藏目录(空)';
    favSelect.appendChild(fDefault);
    state.favoriteDirs.forEach((dir) => {
      const opt = document.createElement('option');
      opt.value = dir;
      opt.textContent = dir;
      favSelect.appendChild(opt);
    });
  }

  function rememberRecentDir(side, dir) {
    const value = String(dir || '').trim();
    if (!value) return;
    const arr = r2rState[side].recentDirs.filter((d) => d !== value);
    arr.unshift(value);
    r2rState[side].recentDirs = arr.slice(0, 30);
    renderR2RQuickNav(side);
    saveR2RDirPrefs();
  }

  function addFavoriteDir(side, dir) {
    const value = String(dir || '').trim();
    if (!value) return;
    if (!r2rState[side].favoriteDirs.includes(value)) {
      r2rState[side].favoriteDirs.unshift(value);
      r2rState[side].favoriteDirs = r2rState[side].favoriteDirs.slice(0, 30);
      renderR2RQuickNav(side);
      saveR2RDirPrefs();
    }
  }

  function removeFavoriteDir(side, dir) {
    const value = String(dir || '').trim();
    if (!value) return;
    r2rState[side].favoriteDirs = r2rState[side].favoriteDirs.filter((d) => d !== value);
    renderR2RQuickNav(side);
    saveR2RDirPrefs();
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setStatus(message, level = 'info') {
    const colors = {
      info: '#9cdcfe',
      success: '#4ec9b0',
      warn: '#dcdcaa',
      error: '#f48771'
    };
    els.status.textContent = message;
    els.status.style.color = colors[level] || colors.info;
  }

  function setActiveNav(targetId) {
    const navIds = ['nav-terminal', 'nav-connections', 'nav-transfer', 'nav-history', 'nav-audit', 'nav-settings'];
    navIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.toggle('active', id === targetId);
      }
    });
  }

  function updateMonitorNavState(visible) {
    if (!els.navMonitor) return;
    els.navMonitor.textContent = visible ? '监控: 开' : '监控: 关';
    els.navMonitor.classList.toggle('active', visible);
  }

  function toggleMonitorVisibility(force) {
    const shouldShow = typeof force === 'boolean' ? force : els.sidebar.classList.contains('hidden');
    els.sidebar.classList.toggle('hidden', !shouldShow);
    updateMonitorNavState(shouldShow);
    setStatus(shouldShow ? '系统监控已显示' : '系统监控已隐藏', 'info');
    return shouldShow;
  }

  function dockPanelsIntoWorkspace() {
    const panels = [els.connectionsPanel, els.r2rModal, els.historyModal, els.auditModal, els.settingsModal];
    panels.forEach((panel) => {
      if (!panel || !els.workspace) return;
      panel.classList.add('docked-panel');
      els.workspace.appendChild(panel);
    });
  }

  function showWorkspaceView(view) {
    const isTerminal = view === 'terminal';
    if (els.tabsBar) els.tabsBar.classList.toggle('hidden', !isTerminal);
    if (els.terminalContainer) els.terminalContainer.classList.toggle('hidden', !isTerminal);

    const showTransfer = view === 'transfer';
    const showHistory = view === 'history';
    const showAudit = view === 'audit';
    const showSettings = view === 'settings';
    const showConnections = view === 'connections';

    els.connectionsPanel.classList.toggle('show', showConnections);
    els.connectionsPanel.classList.toggle('hidden', !showConnections);
    els.r2rModal.classList.toggle('show', showTransfer);
    els.historyModal.classList.toggle('show', showHistory);
    els.historyModal.classList.toggle('hidden', !showHistory);
    els.auditModal.classList.toggle('show', showAudit);
    els.auditModal.classList.toggle('hidden', !showAudit);
    els.settingsModal.classList.toggle('show', showSettings);
    els.settingsModal.classList.toggle('hidden', !showSettings);
    if (showTransfer) {
      applyR2RSplitRatio(r2rSplitRatio);
    }
    updateWorkspaceHeader(view);
    updateWorkspaceSecondaryActions(view);
  }

  function updateWorkspaceSecondaryActions(view) {
    const nodes = document.querySelectorAll('#workspace-secondary-actions button[data-views]');
    nodes.forEach((node) => {
      const views = String(node.dataset.views || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const visible = views.includes(view);
      node.classList.toggle('hidden-action', !visible);
    });
  }

  function updateWorkspaceHeader(view) {
    if (!els.workspaceViewTitle || !els.workspaceViewSubtitle || !els.workspacePrimaryAction) return;
    if (view === 'connections') {
      els.workspaceViewTitle.textContent = '连接';
      els.workspaceViewSubtitle.textContent = '集中管理 SSH 配置并快速连接';
      els.workspacePrimaryAction.textContent = '新建空白配置';
      workspacePrimaryActionHandler = () => {
        if (els.btnConnNew) els.btnConnNew.click();
      };
      return;
    }
    if (view === 'transfer') {
      els.workspaceViewTitle.textContent = '文件传输';
      els.workspaceViewSubtitle.textContent = '双面板传输，支持远程/本地拖拽与目录递归';
      els.workspacePrimaryAction.textContent = '切回终端';
      workspacePrimaryActionHandler = () => {
        setActiveNav('nav-terminal');
        showWorkspaceView('terminal');
        term.focus();
      };
      return;
    }
    if (view === 'history') {
      els.workspaceViewTitle.textContent = '命令历史';
      els.workspaceViewSubtitle.textContent = '搜索、复用并管理历史命令';
      els.workspacePrimaryAction.textContent = '清空历史';
      workspacePrimaryActionHandler = async () => {
        await window.terminal.clearHistory();
        await renderHistoryList(els.historySearch.value);
        setStatus('命令历史已清空', 'info');
      };
      return;
    }
    if (view === 'audit') {
      els.workspaceViewTitle.textContent = '审计日志';
      els.workspaceViewSubtitle.textContent = '关键操作记录与安全追踪';
      els.workspacePrimaryAction.textContent = '清空审计日志';
      workspacePrimaryActionHandler = async () => {
        await window.terminal.clearAudit();
        await renderAuditList(els.auditSearch.value);
        setStatus('审计日志已清空', 'warn');
      };
      return;
    }
    if (view === 'settings') {
      els.workspaceViewTitle.textContent = '设置';
      els.workspaceViewSubtitle.textContent = '终端显示、默认Shell与SSH重连参数';
      els.workspacePrimaryAction.textContent = '保存设置';
      workspacePrimaryActionHandler = async () => {
        els.btnSettingsSave.click();
      };
      return;
    }
    els.workspaceViewTitle.textContent = '终端';
    els.workspaceViewSubtitle.textContent = '多标签终端，支持本地与SSH会话';
    els.workspacePrimaryAction.textContent = '新建本地标签';
    workspacePrimaryActionHandler = () => {
      els.btnLocal.click();
    };
  }

  function closeActiveOverlayByEsc() {
    if (els.modal.classList.contains('show')) {
      closeModal();
      return true;
    }
    if (els.settingsModal.classList.contains('show')) {
      closeSettingsModal();
      return true;
    }
    if (els.historyModal.classList.contains('show')) {
      closeHistoryModal();
      return true;
    }
    if (els.auditModal.classList.contains('show')) {
      showWorkspaceView('terminal');
      setActiveNav('nav-terminal');
      return true;
    }
    if (els.r2rModal.classList.contains('show')) {
      showWorkspaceView('terminal');
      setActiveNav('nav-terminal');
      return true;
    }
    if (els.connectionsPanel.classList.contains('show')) {
      showWorkspaceView('terminal');
      setActiveNav('nav-terminal');
      return true;
    }
    return false;
  }

  function getCurrentTab() {
    return tabs.find((t) => t.id === currentTabId) || null;
  }

  function isCurrentSshTab() {
    const tab = getCurrentTab();
    return !!(tab && tab.type === 'ssh');
  }

  function showQuickReconnect(show) {
    els.btnQuickReconnect.classList.toggle('show', !!show);
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  function showTransferProgress(title) {
    if (title) {
      els.transferProgressTitle.textContent = title;
    }
    els.transferProgress.classList.add('show');
  }

  function hideTransferProgress(delayMs = 0) {
    setTimeout(() => {
      els.transferProgress.classList.remove('show');
      els.transferProgressFill.style.width = '0%';
      els.transferProgressMeta.textContent = '0% · 0 B / 0 B';
      els.transferProgressRetry.style.display = 'none';
      activeTransferId = null;
    }, delayMs);
  }

  function applySettingsToTerminal(settings) {
    currentSettings = settings || currentSettings || {};
    if (currentSettings.fontFamily) {
      term.options.fontFamily = currentSettings.fontFamily;
    }
    if (currentSettings.fontSize) {
      term.options.fontSize = Number(currentSettings.fontSize) || 14;
    }
    const isLight = currentSettings.theme === 'light';
    term.options.theme = isLight
      ? {
          background: '#ffffff',
          foreground: '#202020',
          cursor: '#005fb8'
        }
      : {
          background: '#1e1e1e',
          foreground: '#d4d4d4',
          cursor: '#569cd6'
        };
    fitAddon.fit();
  }

  async function openHistoryModal() {
    showWorkspaceView('history');
    els.historySearch.value = '';
    await renderHistoryList('');
    setTimeout(() => els.historySearch.focus(), 30);
  }

  async function openAuditModal() {
    showWorkspaceView('audit');
    els.auditSearch.value = '';
    await renderAuditList('');
    setTimeout(() => els.auditSearch.focus(), 30);
  }

  function closeHistoryModal() {
    showWorkspaceView('terminal');
    setActiveNav('nav-terminal');
  }

  async function renderHistoryList(query) {
    const list = await window.terminal.listHistory(query || '', 200);
    els.historyList.innerHTML = '';
    if (!Array.isArray(list) || !list.length) {
      els.historyList.innerHTML = '<div class="monitor-row">暂无命令历史</div>';
      return;
    }
    list.forEach((item) => {
      const row = document.createElement('div');
      row.style.padding = '6px';
      row.style.borderBottom = '1px solid #2f2f2f';
      row.style.cursor = 'pointer';
      row.innerHTML = `
        <div style="font-size:12px;color:#d4d4d4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.command)}</div>
        <div style="font-size:11px;color:#8a8a8a;">${escapeHtml(item.target || item.mode || '')} · ${escapeHtml(item.createdAt || '')}</div>
      `;
      row.addEventListener('dblclick', () => {
        window.terminal.write(item.command);
        window.terminal.write('\r');
        closeHistoryModal();
        setStatus('已回放历史命令', 'success');
      });
      els.historyList.appendChild(row);
    });
  }

  async function renderAuditList(query) {
    const list = await window.terminal.listAudit(query || '', 400);
    els.auditList.innerHTML = '';
    if (!Array.isArray(list) || !list.length) {
      els.auditList.innerHTML = '<div class="monitor-row">暂无审计日志</div>';
      return;
    }
    list.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'audit-item';
      const payloadText = (() => {
        try {
          return JSON.stringify(item.payload || {});
        } catch (_err) {
          return '{}';
        }
      })();
      row.innerHTML = `
        <div class="audit-main">${escapeHtml(item.event || 'event')} · ${escapeHtml(item.level || 'info')}</div>
        <div class="audit-meta">${escapeHtml(item.createdAt || '')} · ${escapeHtml(payloadText)}</div>
      `;
      els.auditList.appendChild(row);
    });
  }

  async function openSettingsModal() {
    const settings = await window.terminal.getSettings();
    currentSettings = settings || {};
    els.settingFontFamily.value = currentSettings.fontFamily || 'Monaco, Menlo, "Courier New", monospace';
    els.settingFontSize.value = String(currentSettings.fontSize || 14);
    els.settingTheme.value = currentSettings.theme || 'dark';
    els.settingShell.value = currentSettings.defaultShell || '';
    els.settingSshAutoReconnect.value = String(currentSettings.sshAutoReconnect !== false);
    els.settingSshRetryMax.value = String(currentSettings.sshReconnectMaxAttempts || 6);
    els.settingSshRetryDelay.value = String(currentSettings.sshReconnectBaseDelayMs || 1500);
    els.settingSshKeepalive.value = String(currentSettings.sshKeepaliveIntervalMs || 15000);
    els.settingSshKeepaliveMax.value = String(currentSettings.sshKeepaliveCountMax || 3);
    showWorkspaceView('settings');
  }

  function closeSettingsModal() {
    showWorkspaceView('terminal');
    setActiveNav('nav-terminal');
  }

  function createTab(tab) {
    tabs.push(tab);
    renderTabs();
  }

  function renderTabs() {
    els.tabsList.innerHTML = '';
    tabs.forEach((tab) => {
      const item = document.createElement('div');
      item.className = `tab-item ${tab.id === currentTabId ? 'active' : ''}`;
      item.dataset.tabId = tab.id;
      item.textContent = `${tab.type === 'ssh' ? '🔐' : '💻'} ${tab.title || tab.id}`;
      item.addEventListener('click', () => switchToTab(tab.id));

      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '×';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tab.id);
      });
      item.appendChild(close);
      els.tabsList.appendChild(item);
    });
  }

  async function switchToTab(tabId) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    currentTabId = tabId;
    renderTabs();
    term.options.disableStdin = reconnectStateActive && tab.type === 'ssh';

    term.clear();
    term.writeln(`\x1b[1;36m切换到标签: ${tab.title}\x1b[0m`);

    if (tab.type === 'local') {
      const result = await window.terminal.startLocal();
      if (!result || !result.ok) {
        setStatus('切换本地标签失败', 'error');
        return;
      }
      setStatus(`当前标签: ${tab.title}`, 'success');
      return;
    }

    if (tab.type === 'ssh') {
      if (tab.lastConnectPayload) {
        const result = await window.terminal.connectSSH(tab.lastConnectPayload);
        if (result && result.ok) {
          setStatus(`已连接 ${tab.lastConnectPayload.username}@${tab.lastConnectPayload.host}`, 'success');
          return;
        }
      }
      pendingTabForConnect = tab.id;
      els.inputName.value = tab.title || '';
      if (tab.sshConfig) {
        els.inputHost.value = tab.sshConfig.host || '';
        els.inputPort.value = String(tab.sshConfig.port || 22);
        els.inputUser.value = tab.sshConfig.username || '';
        els.authType.value = tab.sshConfig.authType || 'password';
        if (els.inputJumpConfig) {
          setupSshModalJumpOptions(tab.sshConfig.jumpConfigId || '');
        }
      }
      refreshAuthFields();
      openModal();
      setStatus(`标签 ${tab.title} 需要重新连接SSH`, 'info');
    }
  }

  function closeTab(tabId) {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    tabs.splice(idx, 1);
    if (!tabs.length) {
      createTab({ id: `local-${Date.now()}`, type: 'local', title: 'Local' });
    }
    if (currentTabId === tabId) {
      currentTabId = tabs[0].id;
      switchToTab(currentTabId);
    } else {
      renderTabs();
    }
  }

  function saveWorkspaceSession() {
    const payload = {
      tabs: tabs.map((t) => ({
        id: t.id,
        type: t.type,
        title: t.title,
        sshConfig: t.sshConfig || null
      })),
      currentTabId
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    setStatus('会话已保存', 'success');
  }

  async function loadWorkspaceSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      setStatus('没有已保存的会话', 'info');
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      setStatus('会话文件解析失败', 'error');
      return;
    }

    const nextTabs = Array.isArray(parsed.tabs) ? parsed.tabs : [];
    tabs = nextTabs.length
      ? nextTabs.map((t) => ({
        id: t.id || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type: t.type === 'ssh' ? 'ssh' : 'local',
        title: t.title || (t.type === 'ssh' ? 'SSH' : 'Local'),
        sshConfig: t.sshConfig || null,
        lastConnectPayload: null
      }))
      : [{ id: `local-${Date.now()}`, type: 'local', title: 'Local' }];

    currentTabId = parsed.currentTabId && tabs.find((t) => t.id === parsed.currentTabId)
      ? parsed.currentTabId
      : tabs[0].id;
    renderTabs();
    await switchToTab(currentTabId);
    setStatus('会话已恢复', 'success');
  }

  async function updateSystemMonitor() {
    const info = await window.terminal.getSystemInfo();
    if (!info) return;
    const cpuModel = info.cpu && info.cpu.model ? info.cpu.model : 'CPU';
    const cores = Number(info.cpu && info.cpu.cores ? info.cpu.cores : 1);
    const overall = Number(info.cpu && info.cpu.overallPercent ? info.cpu.overallPercent : 0);
    const load1 = Number(info.cpu && info.cpu.load1 ? info.cpu.load1 : 0);
    const perCore = Array.isArray(info.cpu && info.cpu.perCore) ? info.cpu.perCore : [];
    els.cpuSummary.textContent = `${cpuModel} | ${cores} cores | Overall ${overall.toFixed(1)}% | Load1 ${load1.toFixed(2)}`;
    if (cpuMonitorMode === 'detailed') {
      els.cpuCoreList.classList.remove('hidden');
      els.cpuOverviewLine.classList.add('hidden');
      els.cpuModeToggle.textContent = '切换到总览';

      els.cpuCoreList.innerHTML = '';
      perCore.forEach((core) => {
        const pct = Math.max(0, Math.min(100, Number(core.usagePercent || 0)));
        const row = document.createElement('div');
        row.className = 'cpu-core-row';
        row.innerHTML = `
          <div class="cpu-core-label">Core ${core.index}</div>
          <div class="cpu-core-bar"><div class="cpu-core-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="cpu-core-pct">${pct.toFixed(1)}%</div>
        `;
        els.cpuCoreList.appendChild(row);
      });
    } else {
      els.cpuCoreList.classList.add('hidden');
      els.cpuOverviewLine.classList.remove('hidden');
      els.cpuModeToggle.textContent = '切换到详细';
      const topCores = [...perCore]
        .sort((a, b) => Number(b.usagePercent || 0) - Number(a.usagePercent || 0))
        .slice(0, 4)
        .map((c) => `C${c.index}:${Number(c.usagePercent || 0).toFixed(0)}%`)
        .join('  ');
      els.cpuOverviewLine.textContent = `Top Cores: ${topCores || '-'}`;
    }

    const memUsed = Number(info.memory && info.memory.used ? info.memory.used : 0);
    const memTotal = Number(info.memory && info.memory.total ? info.memory.total : 0);
    const memFree = Number(info.memory && info.memory.free ? info.memory.free : 0);
    const memPct = Number(info.memory && info.memory.usedPercent ? info.memory.usedPercent : 0);
    els.memLine.textContent = `已用 ${formatBytes(memUsed)} / 总计 ${formatBytes(memTotal)} (${memPct.toFixed(1)}%)`;
    els.memLine2.textContent = `可用 ${formatBytes(memFree)}`;
    els.memBar.style.width = `${Math.max(0, Math.min(100, memPct))}%`;

    const diskUsed = Number(info.disk && info.disk.used ? info.disk.used : 0);
    const diskTotal = Number(info.disk && info.disk.total ? info.disk.total : 0);
    const diskFree = Number(info.disk && info.disk.available ? info.disk.available : 0);
    const diskPct = Number(info.disk && info.disk.usedPercent ? info.disk.usedPercent : 0);
    const mount = info.disk && info.disk.mount ? info.disk.mount : '/';
    els.diskLine.textContent = `${mount} 已用 ${formatBytes(diskUsed)} / 总计 ${formatBytes(diskTotal)} (${diskPct.toFixed(1)}%)`;
    els.diskLine2.textContent = `可用 ${formatBytes(diskFree)}`;
    els.diskBar.style.width = `${Math.max(0, Math.min(100, diskPct))}%`;
  }

  function openModal() {
    setupSshModalJumpOptions(els.inputJumpConfig ? els.inputJumpConfig.value : '');
    els.modal.classList.add('show');
    setTimeout(() => els.inputHost.focus(), 30);
  }

  function closeModal() {
    els.modal.classList.remove('show');
  }

  function refreshAuthFields() {
    const isKey = els.authType.value === 'key';
    els.passwordRow.classList.toggle('hidden', isKey);
    els.keyRow.classList.toggle('hidden', !isKey);
  }

  async function refreshSavedConfigs() {
    const list = await window.terminal.listSSHConfigs();
    cachedConfigs = Array.isArray(list) ? list : [];
    const previousSelected = editingConfigId || (els.savedSelect ? els.savedSelect.value : '');
    renderSavedConfigList(previousSelected);

    const setupR2ROptions = (selectEl) => {
      selectEl.innerHTML = '';
      const localOpt = document.createElement('option');
      localOpt.value = '__local__';
      localOpt.textContent = 'Local 文件系统';
      selectEl.appendChild(localOpt);

      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = cachedConfigs.length ? '选择SSH配置(可选)' : '暂无SSH配置';
      selectEl.appendChild(empty);
      cachedConfigs.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = `${item.name} (${item.username}@${item.host})`;
        selectEl.appendChild(opt);
      });
    };
    setupR2ROptions(els.r2rLeftConfig);
    setupR2ROptions(els.r2rRightConfig);
    setupJumpConfigOptions(editingConfigId || (els.savedSelect ? els.savedSelect.value : ''), els.connJumpConfig ? els.connJumpConfig.value : '');
    setupSshModalJumpOptions(els.inputJumpConfig ? els.inputJumpConfig.value : '');
  }

  function setupJumpConfigOptions(excludeId, currentValue = '') {
    if (!els.connJumpConfig) return;
    const previousValue = currentValue || '';
    els.connJumpConfig.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '无';
    els.connJumpConfig.appendChild(noneOpt);
    cachedConfigs.forEach((item) => {
      if (excludeId && item.id === excludeId) return;
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} (${item.username}@${item.host})`;
      els.connJumpConfig.appendChild(opt);
    });
    const exists = Array.from(els.connJumpConfig.options).some((opt) => opt.value === previousValue);
    els.connJumpConfig.value = exists ? previousValue : '';
  }

  function setupSshModalJumpOptions(currentValue = '') {
    if (!els.inputJumpConfig) return;
    const previousValue = currentValue || '';
    els.inputJumpConfig.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '无';
    els.inputJumpConfig.appendChild(noneOpt);
    cachedConfigs.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} (${item.username}@${item.host})`;
      els.inputJumpConfig.appendChild(opt);
    });
    const exists = Array.from(els.inputJumpConfig.options).some((opt) => opt.value === previousValue);
    els.inputJumpConfig.value = exists ? previousValue : '';
  }

  function getVisibleSavedConfigs() {
    const query = String(connectionFilterQuery || '').trim().toLowerCase();
    let list = cachedConfigs.slice();
    if (query) {
      list = list.filter((item) => {
        const name = String(item.name || '').toLowerCase();
        const host = String(item.host || '').toLowerCase();
        const user = String(item.username || '').toLowerCase();
        return name.includes(query) || host.includes(query) || user.includes(query);
      });
    }
    const compareText = (a, b, field, desc = false) => {
      const left = String(a && a[field] ? a[field] : '').toLowerCase();
      const right = String(b && b[field] ? b[field] : '').toLowerCase();
      const value = left.localeCompare(right);
      return desc ? -value : value;
    };
    switch (connectionSortMode) {
      case 'name-desc':
        list.sort((a, b) => compareText(a, b, 'name', true));
        break;
      case 'host-asc':
        list.sort((a, b) => compareText(a, b, 'host', false));
        break;
      case 'host-desc':
        list.sort((a, b) => compareText(a, b, 'host', true));
        break;
      case 'name-asc':
      default:
        list.sort((a, b) => compareText(a, b, 'name', false));
        break;
    }
    return list;
  }

  function renderSavedConfigList(preferredId = '') {
    if (!els.savedSelect) return;
    const visible = getVisibleSavedConfigs();
    els.savedSelect.innerHTML = '';
    if (!visible.length) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = cachedConfigs.length ? '当前筛选无结果' : '暂无已保存SSH配置';
      els.savedSelect.appendChild(emptyOpt);
      return;
    }
    visible.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.id;
      const secureMark = item.hasSecret ? ' 🔐' : '';
      opt.textContent = `${item.name} (${item.username}@${item.host}:${item.port})${secureMark}`;
      els.savedSelect.appendChild(opt);
    });
    const stillExists = visible.some((item) => item.id === preferredId);
    if (stillExists) {
      els.savedSelect.value = preferredId;
    } else {
      els.savedSelect.value = visible[0].id;
    }
  }

  function getSelectedConfig() {
    const selectedId = els.savedSelect.value;
    if (!selectedId) return null;
    return cachedConfigs.find((item) => item.id === selectedId) || null;
  }

  function getConfigById(id) {
    if (!id) return null;
    return cachedConfigs.find((item) => item.id === id) || null;
  }

  async function getSavedSecret(configId) {
    if (!configId) return null;
    try {
      const result = await window.terminal.getSSHConfigSecret(configId);
      if (!result || !result.ok) return null;
      return result.secret || null;
    } catch (_err) {
      return null;
    }
  }

  function refreshConnectionEditorAuthFields() {
    if (!els.connAuthType) return;
    const isKey = els.connAuthType.value === 'key';
    if (els.connPasswordRow) els.connPasswordRow.classList.toggle('hidden', isKey);
    if (els.connKeyRow) els.connKeyRow.classList.toggle('hidden', !isKey);
    if (els.connPassphraseRow) els.connPassphraseRow.classList.toggle('hidden', !isKey);
  }

  function clearConnectionEditor() {
    editingConfigId = '';
    if (els.savedSelect) els.savedSelect.value = '';
    setupJumpConfigOptions('', '');
    els.connName.value = '';
    els.connHost.value = '';
    els.connPort.value = '22';
    els.connUsername.value = '';
    els.connAuthType.value = 'password';
    if (els.connJumpConfig) els.connJumpConfig.value = '';
    els.connPassword.value = '';
    els.connKey.value = '';
    els.connPassphrase.value = '';
    refreshConnectionEditorAuthFields();
  }

  async function loadConnectionEditorFromConfig(config) {
    if (!config) return;
    const secret = await getSavedSecret(config.id);
    editingConfigId = config.id || '';
    if (els.savedSelect) els.savedSelect.value = config.id || '';
    setupJumpConfigOptions(editingConfigId, config.jumpConfigId || '');
    els.connName.value = config.name || '';
    els.connHost.value = config.host || '';
    els.connPort.value = String(config.port || 22);
    els.connUsername.value = config.username || '';
    els.connAuthType.value = config.authType || 'password';
    if (els.connJumpConfig) els.connJumpConfig.value = config.jumpConfigId || '';
    els.connPassword.value = (secret && secret.password) || '';
    els.connKey.value = (secret && secret.privateKey) || String(config.keyPath || '');
    els.connPassphrase.value = (secret && secret.passphrase) || '';
    refreshConnectionEditorAuthFields();
  }

  async function saveConnectionFromEditor() {
    const authType = els.connAuthType.value === 'key' ? 'key' : 'password';
    const name = els.connName.value.trim();
    const host = els.connHost.value.trim();
    const port = Number(els.connPort.value) || 22;
    const username = els.connUsername.value.trim();
    if (!host || !username) {
      setStatus('保存失败：主机和用户名必填', 'error');
      return;
    }
    const rawKey = String(els.connKey.value || '').trim();
    const isKeyContent = rawKey.includes('BEGIN');
    const payload = {
      id: editingConfigId || undefined,
      name: name || `${username}@${host}`,
      host,
      port,
      username,
      authType,
      jumpConfigId: els.connJumpConfig && els.connJumpConfig.value ? els.connJumpConfig.value : '',
      keyPath: authType === 'key' && !isKeyContent ? rawKey : '',
      secret: authType === 'key'
        ? {
            privateKey: isKeyContent ? rawKey : '',
            passphrase: els.connPassphrase.value || ''
          }
        : {
            password: els.connPassword.value || ''
          }
    };
    const result = await window.terminal.saveSSHConfig(payload);
    if (!result || !result.ok) {
      setStatus(`保存配置失败: ${result && result.error ? result.error : 'unknown'}`, 'error');
      return;
    }
    editingConfigId = result.item && result.item.id ? result.item.id : editingConfigId;
    await refreshSavedConfigs();
    if (editingConfigId && els.savedSelect) {
      els.savedSelect.value = editingConfigId;
      const selected = getSelectedConfig();
      if (selected) {
        await loadConnectionEditorFromConfig(selected);
      }
    }
    setStatus('SSH配置已保存', 'success');
  }

  async function connectFromConnectionEditor() {
    const authType = els.connAuthType.value === 'key' ? 'key' : 'password';
    const payload = {
      name: els.connName.value.trim(),
      host: els.connHost.value.trim(),
      port: Number(els.connPort.value) || 22,
      username: els.connUsername.value.trim(),
      authType,
      jumpConfigId: els.connJumpConfig && els.connJumpConfig.value ? els.connJumpConfig.value : ''
    };
    if (!payload.host || !payload.username) {
      setStatus('连接失败：主机和用户名必填', 'error');
      return;
    }
    if (authType === 'key') {
      const key = String(els.connKey.value || '').trim();
      if (!key || !key.includes('BEGIN')) {
        setStatus('终端SSH连接需要粘贴私钥内容（非文件路径）', 'error');
        return;
      }
      payload.privateKey = key;
      if (els.connPassphrase.value) payload.passphrase = els.connPassphrase.value;
    } else {
      payload.password = els.connPassword.value || '';
    }

    setStatus(`连接SSH ${payload.username}@${payload.host}:${payload.port}...`);
    const result = await connectSshWithTrustFlow(payload);
    if (!result || !result.ok) {
      setStatus(`SSH连接失败: ${result && result.error ? result.error : 'unknown error'}`, 'error');
      return;
    }

    const tabTitle = payload.name || `${payload.username}@${payload.host}`;
    const newTab = {
      id: `ssh-${Date.now()}`,
      type: 'ssh',
      title: tabTitle,
      sshConfig: {
        host: payload.host,
        port: payload.port,
        username: payload.username,
        authType: payload.authType,
        jumpConfigId: payload.jumpConfigId || ''
      },
      lastConnectPayload: payload
    };
    createTab(newTab);
    currentTabId = newTab.id;
    renderTabs();
    setActiveNav('nav-terminal');
    showWorkspaceView('terminal');
    setStatus(`SSH已连接 ${payload.username}@${payload.host}:${payload.port}`, 'success');
    term.focus();
  }

  async function connectSshWithTrustFlow(payload) {
    let attemptPayload = { ...payload };
    for (let i = 0; i < 3; i += 1) {
      const result = await window.terminal.connectSSH(attemptPayload);
      if (result && result.ok) return result;
      if (result && result.needsHostTrust) {
        const trust = window.confirm(
          `首次连接主机 ${result.host}:${result.port}\n指纹: ${result.fingerprint}\n\n是否信任并继续连接？`
        );
        if (!trust) {
          return { ok: false, error: '已取消：未信任该主机指纹' };
        }
        attemptPayload = { ...payload, trustNewHost: true };
        continue;
      }
      if (result && result.hostKeyMismatch) {
        window.alert(
          `主机指纹不一致，已拒绝连接。\n主机: ${result.host}:${result.port}\n当前: ${result.fingerprint}\n历史: ${result.expectedFingerprint}`
        );
        return result;
      }
      return result;
    }
    return { ok: false, error: '主机信任流程失败，请重试' };
  }

  async function r2rConnectPanel(side) {
    const isLeft = side === 'left';
    const select = isLeft ? els.r2rLeftConfig : els.r2rRightConfig;
    const credentialInput = isLeft ? els.r2rLeftPassword : els.r2rRightPassword;
    const passphraseInput = isLeft ? els.r2rLeftPassphrase : els.r2rRightPassphrase;
    const id = select.value;

    if (id === '__local__') {
      const localResult = await window.terminal.sftpConnectPanel(side, { type: 'local' });
      if (!localResult || !localResult.ok) {
        setStatus(`${side} 本地面板连接失败`, 'error');
        return;
      }
      r2rState[side].connected = true;
      r2rState[side].mode = 'local';
      r2rState[side].cwd = localResult.cwd || '';
      await r2rListPanel(side, r2rState[side].cwd);
      setStatus(`${side} 面板已连接 Local`, 'success');
      return;
    }

    const saved = getConfigById(id);
    if (!saved) {
      setStatus(`${side} 面板未选择配置`, 'error');
      return;
    }

    const config = {
      host: saved.host,
      port: saved.port,
      username: saved.username
    };
    if (saved.authType === 'key') {
      const credential = String(credentialInput.value || '').trim();
      const secret = await getSavedSecret(saved.id);
      const keyPath = credential || String(saved.keyPath || '').trim();
      const finalCredential = credential || String((secret && secret.privateKey) || '').trim();
      const finalPassphrase = passphraseInput.value || String((secret && secret.passphrase) || '');
      if (!finalCredential && !keyPath) {
        setStatus(`${side} 私钥认证需输入私钥内容/路径或保存凭据`, 'error');
        return;
      }
      if (finalCredential.includes('BEGIN')) {
        config.privateKey = finalCredential;
      } else if (keyPath) {
        config.privateKeyPath = keyPath;
      } else {
        config.privateKey = finalCredential;
      }
      if (finalPassphrase) {
        config.passphrase = finalPassphrase;
      }
    } else {
      const secret = await getSavedSecret(saved.id);
      config.password = credentialInput.value || (secret && secret.password) || '';
    }

    setStatus(`${side} 面板连接中...`);
    const result = await window.terminal.sftpConnectPanel(side, config);
    if (!result || !result.ok) {
      setStatus(`${side} 面板连接失败: ${result && result.error ? result.error : 'unknown'}`, 'error');
      return;
    }
    r2rState[side].connected = true;
    r2rState[side].cwd = result.cwd || '.';
    r2rState[side].mode = 'ssh';
    await r2rListPanel(side, r2rState[side].cwd);
    setStatus(`${side} 面板已连接 ${saved.username}@${saved.host}`, 'success');
  }

  function parentPath(p) {
    if (!p || p === '/') return '/';
    const normalized = String(p).replace(/\/+$/, '');
    const idx = normalized.lastIndexOf('/');
    if (idx <= 0) return '/';
    return normalized.slice(0, idx);
  }

  async function r2rListPanel(side, targetPath) {
    const result = await window.terminal.sftpList(side, targetPath || r2rState[side].cwd || '.');
    if (!result || !result.ok) {
      setStatus(`${side} 列表失败: ${result && result.error ? result.error : 'unknown'}`, 'error');
      return;
    }
    r2rState[side].cwd = result.cwd || r2rState[side].cwd;
    r2rState[side].selectedPath = '';
    r2rState[side].selectedName = '';
    r2rState[side].selectedIsDirectory = false;

    const pathEl = side === 'left' ? els.r2rLeftPath : els.r2rRightPath;
    const listEl = side === 'left' ? els.r2rLeftList : els.r2rRightList;
    pathEl.textContent = r2rState[side].cwd;
    rememberRecentDir(side, r2rState[side].cwd);
    listEl.innerHTML = '';

    result.items.forEach((item) => {
      const row = document.createElement('div');
      row.className = `r2r-item ${item.isDirectory ? 'r2r-item-dir' : 'r2r-item-file'}`;
      const nameSpan = document.createElement('span');
      nameSpan.textContent = item.isDirectory ? `📁 ${item.name}` : `📄 ${item.name}`;
      const infoSpan = document.createElement('span');
      infoSpan.textContent = item.isDirectory ? 'DIR' : `${item.size || 0} B`;
      row.appendChild(nameSpan);
      row.appendChild(infoSpan);

      row.addEventListener('click', () => {
        Array.from(listEl.children).forEach((c) => c.classList.remove('selected'));
        row.classList.add('selected');
        const fullPath = `${r2rState[side].cwd.replace(/\/+$/, '')}/${item.name}`.replace(/\/+/g, '/');
        r2rState[side].selectedPath = fullPath;
        r2rState[side].selectedName = item.name;
        r2rState[side].selectedIsDirectory = !!item.isDirectory;
      });

      if (item.isDirectory) {
        row.addEventListener('dblclick', () => {
          const next = `${r2rState[side].cwd.replace(/\/+$/, '')}/${item.name}`.replace(/\/+/g, '/');
          r2rListPanel(side, next.startsWith('/') ? next : `/${next}`);
        });
      }

      row.draggable = true;
      row.addEventListener('dragstart', (event) => {
        const fullPath = `${r2rState[side].cwd.replace(/\/+$/, '')}/${item.name}`.replace(/\/+/g, '/');
        const payload = JSON.stringify({ fromPanel: side, sourcePath: fullPath, isDirectory: !!item.isDirectory });
        event.dataTransfer.setData('application/x-smart-term-r2r', payload);
        event.dataTransfer.effectAllowed = 'copy';
      });

      listEl.appendChild(row);
    });
  }

  function beginProgress(title) {
    const transferId = `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    activeTransferId = transferId;
    transferSpeedCtx = { bytes: 0, ts: Date.now() };
    lastFailedTransfer = null;
    els.transferProgressRetry.style.display = 'none';
    showTransferProgress(title);
    return transferId;
  }

  async function executeTransferRequest(transferRequest, options = {}) {
    const request = transferRequest && typeof transferRequest === 'object' ? transferRequest : null;
    if (!request) return;
    const kind = request.kind || 'r2r';
    const conflictStrategy = ['overwrite', 'skip', 'rename'].includes(request.conflictStrategy)
      ? request.conflictStrategy
      : getTransferConflictStrategy();
    const fromRecovery = !!options.fromRecovery;
    if (!fromRecovery) {
      persistPendingTransferRecovery(request);
    }
    lastFailedTransfer = null;
    let result = null;
    try {
      if (kind === 'r2r') {
        const { fromPanel, toPanel, sourcePath } = request;
        const targetDir = r2rState[toPanel] && r2rState[toPanel].cwd ? r2rState[toPanel].cwd : '/';
        if (!sourcePath || !fromPanel || !toPanel) {
          throw new Error('传输请求不完整');
        }
        setStatus(`传输中: ${sourcePath} -> ${targetDir}`);
        const transferId = beginProgress(`传输中: ${String(sourcePath).split('/').pop() || sourcePath}`);
        result = await window.terminal.sftpTransferR2R(fromPanel, toPanel, sourcePath, targetDir, transferId, conflictStrategy);
        if (!result || !result.ok) {
          throw new Error(result && result.error ? result.error : 'unknown');
        }
        setStatus(`传输成功: ${result.targetPath}`, 'success');
        if (Number(result.skippedFiles || 0) > 0) {
          setTransferLastResult(`完成，跳过 ${result.skippedFiles} 个冲突文件`, 'warn');
        } else {
          setTransferLastResult('R2R 任务完成', 'success');
        }
        hideTransferProgress(900);
        await r2rListPanel(toPanel, r2rState[toPanel].cwd);
      } else if (kind === 'upload-local') {
        const { side, localPaths } = request;
        if (!side || !Array.isArray(localPaths) || !localPaths.length) {
          throw new Error('上传恢复参数不完整');
        }
        const transferId = beginProgress(`上传中: ${localPaths[0].split('/').pop() || 'file'}`);
        result = await window.terminal.sftpUploadLocal(side, r2rState[side].cwd, localPaths, transferId, conflictStrategy);
        if (!result || !result.ok) {
          throw new Error(result && result.error ? result.error : 'unknown');
        }
        setStatus('上传完成', 'success');
        if (Number(result.skippedFiles || 0) > 0) {
          setTransferLastResult(`上传完成，跳过 ${result.skippedFiles} 个冲突文件`, 'warn');
        } else {
          setTransferLastResult('上传任务完成', 'success');
        }
        hideTransferProgress(900);
        await r2rListPanel(side, r2rState[side].cwd);
      } else if (kind === 'download-local') {
        const { side, sourcePaths, localDir } = request;
        if (!side || !Array.isArray(sourcePaths) || !sourcePaths.length || !localDir) {
          throw new Error('下载恢复参数不完整');
        }
        const transferId = beginProgress(`下载中: ${sourcePaths[0].split('/').pop() || 'file'}`);
        result = await window.terminal.sftpDownloadToLocal(side, sourcePaths, localDir, transferId, conflictStrategy);
        if (!result || !result.ok) {
          throw new Error(result && result.error ? result.error : 'unknown');
        }
        setStatus(`下载完成: ${result.targetPath}`, 'success');
        if (Number(result.skippedFiles || 0) > 0) {
          setTransferLastResult(`下载完成，跳过 ${result.skippedFiles} 个冲突文件`, 'warn');
        } else {
          setTransferLastResult('下载任务完成', 'success');
        }
        hideTransferProgress(900);
      } else {
        throw new Error(`不支持的传输类型: ${kind}`);
      }
      clearPendingTransferRecovery();
      return { ok: true };
    } catch (err) {
      const message = String(err && err.message ? err.message : err || 'unknown');
      setStatus(`传输失败: ${message}`, 'error');
      setTransferLastResult(`失败: ${message}`, 'error');
      els.transferProgressMeta.textContent = `失败: ${message}`;
      els.transferProgressRetry.style.display = 'inline-block';
      lastFailedTransfer = request;
      persistPendingTransferRecovery(request);
      return { ok: false, error: message };
    }
  }

  async function processTransferQueue() {
    if (transferQueueRunning) return;
    const next = transferQueue.find((item) => item.status === 'pending');
    if (!next) {
      updateTransferQueueSummary();
      return;
    }
    transferQueueRunning = true;
    next.status = 'running';
    updateTransferQueueSummary();
    try {
      const result = await executeTransferRequest(next.request, { fromRecovery: !!next.request._fromRecovery });
      next.status = result && result.ok ? 'done' : 'failed';
      next.error = result && result.error ? result.error : '';
      if (next.status === 'failed') {
        renderTransferFailedList();
      }
    } finally {
      transferQueueRunning = false;
      transferQueue = transferQueue.filter((item) => item.status !== 'done');
      updateTransferQueueSummary();
      renderTransferFailedList();
      processTransferQueue();
    }
  }

  async function r2rMkdir(side) {
    const input = side === 'left' ? els.r2rLeftOpname : els.r2rRightOpname;
    let name = String(input && input.value ? input.value : '').trim();
    if (!name) {
      name = `new_folder_${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`;
    }
    const result = await window.terminal.sftpMkdir(side, r2rState[side].cwd, name);
    if (!result || !result.ok) {
      setStatus(`新建目录失败: ${result && result.error ? result.error : 'unknown'}`, 'error');
      return;
    }
    if (input) input.value = '';
    setStatus('目录创建成功', 'success');
    await r2rListPanel(side, r2rState[side].cwd);
  }

  async function r2rRename(side) {
    const current = r2rState[side];
    if (!current.selectedPath) {
      setStatus('请先选择要重命名的文件/目录', 'error');
      return;
    }
    const input = side === 'left' ? els.r2rLeftOpname : els.r2rRightOpname;
    const nextName = String(input && input.value ? input.value : '').trim();
    if (!nextName) return;
    const result = await window.terminal.sftpRename(side, current.selectedPath, nextName);
    if (!result || !result.ok) {
      setStatus(`重命名失败: ${result && result.error ? result.error : 'unknown'}`, 'error');
      return;
    }
    if (input) input.value = '';
    setStatus('重命名成功', 'success');
    await r2rListPanel(side, r2rState[side].cwd);
  }

  async function r2rDelete(side) {
    const current = r2rState[side];
    if (!current.selectedPath) {
      setStatus('请先选择要删除的文件/目录', 'error');
      return;
    }
    const result = await window.terminal.sftpDelete(side, current.selectedPath);
    if (!result || !result.ok) {
      setStatus(`删除失败: ${result && result.error ? result.error : 'unknown'}`, 'error');
      return;
    }
    setStatus('删除成功', 'success');
    await r2rListPanel(side, r2rState[side].cwd);
  }

  async function r2rUpload(side) {
    const localPaths = await window.terminal.pickLocalFiles();
    if (!Array.isArray(localPaths) || !localPaths.length) return;
    enqueueTransferRequest({
      kind: 'upload-local',
      side,
      localPaths,
      conflictStrategy: getTransferConflictStrategy()
    });
  }

  async function r2rDownload(side) {
    const current = r2rState[side];
    if (!current.selectedPath) {
      setStatus('请先选择要下载的文件/目录', 'error');
      return;
    }
    const localDir = await window.terminal.pickLocalDirectory();
    if (!localDir) return;
    enqueueTransferRequest({
      kind: 'download-local',
      side,
      sourcePaths: [current.selectedPath],
      localDir,
      conflictStrategy: getTransferConflictStrategy()
    });
  }

  function bindDropTarget(listEl, targetSide) {
    listEl.addEventListener('dragover', (event) => {
      event.preventDefault();
      listEl.classList.add('r2r-drop-target');
      event.dataTransfer.dropEffect = 'copy';
    });
    listEl.addEventListener('dragleave', () => {
      listEl.classList.remove('r2r-drop-target');
    });
    listEl.addEventListener('drop', async (event) => {
      event.preventDefault();
      listEl.classList.remove('r2r-drop-target');
      const raw = event.dataTransfer.getData('application/x-smart-term-r2r');
      if (!raw) return;
      let data = null;
      try {
        data = JSON.parse(raw);
      } catch (_err) {
        return;
      }
      if (!data || !data.fromPanel || !data.sourcePath) return;
      if (data.fromPanel === targetSide) {
        setStatus('同一侧无需拖拽传输', 'info');
        return;
      }
      enqueueTransferRequest({
        kind: 'r2r',
        fromPanel: data.fromPanel,
        toPanel: targetSide,
        sourcePath: data.sourcePath,
        conflictStrategy: getTransferConflictStrategy()
      });
    });
  }

  async function connectSSHFromForm() {
    const payload = {
      name: els.inputName.value.trim(),
      host: els.inputHost.value.trim(),
      port: Number(els.inputPort.value) || 22,
      username: els.inputUser.value.trim(),
      authType: els.authType.value,
      jumpConfigId: els.inputJumpConfig && els.inputJumpConfig.value ? els.inputJumpConfig.value : ''
    };

    if (!payload.host || !payload.username) {
      setStatus('SSH连接需要主机和用户名', 'error');
      return;
    }

    if (payload.authType === 'key') {
      payload.privateKey = els.inputKey.value;
      if (!payload.privateKey.trim()) {
        setStatus('私钥认证需要私钥内容', 'error');
        return;
      }
    } else {
      payload.password = els.inputPassword.value;
    }

    setStatus(`连接SSH ${payload.username}@${payload.host}:${payload.port}...`);
    term.write(`\r\n\x1b[33m[SSH] Connecting to ${payload.username}@${payload.host}:${payload.port}...\x1b[0m\r\n`);

    const result = await connectSshWithTrustFlow(payload);
    if (!result || !result.ok) {
      const error = result && result.error ? result.error : 'unknown error';
      setStatus(`SSH连接失败: ${error}`, 'error');
      term.write(`\r\n\x1b[31m[SSH] Connection failed: ${error}\x1b[0m\r\n`);
      return;
    }

    if (els.saveConfig.checked) {
      await window.terminal.saveSSHConfig({
        name: payload.name || `${payload.username}@${payload.host}`,
        host: payload.host,
        port: payload.port,
        username: payload.username,
        authType: payload.authType,
        jumpConfigId: payload.jumpConfigId || '',
        secret: payload.authType === 'key'
          ? {
              privateKey: payload.privateKey || '',
              passphrase: payload.passphrase || ''
            }
          : {
              password: payload.password || ''
            }
      });
      await refreshSavedConfigs();
    }

    const tabTitle = payload.name || `${payload.username}@${payload.host}`;
    const tabPayload = { ...payload };
    delete tabPayload.password;
    delete tabPayload.privateKey;

    if (pendingTabForConnect) {
      const tab = tabs.find((t) => t.id === pendingTabForConnect);
      if (tab) {
        tab.type = 'ssh';
        tab.title = tabTitle;
        tab.sshConfig = {
          host: payload.host,
          port: payload.port,
          username: payload.username,
          authType: payload.authType,
          jumpConfigId: payload.jumpConfigId || ''
        };
        tab.lastConnectPayload = payload;
        currentTabId = tab.id;
      }
      pendingTabForConnect = null;
    } else {
      const newTab = {
        id: `ssh-${Date.now()}`,
        type: 'ssh',
        title: tabTitle,
        sshConfig: {
          host: payload.host,
          port: payload.port,
          username: payload.username,
          authType: payload.authType,
          jumpConfigId: payload.jumpConfigId || ''
        },
        lastConnectPayload: payload
      };
      createTab(newTab);
      currentTabId = newTab.id;
    }
    renderTabs();

    closeModal();
    setStatus(`SSH已连接 ${payload.username}@${payload.host}:${payload.port}`, 'success');
    term.focus();
  }

  term.onData((data) => {
    if (reconnectStateActive && isCurrentSshTab()) {
      if (!reconnectInputWarned) {
        reconnectInputWarned = true;
        term.write('\r\n\x1b[33m[SSH] 正在重连，输入已临时禁用...\x1b[0m\r\n');
      }
      return;
    }
    window.terminal.write(data);
  });

  window.terminal.onData((data) => {
    term.write(data);
  });
  window.terminal.onExit((payload) => {
    const source = payload && payload.source ? payload.source : 'terminal';
    term.write(`\r\n\x1b[31m[${source}] exited\x1b[0m\r\n`);
  });
  window.terminal.onStatus((payload) => {
    if (!payload) return;
    setStatus(payload.message || '状态更新', payload.level || 'info');
  });
  window.terminal.onReconnectState((payload) => {
    if (!payload) return;
    reconnectStateActive = !!payload.active;
    if (!reconnectStateActive) {
      reconnectInputWarned = false;
    }
    if (isCurrentSshTab()) {
      term.options.disableStdin = reconnectStateActive;
    }
    if (payload.active) {
      showQuickReconnect(false);
      const attempt = payload.attempt || 1;
      const maxAttempts = payload.maxAttempts || '-';
      const sec = Math.max(1, Math.round((payload.nextRetryInMs || 0) / 1000));
      setStatus(`SSH重连中 ${attempt}/${maxAttempts}，${sec}s后重试`, 'info');
      return;
    }
    if (payload.success) {
      showQuickReconnect(false);
      const elapsedSec = Math.max(0, Math.round((payload.elapsedMs || 0) / 1000));
      setStatus(`SSH重连成功（耗时 ${elapsedSec}s）`, 'success');
      return;
    }
    if (payload.failed) {
      setStatus('SSH自动重连失败，请手动重连', 'error');
      showQuickReconnect(isCurrentSshTab());
    }
  });
  window.terminal.onSftpTransferProgress((payload) => {
    if (!payload || !payload.transferId) return;
    if (activeTransferId && payload.transferId !== activeTransferId) return;

    const now = Date.now();
    const bytes = Number(payload.bytesTransferred || 0);
    const total = Number(payload.totalBytes || 0);
    const percent = Number(payload.percent || 0);

    const prevTs = transferSpeedCtx.ts || now;
    const prevBytes = transferSpeedCtx.bytes || 0;
    const deltaTime = Math.max(1, now - prevTs);
    const deltaBytes = Math.max(0, bytes - prevBytes);
    const speedPerSec = (deltaBytes * 1000) / deltaTime;
    transferSpeedCtx = { bytes, ts: now };

    showTransferProgress(`传输中: ${payload.fileName || 'file'}`);
    els.transferProgressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.transferProgressMeta.textContent =
      `${percent}% · ${formatBytes(bytes)} / ${formatBytes(total)} · ${formatBytes(speedPerSec)}/s`;

    if (payload.status === 'done') {
      els.transferProgressFill.style.width = '100%';
      els.transferProgressMeta.textContent = `100% · ${formatBytes(total)} / ${formatBytes(total)} · 完成`;
      els.transferProgressRetry.style.display = 'none';
    } else if (payload.status === 'error') {
      els.transferProgressMeta.textContent = `${percent}% · 传输失败`;
      els.transferProgressRetry.style.display = 'inline-block';
    }
  });

  els.btnLocal.addEventListener('click', async () => {
    const tab = {
      id: `local-${Date.now()}`,
      type: 'local',
      title: `Local-${tabs.filter((t) => t.type === 'local').length + 1}`,
      lastConnectPayload: null,
      sshConfig: null
    };
    createTab(tab);
    await switchToTab(tab.id);
    term.focus();
  });

  els.btnOpenSsh.addEventListener('click', () => {
    pendingTabForConnect = null;
    openModal();
  });
  els.btnCancelSsh.addEventListener('click', closeModal);
  els.btnConnectSsh.addEventListener('click', connectSSHFromForm);
  els.authType.addEventListener('change', refreshAuthFields);

  els.btnDisconnectSsh.addEventListener('click', async () => {
    await window.terminal.disconnectSSH();
    reconnectStateActive = false;
    term.options.disableStdin = false;
    showQuickReconnect(false);
    setStatus('SSH已断开，已切回本地', 'info');
    term.focus();
  });

  els.btnOpenR2R.addEventListener('click', () => {
    setActiveNav('nav-transfer');
    showWorkspaceView('transfer');
  });
  els.btnOpenHistory.addEventListener('click', () => {
    openHistoryModal();
  });
  els.workspacePrimaryAction.addEventListener('click', async () => {
    if (typeof workspacePrimaryActionHandler === 'function') {
      await workspacePrimaryActionHandler();
    }
  });
  els.workspaceActionOpenSsh.addEventListener('click', () => {
    pendingTabForConnect = null;
    openModal();
  });
  if (els.workspaceActionOpenConnections) {
    els.workspaceActionOpenConnections.addEventListener('click', () => {
      setActiveNav('nav-connections');
      showWorkspaceView('connections');
      const selected = getSelectedConfig();
      if (selected) {
        loadConnectionEditorFromConfig(selected);
      } else {
        clearConnectionEditor();
      }
    });
  }
  els.workspaceActionOpenTransfer.addEventListener('click', () => {
    setActiveNav('nav-transfer');
    showWorkspaceView('transfer');
  });
  els.workspaceActionOpenHistory.addEventListener('click', () => {
    setActiveNav('nav-history');
    openHistoryModal();
  });
  if (els.workspaceActionOpenAudit) {
    els.workspaceActionOpenAudit.addEventListener('click', () => {
      setActiveNav('nav-audit');
      openAuditModal();
    });
  }
  els.workspaceActionOpenSettings.addEventListener('click', () => {
    setActiveNav('nav-settings');
    openSettingsModal();
  });
  els.workspaceActionDisconnect.addEventListener('click', async () => {
    await window.terminal.disconnectSSH();
    reconnectStateActive = false;
    term.options.disableStdin = false;
    showQuickReconnect(false);
    setStatus('SSH已断开，已切回本地', 'info');
    term.focus();
  });
  els.workspaceActionSaveSession.addEventListener('click', saveWorkspaceSession);
  els.workspaceActionLoadSession.addEventListener('click', () => {
    loadWorkspaceSession();
  });
  els.navTerminal.addEventListener('click', () => {
    setActiveNav('nav-terminal');
    showWorkspaceView('terminal');
    term.focus();
  });
  if (els.navConnections) {
    els.navConnections.addEventListener('click', () => {
      setActiveNav('nav-connections');
      showWorkspaceView('connections');
      const selected = getSelectedConfig();
      if (selected) {
        loadConnectionEditorFromConfig(selected);
      } else {
        clearConnectionEditor();
      }
    });
  }
  els.navTransfer.addEventListener('click', () => {
    setActiveNav('nav-transfer');
    showWorkspaceView('transfer');
  });
  els.navHistory.addEventListener('click', () => {
    setActiveNav('nav-history');
    openHistoryModal();
  });
  if (els.navAudit) {
    els.navAudit.addEventListener('click', () => {
      setActiveNav('nav-audit');
      openAuditModal();
    });
  }
  els.navSettings.addEventListener('click', () => {
    setActiveNav('nav-settings');
    openSettingsModal();
  });
  els.navMonitor.addEventListener('click', () => {
    toggleMonitorVisibility();
  });
  els.btnHistoryClose.addEventListener('click', closeHistoryModal);
  els.historySearch.addEventListener('input', () => {
    renderHistoryList(els.historySearch.value);
  });
  els.btnHistoryClear.addEventListener('click', async () => {
    await window.terminal.clearHistory();
    await renderHistoryList(els.historySearch.value);
    setStatus('命令历史已清空', 'info');
  });
  if (els.auditSearch) {
    els.auditSearch.addEventListener('input', () => {
      renderAuditList(els.auditSearch.value);
    });
  }
  if (els.btnAuditRefresh) {
    els.btnAuditRefresh.addEventListener('click', () => {
      renderAuditList(els.auditSearch.value);
    });
  }
  if (els.btnAuditClear) {
    els.btnAuditClear.addEventListener('click', async () => {
      await window.terminal.clearAudit();
      await renderAuditList(els.auditSearch.value);
      setStatus('审计日志已清空', 'warn');
    });
  }
  els.btnOpenSettings.addEventListener('click', () => {
    openSettingsModal();
  });
  els.btnSettingsClose.addEventListener('click', closeSettingsModal);
  els.btnSettingsSave.addEventListener('click', async () => {
    const patch = {
      fontFamily: els.settingFontFamily.value.trim() || 'Monaco, Menlo, "Courier New", monospace',
      fontSize: Number(els.settingFontSize.value) || 14,
      theme: els.settingTheme.value === 'light' ? 'light' : 'dark',
      defaultShell: els.settingShell.value.trim(),
      sshAutoReconnect: els.settingSshAutoReconnect.value !== 'false',
      sshReconnectMaxAttempts: Math.max(1, Math.min(20, Number(els.settingSshRetryMax.value) || 6)),
      sshReconnectBaseDelayMs: Math.max(500, Math.min(60000, Number(els.settingSshRetryDelay.value) || 1500)),
      sshKeepaliveIntervalMs: Math.max(3000, Math.min(60000, Number(els.settingSshKeepalive.value) || 15000)),
      sshKeepaliveCountMax: Math.max(1, Math.min(10, Number(els.settingSshKeepaliveMax.value) || 3))
    };
    const result = await window.terminal.saveSettings(patch);
    if (result && result.ok) {
      applySettingsToTerminal(result.settings);
      closeSettingsModal();
      setStatus('设置已保存', 'success');
    } else {
      setStatus('设置保存失败', 'error');
    }
  });
  els.btnCloseR2R.addEventListener('click', () => {
    showWorkspaceView('terminal');
    setActiveNav('nav-terminal');
  });
  if (els.btnTransferRecover) {
    els.btnTransferRecover.addEventListener('click', async () => {
      if (!pendingTransferRecovery || !pendingTransferRecovery.request) {
        setStatus('没有可恢复的中断传输', 'info');
        return;
      }
      setActiveNav('nav-transfer');
      showWorkspaceView('transfer');
      const check = canRecoverTransferRequest(pendingTransferRecovery.request);
      if (!check.ok) {
        setStatus(check.error, 'warn');
        return;
      }
      setStatus('正在恢复中断传输...', 'info');
      enqueueTransferRequest({
        ...pendingTransferRecovery.request,
        _fromRecovery: true
      });
    });
  }
  if (els.btnTransferQueueClear) {
    els.btnTransferQueueClear.addEventListener('click', () => {
      transferQueue = transferQueue.filter((item) => item.status !== 'pending');
      updateTransferQueueSummary();
      renderTransferFailedList();
      setStatus('已清空待执行传输队列', 'info');
    });
  }
  if (els.btnTransferRetryFailed) {
    els.btnTransferRetryFailed.addEventListener('click', () => {
      let retried = 0;
      transferQueue.forEach((item) => {
        if (item.status === 'failed') {
          item.status = 'pending';
          item.error = '';
          item.request = { ...(item.request || {}), _fromRecovery: true };
          retried += 1;
        }
      });
      selectedFailedTransferId = '';
      updateTransferQueueSummary();
      renderTransferFailedList();
      if (retried > 0) {
        setStatus(`已重新排队 ${retried} 个失败任务`, 'info');
        processTransferQueue();
      }
    });
  }
  if (els.btnTransferShowFailed && els.transferFailedList) {
    els.btnTransferShowFailed.addEventListener('click', () => {
      transferFailedListVisible = !transferFailedListVisible;
      els.transferFailedList.classList.toggle('hidden', !transferFailedListVisible);
      if (!transferFailedListVisible && els.transferFailedDetail) {
        els.transferFailedDetail.classList.add('hidden');
      }
      updateTransferQueueSummary();
      renderTransferFailedList();
    });
  }
  if (els.btnTransferRetrySelected) {
    els.btnTransferRetrySelected.addEventListener('click', () => {
      if (!selectedFailedTransferId) return;
      const ok = retryFailedQueueItem(selectedFailedTransferId);
      if (ok) {
        setStatus('已重试当前失败项', 'info');
      }
    });
  }

  els.r2rLeftConnect.addEventListener('click', () => r2rConnectPanel('left'));
  els.r2rRightConnect.addEventListener('click', () => r2rConnectPanel('right'));
  els.r2rLeftUp.addEventListener('click', () => r2rListPanel('left', parentPath(r2rState.left.cwd)));
  els.r2rRightUp.addEventListener('click', () => r2rListPanel('right', parentPath(r2rState.right.cwd)));
  els.r2rLeftRefresh.addEventListener('click', () => r2rListPanel('left', r2rState.left.cwd));
  els.r2rRightRefresh.addEventListener('click', () => r2rListPanel('right', r2rState.right.cwd));
  els.r2rLeftMkdir.addEventListener('click', () => r2rMkdir('left'));
  els.r2rRightMkdir.addEventListener('click', () => r2rMkdir('right'));
  els.r2rLeftRename.addEventListener('click', () => r2rRename('left'));
  els.r2rRightRename.addEventListener('click', () => r2rRename('right'));
  els.r2rLeftDelete.addEventListener('click', () => r2rDelete('left'));
  els.r2rRightDelete.addEventListener('click', () => r2rDelete('right'));
  els.r2rLeftUpload.addEventListener('click', () => r2rUpload('left'));
  els.r2rRightUpload.addEventListener('click', () => r2rUpload('right'));
  els.r2rLeftDownload.addEventListener('click', () => r2rDownload('left'));
  els.r2rRightDownload.addEventListener('click', () => r2rDownload('right'));
  els.r2rLeftRecent.addEventListener('change', () => {
    if (els.r2rLeftRecent.value) r2rListPanel('left', els.r2rLeftRecent.value);
  });
  els.r2rRightRecent.addEventListener('change', () => {
    if (els.r2rRightRecent.value) r2rListPanel('right', els.r2rRightRecent.value);
  });
  els.r2rLeftFavorite.addEventListener('change', () => {
    if (els.r2rLeftFavorite.value) r2rListPanel('left', els.r2rLeftFavorite.value);
  });
  els.r2rRightFavorite.addEventListener('change', () => {
    if (els.r2rRightFavorite.value) r2rListPanel('right', els.r2rRightFavorite.value);
  });
  els.r2rLeftFavAdd.addEventListener('click', () => {
    addFavoriteDir('left', r2rState.left.cwd);
    setStatus('左侧目录已收藏', 'success');
  });
  els.r2rRightFavAdd.addEventListener('click', () => {
    addFavoriteDir('right', r2rState.right.cwd);
    setStatus('右侧目录已收藏', 'success');
  });
  els.r2rLeftFavDel.addEventListener('click', () => {
    removeFavoriteDir('left', els.r2rLeftFavorite.value || r2rState.left.cwd);
    setStatus('左侧收藏已移除', 'info');
  });
  els.r2rRightFavDel.addEventListener('click', () => {
    removeFavoriteDir('right', els.r2rRightFavorite.value || r2rState.right.cwd);
    setStatus('右侧收藏已移除', 'info');
  });

  bindDropTarget(els.r2rLeftList, 'left');
  bindDropTarget(els.r2rRightList, 'right');
  els.transferProgressRetry.addEventListener('click', async () => {
    if (!lastFailedTransfer) return;
    enqueueTransferRequest({
      ...lastFailedTransfer,
      _fromRecovery: true
    });
  });
  els.btnSaveSession.addEventListener('click', saveWorkspaceSession);
  els.btnLoadSession.addEventListener('click', () => {
    loadWorkspaceSession();
  });
  els.cpuModeToggle.addEventListener('click', () => {
    cpuMonitorMode = cpuMonitorMode === 'detailed' ? 'overview' : 'detailed';
    localStorage.setItem(CPU_MONITOR_MODE_KEY, cpuMonitorMode);
    updateSystemMonitor();
  });

  els.btnLoadSaved.addEventListener('click', async () => {
    const selected = getSelectedConfig();
    if (!selected) {
      setStatus('请先选择一条SSH配置', 'error');
      return;
    }
    await loadConnectionEditorFromConfig(selected);
    setStatus(`已加载配置: ${selected.name || selected.host}`, 'info');
  });

  els.btnDeleteSaved.addEventListener('click', async () => {
    const selected = getSelectedConfig();
    if (!selected) {
      setStatus('请先选择要删除的配置', 'error');
      return;
    }
    await window.terminal.removeSSHConfig(selected.id);
    await refreshSavedConfigs();
    clearConnectionEditor();
    setStatus('SSH配置已删除', 'info');
  });
  if (els.savedSelect) {
    els.savedSelect.addEventListener('change', async () => {
      const selected = getSelectedConfig();
      if (selected) {
        await loadConnectionEditorFromConfig(selected);
      }
    });
  }
  if (els.connSearch) {
    els.connSearch.addEventListener('input', async () => {
      connectionFilterQuery = els.connSearch.value || '';
      const preferred = editingConfigId || (els.savedSelect ? els.savedSelect.value : '');
      renderSavedConfigList(preferred);
      const selected = getSelectedConfig();
      if (selected) {
        await loadConnectionEditorFromConfig(selected);
      }
    });
  }
  if (els.connSort) {
    els.connSort.addEventListener('change', async () => {
      connectionSortMode = els.connSort.value || 'name-asc';
      const preferred = editingConfigId || (els.savedSelect ? els.savedSelect.value : '');
      renderSavedConfigList(preferred);
      const selected = getSelectedConfig();
      if (selected) {
        await loadConnectionEditorFromConfig(selected);
      }
    });
  }
  if (els.connAuthType) {
    els.connAuthType.addEventListener('change', refreshConnectionEditorAuthFields);
  }
  if (els.btnConnNew) {
    els.btnConnNew.addEventListener('click', () => {
      clearConnectionEditor();
      setStatus('已切换到新建配置', 'info');
    });
  }
  if (els.btnConnSave) {
    els.btnConnSave.addEventListener('click', () => {
      saveConnectionFromEditor();
    });
  }
  if (els.btnConnConnect) {
    els.btnConnConnect.addEventListener('click', () => {
      connectFromConnectionEditor();
    });
  }
  els.btnQuickReconnect.addEventListener('click', async () => {
    const tab = getCurrentTab();
    if (!tab || tab.type !== 'ssh') {
      setStatus('当前不是SSH标签，无法快速重连', 'error');
      showQuickReconnect(false);
      return;
    }
    if (!tab.lastConnectPayload) {
      setStatus('缺少上次连接凭据，请重新填写SSH连接信息', 'error');
      showQuickReconnect(false);
      pendingTabForConnect = tab.id;
      openModal();
      return;
    }
    showQuickReconnect(false);
    reconnectStateActive = false;
    term.options.disableStdin = false;
    setStatus(`手动快速重连 ${tab.lastConnectPayload.username}@${tab.lastConnectPayload.host}...`, 'info');
    const result = await window.terminal.connectSSH(tab.lastConnectPayload);
    if (!result || !result.ok) {
      setStatus(`快速重连失败: ${result && result.error ? result.error : 'unknown'}`, 'error');
      showQuickReconnect(true);
      return;
    }
    setStatus('快速重连成功', 'success');
  });

  window.addEventListener('resize', () => {
    fitAddon.fit();
    const dims = fitAddon.proposeDimensions();
    if (dims) {
      window.terminal.resize(dims.cols, dims.rows);
    }
    applyR2RSplitRatio(r2rSplitRatio);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const closed = closeActiveOverlayByEsc();
    if (closed) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  const initialDims = fitAddon.proposeDimensions();
  if (initialDims) {
    window.terminal.resize(initialDims.cols, initialDims.rows);
  }
  refreshAuthFields();
  dockPanelsIntoWorkspace();
  showWorkspaceView('terminal');
  showQuickReconnect(false);
  setActiveNav('nav-terminal');
  updateMonitorNavState(!els.sidebar.classList.contains('hidden'));
  loadPendingTransferRecovery();
  updateTransferQueueSummary();
  if (pendingTransferRecovery && pendingTransferRecovery.request) {
    const req = pendingTransferRecovery.request || {};
    const taskLabel = req.kind === 'upload-local'
      ? '上传'
      : req.kind === 'download-local'
        ? '下载'
        : 'R2R';
    setStatus(`检测到上次中断${taskLabel}任务，可在文件传输页点击“恢复中断传输”继续`, 'warn');
  }
  loadR2RDirPrefs();
  bindR2RSplitter();
  applyR2RSplitRatio(r2rSplitRatio);
  renderR2RQuickNav('left');
  renderR2RQuickNav('right');
  applySettingsToTerminal(await window.terminal.getSettings());
  connectionFilterQuery = els.connSearch ? (els.connSearch.value || '') : '';
  connectionSortMode = els.connSort ? (els.connSort.value || 'name-asc') : 'name-asc';
  await refreshSavedConfigs();
  refreshConnectionEditorAuthFields();
  const initialSelectedConfig = getSelectedConfig();
  if (initialSelectedConfig) {
    await loadConnectionEditorFromConfig(initialSelectedConfig);
  } else {
    clearConnectionEditor();
  }
  await updateSystemMonitor();
  setInterval(() => {
    updateSystemMonitor();
  }, 3000);

  tabs = [{ id: `local-${Date.now()}`, type: 'local', title: 'Local-1', lastConnectPayload: null, sshConfig: null }];
  currentTabId = tabs[0].id;
  renderTabs();
  await switchToTab(currentTabId);
  const hasSavedSession = !!localStorage.getItem(SESSION_KEY);
  setStatus(hasSavedSession ? '就绪，可恢复上次会话' : '本地终端就绪，SSH功能已启用', 'success');
  term.writeln('\x1b[1;36mSmart-Term Electron\x1b[0m');
  term.writeln('\x1b[32m支持多标签、会话保存/恢复、系统监控侧栏\x1b[0m');
  term.focus();
});
