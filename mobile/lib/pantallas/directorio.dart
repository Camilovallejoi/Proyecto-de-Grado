import 'package:flutter/material.dart';
import '../api.dart';
import '../llamar.dart';
import '../modelos.dart';
import 'chat.dart';
import 'comun.dart';

/// Directorio de portería: busca a un residente para llamarlo o escribirle. Solo para el vigilante.
class DirectorioPage extends StatefulWidget {
  const DirectorioPage({super.key});

  @override
  State<DirectorioPage> createState() => _DirectorioState();
}

class _DirectorioState extends State<DirectorioPage> with RefrescoPeriodico {
  List<Contacto>? _datos;
  String? _error;
  String _busqueda = '';

  @override
  int get segundosRefresco => 60;

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
      final r = await Api.i.directorio();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) {
    final datos = _datos;
    if (datos == null) return _error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator());
    final q = _busqueda.trim().toLowerCase();
    final lista = datos.where((c) => q.isEmpty || c.nombre.toLowerCase().contains(q) || (c.unidad ?? '').toLowerCase().contains(q)).toList();
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: TextField(onChanged: (v) => setState(() => _busqueda = v), decoration: const InputDecoration(labelText: 'Buscar por nombre o apartamento', prefixIcon: Icon(Icons.search))),
      ),
      Expanded(
        child: lista.isEmpty
            ? const Aviso('No hay residentes que coincidan.', icono: Icons.person_search)
            : ListView(padding: const EdgeInsets.all(12), children: [
                for (final c in lista)
                  Card(
                    child: ListTile(
                      leading: CircleAvatar(child: Text(c.nombre.isEmpty ? '?' : c.nombre[0].toUpperCase())),
                      title: Text(c.nombre),
                      subtitle: Text('${c.unidad ?? 'Sin unidad'}${c.telefono == null ? ' · sin teléfono compartido' : ' · ${c.telefono}'}'),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(
                          tooltip: 'Escribir',
                          icon: const Icon(Icons.chat_bubble_outline),
                          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ConversacionResidentePage(hilo: Hilo(residenteId: c.id, nombre: c.nombre, unidad: c.unidad, telefono: c.telefono)))),
                        ),
                        IconButton.filledTonal(tooltip: 'Llamar', icon: const Icon(Icons.call), onPressed: c.telefono == null ? null : () => llamarResidente(context, c.telefono, c.nombre)),
                      ]),
                    ),
                  ),
              ]),
      ),
    ]);
  }
}
