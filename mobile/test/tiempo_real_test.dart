import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_application_1/api.dart';
import 'package:flutter_application_1/llamar.dart';
import 'package:flutter_application_1/navegacion.dart';
import 'package:flutter_application_1/pantallas/aviso_emergente.dart';
import 'package:flutter_application_1/pantallas/cambiar_clave.dart';
import 'package:flutter_application_1/pantallas/directorio.dart';
import 'package:flutter_application_1/pantallas/inicio.dart';
import 'package:flutter_application_1/pantallas/login.dart';
import 'package:flutter_application_1/pantallas/notificaciones.dart';
import 'package:flutter_application_1/pantallas/paquetes.dart';
import 'package:flutter_application_1/pantallas/perfil.dart';
import 'package:flutter_application_1/pantallas/porton.dart';
import 'package:flutter_application_1/pantallas/visitas.dart';
import 'package:flutter_application_1/pantallas/zona_form.dart';
import 'package:flutter_application_1/pantallas/zonas.dart';
import 'package:flutter_application_1/sesion.dart';
import 'package:flutter_application_1/tema.dart';
import 'package:flutter_application_1/tiempo_real.dart';

/// Pruebas de la pantalla principal de cada perfil, los avisos en tiempo real y las llamadas.
/// Corren con el tema de la app y el tamaño de un teléfono, para detectar errores de diseño.

String _ahora([int horas = 0]) => DateTime.now().add(Duration(hours: horas)).toUtc().toIso8601String();

Map<String, dynamic> _visita(int id, String estado, {String nombre = 'Ana Visitante'}) => {
      'id': id, 'nombre': nombre, 'documento': '123', 'placa': 'ABC123', 'codigo': 'ABC234', 'valida_hasta': _ahora(1),
      'estado': estado, 'origen': 'porteria', 'entrada_en': estado == 'dentro' ? _ahora(-1) : null, 'salida_en': null,
      'unidad': 'Torre 1 - Apto 101', 'residente': 'Residente Demo', 'recibido_por': null, 'residente_id': 5, 'residente_telefono': '3000000000',
    };

Map<String, dynamic> _paquete(int id, {bool enCamino = false}) => {
      'id': id, 'tipo': 'domicilio', 'descripcion': 'Pizza familiar grande de la esquina', 'estado': 'por_recoger', 'recibido_en': _ahora(),
      'entregado_en': null, 'entregado_a': null, 'unidad': 'Torre 1 - Apto 101', 'recibido_por': 'Celador Demo', 'en_camino_en': enCamino ? _ahora() : null,
    };

const _aviso = {'id': 9, 'tipo_vehiculo': 'carro', 'placa': 'ABC123', 'estado': 'pendiente', 'creado_en': '2026-11-26T15:00:00.000Z', 'atendido_en': null, 'usuario': 'Residente Demo', 'unidad': 'Torre 1 - Apto 101', 'atendido_por': null};

/// En las pruebas no existe el almacenamiento seguro del teléfono: se guarda en memoria.
class _AlmacenEnMemoria extends AlmacenSesion {
  String? valor;
  @override
  Future<String?> leer() async => valor;
  @override
  Future<void> guardar(String token) async => valor = token;
  @override
  Future<void> borrar() async => valor = null;
}

class _Servidor {
  final Map<String, Object?> respuestas;
  final List<String> llamadas = [];
  final List<String> cuerpos = [];

  /// Avisos que el servidor entregará en la siguiente consulta del resumen.
  List<Map<String, dynamic>> pendientes = [];
  _Servidor(this.respuestas);

  http.Client get cliente => MockClient((req) async {
        final clave = '${req.method} ${req.url.path}';
        llamadas.add(clave);
        if (req.body.isNotEmpty) cuerpos.add(req.body);
        Object? cuerpo = respuestas[clave] ?? (req.method == 'GET' ? <dynamic>[] : <String, dynamic>{});
        if (clave == 'GET /notificaciones/resumen') {
          final primera = !req.url.queryParameters.containsKey('desde');
          final nuevas = primera ? <Map<String, dynamic>>[] : pendientes;
          if (!primera) pendientes = [];
          cuerpo = {'sin_leer': nuevas.length, 'chat_sin_leer': 0, 'ultimo_id': nuevas.isEmpty ? 0 : nuevas.last['id'], 'nuevas': nuevas};
        }
        return http.Response(jsonEncode(cuerpo), 200, headers: {'content-type': 'application/json; charset=utf-8'});
      });
}

