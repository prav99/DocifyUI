// Binary exporters: real .docx (OOXML via the docx library) and real .pdf
// (via pdfkit). Both consume the generated Markdown master and honor the
// user's output options: paper size, header/footer, page numbers, watermark.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow,
  TableCell, WidthType, Header, Footer, AlignmentType, PageNumber, BorderStyle
} from 'docx';
import PDFDocument from 'pdfkit';

/* ---------- Shared: tokenize our Markdown subset ---------- */
function tokenize(md) {
  const toks = [];
  const lines = String(md).split('\n');
  let i = 0;
  const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith('```')) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      toks.push({ t: 'code', lines: buf });
      continue;
    }
    if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      toks.push({ t: 'table', head: cells(rows[0]), rows: rows.slice(2).map(cells) });
      continue;
    }
    const hm = l.match(/^(#{1,6})\s+(.*)$/);
    if (hm) { toks.push({ t: 'h', depth: hm[1].length, text: hm[2] }); i++; continue; }
    if (/^>\s?/.test(l)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      toks.push({ t: 'q', text: buf.join(' ') });
      continue;
    }
    if (/^[-*]\s+/.test(l)) {
      const buf = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { buf.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      toks.push({ t: 'ul', items: buf });
      continue;
    }
    if (/^\d+\.\s+/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { buf.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      toks.push({ t: 'ol', items: buf });
      continue;
    }
    if (/^---+$/.test(l.trim())) { toks.push({ t: 'hr' }); i++; continue; }
    if (l.trim() === '') { i++; continue; }
    const buf = [l]; i++;
    while (i < lines.length && lines[i].trim() !== '' && !/^(#|\||>|[-*]\s|\d+\.\s|```|---)/.test(lines[i])) { buf.push(lines[i]); i++; }
    toks.push({ t: 'p', text: buf.join(' ') });
  }
  return toks;
}

const delink = (t) => String(t).replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');
const plain = (t) => delink(t).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');

/* ---------- .docx ---------- */
function runs(text, forceBold) {
  const src = delink(text);
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0; let m;
  const push = (t, o = {}) => {
    if (!t) return;
    out.push(new TextRun({
      text: t,
      bold: forceBold || o.bold || undefined,
      font: o.code ? 'Courier New' : undefined,
      size: o.code ? 18 : undefined
    }));
  };
  while ((m = re.exec(src))) {
    push(src.slice(last, m.index));
    const s = m[0];
    if (s.startsWith('**')) push(s.slice(2, -2), { bold: true });
    else push(s.slice(1, -1), { code: true });
    last = m.index + s.length;
  }
  push(src.slice(last));
  if (!out.length) out.push(new TextRun({ text: ' ' }));
  return out;
}

const HEADING = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4, 5: HeadingLevel.HEADING_5, 6: HeadingLevel.HEADING_6 };

export async function buildDocx({ md, title, output = {} }) {
  const toks = tokenize(md);
  const children = [];
  for (const tok of toks) {
    if (tok.t === 'h') {
      children.push(new Paragraph({ heading: HEADING[tok.depth] || HeadingLevel.HEADING_3, children: runs(tok.text), spacing: { before: 240, after: 120 } }));
    } else if (tok.t === 'p') {
      children.push(new Paragraph({ children: runs(tok.text), spacing: { after: 120 } }));
    } else if (tok.t === 'q') {
      children.push(new Paragraph({
        children: runs(tok.text).map((r) => r), indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: '0F62FE' } },
        spacing: { after: 120 }
      }));
    } else if (tok.t === 'ul') {
      tok.items.forEach((it) => children.push(new Paragraph({ children: runs(it), bullet: { level: 0 }, spacing: { after: 60 } })));
    } else if (tok.t === 'ol') {
      tok.items.forEach((it, idx) => children.push(new Paragraph({ children: runs((idx + 1) + '. ' + it), indent: { left: 360 }, spacing: { after: 60 } })));
    } else if (tok.t === 'code') {
      tok.lines.forEach((l) => children.push(new Paragraph({
        children: [new TextRun({ text: l || ' ', font: 'Courier New', size: 18 })],
        shading: { fill: 'F4F4F4' }
      })));
      children.push(new Paragraph({ text: '' }));
    } else if (tok.t === 'table') {
      const mkRow = (cellsArr, bold) => new TableRow({
        children: cellsArr.map((c) => new TableCell({
          children: [new Paragraph({ children: runs(c, bold) })],
          margins: { top: 60, bottom: 60, left: 100, right: 100 }
        }))
      });
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [mkRow(tok.head, true), ...tok.rows.map((r) => mkRow(r, false))]
      }));
      children.push(new Paragraph({ text: '' }));
    } else if (tok.t === 'hr') {
      children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'DDDDDD' } }, spacing: { after: 120 } }));
    }
  }

  const isLetter = output.paperSize === 'Letter';
  const headerBits = [];
  if (output.headerText && String(output.headerText).trim()) headerBits.push(new TextRun({ text: String(output.headerText).trim(), color: '666666', size: 16 }));
  if (output.watermark && String(output.watermark).trim()) headerBits.push(new TextRun({ text: (headerBits.length ? '    ' : '') + '[' + String(output.watermark).trim().toUpperCase() + ']', color: 'BBBBBB', size: 16, bold: true }));
  const footerBits = [];
  if (output.footerText && String(output.footerText).trim()) footerBits.push(new TextRun({ text: String(output.footerText).trim() + '   ', color: '666666', size: 16 }));
  if (output.pageNumbers !== false) footerBits.push(new TextRun({ color: '666666', size: 16, children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] }));

  const doc = new Document({
    title: title || 'Document',
    sections: [{
      properties: { page: { size: { width: isLetter ? 12240 : 11906, height: isLetter ? 15840 : 16838 } } },
      headers: headerBits.length ? { default: new Header({ children: [new Paragraph({ children: headerBits })] }) } : undefined,
      footers: footerBits.length ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: footerBits })] }) } : undefined,
      children
    }]
  });
  return Packer.toBuffer(doc);
}

