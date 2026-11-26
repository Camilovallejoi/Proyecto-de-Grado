import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../api.dart';
import '../llamar.dart';
import '../modelos.dart';
import '../tiempo.dart';
import 'comun.dart';

Color _colorEstado(String estado, ColorScheme cs) => switch (estado) {
      'solicitada' => cs.tertiary,
      'autorizada' => cs.tertiary,
      'dentro' => cs.primary,
      'finalizada' => cs.outline,
      'cancelada' => cs.outline,
      'sin_respuesta' => cs.outline,
      _ => cs.error,
    };

String _textoEstado(String estado) => switch (estado) {
      'solicitada' => 'Esperando respuesta',
      'autorizada' => 'Autorizada',
      'dentro' => 'Dentro',
      'finalizada' => 'Salió',
      'cancelada' => 'Cancelada',
      'rechazada' => 'Rechazada',
      'sin_respuesta' => 'Sin respuesta',
      _ => 'Vencida',
    };

/// Muestra el código de una visita como QR para que el residente se lo comparta al visitante.
Future<void> mostrarQr(BuildContext context, Visita v) {
  return showDialog<void>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(v.nombre),
      content: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.all(12),
          // Tamaño fijo: el QR usa un LayoutBuilder, que no puede medirse dentro de un AlertDialog.
          child: SizedBox(width: 200, height: 200, child: QrImageView(data: v.codigo, size: 200, backgroundColor: Colors.white)),
        ),
        const SizedBox(height: 12),
        SelectableText(v.codigo, style: Theme.of(context).textTheme.headlineMedium?.copyWith(letterSpacing: 4, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text('Válida hasta ${fechaHoraBogota(v.validaHasta)}', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 8),
        const Text('Entrega este código o QR a tu visitante: lo mostrará en portería.', textAlign: TextAlign.center),
      ]),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar'))],
    ),
  );
}

// ===================================================================== residente
class VisitasResidentePage extends StatefulWidget {
  const VisitasResidentePage({super.key});

  @override
  State<VisitasResidentePage> createState() => _VisitasResidenteState();
}

class _VisitasResidenteState extends State<VisitasResidentePage> with RefrescoPeriodico {
  List<Visita>? _datos;
  String? _error;

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
      final r = await Api.i.misVisitas();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _nueva() async {
    final nombre = TextEditingController();
    final documento = TextEditingController();
    final placa = TextEditingController();
    var horas = 12;
    final clave = GlobalKey<FormState>();
    final creada = await showDialog<Visita>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Autorizar visitante'),
          content: SingleChildScrollView(
            child: Form(
              key: clave,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextFormField(
                  controller: nombre,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Nombre del visitante'),
                  validator: (v) => (v ?? '').trim().length < 2 ? 'Escribe el nombre' : null,
                ),
                TextFormField(controller: documento, decoration: const InputDecoration(labelText: 'Documento (opcional)')),
                TextFormField(
                  controller: placa,
                  textCapitalization: TextCapitalization.characters,
                  maxLength: 7,
                  decoration: const InputDecoration(labelText: 'Placa (opcional)'),
                ),
                DropdownButtonFormField<int>(
                  initialValue: horas,
                  decoration: const InputDecoration(labelText: 'Vigencia'),
                  items: const [
                    DropdownMenuItem(value: 2, child: Text('2 horas')),
                    DropdownMenuItem(value: 6, child: Text('6 horas')),
                    DropdownMenuItem(value: 12, child: Text('12 horas')),
                    DropdownMenuItem(value: 24, child: Text('1 día')),
                    DropdownMenuItem(value: 72, child: Text('3 días')),
                  ],
                  onChanged: (v) => setD(() => horas = v ?? 12),
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!clave.currentState!.validate()) return;
                try {
                  final v = await Api.i.autorizarVisita(nombre: nombre.text.trim(), documento: documento.text.trim(), placa: placa.text.trim(), horas: horas);
                  if (ctx.mounted) Navigator.pop(ctx, v);
                } on ApiError catch (e) {
                  if (ctx.mounted) mostrarMensaje(ctx, e.mensaje);
                }
              },
              child: const Text('Autorizar'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([nombre, documento, placa]);
    if (creada != null && mounted) await mostrarQr(context, creada);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: _nueva, icon: const Icon(Icons.qr_code_2), label: const Text('Autorizar visitante')),
      body: _datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: _datos!.isEmpty
                  ? ListView(children: const [SizedBox(height: 80), Aviso('Aún no has autorizado visitantes.\nToca el botón para generar un código QR.', icono: Icons.qr_code_2)])
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                      children: [
                        for (final v in _datos!)
                          if (v.solicitada)
                            SolicitudCard(visita: v)
                          else
                          Card(
                            child: ListTile(
                              leading: Icon(v.autorizada ? Icons.qr_code_2 : Icons.person_outline),
                              title: Text(v.nombre),
                              subtitle: Text([
                                if (v.autorizada) 'Hasta ${fechaHoraBogota(v.validaHasta)}' else if (v.entradaEn != null) 'Entró ${fechaHoraBogota(v.entradaEn!)}',
                                if (v.placa != null) 'placa ${v.placa}',
                              ].join(' · ')),
                              trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Etiqueta(_textoEstado(v.estado), _colorEstado(v.estado, cs)),
                                if (v.autorizada) Text(v.codigo, style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                              ]),
                              onTap: v.autorizada ? () => mostrarQr(context, v) : null,
                              onLongPress: v.autorizada
                                  ? () async {
                                      final ok = await showDialog<bool>(
                                        context: context,
                                        builder: (ctx) => AlertDialog(
                                          title: const Text('Cancelar autorización'),
                                          content: Text('¿Cancelar el acceso de ${v.nombre}? Su código dejará de servir.'),
                                          actions: [
                                            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('No')),
                                            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cancelar acceso')),
                                          ],
                                        ),
                                      );
                                      if (ok == true && context.mounted) await intentar(context, () => Api.i.cancelarVisita(v.id), exito: 'Autorización cancelada');
                                    }
                                  : null,
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.all(8),
                          child: Text('Toca una visita autorizada para ver su QR; mantén pulsada para cancelarla.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                        ),
                      ],
                    ),
            ),
    );
  }
}

