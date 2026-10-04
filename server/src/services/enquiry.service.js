import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { enquiries, enquiryNotes } from "../db/schema.all.js";
import { env } from "../config/env.js";
import { phoneKey } from "../utils/phone.js";
import { notifyCustomer, notifyStaff } from "./notify.service.js";

export const OPEN = ["new", "contacted", "quote_sent"];
const DAY = 86_400_000;

export const addNote = (exec, enquiryId, authorId, kind, body) =>
  exec.insert(enquiryNotes).values({ enquiryId, authorId: authorId ?? null, kind, body: body.slice(0, 1000) });

// Saves an enquiry, or, if this phone already has an open one, adds to it. Call inside db.transaction().
export async function createEnquiry(tx, d) {
  const key = phoneKey(d.phone);
  const now = new Date();

  const [existing] = await tx.select().from(enquiries)
    .where(and(eq(enquiries.phoneKey, key), inArray(enquiries.status, OPEN)))
    .orderBy(desc(enquiries.createdAt)).limit(1);

  if (existing) {
    await addNote(tx, existing.id, d.createdBy, "system", `Contacted again (${d.source}): ${d.message ?? "no message"}`);
    const [row] = await tx.update(enquiries).set({ updatedAt: now }).where(eq(enquiries.id, existing.id)).returning();
    if (!d.createdBy) {
      await notifyStaff(tx, {
        subject: `${existing.ref}: ${existing.name} got in touch again`,
        body: d.message ?? "No message left.",
        relatedType: "enquiry", relatedId: existing.id, toUserId: existing.assignedTo,
      });
    }
    return { enquiry: row, duplicate: true };
  }

  const [row] = await tx.insert(enquiries).values({
    ref: `TMP-${randomUUID().slice(0, 12)}`,
    type: d.type,
    source: d.source,
    name: d.name,
    email: d.email?.toLowerCase() ?? null,
    phone: d.phone,
    phoneKey: key,
    companyName: d.companyName ?? null,
    message: d.message ?? null,
    interestedPlan: d.interestedPlan ?? null,
    sport: d.sport ?? null,
    assignedTo: d.createdBy ?? null,
    followUpAt: new Date(now.getTime() + (d.createdBy ? 2 : 1) * DAY),
  }).returning();

  const ref = `EQ-${String(row.id).padStart(6, "0")}`;
  await tx.update(enquiries).set({ ref }).where(eq(enquiries.id, row.id));
  await addNote(tx, row.id, d.createdBy, "system", `Enquiry created via ${d.source}`);

  if (!d.createdBy) {
    await notifyStaff(tx, {
      subject: `New ${d.type} enquiry ${ref} from ${d.name}`,
      body: `${d.name} (${d.phone})${d.companyName ? ", " + d.companyName : ""}: ${d.message ?? "no message"}`,
      relatedType: "enquiry", relatedId: row.id,
    });
  }
  await notifyCustomer(tx, {
    email: d.email, phone: d.phone,
    subject: `We received your enquiry (${ref})`,
    body: `Hi ${d.name},\n\nThanks for contacting ${env.CLUB_NAME}. Our team will get back to you within one working day.\n\nReference: ${ref}`,
    relatedType: "enquiry", relatedId: row.id,
  });

  return { enquiry: { ...row, ref }, duplicate: false };
}
