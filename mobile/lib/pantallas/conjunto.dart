import 'package:flutter/material.dart';
import '../api.dart';
import '../modelos.dart';
import '../tiempo.dart';
import 'comun.dart';

// ===================================================================== comunicados
class ComunicadosPage extends StatefulWidget {
  final bool puedePublicar;
  const ComunicadosPage({super.key, required this.puedePublicar});

  @override
  State<ComunicadosPage> createState() => _ComunicadosState();
}

class _ComunicadosState extends State<ComunicadosPage> with RefrescoPeriodico {
  List<Comunicado>? _datos;
  String? _error;

  @override
  int get segundosRefresco => 30;

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
      final r = await Api.i.comunicados();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _publicar() async {
    final titulo = TextEditingController();
    final cuerpo = TextEditingController();
    var importante = false;
    final clave = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Nuevo comunicado'),
          content: SingleChildScrollView(
            child: Form(
              key: clave,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextFormField(controller: titulo, maxLength: 150, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Título'), validator: (v) => (v ?? '').trim().length < 3 ? 'El título es muy corto' : null),
                TextFormField(controller: cuerpo, minLines: 3, maxLines: 6, maxLength: 2000, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Contenido'), validator: (v) => (v ?? '').trim().length < 3 ? 'Escribe el contenido' : null),
                SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Marcar como importante'), value: importante, onChanged: (v) => setD(() => importante = v)),
                const Text('Todos los residentes y vigilantes recibirán una notificación.', style: TextStyle(fontSize: 12)),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!clave.currentState!.validate()) return;
                final ok = await intentar(ctx, () => Api.i.publicarComunicado(titulo.text.trim(), cuerpo.text.trim(), importante));
                if (ok && ctx.mounted) Navigator.pop(ctx);
                if (ok && mounted) mostrarMensaje(context, 'Comunicado publicado');
              },
              child: const Text('Publicar'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([titulo, cuerpo]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final datos = _datos;
    return Scaffold(
      floatingActionButton: widget.puedePublicar ? FloatingActionButton.extended(onPressed: _publicar, icon: const Icon(Icons.campaign), label: const Text('Publicar')) : null,
      body: datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: datos.isEmpty
                  ? ListView(children: const [SizedBox(height: 80), Aviso('No hay comunicados publicados.', icono: Icons.campaign_outlined)])
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                      children: [
                        for (final c in datos)
                          Card(
                            color: c.importante ? cs.errorContainer.withValues(alpha: 0.4) : null,
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Row(children: [
                                  if (c.importante) Padding(padding: const EdgeInsets.only(right: 6), child: Icon(Icons.priority_high, color: cs.error, size: 20)),
                                  Expanded(child: Text(c.titulo, style: Theme.of(context).textTheme.titleMedium)),
                                  if (widget.puedePublicar)
                                    IconButton(
                                      tooltip: 'Eliminar',
                                      icon: const Icon(Icons.delete_outline),
                                      onPressed: () async {
                                        final ok = await showDialog<bool>(
                                          context: context,
                                          builder: (ctx) => AlertDialog(
                                            title: const Text('Eliminar comunicado'),
                                            content: Text('¿Eliminar "${c.titulo}"?'),
                                            actions: [
                                              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
                                              FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Eliminar')),
                                            ],
                                          ),
                                        );
                                        if (ok == true && context.mounted) await intentar(context, () => Api.i.eliminarComunicado(c.id), exito: 'Comunicado eliminado');
                                      },
                                    ),
                                ]),
                                const SizedBox(height: 6),
                                Text(c.cuerpo),
                                const SizedBox(height: 8),
                                Text('${fechaHoraBogota(c.creadoEn)}${c.autor != null ? ' · ${c.autor}' : ''}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                              ]),
                            ),
                          ),
                      ],
                    ),
            ),
    );
  }
}

// ===================================================================== PQRS
String _tipoPqrs(String t) => switch (t) { 'peticion' => 'Petición', 'queja' => 'Queja', 'reclamo' => 'Reclamo', _ => 'Sugerencia' };

String _estadoPqrs(String e) => switch (e) { 'registrada' => 'Registrada', 'en_revision' => 'En revisión', 'en_proceso' => 'En proceso', 'cerrada' => 'Resuelta', _ => 'Cancelada' };

Color _colorPqrs(String e, ColorScheme cs) => switch (e) { 'registrada' => cs.tertiary, 'en_revision' || 'en_proceso' => cs.primary, _ => cs.outline };

class PqrsPage extends StatefulWidget {
  /// Administración: ve y responde todas. Residente: radica y sigue las suyas.
  final bool esAdmin;
  const PqrsPage({super.key, required this.esAdmin});

  @override
  State<PqrsPage> createState() => _PqrsState();
}

class _PqrsState extends State<PqrsPage> with RefrescoPeriodico {
  String _filtro = 'pendientes';
  List<Pqrs>? _datos;
  String? _error;

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
      final r = widget.esAdmin ? await Api.i.todasPqrs() : await Api.i.misPqrs();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _nueva() async {
    final asunto = TextEditingController();
    final descripcion = TextEditingController();
    var tipo = 'peticion';
    final clave = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Nueva solicitud'),
          content: SingleChildScrollView(
            child: Form(
              key: clave,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                DropdownButtonFormField<String>(
                  initialValue: tipo,
                  decoration: const InputDecoration(labelText: 'Tipo'),
                  items: [for (final t in const ['peticion', 'queja', 'reclamo', 'sugerencia']) DropdownMenuItem(value: t, child: Text(_tipoPqrs(t)))],
                  onChanged: (v) => setD(() => tipo = v ?? tipo),
                ),
                TextFormField(controller: asunto, maxLength: 150, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Asunto'), validator: (v) => (v ?? '').trim().length < 3 ? 'El asunto es muy corto' : null),
                TextFormField(controller: descripcion, minLines: 3, maxLines: 6, maxLength: 2000, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Descripción'), validator: (v) => (v ?? '').trim().length < 5 ? 'Describe tu solicitud' : null),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!clave.currentState!.validate()) return;
                final ok = await intentar(ctx, () => Api.i.crearPqrs(tipo, asunto.text.trim(), descripcion.text.trim()));
                if (ok && ctx.mounted) Navigator.pop(ctx);
                if (ok && mounted) mostrarMensaje(context, 'Solicitud enviada a la administración');
              },
              child: const Text('Enviar'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([asunto, descripcion]);
  }

  Future<void> _responder(Pqrs p) async {
    final respuesta = TextEditingController(text: p.respuesta ?? '');
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${_tipoPqrs(p.tipo)}: ${p.asunto}'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${p.usuario}${p.unidad != null ? ' · ${p.unidad}' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(p.descripcion),
            if (!p.cerrada) ...[
              const SizedBox(height: 12),
              TextField(controller: respuesta, minLines: 2, maxLines: 5, maxLength: 2000, decoration: const InputDecoration(labelText: 'Respuesta al residente')),
            ] else if (p.respuesta != null) ...[
              const SizedBox(height: 12),
              Text('Respuesta (${p.respondidoPor ?? 'administración'}):', style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(p.respuesta!),
            ],
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
          if (!p.cerrada && p.estado != 'en_proceso')
            OutlinedButton(
              onPressed: () async {
                final ok = await intentar(ctx, () => Api.i.responderPqrs(p.id, 'en_proceso', respuesta.text.trim()));
                if (ok && ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Poner en proceso'),
            ),
          if (!p.cerrada)
            FilledButton(
              onPressed: () async {
                if (respuesta.text.trim().isEmpty) {
                  mostrarMensaje(ctx, 'Escribe la respuesta para cerrar la solicitud');
                  return;
                }
                final ok = await intentar(ctx, () => Api.i.responderPqrs(p.id, 'cerrada', respuesta.text.trim()));
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
    // La administración ve primero lo pendiente, empezando por lo que lleva más tiempo esperando.
    final pendientes = (datos ?? []).where((p) => !p.cerrada).toList()..sort((a, b) => a.creadoEn.compareTo(b.creadoEn));
    final cerradas = (datos ?? []).where((p) => p.cerrada).toList();
    final visibles = !widget.esAdmin
        ? datos ?? []
        : _filtro == 'pendientes'
            ? pendientes
            : _filtro == 'cerradas'
                ? cerradas
                : [...pendientes, ...cerradas];
    return Scaffold(
      floatingActionButton: widget.esAdmin ? null : FloatingActionButton.extended(onPressed: _nueva, icon: const Icon(Icons.edit_note), label: const Text('Nueva solicitud')),
      body: datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: datos.isEmpty
                  ? ListView(children: [const SizedBox(height: 80), Aviso(widget.esAdmin ? 'No hay solicitudes de los residentes.' : 'No has enviado solicitudes.\nPuedes radicar peticiones, quejas, reclamos o sugerencias.', icono: Icons.forum_outlined)])
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                      children: [
                        if (widget.esAdmin) FiltroPendientes(elegido: _filtro, pendientes: pendientes.length, cerradas: cerradas.length, alElegir: (v) => setState(() => _filtro = v)),
                        if (visibles.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Text('No hay solicitudes en este grupo.', textAlign: TextAlign.center)),
                        for (final p in visibles)
                          Card(
                            color: widget.esAdmin && !p.cerrada && DateTime.now().difference(p.creadoEn).inDays >= diasParaResaltar ? cs.errorContainer.withValues(alpha: 0.4) : null,
                            child: ListTile(
                              isThreeLine: true,
                              title: Text(p.asunto),
                              subtitle: Text([
                                '${_tipoPqrs(p.tipo)} · ${widget.esAdmin && !p.cerrada ? antiguedad(p.creadoEn) : fechaHoraBogota(p.creadoEn)}',
                                if (widget.esAdmin) '${p.usuario}${p.unidad != null ? ' (${p.unidad})' : ''}',
                                if (!widget.esAdmin && p.respuesta != null) 'Respuesta: ${p.respuesta}',
                              ].join('\n'), maxLines: 3, overflow: TextOverflow.ellipsis),
                              trailing: Etiqueta(_estadoPqrs(p.estado), _colorPqrs(p.estado, cs)),
                              onTap: widget.esAdmin ? () => _responder(p) : () => _detalleResidente(p),
                            ),
                          ),
                      ],
                    ),
            ),
    );
  }

  void _detalleResidente(Pqrs p) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(p.asunto),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${_tipoPqrs(p.tipo)} · ${_estadoPqrs(p.estado)}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(p.descripcion),
            if (p.respuesta != null) ...[
              const SizedBox(height: 12),
              Text('Respuesta de ${p.respondidoPor ?? 'la administración'}:', style: const TextStyle(fontWeight: FontWeight.w600)),
              Text(p.respuesta!),
            ],
          ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar'))],
      ),
    );
  }
}
