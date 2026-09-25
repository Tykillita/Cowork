<h1 align="center">COWORK</h1>

<p align="center"><strong>ESPACIO DE EQUIPO</strong></p>

<p align="center"><strong>Un espacio compartido para coordinar proyectos, tareas y actividad del equipo.</strong></p>

<p align="center">
  <a href="https://react.dev"><img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827"></a>
  <a href="https://www.typescriptlang.org"><img alt="TypeScript 5" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white"></a>
  <a href="https://vite.dev"><img alt="Vite 7" src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white"></a>
  <a href="https://firebase.google.com"><img alt="Firebase 12" src="https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase&logoColor=111827"></a>
</p>

<p align="center">
  <a href="#resumen">Resumen</a> &bull;
  <a href="#funciones">Funciones</a> &bull;
  <a href="#arquitectura">Arquitectura</a> &bull;
  <a href="#inicio">Inicio rápido</a> &bull;
  <a href="#firebase">Firebase</a> &bull;
  <a href="#estructura">Estructura</a>
</p>

---

## Resumen

**Cowork** es el espacio de coordinación del equipo: permite elegir un proyecto, organizar su trabajo y consultar la actividad de su repositorio. Vigilia es el primer proyecto integrado; el catálogo está preparado para incluir otros.

Cowork es un panel de trabajo para el equipo. El producto Vigilia se desarrolla por separado: Cowork no recibe ingresos de emergencia ni procesa datos de pacientes.

## Funciones

| Área | Qué permite hacer |
|---|---|
| Catálogo de proyectos | Elegir Vigilia u otro proyecto del equipo y abrir su espacio de trabajo. |
| Tablero de tareas | Asignar tareas, actualizar su estado y consultar el progreso compartido. |
| Ramas y cambios | Registrar en qué rama trabaja cada persona y el objetivo del cambio. |
| Actividad de GitHub | Consultar ramas públicas y commits recientes del repositorio asociado. |
| Espacio de Vigilia | Revisar la descripción del reto y la arquitectura propuesta. |

## Arquitectura

- **Interfaz:** React, TypeScript y Vite.
- **Acceso y datos compartidos:** Firebase Authentication y Cloud Firestore.
- **Alojamiento:** Firebase Hosting, con emuladores locales para desarrollo.
- **Actividad del repositorio:** API pública de GitHub para ramas y commits; los registros del equipo se guardan en Firestore.
- **Modo local:** si Firestore no está disponible, el tablero puede usar almacenamiento del navegador. Esos cambios permanecen en ese navegador y no se sincronizan con el equipo.

El catálogo muestra metadatos del proyecto antes del inicio de sesión. Las tareas y los registros de trabajo están protegidos por las reglas de Firestore para miembros configurados.

## Inicio

### Requisitos

- Node.js 22.
- Java 21 para ejecutar los emuladores locales de Firebase.

### Ejecutar Cowork

```bash
npm install
npm run dev
```

Este comando compila la aplicación e inicia los emuladores de Firebase para Hosting, Authentication y Firestore. La terminal muestra la dirección local de Hosting, normalmente `http://localhost:5000`; la consola de emuladores suele estar en `http://localhost:4000`.

Para trabajar con recarga rápida de Vite, inicia los emuladores en una terminal y Vite en otra:

```bash
# Terminal 1
npm run dev:emulators

# Terminal 2
npm run dev:vite
```

## Firebase

Cowork usa Firebase Authentication para el acceso del equipo y Cloud Firestore para los datos compartidos. Firebase Hosting sirve la aplicación; los emuladores permiten desarrollarla localmente. Configura los miembros y sus permisos en Firebase antes del despliegue. No añadas contraseñas ni secretos a este README.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/features/` | Autenticación, proyectos, tablero y conexión con GitHub. |
| `src/pages/` | Vistas principales de Cowork y del espacio de Vigilia. |
| `src/styles/` | Tokens, componentes y estilos de la interfaz. |
| `public/` | Recursos estáticos servidos directamente por Vite. |

---

<p align="center"><em>Cada proyecto en contexto. Cada colaboración en marcha.</em></p>
