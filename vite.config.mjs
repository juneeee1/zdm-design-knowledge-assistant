import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "app",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 4318,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4317",
      "/card-assets": "http://127.0.0.1:4317",
      "/downloads": "http://127.0.0.1:4317",
    },
  },
});
