import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";

// Reuse the patchFiberJsInitSync plugin from the existing vite.config.ts
const patchFiberJsInitSync = () => ({
  name: "patch-fiber-js-initsync",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!id.includes("@nervosnetwork/fiber-js/index.js")) {
      return null;
    }
    const patchedCode = code
      .replace("YA(e.n(_A)());", "YA({module:e.n(_A)()});")
      .replace("qA(W.n(Og)());", "qA({module:W.n(Og)()});");
    if (patchedCode === code) return null;
    return { code: patchedCode, map: null };
  }
});

// Copy manifest.json to dist
const copyManifest = () => ({
  name: "copy-manifest",
  generateBundle(this: any) {
    this.emitFile({
      type: "asset",
      fileName: "manifest.json",
      source: JSON.stringify(
        JSON.parse(
          fs.readFileSync(resolve(__dirname, "manifest.json"), "utf-8")
        ),
        null,
        2
      )
    });
  }
});

export default defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      buffer: "buffer/"
    }
  },
  define: {
    global: "globalThis"
  },
  optimizeDeps: {
    include: ["buffer", "bech32", "@ckb-ccc/ccc", "@ckb-ccc/connector-react"],
    exclude: ["@nervosnetwork/fiber-js"]
  },
  plugins: [
    react(),
    patchFiberJsInitSync(),
    copyManifest()
  ],
  build: {
    outDir: "dist-extension",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        offscreen: resolve(__dirname, "offscreen.html"),
        "service-worker": resolve(__dirname, "src/background/service-worker.ts")
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
