// Resultados de la ejecución del 26 de noviembre de 2026. Las cantidades salen de los registros de las pruebas.
const api = [
  ['Acceso, zonas y reservas', 'Inicio de sesión, permisos, creación de zonas, reglas de reserva y concurrencia', '19'],
  ['Consulta y borrado de reservas y zonas', 'Disponibilidad, cancelación, eliminación y permisos de cada rol', '27'],
  ['Aviso de portón', 'Envío, validación, un solo pendiente, atención y cancelación', '18'],
  ['Vigilante y dispositivos', 'Operación del vigilante, zonas y registro del teléfono para push', '17'],
  ['Visitas con QR e ingresos', 'Autorización, códigos, entrada, salida, registro y límite de 5', '24'],
  ['Visitante sin aviso', 'Solicitud, respuesta exclusiva del visitado, estados y máximo de pendientes', '23'],
  ['Chat de portería', 'Privacidad del hilo, mensajes nuevos, validaciones y ausencia de chat comunitario', '14'],
  ['Paquetes y domicilios', 'Registro, consulta por unidad, entrega y permisos', '14'],
  ['Incidencias', 'Reporte, visibilidad, seguimiento y cierre con nota', '17'],
  ['Minuta', 'Anotación, lectura, tipos y permisos', '9'],
  ['Comunicados y PQRS', 'Publicación, radicación, respuesta, cierre y permisos', '19'],
  ['Usuarios y reportes', 'Alta de vigilantes, activación y resumen de gestión', '14'],
  ['Separación de funciones', 'Rechazo de la operación a la administración y de la gestión al vigilante y al residente', '18'],
  ['Alta de residentes y clave temporal', 'Alta por la administración, cambio obligatorio y cierre de sesiones', '19'],
  ['Restablecimiento de contraseña', 'Permisos, temporal mostrada una sola vez, sesiones cerradas y cuenta desactivada', '15'],
  ['Teléfonos y desactivación', 'Número de portería, autorización, directorio y anulación de accesos', '24'],
  ['Bandeja de notificaciones', 'Entrega a quien corresponde, resolución, reemplazo y privacidad', '35'],
  ['Opciones de los formularios', 'Todos los tipos de paquete, minuta, PQRS, vehículo y gravedad', '16'],
  ['Inicio por perfil', 'Contenido y privacidad de cada pantalla de inicio', '5'],
  ['Total', '', '347'],
];

const limpieza = [
  ['Reservas y portón', 'Borrado de terminadas y canceladas antiguas, auditoría, vencimiento y borrado de avisos', '9'],
  ['Visitas y solicitudes', 'Vencimiento de autorizaciones y solicitudes, y conservación de lo vigente', '5'],
  ['Chat, paquetes y minuta', 'Borrado por antigüedad sin eliminar lo reciente ni lo pendiente de entregar', '7'],
  ['Visitas antiguas, avisos y teléfonos', 'Plazos de visitas sin ingreso, ingresos, notificaciones y teléfonos abandonados', '7'],
  ['Invitaciones', 'Borrado de vencidas y conservación de vigentes', '2'],
  ['Recordatorios y avisos de vencimiento', 'Recordatorio una sola vez, avisos a los afectados y sin duplicados', '6'],
  ['Contraseña temporal', 'Vencimiento a las 24 horas, cifrado, contraseñas distintas y mensajes seguros', '6'],
  ['Total', '', '42'],
];

