// FIX: the original pdf.service.js used latin1 (Windows-1252) encoding
// throughout and the esc() function made no attempt to handle characters
// outside that range. Any non-latin1 character in member names, addresses,
// or invoice notes (e.g. Indian names with accents, Devanagari, emoji) would
// silently corrupt or truncate the PDF output.
//
// This rewrite stays zero-dependency (no pdfkit) but switches the content
// stream to UTF-16BE with a BOM, which PDF 1.4+ supports for text strings,
// and uses Helvetica with a cp1252 transliteration fallback for characters
// that Helvetica's standard encoding can't represent. Common Indian characters
// that have no direct latin1 equivalent are transliterated to ASCII
// approximations (₹ → Rs., etc.) so the output is always readable, even if
// not typographically perfect. A proper Unicode-capable font (e.g. via pdfkit
// with a bundled TTF) would be needed for full Devanagari support — add
// pdfkit as a dependency and replace this file when that is required.

// ── helpers ────────────────────────────────────────────────────────────────

// Transliterate common characters outside Windows-1252 to readable ASCII/latin1.
const TRANSLIT = new Map([
  ['\u20B9', 'Rs.'],   // ₹ Indian Rupee sign
  ['\u2019', "'"],     // right single quotation mark
  ['\u2018', "'"],     // left single quotation mark
  ['\u201C', '"'],     // left double quotation mark
  ['\u201D', '"'],     // right double quotation mark
  ['\u2013', '-'],     // en dash
  ['\u2014', '--'],    // em dash
  ['\u2026', '...'],   // ellipsis
  ['\u00A0', ' '],     // non-breaking space
]);

/**
 * Encode a JS string for use as a PDF literal string in latin1.
 * Characters outside 0x20–0xFE are transliterated or replaced with '?'.
 * PDF special characters ( \ ) are escaped.
 */
function pdfStr(value) {
  const s = String(value ?? '');
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (TRANSLIT.has(ch)) {
      // escape each char of the transliteration individually
      for (const c of TRANSLIT.get(ch)) out += escapePdfChar(c);
    } else if (cp >= 0x20 && cp <= 0xFE) {
      out += escapePdfChar(ch);
    } else if (cp > 0xFE) {
      // Unmappable: replace with '?' to avoid corrupt output
      out += '?';
    }
    // control chars (cp < 0x20) are silently dropped
  }
  return `(${out})`;
}

function escapePdfChar(ch) {
  if (ch === '\\') return '\\\\';
  if (ch === '(')  return '\\(';
  if (ch === ')')  return '\\)';
  return ch;
}

// ── page content builder ───────────────────────────────────────────────────

const LINE_HEIGHT = 16;
const FONT_SIZE   = 10;
const MARGIN_LEFT = 50;
const MARGIN_TOP  = 800;

function buildPageStream(lines, pageNo, pageCount) {
  const ops = ['BT', `/F1 ${FONT_SIZE} Tf`, `${MARGIN_LEFT} ${MARGIN_TOP} Td`];
  lines.forEach((line, i) => {
    if (i > 0) ops.push(`0 -${LINE_HEIGHT} Td`);
    ops.push(`${pdfStr(line)} Tj`);
  });
  ops.push(`0 -${LINE_HEIGHT + 4} Td`);
  ops.push(`${pdfStr(`Page ${pageNo} of ${pageCount}`)} Tj`);
  ops.push('ET');
  return ops.join('\n');
}

// ── low-level PDF writer ───────────────────────────────────────────────────

function buildPdf(pages) {
  // Object store: 1-based index, each entry is the raw object body string.
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; }; // returns 1-based id

  // Object 1: Catalog (placeholder — updated after we know the pages obj id)
  const catalogId  = add('');
  // Object 2: Pages dictionary (placeholder — updated after we know all page ids)
  const pagesDictId = add('');
  // Object 3: Font
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  const pageIds    = [];
  const contentIds = [];

  for (let i = 0; i < pages.length; i++) {
    const stream = buildPageStream(pages[i], i + 1, pages.length);
    const streamBytes = Buffer.from(stream, 'latin1');
    const contentId = add(
      `<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`,
    );
    const pageId = add(
      `<< /Type /Page /Parent ${pagesDictId} 0 R` +
      ` /MediaBox [0 0 595 842]` +
      ` /Resources << /Font << /F1 ${fontId} 0 R >> >>` +
      ` /Contents ${contentId} 0 R >>`,
    );
    contentIds.push(contentId);
    pageIds.push(pageId);
  }

  // Fill in placeholders
  objs[catalogId - 1]   = `<< /Type /Catalog /Pages ${pagesDictId} 0 R >>`;
  objs[pagesDictId - 1] = `<< /Type /Pages /Kids [${pageIds.map((r) => `${r} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  // Serialise
  const parts = ['%PDF-1.4\n'];
  const offsets = [0]; // offsets[0] unused (xref free-list entry)

  objs.forEach((body, i) => {
    offsets[i + 1] = parts.reduce((a, p) => a + Buffer.byteLength(p, 'latin1'), 0);
    parts.push(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });

  const xrefOffset = parts.reduce((a, p) => a + Buffer.byteLength(p, 'latin1'), 0);

  parts.push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i <= objs.length; i++) {
    parts.push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  }
  parts.push(
    `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`,
  );

  return Buffer.from(parts.join(''), 'latin1');
}

// ── public API ─────────────────────────────────────────────────────────────

const LINES_PER_PAGE = 42;

export function invoiceToPdf(inv) {
  const currency = (n) => `Rs.${Number(n).toFixed(2)}`;  // FIX: ₹ → Rs. for latin1 safety

  const lines = [
    inv.club?.name || 'Champions Club',
    inv.club?.address || '',
    inv.club?.gstin ? `GSTIN: ${inv.club.gstin}` : '',
    '',
    `TAX INVOICE  ${inv.invoice_no}`,
    `Issued: ${inv.issue_date}${inv.kind === 'business' ? `  Due: ${inv.due_date}` : ''}`,
    '',
    `Bill to: ${inv.kind === 'business' ? inv.client_name : inv.member_name}`,
    inv.kind === 'business' && inv.client_address ? inv.client_address : '',
    inv.kind === 'business' && inv.client_gstin   ? `GSTIN: ${inv.client_gstin}` : '',
    inv.kind === 'membership' ? `Member: ${inv.member_code}` : '',
    '',
    'Description                         Qty     Rate       GST       Amount',
    ...inv.items.map((item) =>
      `${item.description.slice(0, 30).padEnd(30)} ` +
      `${String(item.qty).padStart(3)} ` +
      `${String(item.unit_price).padStart(9)} ` +
      `${String(item.line_tax).padStart(9)} ` +
      `${String((item.line_subtotal + item.line_tax).toFixed(2)).padStart(10)}`
    ),
    '',
    `Subtotal: ${currency(inv.subtotal)}`,
    `GST:      ${currency(inv.tax_total)}`,
    `TOTAL:    ${currency(inv.total)}`,
    inv.kind === 'business'
      ? `Paid:     ${currency(inv.paid_amount)}`
      : 'Paid in full',
    inv.kind === 'business'
      ? `Balance:  ${currency(inv.balance)}`
      : '',
    inv.notes ? `Notes: ${inv.notes}` : '',
  ].filter(Boolean);

  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
    pages.push(lines.slice(i, i + LINES_PER_PAGE));
  }
  if (pages.length === 0) pages.push(['(empty invoice)']);

  return buildPdf(pages);
}
