import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api.dart';
import '../modelos.dart';
import '../navegacion.dart';
import '../tiempo_real.dart';
import 'comun.dart';

/// Acción que se puede resolver desde el propio aviso, sin abrir otra pantalla.
class _Accion {
  final String texto;
  final IconData icono;
  final bool principal;
  final Future<void> Function() ejecutar;
  final String exito;
  _Accion(this.texto, this.icono, this.ejecutar, this.exito, {this.principal = true});
}

/// Muestra en la parte superior los avisos que llegan mientras la app está abierta. Se coloca encima de
/// todas las pantallas (en MaterialApp.builder), así que se ven aunque haya un chat o un formulario abierto.
class AvisosEmergentes extends StatefulWidget {
  const AvisosEmergentes({super.key});

  @override
  State<AvisosEmergentes> createState() => _AvisosEmergentesState();
}

class _AvisosEmergentesState extends State<AvisosEmergentes> {
  /// Estos avisos piden una respuesta: permanecen más tiempo en pantalla.
  static const _urgentes = {'visita_solicitud', 'aviso_porton', 'paquete_en_camino', 'minuta'};

  final List<Notificacion> _cola = [];
  StreamSubscription<Notificacion>? _suscripcion;
  Timer? _reloj;
  bool _ocupado = false;

  @override
  void initState() {
    super.initState();
    _suscripcion = CentroAvisos.i.llegadas.listen(_llego);
    CentroAvisos.i.reinicios.addListener(_alCerrarSesion);
  }

  @override
  void dispose() {
    _suscripcion?.cancel();
    _reloj?.cancel();
    CentroAvisos.i.reinicios.removeListener(_alCerrarSesion);
    super.dispose();
  }

  /// Al cerrar sesión se descartan los avisos en cola: no deben verlos quien entre después en el mismo teléfono.
  void _alCerrarSesion() {
    _reloj?.cancel();
    // En un microtask, porque el cierre puede ocurrir mientras se desmontan pantallas.
    Future.microtask(() {
      if (mounted && _cola.isNotEmpty) setState(_cola.clear);
    });
  }

  void _llego(Notificacion n) {
    if (!mounted || Api.i.usuario == null) return;
    final centro = CentroAvisos.i;
    // No se avisa de un mensaje que se está leyendo en ese momento.
    if (n.tipo == 'chat' && (Api.i.usuario!.esVigilante ? centro.conversacionAbierta == n.referenciaId : centro.chatVisible)) return;
    final urgente = _urgentes.contains(n.tipo);
    setState(() {
      _cola.removeWhere((x) => x.tipo == n.tipo && x.referenciaId == n.referenciaId);
      // Lo urgente pasa adelante.
      if (urgente) {
        _cola.insert(0, n);
      } else {
        _cola.add(n);
      }
      if (_cola.length > 5) _cola.removeLast();
    });
    urgente ? HapticFeedback.heavyImpact() : HapticFeedback.selectionClick();
    _programarCierre();
  }

  void _programarCierre() {
    _reloj?.cancel();
    if (_cola.isEmpty) return;
    final segundos = _urgentes.contains(_cola.first.tipo) ? 45 : 7;
    _reloj = Timer(Duration(seconds: segundos), _descartar);
  }

  void _descartar() {
    if (!mounted || _cola.isEmpty) return;
    setState(() => _cola.removeAt(0));
    _programarCierre();
  }

  List<_Accion> _acciones(Notificacion n) {
    final u = Api.i.usuario!;
    final id = n.referenciaId;
    if (id == null) return const [];
    if (n.tipo == 'visita_solicitud' && !u.esPersonal) {
      return [
        _Accion('Rechazar', Icons.close, () => Api.i.responderVisita(id, autorizar: false), 'Visita rechazada', principal: false),
        _Accion('Autorizar', Icons.check, () => Api.i.responderVisita(id, autorizar: true), 'Visita autorizada'),
      ];
    }
    if (n.tipo == 'aviso_porton' && u.esVigilante) {
      return [_Accion('Ya abrí el portón', Icons.lock_open, () => Api.i.atenderAviso(id), 'Marcado como atendido')];
    }
    if (n.tipo == 'paquete' && !u.esPersonal && (n.titulo == 'Tu domicilio llegó' || n.titulo == 'Tienes algo en portería')) {
      return [_Accion('Ya voy', Icons.directions_walk, () => Api.i.voyPorPaquete(id), 'Portería ya sabe que vas en camino')];
    }
    return const [];
  }

  Future<void> _ejecutar(_Accion a) async {
    if (_ocupado) return;
    setState(() => _ocupado = true);
    final ok = await intentar(context, a.ejecutar, exito: a.exito);
    if (!mounted) return;
    setState(() => _ocupado = false);
    if (ok) {
      _descartar();
      CentroAvisos.i.consultar();
    }
  }

  void _ver(Notificacion n) {
    _descartar();
    Api.i.marcarLeidas(ids: [n.id]).catchError((_) {});
    abrirAviso(n.tipo);
  }

  @override
  Widget build(BuildContext context) {
    final n = _cola.isEmpty || Api.i.usuario == null ? null : _cola.first;
    return Positioned(
      left: 0,
      right: 0,
      top: 0,
      child: SafeArea(
        bottom: false,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          transitionBuilder: (hijo, a) => SlideTransition(position: Tween(begin: const Offset(0, -1), end: Offset.zero).animate(a), child: FadeTransition(opacity: a, child: hijo)),
          child: n == null ? const SizedBox.shrink() : _tarjeta(context, n),
        ),
      ),
    );
  }

  Widget _tarjeta(BuildContext context, Notificacion n) {
    final cs = Theme.of(context).colorScheme;
    final urgente = _urgentes.contains(n.tipo);
    final acciones = _acciones(n);
    return Dismissible(
      key: ValueKey('aviso-${n.id}'),
      direction: DismissDirection.up,
      onDismissed: (_) => _descartar(),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 0),
        child: Material(
          elevation: 8,
          color: urgente ? cs.tertiaryContainer : cs.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(18),
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: () => _ver(n),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  CircleAvatar(radius: 20, backgroundColor: cs.primaryContainer, foregroundColor: cs.onPrimaryContainer, child: Icon(iconoDeAviso(n.tipo), size: 22)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(n.titulo, style: TextStyle(fontWeight: FontWeight.w700, color: urgente ? cs.onTertiaryContainer : cs.onSurface)),
                      const SizedBox(height: 2),
                      Text(n.mensaje, maxLines: 3, overflow: TextOverflow.ellipsis, style: TextStyle(color: urgente ? cs.onTertiaryContainer : cs.onSurfaceVariant)),
                      if (_cola.length > 1)
                        Padding(padding: const EdgeInsets.only(top: 4), child: Text('+${_cola.length - 1} aviso(s) más', style: TextStyle(fontSize: 12, color: cs.onSurfaceVariant))),
                    ]),
                  ),
                  IconButton(icon: const Icon(Icons.close, size: 20), onPressed: _descartar),
                ]),
                if (acciones.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 10, right: 8),
                    child: Row(children: [
                      for (var i = 0; i < acciones.length; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(
                          child: acciones[i].principal
                              ? FilledButton.icon(onPressed: _ocupado ? null : () => _ejecutar(acciones[i]), icon: Icon(acciones[i].icono, size: 18), label: Text(acciones[i].texto))
                              : OutlinedButton.icon(onPressed: _ocupado ? null : () => _ejecutar(acciones[i]), icon: Icon(acciones[i].icono, size: 18), label: Text(acciones[i].texto)),
                        ),
                      ],
                    ]),
                  ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}
