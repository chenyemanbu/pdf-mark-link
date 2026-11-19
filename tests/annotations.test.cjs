const { test } = require("node:test");
const assert = require("node:assert/strict");
const { PDFDocument, PDFName, PDFHexString } = require("pdf-lib");
const { annotatePdf, listAnnotations, deleteAnnotation } = require("../pdf-annotations");
const { toPageLinks } = require("../note-links");

test("PDF shapes, Chinese comments, old marks, and unrelated annotations survive a save and deletion", async () => {
  const original = await PDFDocument.create();
  const page = original.addPage([500, 700]);
  const unrelated = original.context.register(original.context.obj({
    Type: "Annot", Subtype: "Square", Rect: [10, 10, 30, 30],
    T: PDFHexString.fromText("Another tool"),
  }));
  page.node.addAnnot(unrelated);
  let bytes = await original.save();
  const marks = [];
  for (const settings of [
    { area: false },
    { area: true, shape: "rectangle" },
    { area: true, shape: "circle" },
  ]) {
    const result = await annotatePdf(bytes, {
      pageNumber: 1, quads: [[50, 250, 160, 250, 50, 180, 160, 180]], ...settings,
    }, "中文分析，包含公式 RDS(on) 与换行\n第二行");
    bytes = result.bytes;
    marks.push(result.id);
  }
  const listed = await listAnnotations(bytes);
  assert.deepEqual(listed.map(a => a.type), ["高亮", "框选", "圈选"]);
  assert.ok(listed.every(a => a.comment.includes("\n第二行")));
  assert.deepEqual(listed.map(a => a.id), marks);

  for (const mark of listed) {
    bytes = await deleteAnnotation(bytes, mark);
    await assert.rejects(deleteAnnotation(bytes, mark));
  }
  assert.deepEqual(await listAnnotations(bytes), []);
  const reopened = await PDFDocument.load(bytes);
  const annotations = reopened.getPage(0).node.Annots();
  assert.equal(annotations.size(), 1);
  const retained = reopened.context.lookup(annotations.get(0));
  assert.equal(retained.get(PDFName.of("T")).decodeText(), "Another tool");
});

test("Deleting an annotation preserves Markdown text and other links, including embedded references", () => {
  const targets = [
    { original: "[[手册.pdf#page=3&annotation=233R|曲线说明]]", link: "手册.pdf#page=3&annotation=233R" },
    { original: "[引用](手册.pdf#page=3&annotation=233R)", link: "手册.pdf#page=3&annotation=233R" },
    { original: "![[手册.pdf#page=3&annotation=233R]]", link: "手册.pdf#page=3&annotation=233R" },
  ];
  const content = "我的分析\n\n" + targets.map(t => t.original).join("\n\n") +
    "\n\n[[手册.pdf#page=3&annotation=234R|保留]]\n";
  const entries = targets.map(t => ({
    ...t,
    position: { start: { offset: content.indexOf(t.original) }, end: { offset: content.indexOf(t.original) + t.original.length } },
  }));
  assert.equal(toPageLinks(content, entries, "233R"), content.replaceAll("&annotation=233R", ""));
  assert.throws(() => toPageLinks("新增内容" + content, entries, "233R"), /正在更新/);
});