// ===================================================================== portería
class VisitasPorteriaPage extends StatefulWidget {
  const VisitasPorteriaPage({super.key});

  @override
  State<VisitasPorteriaPage> createState() => _VisitasPorteriaState();
}

class _VisitasPorteriaState extends State<VisitasPorteriaPage> with RefrescoPeriodico {
  List<Visita>? _datos;
  String? _error;
  final _codigo = TextEditingController();

  @override
  void initState() {
    super.initState();
    iniciarRefresco();
  }

  @override
  void dispose() {
    detenerRefresco();
    _codigo.dispose();
    super.dispose();
  }

  @override
  Future<void> recargar() async {
    try {
      final r = await Api.i.visitasPorteria();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _validar() async {
    final texto = _codigo.text.trim();
    if (texto.isEmpty) return;
    try {
      final v = await Api.i.visitaPorCodigo(texto);
      if (!mounted) return;
      _codigo.clear();
      await _detalle(v);
    } on ApiError catch (e) {
      if (mounted) mostrarMensaje(context, e.mensaje);
    }
  }

  Future<void> _detalle(Visita v) async {
    final cs = Theme.of(context).colorScheme;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(v.nombre),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Etiqueta(_textoEstado(v.estado), _colorEstado(v.estado, cs)),
          const SizedBox(height: 8),
          Text('Visita a: ${v.unidad}${v.residente != null ? ' (${v.residente})' : ''}'),
          if (v.documento != null) Text('Documento: ${v.documento}'),
          if (v.placa != null) Text('Placa: ${v.placa}'),
          Text(v.autorizada ? 'Válida hasta ${fechaHoraBogota(v.validaHasta)}' : v.entradaEn != null ? 'Entró ${fechaHoraBogota(v.entradaEn!)}' : ''),
          if (v.solicitada)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text('Esperando que ${v.residente ?? 'el residente'} responda (hasta ${fechaHoraBogota(v.validaHasta)}). No puede ingresar todavía.', style: const TextStyle(fontWeight: FontWeight.w600)))
          else if (!v.autorizada && !v.dentro)
            const Padding(padding: EdgeInsets.only(top: 8), child: Text('Esta visita no puede ingresar.', style: TextStyle(fontWeight: FontWeight.w600))),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cerrar')),
          if (v.solicitada || v.estado == 'sin_respuesta')
            OutlinedButton.icon(onPressed: () => llamarResidente(ctx, v.residenteTelefono, v.residente), icon: const Icon(Icons.call_outlined), label: const Text('Llamar al residente')),
          if (v.autorizada)
            FilledButton.icon(
              onPressed: () async {
                Navigator.pop(ctx);
                await intentar(context, () => Api.i.entradaVisita(v.id), exito: 'Entrada registrada: ${v.nombre}');
              },
              icon: const Icon(Icons.login),
              label: const Text('Registrar entrada'),
            ),
          if (v.dentro)
            FilledButton.icon(
              onPressed: () async {
                Navigator.pop(ctx);
                await intentar(context, () => Api.i.salidaVisita(v.id), exito: 'Salida registrada: ${v.nombre}');
              },
              icon: const Icon(Icons.logout),
              label: const Text('Registrar salida'),
            ),
        ],
      ),
    );
  }

  /// Llega alguien sin aviso: el vigilante elige a qué residente visita y le pide autorización.
  Future<void> _sinAutorizacion() async {
    List<ResidenteItem> residentes;
    try {
      residentes = await Api.i.residentesParaVisita();
    } on ApiError catch (e) {
      if (mounted) mostrarMensaje(context, e.mensaje);
      return;
    }
    if (!mounted) return;
    if (residentes.isEmpty) {
      mostrarMensaje(context, 'No hay residentes registrados.');
      return;
    }
    final nombre = TextEditingController();
    final documento = TextEditingController();
    final placa = TextEditingController();
    var residente = residentes.first.id;
    final clave = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Visitante sin autorización'),
          content: SingleChildScrollView(
            child: Form(
              key: clave,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                DropdownButtonFormField<int>(
                  initialValue: residente,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Residente al que visita'),
                  items: [for (final r in residentes) DropdownMenuItem(value: r.id, child: Text('${r.nombre} · ${r.unidad}', overflow: TextOverflow.ellipsis))],
                  onChanged: (v) => setD(() => residente = v ?? residente),
                ),
                TextFormField(
                  controller: nombre,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Nombre del visitante'),
                  validator: (v) => (v ?? '').trim().length < 2 ? 'Escribe el nombre' : null,
                ),
                TextFormField(controller: documento, decoration: const InputDecoration(labelText: 'Documento (opcional)')),
                TextFormField(controller: placa, textCapitalization: TextCapitalization.characters, maxLength: 7, decoration: const InputDecoration(labelText: 'Placa (opcional)')),
                const Text('El visitante no entra hasta que ese residente lo autorice. Tiene 10 minutos para responder.', style: TextStyle(fontSize: 12)),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!clave.currentState!.validate()) return;
                try {
                  await Api.i.solicitarVisita(residenteId: residente, nombre: nombre.text.trim(), documento: documento.text.trim(), placa: placa.text.trim());
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (mounted) mostrarMensaje(context, 'Autorización solicitada: esperando respuesta del residente');
                } on ApiError catch (e) {
                  if (ctx.mounted) mostrarMensaje(ctx, e.mensaje);
                }
              },
              child: const Text('Pedir autorización'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([nombre, documento, placa]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final datos = _datos;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: _sinAutorizacion, icon: const Icon(Icons.person_add_alt_1), label: const Text('Sin aviso')),
      body: datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                children: [
                  Row(children: [
                    Expanded(
                      child: TextField(
                        controller: _codigo,
                        textCapitalization: TextCapitalization.characters,
                        onSubmitted: (_) => _validar(),
                        decoration: const InputDecoration(labelText: 'Código del visitante', prefixIcon: Icon(Icons.qr_code_scanner)),
                      ),
                    ),
                    const SizedBox(width: 8),
                    FilledButton(onPressed: _validar, child: const Text('Validar')),
                  ]),
                  const SizedBox(height: 16),
                  Text('Por atender (${datos.length})', style: Theme.of(context).textTheme.titleSmall),
                  if (datos.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('No hay visitas autorizadas ni visitantes dentro.', textAlign: TextAlign.center)),
                  for (final v in datos)
                    Card(
                      child: ListTile(
                        leading: Icon(v.dentro ? Icons.how_to_reg : Icons.qr_code_2),
                        title: Text('${v.nombre} · ${v.unidad}'),
                        subtitle: Text([
                          v.dentro
                              ? 'Dentro desde ${fechaHoraBogota(v.entradaEn!)}'
                              : v.solicitada
                                  ? 'Esperando a ${v.residente ?? 'el residente'} hasta ${fechaHoraBogota(v.validaHasta)}'
                                  : v.autorizada
                                      ? 'Autorizada hasta ${fechaHoraBogota(v.validaHasta)}'
                                      : v.estado == 'sin_respuesta'
                                          ? '${v.residente ?? 'El residente'} no respondió: llámalo'
                                          : '${v.residente ?? 'El residente'} no autorizó el ingreso',
                          if (v.placa != null) 'placa ${v.placa}',
                          if (v.autorizada) 'código ${v.codigo}',
                        ].join(' · ')),
                        trailing: v.solicitada || v.estado == 'sin_respuesta'
                            ? IconButton.filledTonal(tooltip: 'Llamar al residente', icon: const Icon(Icons.call), onPressed: () => llamarResidente(context, v.residenteTelefono, v.residente))
                            : Etiqueta(_textoEstado(v.estado), _colorEstado(v.estado, cs)),
                        onTap: () => _detalle(v),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

// ===================================================================== registro de ingresos
class RegistroIngresosPage extends StatefulWidget {
  const RegistroIngresosPage({super.key});

  @override
  State<RegistroIngresosPage> createState() => _RegistroState();
}

class _RegistroState extends State<RegistroIngresosPage> with RefrescoPeriodico {
  List<Visita>? _datos;
  String? _error;
  int _dias = 7;

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
      final r = await Api.i.registroIngresos(dias: _dias);
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final datos = _datos;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Row(children: [
          Expanded(
            child: Wrap(spacing: 8, children: [
              for (final d in const [1, 7, 30])
                ChoiceChip(
                  label: Text(d == 1 ? 'Hoy' : '$d días'),
                  selected: _dias == d,
                  onSelected: (_) {
                    setState(() { _dias = d; _datos = null; });
                    recargar();
                  },
                ),
            ]),
          ),
          if (datos != null) Text('${datos.length} ingresos', style: Theme.of(context).textTheme.labelMedium),
        ]),
      ),
      Expanded(
        child: datos == null
            ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
            : RefreshIndicator(
                onRefresh: recargar,
                child: datos.isEmpty
                    ? ListView(children: const [SizedBox(height: 80), Aviso('No hay ingresos registrados en este periodo.', icono: Icons.fact_check_outlined)])
                    : ListView(
                        padding: const EdgeInsets.all(16),
                        children: [
                          for (final v in datos)
                            Card(
                              child: ListTile(
                                leading: Icon(v.origen == 'porteria' ? Icons.person_add_alt_1 : Icons.qr_code_2),
                                title: Text('${v.nombre} → ${v.unidad}'),
                                subtitle: Text([
                                  'Entró ${fechaHoraBogota(v.entradaEn!)}',
                                  v.salidaEn != null ? 'salió ${fechaHoraBogota(v.salidaEn!)}' : 'sigue dentro',
                                  if (v.placa != null) 'placa ${v.placa}',
                                  if (v.recibidoPor != null) 'recibió ${v.recibidoPor}',
                                ].join(' · ')),
                                isThreeLine: true,
                                trailing: Etiqueta(_textoEstado(v.estado), _colorEstado(v.estado, cs)),
                              ),
                            ),
                        ],
                      ),
              ),
      ),
    ]);
  }
}

/// Visitante que espera en portería: solo el residente al que visita puede autorizarlo o rechazarlo.
class SolicitudCard extends StatelessWidget {
  final Visita visita;
  const SolicitudCard({super.key, required this.visita});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      color: cs.tertiaryContainer.withValues(alpha: 0.45),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.notifications_active, color: cs.tertiary),
            const SizedBox(width: 8),
            Expanded(child: Text('${visita.nombre} está en portería', style: Theme.of(context).textTheme.titleMedium)),
          ]),
          const SizedBox(height: 4),
          Text([
            'Quiere visitarte',
            if (visita.documento != null) 'documento ${visita.documento}',
            if (visita.placa != null) 'placa ${visita.placa}',
          ].join(' · ')),
          Text('Responde antes de ${fechaHoraBogota(visita.validaHasta)}', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: () => intentar(context, () => Api.i.responderVisita(visita.id, autorizar: true), exito: 'Visita autorizada: ya puede ingresar'),
                icon: const Icon(Icons.check),
                label: const Text('Autorizar'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => intentar(context, () => Api.i.responderVisita(visita.id, autorizar: false), exito: 'Visita rechazada'),
                icon: const Icon(Icons.close),
                label: const Text('Rechazar'),
              ),
            ),
          ]),
        ]),
      ),
    );
  }
}