/* ---------- .pdf ---------- */
export function buildPdf({ md, title, output = {} }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: output.paperSize === 'Letter' ? 'LETTER' : 'A4',
      margins: { top: 64, bottom: 64, left: 64, right: 64 },
      bufferPages: true,
      info: { Title: title || 'Document', Producer: 'Docify' }
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const body = () => doc.font('Helvetica').fontSize(10.5).fillColor('#161616');
    for (const tok of tokenize(md)) {
      if (tok.t === 'h') {
        const size = tok.depth === 1 ? 20 : tok.depth === 2 ? 15 : 12;
        doc.moveDown(tok.depth === 1 ? 0.2 : 0.6);
        doc.font('Helvetica-Bold').fontSize(size).fillColor('#161616').text(plain(tok.text));
        doc.moveDown(0.25);
      } else if (tok.t === 'p') {
        body().text(plain(tok.text), { lineGap: 2 });
        doc.moveDown(0.4);
      } else if (tok.t === 'q') {
        doc.font('Helvetica-Oblique').fontSize(10).fillColor('#525252').text(plain(tok.text), { indent: 14, lineGap: 2 });
        doc.moveDown(0.4);
      } else if (tok.t === 'ul') {
        body();
        tok.items.forEach((it) => doc.text('•  ' + plain(it), { indent: 14, lineGap: 2 }));
        doc.moveDown(0.4);
      } else if (tok.t === 'ol') {
        body();
        tok.items.forEach((it, idx) => doc.text((idx + 1) + '.  ' + plain(it), { indent: 14, lineGap: 2 }));
        doc.moveDown(0.4);
      } else if (tok.t === 'code') {
        doc.font('Courier').fontSize(8.5).fillColor('#393939');
        tok.lines.forEach((l) => doc.text(l || ' ', { lineGap: 1 }));
        doc.moveDown(0.5);
      } else if (tok.t === 'table') {
        doc.font('Courier').fontSize(8.5).fillColor('#161616');
        const all = [tok.head, ...tok.rows];
        const widths = tok.head.map((_, ci) => Math.min(34, Math.max(...all.map((r) => plain(r[ci] || '').length)) + 2));
        const fmt = (r) => r.map((c, ci) => plain(c || '').slice(0, widths[ci]).padEnd(widths[ci])).join(' ');
        doc.text(fmt(tok.head));
        doc.text(widths.map((w) => '-'.repeat(w)).join(' '));
        tok.rows.forEach((r) => doc.text(fmt(r)));
        doc.moveDown(0.5);
      } else if (tok.t === 'hr') {
        doc.moveDown(0.2);
        doc.moveTo(64, doc.y).lineTo(doc.page.width - 64, doc.y).strokeColor('#dddddd').stroke();
        doc.moveDown(0.4);
      }
    }

    // Page decorations: watermark, header, footer, page numbers.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      if (output.watermark && String(output.watermark).trim()) {
        doc.save();
        doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
        doc.font('Helvetica-Bold').fontSize(72).fillColor('#161616').opacity(0.06)
          .text(String(output.watermark).trim().toUpperCase(), 0, doc.page.height / 2 - 36, { align: 'center', width: doc.page.width, lineBreak: false });
        doc.restore();
        doc.opacity(1);
      }
      doc.font('Helvetica').fontSize(8).fillColor('#666666');
      if (output.headerText && String(output.headerText).trim()) {
        doc.text(String(output.headerText).trim(), 64, 32, { width: doc.page.width - 128, align: 'left', lineBreak: false });
      }
      const foot = [];
      if (output.footerText && String(output.footerText).trim()) foot.push(String(output.footerText).trim());
      if (output.pageNumbers !== false) foot.push('Page ' + (i - range.start + 1) + ' of ' + range.count);
      if (foot.length) {
        doc.text(foot.join('  ·  '), 64, doc.page.height - 44, { width: doc.page.width - 128, align: 'center', lineBreak: false });
      }
    }
    doc.end();
  });
}
