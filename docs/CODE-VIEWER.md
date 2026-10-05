# Explorador de código

La página **Código** (`#code`) muestra los archivos del repositorio del proyecto en cualquier rama o etiqueta. Arriba tiene una barra como la de GitHub; debajo, un árbol de carpetas a la izquierda y el archivo abierto a la derecha. Los archivos se consultan en `api.github.com` con la cuenta de GitHub de cada persona. En Firestore solo se guardan los archivos propuestos que esperan revisión (ver [Archivos propuestos](#archivos-propuestos)).

## Barra del repositorio

`src/features/code/RepoToolbar.tsx`, con los menús de `src/components/ui/Popover.tsx`:

| Control | Qué hace |
|---|---|
| Selector `⑂ main ▾` | Busca y cambia de rama o de etiqueta (pestañas **Ramas** y **Etiquetas**). La rama principal va primero y lleva «principal». Se maneja con ↑ ↓, Intro y Escape. |
| `N ramas` | Enlace a **Ramas y cambios**. |
| `N etiquetas` | Abre el selector en la pestaña **Etiquetas** (`GET /tags`, en el `repositoryStore` compartido). |
| **Ir a archivo** `T` | Búsqueda difusa de rutas (`fuzzyFindFiles` en `repoTree.ts`): las letras en orden, con prioridad para el nombre del archivo, los inicios de palabra y las letras seguidas. La tecla `t` lo enfoca desde cualquier parte de la página, salvo mientras se escribe. En repositorios grandes solo busca en las carpetas ya abiertas, y lo avisa. |
| **Añadir archivo ▾** | «Crear archivo nuevo» o «Subir archivos». Ambos crean propuestas pendientes de revisión. |
| ⟳ | Vuelve a pedir el repositorio y el árbol sin volver al skeleton (`repository.refresh()` y `useRepoTree().reload()`). |
| **Código ▾** | El botón claro principal. Muestra los comandos para clonar por **HTTPS**, **SSH** o **GitHub CLI**, con botón de copiar; «Descargar ZIP» de la rama o etiqueta, y «Abrir en GitHub» (el archivo abierto o el repositorio). Las URL salen de `cloneUrls`, y la pestaña elegida se recuerda en `localStorage`. |

La nota de cambios respecto a la rama principal es una chip en la cabecera del árbol («3 cambios»). Hasta 800 px, ramas y etiquetas quedan solo con icono (los recuentos siguen en sus etiquetas accesibles y títulos), «Añadir archivo» queda como **+** y «Ir a archivo» abre un modal **Archivos**. La barra ocupa una fila entre 600 y 800 px y dos por debajo de 600 px. El modal comparte la rama, el árbol, las carpetas abiertas y los archivos propuestos con la página: muestra el árbol sin búsqueda y una lista de rutas al escribir; elegir un archivo cierra el modal y lo abre en el visor. **T** abre este buscador en la vista compacta y enfoca el campo original en escritorio. Los menús de rama y **+** permanecen dentro del modal; fuera de él se conserva el patrón de menús centrados en móvil.

## Archivos propuestos

Crear o subir un archivo desde Cowork no escribe en GitHub: deja una **propuesta pendiente de revisión**. Cuando alguien con permiso la aprueba, su navegador hace el commit con su propia cuenta de GitHub. El plan Spark no tiene Cloud Functions ni Storage, así que todo vive en Firestore.

- **Datos** (`src/features/code/fileDrafts.ts`):
  - `projects/{id}/fileDrafts/{draftId}`: rama de destino, ruta, codificación (`utf-8` o `base64`), tamaño, mensaje del commit, estado (`pending` o `rejected`), autoría y revisión.
  - `projects/{id}/fileDraftContents/{draftId}`: el contenido, en un documento aparte para que la lista y el centro de actividad no lo descarguen.
  - Límite de 650 KB por archivo, que en base64 todavía cabe en un documento de Firestore. Los archivos de texto se guardan tal cual; los binarios, en base64.
- **En el árbol:** `mergeDrafts` añade las propuestas de la rama abierta con la marca **P** (pendiente) o **X** (rechazada), con borde discontinuo. «N pendientes» en la barra lista todas las del proyecto.
- **Al abrir una propuesta**, una franja encima del archivo indica quién la propuso, para qué rama, su tamaño y si reemplaza un archivo existente:
  - **Revisores:** **Aprobar y subir a GitHub** y **Rechazar**, con un motivo opcional.
  - **Autor:** **Descartar**.
  - Una propuesta rechazada muestra el motivo.
- **Quién revisa:** la misma política que las ramas (`githubPolicy.branchWrite`). Para aprobar también hace falta `permissions.push` en GitHub. Para rechazar basta la política.
- **Aprobar:**
  1. Lee el SHA actual del archivo (`GET /contents/{ruta}?ref=`), si ya existe.
  2. Sube el archivo con `PUT /contents/{ruta}`. El mensaje es el propuesto más «Propuesto por {autor} en Cowork.».
  3. Actualiza la rama y borra la propuesta con su evento.

  Si GitHub falla, la propuesta sigue pendiente y se muestra el error.
- **Rama de destino:** la rama abierta. Si lo abierto es una etiqueta o un commit, la propuesta va a la rama principal.
- **Actividad:** «propuso», «rechazó», «aprobó y subió a GitHub» y «descartó». No dan puntos.
- **«Para ti»:** los revisores ven «N archivos esperan revisión» (`draftItems` en `useActivityCenter.ts`), y el autor ve «Rechazaron tu archivo X» hasta que lo lee.
- **Reglas:**
  - Crear exige que la persona sea miembro, sea el autor, y que el contenido y el evento `file-{id}` se escriban en el mismo lote.
  - Rechazar solo cambia el estado y los campos de revisión, y solo puede hacerlo un revisor.
  - Borrar exige el evento `-done` (de un revisor, con la propuesta pendiente) o `-discarded` (del autor, o de un revisor si la propuesta ya fue rechazada), junto con el contenido.
  - El contenido no se puede editar.

## Enlaces

`#code?ref=<rama>&path=<archivo>&L=<línea o rango>`

- **`ref`:** la rama o el commit. Si falta, se usa la rama principal.
- **`path`:** el archivo abierto. Sus carpetas se abren solas.
- **`L`:** `12` o `10-20`. Las líneas se marcan y la vista se desplaza hasta ellas.
  - Al pulsar un número de línea se fija `L`; con Mayúsculas se marca un rango.
  - Abrir un archivo crea una entrada en el historial; cambiar la línea marcada no.

Llegan aquí la opción «Explorar código» del menú, la tarjeta **Código** del Resumen, «Ver código» en cada rama y «Ver código» en el detalle de una tarea vinculada a una rama.

## Datos

| Paso | Llamada | Caché |
|---|---|---|
| Commit de la rama | Desde la lista de ramas compartida; si la rama no está en ella, `GET /commits/{ref}` | Revalidación con ETag |
| Árbol | `GET /git/trees/{sha}?recursive=1` | Por SHA, nunca se vuelve a pedir |
| Repositorio grande | Si GitHub marca el árbol como `truncated`, se carga la raíz y cada carpeta al abrirla (`GET /git/trees/{sha}` de la carpeta) | Por SHA |
| Archivo | `GET /git/blobs/{sha}` con `Accept: application/vnd.github.raw+json` | Por SHA (caché LRU de unos 25 MB) |
| Marcas de cambios | `GET /compare/{principal}...{rama}`: A (añadido), M (modificado), R (renombrado); los eliminados se listan aparte | Revalidación con ETag |

- **Archivos de más de 1 MB:** no se descargan. Se ofrecen «Ver en GitHub» y «Descargar» (`/raw/` en github.com).
- **Imágenes:** se muestran desde un `blob:` en una etiqueta `<img>`. Así, un SVG nunca ejecuta scripts.
- **Otros binarios:** se detectan por un byte nulo o por UTF-8 inválido, y no se muestran.
- **Comparaciones grandes:** GitHub devuelve como máximo 300 archivos por comparación. Por encima de ese número, la página avisa de que las marcas pueden estar incompletas.

## Componentes

- **`src/components/ui/FolderTree.tsx`** tiene la misma API compuesta que el FolderTree de ScrollX UI: `FolderTree.Root`, `FolderTree.Item` y `FolderTree.Content`, con `defaultExpanded`, `defaultSelected` o sus versiones controladas, `onSelect`, `onExpand` y `badge`.
  - **Accesibilidad:** sigue el patrón ARIA de árbol, con un solo punto de tabulación.
  - **Teclado:** flechas, Inicio y Fin, Intro o Espacio, `*` para abrir las carpetas hermanas y búsqueda al teclear.
  - **Rendimiento:** solo se dibujan las carpetas abiertas. Las carpetas con más de 500 elementos muestran «Mostrar más».
- **`src/components/ui/CodeBlock.tsx`** tiene las funciones del CodeBlock de ScrollX UI:
  - cabecera de ventana con ruta y estadísticas;
  - pestañas;
  - números de línea y líneas marcadas;
  - copiar, descargar y pantalla completa (un `<dialog>`, que se cierra con Escape);
  - pie con lenguaje, líneas, caracteres y codificación;
  - tema oscuro o claro.

  El texto aparece al instante y se colorea cuando llega el resaltado.
- **`src/components/ui/FilePreview.tsx`** muestra en la misma ventana lo que no es código: imágenes, binarios, archivos demasiado grandes y errores de lectura.
  - **Imágenes:** se ven sobre un escenario con fondo a cuadros, oscuro o claro; el fondo elegido se recuerda. El pie indica el tipo, las dimensiones y el peso. Los iconos de menos de 64 px se amplían con píxeles nítidos.
  - **SVG:** el interruptor «Vista previa / Código» cambia entre la imagen y su fuente resaltada, como en GitHub.
  - **Binarios, archivos grandes y errores:** un estado vacío con el icono del archivo, «Ver en GitHub» y «Descargar».
  - **Enlace a GitHub:** `GitHubLink`, con el logo de GitHub. Es una píldora en la cabecera de la ventana, también en la de los archivos de código, y un botón en los estados vacíos. Las propuestas pendientes no lo muestran, porque aún no están en GitHub. Los tokens se pintan como texto de React, nunca como HTML. Los archivos largos se dibujan en bloques de 500 líneas con `content-visibility`.
- Los estilos son propios y no usan Tailwind (`FolderTree.css`, `CodeBlock.css` y `src/styles/code.css`), con los tokens de vidrio oscuro de `tokens.css`. La menta solo aparece en la marca «A».

## Iconos de archivos y carpetas

El árbol y el visor usan los iconos de [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme), el tema de iconos de VS Code. Tienen licencia MIT, que se copia junto a los iconos como `LICENSE.txt`.

- **Generación:** `npm run icons` (`scripts/file-icons.mjs`) copia los SVG desde el paquete `material-icon-theme` a `public/file-icons/`, carpeta que no se versiona. También genera un manifiesto compacto de unos 112 KB (22 KB comprimido).
- **Cuándo se ejecuta:** `npm run build`, `npm run build:emulators` (y con él `npm run dev`) y `npm run dev:vite` lo ejecutan antes de empezar.
- **Qué icono corresponde a cada elemento** (`src/features/code/fileIcons.ts`):
  - **Archivos**, como en VS Code: primero el nombre exacto (`package.json`, `Dockerfile`, `README.md`), después la extensión más larga (`test.tsx` antes que `tsx`) y, si no hay ninguna, el icono genérico.
  - **Carpetas:** por nombre, aunque lleven decoración (`.github`, `__tests__`). Al abrirse muestran su variante `-open`.
- **Carga:** el manifiesto se descarga solo en la página Código. Cada SVG se pide al aparecer en el árbol, desde el propio dominio y sin CDN externos. Mientras el manifiesto carga, o si falta, el árbol usa los iconos de línea neutros.
- **Componentes:** `FolderTree.Item` acepta `icon`, que puede ser un nodo o una función que recibe si la carpeta está abierta. `CodeFile` acepta `icon` para la barra del archivo y las pestañas.

## Resaltado

`src/features/code/highlighter.ts` usa Shiki con carga diferida:
- `shiki/core`;
- el motor de expresiones regulares en JavaScript, sin WebAssembly, que funcionaría también bajo una CSP estricta;
- una gramática por lenguaje cuando hace falta: TypeScript, TSX, JavaScript, JSX, JSON, CSS, HTML, XML, Markdown, YAML, TOML, Shell, Python, SQL, Diff y Dockerfile.

Usa el tema `github-dark-default`; el tema claro solo se descarga si se elige. Los archivos de más de 5000 líneas o 300 000 caracteres se muestran sin colores.

Nada de esto entra en el bundle principal. `tests/e2e/code.spec.ts` comprueba que el Resumen no descarga los chunks de Shiki y que la página Código sí.

## Estados

- **Sin repositorio:** el propietario ve el enlace a Configuración → GitHub.
- **Repositorio privado sin GitHub conectado:** se muestra el mensaje de GitHub y el botón **Conectar GitHub**.
- **Repositorio vacío** (GitHub responde 409): «El repositorio todavía no tiene archivos».
- **Límite de consultas:** se muestra la hora de reinicio. Los archivos ya abiertos siguen disponibles, porque están en caché.
- **Mientras carga:** el árbol y el visor usan `FolderTreeSkeleton`, `CodeViewerSkeleton` y `CodePageSkeleton` (con `RepoToolbarSkeleton`). En la barra, la rama y los recuentos son bloques `Sk` dentro de los mismos botones.
- **Móvil:** a 640 px o menos se muestra una cosa a la vez, el árbol o el archivo, con «← Archivos» para volver.

## Pruebas

- **Unitarias:**
  - `tests/unit/repoTree.test.ts`: árbol, orden natural, lenguajes, binarios, rangos de líneas, marcas, «Ir a archivo», URL para clonar y propuestas en el árbol.
  - `tests/unit/fileDrafts.test.ts`: rutas, contenido, mensaje del commit y textos de actividad.
- **Reglas:** `tests/firestore.rules.test.mjs`, bloque «file drafts».
- **E2E:** `tests/e2e/code.spec.ts`, con árboles, blobs, comparaciones, etiquetas y `GET`/`PUT /contents` simulados en `tests/e2e/githubMock.ts`.
