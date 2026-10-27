import 'package:flutter/material.dart';
import '../api.dart';
import '../tiempo.dart';

/// Alta y edición de una zona común con su regla de reserva (solo administrador).
class ZonaFormPage extends StatefulWidget {
  final Zona? zona;
  const ZonaFormPage({super.key, this.zona});

  @override
  State<ZonaFormPage> createState() => _ZonaFormPageState();
}

class _ZonaFormPageState extends State<ZonaFormPage> {
  final _form = GlobalKey<FormState>();
  late final _nombre = TextEditingController(text: widget.zona?.nombre);
  late final _descripcion = TextEditingController(text: widget.zona?.descripcion);
  late final _aforo = TextEditingController(text: widget.zona?.aforo?.toString());
  late final _duracion = TextEditingController(text: (widget.zona?.regla.duracionMaximaMin ?? 120).toString());
  late final _anticipacion = TextEditingController(text: (widget.zona?.regla.anticipacionMinimaMin ?? 60).toString());
  late final _maxActivas = TextEditingController(text: (widget.zona?.regla.maxActivasPorUnidad ?? 2).toString());
  late int _apertura = minutosDeHhmm(widget.zona?.horaApertura ?? '06:00');
  late int _cierre = minutosDeHhmm(widget.zona?.horaCierre ?? '22:00');
  late String _estado = widget.zona?.estado ?? 'activa';
  late final Set<int> _dias = {...(widget.zona?.regla.diasHabilitados ?? [0, 1, 2, 3, 4, 5, 6])};
  bool _guardando = false;

  static const _nombresDias = {1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 0: 'Dom'};

  Future<void> _elegirHora(bool apertura) async {
    final actual = apertura ? _apertura : _cierre;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay(hour: actual ~/ 60, minute: actual % 60));
    if (t == null) return;
    setState(() => apertura ? _apertura = t.hour * 60 + t.minute : _cierre = t.hour * 60 + t.minute);
  }

  Future<void> _guardar() async {
    if (!_form.currentState!.validate()) return;
    if (_cierre <= _apertura) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('La hora de cierre debe ser posterior a la de apertura')));
      return;
    }
    if (_dias.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Selecciona al menos un día habilitado')));
      return;
    }
    setState(() => _guardando = true);
    final datos = {
      'nombre': _nombre.text.trim(),
      'descripcion': _descripcion.text.trim().isEmpty ? null : _descripcion.text.trim(),
      'aforo': _aforo.text.trim().isEmpty ? null : int.parse(_aforo.text.trim()),
      'hora_apertura': hhmm(_apertura),
      'hora_cierre': hhmm(_cierre),
      'estado': _estado,
      'regla': {
        'duracion_maxima_min': int.parse(_duracion.text.trim()),
        'anticipacion_minima_min': int.parse(_anticipacion.text.trim()),
        'max_activas_por_unidad': int.parse(_maxActivas.text.trim()),
        'dias_habilitados': _dias.toList()..sort(),
      },
    };
    try {
      if (widget.zona == null) {
        await Api.i.crearZona(datos);
      } else {
        await Api.i.editarZona(widget.zona!.id, datos);
      }
      if (mounted) Navigator.pop(context);
    } on ApiError catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.mensaje)));
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  String? _entero(String? v, {int min = 0}) {
    final n = int.tryParse((v ?? '').trim());
    return n == null || n < min ? 'Número entero ≥ $min' : null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.zona == null ? 'Nueva zona común' : 'Editar zona común')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(controller: _nombre, decoration: const InputDecoration(labelText: 'Nombre', border: OutlineInputBorder()), validator: (v) => (v ?? '').trim().length < 2 ? 'Escribe un nombre' : null),
            const SizedBox(height: 12),
            TextFormField(controller: _descripcion, decoration: const InputDecoration(labelText: 'Descripción (opcional)', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextFormField(controller: _aforo, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Aforo (opcional)', border: OutlineInputBorder()), validator: (v) => (v ?? '').trim().isEmpty ? null : _entero(v, min: 1)),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _estado,
              decoration: const InputDecoration(labelText: 'Estado', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: 'activa', child: Text('Activa')),
                DropdownMenuItem(value: 'mantenimiento', child: Text('En mantenimiento')),
                DropdownMenuItem(value: 'inactiva', child: Text('Inactiva (oculta a residentes)')),
              ],
              onChanged: (v) => setState(() => _estado = v!),
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(child: OutlinedButton.icon(onPressed: () => _elegirHora(true), icon: const Icon(Icons.schedule), label: Text('Abre ${hhmm(_apertura)}'))),
              const SizedBox(width: 12),
              Expanded(child: OutlinedButton.icon(onPressed: () => _elegirHora(false), icon: const Icon(Icons.schedule), label: Text('Cierra ${hhmm(_cierre)}'))),
            ]),
            const SizedBox(height: 20),
            Text('Reglas de reserva', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextFormField(controller: _duracion, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Tiempo máximo por reserva (minutos)', helperText: 'Los residentes podrán reservar hasta este tiempo, en pasos de 30 min', border: OutlineInputBorder()), validator: (v) => _entero(v, min: 15)),
            const SizedBox(height: 12),
            TextFormField(controller: _anticipacion, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Anticipación mínima (minutos)', border: OutlineInputBorder()), validator: (v) => _entero(v)),
            const SizedBox(height: 12),
            TextFormField(controller: _maxActivas, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Reservas activas máximas por unidad', border: OutlineInputBorder()), validator: (v) => _entero(v, min: 1)),
            const SizedBox(height: 16),
            Text('Días habilitados', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(spacing: 8, children: [
              for (final e in _nombresDias.entries)
                FilterChip(label: Text(e.value), selected: _dias.contains(e.key), onSelected: (s) => setState(() => s ? _dias.add(e.key) : _dias.remove(e.key))),
            ]),
            const SizedBox(height: 24),
            FilledButton(onPressed: _guardando ? null : _guardar, child: Text(_guardando ? 'Guardando...' : 'Guardar')),
          ],
        ),
      ),
    );
  }
}
