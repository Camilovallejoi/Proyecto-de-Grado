import 'package:flutter/material.dart';
import '../api.dart';
import '../tiempo.dart';

const _paso = 30; // minutos

class ReservarPage extends StatefulWidget {
  final Zona zona;
  const ReservarPage({super.key, required this.zona});

  @override
  State<ReservarPage> createState() => _ReservarPageState();
}

class _ReservarPageState extends State<ReservarPage> {
  late DateTime _dia = hoyBogota();
  late Future<Disponibilidad> _disp = Api.i.disponibilidad(widget.zona.id, fechaIso(_dia));
  int? _inicio; // minutos del día
  int? _duracion;
  bool _guardando = false;

  Zona get z => widget.zona;

  void _cambiarDia(DateTime d) => setState(() {
        _dia = d;
        _inicio = null;
        _duracion = null;
        _disp = Api.i.disponibilidad(z.id, fechaIso(d));
      });

  // Reglas replicadas en la interfaz solo para guiar al usuario; el servidor las vuelve a validar.
  bool _libre(List<({int a, int b})> ocupados, int a, int b) => ocupados.every((o) => b <= o.a || a >= o.b);

  List<int> _iniciosPosibles(List<({int a, int b})> ocupados) {
    final ap = minutosDeHhmm(z.horaApertura), ci = minutosDeHhmm(z.horaCierre);
    final minimo = DateTime.now().toUtc().add(Duration(minutes: z.regla.anticipacionMinimaMin));
    return [
      for (var m = ap; m + _paso <= ci; m += _paso)
        if (_libre(ocupados, m, m + _paso) && desdeBogota(_dia, m).isAfter(minimo)) m
    ];
  }

  List<int> _duracionesPosibles(List<({int a, int b})> ocupados, int inicio) {
    final ci = minutosDeHhmm(z.horaCierre);
    return [
      for (var d = _paso; d <= z.regla.duracionMaximaMin && inicio + d <= ci; d += _paso)
        if (_libre(ocupados, inicio, inicio + d)) d
    ];
  }

  Future<void> _confirmar() async {
    setState(() => _guardando = true);
    try {
      await Api.i.reservar(z.id, desdeBogota(_dia, _inicio!), desdeBogota(_dia, _inicio! + _duracion!));
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Reserva confirmada')));
    } on ApiError catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.mensaje)));
      _cambiarDia(_dia); // refresca la disponibilidad (otro residente pudo ocupar el horario)
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hoy = hoyBogota();
    return Scaffold(
      appBar: AppBar(title: Text('Reservar: ${z.nombre}')),
      body: FutureBuilder<Disponibilidad>(
        future: _disp,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return Center(child: Text('${snap.error}'));
          final ocupados = [
            for (final o in snap.data!.ocupados)
              (a: aBogota(o.inicio).hour * 60 + aBogota(o.inicio).minute, b: aBogota(o.fin).hour * 60 + aBogota(o.fin).minute)
          ];
          final habilitado = z.regla.diasHabilitados.contains(_dia.weekday % 7);
          final inicios = habilitado ? _iniciosPosibles(ocupados) : <int>[];
          final duraciones = _inicio == null ? <int>[] : _duracionesPosibles(ocupados, _inicio!);
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('Horario: ${z.horaApertura} - ${z.horaCierre} · Máx. ${z.regla.duracionMaximaMin} min · Anticipación mínima ${z.regla.anticipacionMinimaMin} min'),
              const SizedBox(height: 16),
              Text('Día', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              SizedBox(
                height: 64,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: 14,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (_, i) {
                    final d = hoy.add(Duration(days: i));
                    return ChoiceChip(
                      label: Text(fechaLarga(d), textAlign: TextAlign.center),
                      selected: d == _dia,
                      onSelected: (_) => _cambiarDia(d),
                    );
                  },
                ),
              ),
              if (ocupados.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('Ocupado: ${ocupados.map((o) => '${hhmm(o.a)}-${hhmm(o.b)}').join(', ')}', style: TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              const SizedBox(height: 16),
              Text('Hora de inicio', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              if (!habilitado)
                const Text('La zona no está habilitada este día.')
              else if (inicios.isEmpty)
                const Text('No hay horarios disponibles este día.')
              else
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final m in inicios)
                      ChoiceChip(
                        label: Text(hhmm(m)),
                        selected: _inicio == m,
                        onSelected: (_) => setState(() {
                          _inicio = m;
                          _duracion = null;
                        }),
                      ),
                  ],
                ),
              if (_inicio != null) ...[
                const SizedBox(height: 16),
                Text('Duración', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final d in duraciones)
                      ChoiceChip(
                        label: Text(d % 60 == 0 ? '${d ~/ 60} h' : '${d ~/ 60 > 0 ? '${d ~/ 60} h ' : ''}${d % 60} min'),
                        selected: _duracion == d,
                        onSelected: (_) => setState(() => _duracion = d),
                      ),
                  ],
                ),
              ],
              if (_inicio != null && _duracion != null) ...[
                const SizedBox(height: 24),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.event_available),
                    title: Text('${z.nombre} · ${fechaLarga(_dia)}'),
                    subtitle: Text('${hhmm(_inicio!)} a ${hhmm(_inicio! + _duracion!)}'),
                  ),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _guardando ? null : _confirmar,
                  icon: const Icon(Icons.check),
                  label: Text(_guardando ? 'Reservando...' : 'Confirmar reserva'),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
