import app from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";

const guard = await pool.query("select 1 from pg_constraint where conname = 'bookings_no_overlap'");
if (guard.rowCount === 0) {
  console.error("Missing DB constraint 'bookings_no_overlap'. Run: node src/db/apply-guard.js");
  process.exit(1);
}

const server = app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT}`);
});

const shutdown = () => server.close(async () => { await pool.end(); process.exit(0); });
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
