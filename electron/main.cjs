const { app, BrowserWindow, Menu, Tray, dialog, globalShortcut, ipcMain, screen, shell, clipboard, nativeImage } = require('electron')
const { randomUUID } = require('crypto')
const fs = require('fs/promises')
const fssync = require('fs')
const path = require('path')
const os = require('os')
const http = require('http')
const sharp = require('sharp')
const { PDFDocument } = require('pdf-lib')
const QRCode = require('qrcode')

const PANEL_WIDTH = 456
const PANEL_HEIGHT = 760
const EDGE_HANDLE = 12
const CLEANUP_INTERVAL = 60 * 60 * 1000
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.avif', '.bmp'])
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.html', '.py', '.java', '.go', '.rs', '.yaml', '.yml', '.xml', '.csv', '.log'])

let mainWindow
let tray
let shareServer
let sharePort
let vaultDir
let metadataPath
let preferencesPath
let items = []
let preferences = {
  side: 'right',
  ttlHours: 24,
  imageThresholdMb: 3,
  autoWebp: true,
  autoPdf: true,
  autoShareText: true,
}
let isDocked = false
let hideTimer
let boundsAnimation

function appIcon() {
  return nativeImage.createFromDataURL('data:image/svg+xml;base64,' + Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#ff7a59"/><path d="M18 16h28v30H18z" fill="#151a22"/>
      <path d="M24 23h16M24 31h16M24 39h10" stroke="#f6f7f9" stroke-width="4" stroke-linecap="round"/>
    </svg>`).toString('base64'))
}

function getDisplayForWindow() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

function visibleBounds() {
  const { workArea } = getDisplayForWindow()
  return {
    x: preferences.side === 'left' ? workArea.x : workArea.x + workArea.width - PANEL_WIDTH,
    y: Math.max(workArea.y + 30, workArea.y + Math.round((workArea.height - Math.min(PANEL_HEIGHT, workArea.height - 60)) / 2)),
    width: PANEL_WIDTH,
    height: Math.min(PANEL_HEIGHT, workArea.height - 60),
  }
}

function hiddenBounds() {
  const visible = visibleBounds()
  return {
    ...visible,
    x: preferences.side === 'left' ? visible.x - PANEL_WIDTH + EDGE_HANDLE : visible.x + PANEL_WIDTH - EDGE_HANDLE,
  }
}

function animateWindowTo(target, duration, onComplete) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  clearInterval(boundsAnimation)
  const initial = mainWindow.getBounds()
  const startedAt = Date.now()
  const easeOutQuint = (progress) => 1 - ((1 - progress) ** 5)
  boundsAnimation = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return clearInterval(boundsAnimation)
    const progress = Math.min(1, (Date.now() - startedAt) / duration)
    const eased = easeOutQuint(progress)
    mainWindow.setBounds({
      x: Math.round(initial.x + (target.x - initial.x) * eased),
      y: Math.round(initial.y + (target.y - initial.y) * eased),
      width: target.width,
      height: target.height,
    }, true)
    if (progress === 1) {
      clearInterval(boundsAnimation)
      onComplete?.()
    }
  }, 16)
}

function showDock() {
  if (!mainWindow) return
  clearTimeout(hideTimer)
  isDocked = false
  mainWindow.showInactive()
  mainWindow.setAlwaysOnTop(true, 'floating')
  mainWindow.webContents.send('app:dock-state', 'opening')
  animateWindowTo(visibleBounds(), 210, () => mainWindow?.webContents.send('app:dock-state', 'open'))
}

function hideDock(instant = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  isDocked = true
  mainWindow.webContents.send('app:dock-state', 'closing')
  if (instant) {
    mainWindow.setBounds(hiddenBounds(), true)
    mainWindow.webContents.send('app:dock-state', 'hidden')
    return
  }
  animateWindowTo(hiddenBounds(), 170, () => mainWindow?.webContents.send('app:dock-state', 'hidden'))
}

function scheduleHide() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) hideDock()
  }, 1250)
}

function isPointAtEdge(point) {
  const { workArea } = screen.getDisplayNearestPoint(point)
  if (preferences.side === 'left') return point.x <= workArea.x + 4
  return point.x >= workArea.x + workArea.width - 4
}

function metadataPayload() {
  return JSON.stringify(items, null, 2)
}

async function persistItems() {
  await fs.writeFile(metadataPath, metadataPayload(), 'utf8')
  broadcastItems()
}

async function loadState() {
  vaultDir = path.join(app.getPath('userData'), 'vault')
  metadataPath = path.join(vaultDir, 'items.json')
  preferencesPath = path.join(app.getPath('userData'), 'preferences.json')
  await fs.mkdir(vaultDir, { recursive: true })
  try {
    items = JSON.parse(await fs.readFile(metadataPath, 'utf8'))
  } catch {
    items = []
  }
  try {
    preferences = { ...preferences, ...JSON.parse(await fs.readFile(preferencesPath, 'utf8')) }
  } catch {
    // Defaults are intentionally persisted only after a user change.
  }
  await cleanExpired(false)
}

function broadcastItems() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('vault:changed', items)
}

async function persistPreferences() {
  await fs.writeFile(preferencesPath, JSON.stringify(preferences, null, 2), 'utf8')
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('preferences:changed', preferences)
}

function bytes(value) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function typeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  if (TEXT_EXTENSIONS.has(extension)) return 'text'
  if (extension === '.pdf') return 'pdf'
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(extension)) return 'archive'
  return 'file'
}

function createItem({ name, filePath, kind, size, sourceName, note, shareUrl, shareId, qrDataUrl, transformations = [] }) {
  const now = Date.now()
  return {
    id: randomUUID(),
    name,
    path: filePath,
    kind,
    size,
    sourceName: sourceName || name,
    note: note || '',
    shareUrl: shareUrl || null,
    shareId: shareId || null,
    qrDataUrl: qrDataUrl || null,
    transformations,
    createdAt: now,
    expiresAt: now + preferences.ttlHours * 60 * 60 * 1000,
  }
}

async function copyIntoVault(sourcePath, preferredName) {
  const ext = path.extname(preferredName)
  const stem = path.basename(preferredName, ext).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 70) || 'file'
  const destination = path.join(vaultDir, `${Date.now()}-${randomUUID().slice(0, 8)}-${stem}${ext}`)
  await fs.copyFile(sourcePath, destination)
  return destination
}

async function stageFile(sourcePath) {
  const stats = await fs.stat(sourcePath)
  if (!stats.isFile()) throw new Error('Only files can be staged')
  const name = path.basename(sourcePath)
  const kind = typeFor(sourcePath)
  const storedPath = await copyIntoVault(sourcePath, name)
  const transformations = []
  let effectivePath = storedPath
  let effectiveName = name
  let effectiveSize = stats.size

  if (kind === 'image' && preferences.autoWebp && stats.size >= preferences.imageThresholdMb * 1024 * 1024) {
    const webpName = `${path.basename(name, path.extname(name))}.webp`
    effectivePath = path.join(vaultDir, `${Date.now()}-${randomUUID().slice(0, 8)}-${webpName}`)
    await sharp(sourcePath).rotate().resize({ width: 2400, withoutEnlargement: true }).webp({ quality: 82 }).toFile(effectivePath)
    effectiveName = webpName
    effectiveSize = (await fs.stat(effectivePath)).size
    await fs.unlink(storedPath)
    transformations.push(`已压缩为 WebP (${bytes(stats.size)} -> ${bytes(effectiveSize)})`)
  }

  let share = {}
  if (kind === 'text' && preferences.autoShareText) share = await createShareForText(effectivePath)
  return createItem({
    name: effectiveName,
    filePath: effectivePath,
    kind,
    size: effectiveSize,
    sourceName: name,
    shareUrl: share.shareUrl,
    shareId: share.shareId,
    qrDataUrl: share.qrDataUrl,
    transformations,
  })
}

function getLanAddress() {
  const networks = os.networkInterfaces()
  for (const network of Object.values(networks)) {
    for (const address of network || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address
    }
  }
  return '127.0.0.1'
}

async function createShareForText(filePath) {
  if (!sharePort) return {}
  const id = randomUUID().replace(/-/g, '').slice(0, 12)
  const text = await fs.readFile(filePath, 'utf8')
  const url = `http://${getLanAddress()}:${sharePort}/s/${id}`
  const shareFile = path.join(vaultDir, `share-${id}.txt`)
  await fs.writeFile(shareFile, text, 'utf8')
  const qrDataUrl = await QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#151a22', light: '#f7f7f5' } })
  return { shareUrl: url, qrDataUrl, shareId: id }
}

async function createPdf(sourcePaths) {
  const pdf = await PDFDocument.create()
  for (const sourcePath of sourcePaths) {
    const png = await sharp(sourcePath).rotate().resize({ width: 2000, withoutEnlargement: true }).png().toBuffer()
    const image = await pdf.embedPng(png)
    const page = pdf.addPage([image.width, image.height])
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height })
  }
  const output = path.join(vaultDir, `${Date.now()}-${randomUUID().slice(0, 8)}-merged-images.pdf`)
  await fs.writeFile(output, await pdf.save())
  return output
}

