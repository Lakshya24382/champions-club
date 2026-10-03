import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../utils/httpError.js';
import { paymentMethod } from '../utils/schemas.js';
import * as inv from '../services/invoice.service.js';

// Mounted behind requireAuth + owner/admin only.
const router = Router();

const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().max(100).nullish(),
  phone: z.string().trim().max(30).nullish(),
  email: z.email().nullish(),
  gstin: z.string().trim().max(20).nullish(),
  address: z.string().trim().max(300).nullish(),
});

router.get('/clients', async (_req, res) => res.json(await inv.listClients()));
router.post('/clients', async (req, res) => {
  res.status(201).json(await inv.createClient(clientSchema.parse(req.body)));
});

const itemSchema = z.object({
  description: z.string().trim().min(2).max(200),
  qty: z.number().int().positive().max(10000),
  unitPrice: z.number().nonnegative(),
  taxPct: z.number().min(0).max(100).default(18),
});
const createSchema = z.object({
  clientId: z.number().int().positive(),
  dueDays: z.number().int().min(0).max(120).default(15),
  items: z.array(itemSchema).min(1).max(30),
  notes: z.string().trim().max(500).nullish(),
});

router.get('/', async (req, res) => {
  const q = z.object({
    status: z.enum(['open', 'overdue', 'paid', 'void', 'all']).default('open'),
    kind: z.enum(['business', 'membership', '']).default(''),
    clientId: z.coerce.number().int().positive().optional(),
    search: z.string().default(''),
  }).parse(req.query);
  res.json(await inv.listInvoices({ ...q, clientId: q.clientId ?? null }));
});

router.post('/', async (req, res) => {
  const d = createSchema.parse(req.body);
  res.status(201).json(await inv.createBusinessInvoice(d, req.user.sub));
});

router.post('/membership', async (req, res) => {
  const { eventId } = z.object({ eventId: z.number().int().positive() }).parse(req.body);
  res.status(201).json(await inv.createMembershipInvoice(eventId, req.user.sub));
});

router.get('/:id', async (req, res) => res.json(await inv.getInvoice(parseId(req.params.id))));

router.post('/:id/payments', async (req, res) => {
  const d = z.object({
    method: paymentMethod,
    amount: z.number().positive(),
    note: z.string().trim().max(200).nullish(),
  }).parse(req.body);
  res.status(201).json(await inv.recordPayment(parseId(req.params.id), d, req.user.sub));
});

router.post('/:id/void', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(2).max(200) }).parse(req.body ?? {});
  res.json(await inv.voidInvoice(parseId(req.params.id), reason));
});

export default router;
