import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../utils/httpError.js';
import { requireRole } from '../middleware/auth.js';
import { paymentMethod } from '../utils/schemas.js';
import * as payroll from '../services/payroll.service.js';
import * as leave from '../services/leave.service.js';

// Mounted behind requireAuth ONLY: leave routes are open to every staff member.
// Employee and payroll routes add the owner/admin check themselves.
const router = Router();
const managers = requireRole('owner', 'admin');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

// ------------------------------------------------------------ employees
const employeeSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().max(30).nullable(),
  jobTitle: z.string().trim().min(2).max(100),
  monthlySalary: z.number().nonnegative(),
  joinedOn: dateStr,
  loginEmail: z.email().nullable(),
});

router.get('/employees', managers, async (_req, res) => res.json(await payroll.listEmployees()));

router.post('/employees', managers, async (req, res) => {
  const d = employeeSchema.partial({ phone: true, joinedOn: true, loginEmail: true }).parse(req.body);
  res.status(201).json(await payroll.createEmployee(d));
});

router.patch('/employees/:id', managers, async (req, res) => {
  const d = employeeSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
  res.json(await payroll.updateEmployee(parseId(req.params.id), d));
});

// ------------------------------------------------------------ payroll
router.get('/payroll/runs', managers, async (_req, res) => res.json(await payroll.listRuns()));

router.post('/payroll/runs', managers, async (req, res) => {
  const { month } = z.object({ month: monthStr }).parse(req.body);
  res.status(201).json(await payroll.generatePayroll(month, req.user.sub));
});

router.get('/payroll/runs/:id', managers, async (req, res) => {
  res.json(await payroll.getRun(parseId(req.params.id)));
});

router.delete('/payroll/runs/:id', managers, async (req, res) => {
  res.json(await payroll.deleteRun(parseId(req.params.id)));
});

router.post('/payroll/runs/:id/pay', managers, async (req, res) => {
  const { method } = z.object({ method: paymentMethod }).parse(req.body);
  res.json(await payroll.payRun(parseId(req.params.id), method));
});

router.patch('/payroll/payslips/:id', managers, async (req, res) => {
  const d = z.object({
    bonus: z.number().nonnegative().optional(),
    otherDeduction: z.number().nonnegative().optional(),
    note: z.string().trim().max(200).nullable().optional(),
  }).parse(req.body);
  res.json(await payroll.updatePayslip(parseId(req.params.id), d));
});

// ------------------------------------------------------------ leave (any signed-in staff)
router.get('/leave/balances', async (req, res) => res.json(await leave.balances(req.user)));

router.get('/leave', async (req, res) => {
  const q = z.object({
    status: z.enum(['all', 'pending', 'approved', 'rejected', 'cancelled']).default('all'),
    mine: z.string().optional(),
  }).parse(req.query);
  res.json(await leave.listLeave({ status: q.status, mine: !!q.mine }, req.user));
});

const leaveSchema = z.object({
  employeeId: z.number().int().positive().nullish(),     // managers only; staff always request for themselves
  leaveType: z.enum(['casual', 'sick', 'unpaid']),
  startDate: dateStr,
  endDate: dateStr,
  reason: z.string().trim().max(300).nullish(),
}).refine((d) => d.endDate >= d.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

router.post('/leave', async (req, res) => {
  res.status(201).json(await leave.requestLeave(leaveSchema.parse(req.body), req.user));
});

router.post('/leave/:id/decision', managers, async (req, res) => {
  const d = z.object({
    decision: z.enum(['approved', 'rejected']),
    note: z.string().trim().max(300).nullish(),
  }).parse(req.body);
  res.json(await leave.decideLeave(parseId(req.params.id), d.decision, d.note, req.user));
});

router.post('/leave/:id/cancel', async (req, res) => {
  res.json(await leave.cancelLeave(parseId(req.params.id), req.user));
});

export default router;
