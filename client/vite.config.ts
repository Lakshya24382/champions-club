import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The browser talks to Vite; Vite forwards /api to Express. No CORS headaches.
    proxy: { "/api": "http://localhost:4100" },
  },
});
