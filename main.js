const { FuzzySuggestModal, Modal, Notice, Plugin, parseLinktext, setIcon } = require("obsidian");
const { annotatePdf, listAnnotations, deleteAnnotation } = require("./pdf-annotations");
const { toPageLinks } = require("./note-links");

const PAGE = ".page[data-page-number]";
const ANNOTATIONS = ".annotationLayer section[data-annotation-id]";

class NotePicker extends FuzzySuggestModal {
  constructor(app, items, choose) {
    super(app);
    this.items = items;
    this.choose = choose;
    this.setPlaceholder("搜索已有笔记…");
    this.emptyStateText = "找不到匹配的笔记";
  }

  getItems() { return this.items; }
  getItemText(note) { return note.path.replace(/\.md$/, ""); }
  onChooseItem(note) { this.choose(note); }
}

class CommentModal extends Modal {
  constructor(app, save, note) {
    super(app);
    this.save = save;
    this.note = note;
  }

  onOpen() {
    this.setTitle(this.note ? "关联到「" + this.note.basename + "」" : "只标注 PDF");
    const form = this.contentEl.createEl("form", { cls: "pml-comment" });
    const field = form.createEl("textarea", {
      attr: { placeholder: "写下这处曲线、数据或图片的分析，也可以留空", "aria-label": "分析或批注", rows: 5 },
    });
    form.createEl("button", { text: this.note ? "保存并关联" : "保存到 PDF", cls: "mod-cta", attr: { type: "submit" } });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.close();
      this.save(field.value.trim());
    });
    field.focus();
  }
}

class AnnotationManager extends Modal {
  constructor(plugin, file) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
  }

  onOpen() {
    this.setTitle("管理标注 · " + this.file.basename);
    this.contentEl.addClass("pml-manager");
    this.render();
  }

  async render() {
    this.contentEl.empty();
    const status = this.contentEl.createEl("p", { text: "正在读取标注…" });
    try {
      const annotations = await listAnnotations(await this.app.vault.readBinary(this.file));
      status.setText(annotations.length ? "选择一条标注进行删除。" : "这份 PDF 暂无本插件创建的标注。");
      for (const annotation of annotations) {
        const row = this.contentEl.createDiv("pml-annotation-row");
        row.createDiv({ text: "第 " + annotation.pageNumber + " 页 · " + annotation.type });
        row.createDiv({ cls: "pml-annotation-comment", text: annotation.comment || "未填写批注" });
        const button = row.createEl("button", { text: "删除", cls: "mod-warning" });
        button.addEventListener("click", () => {
          const confirm = new Modal(this.app);
          confirm.setTitle("删除这条标注？");
          confirm.contentEl.createEl("p", {
            text: "关联笔记中的对应链接会改为该 PDF 的页码链接。",
          });
          const actions = confirm.contentEl.createDiv("modal-button-container");
          actions.createEl("button", { text: "取消" }).addEventListener("click", () => confirm.close());
          const remove = actions.createEl("button", { text: "删除标注", cls: "mod-warning" });
          remove.addEventListener("click", async () => {
            remove.disabled = true;
            try {
              await this.plugin.removeAnnotation(this.file, annotation);
              confirm.close();
              await this.render();
            } catch (error) {
              new Notice(error.message, 8000);
              remove.disabled = false;
            }
          });
          confirm.open();
        });
      }
    } catch (error) {
      status.setText("读取标注失败：" + error.message);
    }
  }
}

