# Códigos de amigo

## Uso
En Rachas y puntos → Amigos se crea el código permanente de la cuenta, de ocho caracteres sin 0/O/1/I (CW-XXXX-XXXX). Se puede copiar o introducir el de otra persona. Buscar muestra nombre y avatar; Enviar solicitud requiere una acción adicional y la otra persona debe aceptar. No se abre una ventana al recibir solicitudes.

Las bandejas recibidas/enviadas se actualizan en directo y paginan veinte elementos, de más reciente a más antiguo. El indicador de rachas suma las solicitudes recibidas pendientes y los toques sin leer. Las solicitudes caducan a los siete días; el código no caduca. Se conservan cinco parejas activas y cinco solicitudes enviadas pendientes como máximos.

Introducir el propio código, un formato inválido o un código inexistente muestra un mensaje. Las solicitudes cruzadas conservan una sola reserva y requieren aceptación explícita. Un reintento de envío devuelve el identificador original, incluso después de cerrarse. Las acciones requieren conexión.

## Modelo y permisos
- streakFriendCodes/{code}: únicamente uid, name y photoURL. Consulta autenticada por código completo, sin listados. La identidad se valida contra Auth.
- users/{uid}/friendCode/current: asignación privada e inmutable {code}. La asignación y su perfil se crean juntos; colisiones y dispositivos simultáneos usan transacciones.
- streakInvites/{id}: version 2, ownerUid/person, recipientUid/recipientPerson/recipientCode, status, createdAt y decidedAt al cerrarse. El vencimiento se calcula exactamente siete días después de createdAt, que fija Firestore. Participantes y datos originales inmutables. Solo emisor y destinatario pueden leer; únicamente destinatario acepta/rechaza, emisor cancela, cualquiera de los dos concilia el vencimiento.
- streakRequestLocks/{uid}/peers/{peer}: inviteId, reservado en ambos sentidos en el mismo commit. No se reemplaza una reserva mientras su solicitud esté pendiente.
- streakSocial, streakPairs, streakLinks y users/{uid}/streakRequests conservan las responsabilidades existentes. El recibo de envío fija recipientUid y dirección para que un reintento mantenga su resultado incluso cuando encontró una solicitud cruzada.

No se comparten correo, tareas, proyectos, saldo ni protectores. Conocer un código permite consultar únicamente el perfil mínimo. Leer el progreso sigue exigiendo una pareja aceptada. Las operaciones no conceden puntos.

## Migración
Las reglas rechazan crear o aceptar invitaciones antiguas por enlace. El emisor cancela sus pendientes antiguas al inicializar el flujo social y libera sus cupos sin cobros ni duplicados. Las parejas ya aceptadas y todos sus historiales se conservan.

Un enlace antiguo muestra «Las invitaciones ahora funcionan con códigos de amigo» y permite abrir Amigos tras iniciar sesión. El código de invitación antiguo ya no se propaga mediante los enlaces de Auth. Los enlaces de acceso a proyectos y autenticación mantienen sus funciones.

## Publicación coordinada
No se publica automáticamente al implementar este cambio. Para esta transición:
1. Compilar producción: npm run build.
2. Publicar únicamente los índices: npx firebase-tools deploy --only firestore:indexes.
3. Esperar a que los índices de streakInvites por ownerUid/createdAt y recipientUid/createdAt estén READY.
4. Publicar las reglas: npx firebase-tools deploy --only firestore:rules.
5. Publicar Hosting: npx firebase-tools deploy --only hosting:cowork.

En esta transición se usa esa secuencia por etapas. `npm run deploy` publica los tres componentes en una sola invocación y se reserva para cuando los índices ya estén READY.

Las pestañas con la versión anterior deben recargarse: las reglas ya no permiten crear sus enlaces. No restablecer reglas antiguas durante una reversión; permitirían el flujo retirado. Se mantienen Firestore Standard, Auth y Hosting clásico dentro de Spark, sin Functions ni servicios de pago nuevos.

## Validación
Pruebas unitarias de normalización y alfabeto; SDK cliente con Firestore Emulator para transacciones, permisos, colisiones, duplicados, caducidad, migración, límites y paginación; Playwright entre dos cuentas y regresión de calendario/protección/colección. Los emuladores son locales; las pruebas no despliegan ni cambian facturación.
Los diagnósticos de la aplicación registran únicamente acción y código de error.
