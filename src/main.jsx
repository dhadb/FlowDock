import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Switch from '@radix-ui/react-switch'
import {
  Archive,
  ArrowDownAZ,
  ArrowDownToLine,
  Check,
  ClipboardPlus,
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
  PanelRightClose,
  Plus,
  QrCode,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import './styles.css'

function createBrowserFallback() {
  let fallbackPreferences = { side: 'right', ttlHours: 24, imageThresholdMb: 3, autoWebp: true, autoPdf: true, autoShareText: true }
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

function FileItem({ item, index, expanded, onExpand, onRemove, onOpen, onReveal, onCopy, onDragStart, onDragEnd }) {
  const Icon = iconFor(item.kind)
  const hasShare = Boolean(item.shareUrl)
  return (
    <article className={`file-item ${expanded ? 'is-expanded' : ''}`} style={{ '--item-index': index }} draggable onDragStart={() => onDragStart(item.path)} onDragEnd={onDragEnd}>
      <div className="file-row">
        <button className="grab" type="button" title="拖到其他应用取出" aria-label={`拖出 ${item.name}`}><GripVertical size={17} /></button>
        <button className={`item-icon kind-${item.kind}`} type="button" onClick={() => onOpen(item.id)} title="打开文件"><Icon size={20} strokeWidth={2} /></button>
        <button className="item-core" type="button" onClick={() => onExpand(item.id)} onDoubleClick={() => onOpen(item.id)}>
          <span className="item-name">{item.name}</span>
          <span className="item-details"><span>{bytes(item.size)}</span><i /><span>{itemKindLabel(item.kind)}</span><i /><span className="expiry"><Clock3 size={12} />{timeLeft(item.expiresAt)}</span></span>
        </button>
        <span className={`status status-${item.kind}`}>{actionLabel(item)}</span>
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
      <section className="settings-group"><label className="setting-label">停靠位置</label><div className="segmented-control"><button className={preferences.side === 'left' ? 'active' : ''} type="button" onClick={() => update({ side: 'left' })}>左侧</button><button className={preferences.side === 'right' ? 'active' : ''} type="button" onClick={() => update({ side: 'right' })}>右侧</button></div></section>
      <section className="settings-group"><div className="setting-title-row"><label className="setting-label" htmlFor="ttl">保留时长</label><output>{preferences.ttlHours} 小时</output></div><input id="ttl" type="range" min="1" max="168" step="1" value={preferences.ttlHours} onChange={(event) => update({ ttlHours: Number(event.target.value) })} /><div className="range-labels"><span>1 小时</span><span>7 天</span></div></section>
      <section className="settings-group action-settings">
        <div className="setting-title-row"><label className="setting-label" htmlFor="threshold">大图阈值</label><output>{preferences.imageThresholdMb} MB</output></div><input id="threshold" type="range" min="1" max="15" step="1" value={preferences.imageThresholdMb} onChange={(event) => update({ imageThresholdMb: Number(event.target.value) })} />
        <Rule icon={ImagePlus} title="转为 WebP" detail="大图放入时自动压缩" checked={preferences.autoWebp} onCheckedChange={(autoWebp) => update({ autoWebp })} />
        <Rule icon={FileText} title="合并为 PDF" detail="多张图片自动打包" checked={preferences.autoPdf} onCheckedChange={(autoPdf) => update({ autoPdf })} />
        <Rule icon={QrCode} title="生成分享码" detail="文本放入时自动创建" checked={preferences.autoShareText} onCheckedChange={(autoShareText) => update({ autoShareText })} />
      </section>
      <div className="settings-footnote"><PanelRightClose size={15} />拖到屏幕边缘，或按 Ctrl + Shift + Space 呼出</div>
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

function App() {
  const [items, setItems] = useState([])
  const [preferences, setPreferences] = useState({ side: 'right', ttlHours: 24, imageThresholdMb: 3, autoWebp: true, autoPdf: true, autoShareText: true })
  const [dragging, setDragging] = useState(false)
  const [staging, setStaging] = useState(false)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState('newest')
  const [expanded, setExpanded] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [dockState, setDockState] = useState('open')
  const [motionReady, setMotionReady] = useState(false)
  const dragDepth = useRef(0)
  const searchRef = useRef(null)
  const pendingRemovals = useRef(new Map())

  useEffect(() => {
    let alive = true
    const removals = pendingRemovals.current
    const applyItems = (nextItems) => {
      setItems(nextItems.filter((item) => !removals.has(item.id)))
    }
    Promise.all([api.getItems(), api.getPreferences()]).then(([nextItems, nextPreferences]) => {
      if (!alive) return
      applyItems(nextItems)
      setPreferences(nextPreferences)
      requestAnimationFrame(() => setMotionReady(true))
    })
    const offVault = api.onVaultChanged(applyItems)
    const offPreferences = api.onPreferencesChanged(setPreferences)
    const offDockState = api.onDockState(setDockState)
    return () => {
      alive = false
      offVault(); offPreferences(); offDockState()
      removals.forEach(({ timeout }) => clearTimeout(timeout))
    }
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

  useEffect(() => {
    const onKeyDown = (event) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'o') { event.preventDefault(); pickFiles() }
      if (modifier && event.key.toLowerCase() === 'n') { event.preventDefault(); setNoteOpen(true) }
      if (modifier && event.key.toLowerCase() === 'f') { event.preventDefault(); searchRef.current?.focus() }
      if (event.key === 'Escape') { setExpanded(null); setSettingsOpen(false); setNoteOpen(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pickFiles])

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => {
      const matchesFilter = filter === 'all' || item.kind === filter || (filter === 'file' && !['image', 'text'].includes(item.kind))
      return matchesFilter && item.name.toLowerCase().includes(query.trim().toLowerCase())
    })
    return filtered.sort((left, right) => {
      if (sortMode === 'name') return left.name.localeCompare(right.name)
      if (sortMode === 'expiry') return left.expiresAt - right.expiresAt
      return right.createdAt - left.createdAt
    })
  }, [items, filter, query, sortMode])

  const removeWithUndo = (id) => {
    const item = items.find((candidate) => candidate.id === id)
    if (!item) return
    setItems((current) => current.filter((candidate) => candidate.id !== id))
    setExpanded(null)
    const timeout = setTimeout(async () => {
      pendingRemovals.current.delete(id)
      await api.removeItem(id)
    }, 5000)
    pendingRemovals.current.set(id, { item, timeout })
    setToast({ message: '已从暂存架移除', action: '撤销', itemId: id })
  }

  const undoRemoval = () => {
    const pending = toast?.itemId ? pendingRemovals.current.get(toast.itemId) : null
    if (!pending) return setToast(null)
    clearTimeout(pending.timeout)
    pendingRemovals.current.delete(toast.itemId)
    setItems((current) => [pending.item, ...current])
    setToast({ message: '已恢复到暂存架' })
  }

  const changePreferences = async (next) => {
    setPreferences(next)
    await api.setPreferences(next)
  }

  const activeSort = sortModes.find((mode) => mode.id === sortMode) || sortModes[0]
  const SortIcon = activeSort.icon
  const cycleSort = () => setSortMode((current) => sortModes[(sortModes.findIndex((mode) => mode.id === current) + 1) % sortModes.length].id)

  return (
    <main className={`app-shell dock-${dockState} ${motionReady ? 'motion-ready' : ''}`} onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true) }} onDragLeave={(event) => { event.preventDefault(); dragDepth.current -= 1; if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) } }}>
      <div className="edge-flare" aria-hidden="true" />
      <header className="topbar"><div className="brand"><div className="brand-mark"><Archive size={19} /></div><div><strong>FlowDock</strong><span>临时中转站</span></div></div><div className="top-actions"><button className="icon-button" type="button" title="暂存文本（Ctrl + N）" onClick={() => setNoteOpen(true)}><ClipboardPlus size={18} /></button><button className={`icon-button ${settingsOpen ? 'is-selected' : ''}`} type="button" title="暂存偏好" onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={18} /></button></div></header>
      <section className="shelf-head"><div><h1>先放这里</h1><p>{items.length ? `${items.length} 个暂存项会在到期后自动清理` : '把手头文件先留在一个可靠的位置'}</p></div><div className="shelf-count"><strong>{items.length}</strong><span>项</span></div></section>
      <DropShelf active={dragging} staging={staging} onPickFiles={pickFiles} onNewNote={() => setNoteOpen(true)} />
      <section className="workspace-bar"><div className="filter-list" aria-label="文件筛选">{filters.map((entry) => { const Icon = entry.icon; return <button key={entry.id} type="button" className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}><Icon size={14} /><span>{entry.label}</span></button> })}</div><div className="workspace-tools"><label className="search-box"><Search size={15} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选" aria-label="筛选文件" /></label><button className="icon-button sort-button" type="button" title={activeSort.label} onClick={cycleSort}><SortIcon size={16} /></button></div></section>
      <section className="items-section">{visibleItems.length ? <div className="items-list">{visibleItems.map((item, index) => <FileItem key={item.id} item={item} index={index} expanded={expanded === item.id} onExpand={(id) => setExpanded((open) => open === id ? null : id)} onRemove={removeWithUndo} onOpen={api.openItem} onReveal={api.revealItem} onCopy={async (id) => { await api.copyShareUrl(id); setToast({ message: '分享链接已复制' }) }} onDragStart={api.startDrag} onDragEnd={() => setDragging(false)} />)}</div> : <div className="empty-state"><div className="empty-icon"><Archive size={27} /></div><strong>{items.length ? '没有匹配的暂存内容' : '暂存架还是空的'}</strong><span>{items.length ? '换一个筛选条件看看' : '拖一个文件进来，或者使用上方添加按钮'}</span></div>}</section>
      <footer className="statusbar"><div><span className="status-dot" />本地保险库</div><span>自动清理 · {preferences.ttlHours} 小时</span></footer>
      {settingsOpen && <SettingsPanel preferences={preferences} onChange={changePreferences} onClose={() => setSettingsOpen(false)} />}
      {noteOpen && <NewNote onClose={() => setNoteOpen(false)} onCreate={async (content, title) => { setStaging(true); try { await api.addText(content, title); setToast({ message: '文本已暂存，二维码已生成' }) } finally { setStaging(false) } }} />}
      {dragging && <div className="drop-overlay"><div><div className="overlay-icon"><Upload size={28} /></div><strong>释放以暂存</strong><span>FlowDock 正在等你放下</span></div></div>}
      <Toast toast={toast} onAction={undoRemoval} />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
