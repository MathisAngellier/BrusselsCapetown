import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src",
  publicDir: "../public", // If your static assets are in public/
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
