import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../tiempo.dart';

enum _Filtro { todas, vigentes, canceladas }

/// Residente: sus reservas. Administrador (todas = true): las reservas de toda la copropiedad,
/// con filtros y la opción de eliminarlas. Las reservas que ya terminaron y las canceladas
/// de hace más de 24 h las borra el servidor automáticamente.
class ReservasPage extends StatefulWidget {
  final bool todas;
  const ReservasPage({super.key, required this.todas});

  @override
  State<ReservasPage> createState() => _ReservasPageState();
}

class _ReservasPageState extends State<ReservasPage> {
  List<Reserva>? _datos;
  String? _error;
  _Filtro _filtro = _Filtro.todas;
  Timer? _reloj;

  @override
  void initState() {
    super.initState();
    _cargar();
    Api.i.cambios.addListener(_cargar);
    // Refresca cada minuto para que desaparezcan las reservas que ya terminaron.
    _reloj = Timer.periodic(const Duration(minutes: 1), (_) => _cargar());
  }

  @override
  void dispose() {
    _reloj?.cancel();
    Api.i.cambios.removeListener(_cargar);
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      final r = widget.todas ? await Api.i.todasLasReservas() : await Api.i.misReservas();
      if (mounted) {
        setState(() {
          _datos = r;
          _error = null;
        });
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  void _aviso(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<bool> _confirmar(String titulo, String texto, String accion) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(titulo),
        content: Text(texto),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('No')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(accion)),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _cancelar(Reserva r) async {
    if (!await _confirmar('Cancelar reserva', '¿Cancelar ${r.zona} del ${fechaHoraBogota(r.inicio)}?', 'Sí, cancelar')) return;
    try {
      await Api.i.cancelarReserva(r.id);
    } on ApiError catch (e) {
      _aviso(e.mensaje);
    }
  }

  Future<void> _eliminar(Reserva r) async {
    final aviso = r.estado == 'confirmada' ? '\n\nLa reserva está vigente: el residente perderá su horario.' : '';
    final texto = '¿Eliminar definitivamente ${r.zona} del ${fechaHoraBogota(r.inicio)} (${r.unidad})?$aviso';
    if (!await _confirmar('Eliminar reserva', texto, 'Eliminar')) return;
    try {
      await Api.i.eliminarReserva(r.id);
      _aviso('Reserva eliminada');
    } on ApiError catch (e) {
      _aviso(e.mensaje);
    }
  }

  Future<void> _eliminarCanceladas(int n) async {
    if (!await _confirmar('Eliminar canceladas', '¿Eliminar las $n reserva(s) canceladas?', 'Eliminar')) return;
    try {
      final borradas = await Api.i.eliminarCanceladas();
      _aviso('$borradas reserva(s) cancelada(s) eliminada(s)');
    } on ApiError catch (e) {
      _aviso(e.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    if (_datos == null && _error == null) return const Center(child: CircularProgressIndicator());
    if (_datos == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(_error!, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: _cargar, child: const Text('Reintentar')),
          ]),
        ),
      );
    }
    final todas = _datos!;
    final canceladas = todas.where((r) => r.estado == 'cancelada').length;
    final vigentes = todas.length - canceladas;
    final lista = !widget.todas
        ? todas
        : switch (_filtro) {
            _Filtro.todas => todas,
            _Filtro.vigentes => todas.where((r) => r.estado == 'confirmada').toList(),
            _Filtro.canceladas => todas.where((r) => r.estado == 'cancelada').toList(),
          };

    return Column(
      children: [
        if (widget.todas)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 8, children: [
                ChoiceChip(label: Text('Todas ${todas.length}'), selected: _filtro == _Filtro.todas, onSelected: (_) => setState(() => _filtro = _Filtro.todas)),
                ChoiceChip(label: Text('Vigentes $vigentes'), selected: _filtro == _Filtro.vigentes, onSelected: (_) => setState(() => _filtro = _Filtro.vigentes)),
                ChoiceChip(label: Text('Canceladas $canceladas'), selected: _filtro == _Filtro.canceladas, onSelected: (_) => setState(() => _filtro = _Filtro.canceladas)),
              ]),
              if (_filtro == _Filtro.canceladas && canceladas > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: OutlinedButton.icon(
                    onPressed: () => _eliminarCanceladas(canceladas),
                    icon: const Icon(Icons.delete_sweep_outlined),
                    label: const Text('Eliminar todas las canceladas'),
                  ),
                ),
            ]),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Text(
            widget.todas
                ? 'Las reservas canceladas se borran solas a las 24 h y las que ya terminaron, apenas pasan. Puedes eliminarlas antes.'
                : 'Las reservas que ya terminaron se eliminan automáticamente.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant),
          ),
        ),
        Expanded(
          child: lista.isEmpty
              ? const Center(child: Text('No hay reservas para mostrar.'))
              : RefreshIndicator(
                  onRefresh: _cargar,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(12),
                    itemCount: lista.length,
                    itemBuilder: (context, i) {
                      final r = lista[i];
                      final cancelada = r.estado == 'cancelada';
                      return Card(
                        child: ListTile(
                          leading: Icon(cancelada ? Icons.event_busy : Icons.event_available, color: cancelada ? cs.error : cs.tertiary),
                          title: Text(r.zona, style: cancelada ? const TextStyle(decoration: TextDecoration.lineThrough) : null),
                          subtitle: Text([
                            '${fechaHoraBogota(r.inicio)} - ${hhmm(aBogota(r.fin).hour * 60 + aBogota(r.fin).minute)}',
                            if (widget.todas) '${r.usuario} (${r.unidad})',
                            if (cancelada) 'Cancelada',
                          ].join('\n')),
                          isThreeLine: widget.todas || cancelada,
                          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                            if (r.puedeCancelarse) IconButton(tooltip: 'Cancelar', icon: const Icon(Icons.cancel_outlined), onPressed: () => _cancelar(r)),
                            if (widget.todas) IconButton(tooltip: 'Eliminar', icon: const Icon(Icons.delete_outline), onPressed: () => _eliminar(r)),
                          ]),
                        ),
                      );
                    },
                  ),
                ),
        ),
      ],
    );
  }
}
