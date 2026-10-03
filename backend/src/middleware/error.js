import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';

export function notFound(_req, res) {
  res.status(404).json({ error: 'Route not found' });
}

// Express 5 forwards errors from async handlers here automatically.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })) });
  }

  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });

  // Postgres error codes
  if (err.code === '23P01') return res.status(409).json({ error: 'That court is already booked for this time' });
  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate value (already exists)' });
  if (err.code === '23503') return res.status(400).json({ error: 'Referenced record does not exist' });
  if (err.code === '23514') return res.status(409).json({ error: 'Not enough stock for that change' });

  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
