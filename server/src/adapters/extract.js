/* =====================================================================
   Upload text extraction — turns any uploaded document into clean
   markdown/plain text for the standardize pipeline.

   Supported:
     • PDF                     → pdf.js / pdfjs-dist (text layer)
     • Word .docx / .docm      → mammoth (HTML) → markdown
     • HTML / .htm             → markdown
     • RTF                     → text
     • Markdown, txt, rst, adoc, csv, tsv, json, yaml, xml, dita, tex,
       and common source-code files → passthrough
     • Legacy .doc / .odt      → clear "re-save as .docx/PDF" message

   All extractors are defensive: empty / scanned / binary inputs raise a
   415 with a human-readable message instead of storing garbage.
   ===================================================================== */
import mammoth from 'mammoth';

/* PDF text via Mozilla pdf.js (robust on modern PDFs). Lazy-loaded so the
   large module only loads when a PDF is actually uploaded. Text items are
   reassembled into lines using pdf.js end-of-line hints. */
async function extractPdf(buf) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let s = '';
    for (const it of content.items) { s += (it.str || ''); s += it.hasEOL ? '\n' : ' '; }
    pages.push(s.replace(/[ \t]{2,}/g, ' ').replace(/ *\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
  }
  try { if (pdf.destroy) await pdf.destroy(); } catch { /* ignore */ }
  return pages.join('\n\n');
}

const TEXT_EXT = new Set([
  'md', 'markdown', 'mdx', 'txt', 'text', 'rst', 'adoc', 'asciidoc', 'csv', 'tsv',
  'json', 'yaml', 'yml', 'xml', 'dita', 'tex', 'log', 'ini', 'toml', 'env', 'properties',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts',
  'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'php', 'swift', 'scala', 'sh', 'bash', 'zsh',
  'sql', 'graphql', 'gql', 'proto', 'vue', 'svelte', 'r', 'm', 'lua', 'pl'
]);

