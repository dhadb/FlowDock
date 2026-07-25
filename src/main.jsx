import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Switch from '@radix-ui/react-switch'
import {
  Archive,
  ArrowDownAZ,
  ArrowDownToLine,
  Check,
  CheckSquare,
  ClipboardPlus,
  Command,
  Clock3,
  Code2,
  Copy,
  File,
  FileArchive,
  FileImage,
  FileText,
  FolderInput,
  FolderOpen,
  GripVertical,
  Image,
  ImagePlus,
  LoaderCircle,
  MoreHorizontal,
  Monitor,
  Moon,
  Palette,
  PanelRightClose,
  Pin,
  PinOff,
  QrCode,
  Search,
  Settings2,
  Sparkles,
  Square,
  Sun,
  TimerReset,
  Zap,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import './styles.css'

const defaultPreferences = {
  side: 'right',
  ttlHours: 24,
  imageThresholdMb: 3,
  autoWebp: true,
  autoPdf: true,
  autoShareText: true,
  theme: 'system',
  accent: 'coral',
  density: 'comfortable',
  surfaceOpacity: 100,
  motion: 'full',
  autoHideDelayMs: 1250,
}

function createBrowserFallback() {
  let fallbackPreferences = { ...defaultPreferences }
  const vaultListeners = new Set()
  const preferenceListeners = new Set()
  const classify = (name) => /\.(png|jpe?g|webp|gif|avif)$/i.test(name) ? 'image' : /\.(txt|md|js|ts|json|css|html|py)$/i.test(name) ? 'text' : /\.pdf$/i.test(name) ? 'pdf' : 'file'
  const makeItem = (name, kind, size = 0, transformations = []) => ({ id: crypto.randomUUID(), name, path: '', kind, size, sourceName: name, transformations, createdAt: Date.now(), expiresAt: Date.now() + fallbackPreferences.ttlHours * 60 * 60 * 1000 })
  let fallbackItems = new URLSearchParams(window.location.search).has('demo')
    ? [
        makeItem('launch-notes.txt', 'text', 3840, ['已生成局域网分享二维码']),
        makeItem('landing-page.webp', 'image', 1840000, ['已压缩为 WebP (6.4 MB -> 1.8 MB)']),
        makeItem('合并的图像.pdf', 'pdf', 2240000, ['已由 4 张图片自动合并']),
      ]
    : []
  const notifyVault = () => vaultListeners.forEach((listener) => listener(fallbackItems))
  const notifyPreferences = () => preferenceListeners.forEach((listener) => listener(fallbackPreferences))
  return {
    getItems: async () => fallbackItems,
    getPreferences: async () => fallbackPreferences,
    pathsFromFiles: (files) => Array.from(files).map((file) => file.name),
    addFilePaths: async (names) => { fallbackItems = [...names.map((name) => makeItem(name, classify(name))), ...fallbackItems]; notifyVault(); return fallbackItems },
    pickFiles: async () => ({ canceled: true, count: 0 }),
    addText: async (text, title) => { fallbackItems = [makeItem(`${title || '未命名笔记'}.txt`, 'text', new Blob([text]).size), ...fallbackItems]; notifyVault(); return fallbackItems },
    removeItem: async (id) => { fallbackItems = fallbackItems.filter((item) => item.id !== id); notifyVault(); return fallbackItems },
    removeItems: async (ids) => { const selected = new Set(ids); fallbackItems = fallbackItems.filter((item) => !selected.has(item.id)); notifyVault(); return fallbackItems },
    setPinned: async (ids, pinned) => { const selected = new Set(ids); fallbackItems = fallbackItems.map((item) => selected.has(item.id) ? { ...item, pinned } : item); notifyVault(); return fallbackItems },
    cleanExpired: async () => fallbackItems,
    openItem: async () => {},
    revealItem: async () => {},
    copyShareUrl: async () => null,
    startDrag: () => {},
    toggleWindow: async () => {},
    setPreferences: async (next) => { fallbackPreferences = next; notifyPreferences(); return fallbackPreferences },
    onVaultChanged: (listener) => { vaultListeners.add(listener); return () => vaultListeners.delete(listener) },
    onPreferencesChanged: (listener) => { preferenceListeners.add(listener); return () => preferenceListeners.delete(listener) },
    onDockState: () => () => {},
  }
}

const api = window.flowdock || createBrowserFallback()

const filters = [
  { id: 'all', label: '全部', icon: Archive },
  { id: 'image', label: '图片', icon: Image },
  { id: 'text', label: '文本', icon: Code2 },
  { id: 'file', label: '文件', icon: File },
]

const sortModes = [
  { id: 'newest', label: '按放入时间排序', icon: Clock3 },
  { id: 'expiry', label: '按到期时间排序', icon: Clock3 },
  { id: 'name', label: '按名称排序', icon: ArrowDownAZ },
]

function bytes(value = 0) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(value > 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function timeLeft(timestamp) {
  const hours = Math.max(0, Math.ceil((timestamp - Date.now()) / (60 * 60 * 1000)))
  if (hours <= 1) return '即将到期'
  if (hours < 24) return `${hours} 小时后`
  return `${Math.ceil(hours / 24)} 天后`
}

function iconFor(kind) {
  if (kind === 'image') return FileImage
  if (kind === 'text') return Code2
  if (kind === 'pdf') return FileText
  if (kind === 'archive') return FileArchive
  return File
}

function itemKindLabel(kind) {
  return { image: '图片', text: '文本', pdf: 'PDF', archive: '压缩包', file: '文件' }[kind] || '文件'
}

function actionLabel(item) {
  if (item.transformations?.some((entry) => entry.includes('WebP'))) return '已压缩'
  if (item.transformations?.some((entry) => entry.includes('合并'))) return '已合并'
  if (item.shareUrl) return '可扫码'
  return '已暂存'
}

function DropShelf({ active, staging, onPickFiles, onNewNote }) {
  return (
    <section className={`drop-shelf ${active ? 'is-active' : ''} ${staging ? 'is-staging' : ''}`}>
      <div className="drop-orbit" aria-hidden="true"><span /><span /><span /></div>
      <div className="drop-icon" aria-hidden="true">{staging ? <LoaderCircle className="spin" size={23} /> : <Upload size={23} />}</div>
      <div className="drop-copy">
        <strong>{staging ? '正在放入暂存架' : active ? '松开，FlowDock 来接手' : '把文件先放这里'}</strong>
        <span>{staging ? '正在复制并按规则处理' : '拖入、选择，或暂存一段文本'}</span>
      </div>
      <div className="drop-actions">
        <button className="quick-button primary" type="button" onClick={onPickFiles} disabled={staging} title="选择文件（Ctrl + O）"><FolderInput size={17} />添加</button>
        <button className="quick-button" type="button" onClick={onNewNote} disabled={staging} title="暂存文本（Ctrl + N）"><ClipboardPlus size={17} /></button>
      </div>
    </section>
  )
}

function FileItem({ item, index, expanded, selectable, selected, onSelect, onExpand, onRemove, onOpen, onReveal, onCopy, onTogglePinned, onDragStart, onDragEnd }) {
  const Icon = iconFor(item.kind)
  const hasShare = Boolean(item.shareUrl)
  return (
    <article className={`file-item ${expanded ? 'is-expanded' : ''} ${selected ? 'is-selected' : ''}`} style={{ '--item-index': index }} draggable onDragStart={() => onDragStart(item.path)} onDragEnd={onDragEnd}>
      <div className="file-row">
        {selectable && <button className="select-button" type="button" aria-label={selected ? `取消选择 ${item.name}` : `选择 ${item.name}`} aria-pressed={selected} onClick={() => onSelect(item.id)}>{selected ? <CheckSquare size={16} /> : <Square size={16} />}</button>}
        <button className="grab" type="button" title="拖到其他应用取出" aria-label={`拖出 ${item.name}`}><GripVertical size={17} /></button>
        <button className={`item-icon kind-${item.kind}`} type="button" onClick={() => onOpen(item.id)} title="打开文件"><Icon size={20} strokeWidth={2} /></button>
        <button className="item-core" type="button" onClick={() => onExpand(item.id)} onDoubleClick={() => onOpen(item.id)}>
          <span className="item-name">{item.name}</span>
          <span className="item-details"><span>{bytes(item.size)}</span><i /><span>{itemKindLabel(item.kind)}</span><i /><span className="expiry">{item.pinned ? <Pin size={12} /> : <Clock3 size={12} />}{item.pinned ? '固定保留' : timeLeft(item.expiresAt)}</span></span>
        </button>
        <span className={`status status-${item.kind}`}>{item.pinned && <Pin size={10} />}{actionLabel(item)}</span>
        <div className="item-actions">
          {hasShare && <button className="mini-button" type="button" title="复制分享链接" onClick={() => onCopy(item.id)}><Copy size={15} /></button>}
          <button className={`mini-button ${expanded ? 'is-selected' : ''}`} type="button" title="更多操作" onClick={() => onExpand(item.id)}><MoreHorizontal size={18} /></button>
        </div>
      </div>
      {expanded && (
        <div className="item-expanded">
          <div className="expanded-meta">
            <div className="flow-note"><Sparkles size={14} /><span>{item.transformations?.[0] || '已安全放入本地保险库'}</span></div>
            {hasShare && <div className="share-preview"><img src={item.qrDataUrl} alt={`${item.name} 的分享二维码`} /><div><strong>扫码在手机上打开</strong><span>{item.shareUrl.replace(/^https?:\/\//, '')}</span><button className="text-action" type="button" onClick={() => onCopy(item.id)}><Copy size={13} />复制链接</button></div></div>}
          </div>
          <div className="expanded-actions">
            <button type="button" onClick={() => onOpen(item.id)}><ArrowDownToLine size={15} />打开</button>
            <button type="button" onClick={() => onReveal(item.id)}><FolderOpen size={15} />显示位置</button>
            <button type="button" onClick={() => onTogglePinned(item.id)}>{item.pinned ? <PinOff size={15} /> : <Pin size={15} />}{item.pinned ? '取消固定' : '固定保留'}</button>
            <button type="button" className="danger-action" onClick={() => onRemove(item.id)}><Trash2 size={15} />移除</button>
          </div>
        </div>
      )}
    </article>
  )
}

function SettingsPanel({ preferences, onChange, onClose }) {
  const update = (changes) => onChange({ ...preferences, ...changes })
  return (
    <aside className="settings-panel">
      <header className="settings-header"><div><strong>暂存偏好</strong><span>处理和文件都留在你的设备上</span></div><button className="icon-button" type="button" title="关闭设置" onClick={onClose}><X size={19} /></button></header>
      <div className="settings-scroll">
        <section className="settings-group"><div className="setting-section-title"><Palette size={15} />外观</div><label className="setting-label">主题</label><div className="segmented-control three"><button className={preferences.theme === 'system' ? 'active' : ''} type="button" onClick={() => update({ theme: 'system' })}><Monitor size={13} />跟随系统</button><button className={preferences.theme === 'light' ? 'active' : ''} type="button" onClick={() => update({ theme: 'light' })}><Sun size={13} />浅色</button><button className={preferences.theme === 'dark' ? 'active' : ''} type="button" onClick={() => update({ theme: 'dark' })}><Moon size={13} />深色</button></div>
          <div className="setting-label setting-label-spaced">强调色</div><div className="accent-options"><button className={`accent-swatch coral ${preferences.accent === 'coral' ? 'active' : ''}`} type="button" aria-label="珊瑚橙" title="珊瑚橙" onClick={() => update({ accent: 'coral' })} /><button className={`accent-swatch mint ${preferences.accent === 'mint' ? 'active' : ''}`} type="button" aria-label="薄荷绿" title="薄荷绿" onClick={() => update({ accent: 'mint' })} /><button className={`accent-swatch sky ${preferences.accent === 'sky' ? 'active' : ''}`} type="button" aria-label="天空蓝" title="天空蓝" onClick={() => update({ accent: 'sky' })} /></div>
          <div className="setting-title-row setting-label-spaced"><label className="setting-label">界面密度</label></div><div className="segmented-control"><button className={preferences.density === 'comfortable' ? 'active' : ''} type="button" onClick={() => update({ density: 'comfortable' })}>舒适</button><button className={preferences.density === 'compact' ? 'active' : ''} type="button" onClick={() => update({ density: 'compact' })}>紧凑</button></div>
          <div className="setting-title-row setting-label-spaced"><label className="setting-label" htmlFor="opacity">浮层透明度</label><output>{preferences.surfaceOpacity}%</output></div><input id="opacity" type="range" min="82" max="100" step="1" value={preferences.surfaceOpacity} onChange={(event) => update({ surfaceOpacity: Number(event.target.value) })} /><div className="range-labels"><span>通透</span><span>实体</span></div>
        </section>
        <section className="settings-group"><div className="setting-section-title"><PanelRightClose size={15} />停靠与清理</div><label className="setting-label">停靠位置</label><div className="segmented-control"><button className={preferences.side === 'left' ? 'active' : ''} type="button" onClick={() => update({ side: 'left' })}>左侧</button><button className={preferences.side === 'right' ? 'active' : ''} type="button" onClick={() => update({ side: 'right' })}>右侧</button></div>
          <div className="setting-title-row setting-label-spaced"><label className="setting-label" htmlFor="hide-delay">失焦后隐匿</label><output>{(preferences.autoHideDelayMs / 1000).toFixed(1)} 秒</output></div><input id="hide-delay" type="range" min="300" max="3000" step="100" value={preferences.autoHideDelayMs} onChange={(event) => update({ autoHideDelayMs: Number(event.target.value) })} /><div className="range-labels"><span>快速</span><span>从容</span></div>
          <div className="setting-title-row setting-label-spaced"><label className="setting-label" htmlFor="ttl">保留时长</label><output>{preferences.ttlHours} 小时</output></div><input id="ttl" type="range" min="1" max="168" step="1" value={preferences.ttlHours} onChange={(event) => update({ ttlHours: Number(event.target.value) })} /><div className="range-labels"><span>1 小时</span><span>7 天</span></div>
        </section>
        <section className="settings-group action-settings"><div className="setting-section-title"><Zap size={15} />自动处理</div>
        <div className="setting-title-row"><label className="setting-label" htmlFor="threshold">大图阈值</label><output>{preferences.imageThresholdMb} MB</output></div><input id="threshold" type="range" min="1" max="15" step="1" value={preferences.imageThresholdMb} onChange={(event) => update({ imageThresholdMb: Number(event.target.value) })} />
        <Rule icon={ImagePlus} title="转为 WebP" detail="大图放入时自动压缩" checked={preferences.autoWebp} onCheckedChange={(autoWebp) => update({ autoWebp })} />
        <Rule icon={FileText} title="合并为 PDF" detail="多张图片自动打包" checked={preferences.autoPdf} onCheckedChange={(autoPdf) => update({ autoPdf })} />
        <Rule icon={QrCode} title="生成分享码" detail="文本放入时自动创建" checked={preferences.autoShareText} onCheckedChange={(autoShareText) => update({ autoShareText })} />
        </section>
        <section className="settings-group"><div className="setting-section-title"><Sparkles size={15} />动效</div><label className="setting-label">动画强度</label><div className="segmented-control"><button className={preferences.motion === 'full' ? 'active' : ''} type="button" onClick={() => update({ motion: 'full' })}>细腻</button><button className={preferences.motion === 'reduced' ? 'active' : ''} type="button" onClick={() => update({ motion: 'reduced' })}>简洁</button></div></section>
      </div>
      <div className="settings-footnote"><TimerReset size={15} />拖到屏幕边缘，或按 Ctrl + Shift + Space 呼出</div>
    </aside>
  )
}

function Rule({ icon: Icon, title, detail, checked, onCheckedChange }) {
  return <div className="rule-row"><div><Icon size={17} /><span><strong>{title}</strong><small>{detail}</small></span></div><Toggle checked={checked} onCheckedChange={onCheckedChange} /></div>
}

function Toggle({ checked, onCheckedChange }) {
  return <Switch.Root className="switch-root" checked={checked} onCheckedChange={onCheckedChange}><Switch.Thumb className="switch-thumb" /></Switch.Root>
}

function NewNote({ onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [creating, setCreating] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    if (!content.trim() || creating) return
    setCreating(true)
    await onCreate(content, title)
    setCreating(false)
    onClose()
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form className="note-modal" onSubmit={submit}><header><div><strong>暂存一段文本</strong><span>生成二维码，手机一扫即读</span></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></header><label>名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：接口排查命令" /></label><label>内容<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴文本、代码或一段临时笔记..." /></label><footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!content.trim() || creating}>{creating ? <LoaderCircle className="spin" size={16} /> : <QrCode size={16} />}暂存并生成码</button></footer></form></div>
}

function Toast({ toast, onAction }) {
  if (!toast) return null
  return <div className="toast"><Check size={16} /><span>{toast.message}</span>{toast.action && <button type="button" onClick={onAction}>{toast.action}</button>}</div>
}

function CommandPalette({ open, onClose, commands }) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const visibleCommands = commands.filter((command) => `${command.label} ${command.hint || ''}`.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  if (!open) return null
  const run = (command) => { command.run(); onClose() }
  return <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="command-palette" role="dialog" aria-label="命令面板"><div className="command-search"><Command size={17} /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }} onKeyDown={(event) => { if (event.key === 'Escape') onClose(); if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, visibleCommands.length - 1)) } if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)) } if (event.key === 'Enter' && visibleCommands[activeIndex]) { event.preventDefault(); run(visibleCommands[activeIndex]) } }} placeholder="输入命令…" aria-label="搜索命令" /></div><div className="command-list">{visibleCommands.length ? visibleCommands.map((command, index) => { const Icon = command.icon; return <button key={command.id} className={`command-item ${index === activeIndex ? 'active' : ''}`} type="button" onMouseEnter={() => setActiveIndex(index)} onClick={() => run(command)}><span className="command-icon"><Icon size={16} /></span><span><strong>{command.label}</strong>{command.hint && <small>{command.hint}</small>}</span></button> }) : <div className="command-empty">没有匹配的命令</div>}</div></div></div>
}

