import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_application_1/api.dart';
import 'package:flutter_application_1/pantallas/administracion.dart';
import 'package:flutter_application_1/pantallas/chat.dart';
import 'package:flutter_application_1/pantallas/conjunto.dart';
import 'package:flutter_application_1/pantallas/incidencias.dart';
import 'package:flutter_application_1/pantallas/minuta.dart';
import 'package:flutter_application_1/pantallas/paquetes.dart';
import 'package:flutter_application_1/pantallas/visitas.dart';
import 'package:flutter_application_1/tema.dart';

/// Pruebas de interfaz: abren cada formulario emergente de la app contra un servidor falso, lo envían
/// y comprueban que no salte ninguna excepción de Flutter (la pantalla roja que se vería en el teléfono).

final _cabeceras = {'content-type': 'application/json; charset=utf-8'};

String _ahora([int horas = 0]) => DateTime.now().add(Duration(hours: horas)).toUtc().toIso8601String();

Map<String, dynamic> _visita({required int id, String estado = 'autorizada', String origen = 'residente', String nombre = 'Ana Visitante'}) => {
      'id': id,
      'nombre': nombre,
      'documento': null,
      'placa': null,
      'codigo': 'ABC234',
      'valida_hasta': _ahora(12),
      'estado': estado,
      'origen': origen,
      'entrada_en': null,
      'salida_en': null,
      'unidad': 'Torre 1 - Apto 101',
      'residente': 'Residente Demo',
      'recibido_por': null,
    };

/// Servidor falso: cada clave es "MÉTODO /ruta". Lo que no se define responde [] (GET) o {} (los demás).
class _Servidor {
  final Map<String, Object> respuestas;
  final List<String> llamadas = [];
  _Servidor(this.respuestas);

  http.Client get cliente => MockClient((req) async {
        final clave = '${req.method} ${req.url.path}';
        llamadas.add(clave);
        final cuerpo = respuestas[clave] ?? (req.method == 'GET' ? <dynamic>[] : <String, dynamic>{});
        return http.Response(jsonEncode(cuerpo), req.method == 'POST' ? 201 : 200, headers: _cabeceras);
      });
}

Usuario _usuario(String rol) => Usuario(id: 7, nombre: 'Persona Demo', correo: 'demo@demo.test', rol: rol, copropiedad: 'Cantaluna', unidad: rol == 'residente' ? 'Torre 1 - Apto 101' : null);

Future<_Servidor> _abrir(WidgetTester tester, Widget pantalla, String rol, [Map<String, Object> respuestas = const {}]) async {
  // Tamaño de un teléfono común (360 x 780): detecta textos y botones que no caben.
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final servidor = _Servidor(respuestas);
  Api.i.usarCliente(servidor.cliente);
  Api.i.usuario = _usuario(rol);
  // Con el tema real de la app: así las pruebas detectan también errores de diseño en los botones.
  await tester.pumpWidget(MaterialApp(theme: temaClaro, home: Scaffold(body: pantalla)));
  await tester.pumpAndSettle();
  return servidor;
}

/// Desmonta la pantalla y deja pasar el tiempo para que se liberen los campos de texto y los temporizadores.
Future<void> _cerrar(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 2));
  expect(tester.takeException(), isNull, reason: 'no debe haber excepciones de Flutter');
}

