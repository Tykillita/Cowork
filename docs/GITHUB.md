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
| `src/features/repository/useRepository.ts` | Ramas, commits y metadatos del repositorio, con token si existe. |
| `src/features/github/branchPermissions.ts` | Permiso efectivo (política del proyecto + `push` en GitHub) y ramas que no se pueden borrar. |
| `src/features/github/githubRefs.ts` | Validación de nombres de rama. |
| `tests/e2e/github.spec.ts` | Crear, registrar y borrar ramas y política por miembros, con la API de GitHub simulada. |
