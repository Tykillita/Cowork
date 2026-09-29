import { defineConfig } from "vite";
import process from "node:process";

const environmentPort = Number(process.env.PORT);
const port = Number.isInteger(environmentPort) && environmentPort > 0 ? environmentPort : 5173;
// The explicit build script decides whether its bundle uses local emulators;
// a developer's .env.local must not silently reverse that choice.
const emulatorOverride = process.env.VITE_USE_FIREBASE_EMULATORS;

export default defineConfig({
  appType: "spa",
  build: { outDir: "dist", emptyOutDir: true },
  server: { host: "0.0.0.0", port, strictPort: Boolean(environmentPort) },
  ...(emulatorOverride === "true" || emulatorOverride === "false"
    ? { define: { "import.meta.env.VITE_USE_FIREBASE_EMULATORS": JSON.stringify(emulatorOverride) } }
    : {}),
});