Usuario _usuario(String rol) => Usuario(id: 7, nombre: 'Persona Demo', correo: 'demo@demo.test', rol: rol, copropiedad: 'Cantaluna', unidad: rol == 'residente' ? 'Torre 1 - Apto 101' : null);

final _inicios = <String, Map<String, Object?>>{
  'residente': {
    'rol': 'residente', 'telefono_porteria': '6050000000', 'solicitudes': [_visita(1, 'solicitada', nombre: 'Repartidor')], 'visitas_autorizadas': 2,
    'paquetes': [_paquete(3)], 'aviso_porton': null, 'proxima_reserva': {'zona': 'Piscina', 'inicio': '2026-11-27T15:00:00.000Z'},
    'comunicado': {'titulo': 'Corte de agua programado para mañana', 'cuerpo': 'De 8 a 12 por mantenimiento del tanque principal.', 'importante': true},
    'pqrs_abiertas': 0, 'incidencias_abiertas': 1,
  },
  'vigilante': {
    'rol': 'vigilante', 'telefono_porteria': '6050000000', 'avisos': [_aviso], 'solicitudes': [_visita(1, 'solicitada')], 'por_ingresar': [_visita(2, 'autorizada')],
    'dentro': 3, 'dentro_mas_de_un_dia': 1, 'paquetes_por_recoger': 4, 'en_camino': [_paquete(3, enCamino: true)], 'chats_sin_leer': 2,
    'reservas_hoy': [{'zona': 'Salón Social', 'unidad': 'Torre 2 - Apto 201', 'usuario': 'Vecina', 'inicio': '2026-11-26T20:00:00.000Z'}],
  },
  'administrador': {'rol': 'administrador', 'pqrs_sin_cerrar': 2, 'incidencias_abiertas': 3, 'incidencias_graves': 1, 'alertas_24h': 1},
};

const _reporte = {
  'dias': 30, 'reservas_por_zona': [], 'ingresos_por_dia': [], 'porton': {'atendidos': 1, 'vencidos': 0, 'cancelados': 0, 'minutos_promedio': 2.5},
  'pqrs_por_estado': [], 'usuarios_activos': [], 'paquetes': {'recibidos': 1, 'entregados': 1, 'por_recoger': 0}, 'incidencias_por_estado': [], 'visitantes_dentro': 0,
};

void _telefono(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 2340); // 360 x 780 puntos
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

/// La app como se arma en main.dart: navegador global y avisos emergentes por encima de todo.
Widget _app(Widget inicio) => MaterialApp(
      theme: temaClaro,
      navigatorKey: navegador,
      builder: (_, hijo) => Stack(children: [hijo!, const AvisosEmergentes()]),
      home: inicio,
    );

Future<_Servidor> _abrir(WidgetTester tester, Widget pantalla, String rol, [Map<String, Object?> respuestas = const {}, bool conScaffold = true]) async {
  _telefono(tester);
  final s = _Servidor({'GET /inicio': _inicios[rol], 'GET /reportes/resumen': _reporte, 'GET /contacto/porteria': {'telefono': '6050000000'}, ...respuestas});
  Api.i.usarCliente(s.cliente);
  Api.i.usuario = _usuario(rol);
  destino.value = null;
  await tester.pumpWidget(_app(conScaffold ? Scaffold(body: pantalla) : pantalla));
  await tester.pumpAndSettle();
  return s;
}

Future<void> _cerrar(WidgetTester tester) async {
  CentroAvisos.i.detener();
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 2));
  expect(tester.takeException(), isNull, reason: 'no debe haber excepciones de Flutter');
}

/// El pase de acceso es privado en Api: se inicia sesión contra el servidor falso.
Future<void> _entrar(_Servidor s, String rol) async {
  s.respuestas['POST /auth/login'] = {'token': 'pase-de-prueba'};
  s.respuestas['GET /auth/me'] = {'id': 7, 'nombre': 'Persona Demo', 'correo': 'demo@demo.test', 'rol': rol, 'copropiedad': 'Cantaluna', 'unidad': rol == 'residente' ? 'Torre 1 - Apto 101' : null, 'telefono': null};
  await Api.i.login('demo@demo.test', 'Demo12345!');
}

