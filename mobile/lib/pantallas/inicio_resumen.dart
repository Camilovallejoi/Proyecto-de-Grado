import 'package:flutter/material.dart';
import '../api.dart';
import '../llamar.dart';
import '../modelos.dart';
import '../navegacion.dart';
import '../tiempo.dart';
import 'comun.dart';
import 'visitas.dart';

/// Saludo según la hora de Colombia.
String saludo([DateTime? ahora]) {
  final h = aBogota(ahora ?? DateTime.now()).hour;
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

List<Map<String, dynamic>> _lista(Map<String, dynamic> d, String clave) => ((d[clave] as List?) ?? []).cast<Map<String, dynamic>>();

String _hora(String iso) => fechaHoraBogota(DateTime.parse(iso));

/// Botón grande de acción rápida.
class AccionRapida extends StatelessWidget {
  final IconData icono;
  final String texto;
  final VoidCallback onTap;
  final int contador;
  const AccionRapida({super.key, required this.icono, required this.texto, required this.onTap, this.contador = 0});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: cs.surfaceContainerLow,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: cs.outlineVariant)),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 6),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Badge(
              isLabelVisible: contador > 0,
              label: Text('$contador'),
              child: CircleAvatar(radius: 24, backgroundColor: cs.primaryContainer, foregroundColor: cs.onPrimaryContainer, child: Icon(icono)),
            ),
            const SizedBox(height: 8),
            Text(texto, textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ]),
        ),
      ),
    );
  }
}

/// Cuadrícula de acciones: tres por fila, con la misma altura en cada fila.
class _Cuadricula extends StatelessWidget {
  final List<Widget> hijos;
  const _Cuadricula(this.hijos);

  @override
  Widget build(BuildContext context) => Column(children: [
        for (var i = 0; i < hijos.length; i += 3)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                for (var j = i; j < i + 3; j++) ...[
                  if (j > i) const SizedBox(width: 10),
                  Expanded(child: j < hijos.length ? hijos[j] : const SizedBox.shrink()),
                ],
              ]),
            ),
          ),
      ]);
}

class _Titulo extends StatelessWidget {
  final String texto;
  const _Titulo(this.texto);

  @override
  Widget build(BuildContext context) => Padding(padding: const EdgeInsets.fromLTRB(4, 14, 4, 6), child: Text(texto, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)));
}

/// Tarjeta de algo que requiere atención ahora.
class _Pendiente extends StatelessWidget {
  final IconData icono;
  final String titulo;
  final String detalle;
  final List<Widget> botones;
  final VoidCallback? onTap;
  const _Pendiente({required this.icono, required this.titulo, required this.detalle, this.botones = const [], this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      color: cs.tertiaryContainer.withValues(alpha: 0.45),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(icono, color: cs.tertiary),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(titulo, style: const TextStyle(fontWeight: FontWeight.w700)),
                  Text(detalle),
                ]),
              ),
            ]),
            if (botones.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Row(children: [
                  for (var i = 0; i < botones.length; i++) ...[if (i > 0) const SizedBox(width: 8), Expanded(child: botones[i])],
                ]),
              ),
          ]),
        ),
      ),
    );
  }
}

