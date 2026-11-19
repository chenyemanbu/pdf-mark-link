# PDF 标注与笔记链接

在 Obsidian 的 PDF 阅读器里高亮文字、圈选曲线、写分析批注，并把对应位置关联到已有笔记。界面为简体中文。

PDF Mark Link adds Chinese-language annotation controls to Obsidian's built-in PDF viewer. Highlight text, circle or frame figures, add comments, and navigate between PDF annotations and Markdown notes.

## 使用方法

打开知识库内的 PDF，顶部会出现五个按钮。

| 按钮 | 用途 |
| --- | --- |
| 只标注 | 给选区添加高亮或形状标记，并填写可选的分析批注 |
| 关联笔记 | 搜索已有笔记，在笔记末尾添加返回 PDF 对应标注的链接 |
| 圈选 | 拖出圆形或椭圆，标记曲线、公式、图片中的位置 |
| 框选 | 拖出矩形区域 |
| 管理标注 | 按页查看本插件创建的标注，并逐条删除 |

先选中文字，或点击「圈选」「框选」后拖动，再选择「只标注」或「关联笔记」。按 Esc 可以取消绘制。

圈选关联笔记时，可以填写分析。该分析同时保存为 PDF 批注和笔记末尾的文字。点击 PDF 圈旁的链接图标打开关联笔记，点击笔记中的链接跳回 PDF 的相应位置。

点击 PDF 标记可以查看批注。删除标注时，关联笔记中的对应链接会改为 PDF 页码链接，笔记里的文字会保留。

## 安装

当前为准备提交社区目录的桌面版本。

下载发布版的 `main.js`、`manifest.json`、`styles.css`，放进知识库的 `.obsidian/plugins/pdf-mark-link/` 文件夹，然后在「设置 → 社区插件」中启用「PDF 标注与笔记链接」。也可以解压安装 ZIP，把整个 `pdf-mark-link` 文件夹放进 `.obsidian/plugins/`。

更新前停用插件，替换上述三个文件后重新启用。

## 设备与兼容性

- 最低版本为 Obsidian 1.15.1，已在 Windows 11 的 Obsidian 1.15.1 验证。
- 构建文件采用浏览器 API，没有本机路径或 Node.js 运行时依赖，作为 Windows、macOS 和 Linux 桌面插件分发。macOS 和 Linux 尚未进行实机验收。
- 目前仅提供桌面版本，手机和平板尚未适配。
- PDF 选区定位和图标显示依赖 Obsidian 内部 PDF 阅读器的接口。Obsidian 更新后可能需要适配。
- 功能针对 PDF 标签页。Markdown 中的普通 PNG/JPEG 图片、嵌入式 PDF 和白板尚未适配。
- 本版提供新增批注和删除功能，修改已有批注可通过删除后重新标注完成。

## 数据与同步

标注以 PDF 的 Highlight、Square、Circle 标准批注写入原 PDF 文件。关联笔记使用 Markdown 链接，例如 `[[手册.pdf#page=3&annotation=233R]]`。

插件在本地读写知识库内的 PDF 和笔记。插件本身没有网络请求、遥测、云端账户或收费服务。安装和更新由 Obsidian 或用户管理。

换电脑时，需要同步 PDF、Markdown 笔记和安装插件。安装插件本身不会复制知识库内容。请先完成文件同步再继续编辑，同一份 PDF 的跨设备同时编辑由同步工具处理。

带有数字签名或加密保护的 PDF 不在当前验收范围。修改内容可能影响原文件签名。

## 从源码构建

需要 Node.js 22 或更新版本。

```sh
npm ci
npm test
npm run build
```

构建结果在 `dist/`。发布标签应与 `manifest.json` 中的版本完全一致，例如 `0.1.4`，不加 `v` 前缀。

源代码、安装说明和许可证均属于本插件。依赖的许可证会写入构建后的 `main.js` 顶部和 `THIRD_PARTY_NOTICES.md`。

## License

MIT. Copyright 2026 Flyboy.

PDF processing uses pdf-lib and its dependencies. Complete third-party licenses are included in each build.
