import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Switch from '@radix-ui/react-switch'
import {
  Archive,
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
  FolderOpen,
  GripVertical,
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
  let fallbackItems = []
  let fallbackPreferences = { side: 'right', ttlHours: 24, imageThresholdMb: 3, autoWebp: true, autoPdf: true, autoShareText: true }
  const vaultListeners = new Set()
  const preferenceListeners = new Set()
  const notifyVault = () => vaultListeners.forEach((listener) => listener(fallbackItems))
  const notifyPreferences = () => preferenceListeners.forEach((listener) => listener(fallbackPreferences))
  const classify = (name) => /\.(png|jpe?g|webp|gif|avif)$/i.test(name) ? 'image' : /\.(txt|md|js|ts|json|css|html|py)$/i.test(name) ? 'text' : /\.pdf$/i.test(name) ? 'pdf' : 'file'
  const makeItem = (name, kind, size = 0) => ({ id: crypto.randomUUID(), name, path: '', kind, size, sourceName: name, transformations: [], createdAt: Date.now(), expiresAt: Date.now() + fallbackPreferences.ttlHours * 60 * 60 * 1000 })
  return {
    getItems: async () => fallbackItems,
    getPreferences: async () => fallbackPreferences,
    pathsFromFiles: (files) => Array.from(files).map((file) => file.name),
    addFilePaths: async (names) => { fallbackItems = [...names.map((name) => makeItem(name, classify(name))), ...fallbackItems]; notifyVault(); return fallbackItems },
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
  }
}

const api = window.flowdock || createBrowserFallback()

const filters = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'text', label: '文本' },
  { id: 'file', label: '文件' },
]

