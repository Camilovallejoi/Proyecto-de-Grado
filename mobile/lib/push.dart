import 'dart:async';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'api.dart';
import 'navegacion.dart';
import 'tiempo_real.dart';

/// Notificaciones push (Firebase Cloud Messaging). Solo se activa en Android; en web o escritorio no hace nada.
/// Si Firebase falla (sin Google Play, sin permiso), la app sigue funcionando: la bandeja se consulta cada pocos segundos.
class PushService {
  PushService._();
  static final PushService i = PushService._();

  bool _firebaseListo = false;
  String? _token;
  String? _ultimo; // último token conocido, para reutilizarlo si se vuelve a iniciar sesión
  StreamSubscription<String>? _renovacion;
  StreamSubscription<RemoteMessage>? _primerPlano;

  bool get _soportado => !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  /// Se llama una vez al arrancar la app.
  Future<void> inicializar() async {
    if (!_soportado) return;
    try {
      await Firebase.initializeApp();
      _firebaseListo = true;
      // Al tocar una notificación se abre directamente la pantalla que corresponde.
      FirebaseMessaging.onMessageOpenedApp.listen(_abrir);
      final inicial = await FirebaseMessaging.instance.getInitialMessage();
      if (inicial != null) _abrir(inicial); // la app estaba cerrada
    } catch (e) {
      debugPrint('Firebase no disponible: $e');
    }
  }

  void _abrir(RemoteMessage mensaje) {
    final tipo = mensaje.data['tipo'];
    if (tipo is String) abrirAviso(tipo);
  }

  /// Se llama al iniciar sesión: pide permiso, obtiene el token del teléfono y lo registra en el servidor.
  Future<void> activar() async {
    if (!_firebaseListo) return;
    try {
      final fm = FirebaseMessaging.instance;
      await fm.requestPermission();
      // Se usa el token FCM clásico (getToken / onTokenRefresh): es el que admite el envío desde firebase-admin.
      // Las API nuevas register/onRegistered entregan otro identificador (ID de instalación) que no sirve aquí.
      // ignore: deprecated_member_use
      _token = await fm.getToken().timeout(const Duration(seconds: 20));
      debugPrint('Token FCM obtenido (${_token?.length ?? 0} caracteres)');
      final previo = _token ?? _ultimo;
      if (previo != null) await Api.i.registrarDispositivo(previo);
      debugPrint('Dispositivo registrado en el servidor');
      // ignore: deprecated_member_use
      _renovacion ??= fm.onTokenRefresh.listen((t) {
        _token = t;
        if (Api.i.sesionIniciada) Api.i.registrarDispositivo(t).catchError((_) {});
      });
      // Con la app abierta Android no muestra la notificación: se consulta la bandeja al instante
      // y el aviso aparece dentro de la app.
      _primerPlano ??= FirebaseMessaging.onMessage.listen((_) => CentroAvisos.i.consultar());
    } catch (e) {
      debugPrint('No se pudo activar las notificaciones: $e');
    }
  }

  /// Se llama al cerrar sesión, antes de borrar el token de acceso.
  Future<void> desactivar() async {
    final t = _token;
    _ultimo = t ?? _ultimo;
    _token = null;
    if (t == null) return;
    try {
      await Api.i.bajaDispositivo(t);
    } catch (_) {}
  }
}
