import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { query } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import plansRoutes from './routes/plans.routes.js';
import membersRoutes from './routes/members.routes.js';
import courtsRoutes from './routes/courts.routes.js';
import bookingsRoutes from './routes/bookings.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', async (_req, res) => {
  await query('SELECT 1');           // proves the DB connection works too
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Public
app.use('/api/plans', plansRoutes);
app.use('/api/auth', authRoutes);

// Staff only (JWT required)
app.use('/api/members', requireAuth, membersRoutes);
app.use('/api/courts', requireAuth, courtsRoutes);
app.use('/api/bookings', requireAuth, bookingsRoutes);
app.use('/api/dashboard', requireAuth, dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
