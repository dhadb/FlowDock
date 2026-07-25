const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('flowdock', {
  getItems: () => ipcRenderer.invoke('vault:get-items'),
  addFilePaths: (paths) => ipcRenderer.invoke('vault:add-file-paths', paths),
  pickFiles: () => ipcRenderer.invoke('vault:pick-files'),
  addText: (text, title) => ipcRenderer.invoke('vault:add-text', { text, title }),
  removeItem: (id) => ipcRenderer.invoke('vault:remove-item', id),
  cleanExpired: () => ipcRenderer.invoke('vault:clean-expired'),
  openItem: (id) => ipcRenderer.invoke('vault:open-item', id),
  revealItem: (id) => ipcRenderer.invoke('vault:reveal-item', id),
  copyShareUrl: (id) => ipcRenderer.invoke('vault:copy-share-url', id),
  setPreferences: (preferences) => ipcRenderer.invoke('app:set-preferences', preferences),
  getPreferences: () => ipcRenderer.invoke('app:get-preferences'),
  toggleWindow: () => ipcRenderer.invoke('app:toggle-window'),
  startDrag: (filePath) => ipcRenderer.send('vault:start-drag', filePath),
  pathsFromFiles: (files) => Array.from(files).map((file) => webUtils.getPathForFile(file)).filter(Boolean),
  onVaultChanged: (callback) => {
    const listener = (_event, items) => callback(items)
    ipcRenderer.on('vault:changed', listener)
    return () => ipcRenderer.removeListener('vault:changed', listener)
  },
  onPreferencesChanged: (callback) => {
    const listener = (_event, preferences) => callback(preferences)
    ipcRenderer.on('preferences:changed', listener)
    return () => ipcRenderer.removeListener('preferences:changed', listener)
  },
  onDockState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('app:dock-state', listener)
    return () => ipcRenderer.removeListener('app:dock-state', listener)
  },
})
