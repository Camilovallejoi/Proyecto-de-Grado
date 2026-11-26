import 'dart:async';
import 'package:flutter/material.dart';
import '../api.dart';
import '../navegacion.dart';

/// Recarga una pantalla cada cierto tiempo mientras está visible, y cuando cambian los datos de la app.
/// Las pantallas ocultas por la barra de navegación (IndexedStack) no consultan al servidor.
mixin RefrescoPeriodico<T extends StatefulWidget> on State<T> {
  Timer? _reloj;
  bool _visible = true;

  int get segundosRefresco => 10;

  Future<void> recargar();

  /// Se entera de si la pantalla está visible desde el ciclo de construcción (no desde el temporizador)
  /// y, al volver a mostrarse, recarga de inmediato.
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final visible = TickerMode.valuesOf(context).enabled;
    if (visible && !_visible) recargar();
    _visible = visible;
  }

  void iniciarRefresco() {
    recargar();
    Api.i.cambios.addListener(_alCambiar);
    _reloj = Timer.periodic(Duration(seconds: segundosRefresco), (_) {
      if (mounted && _visible) recargar();
    });
  }

  void detenerRefresco() {
    _reloj?.cancel();
    Api.i.cambios.removeListener(_alCambiar);
  }

  void _alCambiar() {
    if (mounted) recargar();
  }
}

/// Barra de pestañas superior con el contenido de cada una. Si recibe [seccion], atiende la navegación
/// que piden los avisos y las acciones rápidas (por ejemplo, ir a "Acceso / Visitas").
class PestanasPage extends StatelessWidget {
  final List<(String, IconData, Widget)> pestanas;
  final String? seccion;
  const PestanasPage({super.key, required this.pestanas, this.seccion});

  int _indiceDe(Destino? d) => d == null || d.seccion != seccion ? -1 : pestanas.indexWhere((p) => p.$1 == d.pestana);

  @override
  Widget build(BuildContext context) {
    if (pestanas.length == 1) return pestanas.first.$3;
    final inicial = _indiceDe(destino.value);
    return DefaultTabController(
      length: pestanas.length,
      initialIndex: inicial < 0 ? 0 : inicial,
      child: _SigueDestino(
        indiceDe: _indiceDe,
        child: Column(children: [
          TabBar(
            isScrollable: pestanas.length > 3,
            tabAlignment: pestanas.length > 3 ? TabAlignment.start : null,
            tabs: [for (final p in pestanas) Tab(icon: Icon(p.$2), text: p.$1, iconMargin: const EdgeInsets.only(bottom: 2))],
          ),
          Expanded(child: TabBarView(children: [for (final p in pestanas) p.$3])),
        ]),
      ),
    );
  }
}

class _SigueDestino extends StatefulWidget {
  final int Function(Destino?) indiceDe;
  final Widget child;
  const _SigueDestino({required this.indiceDe, required this.child});

  @override
  State<_SigueDestino> createState() => _SigueDestinoState();
}

class _SigueDestinoState extends State<_SigueDestino> {
  TabController? _controlador;

  @override
  void initState() {
    super.initState();
    destino.addListener(_ir);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _controlador = DefaultTabController.of(context);
  }

  @override
  void dispose() {
    destino.removeListener(_ir);
    super.dispose();
  }

  void _ir() {
    final i = widget.indiceDe(destino.value);
    if (i >= 0 && mounted) _controlador?.animateTo(i);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Mensaje centrado para listas vacías o errores.
class Aviso extends StatelessWidget {
  final String texto;
  final IconData? icono;
  const Aviso(this.texto, {super.key, this.icono});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            if (icono != null) Icon(icono, size: 40, color: Theme.of(context).colorScheme.outline),
            if (icono != null) const SizedBox(height: 8),
            Text(texto, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          ]),
        ),
      );
}

/// Insignia de color para estados.
class Etiqueta extends StatelessWidget {
  final String texto;
  final Color color;
  const Etiqueta(this.texto, this.color, {super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(20)),
        child: Text(texto, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
      );
}

void mostrarMensaje(BuildContext context, String texto) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(texto)));
}

/// Ejecuta una acción de la API y muestra el error si falla. Devuelve true si salió bien.
Future<bool> intentar(BuildContext context, Future<void> Function() accion, {String? exito}) async {
  try {
    await accion();
    if (exito != null && context.mounted) mostrarMensaje(context, exito);
    return true;
  } on ApiError catch (e) {
    if (context.mounted) mostrarMensaje(context, e.mensaje);
    return false;
  }
}

/// Libera los controladores de un formulario emergente cuando el cuadro ya terminó de cerrarse.
/// Si se liberan en cuanto el cuadro se cierra, la animación de cierre todavía los usa y Flutter
/// lanza errores en cadena (por ejemplo "TextEditingController was used after being disposed").
void liberarCuando(Iterable<ChangeNotifier> controladores) {
  Future<void>.delayed(const Duration(seconds: 1), () {
    for (final c in controladores) {
      c.dispose();
    }
  });
}

/// Selector de una opción en fichas que se acomodan en varias filas (cabe en cualquier ancho de teléfono).
class Opciones extends StatelessWidget {
  final List<(String, String, IconData)> opciones;
  final String elegida;
  final ValueChanged<String> alElegir;
  const Opciones({super.key, required this.opciones, required this.elegida, required this.alElegir});

  @override
  Widget build(BuildContext context) => Wrap(spacing: 8, runSpacing: 4, children: [
        for (final o in opciones)
          ChoiceChip(showCheckmark: false, avatar: Icon(o.$3, size: 18), label: Text(o.$2), selected: elegida == o.$1, onSelected: (_) => alElegir(o.$1)),
      ]);
}

/// Filtro de solicitudes por estado, con cuántas hay en cada grupo.
class FiltroPendientes extends StatelessWidget {
  final String elegido; // pendientes | cerradas | todas
  final int pendientes;
  final int cerradas;
  final ValueChanged<String> alElegir;
  const FiltroPendientes({super.key, required this.elegido, required this.pendientes, required this.cerradas, required this.alElegir});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Wrap(spacing: 8, children: [
          for (final o in [('pendientes', 'Pendientes $pendientes'), ('cerradas', 'Resueltas $cerradas'), ('todas', 'Todas ${pendientes + cerradas}')])
            ChoiceChip(label: Text(o.$2), selected: elegido == o.$1, onSelected: (_) => alElegir(o.$1)),
        ]),
      );
}

/// Días a partir de los cuales un pendiente se resalta para que no se quede olvidado.
const diasParaResaltar = 5;

/// "Abierta hoy", "Abierta hace 3 días"…
String antiguedad(DateTime desde, [DateTime? ahora]) {
  final dias = (ahora ?? DateTime.now()).difference(desde).inDays;
  return dias <= 0 ? 'Abierta hoy' : dias == 1 ? 'Abierta hace 1 día' : 'Abierta hace $dias días';
}
