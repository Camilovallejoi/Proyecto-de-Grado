import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'modelos.dart';
import 'sesion.dart';

class ApiError implements Exception {
  final String mensaje;
  ApiError(this.mensaje);
  @override
  String toString() => mensaje;
}

class Regla {
  final int duracionMaximaMin;
  final int anticipacionMinimaMin;
  final int maxActivasPorUnidad;
  final List<int> diasHabilitados; // 0 = domingo

  Regla({required this.duracionMaximaMin, required this.anticipacionMinimaMin, required this.maxActivasPorUnidad, required this.diasHabilitados});

  factory Regla.fromJson(Map<String, dynamic> j) => Regla(
        duracionMaximaMin: j['duracion_maxima_min'] as int,
        anticipacionMinimaMin: j['anticipacion_minima_min'] as int,
        maxActivasPorUnidad: j['max_activas_por_unidad'] as int,
        diasHabilitados: (j['dias_habilitados'] as List).cast<int>(),
      );
}

class Zona {
  final int id;
  final String nombre;
  final String? descripcion;
  final int? aforo;
  final String horaApertura;
  final String horaCierre;
  final String estado;
  final Regla regla;

  Zona({required this.id, required this.nombre, this.descripcion, this.aforo, required this.horaApertura, required this.horaCierre, required this.estado, required this.regla});

  factory Zona.fromJson(Map<String, dynamic> j) => Zona(
        id: j['id'] as int,
        nombre: j['nombre'] as String,
        descripcion: j['descripcion'] as String?,
        aforo: j['aforo'] as int?,
        horaApertura: j['hora_apertura'] as String,
        horaCierre: j['hora_cierre'] as String,
        estado: j['estado'] as String,
        regla: Regla.fromJson(j['regla'] as Map<String, dynamic>),
      );
}

class Reserva {
  final int id;
  final int zonaId;
  final String zona;
  final DateTime inicio;
  final DateTime fin;
  final String estado;
  final String usuario;
  final String unidad;

  Reserva({required this.id, required this.zonaId, required this.zona, required this.inicio, required this.fin, required this.estado, required this.usuario, required this.unidad});

  bool get puedeCancelarse => estado == 'confirmada' && inicio.isAfter(DateTime.now());

  factory Reserva.fromJson(Map<String, dynamic> j) => Reserva(
        id: j['id'] as int,
        zonaId: j['zona_id'] as int,
        zona: j['zona'] as String,
        inicio: DateTime.parse(j['inicio'] as String),
        fin: DateTime.parse(j['fin'] as String),
        estado: j['estado'] as String,
        usuario: j['usuario'] as String,
        unidad: j['unidad'] as String,
      );
}

/// Aviso de llegada: el residente pide que le abran el portón para ingresar su vehículo.
class AvisoPorton {
  final int id;
  final String tipoVehiculo;
  final String? placa;
  final String estado; // pendiente | atendido | cancelado | vencido
  final DateTime creadoEn;
  final DateTime? atendidoEn;
  final String usuario;
  final String unidad;
  final String? atendidoPor;

  AvisoPorton({required this.id, required this.tipoVehiculo, this.placa, required this.estado, required this.creadoEn, this.atendidoEn, required this.usuario, required this.unidad, this.atendidoPor});

  bool get pendiente => estado == 'pendiente';

  factory AvisoPorton.fromJson(Map<String, dynamic> j) => AvisoPorton(
        id: j['id'] as int,
        tipoVehiculo: j['tipo_vehiculo'] as String,
        placa: j['placa'] as String?,
        estado: j['estado'] as String,
        creadoEn: DateTime.parse(j['creado_en'] as String),
        atendidoEn: j['atendido_en'] == null ? null : DateTime.parse(j['atendido_en'] as String),
        usuario: j['usuario'] as String,
        unidad: j['unidad'] as String,
        atendidoPor: j['atendido_por'] as String?,
      );
}

class Disponibilidad {
  final Zona zona;
  final List<({DateTime inicio, DateTime fin})> ocupados;
  Disponibilidad(this.zona, this.ocupados);
}

class Usuario {
  final int id;
  final String nombre;
  final String correo;
  final String rol;
  final String copropiedad;
  final String? unidad;
  final String? telefono; // el propio, si autorizó guardarlo
  final bool cambioClavePendiente; // cuenta creada con contraseña temporal
  Usuario({required this.id, required this.nombre, required this.correo, required this.rol, required this.copropiedad, this.unidad, this.telefono, this.cambioClavePendiente = false});

