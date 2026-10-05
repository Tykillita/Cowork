# Instrucciones para agentes

Este archivo lo leen Codex, Claude Code (vía `CLAUDE.md`) y cualquier otro agente que trabaje en Cowork. El usuario lo ha adoptado como reglas compartidas del workspace.

## Diseño de la interfaz

Antes de tocar la interfaz, lee y sigue [docs/DESIGN.md](docs/DESIGN.md). En particular:

- **Estados de carga:** usa siempre los skeleton loaders predefinidos (`src/components/Skeleton.tsx`, `src/styles/skeleton.css`, `src/components/BootSkeleton.tsx`), con la misma forma y las mismas clases que el contenido final. No uses spinners, textos "Cargando…", ceros falsos ni un estilo de placeholder propio.
- Si añades o cambias una vista que espera datos, su skeleton se añade o actualiza en el mismo cambio.
- Vidrio oscuro neutro; menta solo para señales pequeñas; menús como modal en móvil; respeta el movimiento reducido.

## Proyecto

- React + TypeScript + Vite; datos en Firebase (Auth y Firestore) con emuladores locales. Ver [README.md](README.md) y [docs/FIREBASE.md](docs/FIREBASE.md).
- Comprobación mínima antes de entregar: `npm run build` (incluye `tsc --noEmit`), `npm run test:unit` y `npm run version:check`. Las pruebas e2e (`npm run test:e2e`) usan los emuladores.

## Obligatorio en cada versión nueva: novedades, README e informe

**El agente que crea una versión nueva es quien actualiza la página de novedades y los README, en el mismo trabajo.** No se deja para otro agente ni para el usuario.

Cuando se sube la versión (ver [Versiones](#versiones)), el agente debe:

1. **README:** en `README.md` (español) **y** `README.en.md` (inglés), con el mismo contenido:
   - la placa `badge/version-x.y.z` (y su `alt="version x.y.z"`);
   - las funciones nuevas o cambiadas en la tabla de funciones y en su sección, y cualquier dato que haya dejado de ser cierto.
2. **Novedades:** en `src/features/changelog/releases.ts`, la entrada de la versión (ver [Página de novedades](#página-de-novedades-cada-versión-o-feature-nueva-se-documenta)). Comprueba la página `/novedades` a 375, 768 y 1280 px, en claro y oscuro, en español e inglés.
3. **Publicación:** mientras la release `vX.Y.Z` no esté publicada en GitHub, su entrada tiene `released: false` y la página la muestra «En desarrollo».
   - Al publicarse: `released: true`, la fecha real en el CHANGELOG y en `releases.ts`, y despliegue con `npm run deploy`.
   - Si la versión amplía lo que aceptan las reglas, publica primero las reglas y después Hosting (README, «Publicar»).
4. **Informe al usuario:** el mensaje final debe decir **explícitamente qué cambió en la página de novedades**: qué versión o tarjetas se añadieron y en qué grupo, si ya está desplegada (o por qué no todavía) y qué falta. Igual para los README. Si algo no se pudo actualizar, se dice y se explica por qué; nunca se omite en silencio.

## Versiones

Formato `MAJOR.MINOR.PATCH` ([SemVer](https://semver.org/lang/es/)). [`VERSION`](VERSION) es la única fuente: Vite la expone a la app como `__APP_VERSION__` (pie de la portada, del selector y de `/novedades`).

Antes de commitear cambios de la app (`src/`, `public/`, `firestore.rules`, `firestore.indexes.json`, `scripts/`, `index.html`, `vite.config.ts`, `package.json`, `tests/`), sube la versión según el tamaño del cambio:

| Cambio | Salto | Ejemplo |
|---|---|---|
| Feature nueva o cambio pequeño | MINOR | 0.2.0 → 0.3.0 |
| Cambio muy grande (rediseño, ruptura, reescritura) | MAJOR | 0.2.0 → 1.0.0 |
| Solo arreglos de errores | PATCH | 0.2.0 → 0.2.1 |

Un solo salto por commit (el mayor que aplique). Los commits que solo tocan la documentación o el CI no suben la versión.

`npm run version:bump -- <major|minor|patch>` sube todo a la vez:

- `VERSION`, `package.json` y `package-lock.json`;
- la placa de los dos README;
- `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)): mueve `[Unreleased]` a `## [x.y.z] — AAAA-MM-DD`, deja un `[Unreleased]` vacío y añade el enlace de comparación.

Después, a mano y en el mismo trabajo: la entrada de `releases.ts` y las funciones de los README (ver arriba). `npm run version:check` falla mientras falte algo. La prueba `tests/unit/version.test.ts` y el flujo `build` de GitHub hacen la misma comprobación.

**Release:** commitea, crea la etiqueta `vX.Y.Z` y súbela. El flujo `prepare-release` (`.github/workflows/release.yml`) comprueba que la etiqueta coincide con `VERSION` y con el CHANGELOG, compila, pasa las pruebas unitarias y crea un **borrador** de release con la sección del CHANGELOG. El usuario lo revisa y lo publica.

## Página de novedades: cada versión o feature nueva se documenta

`/novedades` (`src/pages/ChangelogPage.tsx`, datos en `src/features/changelog/releases.ts`) es la documentación pública de cambios, de la versión más nueva a la más antigua. Se enlaza desde el pie de la portada y del selector de proyectos, y se abre sin iniciar sesión.

- Cada versión es un objeto de `RELEASES` con su fecha, `released`, el tipo de salto (`grande`, `feature` o `arreglo`), un resumen y sus tarjetas en **Nuevo** (`added`), **Cambios** (`changed`) y **Arreglos** (`fixed`). `wide: true` ocupa las dos columnas.
- Cada feature nueva, de la app o de la página, se añade en el mismo cambio que la introduce. Si todavía no hay versión nueva, va a `NEXT` («Próxima versión»), que pasa a ser la versión al subirla.
- **Bilingüe:** cada texto es `{ es, en }`; el tipo y `tests/unit/version.test.ts` impiden dejar una traducción vacía o igual al español.
- Textos propios y breves, para quien usa Cowork. El detalle técnico vive en `CHANGELOG.md`.

## Video de presentación

`docs/video/cowork-tour-es.mp4` y `cowork-tour-en.mp4` (1920 × 1080, 30 fps, con banda sonora original) presentan Cowork en los README, y sus pósteres están en `docs/images/video-poster-*.jpg`. Cómo se generan está en [docs/VIDEO.md](docs/VIDEO.md).

- Si una versión cambia algo que el video muestra (una vista rediseñada, una función que ya no existe), dilo en el informe y propón regenerarlo; no se regenera sin pedirlo.
- GitHub solo reproduce dentro del README un video subido como adjunto (`https://github.com/user-attachments/…`). El usuario lo sube arrastrando el MP4 a un issue; el agente pega esa URL en los dos README.

## Commits

- Respeta estas reglas también al usar la skill `/commit`.
- Sin líneas de atribución a Claude ni a otros agentes en commits, PR ni archivos.
- Conserva los cambios ajenos al trabajo pedido.
