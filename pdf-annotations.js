const { PDFDocument, PDFHexString, PDFString, PDFName } = require("pdf-lib");

const AUTHOR = "PDF 标注与笔记链接";

function annotationId(ref) {
  return ref.objectNumber + "R" + (ref.generationNumber || "");
}

async function listAnnotations(bytes) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const result = [];
  for (const [index, page] of document.getPages().entries()) {
    const annotations = page.node.Annots();
    for (let i = 0; i < (annotations?.size() ?? 0); i++) {
      const ref = annotations.get(i);
      const annotation = document.context.lookup(ref);
      if (annotation.get(PDFName.of("T"))?.decodeText?.() !== AUTHOR) continue;
      const subtype = annotation.get(PDFName.of("Subtype"))?.toString();
      if (!["/Highlight", "/Square", "/Circle"].includes(subtype)) continue;
      result.push({
        id: annotationId(ref),
        pageNumber: index + 1,
        type: { "/Square": "框选", "/Circle": "圈选", "/Highlight": "高亮" }[subtype],
        comment: annotation.get(PDFName.of("Contents"))?.decodeText?.() ?? "",
      });
    }
  }
  return result;
}

async function deleteAnnotation(bytes, { pageNumber, id }) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = document.getPage(pageNumber - 1);
  const annotations = page.node.Annots();
  for (let i = 0; i < (annotations?.size() ?? 0); i++) {
    const ref = annotations.get(i);
    if (annotationId(ref) !== id) continue;
    const annotation = document.context.lookup(ref);
    if (annotation.get(PDFName.of("T"))?.decodeText?.() !== AUTHOR) break;
    annotations.remove(i);
    const output = await document.save({ updateFieldAppearances: false });
    return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
  }
  throw new Error("这条标注已被删除或修改，请重新打开标注列表。");
}

async function annotatePdf(bytes, { pageNumber, quads, area, shape }, comment) {
  const document = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = document.getPage(pageNumber - 1);
  const coordinates = quads.flat();
  const x = coordinates.filter((_, index) => index % 2 === 0);
  const y = coordinates.filter((_, index) => index % 2 === 1);
  const rect = [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)];
  const annotation = document.context.obj({
    Type: "Annot",
    Subtype: area ? (shape === "circle" ? "Circle" : "Square") : "Highlight",
    Rect: rect,
    P: page.ref,
    F: 4,
    C: area ? [0.86, 0.18, 0.14] : [1, 0.83, 0.12],
    T: PDFHexString.fromText(AUTHOR),
    Contents: PDFHexString.fromText(comment),
    NM: PDFString.of(crypto.randomUUID()),
    M: PDFString.fromDate(new Date()),
    ...(area ? { BS: { W: 1.5, S: "S" } } : { QuadPoints: coordinates }),
  });
  const ref = document.context.register(annotation);
  page.node.addAnnot(ref);
  const output = await document.save({ updateFieldAppearances: false });
  return {
    bytes: output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength),
    id: ref.objectNumber + "R" + (ref.generationNumber || ""),
  };
}

module.exports = { annotatePdf, listAnnotations, deleteAnnotation };
