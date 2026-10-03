import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { query } from './db.js';
import { requireAuth, requireRole } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import plansRoutes from './routes/plans.routes.js';
import membersRoutes from './routes/members.routes.js';
import courtsRoutes from './routes/courts.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import catalogRoutes from './routes/catalog.routes.js';
import productsRoutes from './routes/products.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import barRoutes from './routes/bar.routes.js';
import publicRoutes from './routes/public.routes.js';
import leadsRoutes from './routes/leads.routes.js';
import financeRoutes from './routes/finance.routes.js';
import invoicesRoutes from './routes/invoices.routes.js';
import expensesRoutes from './routes/expenses.routes.js';
import hrRoutes from './routes/hr.routes.js';
import sharedReportRoutes from './routes/sharedReport.routes.js';

const app = express();
const managers = requireRole('owner', 'admin');

// Security & parsing
app.use(helmet());
app.use(
  cors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Request timeout — prevents slow queries from blocking indefinitely
app.use((_req, res, next) => {
  res.setTimeout(30_000, () => {
    res.status(503).json({ error: 'Request timed out' });
  });
  next();
});

// Health check (no auth, minimal work)
app.get('/api/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', time: new Date().toISOString() });
  }
});

// ── Public routes ──────────────────────────────────────────────────────────────
app.use('/api/plans', plansRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/public/report', sharedReportRoutes); // frozen, shared owner reports
app.use('/api/public', publicRoutes);

// ── Staff routes (JWT required) ────────────────────────────────────────────────
app.use('/api/members',  requireAuth, membersRoutes);
app.use('/api/courts',   requireAuth, courtsRoutes);
app.use('/api/bookings', requireAuth, bookingsRoutes);
app.use('/api/dashboard',requireAuth, dashboardRoutes);
app.use('/api/products', requireAuth, productsRoutes);
app.use('/api/orders',   requireAuth, ordersRoutes);
app.use('/api/bar',      requireAuth, barRoutes);
app.use('/api/leads',    requireAuth, leadsRoutes);
app.use('/api/hr',       requireAuth, hrRoutes);

// ── Owner / admin only ─────────────────────────────────────────────────────────
app.use('/api/finance',  requireAuth, managers, financeRoutes);
app.use('/api/invoices', requireAuth, managers, invoicesRoutes);
app.use('/api/expenses', requireAuth, managers, expensesRoutes);

// ── Error handling (must be last) ──────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
