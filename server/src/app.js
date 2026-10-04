import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { sql } from "drizzle-orm";
import { env } from "./config/env.js";
import { db } from "./db/index.js";
import routes from "./routes/index.js";
import { notFound, errorHandler } from "./middleware/error.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../../client/dist");

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", async (_req, res) => {
  await db.execute(sql`select 1`);
  res.json({ status: "ok", db: "up" });
});

app.use("/api", routes);

// Serve React only in production.
// During development, Vite serves the frontend separately.
if (env.NODE_ENV === "production") {
  app.use(express.static(clientDist));

  app.use((req, res, next) => {
    if (
      req.method === "GET" &&
      !req.path.startsWith("/api") &&
      req.accepts("html")
    ) {
      return res.sendFile(path.join(clientDist, "index.html"));
    }

    next();
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
