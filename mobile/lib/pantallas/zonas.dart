import 'package:flutter/material.dart';
import '../api.dart';
import 'reservar.dart';
import 'zona_form.dart';

class ZonasPage extends StatefulWidget {
  const ZonasPage({super.key});

  @override
  State<ZonasPage> createState() => _ZonasPageState();
}

class _ZonasPageState extends State<ZonasPage> {
  late Future<List<Zona>> _zonas;

  @override
  void initState() {
    super.initState();
    _zonas = Api.i.zonas();
    Api.i.cambios.addListener(_recargar);
  }

  @override
  void dispose() {
    Api.i.cambios.removeListener(_recargar);
    super.dispose();
  }

  void _recargar() => setState(() => _zonas = Api.i.zonas());

  void _aviso(String texto) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));

  Future<void> _cambiarMantenimiento(Zona z) async {
    final nuevo = z.estado == 'mantenimiento' ? 'activa' : 'mantenimiento';
    try {
      await Api.i.editarZona(z.id, {'estado': nuevo});
      _aviso(nuevo == 'mantenimiento' ? '${z.nombre} está ahora en mantenimiento' : '${z.nombre} está activa de nuevo');
    } on ApiError catch (e) {
      _aviso(e.mensaje);
    }
  }

  Future<void> _eliminar(Zona z) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Eliminar zona'),
        content: Text('¿Eliminar "${z.nombre}"? Los residentes dejarán de verla. El historial de reservas se conserva.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Eliminar')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.i.eliminarZona(z.id);
      _aviso('Zona eliminada');
    } on ApiError catch (e) {
      _aviso(e.mensaje);
    }
  }

  IconData _icono(String nombre) {
    final n = nombre.toLowerCase();
    if (n.contains('piscina')) return Icons.pool;
    if (n.contains('bbq')) return Icons.outdoor_grill;
    if (n.contains('cancha')) return Icons.sports_soccer;
    if (n.contains('gim')) return Icons.fitness_center;
    if (n.contains('sal')) return Icons.celebration;
    return Icons.place;
  }

  @override
  Widget build(BuildContext context) {
    final esAdmin = Api.i.usuario!.esAdmin;
    return Scaffold(
      floatingActionButton: esAdmin
          ? FloatingActionButton.extended(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ZonaFormPage())),
              icon: const Icon(Icons.add),
              label: const Text('Nueva zona'),
            )
          : null,
      body: FutureBuilder<List<Zona>>(
        future: _zonas,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text('${snap.error}', textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: _recargar, child: const Text('Reintentar')),
                ]),
              ),
            );
          }
          final zonas = snap.data!;
          if (zonas.isEmpty) return const Center(child: Text('Aún no hay zonas comunes registradas.'));
          return RefreshIndicator(
            onRefresh: () async => _recargar(),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
              itemCount: zonas.length,
              itemBuilder: (context, i) {
                final z = zonas[i];
                final reservable = z.estado == 'activa';
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(backgroundColor: Theme.of(context).colorScheme.primaryContainer, foregroundColor: Theme.of(context).colorScheme.onPrimaryContainer, child: Icon(_icono(z.nombre))),
                    title: Text(z.nombre),
                    subtitle: Text([
                      '${z.horaApertura} - ${z.horaCierre}',
                      if (z.aforo != null) 'Aforo ${z.aforo}',
                      if (!reservable) 'En ${z.estado}',
                      'Máx. ${z.regla.duracionMaximaMin} min',
                    ].join(' · ')),
                    trailing: esAdmin
                        ? PopupMenuButton<String>(
                            tooltip: 'Opciones',
                            onSelected: (v) {
                              if (v == 'editar') Navigator.push(context, MaterialPageRoute(builder: (_) => ZonaFormPage(zona: z)));
                              if (v == 'mantenimiento') _cambiarMantenimiento(z);
                              if (v == 'eliminar') _eliminar(z);
                            },
                            itemBuilder: (_) => [
                              const PopupMenuItem(value: 'editar', child: ListTile(leading: Icon(Icons.edit), title: Text('Editar'))),
                              PopupMenuItem(
                                value: 'mantenimiento',
                                child: ListTile(
                                  leading: Icon(z.estado == 'mantenimiento' ? Icons.check_circle : Icons.build),
                                  title: Text(z.estado == 'mantenimiento' ? 'Reactivar zona' : 'Poner en mantenimiento'),
                                ),
                              ),
                              const PopupMenuItem(value: 'eliminar', child: ListTile(leading: Icon(Icons.delete), title: Text('Eliminar'))),
                            ],
                          )
                        : (reservable ? const Icon(Icons.chevron_right) : null),
                    enabled: esAdmin || reservable,
                    onTap: reservable ? () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReservarPage(zona: z))) : null,
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