Future<_Servidor> _abrirApp(WidgetTester tester, String rol) async {
  _telefono(tester);
  final s = _Servidor({'GET /inicio': _inicios[rol], 'GET /reportes/resumen': _reporte, 'GET /contacto/porteria': {'telefono': '6050000000'}, 'GET /visitas/mias': [_visita(1, 'solicitada')]});
  Api.i.usarCliente(s.cliente);
  await _entrar(s, rol);
  destino.value = null;
  await tester.pumpWidget(_app(InicioPage(onSalir: () {})));
  await tester.pumpAndSettle();
  return s;
}

void main() {
  final marcados = <Uri>[];
  setUp(() {
    Api.i.almacen = _AlmacenEnMemoria();
    marcados.clear();
    abridorDeEnlaces = (uri) async {
      marcados.add(uri);
      return true;
    };
  });
  tearDown(() => Api.i.cerrarSesion());

  testWidgets('inicio del residente: pendientes, acciones y navegación a la pestaña pedida', (tester) async {
    final s = await _abrirApp(tester, 'residente');
    expect(find.textContaining('Persona'), findsWidgets);
    expect(find.textContaining('Repartidor está en portería'), findsOneWidget);
    expect(find.text('Ya voy'), findsOneWidget);
    for (final etiqueta in ['Inicio', 'Reservas', 'Acceso', 'Chat', 'Conjunto']) {
      expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(etiqueta)), findsOneWidget);
    }
    await tester.tap(find.text('Ya voy'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /paquetes/3/voy'));

    await tester.scrollUntilVisible(find.text('Autorizar visita'), 200, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Autorizar visita'));
    await tester.pumpAndSettle();
    expect(find.text('Autorizar visitante'), findsOneWidget, reason: 'debe abrir Acceso / Visitas');
    await _cerrar(tester);
  });

  testWidgets('inicio del residente: llamar a portería abre el marcador con el número del conjunto', (tester) async {
    await _abrirApp(tester, 'residente');
    await tester.tap(find.byTooltip('Llamar a portería').first);
    await tester.pumpAndSettle();
    expect(marcados, [Uri(scheme: 'tel', path: '6050000000')]);
    await _cerrar(tester);
  });

  testWidgets('sin número de portería se explica en lugar de abrir el marcador', (tester) async {
    final s = await _abrirApp(tester, 'residente');
    s.respuestas['GET /contacto/porteria'] = {'telefono': null};
    await tester.tap(find.byTooltip('Llamar a portería').first);
    await tester.pumpAndSettle();
    expect(marcados, isEmpty);
    expect(find.textContaining('aún no ha registrado'), findsOneWidget);
    await _cerrar(tester);
  });

  testWidgets('inicio del vigilante: lo urgente, llamada al residente y portón', (tester) async {
    final s = await _abrirApp(tester, 'vigilante');
    expect(find.textContaining('Abrir portón: Torre 1'), findsOneWidget);
    expect(find.text('visitantes dentro'), findsOneWidget);
    await tester.tap(find.text('Ya abrí el portón'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /porton/9/atender'));
    await tester.scrollUntilVisible(find.text('Llamar al residente'), 200, scrollable: find.byType(Scrollable).first);
    await tester.ensureVisible(find.text('Llamar al residente'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Llamar al residente'));
    await tester.pumpAndSettle();
    expect(marcados, [Uri(scheme: 'tel', path: '3000000000')]);
    await tester.scrollUntilVisible(find.text('Reservas de hoy'), 300, scrollable: find.byType(Scrollable).first);
    await _cerrar(tester);
  });

  testWidgets('resumen de la administración: muestra lo que hay por atender', (tester) async {
    await _abrirApp(tester, 'administrador');
    expect(find.text('Por atender'), findsOneWidget);
    expect(find.text('Incidencias abiertas (1 grave)'), findsOneWidget);
    for (final etiqueta in ['Resumen', 'Conjunto', 'Usuarios', 'Zonas']) {
      expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(etiqueta)), findsOneWidget);
    }
    for (final operacion in ['Chat', 'Operación', 'Portería']) {
      expect(find.descendant(of: find.byType(NavigationBar), matching: find.text(operacion)), findsNothing, reason: 'la operación es del vigilante');
    }
    await _cerrar(tester);
  });

  testWidgets('zonas: al tocar una, la administración la edita en lugar de reservar', (tester) async {
    await _abrir(tester, const ZonasPage(), 'administrador', {
      'GET /zonas': [
        {'id': 1, 'nombre': 'Piscina', 'descripcion': null, 'aforo': 30, 'hora_apertura': '08:00', 'hora_cierre': '20:00', 'estado': 'activa', 'regla': {'duracion_maxima_min': 120, 'anticipacion_minima_min': 60, 'max_activas_por_unidad': 2, 'dias_habilitados': [0, 1, 2, 3, 4, 5, 6]}}
      ],
    });
    await tester.tap(find.text('Piscina'));
    await tester.pumpAndSettle();
    expect(find.byType(ZonaFormPage), findsOneWidget);
    await _cerrar(tester);
  });

  testWidgets('contraseña temporal: hay que crear una propia antes de entrar', (tester) async {
    _telefono(tester);
    final s = _Servidor({});
    Api.i.usarCliente(s.cliente);
    await _entrar(s, 'residente');
    var listo = false;
    s.respuestas['PUT /auth/me/password'] = {'token': 'pase-nuevo'};
    await tester.pumpWidget(_app(CambiarClavePage(obligatorio: true, onListo: () => listo = true, onSalir: () {})));
    expect(find.text('Crea tu contraseña'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).at(0), 'Temporal123!');
    await tester.enterText(find.byType(TextFormField).at(1), 'MiClaveNueva1');
    await tester.enterText(find.byType(TextFormField).at(2), 'otra-distinta');
    await tester.ensureVisible(find.text('Guardar contraseña'));
    await tester.tap(find.text('Guardar contraseña'));
    await tester.pumpAndSettle();
    expect(find.text('No coincide'), findsOneWidget);
    expect(s.llamadas, isNot(contains('PUT /auth/me/password')));
    await tester.enterText(find.byType(TextFormField).at(2), 'MiClaveNueva1');
    await tester.ensureVisible(find.text('Guardar contraseña'));
    await tester.tap(find.text('Guardar contraseña'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('PUT /auth/me/password'));
    expect(listo, isTrue);
    await _cerrar(tester);
  });

  testWidgets('aviso en tiempo real: llega una visita y se autoriza desde el propio aviso', (tester) async {
    final s = await _abrirApp(tester, 'residente');
    s.pendientes = [
      {'id': 50, 'tipo': 'visita_solicitud', 'titulo': 'Tienes una visita en portería', 'mensaje': 'Carlos está en portería y quiere visitarte.', 'referencia_id': 1, 'leida': false, 'creado_en': _ahora()}
    ];
    await tester.pump(CentroAvisos.intervalo + const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(find.text('Tienes una visita en portería'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Autorizar').last);
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /visitas/1/responder'));
    expect(s.cuerpos, contains(jsonEncode({'decision': 'autorizar'})));
    expect(find.text('Tienes una visita en portería'), findsNothing, reason: 'el aviso resuelto se quita');
    await _cerrar(tester);
  });

  testWidgets('aviso en tiempo real: el vigilante abre el portón desde el aviso', (tester) async {
    final s = await _abrirApp(tester, 'vigilante');
    s.pendientes = [
      {'id': 51, 'tipo': 'aviso_porton', 'titulo': 'Abrir portón', 'mensaje': 'Residente Demo va llegando en carro', 'referencia_id': 9, 'leida': false, 'creado_en': _ahora()}
    ];
    await tester.pump(CentroAvisos.intervalo + const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(find.text('Abrir portón'), findsOneWidget);
    await tester.tap(find.descendant(of: find.byType(AvisosEmergentes), matching: find.text('Ya abrí el portón')));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /porton/9/atender'));
    await _cerrar(tester);
  });

  testWidgets('al cerrar sesión, un aviso en cola no le aparece a quien entre después', (tester) async {
    final s = await _abrirApp(tester, 'residente');
    s.pendientes = [
      {'id': 60, 'tipo': 'paquete', 'titulo': 'Aviso privado del primer usuario', 'mensaje': 'Solo para quien tenía la sesión.', 'referencia_id': 3, 'leida': false, 'creado_en': _ahora()}
    ];
    await tester.pump(CentroAvisos.intervalo + const Duration(milliseconds: 200));
    await tester.pumpAndSettle();
    expect(find.text('Aviso privado del primer usuario'), findsOneWidget);
    // Como en main.dart: primero se detiene el centro de avisos y luego se borra la sesión.
    CentroAvisos.i.detener();
    Api.i.cerrarSesion();
    await tester.pumpAndSettle();
    await _entrar(s, 'vigilante');
    await tester.pumpWidget(_app(InicioPage(key: UniqueKey(), onSalir: () {})));
    await tester.pumpAndSettle();
    expect(find.text('Aviso privado del primer usuario'), findsNothing);
    await _cerrar(tester);
  });

  testWidgets('sesión vencida: el servidor responde 401 y la app avisa para volver a entrar', (tester) async {
    var avisada = false;
    Api.i.alVencerSesion = () => avisada = true;
    final s = _Servidor({});
    Api.i.usarCliente(s.cliente);
    await _entrar(s, 'residente');
    Api.i.usarCliente(MockClient((_) async => http.Response('{"error":"Token inválido o vencido"}', 401)));
    await expectLater(Api.i.zonas(), throwsA(isA<ApiError>()));
    expect(avisada, isTrue);
    expect(Api.i.sesionIniciada, isFalse);
    Api.i.alVencerSesion = null;
  });

  test('la sesión guardada se recupera al abrir la app y una vencida se descarta', () async {
    final almacen = _AlmacenEnMemoria()..valor = 'pase-guardado';
    Api.i.almacen = almacen;
    Api.i.usarCliente(MockClient((_) async => http.Response(
        jsonEncode({'id': 7, 'nombre': 'Persona Demo', 'correo': 'demo@demo.test', 'rol': 'residente', 'copropiedad': 'Cantaluna', 'unidad': 'Torre 1 - Apto 101', 'telefono': null}), 200,
        headers: {'content-type': 'application/json; charset=utf-8'})));
    expect(await Api.i.restaurarSesion(), isTrue);
    expect(Api.i.usuario?.rol, 'residente');
    Api.i.cerrarSesion();
    expect(almacen.valor, isNull, reason: 'al cerrar sesión se borra del teléfono');

    almacen.valor = 'pase-vencido';
    Api.i.usarCliente(MockClient((_) async => http.Response('{"error":"Token inválido o vencido"}', 401)));
    expect(await Api.i.restaurarSesion(), isFalse);
    expect(almacen.valor, isNull);
  });

  testWidgets('registro: no se guarda el teléfono sin autorizar su uso', (tester) async {
    _telefono(tester);
    final s = _Servidor({});
    Api.i.usarCliente(s.cliente);
    await tester.pumpWidget(_app(LoginPage(onEntrar: () {})));
    await tester.tap(find.text('Registrarme con código de invitación'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Celular (opcional)'), '3001234567');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Crear cuenta'));
    await tester.tap(find.text('Crear cuenta'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Marca la autorización'), findsOneWidget);
    expect(s.llamadas, isEmpty);
    await _cerrar(tester);
  });

  testWidgets('"¿Olvidaste tu contraseña?" explica qué hacer', (tester) async {
    _telefono(tester);
    await tester.pumpWidget(_app(LoginPage(onEntrar: () {})));
    await tester.tap(find.text('¿Olvidaste tu contraseña?'));
    await tester.pumpAndSettle();
    expect(find.text('Recuperar contraseña'), findsOneWidget);
    await tester.tap(find.text('Entendido'));
    await tester.pumpAndSettle();
    await _cerrar(tester);
  });

  testWidgets('perfil del residente: teléfono, portería y apariencia caben en el teléfono', (tester) async {
    await _abrir(tester, PerfilPage(onSalir: () async {}), 'residente', {}, false);
    expect(find.text('Mi teléfono'), findsOneWidget);
    expect(find.text('6050000000'), findsOneWidget);
    await tester.tap(find.text('Agregar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '3001112233');
    await tester.tap(find.widgetWithText(FilledButton, 'Guardar'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Marca la autorización'), findsOneWidget, reason: 'sin autorizar no se guarda');
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    await _cerrar(tester);
  });

  testWidgets('perfil de la administración: cambia el número de portería', (tester) async {
    final s = await _abrir(tester, PerfilPage(onSalir: () async {}), 'administrador', {}, false);
    await tester.tap(find.descendant(of: find.widgetWithText(ListTile, 'Portería'), matching: find.text('Cambiar')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), '6059998877');
    await tester.tap(find.widgetWithText(FilledButton, 'Guardar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('PUT /contacto/porteria'));
    await _cerrar(tester);
  });

  testWidgets('directorio de portería: busca y llama a un residente', (tester) async {
    await _abrir(tester, const DirectorioPage(), 'vigilante', {
      'GET /contacto/residentes': [
        {'id': 5, 'nombre': 'Residente Demo', 'unidad': 'Torre 1 - Apto 101', 'telefono': '3000000000'},
        {'id': 6, 'nombre': 'Vecina Sin Teléfono', 'unidad': 'Torre 2 - Apto 201', 'telefono': null},
      ],
    });
    await tester.enterText(find.byType(TextField), 'torre 1');
    await tester.pumpAndSettle();
    expect(find.text('Vecina Sin Teléfono'), findsNothing);
    await tester.tap(find.byTooltip('Llamar'));
    await tester.pumpAndSettle();
    expect(marcados, [Uri(scheme: 'tel', path: '3000000000')]);
    await _cerrar(tester);
  });

  testWidgets('vigilante: la pantalla de visitas se ve completa y permite llamar al que no responde', (tester) async {
    await _abrir(tester, const VisitasPorteriaPage(), 'vigilante', {
      'GET /visitas': [_visita(1, 'solicitada'), _visita(2, 'sin_respuesta'), _visita(3, 'dentro'), _visita(4, 'autorizada')],
    });
    expect(find.text('Validar'), findsOneWidget);
    await tester.tap(find.byTooltip('Llamar al residente').first);
    await tester.pumpAndSettle();
    expect(marcados, [Uri(scheme: 'tel', path: '3000000000')]);
    await _cerrar(tester);
  });

  testWidgets('paquetes del residente: avisa que ya va por su domicilio', (tester) async {
    final s = await _abrir(tester, const PaquetesPage(esPersonal: false), 'residente', {
      'GET /paquetes/mios': [_paquete(3)],
    });
    await tester.tap(find.text('Ya voy'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /paquetes/3/voy'));
    await _cerrar(tester);
  });

  testWidgets('portón: las pantallas del residente y del vigilante se ven completas', (tester) async {
    await _abrir(tester, const PortonPage(esPersonal: false), 'residente', {'GET /porton/mios': [_aviso]});
    expect(find.textContaining('Llamar a portería'), findsOneWidget);
    await _cerrar(tester);
    await _abrir(tester, const PortonPage(esPersonal: true, puedeAtender: true), 'vigilante', {'GET /porton': [_aviso]});
    expect(find.text('Ya abrí el portón'), findsOneWidget);
    await _cerrar(tester);
  });

  testWidgets('bandeja de notificaciones: lista, marca y navega', (tester) async {
    final s = await _abrir(tester, const NotificacionesPage(), 'residente', {
      'GET /notificaciones': [
        {'id': 1, 'tipo': 'paquete', 'titulo': 'Tu domicilio llegó', 'mensaje': 'Llegó un domicilio (Pizza).', 'referencia_id': 3, 'leida': false, 'creado_en': _ahora()}
      ],
    }, false);
    await tester.tap(find.byTooltip('Marcar todas como leídas'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /notificaciones/leer'));
    await tester.tap(find.text('Tu domicilio llegó'));
    await tester.pumpAndSettle();
    expect(destino.value.toString(), 'Acceso/Paquetes');
    await _cerrar(tester);
  });

  test('cada tipo de aviso lleva a la pantalla que corresponde al perfil', () {
    expect(destinoDeAviso('aviso_porton', _usuario('vigilante')).toString(), 'Portería/Portón');
    expect(destinoDeAviso('visita_solicitud', _usuario('residente')).toString(), 'Acceso/Visitas');
    expect(destinoDeAviso('pqrs', _usuario('administrador')).toString(), 'Conjunto/PQRS');
    expect(destinoDeAviso('chat', _usuario('administrador')), isNull, reason: 'la administración no participa en el chat');
  });
}
