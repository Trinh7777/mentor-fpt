import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: {
    outDir: path.resolve(__dirname, "../extension"),
    emptyOutDir: false,
    assetsDir: "dist",
    rollupOptions: {
      input: {
        copilot: path.resolve(__dirname, "copilot.html"),
      },
      output: {
        entryFileNames: "dist/[name].js",
        chunkFileNames: "dist/[name].js",
        assetFileNames: "dist/[name].[ext]",
      },
    },
  },
});
