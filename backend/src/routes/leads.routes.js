import { Router } from 'express';
import { z } from 'zod';
import { withTransaction } from '../db.js';
import { parseId } from '../utils/httpError.js';
import * as leads from '../services/lead.service.js';

const router = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const phoneStr = z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number');

router.get('/summary', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await leads.leadSummary());
});

router.get('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const q = z.object({
    status: z.enum(['open', 'all', 'new', 'contacted', 'quoted', 'trial_booked', 'converted', 'lost']).default('open'),
    search: z.string().default(''),
    due: z.string().optional(),
    mine: z.string().optional(),
  }).parse(req.query);
  res.json(await leads.listLeads(
    { status: q.status, search: q.search, due: !!q.due, mine: !!q.mine }, req.user.sub));
});

// Staff log an enquiry that came by phone / walk-in / referral
const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneStr,
  email: z.string().trim().email('Enter a valid email address').nullish(),
  message: z.string().trim().max(1000).nullish(),
  source: z.enum(['phone', 'walk_in', 'referral', 'other']).default('phone'),
  interestedPlanId: z.number().int().positive().nullish(),
});

router.post('/', async (req, res) => {
  const d = createSchema.parse(req.body);
  const r = await withTransaction((c) => leads.captureLead(c, d, req.user.sub));
  res.status(r.duplicate ? 200 : 201).json(r);
});

router.get('/:id', async (req, res) => {
  res.json(await leads.getLead(parseId(req.params.id)));
});

// "converted" is deliberately NOT allowed here: only the convert action creates a member.
const patchSchema = z.object({
  status: z.enum(['new', 'contacted', 'quoted', 'trial_booked', 'lost']),
  assignedTo: z.number().int().positive().nullable(),
  nextFollowUp: dateStr.nullable(),
  lostReason: z.string().trim().min(2).max(300),
}).partial();

router.patch('/:id', async (req, res) => {
  const d = patchSchema.parse(req.body);
  res.json(await leads.updateLead(parseId(req.params.id), d, req.user.sub));
});

const noteSchema = z.object({
  kind: z.enum(['note', 'call']),
  body: z.string().trim().min(1).max(2000),
  nextFollowUp: dateStr.nullish(),
});

router.post('/:id/notes', async (req, res) => {
  const d = noteSchema.parse(req.body);
  res.status(201).json(await leads.addNote(parseId(req.params.id), d, req.user.sub));
});

const quoteSchema = z.object({
  planId: z.number().int().positive(),
  amount: z.number().nonnegative().optional(),
  validDays: z.number().int().min(1).max(90).default(14),
  message: z.string().trim().max(500).nullish(),
});

router.post('/:id/quotes', async (req, res) => {
  const d = quoteSchema.parse(req.body);
  res.status(201).json(await leads.createQuote(parseId(req.params.id), d, req.user.sub));
});

const convertSchema = z.object({
  planId: z.number().int().positive().optional(),
  quoteId: z.number().int().positive().optional(),
  dateOfBirth: dateStr,
  gender: z.enum(['male', 'female', 'other']).nullish(),
  emergencyContact: z.string().trim().nullish(),
  amountPaid: z.number().nonnegative().optional(),
}).refine((d) => d.planId || d.quoteId, { message: 'Choose a plan or a quote', path: ['planId'] });

router.post('/:id/convert', async (req, res) => {
  const d = convertSchema.parse(req.body);
  res.status(201).json(await leads.convertLead(parseId(req.params.id), d, req.user.sub));
});

export default router;
