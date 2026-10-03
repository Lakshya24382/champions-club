import { HttpError } from '../utils/httpError.js';
import { ageOn } from '../utils/dates.js';

export function assertPlanFits(plan, dateOfBirth) {
  if (plan.max_age != null && ageOn(dateOfBirth) > plan.max_age) {
    throw new HttpError(400, `${plan.name} is only for members aged ${plan.max_age} or under`);
  }
}

// Runs inside the caller's transaction (c = transaction client).
export async function createMember(c, d, userId) {
  const { rows: [plan] } = await c.query(
    'SELECT * FROM membership_plans WHERE id = $1 AND is_active', [d.planId]);
  if (!plan) throw new HttpError(404, 'Plan not found');
  assertPlanFits(plan, d.dateOfBirth);

  const { rows: [m] } = await c.query(
    `INSERT INTO members
       (full_name, phone, email, date_of_birth, gender, emergency_contact, plan_id, expires_on)
     VALUES ($1,$2,$3,$4,$5,$6,$7, current_date + $8::int)
     RETURNING *`,
    [d.fullName, d.phone, d.email ?? null, d.dateOfBirth, d.gender ?? null,
     d.emergencyContact ?? null, plan.id, plan.duration_days]);
  await c.query(
    `INSERT INTO membership_events (member_id, plan_id, event_type, starts_on, ends_on, amount, created_by)
     VALUES ($1,$2,'joined', current_date, $3, $4, $5)`,
    [m.id, plan.id, m.expires_on, d.amountPaid ?? plan.price, userId]);
  return { member: m, plan };
}
