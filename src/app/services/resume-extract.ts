// Resume text extraction. PDF via pdfjs-dist, DOCX via mammoth's browser bundle,
// plain text natively. Libraries are lazy-loaded so they don't bloat the initial
// bundle and only cost when a resume is actually parsed.

export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === 'application/pdf' || name.endsWith('.pdf')) return extractPdf(file);
  if (
    name.endsWith('.docx') ||
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocx(file);
  }
  if (type.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    return file.text();
  }
  throw new Error('Unsupported file — upload a PDF, DOCX, or text resume.');
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Worker is copied to the app root by angular.json assets.
  pdfjs.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return pages.join('\n');
}

async function extractDocx(file: File): Promise<string> {
  // Self-contained browser bundle (avoids mammoth's Node `fs` path).
  const mod = await import('mammoth/mammoth.browser.js');
  const mammoth = mod.default ?? mod;
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}
