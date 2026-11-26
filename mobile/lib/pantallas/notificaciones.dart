import 'package:flutter/material.dart';
import '../api.dart';
import '../modelos.dart';
import '../navegacion.dart';
import '../tiempo.dart';
import '../tiempo_real.dart';
import 'comun.dart';

/// Bandeja de notificaciones: el historial de avisos, para no perder nada aunque el teléfono no suene.
class NotificacionesPage extends StatefulWidget {
  const NotificacionesPage({super.key});

  @override
  State<NotificacionesPage> createState() => _NotificacionesState();
}

class _NotificacionesState extends State<NotificacionesPage> with RefrescoPeriodico {
  List<Notificacion>? _datos;
  String? _error;

  @override
  int get segundosRefresco => 15;

  @override
  void initState() {
    super.initState();
    iniciarRefresco();
  }

  @override
  void dispose() {
    detenerRefresco();
    super.dispose();
  }

  @override
  Future<void> recargar() async {
    try {
      final r = await Api.i.notificaciones();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _despues(Future<void> Function() accion) async {
    if (await intentar(context, accion)) {
      await recargar();
      await CentroAvisos.i.consultar();
    }
  }

  void _abrir(Notificacion n) {
    if (!n.leida) {
      Api.i.marcarLeidas(ids: [n.id]).then((_) => CentroAvisos.i.consultar()).catchError((_) {});
    }
    final d = destinoDeAviso(n.tipo, Api.i.usuario!);
    if (d != null) {
      irA(d.seccion, d.pestana);
    } else {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final datos = _datos;
    final hayNuevas = datos?.any((n) => !n.leida) ?? false;
    final hayLeidas = datos?.any((n) => n.leida) ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notificaciones'),
        actions: [
          if (hayNuevas) IconButton(tooltip: 'Marcar todas como leídas', icon: const Icon(Icons.done_all), onPressed: () => _despues(() => Api.i.marcarLeidas(todas: true))),
          if (hayLeidas) IconButton(tooltip: 'Borrar las leídas', icon: const Icon(Icons.delete_sweep_outlined), onPressed: () => _despues(Api.i.vaciarLeidas)),
        ],
      ),
      body: datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: datos.isEmpty
                  ? ListView(children: const [SizedBox(height: 120), Aviso('No tienes notificaciones.\nAquí aparecerán los avisos del portón, visitas, paquetes y mensajes.', icono: Icons.notifications_none)])
                  : ListView(
                      padding: const EdgeInsets.all(12),
                      children: [
                        for (final n in datos)
                          Card(
                            color: n.leida ? null : cs.primaryContainer.withValues(alpha: 0.55),
                            child: ListTile(
                              leading: Icon(iconoDeAviso(n.tipo), color: n.leida ? cs.onSurfaceVariant : cs.primary),
                              title: Text(n.titulo, style: TextStyle(fontWeight: n.leida ? FontWeight.w500 : FontWeight.w700)),
                              subtitle: Text('${n.mensaje}\n${fechaHoraBogota(n.creadoEn)}'),
                              isThreeLine: true,
                              onTap: () => _abrir(n),
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text('Las notificaciones leídas se borran a los 7 días y todas a los 30.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                        ),
                      ],
                    ),
            ),
    );
  }
}