function App() {
  const [items, setItems] = useState([])
  const [preferences, setPreferences] = useState({ ...defaultPreferences })
  const [dragging, setDragging] = useState(false)
  const [staging, setStaging] = useState(false)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState('newest')
  const [expanded, setExpanded] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [dockState, setDockState] = useState('open')
  const [motionReady, setMotionReady] = useState(false)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false)
  const dragDepth = useRef(0)
  const searchRef = useRef(null)
  const pendingRemovals = useRef(new Map())
  const preferenceTimer = useRef()

  useEffect(() => {
    let alive = true
    const removals = pendingRemovals.current
    const applyItems = (nextItems) => {
      const pendingIds = new Set([...removals.values()].flatMap((batch) => batch.items.map((item) => item.id)))
      setItems(nextItems.filter((item) => !pendingIds.has(item.id)))
    }
    Promise.all([api.getItems(), api.getPreferences()]).then(([nextItems, nextPreferences]) => {
      if (!alive) return
      applyItems(nextItems)
      setPreferences({ ...defaultPreferences, ...nextPreferences })
      requestAnimationFrame(() => setMotionReady(true))
    })
    const offVault = api.onVaultChanged(applyItems)
    const offPreferences = api.onPreferencesChanged((next) => setPreferences({ ...defaultPreferences, ...next }))
    const offDockState = api.onDockState(setDockState)
    return () => {
      alive = false
      offVault(); offPreferences(); offDockState()
      removals.forEach(({ timeout }) => clearTimeout(timeout))
      clearTimeout(preferenceTimer.current)
    }
  }, [])

  useEffect(() => {
    const queryList = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!queryList) return undefined
    const update = (event) => setSystemDark(event.matches)
    queryList.addEventListener('change', update)
    return () => queryList.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const clearToast = toast ? setTimeout(() => setToast(null), toast.action ? 5200 : 2600) : undefined
    return () => clearTimeout(clearToast)
  }, [toast])

  const stagePaths = useCallback(async (paths) => {
    if (!paths.length || staging) return
    setStaging(true)
    try {
      await api.addFilePaths(paths)
      setToast({ message: paths.length === 1 ? '已放入暂存架' : `${paths.length} 个文件已放入暂存架` })
    } catch {
      setToast({ message: '放入失败，请再试一次' })
    } finally {
      setStaging(false)
    }
  }, [staging])

  const pickFiles = useCallback(async () => {
    if (staging) return
    const result = await api.pickFiles()
    if (!result?.canceled && result?.count) setToast({ message: result.count === 1 ? '已放入暂存架' : `${result.count} 个文件已放入暂存架` })
  }, [staging])

  const onDrop = useCallback(async (event) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    await stagePaths(api.pathsFromFiles(event.dataTransfer.files))
  }, [stagePaths])

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesFilter = filter === 'all' || item.kind === filter || (filter === 'file' && !['image', 'text'].includes(item.kind))
      return matchesFilter && item.name.toLowerCase().includes(query.trim().toLowerCase())
    })
    return [...filtered].sort((left, right) => {
      if (sortMode === 'name') return left.name.localeCompare(right.name)
      if (sortMode === 'expiry') return left.expiresAt - right.expiresAt
      return right.createdAt - left.createdAt
    })
  }, [items, filter, query, sortMode])

  useEffect(() => {
    const onKeyDown = (event) => {
      const modifier = event.metaKey || event.ctrlKey
      const key = event.key.toLowerCase()
      if (modifier && key === 'o') { event.preventDefault(); pickFiles() }
      if (modifier && key === 'n') { event.preventDefault(); setNoteOpen(true) }
      if (modifier && key === 'f') { event.preventDefault(); searchRef.current?.focus() }
      if (modifier && key === 'k') { event.preventDefault(); setCommandOpen(true) }
      if (modifier && key === 'a' && selectionMode) { event.preventDefault(); setSelectedIds(new Set(visibleItems.map((item) => item.id))) }
      if (event.key === 'Escape') {
        if (commandOpen) setCommandOpen(false)
        else { setExpanded(null); setSettingsOpen(false); setNoteOpen(false); setSelectionMode(false); setSelectedIds(new Set()) }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pickFiles, selectionMode, visibleItems, commandOpen])

  const toggleSelection = (id) => setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const toggleSelectionMode = () => { setSelectionMode((current) => !current); setSelectedIds(new Set()) }

  const removeWithUndo = (idsOrId) => {
    const ids = Array.isArray(idsOrId) ? idsOrId : [idsOrId]
    const removedItems = items.filter((item) => ids.includes(item.id))
    if (!removedItems.length) return
    const batchKey = crypto.randomUUID()
    setItems((current) => current.filter((item) => !ids.includes(item.id)))
    setSelectedIds(new Set())
    setExpanded(null)
    const timeout = setTimeout(async () => {
      pendingRemovals.current.delete(batchKey)
      await api.removeItems(ids)
    }, 5000)
    pendingRemovals.current.set(batchKey, { items: removedItems, timeout })
    setToast({ message: ids.length === 1 ? '已从暂存架移除' : `已移除 ${ids.length} 项`, action: '撤销', batchKey })
  }

  const undoRemoval = () => {
    const pending = toast?.batchKey ? pendingRemovals.current.get(toast.batchKey) : null
    if (!pending) return setToast(null)
    clearTimeout(pending.timeout)
    pendingRemovals.current.delete(toast.batchKey)
    setItems((current) => [...pending.items, ...current])
    setToast({ message: pending.items.length === 1 ? '已恢复到暂存架' : `已恢复 ${pending.items.length} 项` })
  }

  const togglePinned = async (id) => {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) return
    const pinned = !item.pinned
    setItems((current) => current.map((candidate) => candidate.id === id ? { ...candidate, pinned } : candidate))
    await api.setPinned([id], pinned)
    setToast({ message: pinned ? '已固定，暂不自动清理' : '已恢复自动清理' })
  }

  const pinSelected = async (pinned) => {
    const ids = [...selectedIds]
    if (!ids.length) return
    setItems((current) => current.map((item) => ids.includes(item.id) ? { ...item, pinned } : item))
    await api.setPinned(ids, pinned)
    setToast({ message: pinned ? `已固定 ${ids.length} 项` : `已恢复 ${ids.length} 项自动清理` })
  }

  const cleanExpiredNow = async () => {
    const before = items.length
    const nextItems = await api.cleanExpired()
    setItems(nextItems)
    setToast({ message: before === nextItems.length ? '没有需要清理的项目' : `已清理 ${before - nextItems.length} 项过期内容` })
  }

  const changePreferences = (next) => {
    setPreferences({ ...defaultPreferences, ...next })
    clearTimeout(preferenceTimer.current)
    preferenceTimer.current = setTimeout(() => api.setPreferences(next).catch(() => setToast({ message: '偏好保存失败' })), 140)
  }

  const commands = [
    { id: 'add', label: '添加文件', icon: FolderInput, run: pickFiles },
    { id: 'note', label: '暂存文本', icon: ClipboardPlus, run: () => setNoteOpen(true) },
    { id: 'search', label: '筛选暂存项', icon: Search, run: () => searchRef.current?.focus() },
    { id: 'select', label: '批量选择', icon: CheckSquare, run: toggleSelectionMode },
    { id: 'clean', label: '清理过期内容', icon: TimerReset, run: cleanExpiredNow },
    { id: 'settings', label: '打开偏好', icon: Settings2, run: () => setSettingsOpen(true) },
  ]

  const activeSort = sortModes.find((mode) => mode.id === sortMode) || sortModes[0]
  const SortIcon = activeSort.icon
  const cycleSort = () => setSortMode((current) => sortModes[(sortModes.findIndex((mode) => mode.id === current) + 1) % sortModes.length].id)
  const selectedCount = selectedIds.size
  const activeTheme = preferences.theme === 'system' ? (systemDark ? 'dark' : 'light') : preferences.theme
  const appClass = `app-shell dock-${dockState} theme-${activeTheme} accent-${preferences.accent} density-${preferences.density} motion-${preferences.motion} ${selectionMode ? 'selection-mode' : ''} ${motionReady ? 'motion-ready' : ''}`

  return (
    <main className={appClass} style={{ '--surface-opacity': preferences.surfaceOpacity / 100 }} onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true) }} onDragLeave={(event) => { event.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }}>
      <div className="edge-flare" aria-hidden="true" />
      <header className="topbar"><div className="brand"><div className="brand-mark"><Archive size={19} /></div><div><strong>FlowDock</strong><span>临时中转站</span></div></div><div className="top-actions"><button className="icon-button" type="button" title="命令面板（Ctrl + K）" onClick={() => setCommandOpen(true)}><Command size={18} /></button><button className={`icon-button ${selectionMode ? 'is-selected' : ''}`} type="button" title="批量选择" onClick={toggleSelectionMode}><CheckSquare size={18} /></button><button className="icon-button" type="button" title="暂存文本（Ctrl + N）" onClick={() => setNoteOpen(true)}><ClipboardPlus size={18} /></button><button className={`icon-button ${settingsOpen ? 'is-selected' : ''}`} type="button" title="暂存偏好" onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={18} /></button></div></header>
      <section className="shelf-head"><div><h1>先放这里</h1><p>{items.length ? `${items.length} 个暂存项${items.some((item) => item.pinned) ? ' · 已固定项不会过期' : '会在到期后自动清理'}` : '把手头文件先留在一个可靠的位置'}</p></div><div className="shelf-count"><strong>{items.length}</strong><span>项</span></div></section>
      <DropShelf active={dragging} staging={staging} onPickFiles={pickFiles} onNewNote={() => setNoteOpen(true)} />
      <section className="workspace-bar"><div className="filter-list" aria-label="文件筛选">{filters.map((entry) => { const Icon = entry.icon; return <button key={entry.id} type="button" className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}><Icon size={14} /><span>{entry.label}</span></button> })}</div><div className="workspace-tools"><label className="search-box"><Search size={15} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选" aria-label="筛选文件" /></label><button className="icon-button sort-button" type="button" title={activeSort.label} onClick={cycleSort}><SortIcon size={16} /></button></div></section>
      {selectionMode && <div className="selection-toolbar"><div><strong>{selectedCount}</strong><span>已选择</span></div><button type="button" disabled={!selectedCount} onClick={() => pinSelected(true)}><Pin size={14} />固定</button><button type="button" disabled={!selectedCount} onClick={() => pinSelected(false)}><PinOff size={14} />恢复清理</button><button className="selection-danger" type="button" disabled={!selectedCount} onClick={() => removeWithUndo([...selectedIds])}><Trash2 size={14} />移除</button><button className="selection-close" type="button" title="退出批量选择" onClick={toggleSelectionMode}><X size={15} /></button></div>}
      <section className="items-section">{visibleItems.length ? <div className="items-list">{visibleItems.map((item, index) => <FileItem key={item.id} item={item} index={index} selectable={selectionMode} selected={selectedIds.has(item.id)} onSelect={toggleSelection} expanded={expanded === item.id} onExpand={(id) => setExpanded((open) => open === id ? null : id)} onRemove={removeWithUndo} onTogglePinned={togglePinned} onOpen={api.openItem} onReveal={api.revealItem} onCopy={async (id) => { await api.copyShareUrl(id); setToast({ message: '分享链接已复制' }) }} onDragStart={api.startDrag} onDragEnd={() => setDragging(false)} />)}</div> : <div className="empty-state"><div className="empty-icon"><Archive size={27} /></div><strong>{items.length ? '没有匹配的暂存内容' : '暂存架还是空的'}</strong><span>{items.length ? '换一个筛选条件看看' : '拖一个文件进来，或者使用上方添加按钮'}</span></div>}</section>
      <footer className="statusbar"><div><span className="status-dot" />本地保险库</div><span>自动清理 · {preferences.ttlHours} 小时</span></footer>
      {settingsOpen && <SettingsPanel preferences={preferences} onChange={changePreferences} onClose={() => setSettingsOpen(false)} />}
      {noteOpen && <NewNote onClose={() => setNoteOpen(false)} onCreate={async (content, title) => { setStaging(true); try { await api.addText(content, title); setToast({ message: '文本已暂存，二维码已生成' }) } finally { setStaging(false) } }} />}
      {dragging && <div className="drop-overlay"><div><div className="overlay-icon"><Upload size={28} /></div><strong>释放以暂存</strong><span>FlowDock 正在等你放下</span></div></div>}
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} commands={commands} />
      <Toast toast={toast} onAction={undoRemoval} />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
