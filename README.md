# Cantaluna — Gestión de zonas comunes

Aplicación móvil para gestionar las **zonas comunes y sus reservas** en conjuntos y edificios de propiedad horizontal de Barranquilla (Colombia). Reemplaza procesos manuales —reservas por WhatsApp, llamadas y cuadernos— por un sistema único que valida las reglas de cada zona y evita reservas duplicadas.

Proyecto de grado de Ingeniería de Sistemas, Universidad Autónoma del Caribe.
Autores: Camilo José Vallejo Isaza y Jesús Mendoza.

## Qué hace (primera fase, implementado)

- **Roles:** residente y administrador, con registro mediante un código de invitación que entrega la administración.
- **Zonas comunes con reglas propias:** horario, días habilitados, duración máxima por reserva, anticipación mínima y límite de reservas activas por unidad.
- **Reservas:** el residente consulta la disponibilidad, reserva, cancela y ve sus reservas.
- **Administrador:** crea, edita, pone en mantenimiento y elimina zonas; ve las reservas del conjunto (vigentes y canceladas) y puede eliminarlas.
- **Sin reservas duplicadas:** el servidor valida todas las reglas y la base de datos impide con una restricción de exclusión que dos reservas se solapen, incluso con peticiones simultáneas.
- **Limpieza automática:** las reservas que ya terminaron y las canceladas hace más de 24 horas se borran solas.
- **Auditoría** de las acciones relevantes y diseño con modo claro y oscuro.

## Previsto para fases siguientes

PQRS, reporte de incidencias, comunicaciones, notificaciones push, recuperación de contraseña y reportes. El esquema de la base de datos ya incluye varias de sus tablas.

## Tecnologías

| Parte | Tecnología |
|---|---|
| App móvil | Flutter (Dart) |
| API | Node.js, Express y TypeScript |
| Base de datos | PostgreSQL |
| Autenticación | JWT y contraseñas cifradas con bcrypt |

## Estructura del repositorio

| Carpeta | Contenido |
|---|---|
| `mobile/` | App Flutter (`lib/pantallas` tiene las pantallas; `lib/tema.dart`, el diseño) |
| `backend/` | API REST (`src/routes`), migraciones SQL (`db/migrations`) y pruebas (`scripts`) |
| `docs/` | Diagramas UML y el generador del documento del proyecto |

## Cómo ejecutarlo

Requisitos: Node.js 22, PostgreSQL 18, Flutter con el SDK de Android y un emulador.

1. Cree una base de datos vacía llamada `zonas_comunes` en PostgreSQL.
2. **Servidor** (carpeta `backend`):
   ```bash
   npm install
   copy .env.example .env      # edite el archivo con su contraseña de PostgreSQL y un JWT_SECRET propio
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```
3. **App** (carpeta `mobile`), con el emulador de Android abierto:
   ```bash
   flutter pub get
   flutter run
   ```

`npm run db:seed` crea datos de demostración ficticios: administrador `admin@demo.test`, residente `residente@demo.test` (ambos con la contraseña `Demo12345!`) y el código de invitación `DEMO2026`. Solo deben usarse en pruebas.

## Pruebas

Con la API encendida, desde `backend`:

```bash
npm run test            # 42 verificaciones funcionales de la API
npm run test:limpieza   # 6 verificaciones de la limpieza automática
```

## Estado y limitaciones

- La app se verificó en Android; no se ha verificado en iOS.
- Se ejecuta en un entorno local; el despliegue en la nube con HTTPS está previsto.
- La sesión no se conserva al cerrar la aplicación.
- Pendientes: pruebas de usabilidad con usuarios y trabajo de campo (encuesta y entrevistas).
