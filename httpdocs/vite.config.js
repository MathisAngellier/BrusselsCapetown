import fs from "fs";
import { defineConfig } from "vite";
import { resolve } from "path";

function cleanUrls() {
  const routes = {
    "/about": "/views/about.html",
    "/bicycle": "/views/bicycle.html",
    "/contact": "/views/contact.html",
    "/countries": "/views/countries.html",
    "/equipment": "/views/equipment.html",
    "/gallery": "/views/gallery.html",
    "/images": "/views/images.html",
    "/project": "/views/project.html",
    "/route": "/views/route.html",
  };
  return {
    name: "clean-urls",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url.split("?")[0];
        if (routes[pathname]) {
          req.url = routes[pathname];
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [cleanUrls()],
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
        gallery: resolve(__dirname, "src/views/gallery.html"),
      },
    },
  },
});