const R = 'Residente', V = 'Vigilante', A = 'Administración', G = 'General';
const interfaz = [
  ['Responde una solicitud de visita (autorizar)', R], ['Autoriza una visita y ve su código QR sin errores', R], ['Reporta una incidencia', R], ['Radica una PQRS', R],
  ['Envía un mensaje al vigilante y aparece al instante', R], ['Inicio: pendientes, acciones y navegación', R], ['Llamar a portería abre el marcador con el número del conjunto', R], ['Sin número de portería, se explica en lugar de abrir el marcador', R],
  ['Avisa que ya va por su domicilio', R], ['El perfil muestra teléfono, portería y apariencia sin desbordes', R], ['Registro: no guarda el teléfono sin autorizar', R],
  ['Pide autorización para un visitante sin aviso', V], ['Registra y entrega un paquete', V], ['Anota en la minuta', V], ['Inicio: lo urgente, llamada y portón', V],
  ['Directorio: busca y llama a un residente', V], ['Visitas: pantalla completa y llamada a quien no responde', V],
  ['Cierra una incidencia con una nota', A], ['Publica un comunicado', A], ['Da de alta a un vigilante', A], ['Agrega un residente y debe elegir la unidad', A],
  ['Restablece una contraseña solo tras confirmar la identidad', A], ['Ve primero las PQRS pendientes y consulta las resueltas', A], ['Crea una unidad y genera una invitación', A],
  ['Resumen: muestra lo pendiente y sus secciones, sin operación', A], ['Al tocar una zona, la edita en lugar de reservar', A], ['Perfil: cambia el número de portería', A],
  ['Con contraseña temporal hay que crear una propia antes de entrar', G], ['Aviso en tiempo real: llega una visita y se autoriza desde el aviso', G], ['Aviso en tiempo real: el vigilante abre el portón desde el aviso', G],
  ['Al cerrar sesión, un aviso pendiente no se muestra a quien entre después', G], ['Sesión vencida: la app avisa para volver a entrar', G], ['La sesión guardada se recupera y una vencida se descarta', G],
  ['«¿Olvidaste tu contraseña?» explica qué hacer', G], ['Portón: pantallas de residente y vigilante completas', G], ['Bandeja: lista, marca como leídas y navega', G], ['Cada tipo de aviso lleva a la pantalla correcta según el perfil', G],
].map(([t, p], i) => ['PI-' + String(i + 1).padStart(2, '0'), t, p]);

const OK = 'Aprobada';
const manual = [
  ['PM-01', 'Iniciar sesión con los tres perfiles', OK],
  ['PM-02', 'Recorrer las secciones del residente con datos de ejemplo', OK],
  ['PM-03', 'Elegir día, hora y duración, confirmar y ver la reserva en «Mis reservas» (primera versión)', OK],
  ['PM-04', 'Recibir el aviso de una visita con la app abierta y autorizarla desde el aviso (visible en unos 5 s)', OK],
  ['PM-05', 'Recorrer las secciones del vigilante y abrir sus formularios', OK],
  ['PM-06', 'Recorrer las secciones de la administración y abrir sus formularios', OK],
  ['PM-07', 'Restablecer una contraseña de prueba, ver la temporal, entrar con ella y ver el cambio obligatorio', OK],
  ['PM-08', 'Generar el código de invitación de una unidad', OK],
  ['PM-09', 'Cambiar entre modo claro y oscuro', OK],
  ['PM-10', 'Recibir una notificación push con la app en segundo plano (emulador con Google Play y Firebase)', OK],
  ['PM-11', 'Repetir los recorridos en un teléfono físico', 'Pendiente'],
];

const defectos = [
  ['D-01', 'Pantalla de error al cambiar de pestaña en pantallas que se actualizan solas', 'Uso en el emulador', 'Leer la visibilidad de la pantalla al construirla y no desde el temporizador'],
  ['D-02', 'El chat no mostraba los mensajes: los identificadores llegaban como texto', 'Uso en el emulador', 'Convertir los identificadores numéricos en el servidor y verificarlo en las pruebas'],
  ['D-03', 'Pantalla de error al generar el código QR y al cerrar formularios (13 formularios)', 'Uso en el emulador y reproducción en una prueba', 'Tamaño fijo del QR y liberación de campos al terminar de cerrar; pruebas de formularios'],
  ['D-04', 'Visitas y paquetes del vigilante fallaban por un ancho de botón no limitado', 'Pruebas de interfaz con el tema real', 'Corregir el tema y probar siempre con él y con tamaño de teléfono'],
  ['D-05', 'La lista desplegable del formulario de zona se desbordaba', 'Pruebas de interfaz', 'Ajustar la lista al ancho disponible'],
  ['D-06', 'El estado «sin_respuesta» de una visita no cabía en la columna', 'Prueba de las tareas automáticas', 'Ampliar la columna en la migración que agregó el estado'],
  ['D-07', 'Registrar correspondencia devolvía error del servidor (columna de 14 caracteres para un valor de 15)', 'Carga de datos de ejemplo', 'Migración 013 y pruebas de todas las opciones de los formularios'],
  ['D-08', 'El resumen mostraba «(1 graves)»', 'Revisión de capturas', 'Concordancia en singular y plural'],
];

module.exports = { api, limpieza, interfaz, manual, defectos };
