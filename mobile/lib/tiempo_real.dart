import 'dart:async';
import 'package:flutter/widgets.dart';
import 'api.dart';
import 'modelos.dart';

/// Mantiene la app al día: cada pocos segundos pregunta si hay avisos nuevos. Cuando llegan,
/// actualiza los contadores, recarga las pantallas y los publica para mostrarlos como aviso emergente.
/// Funciona aunque no haya notificaciones push; si las hay, [consultar] se llama al instante.
/// Se pausa cuando la app pasa a segundo plano (ahí avisan las notificaciones del teléfono).
class CentroAvisos with WidgetsBindingObserver {
  CentroAvisos._();
  static final CentroAvisos i = CentroAvisos._();

  static const intervalo = Duration(seconds: 4);

  final ValueNotifier<int> sinLeer = ValueNotifier(0);
  final ValueNotifier<int> chatSinLeer = ValueNotifier(0);

  /// Cambia cada vez que se detiene (cierre de sesión): lo que estuviera en pantalla de ese usuario se descarta.
  final ValueNotifier<int> reinicios = ValueNotifier(0);

  final StreamController<Notificacion> _llegadas = StreamController.broadcast();
  Stream<Notificacion> get llegadas => _llegadas.stream;

  /// Para no avisar de un mensaje que el usuario está viendo en ese momento.
  bool chatVisible = false;
  int? conversacionAbierta;

  Timer? _reloj;
  int? _ultimo;
  bool _consultando = false;
  bool _activo = false;

  void iniciar() {
    detener();
    _activo = true;
    WidgetsBinding.instance.addObserver(this);
    _programar();
    consultar();
  }

  void detener() {
    if (_activo) {
      WidgetsBinding.instance.removeObserver(this);
      _activo = false;
      reinicios.value++;
    }
    _reloj?.cancel();
    _reloj = null;
    _ultimo = null;
    chatVisible = false;
    conversacionAbierta = null;
    sinLeer.value = 0;
    chatSinLeer.value = 0;
  }

  void _programar() {
    _reloj?.cancel();
    _reloj = Timer.periodic(intervalo, (_) => consultar());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_activo) return;
    if (state == AppLifecycleState.resumed) {
      _programar();
      consultar();
      Api.i.cambios.value++; // al volver, todo se refresca de inmediato
    } else if (state == AppLifecycleState.paused) {
      _reloj?.cancel();
    }
  }

  Future<void> consultar() async {
    if (!_activo || _consultando || !Api.i.sesionIniciada) return;
    _consultando = true;
    try {
      final r = await Api.i.resumenAvisos(desde: _ultimo);
      if (!_activo) return;
      // Si llegaron más de los que caben en una respuesta, se continúa desde el último recibido.
      final hasta = r.nuevas.length >= 10 ? r.nuevas.last.id : r.ultimoId;
      _ultimo = _ultimo == null || hasta > _ultimo! ? hasta : _ultimo;
      sinLeer.value = r.sinLeer;
      chatSinLeer.value = r.chatSinLeer;
      if (r.nuevas.isNotEmpty) {
        Api.i.cambios.value++;
        for (final n in r.nuevas) {
          _llegadas.add(n);
        }
      }
    } on ApiError catch (_) {
      // sin conexión: se reintenta en el siguiente ciclo
    } finally {
      _consultando = false;
    }
  }
}
