const esc = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\(/g, '\\(')
  .replace(/\)/g, '\\)');

function makePage(lines, pageNo, pageCount) {
  const content = [];
  content.push('BT');
  content.push('/F1 10 Tf');
  content.push('50 800 Td');
  lines.forEach((line, i) => {
    if (i > 0) content.push('0 -16 Td');
    content.push(`(${esc(line)}) Tj`);
  });
  content.push('0 -20 Td');
  content.push(`(Page ${pageNo} of ${pageCount}) Tj`);
  content.push('ET');
  return content.join('\n');
}

export function invoiceToPdf(inv) {
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
    inv.kind === 'business' && inv.client_gstin ? `GSTIN: ${inv.client_gstin}` : '',
    inv.kind === 'membership' ? `Member: ${inv.member_code}` : '',
    '',
    'Description                         Qty     Rate       GST       Amount',
    ...inv.items.map((i) => `${i.description.slice(0, 30).padEnd(30)} ${String(i.qty).padStart(3)} ${String(i.unit_price).padStart(9)} ${String(i.line_tax).padStart(9)} ${String((i.line_subtotal + i.line_tax).toFixed(2)).padStart(10)}`),
    '',
    `Subtotal: INR ${Number(inv.subtotal).toFixed(2)}`,
    `GST:      INR ${Number(inv.tax_total).toFixed(2)}`,
    `TOTAL:    INR ${Number(inv.total).toFixed(2)}`,
    inv.kind === 'business' ? `Paid:     INR ${Number(inv.paid_amount).toFixed(2)}` : 'Paid in full',
    inv.kind === 'business' ? `Balance:  INR ${Number(inv.balance).toFixed(2)}` : '',
    inv.notes ? `Notes: ${inv.notes}` : '',
  ].filter(Boolean);

  const pageSize = 42;
  const pages = [];
  for (let i = 0; i < lines.length; i += pageSize) pages.push(lines.slice(i, i + pageSize));
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const catalog = add('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesObj = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageRefs = [];
  const contentRefs = [];
  for (const page of pages) {
    const content = makePage(page, pages.length ? pages.indexOf(page) + 1 : 1, pages.length);
    const contentRef = add(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
    const pageRef = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${contentRef} 0 R >>`);
    contentRefs.push(contentRef); pageRefs.push(pageRef);
  }
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${pageRefs.map((r) => `${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets[i + 1] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
