# Instrucciones para agentes

Este archivo lo leen Codex, Claude Code (vía `CLAUDE.md`) y cualquier otro agente que trabaje en Cowork.

## Diseño de la interfaz

Antes de tocar la interfaz, lee y sigue [docs/DESIGN.md](docs/DESIGN.md). En particular:

- **Estados de carga:** usa siempre los skeleton loaders predefinidos (`src/components/Skeleton.tsx`, `src/styles/skeleton.css`, `src/components/BootSkeleton.tsx`), con la misma forma y las mismas clases que el contenido final. No uses spinners, textos "Cargando…", ceros falsos ni un estilo de placeholder propio.
- Si añades o cambias una vista que espera datos, su skeleton se añade o actualiza en el mismo cambio.
- Vidrio oscuro neutro; menta solo para señales pequeñas; menús como modal en móvil; respeta el movimiento reducido.

## Proyecto

- React + TypeScript + Vite; datos en Firebase (Auth y Firestore) con emuladores locales. Ver [README.md](README.md) y [docs/FIREBASE.md](docs/FIREBASE.md).
- Comprobación mínima antes de entregar: `npm run build` (incluye `tsc --noEmit`) y `npm run test:unit`. Las pruebas e2e (`npm run test:e2e`) usan los emuladores.
