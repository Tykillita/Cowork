# Firebase en Cowork

Cowork usa Firebase Authentication y Cloud Firestore para iniciar sesión y separar los proyectos por equipo. Las rachas, protecciones y relaciones entre amigos usan transacciones y reglas de Firestore. El despliegue usa Hosting clásico y funciona en Spark dentro de sus cuotas gratuitas; no requiere Cloud Functions ni Blaze. El desarrollo local usa emuladores. Cada instalación debe configurar su propio proyecto Firebase; el código ya no incluye el catálogo, los miembros ni las tareas de una instalación concreta.

## Preparar Firebase

1. Crea un proyecto Firebase y registra una aplicación web.
2. Copia `.env.example` como `.env.local` y pega los valores de la configuración web de esa aplicación. No incluyas credenciales de administrador.
3. En **Authentication → Sign-in method**, activa **Email/Password** y **Email link (passwordless sign-in)**. Firebase necesita ambos métodos para el acceso por enlace. Activa **Google** si también quieres permitir ese acceso, y **GitHub** para iniciar sesión con GitHub y consultar repositorios privados (pasos en [GITHUB.md](GITHUB.md)).
4. En **Authentication → Settings → Authorized domains**, agrega el dominio de Hosting y los dominios locales que vayas a usar.
5. Para que Google funcione en Safari y navegadores que bloquean almacenamiento de terceros, configura `VITE_FIREBASE_AUTH_DOMAIN` con el mismo host de Firebase Hosting que entrega Cowork. En esta instalación es `cwspace.web.app`. Agrega también `https://cwspace.web.app/__/auth/handler` a las URL de redirección autorizadas del cliente OAuth de Google.
6. Crea Firestore en modo producción.
7. Enlaza tu proyecto y su sitio de Hosting localmente con Firebase CLI. `.firebaserc` queda fuera del repositorio para que cada equipo use su propio destino:

   ```powershell
   firebase use --add
   firebase target:apply hosting cowork TU_ID_DEL_SITIO
   ```

El enlace por correo inicia la sesión y verifica que la persona controla esa dirección. No crea una contraseña. Al abrirlo en otro dispositivo, Firebase pide de nuevo el correo para evitar que otra persona use el enlace. Los enlaces de acceso a proyectos son distintos: solo permiten solicitar entrada después de iniciar sesión, y el propietario decide.

## Migrar proyectos existentes antes de publicar estas reglas

Las reglas nuevas cierran el catálogo y los datos de trabajo para las cuentas que todavía no estén asociadas a cada proyecto. Antes de publicar frontend y reglas, hay que asignar un propietario a cada proyecto que ya esté en Firestore. No se debe adivinar quién lo creó: confirma el propietario con el equipo.

Para cada `projects/{projectId}` existente, usa Firebase Console con permisos de administrador:

1. Añade `ownerUid` al documento del proyecto con el UID del propietario, tomado de **Authentication → Users**.
2. Crea `projects/{projectId}/members/{ownerUid}` con `uid`, `email`, `emailLower`, `name`, `role: "owner"`, `status: "active"` y `joinedAt` (fecha ISO).
3. Crea `users/{ownerUid}/projectAccess/{projectId}` con `projectId`, `role: "owner"` y `joinedAt`.
4. Comprueba que el propietario aparece en ese equipo. Después del despliegue, podrá compartir un enlace de acceso desde **Configuración → Enlace y solicitudes** y aprobar a los demás integrantes.

No borres los documentos de tareas ni ramas: los que ya están bajo `projects/{projectId}/tasks` y `projects/{projectId}/branches` se conservan. Si aún quedan registros en las antiguas colecciones raíz `/tasks` o `/branches`, muévelos bajo el proyecto correspondiente antes de publicar; Cowork ya no lee esas rutas.

## Publicar

Después de preparar las membresías de los proyectos existentes, ejecuta desde la carpeta de Cowork:

```powershell
npm install
npm run deploy
```

El comando publica Hosting y las reglas e índices de Firestore en el proyecto y sitio que enlazaste en `.firebaserc`, un archivo local ignorado por Git. Nunca publiques primero las reglas cerradas y después intentes crear la membresía desde el cliente: la creación inicial del propietario requiere la migración administrativa anterior.

## Modelo de datos

