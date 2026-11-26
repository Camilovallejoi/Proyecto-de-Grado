import 'package:flutter/material.dart';
import '../api.dart';
import '../modelos.dart';
import '../tiempo.dart';
import 'comun.dart';

IconData _icono(String tipo) => switch (tipo) { 'ronda' => Icons.directions_walk, 'alerta' => Icons.warning_amber_rounded, _ => Icons.edit_note };

String _texto(String tipo) => switch (tipo) { 'ronda' => 'Ronda', 'alerta' => 'Alerta', _ => 'Novedad' };

/// Minuta digital: las novedades del turno del vigilante, con fecha y hora. La administración solo la lee.
class MinutaPage extends StatefulWidget {
  const MinutaPage({super.key});

  @override
  State<MinutaPage> createState() => _MinutaState();
}

class _MinutaState extends State<MinutaPage> with RefrescoPeriodico {
  List<Anotacion>? _datos;
  String? _error;
  int _dias = 3;

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
      final r = await Api.i.minuta(dias: _dias);
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _anotar() async {
    final texto = TextEditingController();
    final clave = GlobalKey<FormState>();
    var tipo = 'novedad';
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Nueva anotación'),
          content: SingleChildScrollView(
            child: Form(
              key: clave,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Opciones(
                  opciones: const [('novedad', 'Novedad', Icons.edit_note), ('ronda', 'Ronda', Icons.directions_walk), ('alerta', 'Alerta', Icons.warning_amber_rounded)],
                  elegida: tipo,
                  alElegir: (v) => setD(() => tipo = v),
                ),
                if (tipo == 'alerta') const Padding(padding: EdgeInsets.only(top: 6), child: Text('La administración recibirá la alerta al instante.', style: TextStyle(fontSize: 12))),
                TextFormField(
                  controller: texto,
                  autofocus: true,
                  minLines: 3,
                  maxLines: 6,
                  maxLength: 1000,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(labelText: 'Descripción'),
                  validator: (v) => (v ?? '').trim().length < 3 ? 'Describe la novedad' : null,
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!clave.currentState!.validate()) return;
                final ok = await intentar(ctx, () => Api.i.anotarMinuta(tipo, texto.text.trim()));
                if (ok && ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([texto]);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final datos = _datos;
    return Scaffold(
      floatingActionButton: Api.i.usuario!.esVigilante ? FloatingActionButton.extended(onPressed: _anotar, icon: const Icon(Icons.edit_note), label: const Text('Anotar')) : null,
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Wrap(spacing: 8, children: [
            for (final d in const [1, 3, 7, 30])
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
        Expanded(
          child: datos == null
              ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
              : RefreshIndicator(
                  onRefresh: recargar,
                  child: datos.isEmpty
                      ? ListView(children: const [SizedBox(height: 80), Aviso('Sin anotaciones en este periodo.', icono: Icons.menu_book_outlined)])
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 90),
                          children: [
                            for (final a in datos)
                              Card(
                                child: ListTile(
                                  isThreeLine: true,
                                  leading: Icon(_icono(a.tipo), color: a.tipo == 'alerta' ? cs.error : null),
                                  title: Text(a.descripcion),
                                  subtitle: Text('${_texto(a.tipo)} · ${fechaHoraBogota(a.creadoEn)}${a.autor != null ? ' · ${a.autor}' : ''}'),
                                ),
                              ),
                          ],
                        ),
                ),
        ),
      ]),
    );
  }
}
