# FlowDock

FlowDock 是一个面向 Windows/Linux 的临时文件中转站。它停靠在屏幕边缘，把跨应用拖放变成“先放一下，再继续”的轻量动作。

## 特性

- **边缘暂存架**：鼠标抵达设定屏幕边缘时自动滑出，也可用 `Ctrl + Shift + Space` 随时呼出。
- **跨应用拖放**：从任意应用拖入文件暂存；从文件卡片的抓手拖到目标应用即可取出。
- **丢入即处理**：超过阈值的图片自动压缩为 WebP；一次放入多张图片自动生成合并 PDF。
- **文本二维码分享**：文本和代码会启动一个临时局域网分享页，并生成可扫码访问的二维码。
- **自动老化**：项目默认 24 小时后清理，保留期限、停靠侧和各项流水线都可在应用中调整。
- **本地优先**：文件先复制到应用自己的保险库，处理过程不需要上传到第三方服务。

## 开发

```bash
npm install
npm run dev
```

开发时，Vite 运行在 `http://127.0.0.1:5173`，Electron 会自动打开应用窗口。

```bash
npm run lint
npm run build
npm run package
```

`npm run package` 通过 electron-builder 生成 Windows NSIS 安装包以及 Linux AppImage/deb 的构建配置。仅验证免安装包时可运行：

```bash
npm run package -- --dir
```

## 使用方式

1. 把文件拖到屏幕设定边缘，或者按 `Ctrl + Shift + Space` 打开 FlowDock。
2. 松开文件即可暂存。符合规则的图片、图片组与文本会立即完成相应处理。
3. 需要继续使用时，直接拖拽项目左侧抓手到另一个应用；也可展开项目后打开、定位、复制分享链接或移除。

暂存文件和元数据存放在 Electron 的 `userData/vault` 目录。删除项目或到期清理时，原暂存文件及对应的文本分享副本会一并移除。
