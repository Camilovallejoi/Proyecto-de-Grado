import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../llamar.dart';
import '../tiempo_real.dart';
import '../modelos.dart';
import '../tiempo.dart';
import 'comun.dart';

/// Conversación en vivo: pide al servidor solo los mensajes nuevos cada 3 segundos mientras está visible.
class ConversacionPage extends StatefulWidget {
  final Future<List<Mensaje>> Function(int desde) cargar;
  final Future<Mensaje> Function(String texto) enviar;
  final String vacio;
  const ConversacionPage({super.key, required this.cargar, required this.enviar, this.vacio = 'Aún no hay mensajes. ¡Escribe el primero!'});

  @override
  State<ConversacionPage> createState() => _ConversacionState();
}

class _ConversacionState extends State<ConversacionPage> {
  final List<Mensaje> _mensajes = [];
  int _desde = 0; // último id recibido del servidor (los propios enviados no cuentan)
  bool _visible = true;
  final _texto = TextEditingController();
  final _scroll = ScrollController();
  Timer? _reloj;
  String? _error;
  bool _cargado = false;
  bool _enviando = false;
  bool _consultando = false;

  @override
  void initState() {
    super.initState();
    _traer();
    _reloj = Timer.periodic(const Duration(seconds: 3), (_) {
      if (mounted && _visible) _traer();
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visible = TickerMode.valuesOf(context).enabled;
    if (visible && !_visible) _traer();
    _visible = visible;
  }

  @override
  void dispose() {
    _reloj?.cancel();
    _texto.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _agregar(Iterable<Mensaje> nuevos) {
    for (final m in nuevos) {
      if (!_mensajes.any((x) => x.id == m.id)) _mensajes.add(m);
    }
    _mensajes.sort((x, y) => x.id.compareTo(y.id));
  }

  Future<void> _traer() async {
    if (_consultando) return;
    _consultando = true;
    try {
      final nuevos = await widget.cargar(_desde);
      if (!mounted) return;
      final primera = !_cargado;
      final hayNuevos = nuevos.any((m) => !_mensajes.any((x) => x.id == m.id));
      setState(() {
        _cargado = true;
        _error = null;
        if (nuevos.isNotEmpty) _desde = nuevos.last.id;
        _agregar(nuevos);
      });
      if (hayNuevos || primera) _alFinal();
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      _consultando = false;
    }
  }

  void _alFinal() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    });
  }

  Future<void> _enviar() async {
    final t = _texto.text.trim();
    if (t.isEmpty || _enviando) return;
    setState(() => _enviando = true);
    try {
      final m = await widget.enviar(t);
      _texto.clear();
      // El mensaje propio aparece de inmediato, sin esperar a la siguiente consulta.
      if (mounted) setState(() => _agregar([m]));
      _alFinal();
    } on ApiError catch (e) {
      if (mounted) mostrarMensaje(context, e.mensaje);
    } finally {
      if (mounted) setState(() => _enviando = false);
    }
  }

  String _rol(String rol) => switch (rol) { 'vigilante' => 'Vigilante', 'administrador' => 'Administración', _ => '' };

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final yo = Api.i.usuario?.id; // puede ser nulo mientras se cierra por una sesión vencida
    return Column(children: [
      Expanded(
        child: !_cargado
            ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
            : _mensajes.isEmpty
                ? Aviso(widget.vacio, icono: Icons.chat_bubble_outline)
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(12),
                    itemCount: _mensajes.length,
                    itemBuilder: (_, i) {
                      final m = _mensajes[i];
                      final mio = m.autorId == yo;
                      final etiqueta = _rol(m.rol);
                      return Align(
                        alignment: mio ? Alignment.centerRight : Alignment.centerLeft,
                        child: Container(
                          constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
                          margin: const EdgeInsets.symmetric(vertical: 3),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: mio ? cs.primaryContainer : cs.surfaceContainerHighest,
                            borderRadius: BorderRadius.only(
                              topLeft: const Radius.circular(14),
                              topRight: const Radius.circular(14),
                              bottomLeft: Radius.circular(mio ? 14 : 3),
                              bottomRight: Radius.circular(mio ? 3 : 14),
                            ),
                          ),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            if (!mio)
                              Text(etiqueta.isEmpty ? m.autor : '${m.autor} · $etiqueta', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: cs.primary)),
                            Text(m.cuerpo),
                            const SizedBox(height: 2),
                            Align(alignment: Alignment.bottomRight, child: Text(hhmm(aBogota(m.creadoEn).hour * 60 + aBogota(m.creadoEn).minute), style: TextStyle(fontSize: 10, color: cs.onSurfaceVariant))),
                          ]),
                        ),
                      );
                    },
                  ),
      ),
      SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 8, 8),
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _texto,
                minLines: 1,
                maxLines: 4,
                maxLength: 1000,
                textCapitalization: TextCapitalization.sentences,
                onSubmitted: (_) => _enviar(),
                decoration: const InputDecoration(hintText: 'Escribe un mensaje', counterText: '', contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10)),
              ),
            ),
            const SizedBox(width: 4),
            IconButton.filled(
              onPressed: _enviando ? null : _enviar,
              icon: _enviando ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.send),
            ),
          ]),
        ),
      ),
    ]);
  }
}

