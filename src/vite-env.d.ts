/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_USE_FIREBASE_EMULATORS: string;
  readonly VITE_FIREBASE_EMULATOR_HOST: string;
}

/** The app version, from the VERSION file (injected by vite.config.ts). */
declare const __APP_VERSION__: string;