const ext = (name) => String(name || '').toLowerCase().split('.').pop().replace(/[^a-z0-9]/g, '');
const strip = (t) => String(t).replace(/<[^>]+>/g, '');
const decode = (t) => String(t)
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '…')
  .replace(/&#(\d+);/g, (_m, n) => { try { return String.fromCodePoint(+n); } catch { return ''; } });

function cleanup(t) {
  return String(t)
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n').trim();
}
function badContent(msg) { const e = new Error(msg); e.status = 415; e.userMessage = msg; return e; }

/* Dependency-free HTML → Markdown: keeps headings, lists, code, links,
   emphasis; drops script/style/nav; decodes entities. Good enough to feed
   the outline parser (the corrector rebuilds structure anyway). */
export function htmlToMarkdown(html) {
  let s = String(html || '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Drop non-content blocks. `(?=[\s/>])` anchors the tag name so "head"
  // never matches "header", "b" never matches "body", etc.
  s = s.replace(/<(script|style|head|nav|footer|noscript)(?=[\s/>])[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<h([1-6])(?=[\s/>])[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_m, n, t) => '\n\n' + '#'.repeat(+n) + ' ' + decode(strip(t)).trim() + '\n\n');
  s = s.replace(/<pre(?=[\s/>])[^>]*>([\s\S]*?)<\/pre\s*>/gi, (_m, t) => '\n\n```\n' + decode(strip(t)).replace(/\n+$/, '') + '\n```\n\n');
  s = s.replace(/<code(?=[\s/>])[^>]*>([\s\S]*?)<\/code\s*>/gi, (_m, t) => '`' + decode(strip(t)) + '`');
  s = s.replace(/<(strong|b)(?=[\s/>])[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_m, _tag, t) => '**' + decode(strip(t)).trim() + '**');
  s = s.replace(/<(em|i)(?=[\s/>])[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_m, _tag, t) => '*' + decode(strip(t)).trim() + '*');
  s = s.replace(/<a(?=[\s/>])[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, href, t) => '[' + decode(strip(t)).trim() + '](' + href + ')');
  s = s.replace(/<li(?=[\s/>])[^>]*>([\s\S]*?)<\/li\s*>/gi, (_m, t) => '- ' + decode(strip(t)).trim() + '\n');
  s = s.replace(/<\/(p|div|section|article|tr|ul|ol|blockquote|table|h[1-6])\s*>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>(?!\n)/gi, '\n');
  s = decode(strip(s));
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* Basic RTF → text: drop control words / groups, keep readable content. */
export function rtfToText(rtf) {
  let s = String(rtf || '');
  s = s.replace(/\\'[0-9a-fA-F]{2}/g, ' ');
  s = s.replace(/\\par[d]?\b/g, '\n').replace(/\\line\b/g, '\n').replace(/\\tab\b/g, '\t');
  s = s.replace(/\\[a-zA-Z]+-?\d* ?/g, '');
  s = s.replace(/[{}]/g, '');
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const looksBinary = (t) => /\u0000/.test(String(t).slice(0, 4000));

/* Main entry: (buffer, filename, mimetype) -> { text, format, kind } */
export async function extractDocument(buffer, filename, mimetype = '') {
  const e = ext(filename);
  const mt = String(mimetype || '').toLowerCase();
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');

  if (e === 'pdf' || mt.includes('pdf')) {
    const text = cleanup(await extractPdf(buf));
    if (!text.trim()) throw badContent('This PDF has no extractable text — it looks scanned. Add a text layer (OCR) or upload a text-based PDF.');
    return { text, format: 'pdf', kind: 'pdf' };
  }

  if (e === 'docx' || e === 'docm' || mt.includes('officedocument.wordprocessingml') || mt.includes('ms-word')) {
    let text = '';
    try { const { value } = await mammoth.convertToHtml({ buffer: buf }); text = htmlToMarkdown(value); } catch { /* fall through */ }
    if (!text.trim()) { try { const raw = await mammoth.extractRawText({ buffer: buf }); text = cleanup(raw.value || ''); } catch { /* ignore */ } }
    if (!text.trim()) throw badContent('No readable text found in this Word document.');
    return { text, format: 'docx', kind: 'docx' };
  }

  if (e === 'doc' || mt === 'application/msword') {
    throw badContent('Legacy “.doc” files aren’t supported directly. Re-save as .docx or PDF and upload again.');
  }
  if (e === 'odt' || mt.includes('opendocument')) {
    throw badContent('OpenDocument “.odt” isn’t supported yet. Export as .docx, PDF, or HTML and upload again.');
  }

  if (e === 'html' || e === 'htm' || e === 'xhtml' || mt.includes('text/html')) {
    const text = htmlToMarkdown(buf.toString('utf8'));
    if (!text.trim()) throw badContent('No readable text found in this HTML file.');
    return { text, format: 'html', kind: 'html' };
  }

  if (e === 'rtf' || mt.includes('rtf')) {
    const text = rtfToText(buf.toString('utf8'));
    if (!text.trim()) throw badContent('No readable text found in this RTF file.');
    return { text, format: 'rtf', kind: 'rtf' };
  }

  // Plain-text / markup / source-code formats (and unknown-but-utf8 files)
  if (TEXT_EXT.has(e) || mt.startsWith('text/') || !e) {
    const text = cleanup(buf.toString('utf8'));
    if (!text.trim()) throw badContent('The file appears to be empty.');
    if (looksBinary(text)) throw badContent('This looks like a binary file we can’t read. Supported: PDF, Word (.docx), HTML, RTF, Markdown, and text/code formats.');
    return { text, format: e || 'txt', kind: 'text' };
  }

  // Last resort: if it decodes as clean utf8, accept it as text.
  const guess = buf.toString('utf8');
  if (guess.trim() && !looksBinary(guess)) return { text: cleanup(guess), format: e || 'txt', kind: 'text' };
  throw badContent('Unsupported file type “.' + e + '”. Supported: PDF, Word (.docx), HTML, RTF, Markdown, and text/code formats.');
}
