/**
 * Public changelog ("Novedades", /novedades), newest first. Rule (AGENTS.md):
 * every new version or feature adds its entry here in the same change, in
 * Spanish and English; the technical detail lives in CHANGELOG.md. Work not
 * released yet goes in NEXT until the version is bumped.
 */

/** Every text exists in both languages: the type leaves no translation out. */
export type Text = { es: string; en: string };
export type Lang = keyof Text;

/** Size of the jump, as in the version table of AGENTS.md. */
export type ReleaseKind = "grande" | "feature" | "arreglo";

export interface ReleaseItem {
  title: Text;
  body: Text;
  /** Spans both columns. */
  wide?: boolean;
}

export interface Release {
  version: string;
  /** Day of the CHANGELOG section (YYYY-MM-DD). */
  date: string;
  /** False until the `vX.Y.Z` release is published on GitHub: the page says "En desarrollo". */
  released: boolean;
  kind: ReleaseKind;
  summary: Text;
  added: ReleaseItem[];
  changed: ReleaseItem[];
  fixed: ReleaseItem[];
}

export interface Upcoming {
  summary: Text;
  added: ReleaseItem[];
  changed: ReleaseItem[];
  fixed: ReleaseItem[];
}

/** Features already merged that wait for the next version. */
export const NEXT: Upcoming = { summary: { es: "", en: "" }, added: [], changed: [], fixed: [] };

