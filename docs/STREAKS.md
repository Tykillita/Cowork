# Rachas, puntos, protección y amigos — Spark

El panel conserva el diseño pixel art, las llamas encendida y congelada, el personaje y paisaje equipados, calendario, metas, celebraciones, tienda, amigos y tarjeta para compartir.

## Economía y fechas

- Un punto por evento válido, máximo tres por día UTC entre todos los proyectos y dispositivos.
- Crear una tarea, cambiar realmente su estado o registrar una rama nueva cuenta como actividad. Se valida el evento inmutable que Firestore confirmó junto con el trabajo.
- Crear un proyecto también activa el día UTC para la racha (calendario, presencia compartida y celebración), pero **no da puntos**: no escribe en la cartera ni en el contador diario y no consume el máximo de tres. Solo cuenta para quien lo crea y cada día se cuenta una vez aunque se creen varios proyectos. Los proyectos creados antes de este cambio no generan actividad retroactiva.
- Las operaciones sin cambios y los reintentos no conceden premios. Una rama se identifica por proyecto y nombre normalizado; su recibo se conserva incluso después de alcanzar el límite diario.
- Protector individual: tres puntos, máximo dos en inventario. Solo se consume para conservar una racha existente.
- Escudo: quince puntos, fecha UTC de compra y seis fechas siguientes. Tiene prioridad, no se acumula ni repara ausencias anteriores.
- Los días protegidos conservan la racha sin aumentar el contador, los días activos ni los puntos.
- Hitos de 3, 7, 14, 30, 50, 100, 200, 365 y después cada cien. Una semana perfecta exige actividad real de domingo a sábado. Las insignias se derivan del historial permanente y conservan las ya existentes.
- Cinco parejas activas como máximo. La aceptación es explícita; la racha compartida solo aumenta cuando ambos actúan. Los toques son avisos dentro de la aplicación, como máximo uno por pareja y día.

## Backend sin Cloud Functions