/// Pantalla con la conversación de un residente (la abre el vigilante desde la lista o el directorio).
class ConversacionResidentePage extends StatefulWidget {
  final Hilo hilo;
  const ConversacionResidentePage({super.key, required this.hilo});

  @override
  State<ConversacionResidentePage> createState() => _ConversacionResidenteState();
}

class _ConversacionResidenteState extends State<ConversacionResidentePage> {
  @override
  void initState() {
    super.initState();
    CentroAvisos.i.conversacionAbierta = widget.hilo.residenteId; // sin avisos de lo que se está leyendo
  }

  @override
  void dispose() {
    CentroAvisos.i.conversacionAbierta = null;
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hilo = widget.hilo;
    final id = '${hilo.residenteId}';
    return Scaffold(
      appBar: AppBar(
        title: Text('${hilo.nombre}${hilo.unidad != null ? ' · ${hilo.unidad}' : ''}'),
        actions: [
          IconButton(tooltip: 'Llamar al residente', icon: const Icon(Icons.call_outlined), onPressed: () => llamarResidente(context, hilo.telefono, hilo.nombre)),
        ],
      ),
      body: ConversacionPage(
        cargar: (d) => Api.i.mensajesPorteria(id, desde: d),
        enviar: (t) => Api.i.enviarPorteria(id, t),
        vacio: 'Aún no hay mensajes con este residente.',
      ),
    );
  }
}

/// Lista de residentes con su último mensaje: el personal abre la conversación que necesite.
class HilosPage extends StatefulWidget {
  const HilosPage({super.key});

  @override
  State<HilosPage> createState() => _HilosState();
}

class _HilosState extends State<HilosPage> with RefrescoPeriodico {
  List<Hilo>? _datos;
  String? _error;

  @override
  int get segundosRefresco => 5;

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
      final r = await Api.i.hilosPorteria();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) {
    final datos = _datos;
    if (datos == null) return _error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator());
    if (datos.isEmpty) return const Aviso('No hay residentes registrados.', icono: Icons.people_outline);
    return RefreshIndicator(
      onRefresh: recargar,
      child: ListView(children: [
        for (final h in datos)
          ListTile(
            leading: CircleAvatar(child: Text(h.nombre.isEmpty ? '?' : h.nombre[0].toUpperCase())),
            title: Text(h.nombre, style: TextStyle(fontWeight: h.sinLeer ? FontWeight.w800 : FontWeight.w500)),
            subtitle: Text(h.ultimo ?? 'Sin mensajes', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontWeight: h.sinLeer ? FontWeight.w700 : FontWeight.w400)),
            tileColor: h.sinLeer ? Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.5) : null,
            trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
              if (h.unidad != null) Text(h.unidad!, style: Theme.of(context).textTheme.labelSmall),
              if (h.ultimoEn != null) Text(fechaHoraBogota(h.ultimoEn!), style: Theme.of(context).textTheme.labelSmall),
            ]),
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ConversacionResidentePage(hilo: h))),
          ),
      ]),
    );
  }
}

/// Chat con portería: el residente conversa con el vigilante; el personal ve la lista de residentes.
class ChatPage extends StatelessWidget {
  const ChatPage({super.key});

  @override
  Widget build(BuildContext context) {
    if (Api.i.usuario!.esPersonal) return const HilosPage();
    final cs = Theme.of(context).colorScheme;
    return Column(children: [
      Material(
        color: cs.surfaceContainerLow,
        child: ListTile(
          leading: Icon(Icons.security_outlined, color: cs.primary),
          title: const Text('Chat con portería'),
          subtitle: const Text('Solo tú y el vigilante ven esta conversación.'),
          trailing: IconButton.filledTonal(tooltip: 'Llamar a portería', icon: const Icon(Icons.call), onPressed: () => llamarPorteria(context)),
        ),
      ),
      Expanded(
        child: ConversacionPage(
          cargar: (d) => Api.i.mensajesPorteria('mi', desde: d),
          enviar: (t) => Api.i.enviarPorteria('mi', t),
          vacio: 'Escribe a portería: el vigilante te responderá por aquí.',
        ),
      ),
    ]);
  }
}
