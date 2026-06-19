import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        about: resolve(__dirname, "src/views/about.html"),
        bicycle: resolve(__dirname, "src/views/bicycle.html"),
        contact: resolve(__dirname, "src/views/contact.html"),
        countries: resolve(__dirname, "src/views/countries.html"),
        equipment: resolve(__dirname, "src/views/equipment.html"),
        images: resolve(__dirname, "src/views/images.html"),
        project: resolve(__dirname, "src/views/project.html"),
        route: resolve(__dirname, "src/views/route.html"),
      },
    },
  },
});
