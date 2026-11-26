import 'package:flutter/material.dart';
import '../api.dart';
import '../llamar.dart';
import '../navegacion.dart';
import '../push.dart';
import '../tema.dart';
import '../tiempo_real.dart';
import 'administracion.dart';
import 'chat.dart';
import 'comun.dart';
import 'conjunto.dart';
import 'directorio.dart';
import 'incidencias.dart';
import 'inicio_resumen.dart';
import 'minuta.dart';
import 'notificaciones.dart';
import 'paquetes.dart';
import 'perfil.dart';
import 'porton.dart';
import 'reservas.dart';
import 'visitas.dart';
import 'zonas.dart';

/// Una sección de la barra de navegación inferior.
class _Seccion {
  final String etiqueta;
  final IconData icono;
  final IconData iconoActivo;
  final Widget pagina;
  const _Seccion(this.etiqueta, this.icono, this.iconoActivo, this.pagina);
}

class InicioPage extends StatefulWidget {
  final VoidCallback onSalir;
  const InicioPage({super.key, required this.onSalir});

  @override
  State<InicioPage> createState() => _InicioPageState();
}

class _InicioPageState extends State<InicioPage> {
  int _tab = 0;
  late final List<_Seccion> _secciones;

  /// Las secciones se construyen la primera vez que se abren: así la app no lanza una decena de consultas al arrancar.
  final Set<int> _abiertas = {0};

  @override
  void initState() {
    super.initState();
    _secciones = _seccionesDe(Api.i.usuario!);
    destino.value = null;
    destino.addListener(_ir);
    CentroAvisos.i.iniciar();
    PushService.i.activar();
    // Si la app se abrió tocando una notificación, se va a esa pantalla.
    final pendiente = avisoPendientePorAbrir;
    if (pendiente != null) {
      avisoPendientePorAbrir = null;
      WidgetsBinding.instance.addPostFrameCallback((_) => abrirAviso(pendiente));
    }
  }

  @override
  void dispose() {
    destino.removeListener(_ir);
    CentroAvisos.i.detener();
    super.dispose();
  }

  void _ir() {
    final d = destino.value;
    if (d == null || !mounted) return;
    final i = _secciones.indexWhere((s) => s.etiqueta == d.seccion);
    if (i >= 0) _abrir(i);
  }

  void _abrir(int i) {
    setState(() {
      _tab = i;
      _abiertas.add(i);
    });
    CentroAvisos.i.chatVisible = _secciones[i].etiqueta == 'Chat';
  }

