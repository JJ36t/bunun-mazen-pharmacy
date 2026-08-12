import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // P2 fix: manual chunks for better caching + smaller initial bundle
  // Splits vendor code into separate chunks that can be cached independently
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core (rarely changes)
          "react-vendor": ["react", "react-dom"],
          // State management
          "state-vendor": ["zustand"],
          // Charts (large library — separate chunk)
          "charts-vendor": ["recharts"],
          // Icons
          "icons-vendor": ["lucide-react"],
          // Date utilities
          "date-vendor": ["date-fns"],
          // Tauri bridge
          "tauri-vendor": ["@tauri-apps/api", "@tauri-apps/plugin-opener"],
        },
      },
    },
  },
}));