/// Base de las dos pantallas de inicio: consulta /inicio y se refresca sola.
abstract class _InicioBase<T extends StatefulWidget> extends State<T> with RefrescoPeriodico<T> {
  Map<String, dynamic>? datos;
  String? error;

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
      final r = await Api.i.inicio();
      if (mounted) setState(() { datos = r; error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e.mensaje);
    }
  }

  List<Widget> contenido(BuildContext context, Map<String, dynamic> d);

  @override
  Widget build(BuildContext context) {
    final d = datos;
    if (d == null) {
      return error != null ? Aviso(error!, icono: Icons.wifi_off) : const Center(child: CircularProgressIndicator());
    }
    final u = Api.i.usuario!;
    return RefreshIndicator(
      onRefresh: recargar,
      child: ListView(padding: const EdgeInsets.fromLTRB(14, 12, 14, 24), children: [
        Text('${saludo()}, ${u.nombre.split(' ').first}', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        Text(u.esVigilante ? 'Esto es lo que está pasando en portería.' : u.unidad ?? u.copropiedad, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        const SizedBox(height: 10),
        if (error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text('Sin conexión: se muestra la última información.', style: TextStyle(color: Theme.of(context).colorScheme.error))),
        ...contenido(context, d),
      ]),
    );
  }
}

// ===================================================================== residente
class InicioResidentePage extends StatefulWidget {
  const InicioResidentePage({super.key});

  @override
  State<InicioResidentePage> createState() => _InicioResidenteState();
}

class _InicioResidenteState extends _InicioBase<InicioResidentePage> {
  @override
  List<Widget> contenido(BuildContext context, Map<String, dynamic> d) {
    final cs = Theme.of(context).colorScheme;
    final solicitudes = _lista(d, 'solicitudes').map(Visita.fromJson).toList();
    final paquetes = _lista(d, 'paquetes').map(Paquete.fromJson).toList();
    final aviso = d['aviso_porton'] as Map<String, dynamic>?;
    final reserva = d['proxima_reserva'] as Map<String, dynamic>?;
    final comunicado = d['comunicado'] as Map<String, dynamic>?;
    return [
      // Lo urgente va primero.
      for (final v in solicitudes) SolicitudCard(visita: v),
      if (aviso != null)
        _Pendiente(
          icono: Icons.garage_outlined,
          titulo: 'Esperando que abran el portón',
          detalle: 'Portería ya recibió tu aviso.',
          botones: [
            OutlinedButton(onPressed: () => intentar(context, () => Api.i.cancelarAviso(aviso['id'] as int), exito: 'Aviso cancelado'), child: const Text('Cancelar')),
            const BotonLlamarPorteria(texto: 'Llamar'),
          ],
        ),
      for (final p in paquetes)
        _Pendiente(
          icono: p.tipo == 'domicilio' ? Icons.delivery_dining : Icons.inventory_2_outlined,
          titulo: '${p.tipo == 'domicilio' ? 'Tu domicilio está en portería' : p.tipo == 'correspondencia' ? 'Tienes correspondencia' : 'Tienes un paquete'}${p.descripcion != null ? ' · ${p.descripcion}' : ''}',
          detalle: p.vieneEnCamino ? 'Ya avisaste que vas en camino.' : 'Llegó ${fechaHoraBogota(p.recibidoEn)}',
          onTap: () => irA('Acceso', 'Paquetes'),
          botones: p.vieneEnCamino
              ? const []
              : [FilledButton.icon(onPressed: () => intentar(context, () => Api.i.voyPorPaquete(p.id), exito: 'Portería ya sabe que vas en camino'), icon: const Icon(Icons.directions_walk), label: const Text('Ya voy'))],
        ),
      const _Titulo('¿Qué necesitas?'),
      _Cuadricula([
        AccionRapida(icono: Icons.call, texto: 'Llamar a portería', onTap: () => llamarPorteria(context)),
        AccionRapida(icono: Icons.directions_car, texto: 'Voy llegando', onTap: () => irA('Acceso', 'Portón')),
        AccionRapida(icono: Icons.qr_code_2, texto: 'Autorizar visita', contador: d['visitas_autorizadas'] as int? ?? 0, onTap: () => irA('Acceso', 'Visitas')),
        AccionRapida(icono: Icons.event_available, texto: 'Reservar zona', onTap: () => irA('Reservas', 'Zonas')),
        AccionRapida(icono: Icons.chat_bubble_outline, texto: 'Escribir a portería', onTap: () => irA('Chat')),
        AccionRapida(icono: Icons.report_problem_outlined, texto: 'Reportar un daño', contador: d['incidencias_abiertas'] as int? ?? 0, onTap: () => irA('Conjunto', 'Incidencias')),
      ]),
      const _Titulo('Tu próxima reserva'),
      Card(
        child: ListTile(
          leading: Icon(Icons.event_note, color: cs.primary),
          title: Text(reserva == null ? 'No tienes reservas próximas' : reserva['zona'] as String),
          subtitle: Text(reserva == null ? 'Toca para ver las zonas disponibles.' : _hora(reserva['inicio'] as String)),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => irA('Reservas', reserva == null ? 'Zonas' : 'Mis reservas'),
        ),
      ),
      if (comunicado != null) ...[
        const _Titulo('Del conjunto'),
        Card(
          color: comunicado['importante'] == true ? cs.errorContainer.withValues(alpha: 0.4) : null,
          child: ListTile(
            leading: const Icon(Icons.campaign_outlined),
            title: Text(comunicado['titulo'] as String),
            subtitle: Text(comunicado['cuerpo'] as String, maxLines: 2, overflow: TextOverflow.ellipsis),
            onTap: () => irA('Conjunto', 'Comunicados'),
          ),
        ),
      ],
    ];
  }
}

// ===================================================================== vigilante
class InicioVigilantePage extends StatefulWidget {
  const InicioVigilantePage({super.key});

  @override
  State<InicioVigilantePage> createState() => _InicioVigilanteState();
}

class _InicioVigilanteState extends _InicioBase<InicioVigilantePage> {
  Widget _contador(BuildContext context, String valor, String texto, VoidCallback onTap) => Expanded(
        child: Card(
          child: InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
              child: Column(children: [
                Text(valor, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                Text(texto, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
              ]),
            ),
          ),
        ),
      );

  @override
  List<Widget> contenido(BuildContext context, Map<String, dynamic> d) {
    final cs = Theme.of(context).colorScheme;
    final avisos = _lista(d, 'avisos');
    final solicitudes = _lista(d, 'solicitudes').map(Visita.fromJson).toList();
    final porIngresar = _lista(d, 'por_ingresar').map(Visita.fromJson).toList();
    final enCamino = _lista(d, 'en_camino').map(Paquete.fromJson).toList();
    final reservas = _lista(d, 'reservas_hoy');
    final masDeUnDia = d['dentro_mas_de_un_dia'] as int? ?? 0;
    final nada = avisos.isEmpty && solicitudes.isEmpty && porIngresar.isEmpty && enCamino.isEmpty;
    return [
      Row(children: [
        _contador(context, '${d['dentro']}', 'visitantes dentro', () => irA('Portería', 'Visitas')),
        _contador(context, '${d['paquetes_por_recoger']}', 'paquetes por entregar', () => irA('Portería', 'Paquetes')),
        _contador(context, '${d['chats_sin_leer']}', 'chats sin leer', () => irA('Chat', 'Conversaciones')),
      ]),
      const _Titulo('Por atender ahora'),
      if (nada) Card(child: ListTile(leading: Icon(Icons.check_circle_outline, color: cs.tertiary), title: const Text('Todo al día'), subtitle: const Text('No hay avisos ni visitas esperando.'))),
      for (final a in avisos)
        _Pendiente(
          icono: Icons.garage_outlined,
          titulo: 'Abrir portón: ${a['unidad']}',
          detalle: '${a['usuario']} llega en ${a['tipo_vehiculo']}${a['placa'] != null ? ' · placa ${a['placa']}' : ''}',
          botones: [FilledButton.icon(onPressed: () => intentar(context, () => Api.i.atenderAviso(a['id'] as int), exito: 'Portón abierto'), icon: const Icon(Icons.lock_open), label: const Text('Ya abrí el portón'))],
        ),
      for (final v in enCamino.map((p) => p))
        _Pendiente(
          icono: Icons.directions_walk,
          titulo: 'Ya bajan: ${v.unidad}',
          detalle: 'Van por ${v.tipo == 'domicilio' ? 'el domicilio' : v.tipo == 'correspondencia' ? 'la correspondencia' : 'el paquete'}${v.descripcion != null ? ' (${v.descripcion})' : ''}.',
          onTap: () => irA('Portería', 'Paquetes'),
          botones: [FilledButton.tonal(onPressed: () => intentar(context, () => Api.i.entregarPaquete(v.id), exito: 'Entrega registrada'), child: const Text('Entregado'))],
        ),
      for (final v in solicitudes)
        _Pendiente(
          icono: Icons.hourglass_top,
          titulo: '${v.nombre} espera respuesta',
          detalle: '${v.residente ?? 'El residente'} (${v.unidad}) tiene hasta ${fechaHoraBogota(v.validaHasta)}.',
          botones: [OutlinedButton.icon(onPressed: () => llamarResidente(context, v.residenteTelefono, v.residente), icon: const Icon(Icons.call_outlined), label: const Text('Llamar al residente'))],
        ),
      for (final v in porIngresar)
        _Pendiente(
          icono: Icons.how_to_reg,
          titulo: '${v.nombre} puede ingresar',
          detalle: 'Autorizado por ${v.residente ?? 'el residente'} · ${v.unidad} · código ${v.codigo}',
          onTap: () => irA('Portería', 'Visitas'),
          botones: [FilledButton.tonal(onPressed: () => intentar(context, () => Api.i.entradaVisita(v.id), exito: 'Entrada registrada'), child: const Text('Registrar entrada'))],
        ),
      if (masDeUnDia > 0)
        Card(
          color: cs.errorContainer.withValues(alpha: 0.5),
          child: ListTile(
            leading: Icon(Icons.timelapse, color: cs.error),
            title: Text('$masDeUnDia visitante(s) llevan más de un día dentro'),
            subtitle: const Text('Revisa si falta registrar su salida.'),
            onTap: () => irA('Portería', 'Visitas'),
          ),
        ),
      const _Titulo('Acciones rápidas'),
      _Cuadricula([
        AccionRapida(icono: Icons.qr_code_scanner, texto: 'Validar código', onTap: () => irA('Portería', 'Visitas')),
        AccionRapida(icono: Icons.person_add_alt_1, texto: 'Visitante sin aviso', onTap: () => irA('Portería', 'Visitas')),
        AccionRapida(icono: Icons.add_box_outlined, texto: 'Registrar paquete', onTap: () => irA('Portería', 'Paquetes')),
        AccionRapida(icono: Icons.contact_phone_outlined, texto: 'Directorio', onTap: () => irA('Chat', 'Directorio')),
        AccionRapida(icono: Icons.menu_book_outlined, texto: 'Anotar en minuta', onTap: () => irA('Novedades', 'Minuta')),
        AccionRapida(icono: Icons.event_note, texto: 'Reservas', onTap: () => irA('Zonas', 'Reservas')),
      ]),
      const _Titulo('Reservas de hoy'),
      if (reservas.isEmpty)
        const Card(child: ListTile(leading: Icon(Icons.event_busy), title: Text('No hay reservas para hoy')))
      else
        for (final r in reservas)
          Card(
            child: ListTile(
              leading: Icon(Icons.event_available, color: cs.tertiary),
              title: Text('${r['zona']} · ${r['unidad']}'),
              subtitle: Text('${_hora(r['inicio'] as String)} · ${r['usuario']}'),
              onTap: () => irA('Zonas', 'Reservas'),
            ),
          ),
    ];
  }
}