- `projects/{projectId}` contiene la descripción, URLs, tipo y `ownerUid`. `iconUrl` (opcional, HTTPS) es el icono elegido por el propietario; si falta, las tarjetas intentan cargar el favicon de la web de vista previa directamente desde esa web.
- `projects/{projectId}/members/{uid}` contiene el rol activo de cada miembro.
- `projects/{projectId}` puede incluir `schedule` (`startDate`, `endDate`, `timeZone`, `startsAt`, `endsAt`): días completos en una zona IANA y sus instantes UTC. Sin `schedule`, el proyecto no tiene fecha de entrega.
- `projects/{projectId}/accessLinks/{linkId}` guarda cada enlace de acceso: identificador aleatorio de 128 bits, nombre del proyecto, estado (`active`/`revoked`) y vencimiento (siete días por defecto).
- `projects/{projectId}/accessRequests/{uid}` guarda el estado actual de la solicitud de cada cuenta (`pending`, `approved` o `rejected`), su número de intento (`attempt`) y si el propietario permite otro intento (`retryAllowed`, `grantVersion`). El identificador es el UID, así que no puede haber dos solicitudes simultáneas.
- `projects/{projectId}/accessRequestHistory/{uid-intento-acción}` es el historial inmutable de intentos y decisiones, con fecha del servidor y autor. Solo lo leen el propietario y la persona afectada.
- `projects/{projectId}/directory/{uid}` es el directorio del equipo: nombre, avatar y si sigue activo. Lo leen los miembros; los correos quedan en `members`, visibles solo para el propietario.
- `projects/{projectId}/milestones/{milestoneId}` guarda los hitos (título, descripción, `dueDate`, `timeZone`, `dueAt` en UTC, `archived` y `revision`). Solo el propietario los crea, edita o archiva.
- `projects/{projectId}/events/{eventId}` es la actividad inmutable. Cada escritura de una tarea (o de un hito, o la creación de una rama) guarda en la misma operación exactamente un evento con autor autenticado, hora del servidor y la revisión del elemento; su id (`task-{id}-{revisión}`) impide duplicados al reintentar. Al crear un proyecto, el mismo lote guarda `project-{projectId}`, que solo acepta su propietaria y activa el día de la racha sin dar puntos. Las reglas comprueban con `getAfter()` que el evento describe el cambio real.
- `users/{uid}/preferences/main` (favoritos, orden, filtro y movimiento), `users/{uid}/preferences/scene` (personaje y paisaje elegidos, validados contra los días acumulados) y `users/{uid}/readState/{projectId}` (lectura de la actividad) son privados de cada cuenta.
- `users/{uid}/activeDays/{díaUTC}` marca un día activo (uno por día, derivado de la hora del servidor de un evento de trabajo propio) y `users/{uid}/progress/summary` guarda el total, que solo puede crecer de uno en uno junto con un marcador nuevo.
- `users/{uid}/accessRequests/{projectId}` es el índice privado con el que el selector muestra al solicitante el estado de sus solicitudes.
- `projects/{projectId}/invitations/{invitationId}` conserva las invitaciones por correo de versiones anteriores. Ya no se crean ni se aceptan; el propietario puede leerlas y los enlaces antiguos indican que hay que pedir uno nuevo.
- `users/{uid}/projectAccess/{projectId}` es el índice privado que permite cargar solo los proyectos de esa cuenta.
- `projects/{projectId}/tasks/{taskId}` guarda cada tarea con `assigneeUid` (cuenta responsable, opcional), `assignee` (nombre histórico), `milestoneId` y `revision`. Las tareas anteriores solo tienen el nombre; se leen igual y se enlazan con la migración.
- `projects/{projectId}/branches/{branchId}` guarda el registro de ramas del equipo; `githubCreated` (opcional, booleano) indica que la rama también se creó en GitHub desde Cowork.
- `projects/{projectId}` puede incluir `githubPolicy.branchWrite` (`owner` o `members`): quién puede crear y borrar ramas de GitHub desde Cowork. Sin el campo, solo el propietario. El token de GitHub nunca se guarda en Firestore ([GITHUB.md](GITHUB.md)).

Solo el propietario genera y revoca enlaces, aprueba o rechaza solicitudes y quita miembros. Para solicitar acceso, la cuenta debe haber iniciado sesión con el correo verificado y usar un enlace vigente; la persona solo puede crear y leer su propia solicitud y nunca puede asignarse membresía ni el rol de propietario. La aprobación escribe en una sola operación la membresía, el índice del selector y el estado aprobado. Revocar un enlace impide nuevas solicitudes y conserva las pendientes. Solo el propietario puede cambiar el plazo de entrega y la política de ramas de GitHub. Las reglas permiten a los miembros acceder a tareas y ramas del proyecto, y bloquean el resto de los proyectos. Al quitar a alguien, se elimina tanto su membresía como su índice de acceso. Desde la misma sección, el propietario puede transferir la propiedad a un miembro activo; la transferencia cambia el rol y los índices de ambas cuentas en una sola operación.

