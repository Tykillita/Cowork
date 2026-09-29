# Revisión de las reglas de recompensas en Spark

Fecha: 27 de septiembre de 2026.

## Alcance y modelo

Las nuevas rutas se describen en [STREAKS.md](STREAKS.md). La cuenta autenticada conserva acceso a su historial privado; cada pareja aceptada puede consultar únicamente perfiles y cobertura diaria desde su aceptación. Las escrituras de saldo, actividad, protección, capacidad social y toques se validan con pruebas relacionadas en el mismo commit.

No hay un SDK administrativo en la aplicación ni funciones con permisos privilegiados. Las reglas anteriores de proyectos, membresías y colección siguen dentro de la suite de regresión. El evento de una rama ahora debe contener su nombre real, para que la clave de deduplicación no pueda inventarse.

## Revisión de ataques

| Intento | Resultado / evidencia |
|---|---|
| Lectura sin sesión o listado de datos ajenos | Rechazado por las pruebas de reglas y Spark. Las consultas sociales exigen pertenencia o creador. |
| Leer saldo, tareas o historial privado de un amigo | Rechazado. La proyección compartida solo contiene fecha/estado o intervalo de cobertura. |
| Leer cobertura anterior a la amistad o después de finalizarla | Rechazado, incluidos listados sin la restricción de fecha. |
| Escribir o eliminar documentos de otra cuenta | Rechazado. Las únicas escrituras sociales cruzadas son contadores y avisos vinculados a una relación y operación válidas. |
| Inventar puntos, días activos o contadores | Rechazado. Los incrementos exigen eventos confirmados y recibos nuevos. |
| Falsificar la creación de un proyecto para ganar actividad o puntos | Rechazado. El evento `project` solo se acepta en el lote que crea el proyecto, por su propietaria, con la hora del servidor; no se puede añadir a un proyecto existente, atribuir a otra persona ni cambiar después. Activa el día, pero las reglas de `pointEvents`, `pointDays` y cartera lo rechazan (29 de septiembre de 2026). |
| Repetir un evento, una compra o un toque | Operación idempotente o rechazo. Las pruebas incluyen dos clientes concurrentes. |
| Superar tres puntos por día o dos protectores | Rechazado por invariantes de reglas; las transacciones simultáneas conservan el límite. |
| Comprar sin pagar, con precio modificado o saldo negativo | Rechazado. El recibo, inventario y cartera deben cambiar juntos. |
| Alterar fechas o inventar cobertura futura | Rechazado. Fecha validada con request.time y pruebas de actividad; cobertura derivada del inventario privado. |
| Consumir protección repetida o por cada pareja | La conciliación usa un cursor diario y un recibo por fecha. Una cobertura personal beneficia a todas las parejas. |
| Saltar ausencias para conservar una racha | Solo se permite saltar un intervalo cuando la racha ya terminó y no hay actividad posterior registrada. |
| Aceptar sin invitación, aceptar dos veces o exceder cinco parejas | Rechazado o idempotente. Los índices, dos enlaces, invitación y pareja se actualizan atómicamente. |
| Cambiar identidad, participantes, fecha de aceptación o perfil ajeno | Rechazado por los campos inmutables y el perfil comprobado contra el token de Auth. |
| Silenciar a otro participante | Rechazado; cada participante modifica únicamente su propio estado de silencio. |
| Enviar avisos a terceros, a un participante activo o silenciado | Rechazado. Un recibo por pareja y fecha limita ambos sentidos. |
| Cambiar propiedades de una notificación al marcarla como leída | Rechazado; solo puede pasar a read=true. |
| Introducir campos extra, cambiar tipos o borrar campos requeridos | Esquemas explícitos y operaciones restringidas; pruebas negativas de estado, cartera, cobertura y relaciones. |
| Usar cadenas o listas arbitrariamente grandes | Revisión manual de los campos nuevos: IDs, nombres, URLs, lista de participantes y silencios tienen límites; las listas de participantes tienen contenido validado. Las insignias iniciales son una lista vacía que el cliente no puede alterar. |
| Autoasignarse privilegios o mover una referencia a otra cuenta | No hay roles administrativos editables en estas rutas. UID, pruebas y relaciones se comprueban en las reglas. |
| Escribir subcolecciones huérfanas para concederse acceso | Los documentos de cobertura, compras, enlaces y avisos requieren estado o relación válidos. |
| Utilizar una consulta que la aplicación necesita pero las reglas deniegan | Verificado con el SDK cliente y los flujos del navegador: resumen, calendario, compras, invitaciones, parejas y avisos. |

## Comprobación reproducible

- `npm run test:rules`: 38 pruebas de acceso, proyectos, eventos, colección y aislamiento.
- `npm run test:streaks`: 25 pruebas con el SDK cliente y reglas reales en un proyecto demo, sin bypass para las operaciones comprobadas.
- `npm run test:unit`: 40 pruebas de lógica pura.
- `npm run test:smoke`: recorrido real del navegador con Auth y Firestore Emulator; guarda capturas en `.firebase/spark-ui`.
- Las escrituras administrativas de las pruebas se limitan a preparar fixtures e inspeccionar resultados.

Los ataques enumerados se revisaron; las pruebas que esperan denegaciones generan mensajes PERMISSION_DENIED intencionados. Las reglas siguen siendo un prototipo que debe revisarse antes de una distribución amplia: esta revisión no demuestra la ausencia de cualquier vulnerabilidad.

## Ampliación: códigos de amigo
El modelo exacto y la publicación coordinada se describen en [FRIEND-CODES.md](FRIEND-CODES.md).
- El directorio separa uid/nombre/avatar del documento privado de asignación. Solo permite get autenticado por código completo; list, lecturas anónimas y cambios de propietario se rechazan.
- La asignación inmutable y el perfil se crean atómicamente. Dos dispositivos conservan un código; una colisión se reintenta.
- Las solicitudes v2 fijan emisor, destinatario y perfiles. No se permite aceptar por conocer un ID. Leer o decidir como tercero, añadir campos o cambiar vencimiento/identidad se rechaza.
- Dos reservas simétricas impiden reemplazar solicitudes pendientes, también entre envíos simultáneos en sentidos opuestos. La solicitud, sus reservas y el contador del emisor se validan juntos.
- Cierre y consumo del cupo son atómicos. La aceptación crea la pareja y sus enlaces e incrementa ambos contadores, cada uno limitado a cinco.
- Las reglas rechazan nuevos documentos de invitación por enlace y su aceptación; el propietario conserva únicamente cancelación de las pendientes antiguas.
- Se agregaron pruebas negativas de directorio, asignación, identidad, locks, contadores, vencimiento prematuro, campos extra y borrado, más casos positivos concurrentes y migración.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for authenticated code lookups, recipient-only acceptance, immutable identities, atomic capacity limits, and private reward data. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.
