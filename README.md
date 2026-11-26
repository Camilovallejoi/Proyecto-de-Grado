# Cantaluna — Gestión de zonas comunes

Aplicación móvil para gestionar las **zonas comunes y sus reservas** en conjuntos y edificios de propiedad horizontal de Barranquilla (Colombia). Reemplaza procesos manuales —reservas por WhatsApp, llamadas y cuadernos— por un sistema único que valida las reglas de cada zona y evita reservas duplicadas.

Proyecto de grado de Ingeniería de Sistemas, Universidad Autónoma del Caribe.
Autores: Camilo José Vallejo Isaza y Jesús Mendoza.

## Qué hace

Tres perfiles, definidos a partir de la revisión de aplicaciones colombianas de administración de conjuntos (ConjuntosApp, Residentia, Edifia y Mi Conjunto; ver [docs/comparativa_apps.md](docs/comparativa_apps.md)) y del principio de mínimo privilegio:

| Perfil | Qué hace en la aplicación |
|---|---|
| **Residente** | Consulta zonas y reserva; avisa que va llegando para que abran el portón; **autoriza visitantes con un código y QR**; **chatea con el vigilante**; ve los **paquetes y domicilios** que llegaron a su unidad; lee comunicados, radica PQRS (peticiones, quejas, reclamos y sugerencias) y reporta incidencias en las zonas. |
| **Vigilante (celador)** | Controla el acceso: atiende avisos del portón, valida el código de las visitas, registra entradas y salidas y, si llega alguien sin aviso, **pide autorización al residente que van a visitar**; ve el **registro de ingresos**; **registra y entrega paquetes y domicilios**; lleva la **minuta digital** de su turno; reporta incidencias; gestiona las zonas comunes y las reservas; atiende el chat privado con los residentes. |
| **Administración** | Gestiona el conjunto: publica comunicados, responde PQRS y da seguimiento a incidencias (con lo pendiente primero y los días que lleva abierto), lee la minuta, **agrega residentes** y vigilantes, crea unidades (apartamentos, casas, locales) e invitaciones, activa o desactiva usuarios, **gestiona las zonas comunes** y consulta el resumen de gestión. No opera portería ni reservas. Ver [docs/permisos_por_perfil.md](docs/permisos_por_perfil.md). |

Funciones principales:

- **Zonas comunes con reglas propias:** horario, días habilitados, duración máxima por reserva, anticipación mínima y límite de reservas activas por unidad.
- **Sin reservas duplicadas:** el servidor valida todas las reglas y la base de datos impide con una restricción de exclusión que dos reservas se solapen, incluso con peticiones simultáneas.
- **Aviso de llegada al portón:** el residente avisa que va llegando en un vehículo; el vigilante lo ve, abre el portón y lo marca como atendido. Los avisos sin atender vencen a los 30 minutos.
- **Visitantes con QR:** el residente autoriza a un visitante (vigencia de 2 horas a 3 días, máximo 5 autorizaciones vigentes) y recibe un código de 6 caracteres con su QR; en portería se valida el código y se registra la entrada y la salida, y se avisa al residente. Si llega un visitante sin autorización previa, el vigilante elige a qué residente visita y le envía una solicitud: **solo ese residente puede autorizarla o rechazarla** (10 minutos para responder, máximo 3 pendientes) y el visitante no entra hasta que la autorice.
- **Chat residente–vigilante:** cada residente tiene su conversación con portería, con actualización cada 3 segundos y notificación al celular.
- **Llamadas:** el residente llama al número único de portería y el vigilante llama a quienes autorizaron compartir su teléfono (directorio, chat y visitas sin respuesta). La app abre el marcador del teléfono.
- **Tiempo real:** cada aviso queda en una bandeja dentro de la app (consultada cada 4 segundos) y además llega como notificación push. Con la app abierta aparece un aviso emergente desde el que se puede autorizar una visita, confirmar que se abrió el portón o avisar que se va por un domicilio; al tocarlo se abre la pantalla correspondiente.
- **Pantalla de inicio por perfil** con lo que hay que atender ahora y acciones rápidas, sesión guardada de forma cifrada en el teléfono (el pase dura 12 horas) y perfil con teléfono, número de portería y apariencia.
- **Paquetes y domicilios:** el vigilante registra lo que llega a una unidad (se avisa al residente) y marca la entrega.
- **Incidencias:** residentes y vigilantes reportan daños en las zonas; la administración les hace seguimiento y las cierra con una nota.
- **Minuta digital:** el vigilante anota novedades, rondas y alertas de su turno; la administración las consulta.
- **Notificaciones push** (Firebase Cloud Messaging) para avisos del portón, mensajes, visitas, comunicados y respuestas a PQRS; sin Firebase configurado todo funciona igual y las pantallas se actualizan solas.
- **Limpieza automática** (vencimientos cada 20 segundos y borrado de lo terminado o vencido cada 10 minutos; plazos en [docs/permisos_por_perfil.md](docs/permisos_por_perfil.md)) y **auditoría** de las acciones relevantes.
- **Cuentas:** la administración agrega residentes y vigilantes con una contraseña temporal que deben cambiar al entrar. Si alguien olvida la suya, la administración confirma su identidad y la restablece: la temporal se muestra una sola vez, vence en 24 horas, cierra las sesiones abiertas y desconecta las notificaciones del teléfono.
- Diseño con modo claro y oscuro.