Los usuarios autenticados solo consultan `users/{uid}/projectAccess`; las reglas impiden listar globalmente `projects`. Antes de iniciar sesión solo se muestra la portada genérica de Cowork: no consulta el catálogo ni muestra datos o vistas previas de proyectos.

## Datos anteriores y transición

- **Directorio y tareas antiguas.** En **Configuración → Datos del equipo**, el propietario pulsa **Simular** (no escribe nada) y revisa el resultado; después **Aplicar cambios**. Un nombre se enlaza a una cuenta solo si coincide con un único miembro; los ambiguos o desconocidos se muestran como “Asignación anterior por revisar”. Se puede repetir cuando se quiera: solo aparece lo pendiente. Mientras tanto la app sigue leyendo los datos antiguos.
- **Pestañas con la versión anterior.** Hasta el `2026-10-10T00:00:00Z` (función `transitionOpen()` en `firestore.rules`) se aceptan las escrituras sin evento de esas pestañas, solo sobre tareas que nunca tuvieron revisión. A partir de esa fecha las reglas quedan estrictas sin volver a publicarlas. Si publicas más tarde, ajusta la fecha a una o dos semanas después del despliegue.
- **Constancia.** Se conservan los días activos, puntos y objetos existentes. El nuevo estado de protección empieza sin protectores. El calendario solo reconstruye fechas con marcadores fiables; antes de activar la protección, las ausencias sin datos aparecen como desconocidas.

## Pruebas de reglas

`npm run test:rules` levanta el emulador de Firestore y ejecuta `tests/firestore.rules.test.mjs` (38 casos): enlaces vencidos y revocados, solicitudes duplicadas, reintentos autorizados y retirados, historial privado, directorio, eventos coherentes con cada cambio, concurrencia por revisión, hitos, días activos falsificados, colección y la ventana de transición.

`npm run test:unit` ejecuta con Vitest la lógica pura (rachas UTC, búsqueda sin acentos, orden personal, progreso de hitos, avisos, catálogo). `npm run test:e2e` compila la aplicación para emuladores, inicia una vista previa del build y levanta los emuladores de Auth y Firestore y ejecuta con Playwright los flujos entre dos cuentas (login, recarga, cambio de proyecto, filtros, CardNav, accesos, actividad, hitos, colección, migración) en Chromium; Firefox, WebKit, WebKit móvil y Chrome móvil ejecutan las pruebas marcadas `@cross` y `@mobile`. `tests/e2e/visual.spec.ts` revisa desbordamientos y guarda capturas a 320, 375, 390, 430, 768 y 1440 px en `test-results/visual/`. `node tests/emulator-seed.mjs` crea cuentas de prueba verificadas en el emulador de Authentication para probar el flujo propietario/solicitante en el navegador. firebase-tools requiere Java 21.

## Publicar esta versión

En Spark, publica primero los índices y espera a que estén READY; después publica las reglas y finalmente Hosting. La transición a códigos de amigo se detalla en [FRIEND-CODES.md](FRIEND-CODES.md). El frontend usa directamente Firestore; `streakCommand` es un adaptador local, sin endpoint remoto. La compilación de producción desactiva los emuladores:

```powershell
npm run build
npx firebase-tools deploy --only firestore:indexes
# Esperar a que los índices estén READY.
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only hosting:cowork
```

## Desarrollo local

`npm run dev` compila el frontend para emuladores y levanta emuladores de Hosting, Authentication y Firestore. Registra usuarios de prueba en el emulador de Authentication y crea los proyectos/membresías de prueba en Firestore Emulator. Para recarga rápida, deja los emuladores en una terminal y ejecuta `npm run dev:vite` en otra. `npm run build` fuerza la conexión de producción, aunque `.env.local` tenga marcada la variable de emuladores.

En desarrollo, la app usa emuladores por defecto. Puedes definir `VITE_FIREBASE_EMULATOR_HOST` en `.env.local` para conectar otro dispositivo de la red. Los cambios de prueba no llegan a producción.

Las tareas y ramas solo se guardan en Firestore. Si Firestore no está disponible, Cowork muestra el estado de conexión y bloquea cambios nuevos hasta que pueda sincronizar con el proyecto.
