import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../api.dart';
import '../navegacion.dart';
import '../modelos.dart';
import 'comun.dart';

// ===================================================================== usuarios
class UsuariosPage extends StatefulWidget {
  const UsuariosPage({super.key});

  @override
  State<UsuariosPage> createState() => _UsuariosState();
}

class _UsuariosState extends State<UsuariosPage> with RefrescoPeriodico {
  List<UsuarioFila>? _datos;
  String? _error;

  @override
  int get segundosRefresco => 30;

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
      final r = await Api.i.usuarios();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _agregar() async {
    final tipo = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.person_add_alt_1), title: const Text('Nuevo residente'), subtitle: const Text('Queda asignado a un apartamento o casa'), onTap: () => Navigator.pop(ctx, 'residente')),
          ListTile(leading: const Icon(Icons.security), title: const Text('Nuevo vigilante'), subtitle: const Text('Opera la portería del conjunto'), onTap: () => Navigator.pop(ctx, 'vigilante')),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (!mounted) return;
    if (tipo == 'residente') await _nuevoResidente();
    if (tipo == 'vigilante') await _nuevoVigilante();
  }

  Future<void> _nuevoResidente() async {
    List<UnidadItem> unidades;
    try {
      unidades = await Api.i.unidades();
    } on ApiError catch (e) {
      if (mounted) mostrarMensaje(context, e.mensaje);
      return;
    }
    if (!mounted) return;
    if (unidades.isEmpty) {
      mostrarMensaje(context, 'Primero crea el apartamento o la casa en la pestaña Unidades.');
      return;
    }
    final nombre = TextEditingController();
    final correo = TextEditingController();
    final clave = TextEditingController();
    final form = GlobalKey<FormState>();
    int? unidad; // sin valor inicial: la unidad se elige a propósito
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Nuevo residente'),
          content: SingleChildScrollView(
            child: Form(
              key: form,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                DropdownButtonFormField<int>(
                  initialValue: unidad,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Unidad (apartamento o casa)', helperText: 'Si no aparece, créala en Unidades'),
                  items: [for (final u in unidades) DropdownMenuItem(value: u.id, child: Text(u.nombre, overflow: TextOverflow.ellipsis))],
                  onChanged: (v) => setD(() => unidad = v),
                  validator: (v) => v == null ? 'Elige la unidad' : null,
                ),
                TextFormField(controller: nombre, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nombre'), validator: (v) => (v ?? '').trim().length < 3 ? 'El nombre es muy corto' : null),
                TextFormField(controller: correo, keyboardType: TextInputType.emailAddress, autocorrect: false, decoration: const InputDecoration(labelText: 'Correo'), validator: (v) => (v ?? '').contains('@') ? null : 'Correo inválido'),
                TextFormField(controller: clave, decoration: const InputDecoration(labelText: 'Contraseña temporal (mínimo 8)'), validator: (v) => (v ?? '').length < 8 ? 'Mínimo 8 caracteres' : null),
                const SizedBox(height: 8),
                const Text('Entrega esta contraseña al residente: la app le pedirá cambiarla al entrar. El teléfono lo agrega cada residente en su perfil, con su autorización.', style: TextStyle(fontSize: 12)),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                if (!form.currentState!.validate()) return;
                final ok = await intentar(ctx, () => Api.i.crearResidente(nombre: nombre.text.trim(), correo: correo.text.trim(), password: clave.text, unidadId: unidad!));
                if (ok && ctx.mounted) Navigator.pop(ctx);
                if (ok && mounted) mostrarMensaje(context, 'Residente agregado');
              },
              child: const Text('Agregar'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([nombre, correo, clave]);
  }

  Future<void> _nuevoVigilante() async {
    final nombre = TextEditingController();
    final correo = TextEditingController();
    final clave = TextEditingController();
    final form = GlobalKey<FormState>();
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nuevo vigilante'),
        content: SingleChildScrollView(
          child: Form(
            key: form,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextFormField(controller: nombre, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nombre'), validator: (v) => (v ?? '').trim().length < 3 ? 'El nombre es muy corto' : null),
              TextFormField(controller: correo, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Correo'), validator: (v) => (v ?? '').contains('@') ? null : 'Correo inválido'),
              TextFormField(controller: clave, decoration: const InputDecoration(labelText: 'Contraseña temporal (mínimo 8)'), validator: (v) => (v ?? '').length < 8 ? 'Mínimo 8 caracteres' : null),
              const SizedBox(height: 6),
              const Text('El vigilante controla el acceso, las visitas, los paquetes, las zonas y las reservas. La app le pedirá cambiar la contraseña al entrar.', style: TextStyle(fontSize: 12)),
            ]),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (!form.currentState!.validate()) return;
              final ok = await intentar(ctx, () => Api.i.crearVigilante(nombre.text.trim(), correo.text.trim(), clave.text));
              if (ok && ctx.mounted) Navigator.pop(ctx);
              if (ok && mounted) mostrarMensaje(context, 'Vigilante creado');
            },
            child: const Text('Crear'),
          ),
        ],
      ),
    );
    liberarCuando([nombre, correo, clave]);
  }

  String _rol(String r) => switch (r) { 'administrador' => 'Administración', 'vigilante' => 'Vigilante', _ => 'Residente' };

  /// Restablece la contraseña de quien la olvidó. Antes hay que confirmar que es esa persona.
  Future<void> _restablecer(UsuarioFila u) async {
    var confirmado = false;
    final seguir = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Restablecer contraseña'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${u.nombre}${u.unidad != null ? ' · ${u.unidad}' : ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              const Text('Se creará una contraseña temporal. La anterior dejará de servir, se cerrarán sus sesiones y deberá crear una nueva al entrar. No pierde sus reservas ni sus datos.'),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: confirmado,
                onChanged: (v) => setD(() => confirmado = v ?? false),
                title: Text('Confirmé que es esta persona (en persona o llamando${u.telefono != null ? ' al ${u.telefono}' : ' a un número que ya conocía'}).', style: const TextStyle(fontSize: 13)),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: confirmado ? () => Navigator.pop(ctx, true) : null, child: const Text('Restablecer')),
          ],
        ),
      ),
    );
    if (seguir != true || !mounted) return;
    String temporal;
    try {
      temporal = await Api.i.restablecerClave(u.id);
    } on ApiError catch (e) {
      if (mounted) mostrarMensaje(context, e.mensaje);
      return;
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false, // se muestra una sola vez: no se cierra por accidente
      builder: (ctx) => AlertDialog(
        title: const Text('Contraseña temporal'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          FittedBox(child: SelectableText(temporal, style: Theme.of(ctx).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold, letterSpacing: 2))),
          const SizedBox(height: 10),
          Text('Entrégasela a ${u.nombre}. Solo se muestra esta vez y vence en 24 horas si no la usa.', textAlign: TextAlign.center),
        ]),
        actions: [
          TextButton(
            onPressed: () {
              Clipboard.setData(ClipboardData(text: temporal));
              mostrarMensaje(ctx, 'Contraseña copiada');
            },
            child: const Text('Copiar'),
          ),
          FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Ya la entregué')),
        ],
      ),
    );
  }

  Future<void> _cambiarEstado(UsuarioFila u, bool activar) async {
    if (!activar) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Desactivar a ${u.nombre}'),
          content: Text(u.rol == 'residente'
              ? 'No podrá iniciar sesión. Se anulan sus visitas autorizadas (sus códigos dejan de servir), su aviso de portón y sus reservas futuras.'
              : 'No podrá iniciar sesión ni recibir avisos.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancelar')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Desactivar')),
          ],
        ),
      );
      if (ok != true) return;
    }
    if (!mounted) return;
    await intentar(context, () => Api.i.cambiarEstadoUsuario(u.id, activar ? 'activo' : 'inactivo'), exito: activar ? 'Usuario activado' : 'Usuario desactivado');
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final datos = _datos;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: _agregar, icon: const Icon(Icons.person_add_alt_1), label: const Text('Agregar usuario')),
      body: datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                children: [
                  for (final u in datos)
                    Card(
                      child: ListTile(
                        leading: CircleAvatar(
                          backgroundColor: u.rol == 'vigilante' ? cs.tertiaryContainer : cs.primaryContainer,
                          child: Icon(u.rol == 'administrador' ? Icons.admin_panel_settings : u.rol == 'vigilante' ? Icons.security : Icons.person, size: 20),
                        ),
                        title: Text(u.nombre, style: TextStyle(decoration: u.estado == 'inactivo' ? TextDecoration.lineThrough : null)),
                        subtitle: Text('${_rol(u.rol)}${u.unidad != null ? ' · ${u.unidad}' : ''}\n${u.correo}${u.telefono != null ? ' · ${u.telefono}' : ''}'),
                        isThreeLine: true,
                        trailing: u.rol == 'administrador'
                            ? null
                            : Row(mainAxisSize: MainAxisSize.min, children: [
                                if (u.estado == 'activo') IconButton(tooltip: 'Restablecer contraseña', icon: const Icon(Icons.lock_reset), onPressed: () => _restablecer(u)),
                                Switch(value: u.estado == 'activo', onChanged: (v) => _cambiarEstado(u, v)),
                              ]),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

// ===================================================================== unidades e invitaciones
class UnidadesPage extends StatefulWidget {
  const UnidadesPage({super.key});

  @override
  State<UnidadesPage> createState() => _UnidadesState();
}

class _UnidadesState extends State<UnidadesPage> with RefrescoPeriodico {
  List<UnidadItem>? _datos;
  String? _error;

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
      final r = await Api.i.unidades();
      if (mounted) setState(() { _datos = r; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Future<void> _nueva() async {
    final nombre = TextEditingController();
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Nueva unidad'),
        content: TextField(controller: nombre, autofocus: true, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nombre de la unidad', hintText: 'Torre 3 - Apto 301', helperText: 'También: Casa 12, Manzana B - Casa 4, Local 5', helperMaxLines: 2)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              if (nombre.text.trim().isEmpty) return;
              final ok = await intentar(ctx, () => Api.i.crearUnidad(nombre.text.trim()));
              if (ok && ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text('Crear'),
          ),
        ],
      ),
    );
    liberarCuando([nombre]);
  }

  Future<void> _invitar(UnidadItem u) async {
    try {
      final codigo = await Api.i.invitacion(u.id);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text('Invitación para ${u.nombre}'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            SelectableText(codigo, style: Theme.of(context).textTheme.headlineMedium?.copyWith(letterSpacing: 3, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            const Text('Entrégala a quien vive en esta unidad. Sirve para una sola persona y vence en 7 días; para otra persona de la misma unidad genera otra.', textAlign: TextAlign.center),
          ]),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: codigo));
                mostrarMensaje(ctx, 'Código copiado');
              },
              child: const Text('Copiar'),
            ),
            FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('Listo')),
          ],
        ),
      );
    } on ApiError catch (e) {
      if (mounted) mostrarMensaje(context, e.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) {
    final datos = _datos;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: _nueva, icon: const Icon(Icons.add_home_work_outlined), label: const Text('Nueva unidad')),
      body: datos == null
          ? (_error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator()))
          : RefreshIndicator(
              onRefresh: recargar,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 90),
                children: [
                  for (final u in datos)
                    Card(
                      child: ListTile(
                        leading: const Icon(Icons.apartment),
                        title: Text(u.nombre),
                        trailing: TextButton.icon(onPressed: () => _invitar(u), icon: const Icon(Icons.key), label: const Text('Invitar')),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

// ===================================================================== resumen de gestión
class ResumenPage extends StatefulWidget {
  const ResumenPage({super.key});

  @override
  State<ResumenPage> createState() => _ResumenState();
}

class _ResumenState extends State<ResumenPage> with RefrescoPeriodico {
  Map<String, dynamic>? _r;
  String? _error;
  int _dias = 30;
  Map<String, dynamic>? _pendientes;

  @override
  int get segundosRefresco => 30;

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
      final r = await Api.i.resumenReportes(dias: _dias);
      final pendientes = await Api.i.inicio();
      if (mounted) setState(() { _r = r; _pendientes = pendientes; _error = null; });
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  Widget _barras(BuildContext context, String titulo, List<(String, int)> filas, {String vacio = 'Sin datos en este periodo.'}) {
    final cs = Theme.of(context).colorScheme;
    final maximo = filas.fold<int>(1, (m, f) => f.$2 > m ? f.$2 : m);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(titulo, style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 8),
          if (filas.isEmpty) Text(vacio, style: TextStyle(color: cs.onSurfaceVariant)),
          for (final f in filas)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(children: [
                SizedBox(width: 110, child: Text(f.$1, overflow: TextOverflow.ellipsis)),
                Expanded(child: LinearProgressIndicator(value: f.$2 / maximo, minHeight: 10, borderRadius: BorderRadius.circular(5))),
                SizedBox(width: 34, child: Text('${f.$2}', textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
              ]),
            ),
        ]),
      ),
    );
  }

  Widget _dato(BuildContext context, IconData icono, String valor, String etiqueta) => Expanded(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
            child: Column(children: [
              Icon(icono, color: Theme.of(context).colorScheme.primary),
              const SizedBox(height: 4),
              Text(valor, style: Theme.of(context).textTheme.titleLarge),
              Text(etiqueta, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            ]),
          ),
        ),
      );

  Widget _porAtender(BuildContext context, Map<String, dynamic> d) {
    final cs = Theme.of(context).colorScheme;
    final pqrs = d['pqrs_sin_cerrar'] as int? ?? 0;
    final incidencias = d['incidencias_abiertas'] as int? ?? 0;
    final graves = d['incidencias_graves'] as int? ?? 0;
    final alertas = d['alertas_24h'] as int? ?? 0;
    Widget fila(IconData icono, String texto, int n, String seccion, String pestana, {bool urgente = false}) => ListTile(
          leading: Icon(icono, color: urgente ? cs.error : cs.primary),
          title: Text(texto),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            Badge(isLabelVisible: n > 0, backgroundColor: urgente ? cs.error : cs.primary, label: Text('$n')),
            const Icon(Icons.chevron_right),
          ]),
          onTap: () => irA(seccion, pestana),
        );
    return Card(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.fromLTRB(16, 14, 16, 0), child: Text(pqrs + incidencias + alertas == 0 ? 'Todo al día' : 'Por atender', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700))),
        fila(Icons.forum_outlined, 'PQRS sin cerrar', pqrs, 'Conjunto', 'PQRS'),
        fila(Icons.build_circle_outlined, graves > 0 ? 'Incidencias abiertas ($graves ${graves == 1 ? 'grave' : 'graves'})' : 'Incidencias abiertas', incidencias, 'Conjunto', 'Incidencias', urgente: graves > 0),
        fila(Icons.warning_amber_rounded, 'Alertas de portería (24 h)', alertas, 'Conjunto', 'Minuta', urgente: alertas > 0),
      ]),
    );
  }

  String _estadoPqrs(String e) => switch (e) { 'registrada' => 'Registradas', 'en_revision' => 'En revisión', 'en_proceso' => 'En proceso', 'cerrada' => 'Resueltas', _ => 'Canceladas' };

  @override
  Widget build(BuildContext context) {
    final r = _r;
    if (r == null) return _error != null ? Aviso(_error!) : const Center(child: CircularProgressIndicator());
    final porton = r['porton'] as Map<String, dynamic>;
    final ingresos = (r['ingresos_por_dia'] as List).fold<int>(0, (s, e) => s + (e['ingresos'] as int));
    final minutos = porton['minutos_promedio'];
    return RefreshIndicator(
      onRefresh: recargar,
      child: ListView(padding: const EdgeInsets.all(16), children: [
        if (_pendientes != null) _porAtender(context, _pendientes!),
        Wrap(spacing: 8, children: [
          for (final d in const [7, 30, 90])
            ChoiceChip(
              label: Text('$d días'),
              selected: _dias == d,
              onSelected: (_) {
                setState(() { _dias = d; _r = null; });
                recargar();
              },
            ),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          _dato(context, Icons.how_to_reg, '${r['visitantes_dentro']}', 'visitantes dentro ahora'),
          _dato(context, Icons.login, '$ingresos', 'ingresos de visitantes'),
          _dato(context, Icons.garage_outlined, minutos == null ? '–' : '$minutos min', 'atención del portón'),
        ]),
        _barras(context, 'Reservas creadas por zona', [for (final z in r['reservas_por_zona'] as List) (z['zona'] as String, z['reservas'] as int)]),
        _barras(context, 'Ingresos de visitantes por día', [for (final d in r['ingresos_por_dia'] as List) ((d['dia'] as String).substring(5), d['ingresos'] as int)]),
        _barras(context, 'Avisos del portón', [
          ('Atendidos', porton['atendidos'] as int),
          ('Vencidos', porton['vencidos'] as int),
          ('Cancelados', porton['cancelados'] as int),
        ]),
        _barras(context, 'Paquetes y domicilios', [
          ('Recibidos', (r['paquetes'] as Map<String, dynamic>)['recibidos'] as int),
          ('Entregados', (r['paquetes'] as Map<String, dynamic>)['entregados'] as int),
          ('Por recoger', (r['paquetes'] as Map<String, dynamic>)['por_recoger'] as int),
        ]),
        _barras(context, 'Incidencias por estado', [for (final p in r['incidencias_por_estado'] as List) (_estadoPqrs(p['estado'] as String), p['cantidad'] as int)], vacio: 'No hay incidencias en este periodo.'),
        _barras(context, 'PQRS por estado', [for (final p in r['pqrs_por_estado'] as List) (_estadoPqrs(p['estado'] as String), p['cantidad'] as int)], vacio: 'No hay solicitudes en este periodo.'),
      ]),
    );
  }
}
