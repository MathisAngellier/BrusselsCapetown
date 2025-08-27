import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: "src",
  publicDir: "../public", // If your static assets are in public/
  build: {
    rollupOptions: {
      input: {
        main: "src/index.html",
        about: "src/views/about.html",
        bicycle: "src/views/bicycle.html",
        contact: "src/views/contact.html",
        countries: "src/views/countries.html",
        equipment: "src/views/equipment.html",
        images: "src/views/images.html",
        project: "src/views/project.html",
        route: "src/views/route.html",
      },
    },
  },
});
