import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("."),
  base: "/app/",
  plugins: [react()],
  resolve: { alias: { "@domain": r("../src/domain") } },
  css: { postcss: r(".") },
  server: {
    port: 5173,
    fs: { allow: [r(".."), r("../src/domain")] },
    proxy: { "/api": "http://localhost:8888" },
  },
  build: {
    outDir: r("../public/app"),
    emptyOutDir: true,
    target: "es2019",
    cssTarget: "chrome61",
    chunkSizeWarningLimit: 600,
  },
});