module.exports = class PdfMarkLink extends Plugin {
  onload() {
    this.views = new Map();
    this.regions = new Map();
    this.writing = new Set();
    this.addCommand({
      id: "mark-area",
      name: "框选 PDF 图表",
      checkCallback: (checking) => {
        const view = this.app.workspace.activeLeaf?.view;
        if (view?.getViewType() !== "pdf") return false;
        if (!checking) this.arm(view);
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on("layout-change", () => this.refreshViews()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.refreshViews()));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.syncAllButtons()));
    this.registerEvent(this.app.metadataCache.on("resolve", () => this.syncAllButtons()));
    this.app.workspace.onLayoutReady(() => this.refreshViews());
  }

  onunload() {
    this.area?.cancel?.();
    this.dismissPopover?.();
    if (this.refreshTimer) window.cancelAnimationFrame(this.refreshTimer);
    for (const view of this.views.keys()) this.detach(view);
  }

  refreshViews() {
    const live = new Set(this.app.workspace.getLeavesOfType("pdf").map((leaf) => leaf.view));
    for (const view of this.views.keys()) {
      if (!live.has(view)) this.detach(view);
    }
    for (const view of live) {
      if (!this.views.has(view)) this.attach(view);
      this.syncButtons(view);
    }
  }

  attach(view) {
    const root = view.containerEl;
    const toolbar = view.actionsEl.createDiv({ cls: "pml-toolbar", attr: { role: "group", "aria-label": "PDF 标注工具" } });
    view.actionsEl.prepend(toolbar);
    const addAction = (label, title, action) => {
      const button = toolbar.createEl("button", { text: label, attr: { type: "button", title } });
      // Keep the PDF text selection when taking an action with the mouse.
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", action);
      return button;
    };
    const withSelection = (linkNote) => {
      if (this.regions.has(view) && !this.regions.get(view).preview.isConnected) this.clearRegion(view);
      const target = this.regions.get(view) ?? this.textAnchor(view);
      if (!target || target.file !== view.file || target.mtime !== view.file.stat.mtime) {
        this.clearRegion(view);
        if (target !== null) new Notice("请先选中文字，或用「圈选」「框选」标记一个区域。");
        return;
      }
      this.openAction(view, target, linkNote);
    };
    addAction("只标注", "把选中的文字或区域标注写入 PDF", () => withSelection(false));
    addAction("关联笔记", "高亮选区并关联已有笔记", () => withSelection(true));
    for (const [shape, label] of [["circle", "圈选"], ["rectangle", "框选"]]) {
      const button = addAction(label, "拖动" + label + "图表或其他区域", () => {
        if (this.area?.view === view && this.area.shape === shape) this.area.cancel();
        else this.arm(view, shape);
      });
      button.classList.add("pml-area-button");
      button.dataset.shape = shape;
      button.setAttribute("aria-pressed", "false");
    }
    addAction("管理标注", "查看和删除 PDF 中已保存的标注", () => {
      this.dismissPopover?.();
      if (view.file) new AnnotationManager(this, view.file).open();
    });
    const onPointerDown = (event) => {
      if (event.target.closest(PAGE)) this.clearRegion(view);
    };
    const onPointerUp = (event) => {
      if (!event.target.closest(PAGE) || this.area?.view === view || this.regions.has(view)) return;
      const target = this.textAnchor(view);
      if (target) this.showActions(view, target);
    };
    const observer = new MutationObserver((records) => {
      const layerChanged = records.some((record) => [...record.addedNodes].some((node) =>
        node.nodeType === 1 && !node.classList.contains("pml-backlink") &&
        (node.matches(".annotationLayer, .annotationLayer section") || node.querySelector(".annotationLayer")),
      ));
      if (layerChanged) this.syncButtons(view);
    });
    root.addEventListener("pointerdown", onPointerDown);
    root.addEventListener("pointerup", onPointerUp);
    observer.observe(root, { childList: true, subtree: true });
    this.views.set(view, () => {
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointerup", onPointerUp);
      observer.disconnect();
      toolbar.remove();
      root.querySelectorAll(".pml-backlink").forEach((button) => button.remove());
    });
  }

  detach(view) {
    if (this.area?.view === view) this.area.cancel?.();
    this.clearRegion(view);
    this.views.get(view)?.();
    this.views.delete(view);
  }

  textAnchor(view) {
    const root = view.containerEl;
    const selection = root.ownerDocument.getSelection();
    if (!selection?.rangeCount || selection.isCollapsed || !selection.toString().trim()) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const start = range.startContainer.parentElement?.closest(".textLayer");
    const end = range.endContainer.parentElement?.closest(".textLayer");
    if (!start || !end) return;
    if (start !== end) {
      new Notice("请一次标注一页。");
      return null;
    }
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    return this.anchor(view, start.closest(PAGE), start, rects, false);
  }

  clearRegion(view) {
    this.regions.get(view)?.preview.remove();
    this.regions.delete(view);
  }

  anchor(view, page, layer, rects, area) {
    const pageNumber = Number(page?.dataset.pageNumber);
    const viewer = view.viewer?.child?.pdfViewer?.pdfViewer;
    const viewport = viewer?.getPageView?.(pageNumber - 1)?.viewport;
    const bounds = layer.getBoundingClientRect();
    if (!viewport || !view.file || !rects.length || !bounds.width || !bounds.height) {
      new Notice("无法取得 PDF 选区位置，请重新选择。");
      return null;
    }

    const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
    const convert = (x, y) => viewport.convertToPdfPoint(
      (clamp(x, bounds.left, bounds.right) - bounds.left) / bounds.width * viewport.width,
      (clamp(y, bounds.top, bounds.bottom) - bounds.top) / bounds.height * viewport.height,
    );
    const quads = rects.map(({ left, top, right, bottom }) => [
      ...convert(left, top), ...convert(right, top),
      ...convert(left, bottom), ...convert(right, bottom),
    ]);
    return { file: view.file, pageNumber, quads, area, position: rects.at(-1), mtime: view.file.stat.mtime };
  }

  arm(view, shape = "rectangle") {
    this.area?.cancel?.();
    this.dismissPopover?.();
    this.clearRegion(view);
    const root = view.containerEl;
    const doc = root.ownerDocument;
    const frameButton = view.actionsEl.querySelector('.pml-area-button[data-shape="' + shape + '"]');
    doc.getSelection()?.removeAllRanges();
    let start;
    let frame;
    const box = (event) => {
      const bounds = start.layer.getBoundingClientRect();
      const x = Math.max(bounds.left, Math.min(bounds.right, event.clientX));
      const y = Math.max(bounds.top, Math.min(bounds.bottom, event.clientY));
      return new DOMRect(Math.min(x, start.x), Math.min(y, start.y), Math.abs(x - start.x), Math.abs(y - start.y));
    };
    const move = (event) => {
      if (!start) return;
      const { x, y, width, height } = box(event);
      Object.assign(frame.style, { left: x + "px", top: y + "px", width: width + "px", height: height + "px" });
    };
    const cancel = () => {
      frameButton?.setAttribute("aria-pressed", "false");
      root.classList.remove("pml-area");
      root.removeEventListener("pointerdown", down, true);
      doc.removeEventListener("pointermove", move, true);
      doc.removeEventListener("pointerup", up, true);
      doc.removeEventListener("pointercancel", cancel);
      doc.removeEventListener("keydown", escape, true);
      frame?.remove();
      if (this.area?.view === view) this.area = undefined;
    };
    const down = (event) => {
      const page = event.target.closest(PAGE);
      const layer = page?.querySelector(".canvasWrapper");
      if (!layer || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      start = { page, layer, x: event.clientX, y: event.clientY };
      frame = doc.body.createDiv("pml-frame");
      frame.classList.toggle("pml-circle", shape === "circle");
    };
    const up = (event) => {
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = box(event);
      cancel();
      if (rect.width >= 5 && rect.height >= 5) {
        const target = this.anchor(view, start.page, start.layer, [rect], true);
        if (!target) return;
        target.shape = shape;
        const bounds = start.page.getBoundingClientRect();
        const preview = start.page.createDiv("pml-region-preview");
        preview.classList.toggle("pml-circle", shape === "circle");
        Object.assign(preview.style, {
          left: (rect.left - bounds.left) / bounds.width * 100 + "%",
          top: (rect.top - bounds.top) / bounds.height * 100 + "%",
          width: rect.width / bounds.width * 100 + "%",
          height: rect.height / bounds.height * 100 + "%",
        });
        this.regions.set(view, { ...target, preview });
        this.showActions(view, target);
      }
    };
    const escape = (event) => {
      if (event.key === "Escape") cancel();
    };
    this.area = { view, cancel, shape };
    frameButton?.setAttribute("aria-pressed", "true");
    root.classList.add("pml-area");
    root.addEventListener("pointerdown", down, true);
    doc.addEventListener("pointermove", move, true);
    doc.addEventListener("pointerup", up, true);
    doc.addEventListener("pointercancel", cancel);
    doc.addEventListener("keydown", escape, true);
    new Notice(shape === "circle" ? "拖动鼠标画出圆形或椭圆，按 Esc 取消。" : "拖动鼠标框选图表，按 Esc 取消。");
  }

  openAction(view, target, linkNote) {
    this.dismissPopover?.();
    this.clearRegion(view);
    if (linkNote) {
      new NotePicker(this.app, this.app.vault.getMarkdownFiles(), (note) => {
        if (target.shape === "circle") {
          new CommentModal(this.app, (text) => this.save(target, text, note), note).open();
        } else {
          this.save(target, "", note);
        }
      }).open();
    } else {
      new CommentModal(this.app, (text) => this.save(target, text)).open();
    }
  }

  showActions(view, target) {
    this.dismissPopover?.();
    const doc = view.containerEl.ownerDocument;
    const bar = doc.body.createDiv("pml-actions");
    const close = () => {
      bar.remove();
      doc.removeEventListener("pointerdown", dismiss, true);
      doc.removeEventListener("keydown", escape, true);
      this.dismissPopover = undefined;
    };
    const dismiss = (event) => { if (!bar.contains(event.target)) close(); };
    const escape = (event) => {
      if (event.key !== "Escape") return;
      this.clearRegion(view);
      close();
    };
    this.dismissPopover = close;
    doc.addEventListener("pointerdown", dismiss, true);
    doc.addEventListener("keydown", escape, true);
    const add = (label, linkNote) => {
      const button = bar.createEl("button", { text: label, attr: { type: "button" } });
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => this.openAction(view, target, linkNote));
    };
    add("只标注", false);
    add("关联笔记", true);
    const screen = doc.defaultView;
    const { right, bottom, top } = target.position;
    bar.style.left = Math.max(8, Math.min(right - bar.offsetWidth, screen.innerWidth - bar.offsetWidth - 8)) + "px";
    bar.style.top = (bottom + bar.offsetHeight + 12 < screen.innerHeight
      ? Math.max(8, bottom + 8) : Math.max(8, top - bar.offsetHeight - 8)) + "px";
  }

  async save(target, comment, note) {
    const { file, mtime, pageNumber } = target;
    if (this.writing.has(file)) {
      new Notice("上一条标注正在保存。请稍后重新选区。");
      return;
    }
    this.writing.add(file);
    let link;
    try {
      if (file.stat.mtime !== mtime) throw new Error("PDF 已更新，请重新选择标注位置。");
      const annotated = await annotatePdf(await this.app.vault.readBinary(file), target, comment);
      if (file.stat.mtime !== mtime) throw new Error("PDF 已更新，请重新选择标注位置。");
      await this.app.vault.modifyBinary(file, annotated.bytes);
      if (note) {
        link = this.app.fileManager.generateMarkdownLink(
          file, note.path, "#page=" + pageNumber + "&annotation=" + annotated.id,
          file.basename + " · 第 " + pageNumber + " 页",
        );
        await this.app.vault.process(note, (content) => {
          const separator = !content || content.endsWith("\n\n") ? "" : content.endsWith("\n") ? "\n" : "\n\n";
          return content + separator + link + "\n" + (comment ? "\n" + comment + "\n" : "");
        });
      }
      new Notice(note ? "已标注，并关联到「" + note.basename + "」。" : "标注已写入 PDF。");
    } catch (error) {
      if (link) {
        try {
          await navigator.clipboard.writeText(link);
          new Notice("PDF 已标注。笔记写入失败，链接已复制，可以手动粘贴。", 8000);
        } catch {
          new Notice("PDF 已标注，但写入笔记失败。", 8000);
        }
      } else {
        new Notice("保存标注失败：" + error.message, 8000);
      }
    } finally {
      this.writing.delete(file);
    }
  }

  async removeAnnotation(file, annotation) {
    if (this.writing.has(file)) throw new Error("PDF 正在保存，请稍后重试。");
    this.writing.add(file);
    const modified = file.stat.mtime;
    let updatedNotes = 0;
    try {
      const bytes = await deleteAnnotation(await this.app.vault.readBinary(file), annotation);
      const backlinks = this.app.metadataCache.getBacklinksForFile(file).data;
      for (const [path, links] of backlinks) {
        const entries = links.filter(({ link }) => {
          const params = new URLSearchParams(parseLinktext(link).subpath.slice(1));
          return params.get("annotation") === annotation.id &&
            Number(params.get("page")) === annotation.pageNumber;
        });
        if (!entries.length) continue;
        const note = this.app.vault.getFileByPath(path);
        if (!note) continue;
        await this.app.vault.process(note, (content) => toPageLinks(content, entries, annotation.id));
        updatedNotes++;
      }
      if (file.stat.mtime !== modified) throw new Error("PDF 已更新，请重新打开标注列表。");
      await this.app.vault.modifyBinary(file, bytes);
      new Notice("已删除标注" + (updatedNotes ? "，并更新了 " + updatedNotes + " 篇笔记的页码链接。" : "。"));
    } catch (error) {
      if (updatedNotes) {
        throw new Error("已有 " + updatedNotes + " 篇笔记的链接改为页码链接。删除未完成：" + error.message);
      }
      throw error;
    } finally {
      this.writing.delete(file);
    }
  }

  syncAllButtons() {
    if (this.refreshTimer) return;
    this.refreshTimer = window.requestAnimationFrame(() => {
      this.refreshTimer = undefined;
      for (const view of this.views.keys()) this.syncButtons(view);
    });
  }

  syncButtons(view) {
    const file = view.file;
    if (!file) return;
    const refs = new Map();
    const cache = this.app.metadataCache;
    const backlinks = cache.getBacklinksForFile(file).data;
    for (const [path, links] of backlinks) {
      const note = this.app.vault.getFileByPath(path);
      if (!note) continue;
      for (const { link } of links) {
        const params = new URLSearchParams(parseLinktext(link).subpath.slice(1));
        const id = params.get("annotation");
        if (!id) continue;
        const key = params.get("page") + ":" + id;
        if (!refs.has(key)) refs.set(key, new Set());
        refs.get(key).add(note);
      }
    }
    for (const section of view.containerEl.querySelectorAll(ANNOTATIONS)) {
      const key = section.closest(PAGE)?.dataset.pageNumber + ":" + section.dataset.annotationId;
      const notes = Array.from(refs.get(key) ?? []);
      let button = section.querySelector(".pml-backlink");
      if (!notes.length) {
        button?.remove();
        continue;
      }
      if (!button) {
        button = section.createEl("button", { cls: "pml-backlink", attr: { type: "button" } });
        setIcon(button, "link-2");
      }
      button.title = "打开关联笔记：" + notes.map((note) => note.basename).join("、");
      button.setAttribute("aria-label", button.title);
      button.onclick = (event) => {
        event.stopPropagation();
        const open = (note) => this.app.workspace.getLeaf("split").openFile(note);
        if (notes.length === 1) open(notes[0]);
        else new NotePicker(this.app, notes, open).open();
      };
    }
  }
};
