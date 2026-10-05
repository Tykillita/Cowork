# GitHub en Cowork

Cowork puede iniciar sesión con GitHub o vincularlo a una cuenta existente. Con GitHub conectado, la página **Ramas y cambios** consulta el repositorio del proyecto con la cuenta de cada persona: se ven los repositorios privados a los que tiene acceso y el límite de consultas sube de 60 por hora (compartido por IP) a 5000 por hora (por cuenta).

También permite **crear y borrar ramas reales** del repositorio desde Cowork, según lo que decida el propietario del proyecto.

Todo ocurre en el navegador. Cowork sigue funcionando en el plan Spark, sin Cloud Functions.

## Activar el proveedor

1. En GitHub, ve a **Settings → Developer settings → OAuth Apps → New OAuth App**.
   - **Homepage URL:** la dirección de Cowork (por ejemplo `https://cwspace.web.app`).
   - **Authorization callback URL:** `https://<VITE_FIREBASE_AUTH_DOMAIN>/__/auth/handler`, con el mismo host que ya usa el acceso con Google (en esta instalación, `https://cwspace.web.app/__/auth/handler`).
2. En Firebase, ve a **Authentication → Sign-in method → Add new provider → GitHub** y pega el *Client ID* y el *Client secret* de la OAuth App. El secreto se queda en Firebase: no va en `.env.local` ni en el código.
3. En **Authentication → Settings → User account linking**, deja **Link accounts that use the same email**. Así, si alguien entra con GitHub usando un correo que ya tiene cuenta, Firebase lo rechaza y Cowork le pide entrar con su método habitual y vincular GitHub desde el perfil. Cowork nunca fusiona cuentas automáticamente.

En local, el emulador de Authentication simula GitHub sin configuración adicional, pero no entrega un token real de la API.

## Permisos que pide Cowork

| Scope | Para qué |
|---|---|
| `repo` | Leer repositorios privados y crear y borrar ramas (y, más adelante, abrir y fusionar pull requests y crear issues). |
| `read:user` | Mostrar el usuario (`@login`) en el perfil. |
| `user:email` | Que Firebase reciba el correo de la cuenta aunque sea privado en GitHub. |

GitHub no permite limitar `repo` a un solo repositorio con una OAuth App. El token puede hacer lo mismo que la persona en GitHub, ni más ni menos.

## Dónde vive el token

- Firebase solo entrega el token de GitHub al iniciar sesión, al vincular o al reconectar. No lo guarda ni lo renueva.
- Cowork lo guarda en memoria y en el `sessionStorage` de la pestaña (`cowork.github.<uid>`). **Nunca se escribe en Firestore** ni se comparte con otros miembros.
- Se borra al cerrar la pestaña, al cerrar sesión, al desvincular GitHub y cuando GitHub responde 401 (token revocado o caducado). En esos casos el perfil y la página de ramas muestran **Reconectar GitHub**, que pide un token nuevo con un clic.
- Al cargar, Cowork valida el token con `GET /user` antes de usarlo, para no hacer consultas con un token revocado.

## Crear y borrar ramas

- En **Ramas y cambios**, el formulario de registro tiene la casilla **Crear también en GitHub** y el selector **Desde la rama** (por defecto, la rama principal del repositorio). Cowork valida el nombre con las reglas de `git check-ref-format` antes de enviarlo.
- Primero se crea la rama en GitHub (`POST /repos/{repo}/git/refs`). Si GitHub la rechaza, no se registra nada en Cowork. Si GitHub la crea pero el registro falla, el mensaje lo dice para no duplicarla.
- El registro guarda `githubCreated: true` y muestra la etiqueta «en GitHub». El punto y el evento de actividad son los mismos que al registrar una rama a mano.
- En la tarjeta de ramas de GitHub, **Borrar** pide una confirmación en línea antes de llamar a `DELETE /repos/{repo}/git/refs/heads/{rama}`. La rama principal y las ramas protegidas nunca muestran esa acción.

## Una sola lista de ramas

La página **Ramas y cambios** reúne en una lista (`reconcileBranches`, `src/features/github/branchModel.ts`) las ramas del registro del equipo y las del repositorio. Las empareja por nombre sin distinguir mayúsculas. Cada rama muestra dónde existe:

| Estado | Significado |
|---|---|
| Cowork + GitHub | Registrada y presente en el repositorio. |
| Solo en Cowork | Registrada, pero no existe en GitHub. Se puede **Crear en GitHub** desde la rama principal. |
| Borrada en GitHub | Se creó desde Cowork y ya no está en el repositorio. Sustituye a la antigua etiqueta «en GitHub», que quedaba desactualizada. |
| Sin registrar | Está en GitHub y nadie la registró. **Registrar** rellena el formulario sin volver a crearla. |
| GitHub no disponible | Registrada, pero GitHub no respondió. |

- **Orden de la lista:** primero la rama principal, después las registradas (de la más reciente a la más antigua) y por último las que solo están en GitHub.
- **Datos de cada fila:**
  - su pull request abierto (`GET /pulls`, emparejado por `head.ref`);
  - cuántas tareas apuntan a ella (`task.branch`);
  - en **Detalles**: cuántos cambios lleva por delante y por detrás de la principal (`GET /compare/{principal}...{rama}`), sus últimos commits (`GET /commits?sha=`) y las tareas vinculadas.
