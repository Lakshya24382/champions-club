import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw httpError(401, "Missing token");
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = { id: Number(payload.sub), role: payload.role };
    next();
  } catch {
    throw httpError(401, "Invalid or expired token");
  }
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user?.role)) throw httpError(403, "Forbidden");
  next();
};
