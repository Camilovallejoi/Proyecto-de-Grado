import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

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

class Disponibilidad {
  final Zona zona;
  final List<({DateTime inicio, DateTime fin})> ocupados;
  Disponibilidad(this.zona, this.ocupados);
}

class Usuario {
  final String nombre;
  final String correo;
  final String rol;
  final String copropiedad;
  final String? unidad;
  Usuario({required this.nombre, required this.correo, required this.rol, required this.copropiedad, this.unidad});

  bool get esAdmin => rol == 'administrador';

  factory Usuario.fromJson(Map<String, dynamic> j) => Usuario(
        nombre: j['nombre'] as String,
        correo: j['correo'] as String,
        rol: j['rol'] as String,
        copropiedad: j['copropiedad'] as String,
        unidad: j['unidad'] as String?,
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
      res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 10)));
    } catch (_) {
      throw ApiError('No se pudo conectar con el servidor ($baseUrl). ¿Está encendida la API?');
    }
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final msg = data is Map && data['error'] != null ? data['error'].toString() : 'Error ${res.statusCode}';
      final det = data is Map && data['detalles'] is List ? '\n${(data['detalles'] as List).join('\n')}' : '';
      throw ApiError('$msg$det');
    }
    return data;
  }

  Future<void> _guardarSesion(Map<String, dynamic> r) async {
    _token = r['token'] as String;
    usuario = Usuario.fromJson((await _pedir('GET', '/auth/me')) as Map<String, dynamic>);
  }

  Future<void> login(String correo, String password) async =>
      _guardarSesion(await _pedir('POST', '/auth/login', cuerpo: {'correo': correo, 'password': password}) as Map<String, dynamic>);

  Future<void> registro({required String nombre, required String correo, required String password, required String codigo}) async =>
      _guardarSesion(await _pedir('POST', '/auth/registro', cuerpo: {'nombre': nombre, 'correo': correo, 'password': password, 'codigo': codigo}) as Map<String, dynamic>);

  void cerrarSesion() {
    _token = null;
    usuario = null;
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
}
