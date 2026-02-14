/**
 * Smart-Term Electron版本
 * Preload脚本 - 安全桥接终端与SSH API
 */

const { contextBridge, ipcRenderer } = require('electron');

console.log('=== Smart-Term Preload脚本启动 ===');

contextBridge.exposeInMainWorld('terminal', {
  startLocal: () => ipcRenderer.invoke('terminal:start-local'),
  connectSSH: (config) => ipcRenderer.invoke('terminal:connect-ssh', config),
  disconnectSSH: () => ipcRenderer.invoke('terminal:disconnect-ssh'),
  getState: () => ipcRenderer.invoke('terminal:get-state'),
  getCwd: () => ipcRenderer.invoke('terminal:get-cwd'),
  write: (data) => ipcRenderer.send('terminal:write', data),
  resize: (cols, rows) => ipcRenderer.send('terminal:resize', { cols, rows }),
  onData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('terminal:data', handler);
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onExit: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal:exit', handler);
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },
  onStatus: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal:status', handler);
    return () => ipcRenderer.removeListener('terminal:status', handler);
  },
  onCwd: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal:cwd', handler);
    return () => ipcRenderer.removeListener('terminal:cwd', handler);
  },
  onCommandBoundary: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal:command-boundary', handler);
    return () => ipcRenderer.removeListener('terminal:command-boundary', handler);
  },
  onReconnectState: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('terminal:reconnect-state', handler);
    return () => ipcRenderer.removeListener('terminal:reconnect-state', handler);
  },
  sftpConnectPanel: (panelId, config) => ipcRenderer.invoke('sftp:connect-panel', { panelId, config }),
  sftpList: (panelId, path) => ipcRenderer.invoke('sftp:list', { panelId, path }),
  sftpMkdir: (panelId, parentPath, dirName) => ipcRenderer.invoke('sftp:mkdir', { panelId, parentPath, dirName }),
  sftpRename: (panelId, oldPath, newName) => ipcRenderer.invoke('sftp:rename', { panelId, oldPath, newName }),
  sftpDelete: (panelId, targetPath) => ipcRenderer.invoke('sftp:delete', { panelId, targetPath }),
  sftpDisconnectPanel: (panelId) => ipcRenderer.invoke('sftp:disconnect-panel', { panelId }),
  sftpTransferR2R: (fromPanelId, toPanelId, sourcePath, targetDir, transferId, conflictStrategy) =>
    ipcRenderer.invoke('sftp:transfer-r2r', { fromPanelId, toPanelId, sourcePath, targetDir, transferId, conflictStrategy }),
  pickLocalFiles: () => ipcRenderer.invoke('dialog:pick-local-files'),
  pickLocalDirectory: () => ipcRenderer.invoke('dialog:pick-local-directory'),
  sftpUploadLocal: (panelId, targetDir, localPaths, transferId, conflictStrategy) =>
    ipcRenderer.invoke('sftp:upload-local', { panelId, targetDir, localPaths, transferId, conflictStrategy }),
  sftpDownloadToLocal: (panelId, sourcePaths, localDir, transferId, conflictStrategy) =>
    ipcRenderer.invoke('sftp:download-to-local', { panelId, sourcePaths, localDir, transferId, conflictStrategy }),
  onSftpTransferProgress: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('sftp:transfer-progress', handler);
    return () => ipcRenderer.removeListener('sftp:transfer-progress', handler);
  },
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  listHistory: (query, limit) => ipcRenderer.invoke('history:list', { query, limit }),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  listAudit: (query, limit) => ipcRenderer.invoke('audit:list', { query, limit }),
  clearAudit: () => ipcRenderer.invoke('audit:clear'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  listSSHConfigs: () => ipcRenderer.invoke('ssh-config:list'),
  saveSSHConfig: (config) => ipcRenderer.invoke('ssh-config:save', config),
  getSSHConfigSecret: (id) => ipcRenderer.invoke('ssh-config:get-secret', id),
  removeSSHConfig: (id) => ipcRenderer.invoke('ssh-config:remove', id)
});

console.log('✅ Preload桥接初始化完成');
