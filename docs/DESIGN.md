# Guía de diseño de Cowork

Reglas de interfaz que cualquier cambio debe respetar, lo haga una persona o un agente (Claude, Codex u otro). Si una regla no encaja con lo que necesitas, cámbiala aquí primero; no crees una variante local.

## Lenguaje visual

- **Vidrio oscuro neutro.** Superficies translúcidas sobre casi negro, bordes blancos translúcidos (`--line`, `--line-strong`, `--tile`, `--tile-line` en `src/styles/tokens.css`). Usa los tokens, no colores sueltos.
- **Menta con moderación.** `--mint` solo para señales pequeñas de estado (un punto, un chip). Los resaltados de paneles, botones y menús nuevos son neutros: rellenos `rgba(255,255,255,.06–.16)` y texto `var(--text)` / `var(--secondary)`.
- **Menús en móvil = modal.** En pantallas de 640 px o menos, cualquier menú, popover o `<select>` se abre como modal centrado sobre un fondo atenuado. En escritorio es un desplegable anclado. La base está en `src/styles/shell.css`.
- **Movimiento reducido.** Toda animación nueva debe detenerse con `html[data-motion="reduced"]` (lo gestiona `PersonalContext`) y con `@media (prefers-reduced-motion: reduce)`.

## Estados de carga: skeleton loaders (obligatorio)

Mientras se esperan datos, Cowork muestra **skeletons con la misma forma que el contenido final**. Es el único patrón de carga permitido, para que toda la app se vea uniforme.

### Prohibido

- Textos de espera como "Cargando…", "Preparando…" o "Consultando…" en lugar de contenido.
- Spinners.
- Ceros o valores falsos mientras no hay datos ("0 de 0", "0 puntos", "…").
- Mostrar el estado vacío ("Todavía no hay…") antes de que llegue la primera respuesta.
- Crear otro estilo de skeleton, otra animación de shimmer u otros colores para un placeholder.

Los botones que describen una acción en curso ("Guardando…", "Actualizando…") sí se permiten: no son estados de carga de contenido.

### Piezas predefinidas (reutilízalas siempre)

| Pieza | Dónde | Uso |
|---|---|---|
| `Sk` | `src/components/Skeleton.tsx` | Un bloque. `shape`: `line` (línea de texto que hereda el tamaño de la fuente, por defecto), `block`, `circle` o `pill`. Tamaño con `w`, `h` y `r`; `inline` para cifras dentro de una frase. |
| `SkText` | ídem | Párrafo de varias líneas, con la última más corta. |
| `SkGroup` | ídem | Contenedor de la región que carga: `role="status"`, `aria-busy` y `aria-label` en español ("Cargando tareas"). Aparece con 150 ms de retraso para que una carga rápida no parpadee. |
| `SkImg` | ídem | `<img>` que brilla en su propio hueco hasta que la imagen carga o falla. Úsalo para avatares, fotos e iconos remotos. |
| `repeat(n, fn)` | ídem | N filas de skeleton. |
| `.sk`, `.skFill`, `.skGrow`, `.skHeaderDock` | `src/styles/skeleton.css` | El único shimmer de la app, con los tokens `--sk-base`, `--sk-shine` y `--sk-speed` de `tokens.css`. |
| `BootSkeleton` | `src/components/BootSkeleton.tsx` | Arranque de la app: toma la forma de la última pantalla usada (portal, selector o proyecto) según `cowork.boot` en `localStorage`. |

Ejemplos existentes que puedes copiar:
- `TaskRowsSkeleton` y `TaskBoardSkeleton` en `TaskBoard.tsx`.
- `MilestonesSkeleton` en `MilestonesPanel.tsx`.
- `BranchListSkeleton` y `BranchesPageSkeleton` en `BranchesPage.tsx`.
- `MemberRowsSkeleton`, `AccessLinkSkeleton` y `ProjectSettingsSkeleton` en `ProjectSettingsPage.tsx`.
- `FriendSkeleton` en `StreakFriends.tsx`.
- `RequestRowsSkeleton` en `FriendRequests.tsx`.
- `ActivitySkeleton` en `ActivityCenter.tsx`.
- `BranchesSkeleton` y `CommitsSkeleton` en `RepositoryCards.tsx`.
- `HeroSkeleton` en `HomePage.tsx`.

### Cómo se construye un skeleton

1. **Misma forma, mismas clases.** El skeleton usa el contenedor y las clases de layout del componente real (`.taskRow`, `.overviewCard`, `.projectMemberRow`, `.streakFriend`…) y solo sustituye por `Sk` el texto, las imágenes y los controles que dependen de datos. Así padding, grid, bordes y breakpoints coinciden y nada se mueve al cargar. Si una regla de ancho depende de un `id` (por ejemplo `#task-board`), el skeleton lleva el mismo `id`.
2. **Lo estático se queda real.** Títulos, etiquetas, iconos y textos fijos se muestran tal cual. Solo se sustituye lo que viene de Firestore, GitHub o la sesión.
3. **Cifras en su sitio.** Un contador pendiente es `<Sk inline w="2ch" />` dentro del mismo elemento, nunca `0` ni `…`.
4. **Número de filas realista.** Usa el número típico de elementos (1 amigo, 3 miembros, 5 tareas). Si hay caché, usa su tamaño.
5. **Un flag de carga por fuente de datos.** Distingue "cargando" de "vacío" con un flag que empiece en `false` y pase a `true` en la primera respuesta o en un error. Ejemplos: `useWorkboard().ready`, `walletReady` y `progressReady` en `PersonalContext`, y `ready` en `useActivityCenter`. Nunca derives "cargado" de `lista.length`.
6. **Una recarga no vuelve al skeleton.** Si ya hay datos (paginar, refrescar, "Cargar más"), se mantienen en pantalla. Como mucho se añaden filas skeleton al final de la lista.
7. **Accesibilidad.** La región que carga es `SkGroup` (o lleva `aria-busy="true"`). Los bloques son `aria-hidden`. Las pruebas localizan la vista real con `:not([aria-busy])`.
8. **Neutro, sin menta.** El shimmer es blanco translúcido. No lo tiñas.

### Cuando añadas o cambies una vista

- Una vista nueva que espera datos **debe** incluir su skeleton en el mismo cambio, hecho con las piezas de arriba.
- Si cambias el layout de una vista, actualiza también su skeleton para que la forma siga coincidiendo.
- Para comprobarlo, compara el skeleton con la vista cargada al mismo ancho (1280 px y 390 px). Las tarjetas y filas deben medir lo mismo y no debe haber saltos.
