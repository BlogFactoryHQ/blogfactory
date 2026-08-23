import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api": "http://localhost:3000",
        "^/\\.well-known/oauth-protected-resource$": "http://localhost:3000",
        "^/mcp$": "http://localhost:3000",
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          app: path.resolve(__dirname, "index.html"),
          help: path.resolve(__dirname, "help.html"),
          docs: path.resolve(__dirname, "docs.html"),
        },
      },
    },
});
