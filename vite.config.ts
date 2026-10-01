import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// @ts-expect-error JavaScript server plugin has no declaration file
import {modelProxyPlugin} from "./server/node-adapter.mjs";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({mode}) => ({
  plugins: [react(), tailwindcss(), modelProxyPlugin(loadEnv(mode, process.cwd(), "CHAT3D_").CHAT3D_ALLOWED_UPSTREAMS)],

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
}));
