import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../utils/httpError.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Missing token');
  try {
    req.user = jwt.verify(token, config.jwtSecret); // { sub, name, role }
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have permission');
  next();
};
