import "dotenv/config";
import { pool } from "./index.js";

const reset = process.argv.includes("--reset");
const NAME = "bookings_no_overlap";

const CREATE = `
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  ALTER TABLE bookings ADD CONSTRAINT ${NAME}
    EXCLUDE USING gist (court_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status = 'confirmed');
`;

try {
  if (reset) {
    await pool.query("TRUNCATE social_participants, bookings RESTART IDENTITY");
    console.log("Cleared all bookings and social participants (test data).");
  }
  const found = await pool.query(
    "select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1", [NAME]
  );
  if (found.rowCount) {
    console.log("Guard already in place:", found.rows[0].def);
  } else {
    await pool.query(CREATE);
    console.log("Guard created.");
  }
} catch (err) {
  if (err.code === "23P01") {
    console.error("Existing bookings overlap, so the guard can't be created. Re-run with --reset.");
  } else {
    console.error(err);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