- **Filtros:** Todas · En Cowork · Solo en GitHub · Con PR, más una búsqueda.
- **Enlace directo:** `#branches-page?branch=feature/x` abre esa rama.
- **Quitar del registro** escribe el evento `branch-{id}-deleted` en la misma operación, y la actividad muestra «quitó la rama X del registro». Las reglas exigen ese evento y ya no permiten editar una entrada del registro. Opcionalmente, también borra la rama en GitHub.
- **Si GitHub crea la rama pero el registro falla**, Cowork no la borra (alguien podría estar subiendo cambios). La rama aparece como «Sin registrar» y el formulario ofrece **Reintentar registro**.

## Caché y límite de consultas

- Todas las llamadas pasan por `githubFetch` (`githubApi.ts`) y una caché en memoria por pestaña (`githubCache.ts`). La clave usa una huella del token; el token nunca se guarda en la caché.
- Las respuestas que cambian (repositorio, ramas, commits, pull requests) se reutilizan durante 30 s. Después se piden de nuevo con `If-None-Match`, y si GitHub responde 304 se conservan los datos.
- Los árboles y los archivos se piden por SHA, así que no cambian y se guardan para el resto de la visita.
- Las peticiones idénticas en curso se comparten.
- Resumen, Ramas y Código comparten el mismo store del repositorio (`repositoryStore.ts`). Se refresca cada 5 minutos solo mientras alguna vista lo usa y la pestaña está visible.
- **Límite de consultas:** si GitHub responde que no quedan consultas, Cowork no envía más hasta la hora de reinicio y muestra esa hora. La franja del repositorio avisa cuando queda menos del 10 %.
- Un límite temporal conserva el repositorio y las ramas de la última consulta. Código muestra un aviso y mantiene el árbol y el visor; los árboles y archivos ya descargados por SHA siguen disponibles en la caché de la pestaña. Los archivos aún no descargados necesitan conectar GitHub o esperar al reinicio del cupo.
- **Lista de ramas:** se pagina con la cabecera `Link` hasta 1000 ramas, y la página indica si hay más.
- **Repositorio que no responde:** un fallo de `GET /repos/{repo}` se muestra como mensaje en lugar de dejar los controles en espera para siempre.

## Subir archivos

Desde **Código → Añadir archivo**, cualquier miembro propone un archivo nuevo o subido. Queda en Cowork pendiente de revisión. Quien puede revisar (la misma política que las ramas, más `permissions.push`) lo aprueba, y Cowork lo sube con `PUT /repos/{repo}/contents/{ruta}` usando el token de esa persona y el permiso `repo` que ya se pide. El flujo completo está en [CODE-VIEWER.md](CODE-VIEWER.md#archivos-propuestos).

## Repositorio editable

En **Configuración → GitHub**, el propietario puede cambiar o quitar el repositorio (`updateProjectRepository`). La URL se normaliza con `normalizeRepositoryUrl`. Las ramas registradas se conservan, y su estado en GitHub se recalcula con el nuevo repositorio.

## Explorador de código

Ver [CODE-VIEWER.md](CODE-VIEWER.md).

## Modelo de permisos

Para ver los controles hacen falta las dos condiciones:

1. **Política del proyecto** (`githubPolicy.branchWrite` en el documento del proyecto): **Solo el propietario** (valor por defecto) o **Todos los miembros**. Solo el propietario la cambia, en **Configuración → GitHub**, y las reglas de Firestore solo aceptan esos dos valores.
2. **Permiso real en GitHub:** el token de la persona debe tener `permissions.push` en el repositorio (lo devuelve `GET /repos/{repo}` cuando la consulta va autenticada).

GitHub es la autoridad real: cada acción usa el token de la persona que la hace, así que solo puede hacer lo que su cuenta ya puede hacer en el repositorio. La política del proyecto es una regla de coordinación del equipo. Firestore no puede comprobar llamadas hechas a GitHub, así que esa política no sustituye a los permisos del repositorio: quien tenga acceso de escritura en GitHub siempre podrá cambiar ramas desde GitHub mismo.

## Código

| Archivo | Función |
|---|---|
| `src/features/auth/panelAuth.ts` | Acceso, vínculo, reconexión y desvínculo de GitHub, y resultado de las redirecciones. |
| `src/features/github/githubSession.ts` | Token de la pestaña, validación y hook `useGitHubSession`. |
| `src/features/github/githubApi.ts` | Cliente de la API con mensajes de error en español (401, límite de consultas, 404, conflictos). |
| `src/features/github/githubCache.ts` | Caché por pestaña, ETag y límite de consultas. |
| `src/features/repository/repositoryStore.ts` y `useRepository.ts` | Repositorio, ramas, commits y pull requests compartidos por todas las vistas. |
| `src/features/github/branchModel.ts` | Conciliación del registro con GitHub y filtros. |
| `src/pages/BranchesPage.tsx`, `src/features/branches/` | Página de ramas: franja del repositorio, lista y detalle. |
| `src/features/github/branchPermissions.ts` | Permiso efectivo (política del proyecto + `push` en GitHub) y ramas que no se pueden borrar. |
| `src/features/github/githubRefs.ts` | Validación de nombres de rama. |
| `tests/e2e/github.spec.ts`, `tests/e2e/githubMock.ts` | Ramas con la API de GitHub simulada: crear, registrar, borrar, política, conciliación, paginación y límite de consultas. |