async function stageFilePaths(paths) {
  const safePaths = [...new Set(paths)].filter((filePath) => typeof filePath === 'string' && fssync.existsSync(filePath))
  const staged = []
  for (const sourcePath of safePaths) {
    try {
      staged.push(await stageFile(sourcePath))
    } catch (error) {
      console.error(`Unable to stage ${sourcePath}`, error)
    }
  }

  const images = safePaths.filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
  if (preferences.autoPdf && images.length >= 2) {
    try {
      const pdfPath = await createPdf(images)
      const stats = await fs.stat(pdfPath)
      staged.unshift(createItem({
        name: '合并的图像.pdf',
        filePath: pdfPath,
        kind: 'pdf',
        size: stats.size,
        sourceName: `${images.length} 张图片`,
        transformations: [`已由 ${images.length} 张图片自动合并`],
      }))
    } catch (error) {
      console.error('Unable to create image PDF', error)
    }
  }
  items = [...staged, ...items]
  await persistItems()
  return items
}

async function stageText({ text, title }) {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('Text is empty')
  const safeTitle = String(title || '未命名笔记').trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || '未命名笔记'
  const output = path.join(vaultDir, `${Date.now()}-${randomUUID().slice(0, 8)}-${safeTitle}.txt`)
  await fs.writeFile(output, trimmed, 'utf8')
  const share = preferences.autoShareText ? await createShareForText(output) : {}
  const item = createItem({
    name: `${safeTitle}.txt`,
    filePath: output,
    kind: 'text',
    size: Buffer.byteLength(trimmed),
    shareUrl: share.shareUrl,
    shareId: share.shareId,
    qrDataUrl: share.qrDataUrl,
    transformations: share.shareUrl ? ['已生成局域网分享二维码'] : [],
  })
  items = [item, ...items]
  await persistItems()
  return items
}

