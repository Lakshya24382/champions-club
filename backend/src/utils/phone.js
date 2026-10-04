// FIX: phone normalisation was only applied in lead.service.js (via normPhone)
// and in public.routes.js, but NOT in the staff member-creation route or the
// members.routes.js renew/update endpoints. Two different formats of the same
// number could both pass the UNIQUE constraint on members.phone, creating
// silent duplicates.
//
// Solution: extract normPhone into its own shared util so every write path
// that touches members.phone imports and calls it consistently.
//
// "98765 43210", "+91-98765-43210", and "9876543210" all normalise to the same
// string. This matches the regexp_replace logic already used in DB queries for
// comparisons.

export const normPhone = (p = '') => p.replace(/[^\d+]/g, '');
