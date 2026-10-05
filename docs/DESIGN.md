# Guía de diseño de Cowork

Reglas de interfaz que cualquier cambio debe respetar, lo haga una persona o un agente (Claude, Codex u otro). Si una regla no encaja con lo que necesitas, cámbiala aquí primero; no crees una variante local.

## Lenguaje visual

- **Vidrio oscuro neutro.** Superficies translúcidas sobre casi negro, bordes blancos translúcidos (`--line`, `--line-strong`, `--tile`, `--tile-line` en `src/styles/tokens.css`). Usa los tokens, no colores sueltos.
- **Menta con moderación.** `--mint` solo para señales pequeñas de estado (un punto, un chip). Los resaltados de paneles, botones y menús nuevos son neutros: rellenos `rgba(255,255,255,.06–.16)` y texto `var(--text)` / `var(--secondary)`.
- **Acciones dentro de un proyecto** (`src/styles/project-actions.css`):
  - **Principal:** un botón claro sólido por formulario (los `submit` y las acciones de `.projectSettingsActions`).
  - **Secundarias:** vidrio neutro.
  - **Terciarias:** `.plain` y `.ghost`, sin relleno.
  - Los campos enfocados llevan un anillo blanco suave. Todo `code` usa la misma familia monoespaciada.
  - El verde antiguo de los botones queda solo fuera de los proyectos (portal y selector).
- **Ancho de página:** Resumen, Plan de trabajo, Ramas y Código usan todo el ancho de `main`. Configuración usa un índice lateral de secciones a más de 1120 px y una columna de formularios de hasta 880 px.
- **Menús en móvil = modal.** En pantallas de 640 px o menos, cualquier menú, popover o `<select>` se abre como modal centrado sobre un fondo atenuado. En escritorio es un desplegable anclado. La base está en `src/styles/shell.css`.
- **Movimiento reducido.** «Sistema» sigue `prefers-reduced-motion`; «Activado» y «Reducido» prevalecen sobre el sistema. Las reglas CSS de `@media (prefers-reduced-motion: reduce)` deben excluir `html[data-motion="full"]`, y el movimiento en JavaScript debe consultar `motionReduced()` o el valor `reducedMotion` de `PersonalContext`.

## Resumen del proyecto

El resumen (`src/pages/HomePage.tsx`, estilos en `src/styles/home.css`) usa una rejilla con áreas con nombre. El orden del DOM es el orden de lectura en todos los anchos:

| Ancho | Columnas | Orden |
|---|---|---|
| Más de 1120 px | 12 | Para ti · Avance · Próximo hito; debajo, Actividad (ancha) con Repositorio y Código apilados a su derecha |
| 641–1120 px | 2 | Para ti; Avance y Próximo hito; Actividad; Repositorio y Código |
| 640 px o menos | 1 | El mismo orden, una tarjeta por fila |

Las tarjetas son `article.panel.homeCard` con enlaces dentro, y sus antetítulos (`.homeEyebrow`) son neutros. La lista «Completa el proyecto» solo la ve el propietario, y solo mientras falte algo.

## Plan de trabajo

- El encabezado, el tablero, las propuestas de novedades y los hitos forman una pila con 16 px entre bloques (12 px en móvil); el skeleton usa la misma clase de layout.

## Arrastrar y soltar

- Cada cosa que se arrastra tiene **otra forma de moverla sin arrastrar**: el teclado (Espacio para tomar, flechas, Espacio para soltar, Escape para cancelar, con anuncio en una región `role="status"`) y un control normal, como el select de estado de las tarjetas.
- En táctil se arrastra solo desde el asa (`touch-action: none` solo en el asa), para que la página siga desplazándose.
- El hueco de destino es un borde discontinuo neutro. La tarjeta levantada se resalta con borde y relleno neutros, nunca con menta.
- Con movimiento reducido no hay transiciones: la tarjeta aparece directamente en su sitio.

