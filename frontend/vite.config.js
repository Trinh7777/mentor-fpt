import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.resolve(__dirname, "../static"),
    emptyOutDir: true,
    assetsDir: "static-assets",
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/assets": "http://localhost:8000",
    },
  },
});
