import { env } from "../config/env.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "INR " + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Printable invoice / receipt page. Open in a browser and use Print -> Save as PDF.
export function renderDocument(d) {
  const rows = d.items
    .map((i) => `<tr><td>${esc(i.description)}</td><td class="r">${i.quantity}</td><td class="r">${inr(i.unitPrice)}</td><td class="r">${inr(i.lineTotal)}</td></tr>`)
    .join("");
  const line = (label, value, cls = "") => `<tr class="${cls}"><td colspan="3" class="r">${label}</td><td class="r">${value}</td></tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(d.title)} ${esc(d.number)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #222; max-width: 760px; margin: 32px auto; padding: 0 16px; font-size: 14px; }
  h1 { margin: 0; font-size: 22px; } .muted { color: #666; } .top { display: flex; justify-content: space-between; gap: 16px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; } th, td { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
  th { background: #f4f4f4; } .r { text-align: right; } .total td { font-weight: bold; border-top: 2px solid #222; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 10px; background: #eee; font-size: 12px; text-transform: uppercase; }
  @media print { body { margin: 0; } }
</style></head><body>
<div class="top">
  <div><h1>${esc(env.CLUB_NAME)}</h1>
    <div class="muted">${esc(env.CLUB_ADDRESS)}<br>${esc(env.CLUB_PHONE)} ${esc(env.CLUB_EMAIL)}${env.CLUB_GSTIN ? `<br>GSTIN: ${esc(env.CLUB_GSTIN)}` : ""}</div></div>
  <div class="r"><h1>${esc(d.title)}</h1><div>${esc(d.number)}</div>
    <div class="muted">Date: ${esc(d.date)}${d.dueDate ? `<br>Due: ${esc(d.dueDate)}` : ""}</div>
    ${d.status ? `<div class="badge">${esc(d.status.replace("_", " "))}</div>` : ""}</div>
</div>
<p><strong>Bill to</strong><br>${esc(d.billTo.name)}${d.billTo.company ? `<br>${esc(d.billTo.company)}` : ""}${d.billTo.gstin ? `<br>GSTIN: ${esc(d.billTo.gstin)}` : ""}${d.billTo.contact ? `<br>${esc(d.billTo.contact)}` : ""}</p>
<table>
  <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
  <tbody>${rows}
    ${line("Subtotal", inr(d.subtotal))}
    ${d.discountAmount ? line(`Discount (${d.discountPct}%)`, "-" + inr(d.discountAmount)) : ""}
    ${line(`GST (${d.taxRatePct}%)`, inr(d.taxAmount))}
    ${line("Total", inr(d.total), "total")}
    ${d.amountPaid != null ? line("Paid", inr(d.amountPaid)) + line("Balance due", inr(d.total - d.amountPaid), "total") : ""}
  </tbody>
</table>
${d.notes ? `<p class="muted">${esc(d.notes)}</p>` : ""}
<p class="muted">Computer-generated document.</p>
</body></html>`;
}
