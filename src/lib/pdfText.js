/* ------------------------------------------------------------------
   The text of a PDF, read in the browser with Mozilla's PDF.js (loaded
   only when someone sends a PDF). Lines are rebuilt from the positions
   of the words, so a statement's rows come out as rows.
   A scanned PDF has no text layer: then the first pages are drawn to a
   canvas and handed back as images, for the receipt reader (OCR).
   ------------------------------------------------------------------ */
export const MAX_PAGES = 20
export const MAX_PDF_BYTES = 10 * 1024 * 1024

async function pdfjs() {
  const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  lib.GlobalWorkerOptions.workerSrc = worker.default
  return lib
}

/** Words on a page grouped into lines, top to bottom, left to right. */
function linesOf(items) {
  const rows = []
  for (const it of items) {
    if (!it.str?.trim()) continue
    const x = it.transform[4]
    const y = it.transform[5]
    let row = rows.find((r) => Math.abs(r.y - y) < 3)
    if (!row) rows.push((row = { y, parts: [] }))
    row.parts.push({ x, s: it.str })
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.s)
        .join('  ')
        .replace(/\s{3,}/g, '  ')
        .trim(),
    )
}

/**
 * Read a PDF file. → { text, pages, scanned, images }
 * scanned: no text layer; images: up to 3 canvases of the first pages, for OCR.
 */
export async function readPdf(file) {
  if (file.size > MAX_PDF_BYTES) throw Object.assign(new Error('too big'), { code: 'size' })
  const lib = await pdfjs()
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise
  const pages = Math.min(doc.numPages, MAX_PAGES)
  const lines = []
  for (let n = 1; n <= pages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    lines.push(...linesOf(content.items))
  }
  const text = lines.join('\n')
  if (text.replace(/\s/g, '').length >= 20) return { text, pages: doc.numPages, scanned: false, images: [] }
  // no text: a scan. Draw the first pages for the OCR reader.
  const images = []
  for (let n = 1; n <= Math.min(pages, 3); n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    images.push(canvas)
  }
  return { text: '', pages: doc.numPages, scanned: true, images }
}
