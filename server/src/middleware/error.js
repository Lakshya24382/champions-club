import { z } from "zod";
import { HttpError } from "../utils/httpError.js";

export function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "Validation failed", details: z.flattenError(err).fieldErrors });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  const pgCode = err.code ?? err.cause?.code;
  if (pgCode === "23P01") return res.status(409).json({ error: "That court is already booked for that time" });
  if (pgCode === "23505") return res.status(409).json({ error: "Duplicate value" });
  if (pgCode === "23503") return res.status(400).json({ error: "Invalid reference" });
  if (pgCode === "23514") return res.status(400).json({ error: "Value violates a rule" });

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
