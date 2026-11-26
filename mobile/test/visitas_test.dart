import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:flutter_application_1/api.dart';
import 'package:flutter_application_1/pantallas/comun.dart';
import 'package:flutter_application_1/pantallas/visitas.dart';

/// Servidor falso: responde lo mínimo que necesita la pantalla de visitas del residente.
http.Client _servidorFalso() => MockClient((req) async {
      final cabeceras = {'content-type': 'application/json; charset=utf-8'};
      if (req.method == 'POST' && req.url.path == '/visitas') {
        return http.Response(
          jsonEncode({
            'id': 1,
            'nombre': 'Ana Visitante',
            'documento': null,
            'placa': null,
            'codigo': 'ABC234',
            'valida_hasta': DateTime.now().add(const Duration(hours: 12)).toUtc().toIso8601String(),
            'estado': 'autorizada',
            'origen': 'residente',
            'entrada_en': null,
            'salida_en': null,
            'unidad': 'Torre 1 - Apto 101',
            'residente': 'Residente Demo',
            'recibido_por': null,
          }),
          201,
          headers: cabeceras,
        );
      }
      return http.Response('[]', 200, headers: cabeceras);
    });

void main() {
  setUp(() => Api.i.usarCliente(_servidorFalso()));

  Widget app(Widget hijo) => MaterialApp(home: Scaffold(body: hijo));

  testWidgets('el residente autoriza una visita y ve su código QR sin errores', (tester) async {
    // Misma estructura que en la app: pestañas de "Acceso" con la pantalla de visitas en medio.
    await tester.pumpWidget(app(const PestanasPage(pestanas: [
      ('Portón', Icons.garage_outlined, SizedBox()),
      ('Visitas', Icons.qr_code_2, VisitasResidentePage()),
      ('Paquetes', Icons.inventory_2_outlined, SizedBox()),
    ])));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Visitas'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Autorizar visitante'));
    await tester.pumpAndSettle();
    expect(find.text('Nombre del visitante'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).first, 'Ana Visitante');
    await tester.tap(find.widgetWithText(FilledButton, 'Autorizar'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.text('ABC234'), findsOneWidget);
    expect(find.text('Cerrar'), findsOneWidget);

    await tester.tap(find.text('Cerrar'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);

    // Se desmonta la pantalla y se espera la liberación diferida de los campos de texto.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 2));
    expect(tester.takeException(), isNull);
  });
}
