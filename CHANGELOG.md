# Changelog

Todos los cambios importantes de Cowork. El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y las versiones siguen [SemVer](https://semver.org/lang/es/). La versión vive en [`VERSION`](VERSION); las reglas para
subirla están en [AGENTS.md](AGENTS.md#versiones). La versión pública de estos cambios, para quien usa Cowork, está en
[/novedades](src/features/changelog/releases.ts).

## [Unreleased]

## [0.5.0] — 2026-10-08

### Added
- **Amigos y rachas independientes**: amistades sin límite de cinco y paginadas de veinte en veinte. Las rachas requieren una invitación y aceptación separadas, ocupan una de cinco plazas por persona y conservan amistad y récord al finalizar. Migración repetible de las parejas anteriores.
- **Unir cuentas Cowork**: confirma el acceso a las dos cuentas, elige qué perfil conservar y usa cualquiera de los dos inicios de sesión para compartir proyectos y datos personales. Los UID de Firebase siguen separados; saldos e inventarios se combinan una sola vez.

### Changed
- **Límite de rachas al unir cuentas**: puedes tener más de cinco amistades; al fusionar perfiles eliges hasta cinco rachas activas y las demás se cierran sin borrar la amistad ni su historial. Las reglas impiden activar la fusión si el total sigue por encima de cinco.

## [0.4.2] — 2026-10-08

### Fixed
- **Página de novedades actualizada**: `/novedades` ya no conserva la versión anterior en la caché del navegador después de un despliegue.

## [0.4.1] — 2026-10-08

### Fixed
- **Portafolio manga en tableta y escritorio**: el resplandor del hero ya no ensancha la página ni crea desplazamiento horizontal.

## [0.4.0] — 2026-10-08

### Added
- **Portafolio manga de Linus Torvalds**: página pública bilingüe, adaptable a móvil, que cuenta en viñetas el origen y desarrollo comunitario de Linux y Git como caso de estudio. Incluye ilustraciones SVG originales, cronología, fuentes enlazadas y nota de independencia.

## [0.3.4] — 2026-10-05

### Fixed
- **Posición del degradado de novedades**: empieza justo debajo de la cabecera y ocupa todo el ancho, sin el margen superior ni los laterales globales de la app.

## [0.3.3] — 2026-10-05

### Fixed
- **Logo de Cowork en novedades**: mantiene el fondo negro y el símbolo blanco al cambiar entre temas claro y oscuro.

## [0.3.2] — 2026-10-05

### Fixed
- **Colores de novedades**: el resplandor bajo la cabecera ahora es gris/negro, sin matiz azul, y el rótulo «Novedades» vuelve al verde de acento.

## [0.3.1] — 2026-10-05

### Changed
- **Página pública de novedades**: el degradado del encabezado, los controles de tema en grupo y la escala del título siguen la referencia; el tema ahora se puede elegir entre sistema, claro y oscuro.

### Fixed
- **Aviso de CORS en novedades del proyecto**: ahora indica el origen real desde el que se usa Cowork, también al probarlo en local.
- **Acceso al progreso de racha**: el botón de la tarjeta de celebración queda en una fila propia, debajo del contador y separado del control para cerrar el aviso.
- **Importación de páginas de novedades**: Cowork ahora lee las tarjetas agrupadas por versión y sección, en vez de tomar el encabezado general como una tarea; el mensaje distingue propuestas detectadas de tareas creadas.
- **Tipo de versión en las propuestas**: Cowork conserva por separado el tipo principal (Major, Feature o Fix) y el grupo de cada tarjeta (Nuevo, Cambios o Arreglos), incluso al guardar y sincronizar la propuesta; cada tipo tiene un badge de color propio y Unreleased aparece en azul a la izquierda.
- **Separación en Plan de trabajo**: tablero, propuestas de novedades e hitos mantienen un espacio uniforme, más compacto en móvil y también presente durante la carga.

## [0.3.0] — 2026-10-04

### Added
- **Sincronización de novedades con tareas** (`changelog-sync/`): el propietario configura una URL pública HTML, Markdown/CHANGELOG o de releases de GitHub. Al abrir el tablero o pulsar Sincronizar, Cowork propone tareas en una cola compartida y reconoce estado y títulos existentes. Cada alta, vínculo o cambio de estado requiere aprobación manual.

### Changed
- **Reglas de Firestore**: validan el enlace de novedades del proyecto y limitan la cola compartida a propuestas acotadas, revisión de personas activas e integridad del contenido asociado.

### Fixed
- **Tarjeta de racha**: contador y acceso al progreso quedan bien alineados; la llama tiene una entrada escalonada y un brillo suave en reposo.

## [0.2.0] — 2026-10-02

### Added
- **Tablero Kanban** (`KanbanView.tsx`): columnas Pendiente, En curso y Hecha con arrastre por puntero y teclado
  (Espacio para tomar, flechas, Espacio para soltar, Escape para cancelar, anuncios en `role="status"`) y el select de
  estado como alternativa. Vista de lista por fases (`TaskListView.tsx`); la vista elegida se recuerda
  (`cowork.task-view`).
- **Detalle de la tarea** (`TaskDrawer.tsx`, carga diferida): descripción, prioridad, fecha límite con zona horaria,
  lista de pasos (hasta 20, guardada como texto JSON de hasta 8000 caracteres para no pasar el límite de expresiones
  de las reglas) y rama. Cola de guardado que espera cada revisión y pasos optimistas.
- **Filtros** (`taskFilters.ts`): texto, responsable, estado, hito, prioridad y fecha, con vencidas.
- **Orden entero de tareas** con hueco de 2^20, inserción por punto medio y reespaciado cuando no hay sitio.
- **Página Código** (`#code?ref=&path=&L=`): `FolderTree` y `CodeBlock` propios con la API de ScrollX UI, iconos de
  Material Icon Theme (MIT, copiados por `scripts/file-icons.mjs`), resaltado con Shiki cargado por idioma, marcas de
  cambios contra la rama principal y enlaces a líneas y rangos.
- **Barra del repositorio** (`RepoToolbar.tsx`, `Popover.tsx`): selector de rama o etiqueta con búsqueda, recuentos
  de ramas y etiquetas (`listAllTags`), «Ir a archivo» con búsqueda difusa (`fuzzyFindFiles`) y la tecla `T`,
  «Añadir archivo», recarga y menú «Código» con HTTPS, SSH, GitHub CLI, ZIP y GitHub (`cloneUrls`).
- **Archivos propuestos** (`fileDrafts.ts`, `FileDraftEditor.tsx`): `projects/{id}/fileDrafts` y
  `fileDraftContents` (hasta 650 KB), marcas P y X en el árbol (`mergeDrafts`), aprobación que sube el archivo con
  `PUT /contents` y la cuenta del revisor, rechazo con motivo y descarte. Eventos `file-{id}` (`-rejected`, `-done`,
  `-discarded`) e ítems de «Para ti» (`draftItems`).
- **Vista previa de archivos** (`FilePreview.tsx`): imágenes con fondo a cuadros, oscuro o claro, dimensiones y
  ampliación con píxeles nítidos para iconos pequeños; SVG como imagen o como código (`ViewSwitch`); binarios,
  archivos grandes y errores con «Ver en GitHub» y «Descargar»; `GitHubLink` con el logo de GitHub.
- **Novedades** (`/novedades`, `ChangelogPage.tsx`, `releases.ts`): página pública bilingüe ES/EN con modo claro u
  oscuro, enlazada desde el pie de la portada y del selector de proyectos. Se carga sin la app ni Firebase.
- **Video de presentación** (`docs/video/cowork-tour-es.mp4` y `-en.mp4`, 77 s, 1920 × 1080): capturas sembradas en
  los emuladores (`tests/e2e/tour-capture.spec.ts`, `npm run video:capture`), escenas en HTML renderizadas con el
  Chromium de Playwright y banda sonora sintetizada (`docs/video/source/`). Ver `docs/VIDEO.md`.
- **Sistema de versiones:** `VERSION` como única fuente (Vite la expone como `__APP_VERSION__`),
  `scripts/version.mjs` (`npm run version:check` y `npm run version:bump -- <major|minor|patch>`), prueba unitaria de
  coherencia y flujos de GitHub `build` y `prepare-release` (borrador de release con las notas de este archivo).
- Cliente de GitHub con caché en memoria: ETag con `If-None-Match`, respuestas inmutables por SHA, LRU, peticiones en
  curso compartidas y corte por límite de consultas. `repositoryStore` compartido entre vistas, con sondeo cada 5 min.
- Skeletons para el tablero, el panel de tarea, las ramas, la configuración, el árbol, el visor y la barra del
  repositorio (`PageSkeletons.tsx`).

### Changed
- **Ramas** (`BranchList.tsx`, `branchModel.ts`): una sola lista que reconcilia el registro y GitHub, con pull
  request, adelanto y retraso frente a la principal, commits, tareas vinculadas y «Ver código»; quitar una entrada
  del registro escribe su evento `branch-{id}-deleted`.
- **Resumen** (`HomePage.tsx`, `home.css`): rejilla con áreas con nombre; Para ti, Avance y Próximo hito arriba;
  Actividad, Repositorio y Código debajo.
- **Acciones neutras** (`project-actions.css`): un botón principal claro por formulario, secundarios de vidrio y
  terciarios sin relleno, anillo de foco blanco (también sobre el `:focus-visible` global) y una sola familia
  monoespaciada.
- Navegación por hash con parámetros (`parseHash`, `buildHash`, `useHashParams`).
- Actividad: `taskChanges` registra cada campo nuevo de la tarea, `eventTarget` lleva a la tarea, al hito o al
  archivo, y los eventos que solo cambian el orden quedan fuera del registro.
- Reglas de Firestore: claves de detalle de tareas con `pairOk`/`flagOk`, `branchEventConsistent` con borrado,
  bloques `fileDrafts` y `fileDraftContents` y `fileEventConsistent` en `validEvent`.

### Fixed
- Una tarjeta soltada deprisa se perdía: el destino se calcula en el mismo `pointerup`. Las columnas ya no se
  encogen al arrastrar (se fija la altura mínima del tablero).
- El calendario de entregas aparecía en azul y blanco cuando los estilos de react-day-picker cargaban después.
- El selector de vista del tablero se apilaba en vertical dentro de `.panelHead`.
- La preferencia de movimiento del sistema apagaba las animaciones aunque la persona eligiera «Activado»; ahora GSAP,
  WebGL y las transiciones CSS respetan la opción personal.
- `SiteFavicon.tsx`: reconoce las rutas de icono que usan `istargetsleeping.web.app` y
  `vetcentercaninosyfelinos.web.app`. Cambia la clave de caché para volver a probar los sitios que habían quedado
  guardados como «sin icono».

## [0.1.0] — 2026-09-29

### Added
- Proyectos privados con Firebase Auth y Firestore (plan Spark), portada sin datos de equipos y selector con
  búsqueda sin acentos, favoritos y orden personal.
- Acceso por enlace o QR con aprobación del propietario, nuevos intentos, historial y transferencia de propiedad.
- Tareas con responsable y estado, hitos con fecha y zona horaria y plazo de entrega con cuenta regresiva o escena
  pixel art.
- Actividad con bandeja «Para ti» y estado de lectura sincronizado.
- Rachas, puntos, protectores, escudos, amigos con códigos y toques, y la colección pixel art.
- Registro de ramas y conexión con GitHub: repositorios privados, crear y borrar ramas según la política del proyecto.
- Pruebas unitarias, de reglas, del backend Spark y e2e con Playwright contra los emuladores.

[Unreleased]: https://github.com/Tykillita/Cowork/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Tykillita/Cowork/compare/v0.4.2...v0.5.0
[0.4.2]: https://github.com/Tykillita/Cowork/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/Tykillita/Cowork/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Tykillita/Cowork/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/Tykillita/Cowork/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/Tykillita/Cowork/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/Tykillita/Cowork/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Tykillita/Cowork/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Tykillita/Cowork/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Tykillita/Cowork/compare/50df786...v0.2.0
[0.1.0]: https://github.com/Tykillita/Cowork/commit/50df786
