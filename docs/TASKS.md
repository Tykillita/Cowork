# Tareas en Cowork

El plan de trabajo (`#work`) muestra las tareas del proyecto en dos vistas, **Tablero** y **Lista**. Cada tarea se abre en un panel de detalle. Este documento describe el modelo, las reglas de Firestore y el comportamiento de la interfaz.

## Modelo

`Task` está en `src/types.ts`. Los límites coinciden con `firestore.rules` y están en `TASK_LIMITS`.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | texto | `t` + 16 caracteres aleatorios (`newId`, `src/lib/ids.ts`). |
| `order` | entero | Posición en el plan. Ver «Orden». |
| `phase` | texto ≤ 60 | Texto libre; el formulario sugiere las fases existentes. |
| `title` | texto ≤ 300 | |
| `status` | `Pendiente` · `En curso` · `Hecha` | |
| `assignee`, `assigneeUid` | texto | Nombre guardado como historial y cuenta responsable. |
| `milestoneId` | texto | `""` sin hito. |
| `revision` | entero | Sube en cada escritura; cada revisión tiene un evento. |
| `description` | texto ≤ 4000 | |
| `priority` | `baja` · `media` · `alta` | `media` por defecto. |
| `dueDate`, `timeZone`, `dueAt` | texto | Día límite, zona y fin de ese día en UTC (`milestoneDueAt`). Los tres vacíos si no hay fecha. |
| `checklist` | lista de `{ id, text, done }` | Hasta 20 pasos de hasta 200 caracteres. Se guarda como **un texto JSON** (`""` si está vacía); ver más abajo. |
| `branch` | texto ≤ 120 | Rama del registro o de GitHub. |
| `createdAt`, `createdByUid` | texto | Se fijan al crear y no cambian. Las tareas anteriores a estos campos los tienen vacíos. |

### Tareas antiguas

Las tareas escritas antes de los campos nuevos se leen con valores por defecto (`readTask` en `firestoreWorkboard.ts`): prioridad `media`, lista vacía y textos vacíos. Las reglas usan los mismos valores en `get(campo, defecto)`. Al guardar, el cliente escribe siempre todas las claves.

### Por qué la lista de pasos es un texto JSON

Las reglas de Firestore evalúan como máximo **1000 expresiones por petición**. Una lista de mapas cuesta cientos de ellas incluso sin cambios, porque cada comparación recorre todos los elementos. Con 20 pasos, una actualización corriente superaba el límite. Guardada como texto, la comparación cuesta una expresión, y las reglas solo limitan el tamaño (≤ 8000 caracteres). El cliente valida cada paso al leer (`readChecklist`) y al escribir (`encodeChecklist`). Si una lista no cabe, el guardado se rechaza con un mensaje en español.

## Reglas

En `firestore.rules`:

- `validTask` acepta las claves base más las de detalle (`taskDetailKeys`) y valida cada campo.
- Una actualización **debe conservar todas las claves que ya existen**. Una pestaña con la versión anterior, que solo conoce las claves base, recibe `permission-denied` y el mensaje de recargar, en lugar de borrar los campos nuevos.
- `createdAt` y `createdByUid` no cambian. Al crear, `createdByUid` es quien crea la tarea.
- `taskChangesConsistent` exige que el evento registre exactamente lo que cambió, con sus valores reales `from` y `to`:
  - estado, responsable, hito, título, fase, prioridad, fecha y rama;
  - `checklist: { done, total }`, `details: true` (descripción) y `order: true` (posición).

  Esto cierra los huecos anteriores: el título solo se comprobaba si venía en el evento, el `from` del hito no se validaba, y la fase y el orden no se registraban.

## Orden

`order` es un entero con huecos amplios (`ORDER_GAP = 2^20`):

- Una tarea nueva va un hueco después de la última (`nextOrder`).
- Al soltar entre dos tareas toma el punto medio (`between`).
- Si no queda ningún entero libre, `orderAt` devuelve el reparto nuevo (`respace`) y el tablero guarda esas tareas una a una, cada una con su evento `order: true`. Ese evento no aparece en la actividad.

El tablero y la lista comparten el mismo orden; solo importa el orden relativo dentro de una columna o de una fase.

## Eventos y puntos

`taskChanges` y `describeEvent` (`src/features/activity/activityEvents.ts`) cubren todos los campos, con textos como «cambió la prioridad a alta», «actualizó la lista (1/3)» o «la vinculó a la rama feature/x».

**Los puntos no cambian:** solo cuentan crear una tarea y cambiar su estado, con el tope de 3 al día. Editar los detalles no suma puntos.

## Interfaz

- **Tablero** (`KanbanView.tsx`). Tres columnas por estado. Una tarjeta se mueve de tres formas:
  - con el ratón, arrastrando la tarjeta;
  - en táctil, arrastrando desde su asa;
  - con el teclado, desde el asa: Espacio la toma, las flechas la mueven, Espacio la suelta y Escape cancela. Una región `role="status"` anuncia la posición.

  El select de estado de cada tarjeta mueve sin arrastrar y se abre como modal en móvil. El movimiento se muestra al instante y se revierte si falla. A 768 px o menos, las columnas se desplazan en horizontal.
- **Lista** (`TaskListView.tsx`). Agrupada por fase, con el título editable en línea (clic o F2).
- **Panel de detalle** (`TaskDrawer.tsx`, carga diferida):
  - Se abre con `#work?task=<id>`, así que el botón Atrás o Escape lo cierran.
  - Cada campo se guarda al confirmarlo.
  - `useTaskSaver` encadena los guardados y espera a que cada revisión llegue antes de enviar la siguiente.
  - La descripción se guarda con su botón o con Ctrl+Enter.
  - Borrar pide confirmación en línea.
- **Filtros** (`taskFilters.ts`): búsqueda por título, fase, descripción y rama; responsable, estado, hito, prioridad y fecha. En móvil se pliegan tras «Filtros (n)».
- **La vista elegida** se guarda en `localStorage["cowork.task-view"]`, y el skeleton de arranque toma esa misma forma.
- **Avisos:** las tareas propias con fecha que vencen en menos de 24 h, o ya vencidas, aparecen en «Para ti» del centro de actividad (`deadlineNotices`) y abren la tarea.

## Despliegue

1. Primero las reglas: `npx firebase-tools deploy --only firestore:rules`. Aceptan tanto el cliente nuevo como el anterior, salvo que el anterior intente borrar campos nuevos.
2. Después el hosting.

La transición que acepta escrituras sin evento termina el **10 de octubre de 2026** (`transitionOpen()` en las reglas). Si las reglas se publican después de esa fecha, conviene retirar `validLegacyTask` en el mismo cambio.

## Pruebas

- Unitarias:
  - `tests/unit/taskModel.test.ts`: modelo, orden y JSON de la lista;
  - `tests/unit/taskBoard.test.ts`: filtros, teclado, puntos de inserción y avisos;
  - `tests/unit/logic.test.ts`: eventos.
- Reglas: `tests/firestore.rules.test.mjs`, bloque «task details». Incluye la escritura del peor caso: todos los campos cambian a la vez con 20 pasos.
- E2E:
  - `tests/e2e/kanban.spec.ts`: teclado, puntero, select, vista recordada y maquetación;
  - `tests/e2e/task-drawer.spec.ts`: enlace directo, edición de cada campo, borrado, móvil y avisos;
  - `tests/e2e/tasks.spec.ts`.
