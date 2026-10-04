import { notifications } from "../db/schema.all.js";

// Staff inbox. toUserId = null means every staff member can see it.
export async function notifyStaff(exec, { subject, body, relatedType, relatedId, toUserId = null }) {
  await exec.insert(notifications).values({
    audience: "staff", channel: "internal", toUserId, subject, body, relatedType, relatedId,
  });
}

// Logged only, for now. Swap this body for real email/SMS sending later.
export async function notifyCustomer(exec, { email, phone, subject, body, relatedType, relatedId }) {
  const channel = email ? "email" : "sms";
  const toAddress = email ?? phone;
  await exec.insert(notifications).values({
    audience: "customer", channel, toAddress, subject, body, relatedType, relatedId,
  });
  console.log(`[outbox] ${channel} -> ${toAddress}: ${subject}`);
}
