import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server runs on 3000 by default; override with `vite --port 3001` when
// running multiple portals locally without Docker.
export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: true },
  preview: { port: 3000, host: true },
});
