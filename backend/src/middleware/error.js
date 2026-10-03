import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'Route not found', path: req.path });
}

// Express 5 forwards errors from async handlers here automatically.
export function errorHandler(err, req, res, _next) {
  // Validation errors (Zod)
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  // Application-level HTTP errors
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  // Postgres constraint errors
  if (err.code === '23P01') {
    return res.status(409).json({
      error:
        err.table === 'leave_requests'
          ? 'Those dates overlap another leave request for this employee'
          : 'That court is already booked for this time',
    });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate value — this record already exists' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced record does not exist' });
  }
  if (err.code === '23514') {
    return err.table === 'products'
      ? res.status(409).json({ error: 'Not enough stock for that change' })
      : res.status(400).json({ error: 'That value is not allowed here' });
  }

  // Unexpected error — log with context for debugging
  console.error({
    message: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    body: req.body,
  });

  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
}
