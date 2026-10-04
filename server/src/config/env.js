import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CLUB_OPEN_HOUR: z.coerce.number().int().min(0).max(23).default(6),
  CLUB_CLOSE_HOUR: z.coerce.number().int().min(1).max(24).default(22),
  CLUB_UTC_OFFSET_MINUTES: z.coerce.number().int().default(330),
  SHOP_DELIVERY_FEE: z.coerce.number().min(0).default(80),
  SHOP_FREE_DELIVERY_ABOVE: z.coerce.number().min(0).default(2000),
  CLUB_NAME: z.string().default("The Champions Club"),
  CLUB_PHONE: z.string().default(""),
  CLUB_EMAIL: z.string().default(""),
  CLUB_ADDRESS: z.string().default(""),
  CLUB_GSTIN: z.string().default(""),
  PUBLIC_RATE_LIMIT: z.coerce.number().int().min(1).default(30),
  GST_RATE_PCT: z.coerce.number().min(0).max(28).default(18),
  LEAVE_PAID_DAYS_PER_YEAR: z.coerce.number().int().min(0).max(60).default(12),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
