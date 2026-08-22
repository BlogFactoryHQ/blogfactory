import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { requiredHttpsUrl } from "./src/lib/https-url";

export default defineConfig(({ mode }) => {
  if (mode === "production") {
    requiredHttpsUrl("VITE_WAITLIST_URL", loadEnv(mode, process.cwd(), "").VITE_WAITLIST_URL);
  }

  return {
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
          marketing: path.resolve(__dirname, "marketing.html"),
        },
      },
    },
  };
});
