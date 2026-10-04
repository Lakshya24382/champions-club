import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/db/schema.js",
    "./src/db/schema.courts.js",
    "./src/db/schema.shop.js",
    "./src/db/schema.bar.js",
    "./src/db/schema.crm.js",
    "./src/db/schema.finance.js",
  ],
  out: "./drizzle",
  dbCredentials: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: false,
  },
});
