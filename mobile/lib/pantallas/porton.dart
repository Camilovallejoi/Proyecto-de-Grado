import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../llamar.dart';
import '../tiempo.dart';

/// Aviso de llegada. El residente avisa que va llegando en un vehículo y necesita que abran el portón;
/// el administrador ve los avisos pendientes y marca cada uno cuando ya abrió.
/// Se refresca cada 10 segundos para que el aviso llegue sin tener que recargar.
class PortonPage extends StatefulWidget {
  /// Administración o celador: ven la cola de avisos y abren el portón. Si es falso, es un residente.
  final bool esPersonal;

  /// Solo el vigilante abre el portón; la administración consulta los avisos.
  final bool puedeAtender;
  const PortonPage({super.key, required this.esPersonal, this.puedeAtender = false});

  @override
  State<PortonPage> createState() => _PortonPageState();
}

class _PortonPageState extends State<PortonPage> {
  List<AvisoPorton>? _avisos;
  String? _error;
  Timer? _reloj;
  String _tipo = 'carro';
  final _placa = TextEditingController();
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    _cargar();
    Api.i.cambios.addListener(_cargar);
    _reloj = Timer.periodic(const Duration(seconds: 10), (_) => _cargar());
  }

  @override
  void dispose() {
    _reloj?.cancel();
    Api.i.cambios.removeListener(_cargar);
    _placa.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    try {
      final r = widget.esPersonal ? await Api.i.avisosPorton() : await Api.i.misAvisos();
      if (mounted) {
        setState(() {
          _avisos = r;
          _error = null;
        });
      }
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  void _msg(String t) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t)));

  Future<void> _accion(Future<void> Function() f, String exito) async {
    try {
      await f();
      _msg(exito);
    } on ApiError catch (e) {
      _msg(e.mensaje);
    }
  }

  Future<void> _enviar() async {
    setState(() => _enviando = true);
    await _accion(() => Api.i.avisarLlegada(_tipo, _placa.text.trim()), 'Aviso enviado a portería');
    if (mounted) {
      _placa.clear();
      setState(() => _enviando = false);
    }
  }

  String _tipoTexto(String t) => switch (t) { 'moto' => 'Moto', 'otro' => 'Otro vehículo', _ => 'Carro' };

  IconData _tipoIcono(String t) => switch (t) { 'moto' => Icons.two_wheeler, 'otro' => Icons.local_shipping, _ => Icons.directions_car };

  (String, Color) _estado(AvisoPorton a, ColorScheme cs) => switch (a.estado) {
        'pendiente' => ('Esperando a portería', cs.tertiary),
        'atendido' => ('Portón abierto', cs.primary),
        'cancelado' => ('Cancelado', cs.outline),
        _ => ('Vencido sin atender', cs.error),
      };

  @override
  Widget build(BuildContext context) {
    if (_error != null && _avisos == null) {
      return Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!, textAlign: TextAlign.center)));
    }
    if (_avisos == null) return const Center(child: CircularProgressIndicator());
    return RefreshIndicator(
      onRefresh: _cargar,
      child: widget.esPersonal ? _vistaAdmin() : _vistaResidente(),
    );
  }

  // ---------------------------------------------------------------- residente
  Widget _vistaResidente() {
    final cs = Theme.of(context).colorScheme;
    final pendiente = _avisos!.where((a) => a.pendiente).firstOrNull;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(children: [
                  Icon(Icons.garage_outlined, color: cs.primary),
                  const SizedBox(width: 10),
                  Expanded(child: Text('Voy llegando, abran el portón', style: Theme.of(context).textTheme.titleMedium)),
                ]),
                const SizedBox(height: 4),
                Text('Avisa a portería para que te abra cuando llegues con tu vehículo. Avisa antes de salir o estando detenido: no uses el celular mientras conduces.', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                const SizedBox(height: 14),
                if (pendiente != null) ...[
                  _TarjetaEstado(texto: 'Tu aviso fue enviado ${fechaHoraBogota(pendiente.creadoEn)}. Te avisaremos cuando portería abra el portón.', color: cs.tertiaryContainer, onColor: cs.onTertiaryContainer),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () => _accion(() => Api.i.cancelarAviso(pendiente.id), 'Aviso cancelado'),
                    icon: const Icon(Icons.close),
                    label: const Text('Cancelar aviso'),
                  ),
                  const SizedBox(height: 6),
                  const BotonLlamarPorteria(texto: '¿No abren? Llamar a portería'),
                ] else ...[
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'carro', icon: Icon(Icons.directions_car), label: Text('Carro')),
                      ButtonSegment(value: 'moto', icon: Icon(Icons.two_wheeler), label: Text('Moto')),
                      ButtonSegment(value: 'otro', icon: Icon(Icons.local_shipping), label: Text('Otro')),
                    ],
                    selected: {_tipo},
                    onSelectionChanged: (s) => setState(() => _tipo = s.first),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _placa,
                    textCapitalization: TextCapitalization.characters,
                    maxLength: 7,
                    decoration: const InputDecoration(labelText: 'Placa (opcional)', helperText: 'Ayuda a la portería a reconocer tu vehículo'),
                  ),
                  const SizedBox(height: 6),
                  FilledButton.icon(
                    onPressed: _enviando ? null : _enviar,
                    icon: _enviando ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.notifications_active_outlined),
                    label: const Text('Avisar que estoy llegando'),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        Padding(padding: const EdgeInsets.fromLTRB(4, 8, 4, 4), child: Text('Tus avisos recientes', style: Theme.of(context).textTheme.titleSmall)),
        if (_avisos!.isEmpty) Padding(padding: const EdgeInsets.all(16), child: Text('Aún no has enviado avisos.', style: TextStyle(color: cs.onSurfaceVariant))),
        for (final a in _avisos!) _FilaAviso(aviso: a, titulo: '${_tipoTexto(a.tipoVehiculo)}${a.placa != null ? ' · ${a.placa}' : ''}', icono: _tipoIcono(a.tipoVehiculo), estado: _estado(a, cs)),
        const SizedBox(height: 12),
        Text('Los avisos que nadie atiende en 30 minutos se dan por vencidos y todos se borran a las 24 horas.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
      ],
    );
  }

  // ------------------------------------------------------------ administrador
  Widget _vistaAdmin() {
    final cs = Theme.of(context).colorScheme;
    final pendientes = _avisos!.where((a) => a.pendiente).toList();
    final resto = _avisos!.where((a) => !a.pendiente).toList();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _TarjetaEstado(
          texto: pendientes.isEmpty ? 'No hay residentes esperando que abran el portón.' : '${pendientes.length} residente${pendientes.length == 1 ? '' : 's'} esperando que abran el portón.',
          color: pendientes.isEmpty ? cs.surfaceContainerHighest : cs.tertiaryContainer,
          onColor: pendientes.isEmpty ? cs.onSurfaceVariant : cs.onTertiaryContainer,
          icono: pendientes.isEmpty ? Icons.check_circle_outline : Icons.notifications_active,
        ),
        const SizedBox(height: 12),
        for (final a in pendientes)
          Card(
            color: cs.tertiaryContainer.withValues(alpha: 0.35),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    CircleAvatar(backgroundColor: cs.primaryContainer, foregroundColor: cs.onPrimaryContainer, child: Icon(_tipoIcono(a.tipoVehiculo))),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${a.usuario} · ${a.unidad}', style: Theme.of(context).textTheme.titleSmall),
                        Text('${_tipoTexto(a.tipoVehiculo)}${a.placa != null ? ' · placa ${a.placa}' : ''}'),
                        Text('Avisó ${fechaHoraBogota(a.creadoEn)}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                      ]),
                    ),
                  ]),
                  if (widget.puedeAtender) ...[
                    const SizedBox(height: 10),
                    FilledButton.icon(
                      onPressed: () => _accion(() => Api.i.atenderAviso(a.id), 'Marcado como atendido: portón abierto'),
                      icon: const Icon(Icons.lock_open),
                      label: const Text('Ya abrí el portón'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        if (resto.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(4, 12, 4, 4), child: Text('Recientes', style: Theme.of(context).textTheme.titleSmall)),
        for (final a in resto)
          _FilaAviso(
            aviso: a,
            titulo: '${a.usuario} · ${a.unidad}',
            icono: _tipoIcono(a.tipoVehiculo),
            estado: _estado(a, cs),
            detalle: a.atendidoPor != null ? 'Atendió ${a.atendidoPor}' : null,
          ),
        const SizedBox(height: 12),
        Text('Los avisos que nadie atiende en 30 minutos se dan por vencidos y todos se borran a las 24 horas.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
      ],
    );
  }
}

class _TarjetaEstado extends StatelessWidget {
  final String texto;
  final Color color;
  final Color onColor;
  final IconData icono;
  const _TarjetaEstado({required this.texto, required this.color, required this.onColor, this.icono = Icons.hourglass_top});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(icono, color: onColor),
          const SizedBox(width: 10),
          Expanded(child: Text(texto, style: TextStyle(color: onColor))),
        ]),
      );
}

class _FilaAviso extends StatelessWidget {
  final AvisoPorton aviso;
  final String titulo;
  final IconData icono;
  final (String, Color) estado;
  final String? detalle;
  const _FilaAviso({required this.aviso, required this.titulo, required this.icono, required this.estado, this.detalle});

  @override
  Widget build(BuildContext context) => Card(
        child: ListTile(
          leading: Icon(icono),
          title: Text(titulo),
          subtitle: Text([fechaHoraBogota(aviso.creadoEn), ?detalle].join(' · ')),
          trailing: Text(estado.$1, style: TextStyle(color: estado.$2, fontWeight: FontWeight.w600)),
        ),
      );
}
