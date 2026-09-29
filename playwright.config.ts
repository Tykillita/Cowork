import { defineConfig, devices } from "@playwright/test";

// Runs against the local Auth and Firestore emulators (never production):
//   npm run test:e2e
const PORT = 5190;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "es-ES",
    timezoneId: "America/Panama",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, grep: /@cross/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, grep: /@cross/ },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] }, grep: /@mobile/ },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    command: process.env.E2E_USE_PREVIEW === "true"
      ? `npx vite preview --port ${PORT} --strictPort`
      : `npx cross-env VITE_USE_FIREBASE_EMULATORS=true VITE_FIREBASE_EMULATOR_HOST=127.0.0.1 vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