function bytes(value = 0) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(value > 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function timeLeft(timestamp) {
  const hours = Math.max(0, Math.ceil((timestamp - Date.now()) / (60 * 60 * 1000)))
  if (hours <= 1) return '不到 1 小时'
  if (hours < 24) return `${hours} 小时后`
  const days = Math.ceil(hours / 24)
  return `${days} 天后`
}

function iconFor(kind) {
  if (kind === 'image') return FileImage
  if (kind === 'text') return Code2
  if (kind === 'pdf') return FileText
  if (kind === 'archive') return FileArchive
  return File
}

function itemKindLabel(kind) {
  return { image: '图像', text: '文本', pdf: 'PDF', archive: '压缩包', file: '文件' }[kind] || '文件'
}

function actionLabel(item) {
  if (item.transformations?.some((entry) => entry.includes('WebP'))) return '已压缩'
  if (item.transformations?.some((entry) => entry.includes('合并'))) return '已合并'
  if (item.shareUrl) return '已分享'
  return '已暂存'
}

function DropArea({ onFiles, active }) {
  const inputRef = useRef(null)
  const onInputChange = async (event) => {
    const paths = api.pathsFromFiles(event.target.files)
    if (paths.length) await onFiles(paths)
    event.target.value = ''
  }

  return (
    <section className={`drop-area ${active ? 'is-active' : ''}`}>
      <div className="drop-art" aria-hidden="true">
        <div className="drop-stack drop-stack-one" />
        <div className="drop-stack drop-stack-two" />
        <div className="drop-symbol"><Upload size={21} strokeWidth={2.1} /></div>
      </div>
      <div className="drop-copy">
        <strong>{active ? '松开即可暂存' : '把文件放在这里'}</strong>
        <span>可从任意应用直接拖入</span>
      </div>
      <button className="file-pick" type="button" onClick={() => inputRef.current?.click()} title="选择本地文件">
        <Plus size={17} />
        添加
      </button>
      <input ref={inputRef} className="visually-hidden" type="file" multiple onChange={onInputChange} />
    </section>
  )
}

function FileItem({ item, expanded, onExpand, onRemove, onOpen, onReveal, onCopy, onDragStart }) {
  const Icon = iconFor(item.kind)
  const hasShare = Boolean(item.shareUrl)
  return (
    <article className={`file-item ${expanded ? 'is-expanded' : ''}`} draggable onDragStart={() => onDragStart(item.path)}>
      <button className="grab" type="button" title="拖到其他应用取出" aria-label={`拖出 ${item.name}`}>
        <GripVertical size={15} />
      </button>
      <button className={`item-icon kind-${item.kind}`} type="button" onClick={() => onOpen(item.id)} title="打开文件">
        <Icon size={21} strokeWidth={1.9} />
      </button>
      <button className="item-core" type="button" onClick={() => onExpand(item.id)}>
        <span className="item-name">{item.name}</span>
        <span className="item-details">
          <span>{bytes(item.size)}</span>
          <i />
          <span>{itemKindLabel(item.kind)}</span>
          <i />
          <span className="expiry"><Clock3 size={12} /> {timeLeft(item.expiresAt)}</span>
        </span>
      </button>
      <span className={`status status-${item.kind}`}>{actionLabel(item)}</span>
      <div className="item-menu">
        <button type="button" className="icon-button" title="更多操作" onClick={() => onExpand(item.id)}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      {expanded && (
        <div className="item-expanded">
          {item.transformations?.map((entry) => (
            <div className="process-note" key={entry}><Sparkles size={14} />{entry}</div>
          ))}
          {hasShare && (
            <div className="share-preview">
              <img src={item.qrDataUrl} alt={`${item.name} 的分享二维码`} />
              <div>
                <strong>扫码在手机打开</strong>
                <span>{item.shareUrl.replace(/^https?:\/\//, '')}</span>
                <button className="text-action" type="button" onClick={() => onCopy(item.id)}><Copy size={14} />复制链接</button>
              </div>
            </div>
          )}
          <div className="expanded-actions">
            <button type="button" onClick={() => onOpen(item.id)}><ArrowDownToLine size={15} />打开</button>
            <button type="button" onClick={() => onReveal(item.id)}><FolderOpen size={15} />在文件夹中显示</button>
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
      <header className="settings-header">
        <div><strong>暂存偏好</strong><span>所有处理都在本机完成</span></div>
        <button className="icon-button" type="button" title="关闭设置" onClick={onClose}><X size={19} /></button>
      </header>
      <section className="settings-group">
        <label className="setting-label">停靠位置</label>
        <div className="segmented-control">
          <button className={preferences.side === 'left' ? 'active' : ''} type="button" onClick={() => update({ side: 'left' })}>左侧</button>
          <button className={preferences.side === 'right' ? 'active' : ''} type="button" onClick={() => update({ side: 'right' })}>右侧</button>
        </div>
      </section>
      <section className="settings-group">
        <div className="setting-title-row"><label className="setting-label" htmlFor="ttl">保留时长</label><output>{preferences.ttlHours} 小时</output></div>
        <input id="ttl" type="range" min="1" max="168" step="1" value={preferences.ttlHours} onChange={(event) => update({ ttlHours: Number(event.target.value) })} />
        <div className="range-labels"><span>1 小时</span><span>7 天</span></div>
      </section>
      <section className="settings-group action-settings">
        <div className="setting-title-row"><label className="setting-label" htmlFor="threshold">大图阈值</label><output>{preferences.imageThresholdMb} MB</output></div>
        <input id="threshold" type="range" min="1" max="15" step="1" value={preferences.imageThresholdMb} onChange={(event) => update({ imageThresholdMb: Number(event.target.value) })} />
        <div className="rule-row"><div><ImagePlus size={17} /><span><strong>转为 WebP</strong><small>大图放入时自动压缩</small></span></div><Toggle checked={preferences.autoWebp} onCheckedChange={(autoWebp) => update({ autoWebp })} /></div>
        <div className="rule-row"><div><FileText size={17} /><span><strong>合并为 PDF</strong><small>多张图片自动打包</small></span></div><Toggle checked={preferences.autoPdf} onCheckedChange={(autoPdf) => update({ autoPdf })} /></div>
        <div className="rule-row"><div><QrCode size={17} /><span><strong>生成分享码</strong><small>文本放入时自动创建</small></span></div><Toggle checked={preferences.autoShareText} onCheckedChange={(autoShareText) => update({ autoShareText })} /></div>
      </section>
      <div className="settings-footnote"><PanelRightClose size={15} />拖到屏幕边缘或按 Ctrl + Shift + Space 呼出</div>
    </aside>
  )
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
    if (!content.trim()) return
    setCreating(true)
    await onCreate(content, title)
    setCreating(false)
    onClose()
  }
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form className="note-modal" onSubmit={submit}>
        <header><div><strong>暂存一段文本</strong><span>生成二维码，手机一扫即读</span></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></header>
        <label>名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：接口排查命令" /></label>
        <label>内容<textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴文本、代码或一段临时笔记..." /></label>
        <footer><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="submit" disabled={!content.trim() || creating}>{creating ? <LoaderCircle className="spin" size={16} /> : <QrCode size={16} />}暂存并生成码</button></footer>
      </form>
    </div>
  )
}

function App() {
  const [items, setItems] = useState([])
  const [preferences, setPreferences] = useState({ side: 'right', ttlHours: 24, imageThresholdMb: 3, autoWebp: true, autoPdf: true, autoShareText: true })
  const [dragging, setDragging] = useState(false)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    let alive = true
    Promise.all([api.getItems(), api.getPreferences()]).then(([nextItems, nextPreferences]) => {
      if (!alive) return
      setItems(nextItems)
      setPreferences(nextPreferences)
    })
    const offVault = api.onVaultChanged(setItems)
    const offPreferences = api.onPreferencesChanged(setPreferences)
    return () => { alive = false; offVault(); offPreferences() }
  }, [])

  useEffect(() => {
    const removeToast = toast ? setTimeout(() => setToast(null), 2600) : undefined
    return () => clearTimeout(removeToast)
  }, [toast])

  const stagePaths = useCallback(async (paths) => {
    if (!paths.length) return
    await api.addFilePaths(paths)
    setToast(paths.length === 1 ? '文件已放入暂存架' : `${paths.length} 个文件已放入暂存架`)
  }, [])

  const onDrop = useCallback(async (event) => {
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    await stagePaths(api.pathsFromFiles(event.dataTransfer.files))
  }, [stagePaths])

  const onDragEnter = (event) => {
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragLeave = (event) => {
    event.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) }
  }

  const visibleItems = useMemo(() => items.filter((item) => {
    const matchesFilter = filter === 'all' || item.kind === filter || (filter === 'file' && !['image', 'text'].includes(item.kind))
    const matchesQuery = item.name.toLowerCase().includes(query.trim().toLowerCase())
    return matchesFilter && matchesQuery
  }), [items, filter, query])

  const changePreferences = async (next) => {
    setPreferences(next)
    await api.setPreferences(next)
  }

  return (
    <main className="app-shell" onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onDragEnter={onDragEnter} onDragLeave={onDragLeave}>
      <div className="ambient-line" />
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Archive size={19} /></div><div><strong>FlowDock</strong><span>临时中转站</span></div></div>
        <div className="top-actions">
          <button className="icon-button" type="button" title="新建文本暂存" onClick={() => setNoteOpen(true)}><ClipboardPlus size={18} /></button>
          <button className={`icon-button ${settingsOpen ? 'is-selected' : ''}`} type="button" title="暂存偏好" onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={18} /></button>
        </div>
      </header>
      <section className="shelf-head">
        <div><h1>你的暂存架</h1><p>{items.length ? `${items.length} 个项目将在到期后自动清理` : '暂存的内容会在到期后自动清理'}</p></div>
        <div className="shelf-count"><span>{items.length}</span><small>件</small></div>
      </section>
      <DropArea onFiles={stagePaths} active={dragging} />
      <section className="filter-bar">
        <div className="filter-list" aria-label="文件筛选">
          {filters.map((entry) => <button key={entry.id} type="button" className={filter === entry.id ? 'active' : ''} onClick={() => setFilter(entry.id)}>{entry.label}</button>)}
        </div>
        <label className="search-box"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选" aria-label="筛选文件" /></label>
      </section>
      <section className="items-section">
        {visibleItems.length ? <div className="items-list">{visibleItems.map((item) => <FileItem key={item.id} item={item} expanded={expanded === item.id} onExpand={(id) => setExpanded((open) => open === id ? null : id)} onRemove={async (id) => { await api.removeItem(id); setExpanded(null); setToast('已从暂存架移除') }} onOpen={api.openItem} onReveal={api.revealItem} onCopy={async (id) => { await api.copyShareUrl(id); setToast('分享链接已复制') }} onDragStart={api.startDrag} />)}</div> : <div className="empty-state"><div className="empty-icon"><Archive size={26} /></div><strong>{items.length ? '没有匹配的暂存内容' : '暂存架还是空的'}</strong><span>{items.length ? '换一个筛选条件看看' : '拖一个文件进来，或按 + 添加'}</span></div>}
      </section>
      <footer className="statusbar"><div><span className="status-dot" />本地保险库</div><span>自动清理 · {preferences.ttlHours} 小时</span></footer>
      {settingsOpen && <SettingsPanel preferences={preferences} onChange={changePreferences} onClose={() => setSettingsOpen(false)} />}
      {noteOpen && <NewNote onClose={() => setNoteOpen(false)} onCreate={async (content, title) => { await api.addText(content, title); setToast('文本已暂存，二维码已生成') }} />}
      {dragging && <div className="drop-overlay"><div><Upload size={27} /><strong>释放以暂存</strong><span>FlowDock 会按你的规则自动处理</span></div></div>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </main>
  )
}

createRoot(document.getElementById('root')).render(<App />)