void main() {
  testWidgets('residente: responde una solicitud de visita (autorizar)', (tester) async {
    final s = await _abrir(tester, const VisitasResidentePage(), 'residente', {
      'GET /visitas/mias': [_visita(id: 1, estado: 'solicitada', origen: 'porteria', nombre: 'Repartidor Sin Aviso')],
    });
    expect(find.textContaining('Repartidor Sin Aviso está en portería'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Autorizar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /visitas/1/responder'));
    await _cerrar(tester);
  });

  testWidgets('vigilante: pide autorización para un visitante sin aviso', (tester) async {
    final s = await _abrir(tester, const VisitasPorteriaPage(), 'vigilante', {
      'GET /visitas/residentes': [
        {'id': 5, 'nombre': 'Residente Demo', 'unidad': 'Torre 1 - Apto 101'}
      ],
    });
    await tester.tap(find.text('Sin aviso'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, 'Tía Marta');
    await tester.tap(find.widgetWithText(FilledButton, 'Pedir autorización'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /visitas/porteria'));
    await _cerrar(tester);
  });

  testWidgets('vigilante: registra y entrega un paquete', (tester) async {
    final s = await _abrir(tester, const PaquetesPage(esPersonal: true), 'vigilante', {
      'GET /visitas/unidades': [
        {'id': 1, 'identificador': 'Torre 1 - Apto 101'}
      ],
      'GET /paquetes': [
        {'id': 3, 'tipo': 'domicilio', 'descripcion': 'Rappi', 'estado': 'por_recoger', 'recibido_en': _ahora(), 'entregado_en': null, 'entregado_a': null, 'unidad': 'Torre 1 - Apto 101', 'recibido_por': 'Celador Demo'}
      ],
    });
    await tester.tap(find.text('Registrar llegada'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Registrar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /paquetes'));

    await tester.tap(find.widgetWithText(FilledButton, 'Entregar'));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(AlertDialog), matching: find.widgetWithText(FilledButton, 'Entregar')));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /paquetes/3/entregar'));
    await _cerrar(tester);
  });

  testWidgets('residente: reporta una incidencia', (tester) async {
    final s = await _abrir(tester, const IncidenciasPage(), 'residente');
    await tester.tap(find.text('Reportar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, 'La bomba de la piscina hace ruido');
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /incidencias'));
    await _cerrar(tester);
  });

  testWidgets('administración: cierra una incidencia con una nota', (tester) async {
    final s = await _abrir(tester, const IncidenciasPage(), 'administrador', {
      'GET /incidencias': [
        {'id': 2, 'descripcion': 'Luz quemada en el parqueadero', 'gravedad': 'media', 'estado': 'registrada', 'respuesta': null, 'creado_en': _ahora(), 'atendido_en': null, 'reportado_por': 'Celador Demo', 'zona': null, 'atendido_por': null}
      ],
    });
    await tester.tap(find.text('Incidencia general'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Se cambió la bombilla');
    await tester.tap(find.widgetWithText(FilledButton, 'Resolver'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('PUT /incidencias/2'));
    await _cerrar(tester);
  });

  testWidgets('vigilante: anota en la minuta', (tester) async {
    final s = await _abrir(tester, const MinutaPage(), 'vigilante');
    await tester.tap(find.text('Anotar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, 'Ronda de las 10 p. m. sin novedades');
    await tester.tap(find.widgetWithText(FilledButton, 'Guardar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /minuta'));
    await _cerrar(tester);
  });

  testWidgets('administración: publica un comunicado', (tester) async {
    final s = await _abrir(tester, const ComunicadosPage(puedePublicar: true), 'administrador');
    await tester.tap(find.text('Publicar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'Corte de agua');
    await tester.enterText(find.byType(TextFormField).at(1), 'Mañana de 8 a 12 por mantenimiento');
    await tester.tap(find.widgetWithText(FilledButton, 'Publicar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /comunicados'));
    await _cerrar(tester);
  });

  testWidgets('residente: radica una PQRS', (tester) async {
    final s = await _abrir(tester, const PqrsPage(esAdmin: false), 'residente');
    await tester.tap(find.text('Nueva solicitud'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'Ruido en la zona BBQ');
    await tester.enterText(find.byType(TextFormField).at(1), 'Música alta pasadas las 11 de la noche');
    await tester.tap(find.widgetWithText(FilledButton, 'Enviar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /pqrs'));
    await _cerrar(tester);
  });

  testWidgets('administración: da de alta a un vigilante', (tester) async {
    final s = await _abrir(tester, const UsuariosPage(), 'administrador');
    await tester.tap(find.text('Agregar usuario'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nuevo vigilante'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'Vigilante Nocturno');
    await tester.enterText(find.byType(TextFormField).at(1), 'noche@demo.test');
    await tester.enterText(find.byType(TextFormField).at(2), 'Demo12345!');
    await tester.tap(find.widgetWithText(FilledButton, 'Crear'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /usuarios/vigilantes'));
    await _cerrar(tester);
  });

  testWidgets('administración: agrega un residente y debe elegir su unidad', (tester) async {
    final s = await _abrir(tester, const UsuariosPage(), 'administrador', {
      'GET /unidades': [
        {'id': 1, 'identificador': 'Torre 1 - Apto 101'},
        {'id': 2, 'identificador': 'Manzana B - Casa 4'},
      ],
    });
    await tester.tap(find.text('Agregar usuario'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Nuevo residente'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'Residente Nuevo');
    await tester.enterText(find.byType(TextFormField).at(1), 'nuevo@demo.test');
    await tester.enterText(find.byType(TextFormField).at(2), 'Temporal123!');
    await tester.tap(find.widgetWithText(FilledButton, 'Agregar'));
    await tester.pumpAndSettle();
    expect(find.text('Elige la unidad'), findsOneWidget, reason: 'sin unidad no se crea');
    expect(s.llamadas, isNot(contains('POST /usuarios/residentes')));

    await tester.tap(find.byType(DropdownButtonFormField<int>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manzana B - Casa 4').last);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Agregar'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /usuarios/residentes'));
    await _cerrar(tester);
  });

  testWidgets('administración: restablece una contraseña solo después de confirmar la identidad', (tester) async {
    final s = await _abrir(tester, const UsuariosPage(), 'administrador', {
      'GET /usuarios': [
        {'id': 8, 'nombre': 'Residente Que Olvidó Su Clave', 'correo': 'olvido@demo.test', 'estado': 'activo', 'rol': 'residente', 'unidad': 'Torre 1 - Apto 101', 'telefono': '3000000000'},
      ],
      'POST /usuarios/8/restablecer-clave': {'password': 'Xk7mPq2vTa', 'vence': '2026-12-01T00:00:00.000Z'},
    });
    await tester.tap(find.byTooltip('Restablecer contraseña'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Restablecer'));
    await tester.pumpAndSettle();
    expect(s.llamadas, isNot(contains('POST /usuarios/8/restablecer-clave')), reason: 'sin confirmar la identidad no se restablece');
    await tester.tap(find.byType(CheckboxListTile));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Restablecer'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /usuarios/8/restablecer-clave'));
    expect(find.text('Xk7mPq2vTa'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Ya la entregué'));
    await tester.pumpAndSettle();
    expect(find.text('Xk7mPq2vTa'), findsNothing);
    await _cerrar(tester);
  });

  testWidgets('administración: ve primero las PQRS pendientes y puede consultar las resueltas', (tester) async {
    Map<String, dynamic> pqrs(int id, String asunto, String estado, int diasAtras) => {
          'id': id, 'tipo': 'queja', 'asunto': asunto, 'descripcion': 'Detalle de la solicitud', 'estado': estado, 'respuesta': null,
          'respondido_en': null, 'creado_en': DateTime.now().subtract(Duration(days: diasAtras)).toUtc().toIso8601String(), 'usuario': 'Residente Demo', 'unidad': 'Casa 4', 'respondido_por': null,
        };
    await _abrir(tester, const PqrsPage(esAdmin: true), 'administrador', {
      'GET /pqrs': [pqrs(1, 'Reciente', 'registrada', 0), pqrs(2, 'La más antigua', 'en_proceso', 9), pqrs(3, 'Ya resuelta', 'cerrada', 3)],
    });
    expect(find.text('Pendientes 2'), findsOneWidget);
    expect(find.text('Ya resuelta'), findsNothing);
    expect(find.textContaining('Abierta hace 9 días'), findsOneWidget);
    expect(tester.getTopLeft(find.text('La más antigua')).dy, lessThan(tester.getTopLeft(find.text('Reciente')).dy));
    await tester.tap(find.text('Resueltas 1'));
    await tester.pumpAndSettle();
    expect(find.text('Ya resuelta'), findsOneWidget);
    expect(find.text('Reciente'), findsNothing);
    await _cerrar(tester);
  });

  testWidgets('administración: crea una unidad y genera una invitación', (tester) async {
    final s = await _abrir(tester, const UnidadesPage(), 'administrador', {
      'GET /unidades': [
        {'id': 1, 'identificador': 'Torre 1 - Apto 101'}
      ],
      'POST /unidades/1/invitacion': {'codigo': 'ABCDE12345'},
    });
    await tester.tap(find.text('Nueva unidad'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Torre 3 - Apto 301');
    await tester.tap(find.widgetWithText(FilledButton, 'Crear'));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /unidades'));

    await tester.tap(find.text('Invitar'));
    await tester.pumpAndSettle();
    expect(find.text('ABCDE12345'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Listo'));
    await tester.pumpAndSettle();
    await _cerrar(tester);
  });

  testWidgets('residente: envía un mensaje al vigilante y aparece al instante', (tester) async {
    final s = await _abrir(tester, const ChatPage(), 'residente', {
      'POST /chat/porteria/mi': {'id': 1, 'cuerpo': 'Hola, voy llegando', 'creado_en': _ahora(), 'autor_id': 7, 'autor': 'Persona Demo', 'rol': 'residente'},
    });
    await tester.enterText(find.byType(TextField), 'Hola, voy llegando');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();
    expect(s.llamadas, contains('POST /chat/porteria/mi'));
    expect(find.text('Hola, voy llegando'), findsOneWidget);
    await _cerrar(tester);
  });
}
