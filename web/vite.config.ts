import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development, Vite serves the UI on :5173 and forwards API calls to Express on :3000.
// The browser only ever sees one origin, so the session cookie works without CORS.
const api = { target: "http://localhost:3000", changeOrigin: false };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/auth": api, "/items": api, "/outfits": api, "/health": api },
  },
});
