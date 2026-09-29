# Rendimiento de Cowork

## Cambios aplicados

- La portada, el selector, las cuatro páginas de proyecto y los diálogos de colección y rachas se cargan cuando se necesitan. Cada transición conserva un skeleton con la forma de la vista final.
- El skeleton de arranque del selector dibuja una pila estática de tarjetas. El carrusel animado se carga al entrar en la vista real.
- El carrusel real se detiene fuera de pantalla, con la pestaña oculta y con movimiento reducido. Al activar movimiento reducido durante una transición, termina esa transición y queda inmóvil.
- Los botones con brillo WebGL dejan de dibujar cuando están inactivos, fuera de pantalla, en una pestaña oculta o con movimiento reducido. Al acercar el puntero retoman el efecto. Los cambios de tamaño idénticos no reinicializan su lienzo.
- El lienzo de la escena pixelada tampoco se reinicializa cuando el tamaño cuantizado no ha cambiado.
- La paginación del centro de actividad sustituye solo la suscripción de eventos del proyecto paginado; mantiene las demás suscripciones y el contenido ya visible.
- TypeScript guarda su estado incremental entre compilaciones locales.

## Mediciones locales

| Indicador | Antes | Después | Cambio |
| --- | ---: | ---: | ---: |
| Bundle JavaScript principal, minificado | 925,46 kB | 628,20 kB | −32,1 % |
| CSS principal, minificado | 165,1 kB | 147,78 kB | −10,5 % |
| Compilación local repetida | 9,78 s | 7,75 s | −20,8 % |
| Dibujos WebGL durante 500 ms inactivos en el selector | ciclo continuo en el código anterior | 0 en la prueba del navegador | efecto detenido |
| Dibujos WebGL durante 500 ms con movimiento reducido | ciclo continuo en el código anterior | 0 en la prueba del navegador | efecto detenido |

Las medidas de bundles provienen de `npm run build` con Vite; son tamaños de archivos, no tiempos de descarga. Los tiempos de compilación son dos ejecuciones locales con las dependencias ya instaladas y caché caliente, y pueden variar según el equipo. La prueba de GPU usa Chromium y verifica además que el brillo vuelve a dibujarse al acercar el puntero. El cambio de suscripciones reduce de varias reconexiones por proyecto a una sola reconexión de eventos al paginar un proyecto; no se ha medido todavía la facturación de lecturas de Firestore en producción.

## Verificación de calidad

- `npm run build`: correcto; incluye comprobación de tipos.
- `npm run test:unit`: 41/41.
- `npm run test:rules`: 41/41 con emulador de Firestore.
- `npm run test:streaks`: 30/30 con emulador de Firestore.
- Pruebas de selector, búsqueda y diseño a 320, 375, 390, 430, 768 y 1440 px: 10/10 en Chromium después del cambio de WebGL.
- Navegación, menús móviles y movimiento reducido: 7/7 en Firefox, WebKit móvil y Chromium móvil.
- Paginación entre proyectos: prueba específica correcta; los eventos del otro proyecto permanecen visibles.
- Brillo WebGL: prueba específica correcta; cero dibujos inactivos y con movimiento reducido, con dibujo al interactuar.
- Carrusel: la prueba específica comprueba que las tarjetas permanecen inmóviles con movimiento reducido.
- Recorridos completos de Chromium, excepto una prueba preexistente incompatible con la vista compilada: 39/39.
- Menú, búsqueda y movimiento reducido en Safari móvil después del cambio del carrusel: 3/3.

## Límites de esta evaluación

- No hay una medición comparable anterior de LCP, INP, CLS ni de lecturas facturadas. Conviene medirlos en una vista previa con datos representativos y red móvil antes de fijar presupuestos de experiencia real.
- El bundle de Firestore sigue siendo grande (562,04 kB minificados). Se carga cuando la aplicación necesita datos, y dividirlo artificialmente puede añadir viajes de red sin reducir el código necesario.
- La batería completa de navegador ya tenía cinco fallos antes de estos cambios: una prueba de conflicto importa una ruta de desarrollo desde la vista previa compilada; dos pruebas de animación de CardNav fallan en WebKit; una recarga rápida en WebKit se queda esperando una respuesta del emulador; y el flujo de amigos en WebKit agota el tiempo. La recarga se reprodujo de nuevo y su rastro muestra peticiones del emulador sin respuesta después de varias recargas. Las pruebas de navegación equivalentes pasaron en Chromium y Firefox.
- No se ha publicado la versión. La comprobación se realizó con builds y emuladores locales; la compatibilidad con el plan Spark se conserva.
