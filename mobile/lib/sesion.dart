import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Guarda el pase de acceso cifrado en el teléfono para no pedir la contraseña cada vez que se abre la app.
/// El pase vence en el servidor (12 horas) y deja de servir de inmediato si la administración desactiva la cuenta.
class AlmacenSesion {
  static const _clave = 'cantaluna_token';
  final FlutterSecureStorage _almacen = const FlutterSecureStorage();

  Future<String?> leer() async {
    try {
      return await _almacen.read(key: _clave);
    } catch (_) {
      return null; // sin almacenamiento seguro (pruebas o plataformas no compatibles): se pide la contraseña
    }
  }

  Future<void> guardar(String token) async {
    try {
      await _almacen.write(key: _clave, value: token);
    } catch (_) {}
  }

  Future<void> borrar() async {
    try {
      await _almacen.delete(key: _clave);
    } catch (_) {}
  }
}
