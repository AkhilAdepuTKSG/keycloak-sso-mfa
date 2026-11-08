import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server runs on 7200 (My Guyana); override with `vite --port 7201` to
// run another portal locally without Docker.
export default defineConfig({
  plugins: [react()],
  server: { port: 7200, host: true },
  preview: { port: 7200, host: true },
});