export const RELEASES: Release[] = [
  {
    version: "0.5.0",
    date: "2026-10-08",
    released: true,
    kind: "feature",
    summary: {
      es: "Une dos cuentas y amplía tu lista de amigos, con un máximo de cinco rachas activas.",
      en: "Join two accounts and grow your friends list while keeping at most five active streaks.",
    },
    added: [{
      title: { es: "Unir dos cuentas Cowork", en: "Merge two Cowork accounts" },
      body: {
        es: "Confirma el acceso a ambas cuentas y elige qué perfil conservar. Cualquiera de los dos inicios de sesión abre el perfil compartido; los UID de Firebase permanecen separados.",
        en: "Verify access to both accounts and choose the profile to keep. Either sign-in opens the shared profile, while the Firebase UIDs remain separate.",
      },
    }, {
      title: { es: "Más amigos, sin tope de cinco", en: "More than five friends" },
      body: {
        es: "Las amistades se consultan por páginas de veinte y ya no ocupan una plaza de racha por sí solas.",
        en: "Browse friendships in pages of twenty; a friendship alone no longer takes an active-streak slot.",
      },
    }],
    changed: [{
      title: { es: "Elige qué rachas conservar", en: "Choose which streaks to keep" },
      body: {
        es: "Al unir perfiles puedes mantener cinco rachas activas. Las demás se cierran y guardan su amistad e historial; las reglas también bloquean una fusión que supere ese límite.",
        en: "A merged profile can keep five active streaks. The others end with their friendships and history intact, and Firestore rules enforce the shared cap.",
      },
    }],
    fixed: [],
  },
  {
    version: "0.4.2",
    date: "2026-10-08",
    released: false,
    kind: "arreglo",
    summary: {
      es: "La página de novedades deja de mostrar una versión anterior guardada en caché.",
      en: "The changelog page no longer shows an older version from cache.",
    },
    added: [],
    changed: [],
    fixed: [
      {
        title: { es: "Novedades siempre actualizadas", en: "What's new stays current" },
        body: {
          es: "El navegador vuelve a consultar la página después de cada despliegue, para que el degradado y el contenido nuevos aparezcan al actualizar.",
          en: "The browser now checks the page after each deployment, so the updated glow and content appear on refresh.",
        },
      },
    ],
  },
  {
    version: "0.4.1",
    date: "2026-10-08",
    released: false,
    kind: "arreglo",
    summary: {
      es: "El portafolio manga mantiene el ancho correcto en tableta y escritorio.",
      en: "The manga portfolio keeps its width on tablet and desktop.",
    },
    added: [],
    changed: [],
    fixed: [
      {
        title: { es: "Ancho del portafolio corregido", en: "Portfolio width stays in view" },
        body: {
          es: "El resplandor del hero se ajusta al ancho visible y ya no causa desplazamiento horizontal en tabletas y escritorios.",
          en: "The hero glow now matches the visible width and no longer causes horizontal scrolling on tablets and desktops.",
        },
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-10-08",
    released: false,
    kind: "feature",
    summary: {
      es: "Un portafolio público cuenta en viñetas la historia de Linux, la colaboración abierta y Git.",
      en: "A public portfolio tells the story of Linux, open collaboration and Git in comic panels.",
    },
    added: [
      {
        title: { es: "Portafolio manga de Linus Torvalds", en: "Linus Torvalds manga portfolio" },
        body: {
          es: "Una página bilingüe de viñetas ilustradas recorre el primer anuncio de Linux, su desarrollo comunitario y Git como caso de estudio. Incluye cronología, fuentes enlazadas y una nota de independencia.",
          en: "A bilingual illustrated comic follows Linux's first announcement, its community development and Git as a case study. It includes a timeline, linked sources and an independence notice.",
        },
      },
    ],
    changed: [],
    fixed: [],
  },
  {
    version: "0.3.4",
    date: "2026-10-05",
    released: true,
    kind: "arreglo",
    summary: {
      es: "El degradado de novedades ahora empieza justo debajo de la cabecera y ocupa todo el ancho.",
      en: "The changelog glow now starts directly below the header and spans the full width.",
    },
    added: [],
    changed: [],
    fixed: [
      {
        title: { es: "Degradado alineado con la cabecera", en: "Gradient aligned with the header" },
        body: {
          es: "El hero público ya no hereda el espacio superior ni los márgenes globales de la app: el resplandor empieza pegado bajo la navegación y recorre todo el ancho.",
          en: "The public hero no longer inherits the app-wide main spacing: its glow starts directly below the navigation and spans the full viewport width.",
        },
      },
    ],
  },
  {
    version: "0.3.3",
    date: "2026-10-05",
    released: true,
    kind: "arreglo",
    summary: {
      es: "El logo de Cowork en novedades conserva sus colores al cambiar de tema.",
      en: "Cowork's changelog logo keeps its colors when the theme changes.",
    },
    added: [],
    changed: [],
    fixed: [
      {
        title: { es: "Logo estable entre temas", en: "Logo stays the same across themes" },
        body: {
          es: "El icono del encabezado y del pie mantiene el fondo negro y el símbolo blanco, tanto en claro como en oscuro.",
          en: "The header and footer mark keeps its black background and white symbol in both light and dark themes.",
        },
      },
    ],
  },
  {
    version: "0.3.2",
    date: "2026-10-05",
    released: true,
    kind: "arreglo",
    summary: {
      es: "El resplandor de novedades usa tonos neutros y su rótulo vuelve al verde de Cowork.",
      en: "The changelog glow now uses neutral tones, and its eyebrow returns to Cowork green.",
    },
    added: [],
    changed: [],
    fixed: [
      {
        title: { es: "Color de novedades corregido", en: "Changelog colors corrected" },
        body: {
          es: "El resplandor bajo la cabecera pasa a gris/negro, sin matiz azul, y el rótulo «Novedades» usa el verde de acento en ambos temas.",
          en: "The glow below the header is now gray/black with no blue tint, and the “What's new” label uses the accent green in both themes.",
        },
      },
    ],
  },
  {
    version: "0.3.1",
    date: "2026-10-05",
    released: true,
    kind: "arreglo",
    summary: {
      es: "La sincronización y la página pública de novedades se entienden y se recorren mejor.",
      en: "Release sync and the public changelog are easier to understand and navigate.",
    },
    added: [],
    changed: [
      {
        title: { es: "Cabecera pública más fiel", en: "A closer match for the public changelog" },
        body: {
          es: "El degradado bajo la navegación, los controles agrupados y la escala del título se acercan a la referencia; puedes elegir tema del sistema, claro u oscuro.",
          en: "The gradient under the navigation, grouped controls and heading scale now follow the reference; choose the system, light or dark theme.",
        },
      },
    ],
    fixed: [
      {
        title: { es: "Aviso CORS más preciso", en: "Clearer CORS guidance" },
        body: {
          es: "Si una página bloquea la sincronización, el aviso muestra el origen actual de Cowork, también en pruebas locales.",
          en: "If a page blocks sync, the message shows Cowork's current origin, including during local testing.",
        },
      },
      {
        title: { es: "Progreso de racha a mano", en: "Streak progress within easy reach" },
        body: {
          es: "El botón «Ver mi progreso» tiene una fila propia debajo del contador, con espacio para leer y tocarlo con comodidad.",
          en: "The “View my progress” button has its own row below the counter, with room to read and tap it comfortably.",
        },
      },
      {
        title: { es: "Novedades importadas por versión", en: "Release notes imported by version" },
        body: {
          es: "Cowork lee el tipo de cada versión (Major, Feature o Fix) además del grupo de cada tarjeta (Nuevo, Cambios o Arreglos), y distingue Major en sólido, Feature en menta, Fix en ámbar y Unreleased en azul. El tablero no convierte el título general de la página en una tarea y aclara que las propuestas se crean solo cuando las aceptas.",
          en: "Cowork reads each version's kind (Major, Feature or Fix) as well as each card's group (New, Changed or Fixed), with Major in solid, Feature in mint, Fix in amber and Unreleased in blue. The board does not turn the page title into a task and makes clear that proposals become tasks only after you accept them.",
        },
      },
      {
        title: { es: "Más aire en el Plan de trabajo", en: "More room in the work plan" },
        body: {
          es: "El tablero, las propuestas de novedades y los hitos tienen una separación uniforme; en móvil el espacio se ajusta para conservar una lectura cómoda.",
          en: "The task board, release proposals and milestones now have even spacing, with a tighter rhythm on mobile for comfortable reading.",
        },
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-10-04",
    released: false,
    kind: "feature",
    summary: {
      es: "Convierte las novedades públicas de un proyecto en propuestas de tareas, con estados detectados y revisión del equipo antes de tocar el tablero.",
      en: "Turn a project's public release notes into task proposals, with detected statuses and team review before anything changes on the board.",
    },
    added: [
      {
        wide: true,
        title: { es: "De novedades a tareas", en: "From release notes to tasks" },
        body: {
          es: "Añade el enlace en Configuración. Cowork lee páginas HTML, Markdown, CHANGELOG y releases de GitHub al abrir el tablero o cuando pulsas Sincronizar; la página debe permitir solicitudes desde el navegador (CORS).",
          en: "Add the link in Settings. Cowork reads HTML pages, Markdown, CHANGELOG files and GitHub releases when the board opens or when you choose Sync; the page must allow browser requests (CORS).",
        },
      },
      {
        title: { es: "Tú decides qué entra", en: "You decide what gets added" },
        body: {
          es: "Las propuestas se comparten con el equipo. Revisa el título, elige si crear o vincular una tarea y confirma el estado antes de aprobar cada cambio.",
          en: "Proposals are shared with the team. Review the title, choose whether to create or link a task, and confirm its status before approving each change.",
        },
      },
    ],
    changed: [],
    fixed: [
      {
        title: { es: "Una celebración de racha más clara", en: "A clearer streak celebration" },
        body: {
          es: "El contador y el acceso al progreso quedan bien alineados. La llama entra con la tarjeta y mantiene un brillo cálido y suave al quedarse en reposo.",
          en: "The counter and progress action now line up cleanly. The flame arrives with the card and keeps a soft, warm glow while it rests.",
        },
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-10-02",
    released: false,
    kind: "feature",
    summary: {
      es: "Un tablero de tareas de verdad, el código del repositorio dentro de Cowork y archivos que se revisan antes de llegar a GitHub.",
      en: "A real task board, the repository's code inside Cowork and files that are reviewed before they reach GitHub.",
    },
    added: [
      {
        wide: true,
        title: { es: "Tablero Kanban", en: "Kanban board" },
        body: {
          es: "Arrastra las tareas entre Pendiente, En curso y Hecha, o muévelas con el teclado. Cambia a la lista por fases cuando quieras: Cowork recuerda tu vista.",
          en: "Drag tasks between To do, In progress and Done, or move them with the keyboard. Switch to the list by phase whenever you like: Cowork remembers your view.",
        },
      },
      {
        title: { es: "Cada tarea, en detalle", en: "Every task, in detail" },
        body: {
          es: "Descripción, prioridad, fecha límite, lista de pasos y rama, en un panel lateral que guarda cada cambio solo.",
          en: "Description, priority, due date, checklist and branch, in a side panel that saves every change by itself.",
        },
      },
      {
        title: { es: "Filtros que encuentran", en: "Filters that find things" },
        body: {
          es: "Por texto, responsable, estado, hito, prioridad y fecha, con las tareas vencidas a la vista.",
          en: "By text, assignee, status, milestone, priority and date, with overdue tasks in sight.",
        },
      },
      {
        wide: true,
        title: { es: "El código, sin salir de Cowork", en: "The code, without leaving Cowork" },
        body: {
          es: "Un árbol de carpetas con el icono de cada lenguaje y el archivo con resaltado y números de línea. Pulsa una línea para compartir un enlace a ella, o a un rango.",
          en: "A folder tree with each language's icon and the file with highlighting and line numbers. Click a line to share a link to it, or to a range.",
        },
      },
      {
        title: { es: "La barra de GitHub", en: "The GitHub bar" },
        body: {
          es: "Cambia de rama o de etiqueta, busca archivos con la tecla T, copia cómo clonar por HTTPS, SSH o GitHub CLI y descarga el ZIP.",
          en: "Switch branch or tag, find files with the T key, copy how to clone over HTTPS, SSH or GitHub CLI and download the ZIP.",
        },
      },
      {
        title: { es: "Imágenes y archivos", en: "Images and files" },
        body: {
          es: "Vista previa con el fondo que elijas, los SVG como imagen o como código y un aviso claro para binarios y archivos grandes, con el botón de GitHub.",
          en: "Previews on the background you choose, SVGs as an image or as code and a clear notice for binaries and large files, with the GitHub button.",
        },
      },
      {
        wide: true,
        title: { es: "Archivos en revisión", en: "Files under review" },
        body: {
          es: "Crea un archivo o súbelo y queda pendiente en Cowork. Cuando alguien con permiso lo aprueba, se sube a GitHub con tu mensaje; si lo rechaza, verás por qué.",
          en: "Create a file or upload it and it waits in Cowork. When someone allowed approves it, it is committed to GitHub with your message; if they reject it, you'll see why.",
        },
      },
      {
        title: { es: "Novedades", en: "What's new" },
        body: {
          es: "Esta página, en español e inglés y en modo claro u oscuro, enlazada desde la portada.",
          en: "This page, in Spanish and English and in light or dark mode, linked from the home page.",
        },
      },
      {
        title: { es: "Video del recorrido", en: "Video tour" },
        body: {
          es: "77 segundos por Cowork, en español y en inglés, con banda sonora original. Está al principio del README.",
          en: "77 seconds through Cowork, in Spanish and English, with an original soundtrack. It opens the README.",
        },
      },
    ],
    changed: [
      {
        wide: true,
        title: { es: "Ramas en una sola lista", en: "Branches in one list" },
        body: {
          es: "Las del registro y las de GitHub juntas: dónde existe cada una, su pull request, cuánto se separó de la principal, sus commits y sus tareas.",
          en: "Registered and GitHub branches together: where each one exists, its pull request, how far it has drifted from the main branch, its commits and its tasks.",
        },
      },
      {
        title: { es: "Un resumen más claro", en: "A clearer summary" },
        body: {
          es: "Para ti, el avance y el próximo hito arriba; la actividad, el repositorio y el código debajo.",
          en: "For you, progress and the next milestone on top; activity, the repository and the code below.",
        },
      },
      {
        title: { es: "Diseño más sobrio", en: "A quieter design" },
        body: {
          es: "Acciones neutras con un único botón principal por formulario, foco blanco suave y menús que en el móvil se abren como ventana.",
          en: "Neutral actions with a single main button per form, a soft white focus ring and menus that open as a window on phones.",
        },
      },
      {
        title: { es: "Actividad con más detalle", en: "More detailed activity" },
        body: {
          es: "Cada cambio de una tarea y cada paso de una revisión queda en el registro, y «Para ti» avisa de lo que espera tu revisión.",
          en: "Every task change and every review step is recorded, and «For you» tells you what is waiting for your review.",
        },
      },
      {
        title: { es: "Menos esperas", en: "Less waiting" },
        body: {
          es: "Las vistas comparten los datos del repositorio y de las tareas: volver a una vista ya no recarga.",
          en: "Views share the repository and task data: going back to a view no longer reloads it.",
        },
      },
    ],
    fixed: [
      {
        title: { es: "Arrastrar sin sustos", en: "Dragging without surprises" },
        body: {
          es: "Una tarjeta soltada deprisa ya no vuelve a su sitio y las columnas no se encogen mientras arrastras.",
          en: "A card dropped quickly no longer jumps back and columns don't shrink while you drag.",
        },
      },
      {
        title: { es: "Calendario de entregas", en: "Delivery calendar" },
        body: {
          es: "Vuelve a los colores de Cowork en lugar de mostrarse en azul y blanco.",
          en: "Back to Cowork's colors instead of showing up in blue and white.",
        },
      },
      {
        title: { es: "Animaciones bajo tu control", en: "Motion follows your choice" },
        body: {
          es: "«Activado» mantiene los efectos de botones, menús y tarjetas aunque el dispositivo prefiera reducir el movimiento; «Reducido» sí los detiene.",
          en: "On keeps button, menu and card effects running even if your device prefers reduced motion; Reduced turns them off.",
        },
      },
      {
        title: { es: "Iconos de sitios en rutas propias", en: "Site icons at custom paths" },
        body: {
          es: "Las tarjetas reconocen los favicons de estos proyectos aunque estén guardados fuera de las rutas habituales.",
          en: "Project cards recognize these sites' favicons even when they live outside the usual paths.",
        },
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-09-29",
    released: true,
    kind: "grande",
    summary: { es: "La primera versión de Cowork.", en: "The first version of Cowork." },
    added: [
      {
        title: { es: "Proyectos privados", en: "Private projects" },
        body: {
          es: "Cada cuenta ve solo los espacios a los que pertenece; la portada no muestra nada de ningún equipo.",
          en: "Each account only sees the spaces it belongs to; the home page shows nothing about any team.",
        },
      },
      {
        title: { es: "Equipos con aprobación", en: "Teams with approval" },
        body: {
          es: "Un enlace o un QR para pedir acceso. El propietario aprueba, rechaza o permite otro intento, y todo queda en el historial.",
          en: "A link or a QR code to request access. The owner approves, rejects or allows another try, and everything stays in the history.",
        },
      },
      {
        title: { es: "Tareas e hitos", en: "Tasks and milestones" },
        body: {
          es: "Tareas con responsable y estado, e hitos con fecha cuyo avance sale de sus tareas.",
          en: "Tasks with an assignee and a status, and dated milestones whose progress comes from their tasks.",
        },
      },
      {
        title: { es: "Plazo de entrega", en: "Delivery deadline" },
        body: {
          es: "Una cuenta regresiva hasta el último día en la zona horaria del proyecto, o una escena pixel art si no hay fecha.",
          en: "A countdown to the last day in the project's time zone, or a pixel art scene when there's no date.",
        },
      },
      {
        title: { es: "Actividad y «Para ti»", en: "Activity and «For you»" },
        body: {
          es: "Solicitudes, decisiones, tus tareas y las entregas próximas, con lo leído sincronizado entre dispositivos.",
          en: "Requests, decisions, your tasks and upcoming deadlines, with what you've read synced across devices.",
        },
      },
      {
        title: { es: "Rachas y amigos", en: "Streaks and friends" },
        body: {
          es: "Días activos, metas, protectores y escudos, hasta cinco parejas con códigos de amigo y toques con frases.",
          en: "Active days, goals, protectors and shields, up to five partners with friend codes and nudges with set phrases.",
        },
      },
      {
        title: { es: "Mi colección", en: "My collection" },
        body: {
          es: "Personajes y paisajes pixel art que se desbloquean con días activos o se compran con puntos.",
          en: "Pixel art characters and landscapes unlocked with active days or bought with points.",
        },
      },
      {
        title: { es: "Ramas y GitHub", en: "Branches and GitHub" },
        body: {
          es: "Registra en qué rama trabaja cada persona y, con permiso, créala en GitHub en el mismo paso. Repositorios privados con tu propia cuenta.",
          en: "Record which branch each person works on and, with permission, create it on GitHub in the same step. Private repositories with your own account.",
        },
      },
    ],
    changed: [],
    fixed: [],
  },
];

export const LATEST = RELEASES[0];

/** "v0-2-0": the anchor of a version on the page. */
export function releaseAnchor(version: string) {
  return `v${version.replaceAll(".", "-")}`;
}
