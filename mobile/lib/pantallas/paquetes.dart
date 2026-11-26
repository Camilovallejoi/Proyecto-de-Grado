import 'package:flutter/material.dart';
import '../api.dart';
import '../modelos.dart';
import '../tiempo.dart';
import 'comun.dart';

IconData _icono(String tipo) => switch (tipo) { 'domicilio' => Icons.delivery_dining, 'correspondencia' => Icons.mail_outline, _ => Icons.inventory_2_outlined };

String _texto(String tipo) => switch (tipo) { 'domicilio' => 'Domicilio', 'correspondencia' => 'Correspondencia', _ => 'Paquete' };

/// Lista de paquetes. Residente: los de su unidad. Vigilante o administración: los de todo el conjunto.
/// Solo el vigilante registra y entrega.
class PaquetesPage extends StatefulWidget {
  final bool esPersonal;
  const PaquetesPage({super.key, required this.esPersonal});

  @override
  State<PaquetesPage> createState() => _PaquetesState();
}

class _PaquetesState extends State<PaquetesPage> with RefrescoPeriodico {
  List<Paquete>? _datos;
  String? _error;

  bool get _puedeOperar => Api.i.usuario!.esVigilante;

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
      final r = widget.esPersonal ? await Api.i.paquetesPorteria() : await Api.i.misPaquetes();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _registrar() async {
    List<UnidadItem> unidades;
    try {
      unidades = await Api.i.unidadesParaVisita();
    } on ApiError catch (e) {
      if (mounted) mostrarMensaje(context, e.mensaje);
      return;
    }
    if (!mounted || unidades.isEmpty) return;
    final descripcion = TextEditingController();
    var unidad = unidades.first.id;
    var tipo = 'paquete';
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Registrar llegada'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<int>(
                initialValue: unidad,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Unidad destinataria'),
                items: [for (final u in unidades) DropdownMenuItem(value: u.id, child: Text(u.nombre))],
                onChanged: (v) => setD(() => unidad = v ?? unidad),
              ),
              const SizedBox(height: 12),
              Opciones(
                opciones: const [('paquete', 'Paquete', Icons.inventory_2_outlined), ('domicilio', 'Domicilio', Icons.delivery_dining), ('correspondencia', 'Carta', Icons.mail_outline)],
                elegida: tipo,
                alElegir: (v) => setD(() => tipo = v),
              ),
              TextField(controller: descripcion, maxLength: 150, decoration: const InputDecoration(labelText: 'Detalle (opcional)', hintText: 'Rappi, Servientrega, caja mediana…')),
              const Text('Se avisa a los residentes de la unidad.', style: TextStyle(fontSize: 12)),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                final ok = await intentar(ctx, () => Api.i.registrarPaquete(unidadId: unidad, tipo: tipo, descripcion: descripcion.text.trim()));
                if (ok && ctx.mounted) Navigator.pop(ctx);
                if (ok && mounted) mostrarMensaje(context, 'Registrado y avisado a la unidad');
              },
              child: const Text('Registrar'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([descripcion]);
  }

  Future<void> _entregar(Paquete p) async {
    final quien = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Entregar ${_texto(p.tipo).toLowerCase()} a ${p.unidad}'),
        content: TextField(controller: quien, maxLength: 120, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Recibió (opcional)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Entregar')),
        ],
      ),
    );
    final nombre = quien.text.trim();
    liberarCuando([quien]);
    if (ok == true && mounted) await intentar(context, () => Api.i.entregarPaquete(p.id, entregadoA: nombre), exito: 'Entrega registrada');
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final datos = _datos;
    return Scaffold(
      floatingActionButton: _puedeOperar ? FloatingActionButton.extended(onPressed: _registrar, icon: const Icon(Icons.add_box_outlined), label: const Text('Registrar llegada')) : null,
      body: datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: datos.isEmpty
                  ? ListView(children: [const SizedBox(height: 80), Aviso(widget.esPersonal ? 'No hay paquetes registrados.' : 'No tienes paquetes ni domicilios en portería.', icono: Icons.inventory_2_outlined)])
                  : ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                      children: [
                        for (final p in datos)
                          Card(
                            color: !p.porRecoger ? null : widget.esPersonal && p.vieneEnCamino ? cs.primaryContainer : cs.tertiaryContainer.withValues(alpha: 0.35),
                            child: ListTile(
                              leading: Icon(_icono(p.tipo)),
                              title: Text('${_texto(p.tipo)}${p.descripcion != null ? ' · ${p.descripcion}' : ''}'),
                              subtitle: Text([
                                if (widget.esPersonal) p.unidad,
                                if (widget.esPersonal && p.vieneEnCamino) '¡Ya vienen a recogerlo!',
                                'Llegó ${fechaHoraBogota(p.recibidoEn)}',
                                if (!p.porRecoger && p.entregadoEn != null) 'Entregado ${fechaHoraBogota(p.entregadoEn!)}${p.entregadoA != null ? ' a ${p.entregadoA}' : ''}',
                              ].join(' · ')),
                              isThreeLine: !p.porRecoger,
                              trailing: !p.porRecoger
                                  ? Etiqueta('Entregado', cs.outline)
                                  : _puedeOperar
                                      ? FilledButton(onPressed: () => _entregar(p), child: const Text('Entregar'))
                                      : widget.esPersonal
                                          ? Etiqueta('Por recoger', cs.tertiary)
                                          : p.vieneEnCamino
                                              ? Etiqueta('Vas en camino', cs.primary)
                                              : FilledButton.tonal(
                                                  onPressed: () => intentar(context, () => Api.i.voyPorPaquete(p.id), exito: 'Portería ya sabe que vas en camino'),
                                                  child: const Text('Ya voy'),
                                                ),
                            ),
                          ),
                      ],
                    ),
            ),
    );
  }
}
