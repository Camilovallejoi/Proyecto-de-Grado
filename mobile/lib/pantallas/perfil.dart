import 'package:flutter/material.dart';
import '../api.dart';
import '../llamar.dart';
import '../tema.dart';
import 'cambiar_clave.dart';
import 'comun.dart';

/// Texto que explica para qué se usa el teléfono antes de pedir la autorización (habeas data).
const avisoDatosTelefono =
    'Autorizo que el vigilante y la administración de mi conjunto usen mi teléfono para contactarme sobre visitas, paquetes y novedades (Ley 1581 de 2012). Puedo borrarlo cuando quiera.';

/// Mi perfil: datos de la cuenta, teléfono, número de portería, apariencia y cierre de sesión.
class PerfilPage extends StatefulWidget {
  final Future<void> Function() onSalir;
  const PerfilPage({super.key, required this.onSalir});

  @override
  State<PerfilPage> createState() => _PerfilState();
}

class _PerfilState extends State<PerfilPage> {
  String? _porteria;
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final n = await Api.i.telefonoPorteria();
      if (mounted) setState(() { _porteria = n; _cargando = false; });
    } on ApiError catch (_) {
      if (mounted) setState(() => _cargando = false);
    }
  }

  Future<void> _editarPorteria() async {
    final texto = TextEditingController(text: _porteria ?? '');
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Teléfono de portería'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: texto, autofocus: true, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Número del conjunto')),
          const SizedBox(height: 8),
          const Text('Es un solo número para todo el conjunto. Déjalo vacío para quitarlo.', style: TextStyle(fontSize: 12)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
          FilledButton(
            onPressed: () async {
              final ok = await intentar(ctx, () => Api.i.guardarTelefonoPorteria(texto.text.trim()));
              if (ok && ctx.mounted) Navigator.pop(ctx);
              if (ok && mounted) mostrarMensaje(context, 'Teléfono de portería actualizado');
            },
            child: const Text('Guardar'),
          ),
        ],
      ),
    );
    liberarCuando([texto]);
    await _cargar();
  }

  Future<void> _editarMiTelefono() async {
    final texto = TextEditingController(text: Api.i.usuario!.telefono ?? '');
    var autoriza = false;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Mi teléfono'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              TextField(controller: texto, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Celular')),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: autoriza,
                onChanged: (v) => setD(() => autoriza = v ?? false),
                title: const Text(avisoDatosTelefono, style: TextStyle(fontSize: 12)),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                final numero = texto.text.trim();
                if (numero.isNotEmpty && !autoriza) {
                  mostrarMensaje(ctx, 'Marca la autorización para guardar tu teléfono');
                  return;
                }
                final ok = await intentar(ctx, () => Api.i.guardarMiTelefono(numero, autoriza: autoriza));
                if (ok && ctx.mounted) Navigator.pop(ctx);
                if (ok && mounted) mostrarMensaje(context, numero.isEmpty ? 'Teléfono eliminado' : 'Teléfono guardado');
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
    liberarCuando([texto]);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final u = Api.i.usuario;
    if (u == null) return const SizedBox.shrink();
    final rol = u.esAdmin ? 'Administración' : u.esVigilante ? 'Vigilante' : 'Residente';
    return Scaffold(
      appBar: AppBar(title: const Text('Mi perfil')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Center(child: CircleAvatar(radius: 38, backgroundColor: cs.primaryContainer, foregroundColor: cs.onPrimaryContainer, child: Text(u.nombre.isEmpty ? '?' : u.nombre[0].toUpperCase(), style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w700)))),
        const SizedBox(height: 10),
        Text(u.nombre, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleLarge),
        Text('$rol${u.unidad != null ? ' · ${u.unidad}' : ''}', textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant)),
        Text('${u.correo} · ${u.copropiedad}', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
        const SizedBox(height: 16),
        Card(
          child: ListTile(
            leading: const Icon(Icons.security_outlined),
            title: const Text('Portería'),
            subtitle: Text(_cargando ? 'Consultando…' : _porteria ?? 'Sin número registrado'),
            trailing: u.esAdmin
                ? TextButton(onPressed: _editarPorteria, child: Text(_porteria == null ? 'Agregar' : 'Cambiar'))
                : IconButton.filledTonal(tooltip: 'Llamar a portería', icon: const Icon(Icons.call), onPressed: () => llamarPorteria(context)),
          ),
        ),
        if (!u.esPersonal)
          Card(
            child: ListTile(
              leading: const Icon(Icons.phone_android),
              title: const Text('Mi teléfono'),
              subtitle: Text(u.telefono ?? 'No compartido. Sin él, el vigilante solo puede escribirte.'),
              trailing: TextButton(onPressed: _editarMiTelefono, child: Text(u.telefono == null ? 'Agregar' : 'Cambiar')),
            ),
          ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.lock_outline),
            title: const Text('Contraseña'),
            trailing: TextButton(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (ctx) => CambiarClavePage(obligatorio: false, onListo: () => Navigator.pop(ctx)))),
              child: const Text('Cambiar'),
            ),
          ),
        ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text('Apariencia', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              ValueListenableBuilder<ThemeMode>(
                valueListenable: modoTema,
                builder: (_, modo, _) => SegmentedButton<ThemeMode>(
                  showSelectedIcon: false,
                  segments: const [
                    ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto), label: Text('Auto')),
                    ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined), label: Text('Claro')),
                    ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined), label: Text('Oscuro')),
                  ],
                  selected: {modo},
                  onSelectionChanged: (s) => modoTema.value = s.first,
                ),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: () async {
            Navigator.of(context).popUntil((r) => r.isFirst);
            await widget.onSalir();
          },
          icon: const Icon(Icons.logout),
          label: const Text('Cerrar sesión'),
        ),
      ]),
    );
  }
}