  bool get esAdmin => rol == 'administrador';
  bool get esVigilante => rol == 'vigilante';

  /// Administración y vigilantes: quienes ven la operación del conjunto.
  bool get esPersonal => esAdmin || esVigilante;

  factory Usuario.fromJson(Map<String, dynamic> j) => Usuario(
        id: j['id'] as int,
        nombre: j['nombre'] as String,
        correo: j['correo'] as String,
        rol: j['rol'] as String,
        copropiedad: j['copropiedad'] as String,
        unidad: j['unidad'] as String?,
        telefono: j['telefono'] as String?,
        cambioClavePendiente: j['cambio_clave_pendiente'] == true,
      );
}

class Api {
  Api._();
  static final Api i = Api._();

  // Android Emulator ve el PC como 10.0.2.2; web y escritorio usan localhost.
  // Para otro destino: flutter run --dart-define=API_URL=http://192.168.1.40:3000
  static const _urlDefinida = String.fromEnvironment('API_URL');
  static String get baseUrl {
    if (_urlDefinida.isNotEmpty) return _urlDefinida;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) return 'http://10.0.2.2:3000';
    return 'http://localhost:3000';
  }

  String? _token;
  Usuario? usuario;

  /// Dónde se guarda el pase de acceso entre aperturas de la app.
  AlmacenSesion almacen = AlmacenSesion();

  /// Se llama cuando el servidor rechaza la sesión (venció o la cuenta fue desactivada).
  void Function()? alVencerSesion;

  /// Un solo cliente HTTP: reutiliza las conexiones en lugar de abrir una nueva en cada petición.
  http.Client _http = http.Client();

  /// Permite sustituir el cliente HTTP en las pruebas automáticas.
  @visibleForTesting
  void usarCliente(http.Client cliente) => _http = cliente;

  /// Se incrementa cuando cambian reservas o zonas, para que las pantallas se recarguen.
  final ValueNotifier<int> cambios = ValueNotifier(0);

  bool get sesionIniciada => _token != null;

  Future<dynamic> _pedir(String metodo, String ruta, {Object? cuerpo}) async {
    final req = http.Request(metodo, Uri.parse('$baseUrl$ruta'));
    req.headers['Content-Type'] = 'application/json';
    if (_token != null) req.headers['Authorization'] = 'Bearer $_token';
    if (cuerpo != null) req.body = jsonEncode(cuerpo);
    http.Response res;
    try {
      res = await http.Response.fromStream(await _http.send(req).timeout(const Duration(seconds: 10)));
    } catch (_) {
      throw ApiError('No se pudo conectar con el servidor ($baseUrl). ¿Está encendida la API?');
    }
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode == 401 && _token != null && ruta != '/auth/login') {
      cerrarSesion();
      alVencerSesion?.call();
      throw ApiError('Tu sesión terminó. Inicia sesión de nuevo.');
    }
    if (res.statusCode >= 400) {
      final msg = data is Map && data['error'] != null ? data['error'].toString() : 'Error ${res.statusCode}';
      final det = data is Map && data['detalles'] is List ? '\n${(data['detalles'] as List).join('\n')}' : '';
      throw ApiError('$msg$det');
    }
    return data;
  }

  Future<void> _guardarSesion(Map<String, dynamic> r) async {
    _token = r['token'] as String;
    await refrescarUsuario();
    await almacen.guardar(_token!);
  }

  Future<void> refrescarUsuario() async => usuario = Usuario.fromJson((await _pedir('GET', '/auth/me')) as Map<String, dynamic>);

  /// Al abrir la app: recupera la sesión guardada. Devuelve falso si hay que iniciar sesión.
  Future<bool> restaurarSesion() async {
    final guardado = await almacen.leer();
    if (guardado == null) return false;
    _token = guardado;
    try {
      await refrescarUsuario();
      return true;
    } on ApiError {
      _token = null; // sin conexión se conserva lo guardado; si venció, ya se borró al recibir el 401
      usuario = null;
      return false;
    }
  }

  Future<void> login(String correo, String password) async =>
      _guardarSesion(await _pedir('POST', '/auth/login', cuerpo: {'correo': correo, 'password': password}) as Map<String, dynamic>);

  Future<void> registro({required String nombre, required String correo, required String password, required String codigo, String telefono = '', bool autorizaTelefono = false}) async =>
      _guardarSesion(await _pedir('POST', '/auth/registro', cuerpo: {
        'nombre': nombre,
        'correo': correo,
        'password': password,
        'codigo': codigo,
        if (telefono.isNotEmpty) 'telefono': telefono,
        if (telefono.isNotEmpty) 'autoriza_telefono': autorizaTelefono,
      }) as Map<String, dynamic>);

  Future<void> registrarDispositivo(String token) async =>
      _pedir('POST', '/dispositivos', cuerpo: {'token': token, 'plataforma': 'android'});

  Future<void> bajaDispositivo(String token) async => _pedir('POST', '/dispositivos/baja', cuerpo: {'token': token});

  void cerrarSesion() {
    _token = null;
    usuario = null;
    almacen.borrar();
  }

  Future<List<Zona>> zonas() async =>
      ((await _pedir('GET', '/zonas')) as List).map((e) => Zona.fromJson(e as Map<String, dynamic>)).toList();

  Future<void> crearZona(Map<String, dynamic> datos) async {
    await _pedir('POST', '/zonas', cuerpo: datos);
    cambios.value++;
  }

  Future<void> editarZona(int id, Map<String, dynamic> datos) async {
    await _pedir('PUT', '/zonas/$id', cuerpo: datos);
    cambios.value++;
  }

  Future<void> eliminarZona(int id) async {
    await _pedir('DELETE', '/zonas/$id');
    cambios.value++;
  }

  Future<Disponibilidad> disponibilidad(int zonaId, String fecha) async {
    final r = await _pedir('GET', '/zonas/$zonaId/disponibilidad?fecha=$fecha') as Map<String, dynamic>;
    return Disponibilidad(
      Zona.fromJson(r['zona'] as Map<String, dynamic>),
      (r['ocupados'] as List).map((o) => (inicio: DateTime.parse(o['inicio'] as String), fin: DateTime.parse(o['fin'] as String))).toList(),
    );
  }

  Future<void> reservar(int zonaId, DateTime inicio, DateTime fin) async {
    await _pedir('POST', '/reservas', cuerpo: {
      'zona_id': zonaId,
      'inicio': inicio.toUtc().toIso8601String(),
      'fin': fin.toUtc().toIso8601String(),
    });
    cambios.value++;
  }

  Future<List<Reserva>> misReservas() async =>
      ((await _pedir('GET', '/reservas/mias')) as List).map((e) => Reserva.fromJson(e as Map<String, dynamic>)).toList();

  Future<List<Reserva>> todasLasReservas() async =>
      ((await _pedir('GET', '/reservas')) as List).map((e) => Reserva.fromJson(e as Map<String, dynamic>)).toList();

  /// Solo administrador: elimina una reserva (vigente o cancelada).
  Future<void> eliminarReserva(int id) async {
    await _pedir('DELETE', '/reservas/$id');
    cambios.value++;
  }

  /// Solo administrador: elimina todas las reservas canceladas. Devuelve cuántas eliminó.
  Future<int> eliminarCanceladas() async {
    final r = await _pedir('DELETE', '/reservas/canceladas') as Map<String, dynamic>;
    cambios.value++;
    return r['eliminadas'] as int;
  }

  Future<void> cancelarReserva(int id) async {
    await _pedir('POST', '/reservas/$id/cancelar', cuerpo: {});
    cambios.value++;
  }

  // ---- Aviso de llegada al portón ----

  /// Residente: avisa a la administración que va llegando y necesita que abran el portón.
  Future<void> avisarLlegada(String tipoVehiculo, String placa) async {
    await _pedir('POST', '/porton', cuerpo: {'tipo_vehiculo': tipoVehiculo, if (placa.isNotEmpty) 'placa': placa});
    cambios.value++;
  }

  List<AvisoPorton> _avisos(dynamic r) => (r as List).map((e) => AvisoPorton.fromJson(e as Map<String, dynamic>)).toList();

  Future<List<AvisoPorton>> misAvisos() async => _avisos(await _pedir('GET', '/porton/mios'));

  /// Administrador: avisos de la copropiedad (los pendientes primero).
  Future<List<AvisoPorton>> avisosPorton() async => _avisos(await _pedir('GET', '/porton'));

  Future<void> atenderAviso(int id) async {
    await _pedir('POST', '/porton/$id/atender', cuerpo: {});
    cambios.value++;
  }

  Future<void> cancelarAviso(int id) async {
    await _pedir('POST', '/porton/$id/cancelar', cuerpo: {});
    cambios.value++;
  }

  // ---- Visitantes y registro de ingresos ----

  List<Visita> _visitas(dynamic r) => (r as List).map((e) => Visita.fromJson(e as Map<String, dynamic>)).toList();

  /// Residente: autoriza a un visitante y recibe su código.
  Future<Visita> autorizarVisita({required String nombre, String documento = '', String placa = '', int horas = 12}) async {
    final r = await _pedir('POST', '/visitas', cuerpo: {
      'nombre': nombre,
      if (documento.isNotEmpty) 'documento': documento,
      if (placa.isNotEmpty) 'placa': placa,
      'horas': horas,
    });
    cambios.value++;
    return Visita.fromJson(r as Map<String, dynamic>);
  }

  Future<List<Visita>> misVisitas() async => _visitas(await _pedir('GET', '/visitas/mias'));

  Future<void> cancelarVisita(int id) async {
    await _pedir('POST', '/visitas/$id/cancelar', cuerpo: {});
    cambios.value++;
  }

  /// Personal: visitas autorizadas vigentes y visitantes que están dentro.
  Future<List<Visita>> visitasPorteria() async => _visitas(await _pedir('GET', '/visitas'));

  Future<List<Visita>> registroIngresos({int dias = 7}) async => _visitas(await _pedir('GET', '/visitas/registro?dias=$dias'));

  Future<Visita> visitaPorCodigo(String codigo) async =>
      Visita.fromJson(await _pedir('GET', '/visitas/codigo/${Uri.encodeComponent(codigo.trim())}') as Map<String, dynamic>);

  Future<void> entradaVisita(int id) async {
    await _pedir('POST', '/visitas/$id/entrada', cuerpo: {});
    cambios.value++;
  }

  Future<void> salidaVisita(int id) async {
    await _pedir('POST', '/visitas/$id/salida', cuerpo: {});
    cambios.value++;
  }

  Future<List<UnidadItem>> unidadesParaVisita() async =>
      ((await _pedir('GET', '/visitas/unidades')) as List).map((e) => (id: e['id'] as int, nombre: e['identificador'] as String)).toList();

  Future<List<ResidenteItem>> residentesParaVisita() async =>
      ((await _pedir('GET', '/visitas/residentes')) as List).map((e) => (id: e['id'] as int, nombre: e['nombre'] as String, unidad: e['unidad'] as String)).toList();

  /// Vigilante: pide al residente visitado que autorice a quien llegó sin aviso. No entra hasta que responda.
  Future<void> solicitarVisita({required int residenteId, required String nombre, String documento = '', String placa = ''}) async {
    await _pedir('POST', '/visitas/porteria', cuerpo: {
      'residente_id': residenteId,
      'nombre': nombre,
      if (documento.isNotEmpty) 'documento': documento,
      if (placa.isNotEmpty) 'placa': placa,
    });
    cambios.value++;
  }

  /// Residente visitado: autoriza o rechaza a quien espera en portería.
  Future<void> responderVisita(int id, {required bool autorizar}) async {
    await _pedir('POST', '/visitas/$id/responder', cuerpo: {'decision': autorizar ? 'autorizar' : 'rechazar'});
    cambios.value++;
  }

  // ---- Chat ----

  List<Mensaje> _mensajes(dynamic r) => (r as List).map((e) => Mensaje.fromJson(e as Map<String, dynamic>)).toList();

  /// [residente] es 'mi' para el residente, o el id del residente para el personal.
  Future<List<Mensaje>> mensajesPorteria(String residente, {int desde = 0}) async =>
      _mensajes(await _pedir('GET', '/chat/porteria/$residente?desde=$desde'));

  Future<Mensaje> enviarPorteria(String residente, String texto) async =>
      Mensaje.fromJson(await _pedir('POST', '/chat/porteria/$residente', cuerpo: {'cuerpo': texto}) as Map<String, dynamic>);

  Future<List<Hilo>> hilosPorteria() async =>
      ((await _pedir('GET', '/chat/porteria/hilos')) as List).map((e) => Hilo.fromJson(e as Map<String, dynamic>)).toList();

  // ---- Comunicados y PQRS ----

  Future<List<Comunicado>> comunicados() async =>
      ((await _pedir('GET', '/comunicados')) as List).map((e) => Comunicado.fromJson(e as Map<String, dynamic>)).toList();

  Future<void> publicarComunicado(String titulo, String cuerpo, bool importante) async {
    await _pedir('POST', '/comunicados', cuerpo: {'titulo': titulo, 'cuerpo': cuerpo, 'importante': importante});
    cambios.value++;
  }

  Future<void> eliminarComunicado(int id) async {
    await _pedir('DELETE', '/comunicados/$id');
    cambios.value++;
  }

  List<Pqrs> _pqrs(dynamic r) => (r as List).map((e) => Pqrs.fromJson(e as Map<String, dynamic>)).toList();

  Future<void> crearPqrs(String tipo, String asunto, String descripcion) async {
    await _pedir('POST', '/pqrs', cuerpo: {'tipo': tipo, 'asunto': asunto, 'descripcion': descripcion});
    cambios.value++;
  }

  Future<List<Pqrs>> misPqrs() async => _pqrs(await _pedir('GET', '/pqrs/mias'));

  /// Administrador: todas las solicitudes del conjunto.
  Future<List<Pqrs>> todasPqrs() async => _pqrs(await _pedir('GET', '/pqrs'));

  Future<void> responderPqrs(int id, String estado, String respuesta) async {
    await _pedir('PUT', '/pqrs/$id', cuerpo: {'estado': estado, if (respuesta.isNotEmpty) 'respuesta': respuesta});
    cambios.value++;
  }

  // ---- Administración: usuarios, unidades y reportes ----

  Future<List<UsuarioFila>> usuarios() async =>
      ((await _pedir('GET', '/usuarios')) as List).map((e) => UsuarioFila.fromJson(e as Map<String, dynamic>)).toList();

  /// Administración: agrega un residente en una unidad con una contraseña temporal.
  Future<void> crearResidente({required String nombre, required String correo, required String password, required int unidadId}) async {
    await _pedir('POST', '/usuarios/residentes', cuerpo: {'nombre': nombre, 'correo': correo, 'password': password, 'unidad_id': unidadId});
    cambios.value++;
  }

  Future<void> crearVigilante(String nombre, String correo, String password) async {
    await _pedir('POST', '/usuarios/vigilantes', cuerpo: {'nombre': nombre, 'correo': correo, 'password': password});
    cambios.value++;
  }

  Future<void> cambiarEstadoUsuario(int id, String estado) async {
    await _pedir('PUT', '/usuarios/$id/estado', cuerpo: {'estado': estado});
    cambios.value++;
  }

  Future<List<UnidadItem>> unidades() async =>
      ((await _pedir('GET', '/unidades')) as List).map((e) => (id: e['id'] as int, nombre: e['identificador'] as String)).toList();

  Future<void> crearUnidad(String identificador) async {
    await _pedir('POST', '/unidades', cuerpo: {'identificador': identificador});
    cambios.value++;
  }

  /// Genera un código de invitación (válido 7 días) para que un residente se registre en la unidad.
  Future<String> invitacion(int unidadId) async =>
      (await _pedir('POST', '/unidades/$unidadId/invitacion', cuerpo: {}) as Map<String, dynamic>)['codigo'] as String;

  Future<Map<String, dynamic>> resumenReportes({int dias = 30}) async =>
      (await _pedir('GET', '/reportes/resumen?dias=$dias')) as Map<String, dynamic>;

  // ---- Paquetes y domicilios ----

  List<Paquete> _paquetes(dynamic r) => (r as List).map((e) => Paquete.fromJson(e as Map<String, dynamic>)).toList();

  /// Vigilante: registra lo que llegó para una unidad (avisa a sus residentes).
  Future<void> registrarPaquete({required int unidadId, required String tipo, String descripcion = ''}) async {
    await _pedir('POST', '/paquetes', cuerpo: {'unidad_id': unidadId, 'tipo': tipo, if (descripcion.isNotEmpty) 'descripcion': descripcion});
    cambios.value++;
  }

  Future<List<Paquete>> misPaquetes() async => _paquetes(await _pedir('GET', '/paquetes/mios'));

  Future<List<Paquete>> paquetesPorteria() async => _paquetes(await _pedir('GET', '/paquetes'));

  Future<void> entregarPaquete(int id, {String entregadoA = ''}) async {
    await _pedir('POST', '/paquetes/$id/entregar', cuerpo: {if (entregadoA.isNotEmpty) 'entregado_a': entregadoA});
    cambios.value++;
  }

  // ---- Incidencias ----

  List<Incidencia> _incidencias(dynamic r) => (r as List).map((e) => Incidencia.fromJson(e as Map<String, dynamic>)).toList();

  Future<void> reportarIncidencia({int? zonaId, required String descripcion, required String gravedad}) async {
    await _pedir('POST', '/incidencias', cuerpo: {'zona_id': ?zonaId, 'descripcion': descripcion, 'gravedad': gravedad});
    cambios.value++;
  }

  Future<List<Incidencia>> misIncidencias() async => _incidencias(await _pedir('GET', '/incidencias/mias'));

  /// Administración y vigilante: todas las del conjunto.
  Future<List<Incidencia>> todasIncidencias() async => _incidencias(await _pedir('GET', '/incidencias'));

  Future<void> gestionarIncidencia(int id, String estado, String respuesta) async {
    await _pedir('PUT', '/incidencias/$id', cuerpo: {'estado': estado, if (respuesta.isNotEmpty) 'respuesta': respuesta});
    cambios.value++;
  }

  // ---- Minuta del vigilante ----

  Future<List<Anotacion>> minuta({int dias = 3}) async =>
      ((await _pedir('GET', '/minuta?dias=$dias')) as List).map((e) => Anotacion.fromJson(e as Map<String, dynamic>)).toList();

  Future<void> anotarMinuta(String tipo, String descripcion) async {
    await _pedir('POST', '/minuta', cuerpo: {'tipo': tipo, 'descripcion': descripcion});
    cambios.value++;
  }

  /// Cambia la contraseña propia (obligatorio si era temporal).
  Future<void> cambiarClave(String actual, String nueva) async {
    // El servidor cierra las demás sesiones y entrega un pase nuevo para seguir en este teléfono.
    final r = await _pedir('PUT', '/auth/me/password', cuerpo: {'actual': actual, 'nueva': nueva}) as Map<String, dynamic>;
    await _guardarSesion(r);
  }

  /// Administración: restablece la contraseña de un usuario que la olvidó. La temporal solo se recibe esta vez.
  Future<String> restablecerClave(int usuarioId) async {
    final r = await _pedir('POST', '/usuarios/$usuarioId/restablecer-clave', cuerpo: {}) as Map<String, dynamic>;
    cambios.value++;
    return r['password'] as String;
  }

  // ---- Llamadas ----

  /// Número único de portería (nulo si la administración aún no lo registra).
  Future<String?> telefonoPorteria() async => ((await _pedir('GET', '/contacto/porteria')) as Map<String, dynamic>)['telefono'] as String?;

  /// Administración: define el número de portería; con texto vacío lo quita.
  Future<void> guardarTelefonoPorteria(String telefono) async {
    await _pedir('PUT', '/contacto/porteria', cuerpo: {'telefono': telefono});
    cambios.value++;
  }

  /// Vigilante: residentes con el teléfono que autorizaron compartir.
  Future<List<Contacto>> directorio() async => ((await _pedir('GET', '/contacto/residentes')) as List)
      .map((e) => (id: e['id'] as int, nombre: e['nombre'] as String, unidad: e['unidad'] as String?, telefono: e['telefono'] as String?))
      .toList();

  /// Residente: guarda su teléfono (requiere autorizar su uso) o lo borra con texto vacío.
  Future<void> guardarMiTelefono(String telefono, {required bool autoriza}) async {
    await _pedir('PUT', '/auth/me/telefono', cuerpo: {'telefono': telefono, 'autoriza': autoriza});
    await refrescarUsuario();
  }

  // ---- Inicio y notificaciones ----

  /// Lo que cada perfil necesita atender ahora.
  Future<Map<String, dynamic>> inicio() async => (await _pedir('GET', '/inicio')) as Map<String, dynamic>;

  Future<ResumenAvisos> resumenAvisos({int? desde}) async =>
      ResumenAvisos.fromJson(await _pedir('GET', '/notificaciones/resumen${desde == null ? '' : '?desde=$desde'}') as Map<String, dynamic>);

  Future<List<Notificacion>> notificaciones() async =>
      ((await _pedir('GET', '/notificaciones')) as List).map((e) => Notificacion.fromJson(e as Map<String, dynamic>)).toList();

  Future<void> marcarLeidas({List<int>? ids, bool todas = false}) async =>
      _pedir('POST', '/notificaciones/leer', cuerpo: {'ids': ?ids, if (todas) 'todas': true});

  Future<void> vaciarLeidas() async => _pedir('DELETE', '/notificaciones/leidas');

  /// Residente: avisa que ya va a recoger su paquete o domicilio.
  Future<void> voyPorPaquete(int id) async {
    await _pedir('POST', '/paquetes/$id/voy', cuerpo: {});
    cambios.value++;
  }
}