  /// Cada rol ve las secciones de su trabajo: el residente reserva, se anuncia y se comunica;
  /// el vigilante lleva la operación diaria (acceso, visitas, paquetes, reservas y minuta);
  /// la administración gestiona el conjunto (comunicados, PQRS, incidencias, usuarios, zonas y reportes).
  List<_Seccion> _seccionesDe(Usuario u) {
    if (u.esAdmin) {
      return const [
        _Seccion('Resumen', Icons.insights_outlined, Icons.insights, ResumenPage()),
        _Seccion('Conjunto', Icons.campaign_outlined, Icons.campaign, PestanasPage(seccion: 'Conjunto', pestanas: [
          ('Comunicados', Icons.campaign_outlined, ComunicadosPage(puedePublicar: true)),
          ('PQRS', Icons.forum_outlined, PqrsPage(esAdmin: true)),
          ('Incidencias', Icons.build_circle_outlined, IncidenciasPage()),
          ('Minuta', Icons.menu_book_outlined, MinutaPage()),
        ])),
        _Seccion('Usuarios', Icons.groups_outlined, Icons.groups, PestanasPage(seccion: 'Usuarios', pestanas: [
          ('Usuarios', Icons.people_outline, UsuariosPage()),
          ('Unidades', Icons.apartment, UnidadesPage()),
        ])),
        _Seccion('Zonas', Icons.pool_outlined, Icons.pool, ZonasPage()),
      ];
    }
    if (u.esVigilante) {
      return const [
        _Seccion('Inicio', Icons.home_outlined, Icons.home, InicioVigilantePage()),
        _Seccion('Portería', Icons.security_outlined, Icons.security, PestanasPage(seccion: 'Portería', pestanas: [
          ('Portón', Icons.garage_outlined, PortonPage(esPersonal: true, puedeAtender: true)),
          ('Visitas', Icons.qr_code_scanner, VisitasPorteriaPage()),
          ('Paquetes', Icons.inventory_2_outlined, PaquetesPage(esPersonal: true)),
          ('Ingresos', Icons.fact_check_outlined, RegistroIngresosPage()),
        ])),
        _Seccion('Zonas', Icons.pool_outlined, Icons.pool, PestanasPage(seccion: 'Zonas', pestanas: [
          ('Zonas', Icons.pool_outlined, ZonasPage()),
          ('Reservas', Icons.event_note_outlined, ReservasPage(todas: true)),
        ])),
        _Seccion('Chat', Icons.chat_bubble_outline, Icons.chat_bubble, PestanasPage(seccion: 'Chat', pestanas: [
          ('Conversaciones', Icons.forum_outlined, ChatPage()),
          ('Directorio', Icons.contact_phone_outlined, DirectorioPage()),
        ])),
        _Seccion('Novedades', Icons.menu_book_outlined, Icons.menu_book, PestanasPage(seccion: 'Novedades', pestanas: [
          ('Minuta', Icons.menu_book_outlined, MinutaPage()),
          ('Incidencias', Icons.build_circle_outlined, IncidenciasPage()),
          ('Comunicados', Icons.campaign_outlined, ComunicadosPage(puedePublicar: false)),
        ])),
      ];
    }
    return const [
      _Seccion('Inicio', Icons.home_outlined, Icons.home, InicioResidentePage()),
      _Seccion('Reservas', Icons.event_available_outlined, Icons.event_available, PestanasPage(seccion: 'Reservas', pestanas: [
        ('Zonas', Icons.pool_outlined, ZonasPage()),
        ('Mis reservas', Icons.event_note_outlined, ReservasPage(todas: false)),
      ])),
      _Seccion('Acceso', Icons.garage_outlined, Icons.garage, PestanasPage(seccion: 'Acceso', pestanas: [
        ('Portón', Icons.garage_outlined, PortonPage(esPersonal: false)),
        ('Visitas', Icons.qr_code_2, VisitasResidentePage()),
        ('Paquetes', Icons.inventory_2_outlined, PaquetesPage(esPersonal: false)),
      ])),
      _Seccion('Chat', Icons.chat_bubble_outline, Icons.chat_bubble, ChatPage()),
      _Seccion('Conjunto', Icons.campaign_outlined, Icons.campaign, PestanasPage(seccion: 'Conjunto', pestanas: [
        ('Comunicados', Icons.campaign_outlined, ComunicadosPage(puedePublicar: false)),
        ('PQRS', Icons.forum_outlined, PqrsPage(esAdmin: false)),
        ('Incidencias', Icons.build_circle_outlined, IncidenciasPage()),
      ])),
    ];
  }

  Future<void> _salir() async {
    await PushService.i.desactivar();
    widget.onSalir();
  }

  @override
  Widget build(BuildContext context) {
    final u = Api.i.usuario;
    if (u == null) return const SizedBox.shrink();
    final rol = u.esAdmin ? 'Administración' : u.esVigilante ? 'Vigilante' : (u.unidad ?? 'Residente');
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 14,
        title: Row(children: [
          const LunaLogo(tamano: 30),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(u.copropiedad, overflow: TextOverflow.ellipsis),
              Text(rol, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: cs.onSurfaceVariant)),
            ]),
          ),
        ]),
        actions: [
          if (!u.esPersonal) IconButton(tooltip: 'Llamar a portería', icon: const Icon(Icons.call_outlined), onPressed: () => llamarPorteria(context)),
          ValueListenableBuilder<int>(
            valueListenable: CentroAvisos.i.sinLeer,
            builder: (_, n, _) => IconButton(
              tooltip: 'Notificaciones',
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const NotificacionesPage())),
              icon: Badge(isLabelVisible: n > 0, label: Text(n > 99 ? '99+' : '$n'), child: const Icon(Icons.notifications_outlined)),
            ),
          ),
          IconButton(
            tooltip: 'Mi perfil',
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => PerfilPage(onSalir: _salir)));
              if (mounted) setState(() {});
            },
            icon: CircleAvatar(radius: 15, backgroundColor: cs.primaryContainer, foregroundColor: cs.onPrimaryContainer, child: Text(u.nombre.isEmpty ? '?' : u.nombre[0].toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: IndexedStack(index: _tab, children: [
        for (var i = 0; i < _secciones.length; i++) _abiertas.contains(i) ? _secciones[i].pagina : const SizedBox.shrink(),
      ]),
      bottomNavigationBar: ValueListenableBuilder<int>(
        valueListenable: CentroAvisos.i.chatSinLeer,
        builder: (_, chats, _) => NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) {
            destino.value = null; // al tocar la barra se conserva la pestaña donde estaba
            _abrir(i);
          },
          destinations: [
            for (final s in _secciones)
              NavigationDestination(
                icon: s.etiqueta == 'Chat' ? Badge(isLabelVisible: chats > 0, label: Text('$chats'), child: Icon(s.icono)) : Icon(s.icono),
                selectedIcon: Icon(s.iconoActivo),
                label: s.etiqueta,
              ),
          ],
        ),
      ),
    );
  }
}
