import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(readFileSync("VERSION", "utf8").trim()) },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
