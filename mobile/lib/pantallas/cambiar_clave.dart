import 'package:flutter/material.dart';
import '../api.dart';
import '../tema.dart';
import 'comun.dart';

/// Cambio de contraseña. Es obligatorio cuando la administración creó la cuenta con una contraseña temporal;
/// también se puede abrir desde el perfil.
class CambiarClavePage extends StatefulWidget {
  final bool obligatorio;
  final VoidCallback onListo;
  final VoidCallback? onSalir;
  const CambiarClavePage({super.key, required this.obligatorio, required this.onListo, this.onSalir});

  @override
  State<CambiarClavePage> createState() => _CambiarClaveState();
}

class _CambiarClaveState extends State<CambiarClavePage> {
  final _actual = TextEditingController();
  final _nueva = TextEditingController();
  final _repetida = TextEditingController();
  final _formulario = GlobalKey<FormState>();
  bool _ver = false;
  bool _guardando = false;
  String? _error;

  @override
  void dispose() {
    _actual.dispose();
    _nueva.dispose();
    _repetida.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (_guardando || !_formulario.currentState!.validate()) return;
    setState(() { _guardando = true; _error = null; });
    try {
      await Api.i.cambiarClave(_actual.text, _nueva.text);
      if (!mounted) return;
      mostrarMensaje(context, 'Contraseña actualizada');
      widget.onListo();
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Widget _campo(TextEditingController c, String etiqueta, String? Function(String) validar) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: c,
          obscureText: !_ver,
          decoration: InputDecoration(labelText: etiqueta, prefixIcon: const Icon(Icons.lock_outline)),
          validator: (v) => validar(v ?? ''),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: widget.obligatorio ? null : AppBar(title: const Text('Cambiar contraseña')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(28),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 400),
              child: Form(
                key: _formulario,
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  if (widget.obligatorio) ...[
                    const Center(child: LunaLogo(tamano: 72, conFondo: true)),
                    const SizedBox(height: 16),
                    Text('Crea tu contraseña', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 6),
                    Text('Entraste con una contraseña temporal que te dio la administración. Cámbiala por una que solo tú conozcas.', textAlign: TextAlign.center, style: TextStyle(color: cs.onSurfaceVariant)),
                    const SizedBox(height: 22),
                  ],
                  _campo(_actual, widget.obligatorio ? 'Contraseña temporal' : 'Contraseña actual', (v) => v.isEmpty ? 'Escríbela' : null),
                  _campo(_nueva, 'Contraseña nueva (mínimo 8)', (v) => v.length < 8 ? 'Mínimo 8 caracteres' : v == _actual.text ? 'Debe ser distinta de la actual' : null),
                  _campo(_repetida, 'Repite la contraseña nueva', (v) => v != _nueva.text ? 'No coincide' : null),
                  CheckboxListTile(contentPadding: EdgeInsets.zero, controlAffinity: ListTileControlAffinity.leading, value: _ver, onChanged: (v) => setState(() => _ver = v ?? false), title: const Text('Mostrar contraseñas')),
                  if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: TextStyle(color: cs.error))),
                  FilledButton(
                    onPressed: _guardando ? null : _guardar,
                    child: _guardando ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Guardar contraseña'),
                  ),
                  if (widget.obligatorio && widget.onSalir != null) TextButton(onPressed: widget.onSalir, child: const Text('Salir')),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
