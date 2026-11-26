import 'package:flutter/material.dart';
import '../api.dart';
import '../modelos.dart';
import '../tiempo.dart';
import 'comun.dart';

String _estadoTexto(String e) => switch (e) { 'registrada' => 'Registrada', 'en_revision' => 'En revisión', 'en_proceso' => 'En proceso', 'cerrada' => 'Resuelta', _ => 'Cancelada' };

Color _colorGravedad(String g, ColorScheme cs) => switch (g) { 'alta' => cs.error, 'media' => cs.tertiary, _ => cs.outline };

String _gravedadTexto(String g) => switch (g) { 'alta' => 'Alta', 'media' => 'Media', _ => 'Baja' };

/// Incidencias o daños en las zonas del conjunto.
/// Residente: reporta y sigue las suyas. Vigilante: reporta y ve todas. Administración: ve todas y las gestiona.
class IncidenciasPage extends StatefulWidget {
  const IncidenciasPage({super.key});

  @override
  State<IncidenciasPage> createState() => _IncidenciasState();
}

class _IncidenciasState extends State<IncidenciasPage> with RefrescoPeriodico {
  String _filtro = 'pendientes';
  List<Incidencia>? _datos;
  String? _error;

  Usuario get _u => Api.i.usuario!;
  bool get _veTodas => _u.esPersonal;
  bool get _puedeReportar => !_u.esAdmin;

  @override
  int get segundosRefresco => 20;

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
      final r = _veTodas ? await Api.i.todasIncidencias() : await Api.i.misIncidencias();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _reportar() async {
    List<Zona> zonas = [];
    try {
      zonas = await Api.i.zonas();
    } on ApiError catch (_) {}
    if (!mounted) return;
    final descripcion = TextEditingController();
    final clave = GlobalKey<FormState>();
    int? zona;
    var gravedad = 'media';
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Reportar incidencia'),
          content: SingleChildScrollView(
            child: Form(
              key: clave,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                DropdownButtonFormField<int?>(
                  initialValue: zona,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Zona (opcional)'),
                  items: [
                    const DropdownMenuItem<int?>(value: null, child: Text('Otro lugar del conjunto')),
                    for (final z in zonas) DropdownMenuItem<int?>(value: z.id, child: Text(z.nombre)),
                  ],
                  onChanged: (v) => setD(() => zona = v),
                ),
                TextFormField(
                  controller: descripcion,
                  minLines: 3,
                  maxLines: 5,
                  maxLength: 1000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(labelText: '¿Qué pasó?'),
                  validator: (v) => (v ?? '').trim().length < 5 ? 'Describe el problema' : null,
                ),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'baja', label: Text('Baja')),
                    ButtonSegment(value: 'media', label: Text('Media')),
                    ButtonSegment(value: 'alta', label: Text('Alta')),
                  ],
                  selected: {gravedad},
                  onSelectionChanged: (s) => setD(() => gravedad = s.first),
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!clave.currentState!.validate()) return;
                final ok = await intentar(ctx, () => Api.i.reportarIncidencia(zonaId: zona, descripcion: descripcion.text.trim(), gravedad: gravedad));
                if (ok && ctx.mounted) Navigator.pop(ctx);
                if (ok && mounted) mostrarMensaje(context, 'Incidencia enviada a la administración');
              },
              child: const Text('Enviar'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([descripcion]);
  }

  Future<void> _gestionar(Incidencia i) async {
    final respuesta = TextEditingController(text: i.respuesta ?? '');
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(i.zona ?? 'Incidencia'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Reportó ${i.reportadoPor} · ${fechaHoraBogota(i.creadoEn)}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(i.descripcion),
            if (_u.esAdmin && !i.cerrada) ...[
              const SizedBox(height: 12),
              TextField(controller: respuesta, minLines: 2, maxLines: 4, maxLength: 2000, decoration: const InputDecoration(labelText: 'Qué se hizo / nota de seguimiento')),
            ] else if (i.respuesta != null) ...[
              const SizedBox(height: 12),
              Text('Respuesta de ${i.atendidoPor ?? 'la administración'}:', style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(i.respuesta!),
            ],
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
          if (_u.esAdmin && !i.cerrada && i.estado != 'en_proceso')
            OutlinedButton(
              onPressed: () async {
                final ok = await intentar(ctx, () => Api.i.gestionarIncidencia(i.id, 'en_proceso', respuesta.text.trim()));
                if (ok && ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Poner en proceso'),
            ),
          if (_u.esAdmin && !i.cerrada)
            FilledButton(
              onPressed: () async {
                if (respuesta.text.trim().isEmpty) {
                  mostrarMensaje(ctx, 'Escribe qué se hizo para cerrar la incidencia');
                  return;
                }
                final ok = await intentar(ctx, () => Api.i.gestionarIncidencia(i.id, 'cerrada', respuesta.text.trim()));
                if (ok && ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Resolver'),
            ),
        ],
      ),
    );
    liberarCuando([respuesta]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final datos = _datos;
    // Lo pendiente: primero lo grave y, dentro de cada grupo, lo que lleva más tiempo esperando.
    final pendientes = (datos ?? []).where((i) => !i.cerrada).toList()
      ..sort((a, b) {
        final graves = (b.gravedad == 'alta' ? 1 : 0) - (a.gravedad == 'alta' ? 1 : 0);
        return graves != 0 ? graves : a.creadoEn.compareTo(b.creadoEn);
      });
    final cerradas = (datos ?? []).where((i) => i.cerrada).toList();
    final visibles = !_veTodas
        ? datos ?? []
        : _filtro == 'pendientes'
            ? pendientes
            : _filtro == 'cerradas'
                ? cerradas
                : [...pendientes, ...cerradas];
    return Scaffold(
      floatingActionButton: _puedeReportar ? FloatingActionButton.extended(onPressed: _reportar, icon: const Icon(Icons.report_problem_outlined), label: const Text('Reportar')) : null,
      body: datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: datos.isEmpty
                  ? ListView(children: [const SizedBox(height: 80), Aviso(_veTodas ? 'No hay incidencias reportadas.' : 'No has reportado incidencias.\nSi ves un daño en una zona común, repórtalo aquí.', icono: Icons.build_circle_outlined)])
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                      children: [
                        if (_veTodas) FiltroPendientes(elegido: _filtro, pendientes: pendientes.length, cerradas: cerradas.length, alElegir: (v) => setState(() => _filtro = v)),
                        if (visibles.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Text('No hay incidencias en este grupo.', textAlign: TextAlign.center)),
                        for (final i in visibles)
                          Card(
                            child: ListTile(
                              isThreeLine: true,
                              leading: Icon(Icons.warning_amber_rounded, color: _colorGravedad(i.gravedad, cs)),
                              title: Text(i.zona ?? 'Incidencia general'),
                              subtitle: Text('${i.descripcion}\n${_veTodas ? '${i.reportadoPor} · ' : ''}${_veTodas && !i.cerrada ? antiguedad(i.creadoEn) : fechaHoraBogota(i.creadoEn)}', maxLines: 3, overflow: TextOverflow.ellipsis),
                              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Etiqueta(_estadoTexto(i.estado), i.cerrada ? cs.outline : cs.primary),
                                const SizedBox(height: 4),
                                Etiqueta('Gravedad ${_gravedadTexto(i.gravedad).toLowerCase()}', _colorGravedad(i.gravedad, cs)),
                              ]),
                              onTap: () => _gestionar(i),
                            ),
                          ),
                      ],
                    ),
            ),
    );
  }
}