async function removeItem(id) {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) return items
  items = items.filter((candidate) => candidate.id !== id)
  await removeItemFiles(item)
  await persistItems()
  return items
}

async function cleanExpired(shouldPersist = true) {
  const expired = items.filter((item) => item.expiresAt <= Date.now())
  if (!expired.length) return items
  items = items.filter((item) => item.expiresAt > Date.now())
  await Promise.all(expired.map(removeItemFiles))
  if (shouldPersist) await persistItems()
  return items
}

async function removeItemFiles(item) {
  const shareId = item.shareId || item.shareUrl?.match(/\/s\/([a-z0-9]+)/i)?.[1]
  const paths = [item.path]
  if (shareId) paths.push(path.join(vaultDir, `share-${shareId}.txt`))
  await Promise.all(paths.map(async (candidatePath) => {
    try {
      if (candidatePath?.startsWith(vaultDir)) await fs.unlink(candidatePath)
    } catch {
      // Missing files are treated as cleaned.
    }
  }))
}

function startShareServer() {
  shareServer = http.createServer(async (request, response) => {
    const id = request.url?.match(/^\/s\/([a-z0-9]+)/i)?.[1]
    const filePath = id ? path.join(vaultDir, `share-${id}.txt`) : null
    if (!filePath || !filePath.startsWith(vaultDir) || !fssync.existsSync(filePath)) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      response.end('This FlowDock share is no longer available.')
      return
    }
    const content = await fs.readFile(filePath, 'utf8')
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>FlowDock Share</title><style>body{margin:0;background:#f7f7f5;color:#151a22;font:16px/1.6 system-ui,sans-serif}.wrap{max-width:760px;margin:0 auto;padding:36px 24px}header{font-weight:700;color:#ff6847;margin-bottom:28px}pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #e2e2dc;padding:22px;border-radius:12px}</style></head><body><main class="wrap"><header>FlowDock · 临时分享</header><pre>${escaped}</pre></main></body></html>`)
  })
  shareServer.listen(0, '0.0.0.0', () => {
    sharePort = shareServer.address().port
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...hiddenBounds(),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
  const useDevServer = process.env.NODE_ENV === 'development' || process.argv.includes('--flowdock-dev')
  if (useDevServer) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  mainWindow.once('ready-to-show', () => {
    hideDock(true)
    mainWindow.showInactive()
  })
  mainWindow.on('blur', scheduleHide)
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape') hideDock()
  })
}

