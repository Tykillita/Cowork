# Video de presentación

`docs/video/cowork-tour-es.mp4` y `docs/video/cowork-tour-en.mp4` presentan Cowork en 77 segundos:

- 1920 × 1080, a 30 fps, en H.264;
- banda sonora original en AAC.

Los README muestran el reproductor de GitHub con una URL de adjunto por idioma y conservan el enlace al MP4 del repositorio para descargarlo. Los pósteres (`docs/images/video-poster-es.jpg` y `-en.jpg`) siguen disponibles como recursos del recorrido.

Todo se genera desde este repositorio. No hace falta editar video a mano.

## Cómo está hecho

| Pieza | Archivo | Qué hace |
|---|---|---|
| Capturas | `tests/e2e/tour-capture.spec.ts` | Siembra un proyecto de ejemplo («Vigilia», con tres personas, tareas, hitos, ramas, actividad y un archivo propuesto) en los emuladores. La API de GitHub se simula. Captura las vistas a 1600 × 1000 (×1,5) en `docs/video/source/shots/`. |
| Escenas | `docs/video/source/index.html` | Una línea de tiempo de 11 escenas: intro, el problema, un espacio por proyecto, el resumen, el tablero, las ramas, el código, los archivos en revisión, más funciones, tus datos y el cierre. Los textos están en español e inglés (`?lang=`), y `window.render(t)` dibuja cualquier instante. |
| Render | `docs/video/source/render.mjs` | Abre la página en el Chromium de Playwright, llama a `render(t)` en cada fotograma y manda las capturas a ffmpeg. |
| Música | `docs/video/source/soundtrack.py` | Sintetiza la música y los efectos con numpy y scipy, sin muestras externas. Va a 120 BPM, y cada cambio de escena cae en medio pulso. Es la misma base que el recorrido de isTargetSleeping. |
| Póster | `docs/video/source/poster.py` | Usa un fotograma de la intro y le añade el botón de reproducir y la duración. |

Las escenas y la música comparten la misma tabla de tiempos (`SCENES` en `index.html`). Si mueves una escena, mueve también sus efectos en `soundtrack.py`.

## Regenerarlo

Requisitos:

- los emuladores libres en 8080 y 9099;
- ffmpeg en el `PATH`;
- Python 3 con numpy, scipy y Pillow.

Desde la raíz del repositorio:

```bash
npm run video:capture
python docs/video/source/soundtrack.py docs/video/source/out/soundtrack.wav
node docs/video/source/render.mjs es docs/video/source/out/silent-es.mp4
node docs/video/source/render.mjs en docs/video/source/out/silent-en.mp4
ffmpeg -y -i docs/video/source/out/silent-es.mp4 -i docs/video/source/out/soundtrack.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart docs/video/cowork-tour-es.mp4
ffmpeg -y -i docs/video/source/out/silent-en.mp4 -i docs/video/source/out/soundtrack.wav -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart docs/video/cowork-tour-en.mp4
node docs/video/source/render.mjs es --stills 4.6
node docs/video/source/render.mjs en --stills 4.6
python docs/video/source/poster.py docs/video/source/out/es-4.6.png es docs/images/video-poster-es.jpg
python docs/video/source/poster.py docs/video/source/out/en-4.6.png en docs/images/video-poster-en.jpg
```

- `render.mjs <idioma> --stills 3,24,57` saca fotogramas sueltos para revisar una escena sin renderizar el video entero.
- `shots/` y `out/` no se suben al repositorio.
- La versión que aparece en el cierre se lee de `VERSION`.

## En los README

GitHub no reproduce dentro de la página un `.mp4` guardado en el repositorio: ese enlace lo abre o lo descarga. Para mostrar el reproductor inline, los README usan la URL de adjunto que GitHub genera al subir el video a un issue.

Para tener el reproductor incrustado:

1. Arrastra el MP4 a un comentario de un issue en GitHub.
2. Copia la URL `https://github.com/user-attachments/assets/…` que genera.
3. Pégala sola en su propio párrafo del README: la del video en español en `README.md` y la del video en inglés en `README.en.md`. Conserva también los enlaces al MP4 del repositorio como alternativa de descarga.

Lo hace quien tenga la sesión de GitHub abierta. Ver [AGENTS.md](../AGENTS.md#video-de-presentación).
