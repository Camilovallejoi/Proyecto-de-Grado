import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'pantallas/comun.dart';

/// Abre el marcador del teléfono con el número puesto. La llamada la hace el usuario desde su línea,
/// por eso la app no necesita permiso para llamar. Se puede sustituir en las pruebas.
Future<bool> Function(Uri) abridorDeEnlaces = (uri) => launchUrl(uri);

Future<void> llamarNumero(BuildContext context, String? numero, {required String siNoHay}) async {
  if (numero == null || numero.isEmpty) {
    mostrarMensaje(context, siNoHay);
    return;
  }
  var abierto = false;
  try {
    abierto = await abridorDeEnlaces(Uri(scheme: 'tel', path: numero));
  } catch (_) {}
  if (!abierto && context.mounted) mostrarMensaje(context, 'No se pudo abrir el marcador. Marca $numero');
}

/// Llama al número único de portería (se consulta en el momento, por si la administración lo cambió).
Future<void> llamarPorteria(BuildContext context) async {
  String? numero;
  try {
    numero = await Api.i.telefonoPorteria();
  } on ApiError catch (e) {
    if (context.mounted) mostrarMensaje(context, e.mensaje);
    return;
  }
  if (!context.mounted) return;
  await llamarNumero(context, numero, siNoHay: 'La administración aún no ha registrado el teléfono de portería.');
}

/// El vigilante llama a un residente (solo hay número si el residente autorizó compartirlo).
Future<void> llamarResidente(BuildContext context, String? numero, [String? nombre]) =>
    llamarNumero(context, numero, siNoHay: '${nombre ?? 'El residente'} no ha registrado su teléfono. Escríbele por el chat.');

class BotonLlamarPorteria extends StatelessWidget {
  final String texto;
  const BotonLlamarPorteria({super.key, this.texto = 'Llamar a portería'});

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: () => llamarPorteria(context),
        icon: const Icon(Icons.call_outlined),
        label: Text(texto),
      );
}
