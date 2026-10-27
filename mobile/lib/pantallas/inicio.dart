import 'package:flutter/material.dart';
import '../api.dart';
import '../tema.dart';
import 'reservas.dart';
import 'zonas.dart';

class InicioPage extends StatefulWidget {
  final VoidCallback onSalir;
  const InicioPage({super.key, required this.onSalir});

  @override
  State<InicioPage> createState() => _InicioPageState();
}

class _InicioPageState extends State<InicioPage> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final u = Api.i.usuario!;
    final paginas = [
      const ZonasPage(),
      ReservasPage(todas: u.esAdmin),
    ];
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(children: [
          const LunaLogo(tamano: 30),
          const SizedBox(width: 10),
          Flexible(child: Text(u.copropiedad, overflow: TextOverflow.ellipsis)),
        ]),
        actions: [
          Center(child: Text(u.esAdmin ? 'Administrador' : (u.unidad ?? 'Residente'), style: Theme.of(context).textTheme.labelMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant))),
          const BotonTema(),
          IconButton(tooltip: 'Cerrar sesión', icon: const Icon(Icons.logout), onPressed: widget.onSalir),
        ],
      ),
      body: IndexedStack(index: _tab, children: paginas),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.pool_outlined), selectedIcon: Icon(Icons.pool), label: 'Zonas'),
          NavigationDestination(icon: const Icon(Icons.event_note_outlined), selectedIcon: const Icon(Icons.event_note), label: u.esAdmin ? 'Reservas' : 'Mis reservas'),
        ],
      ),
    );
  }
}