La aplicación usa Firebase Authentication, Firestore Standard y Hosting clásico. No requiere Blaze, Cloud Functions, Cloud Scheduler, Cloud Run ni Firebase App Hosting. Se aplican las [cuotas gratuitas de Spark](https://firebase.google.com/docs/firestore/quotas); no se promete capacidad ilimitada.

- `src/features/streaks/streakModel.ts`: cálculo de rachas, metas, calendario y protección.
- `sparkRewards.ts`: transacciones de acreditación, conciliación de ausencias, compra y celebración.
- `sparkInvitations.ts`: códigos permanentes, solicitudes dirigidas, reservas, capacidad y migración.
- `sparkSocial.ts`: estados compartidos y toques.
- `sparkTransaction.ts`: reintentos acotados que vuelven a leer los documentos ante una colisión concurrente.
- `sparkBackend.ts`: adaptador local usado por la interfaz existente. No llama a un endpoint de Functions.
- `firestore.rules`: valida cada cambio en el servidor de Firestore, incluyendo pruebas de actividad, incrementos exactos, precios, límites, propietario y escrituras relacionadas en el mismo commit.

No hay procesos de fondo. Al abrir la aplicación, recuperar el foco, reconectarse o realizar una operación se concilian los días pendientes. Antes de cerrar jornadas anteriores, se recuperan los eventos de trabajo confirmados que todavía no fueron acreditados. Si se cierra el navegador después de guardar trabajo, la conciliación de la siguiente sesión recupera sus recompensas, incluso cuando se abre otro dispositivo durante el mismo día.

El evento `project` (`project-{projectId}`) se guarda en el mismo lote que crea el proyecto, con la hora del servidor. Las reglas solo lo aceptan si el proyecto no existía antes de ese lote, la persona autenticada es su propietaria y miembro activa después del lote, y el título coincide con el nombre del proyecto; no se puede añadir después a un proyecto existente ni atribuir a otra persona. Tras crear el proyecto, su referencia entra en la misma cola de reintentos que el resto del trabajo; si la acreditación falla, la conciliación de la siguiente sesión la recupera con el día de la creación confirmada. Las reglas de puntos (`pointEvents`, `pointDays` y cartera) rechazan este tipo de evento.

La fecha procede del timestamp confirmado por Firestore. Un documento de hora sincroniza el reloj usado para preparar solicitudes; las reglas comprueban las fechas frente a `request.time`. Las transacciones requieren conexión. El trabajo pendiente usa el día en que Firestore confirma su evento, y la cola de reintentos conserva referencias de actividad sin conceder puntos de forma local.

## Datos privados y compartidos

Bajo `users/{uid}` se conservan cartera, inventario, eventos acreditados, días activos, días protegidos, compras y celebraciones. Otra persona no puede leerlos ni cambiar su saldo.

`streakPresence/{uid}` contiene únicamente un intervalo de cobertura validado; su subcolección `days` guarda fecha y estado activo/protegido. Una pareja aceptada puede leer esos estados desde la fecha de aceptación. La cobertura prevista se calcula con los protectores ya adquiridos y se actualiza al registrar actividad o comprar protección. Así un amigo puede calcular la continuidad aunque el otro no abra la aplicación ese día. No se publican tareas, proyectos, saldo ni cantidades de inventario.

`streakPairs` contiene los dos perfiles y la relación. `streakLinks` verifica el acceso entre esas dos personas. `streakSocial` guarda contadores privados de capacidad; se actualizan de forma atómica junto con las invitaciones y relaciones. El contador compartido se deriva de los estados diarios, sin permitir incrementos arbitrarios desde el cliente.

Las invitaciones usan códigos permanentes de amigo (CW-XXXX-XXXX). Buscar un código completo muestra nombre y avatar con sesión iniciada; enviar una solicitud requiere una acción explícita y solo el destinatario puede aceptarla. Las solicitudes caducan a los siete días y tienen bandejas paginadas; los códigos no caducan. Las reservas atómicas impiden solicitudes duplicadas o cruzadas. Finalizar una relación revoca el acceso a su cobertura. Véanse modelo, permisos y publicación en [FRIEND-CODES.md](FRIEND-CODES.md).

Cada pareja tiene un recibo de toque por día y cada destinatario controla únicamente la lectura de sus avisos. Silenciar y finalizar son decisiones del participante autenticado. Las celebraciones usan un recibo por cuenta y fecha, por lo que una sola sesión obtiene cada celebración. Compartir una tarjeta siempre es una acción explícita del usuario.

## Migración

Se conservan saldos, compras, escenas elegidas, días activos e historial de protección existentes. Las cuentas que nunca activaron protección empiezan sin protectores ni escudo. Los eventos anteriores a la activación no generan puntos retrospectivos. Las fechas antiguas sin un marcador fiable se muestran como desconocidas.

Si ya existen relaciones creadas por la versión de Functions, cada cuenta convierte su índice privado al abrir el apartado social y publica solo sus estados diarios históricos. Los enlaces de invitación antiguos ya no se pueden aceptar. Las pendientes se cancelan y liberan sus cupos cuando el creador inicializa el nuevo flujo; las parejas aceptadas se conservan. No se consulta el inventario de otros usuarios para migrarlo.

## Desarrollo y despliegue

Node.js 22 y Java 21 para los emuladores:

```powershell
npm ci
npm run dev
```

Cuando un cambio amplía los eventos aceptados (como el evento `project`), se publican primero las reglas y después Hosting, para que la aplicación nueva nunca escriba un evento que las reglas publicadas todavía rechazan:

```powershell
npm run build
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only hosting:cowork
```

`npm run deploy` compila producción y despliega exclusivamente Hosting, reglas e índices de Firestore en el proyecto configurado. Para esta transición usa la secuencia siguiente, que permite esperar a que se construyan los índices de solicitudes antes de activar las reglas y el frontend:

```powershell
npm run build
npx firebase-tools deploy --only firestore:indexes
# Esperar a que los índices estén READY antes de publicar reglas y Hosting.
npx firebase-tools deploy --only firestore:rules
npx firebase-tools deploy --only hosting:cowork
```

No se habilita facturación ni se realiza una publicación como parte de la adaptación. Si alguna versión anterior llegó a desplegar funciones, esas instancias remotas deben retirarse por separado: quitar su configuración local no elimina recursos ya publicados. No se ha solicitado ni ejecutado ninguna eliminación remota.

## Validación

```powershell
npm run test:unit
npm run test:streaks
npm run test:rules
npm run test:e2e
npm run test:smoke
npm run build
```

Las pruebas de Spark ejecutan el SDK cliente contra reglas reales en un emulador con proyecto demo; rechazan un entorno de producción. Cubren acreditación concurrente, máximo diario, replay, ramas, creación de proyectos sin puntos, compras, protección, conservación de datos, invitaciones, permisos y toques. Las pruebas de interfaz usan únicamente Auth y Firestore Emulator.

La [revisión de reglas](FIRESTORE-SPARK-REVIEW.md) documenta los intentos de falsificación, replay y acceso ajeno. Las reglas constituyen un prototipo con pruebas de permisos, integridad de saldos y privacidad entre usuarios. Conviene revisarlas y verificarlas antes de distribuir la aplicación ampliamente.

## Validación previa de la adaptación a Spark — 27 de septiembre de 2026

- 37 pruebas unitarias, 17 pruebas del backend Spark y 38 pruebas de reglas aprobadas: 92 en total.
- Diez casos de Playwright aprobados en una ejecución: colección, puntos, migración, rachas, amigos y acceso sin sesión en Chromium; calendario/protección/compartir en Firefox, WebKit, Chrome móvil y WebKit móvil.
- El recorrido adicional con `npm run test:smoke` comprobó calendario, compras, teclado, pantalla móvil, PNG, aceptación, toques, silenciamiento, finalización y actividad que vuelve a encender la llama.
- Las primeras ejecuciones encontraron falta de memoria virtual en Windows. Después de recuperar recursos, la selección estándar de diez casos pasó completa.
- La consulta de funciones desplegadas en `vigilia-panel` devolvió una lista vacía.
- No se modificó la facturación ni se publicó esta versión. Las capturas de ambas llamas conservan el diseño existente.

## Validación de la racha por creación de proyecto — 29 de septiembre de 2026

- 41 pruebas unitarias, 30 del backend Spark y 41 de reglas aprobadas. Las nuevas cubren: el día activo sin cartera ni puntos del día; varios proyectos que cuentan una sola vez; continuidad al día siguiente; recuperación con el día de la creación confirmada después de medianoche; reintentos sin duplicados; un crédito falsificado con punto, rechazado (el mismo lote con una tarea sí se acepta); y eventos añadidos después, atribuidos a otra persona, con otro título, revisión u hora, o modificados.
- Prueba de interfaz nueva aprobada en Chromium, Firefox y WebKit: crear un proyecto enciende la racha (1 día, 0 puntos, 0/3 hoy), muestra la celebración una vez y aparece como «creó el proyecto» en Actividad.
- Se corrigió una carrera previa: el catálogo se suscribía al proyecto recién creado antes de que el lote llegara al servidor, recibía `permission-denied` y lo ocultaba (junto con su actividad) hasta recargar. Ahora espera a que el acceso esté confirmado por el servidor.
- Compilación de producción correcta. Las reglas y Hosting ya se habían publicado juntos a las 02:03 (hora local) desde la sesión paralela de rendimiento. Tras revisar ese trabajo se publicó de nuevo con `npm run deploy` (reglas sin cambios, índices y Hosting) a las 06:51 (11:51 UTC) del 29 de septiembre de 2026.
- Batería e2e completa antes de publicar: 70 aprobadas y 2 fallos conocidos (a continuación).
- Fallos conocidos de la batería e2e, ajenos a este cambio: la recarga repetida en WebKit (dos canales de escucha del emulador, que usa HTTP/1.1, quedan sin respuesta) y `tasks.spec.ts:70`, que importa `/src/…` y solo funciona con el servidor de desarrollo, no con la vista previa de `test:e2e`. El fallo de inicio de sesión en los perfiles móviles quedó resuelto con los cambios de `tests/e2e/helpers.ts`.
