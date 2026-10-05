import { defineConfig } from "vite";
import process from "node:process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const environmentPort = Number(process.env.PORT);
const port = Number.isInteger(environmentPort) && environmentPort > 0 ? environmentPort : 5173;
// The explicit build script decides whether its bundle uses local emulators;
// a developer's .env.local must not silently reverse that choice.
const emulatorOverride = process.env.VITE_USE_FIREBASE_EMULATORS;
// VERSION is the single source of the app version (see AGENTS.md).
const appVersion = readFileSync(resolve(process.cwd(), "VERSION"), "utf8").trim();

export default defineConfig({
  appType: "spa",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    ...(emulatorOverride === "true" ? { rollupOptions: { input: {
      main: resolve(process.cwd(), "index.html"),
      motion: resolve(process.cwd(), "tests/fixtures/motion.html"),
    } } } : {}),
  },
  server: { host: "0.0.0.0", port, strictPort: Boolean(environmentPort) },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    ...(emulatorOverride === "true" || emulatorOverride === "false"
      ? { "import.meta.env.VITE_USE_FIREBASE_EMULATORS": JSON.stringify(emulatorOverride) }
      : {}),
  },
});
