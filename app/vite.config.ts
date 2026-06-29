import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Vite (not Next.js) to avoid SSR and hydration pitfalls with Solana wallet libs.
// node polyfills provide Buffer and process, which @solana/web3.js and Anchor need
// in the browser.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
  ],
  define: {
    "process.env.ANCHOR_BROWSER": "true",
  },
  // Allow importing the generated IDL and types from the repo root target/ dir.
  // Proxy TxLINE API calls through the dev server so they originate from this
  // host's IP (the guest token is IP bound) and to avoid any CORS issues.
  server: {
    port: 5173,
    fs: { allow: [".."] },
    proxy: {
      "/txline-api": {
        target: "https://txline-dev.txodds.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/txline-api/, "/api"),
      },
    },
  },
});