## Previsto para fases siguientes

Recuperación de contraseña por correo, lectura del QR con la cámara (hoy el vigilante digita el código; falta probarlo en un teléfono real), fotos en las incidencias, confirmación de lectura de comunicados, llamada por internet dentro de la app, encuestas y votaciones, pagos y asambleas.

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
| `docs/` | Matriz de permisos, comparativa, capturas, diagramas UML y los generadores del documento del proyecto |

## Cómo ejecutarlo

Cada vez que actualice el código, ejecute `npm run db:migrate` en `backend`: solo aplica las migraciones que falten.

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

`npm run db:seed` crea datos de demostración ficticios: administrador `admin@demo.test`, residente `residente@demo.test` y celador `celador@demo.test` (todos con la contraseña `Demo12345!`) y el código de invitación `DEMO2026`. Solo deben usarse en pruebas.

## Si se olvida la contraseña de la administración

Nadie puede restablecerla desde la app. Quien administra el servidor ejecuta en `backend`:

```bash
npm run admin:clave -- correo@del.administrador
```

## Documento del proyecto

En `docs/generador`: `node gen_diagrams.js`, `node gen_codigo.js` y `node v2/documento.js`. Después, `powershell -ExecutionPolicy Bypass -File v2/actualizar_word.ps1` calcula la tabla de contenido y los números de página (requiere Word). El archivo de Word no se sube al repositorio.

## Pruebas

Con la API encendida, desde `backend`:

```bash
npm run test            # 347 verificaciones funcionales de la API
npm run test:limpieza   # 42 verificaciones de la limpieza y las tareas en tiempo real
```

Y, sin necesidad de servidor, desde `mobile` (pruebas de interfaz con un servidor simulado: abren cada formulario, lo envían y comprueban que no haya errores de Flutter):

```bash
flutter test            # 37 pruebas de interfaz
```

## Estado y limitaciones

- La app se verificó en Android; no se ha verificado en iOS.
- Se ejecuta en un entorno local; el despliegue en la nube con HTTPS está previsto.
- La sesión se guarda cifrada en el teléfono y dura 12 horas.
- Falta el aviso de privacidad general y limitar los intentos de inicio de sesión antes de usar datos reales.
- Pendientes: pruebas de usabilidad con usuarios y trabajo de campo (encuesta y entrevistas).

## Notificaciones push (opcional)

1. Cree un proyecto en [Firebase](https://console.firebase.google.com), registre la app Android con el paquete `com.example.flutter_application_1` y copie `google-services.json` en `mobile/android/app/`.
2. En *Configuración del proyecto → Cuentas de servicio* genere una clave privada y guárdela como `backend/firebase-service-account.json` (el archivo está en `.gitignore`; nunca lo suba al repositorio).
3. En `backend/.env` agregue `FIREBASE_SERVICE_ACCOUNT=./firebase-service-account.json` y reinicie la API.

Firebase es opcional: sin `google-services.json` la app compila y funciona con la bandeja y los avisos internos, y sin la clave de la cuenta de servicio la API funciona igual; en ambos casos simplemente no hay notificaciones push. En Windows, compilar la app con Firebase exige activar el *Modo de desarrollador* (`start ms-settings:developers`). Para probar en el emulador use una imagen con Google Play.

**Teléfonos de prueba:** `npm run db:seed` agrega números de ejemplo (no son reales). Cámbialos en la app, en *Mi perfil*, como administración (portería) y como residente.
