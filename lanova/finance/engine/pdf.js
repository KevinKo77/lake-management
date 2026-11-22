/**
 * Minimal PDF 1.4 writer for LANOVA reports: A4 pages, Helvetica / Helvetica-Bold (standard fonts, nothing embedded),
 * WinAnsi text, lines and filled rectangles. No dependency; runs in the browser and in Node. Returns a Uint8Array.
 * Text that the WinAnsi encoding cannot represent is replaced (e.g. "→" becomes "->"), never dropped silently.
 */
const W = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const WIN = {'€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99};
const REPLACE = {'→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≠': '!=', '−': '-', '×': 'x', ' ': ' ', ' ': ' ', '÷': '/'};
/** Unicode text → WinAnsi byte string (one char per byte). */
export function encode(text) {
  let out = '';
  for (const ch of String(text).normalize('NFC')) {
    const c = REPLACE[ch] ?? ch;
    if (c.length > 1) { out += encode(c); continue; }
    const code = c.charCodeAt(0);
    out += WIN[c] !== undefined ? String.fromCharCode(WIN[c]) : code >= 32 && code <= 255 && !(code >= 127 && code < 160) ? c : '?';
  }
  return out;
}
export function textWidth(text, size, bold = false) {
  let w = 0;
  for (const ch of encode(text)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? W[c - 32] : c === 0x80 ? 556 : 556; }
  return w * size / 1000 * (bold ? 1.06 : 1);
}
const esc = s => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const n = v => (Math.round(v * 100) / 100).toString();

export class PdfDocument {
  constructor({title = 'LANOVA report', margin = 42} = {}) {
    this.title = title; this.pages = []; this.width = 595.28; this.height = 841.89; this.margin = margin;
    this.footer = null; this.addPage();
  }
  addPage() { this.ops = []; this.pages.push(this.ops); this.y = this.height - this.margin; return this; }
  get bottom() { return this.margin + 24; }
  ensure(h) { if (this.y - h < this.bottom) this.addPage(); return this; }
  text(x, y, str, {size = 9, bold = false, color = [0.1, 0.11, 0.13]} = {}) {
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${n(size)} Tf ${color.map(n).join(' ')} rg ${n(x)} ${n(y)} Td (${esc(encode(str))}) Tj ET`);
    return this;
  }
  line(x1, y1, x2, y2, {width = 0.5, color = [0.75, 0.77, 0.8]} = {}) { this.ops.push(`${n(width)} w ${color.map(n).join(' ')} RG ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`); return this; }
  rect(x, y, w, h, color) { this.ops.push(`${color.map(n).join(' ')} rg ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`); return this; }
  /** Word-wrapped paragraph at the cursor. */
  paragraph(str, {size = 9, bold = false, gap = 4, color} = {}) {
    const max = this.width - 2 * this.margin, lead = size * 1.35;
    for (const para of String(str).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? `${line} ${word}` : word;
        if (textWidth(t, size, bold) > max && line) { this.ensure(lead); this.text(this.margin, this.y - size, line, {size, bold, color}); this.y -= lead; line = word; } else line = t;
      }
      this.ensure(lead); if (line) this.text(this.margin, this.y - size, line, {size, bold, color}); this.y -= lead;
    }
    this.y -= gap; return this;
  }
  heading(str, level = 1) {
    const size = level === 1 ? 15 : 11.5; this.ensure(size * 3 + 40);
    this.y -= level === 1 ? 10 : 6; this.text(this.margin, this.y - size, str, {size, bold: true}); this.y -= size + 6;
    if (level === 1) { this.line(this.margin, this.y, this.width - this.margin, this.y, {width: 0.8, color: [0.3, 0.33, 0.6]}); this.y -= 8; }
    return this;
  }
  /**
   * Table with fixed relative column widths. columns: [{label, width (fraction), align: 'left'|'right'}]. Long cell
   * text is shortened with "…" (the full value is in the CSV export). Header row repeats on new pages.
   */
  table(columns, rows, {size = 7.6, zebra = true} = {}) {
    const full = this.width - 2 * this.margin, xs = [], h = size * 1.75;
    let x = this.margin; for (const c of columns) { xs.push(x); x += c.width * full; }
    const fit = (s, w, bold) => { s = String(s ?? ''); if (textWidth(s, size, bold) <= w) return s; while (s.length > 1 && textWidth(`${s}…`, size, bold) > w) s = s.slice(0, -1); return `${s}…`; };
    const row = (cells, {bold = false, fill = null} = {}) => {
      this.ensure(h); if (fill) this.rect(this.margin, this.y - h + 2, full, h, fill);
      cells.forEach((v, i) => { const c = columns[i], w = c.width * full - 6, s = fit(v, w, bold), tx = c.align === 'right' ? xs[i] + c.width * full - 3 - textWidth(s, size, bold) : xs[i] + 3; this.text(tx, this.y - h + 2 + (h - size) / 2 + 1, s, {size, bold}); });
      this.y -= h;
    };
    const header = () => { row(columns.map(c => c.label), {bold: true, fill: [0.88, 0.89, 0.94]}); };
    this.ensure(h * 3); header();
    rows.forEach((r, i) => { if (this.y - h < this.bottom) { this.addPage(); header(); } row(r, {fill: zebra && i % 2 ? [0.965, 0.968, 0.975] : null}); });
    this.y -= 8; return this;
  }
  /** Serialises the document. Footer text gets "page i of n" appended. */
  bytes() {
    const objs = [], add = s => { objs.push(s); return objs.length; };
    const catalog = add(''), pagesId = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    this.pages.forEach((ops, i) => {
      const foot = `${this.footer ? `${this.footer} · ` : ''}page ${i + 1} of ${this.pages.length}`;
      const content = [...ops, `BT /F1 7 Tf 0.45 0.47 0.5 rg ${n(this.margin)} ${n(this.margin - 8)} Td (${esc(encode(foot))}) Tj ET`].join('\n');
      const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.width)} ${n(this.height)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`));
    });
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title (${esc(encode(this.title))}) /Producer (LANOVA Finance V1) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