function createTray() {
  tray = new Tray(appIcon())
  tray.setToolTip('FlowDock - 临时文件中转站')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开暂存架', click: showDock },
    { type: 'separator' },
    { label: '退出 FlowDock', click: () => app.quit() },
  ]))
  tray.on('click', showDock)
}

function registerIpc() {
  ipcMain.handle('vault:get-items', () => items)
  ipcMain.handle('vault:add-file-paths', (_event, paths) => stageFilePaths(paths))
  ipcMain.handle('vault:pick-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '加入 FlowDock',
      buttonLabel: '放入暂存架',
      properties: ['openFile', 'multiSelections'],
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true, count: 0 }
    await stageFilePaths(result.filePaths)
    return { canceled: false, count: result.filePaths.length }
  })
  ipcMain.handle('vault:add-text', (_event, payload) => stageText(payload))
  ipcMain.handle('vault:remove-item', (_event, id) => removeItem(id))
  ipcMain.handle('vault:clean-expired', () => cleanExpired(true))
  ipcMain.handle('vault:open-item', async (_event, id) => {
    const item = items.find((candidate) => candidate.id === id)
    return item ? shell.openPath(item.path) : ''
  })
  ipcMain.handle('vault:reveal-item', (_event, id) => {
    const item = items.find((candidate) => candidate.id === id)
    if (item) shell.showItemInFolder(item.path)
  })
  ipcMain.handle('vault:copy-share-url', (_event, id) => {
    const item = items.find((candidate) => candidate.id === id)
    if (item?.shareUrl) clipboard.writeText(item.shareUrl)
    return item?.shareUrl || null
  })
  ipcMain.on('vault:start-drag', (event, filePath) => {
    if (filePath && filePath.startsWith(vaultDir) && fssync.existsSync(filePath)) {
      event.sender.startDrag({ file: filePath, icon: appIcon() })
    }
  })
  ipcMain.handle('app:get-preferences', () => preferences)
  ipcMain.handle('app:set-preferences', async (_event, nextPreferences) => {
    preferences = { ...preferences, ...nextPreferences }
    await persistPreferences()
    if (isDocked) hideDock()
    else showDock()
    return preferences
  })
  ipcMain.handle('app:toggle-window', () => {
    if (!mainWindow || isDocked) showDock()
    else hideDock()
  })
}

app.whenReady().then(async () => {
  await loadState()
  startShareServer()
  createWindow()
  createTray()
  registerIpc()
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (isDocked) showDock()
    else hideDock()
  })
  setInterval(() => cleanExpired(true), CLEANUP_INTERVAL).unref()
  setInterval(() => {
    if (mainWindow && isDocked && isPointAtEdge(screen.getCursorScreenPoint())) showDock()
  }, 90).unref()
})

app.on('window-all-closed', (event) => event.preventDefault())
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  shareServer?.close()
})
