import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "inline-mcp-review-app",
      generateBundle(_, bundle) {
        const entry = Object.values(bundle).find((item) => item.type === "chunk" && item.isEntry);
        if (!entry || entry.type !== "chunk") throw new Error("MCP Review App entry was not built");
        this.emitFile({
          type: "asset",
          fileName: "mcp-review.html",
          source: `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BlogFactory Review</title></head><body><div id="root"></div><script type="module">${entry.code}</script></body></html>`,
        });
        delete bundle[entry.fileName];
      },
    },
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: path.resolve(__dirname, "src/mcp-review/main.tsx"), formats: ["es"] },
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: "mcp-review.js" } },
  },
});