## Árbol de archivos y código

- La fila seleccionada del árbol lleva un relleno neutro y una barra a la derecha en `--text`.
- **Marcas de cambios:** M y R en ámbar, A en menta y D en rojo. Los recuentos de las carpetas son neutros.
- **Archivos propuestos:** P en ámbar y X en rojo, siempre con borde discontinuo para distinguirlos de los cambios reales. La franja de revisión usa el mismo borde discontinuo.
- **Barra del repositorio:** botones de vidrio neutro de 34 px con iconos de línea propios (`repoIcons.tsx`), recuentos como texto sin borde y un único botón claro principal, «Código». Sus menús son `Popover`: desplegable anclado en escritorio y modal centrado a 640 px o menos. Los resultados de «Ir a archivo» son una lista anclada bajo el campo en todos los anchos, para no tapar lo que se escribe.
- El visor de código es una ventana de vidrio oscuro con los tres puntos de color como único adorno. El tema claro es opcional.
- Imágenes, binarios y archivos grandes usan esa misma ventana (`FilePreview`), nunca un panel suelto. Los enlaces a GitHub llevan su logo (`GitHubLink`): una píldora neutra en la cabecera y un botón claro en los estados vacíos.

## Página de novedades

`/novedades` (`src/pages/ChangelogPage.tsx`, `src/styles/changelog.css`) sigue la estructura de la web de novedades de isTargetSleeping con el lenguaje de Cowork:

- navegación fija, hero con el índice de versiones, línea de tiempo con la versión a la izquierda y las tarjetas a la derecha, y un pie de cuatro columnas;
- es la única vista con **tema claro**, además del oscuro, porque es pública: permite elegir entre sistema, claro u oscuro, sigue al sistema por defecto y guarda la elección en `cowork.site-theme`;
- el idioma sigue al navegador y se guarda en `cowork.site-lang`;
- el tipo de versión es una chip pequeña: menta para Feature, sólida para Grande, neutra para Arreglo y discontinua para Próxima;
- en las propuestas de tareas, Major usa fondo sólido, Feature menta, Fix ámbar y Unreleased azul; la etiqueta va antes del grupo y la versión;
- las tarjetas son vidrio neutro.

## Paneles laterales

`Drawer` (`src/components/Drawer.tsx`) es un `<dialog>` modal: hoja lateral en escritorio y modal centrado a 640 px o menos. El panel de tareas y su skeleton lo comparten.

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
- `HeroSkeleton`, `HomeListSkeleton` y `HomePageSkeleton` en `src/components/PageSkeletons.tsx` (resumen del proyecto).
- `TaskRowsSkeleton`, `KanbanSkeleton`, `TaskBoardSkeleton` (toma la vista recordada) y `MilestonesSkeleton` en `src/components/PageSkeletons.tsx`.
- `TaskDrawerSkeleton` en `src/components/PageSkeletons.tsx`: el mismo `Drawer` (`src/components/Drawer.tsx`) que el panel real.
- `BranchRowsSkeleton` y `BranchesPageSkeleton` en `src/components/PageSkeletons.tsx`.
- `MemberRowsSkeleton`, `AccessLinkSkeleton` y `ProjectSettingsSkeleton` en `src/components/PageSkeletons.tsx`.
- `FriendSkeleton` en `StreakFriends.tsx`.
- `RequestRowsSkeleton` en `FriendRequests.tsx`.
- `ActivitySkeleton` en `ActivityCenter.tsx`.
- `FolderTreeSkeleton`, `CodeViewerSkeleton` y `CodePageSkeleton` en `src/components/PageSkeletons.tsx`. Este archivo importa `FolderTree.css` y `CodeBlock.css` para que la forma exista antes de que llegue el chunk de la página.
- Las filas de commits de `BranchesPage.tsx` y del detalle de rama (`src/features/branches/BranchList.tsx`).

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
