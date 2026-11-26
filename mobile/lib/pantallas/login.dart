import 'package:flutter/material.dart';
import '../api.dart';
import '../tema.dart';
import 'perfil.dart';

class LoginPage extends StatefulWidget {
  final VoidCallback onEntrar;

  /// Explicación al volver a esta pantalla (por ejemplo, si la sesión venció).
  final String? mensaje;
  const LoginPage({super.key, required this.onEntrar, this.mensaje});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _correo = TextEditingController();
  final _password = TextEditingController();
  final _nombre = TextEditingController();
  final _codigo = TextEditingController();
  final _telefono = TextEditingController();
  bool _registro = false;
  bool _cargando = false;
  bool _verClave = false;
  bool _autoriza = false;
  String? _error;

  @override
  void dispose() {
    _correo.dispose();
    _password.dispose();
    _nombre.dispose();
    _codigo.dispose();
    _telefono.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    if (_cargando) return;
    if (_registro && _telefono.text.trim().isNotEmpty && !_autoriza) {
      setState(() => _error = 'Marca la autorización para guardar tu teléfono, o deja el campo vacío.');
      return;
    }
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      if (_registro) {
        await Api.i.registro(
          nombre: _nombre.text.trim(),
          correo: _correo.text.trim(),
          password: _password.text,
          codigo: _codigo.text.trim(),
          telefono: _telefono.text.trim(),
          autorizaTelefono: _autoriza,
        );
      } else {
        await Api.i.login(_correo.text.trim(), _password.text);
      }
      widget.onEntrar();
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  void _olvideClave() => showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Recuperar contraseña'),
          content: const Text('Pide a la administración de tu conjunto que la restablezca. Confirmará que eres tú y te dará una contraseña temporal, que vence en 24 horas. Al entrar con ella crearás una nueva.'),
          actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Entendido'))],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Stack(
          children: [
            const Positioned(top: 4, right: 8, child: BotonTema()),
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(28),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 400),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Center(child: LunaLogo(tamano: 92, conFondo: true)),
                      const SizedBox(height: 18),
                      Text('Cantaluna', textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w600, letterSpacing: 1.2)),
                      const SizedBox(height: 4),
                      Text('Tu conjunto en un solo lugar', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant, letterSpacing: 0.6)),
                      const SizedBox(height: 28),
                      if (widget.mensaje != null)
                        Container(
                          margin: const EdgeInsets.only(bottom: 14),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: cs.tertiaryContainer, borderRadius: BorderRadius.circular(12)),
                          child: Text(widget.mensaje!, textAlign: TextAlign.center, style: TextStyle(color: cs.onTertiaryContainer)),
                        ),
                      if (_registro) ...[
                        TextField(controller: _nombre, textCapitalization: TextCapitalization.words, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Nombre completo', prefixIcon: Icon(Icons.person_outline))),
                        const SizedBox(height: 12),
                      ],
                      TextField(controller: _correo, keyboardType: TextInputType.emailAddress, textInputAction: TextInputAction.next, autocorrect: false, decoration: const InputDecoration(labelText: 'Correo', prefixIcon: Icon(Icons.mail_outline))),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _password,
                        obscureText: !_verClave,
                        textInputAction: _registro ? TextInputAction.next : TextInputAction.done,
                        onSubmitted: _registro ? null : (_) => _enviar(),
                        decoration: InputDecoration(
                          labelText: _registro ? 'Contraseña (mínimo 8 caracteres)' : 'Contraseña',
                          prefixIcon: const Icon(Icons.lock_outline),
                          suffixIcon: IconButton(tooltip: _verClave ? 'Ocultar contraseña' : 'Mostrar contraseña', icon: Icon(_verClave ? Icons.visibility_off_outlined : Icons.visibility_outlined), onPressed: () => setState(() => _verClave = !_verClave)),
                        ),
                      ),
                      if (_registro) ...[
                        const SizedBox(height: 12),
                        TextField(controller: _codigo, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Código de invitación', helperText: 'Te lo entrega la administración', prefixIcon: Icon(Icons.key_outlined))),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _telefono,
                          keyboardType: TextInputType.phone,
                          onChanged: (_) => setState(() {}),
                          decoration: const InputDecoration(labelText: 'Celular (opcional)', helperText: 'Para que portería pueda llamarte', prefixIcon: Icon(Icons.phone_android)),
                        ),
                        if (_telefono.text.trim().isNotEmpty)
                          CheckboxListTile(
                            contentPadding: EdgeInsets.zero,
                            controlAffinity: ListTileControlAffinity.leading,
                            value: _autoriza,
                            onChanged: (v) => setState(() => _autoriza = v ?? false),
                            title: const Text(avisoDatosTelefono, style: TextStyle(fontSize: 12)),
                          ),
                      ] else
                        Align(
                          alignment: Alignment.centerRight,
                          child: TextButton(onPressed: _olvideClave, child: const Text('¿Olvidaste tu contraseña?')),
                        ),
                      if (_error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(_error!, style: TextStyle(color: cs.error))),
                      const SizedBox(height: 22),
                      FilledButton(
                        onPressed: _cargando ? null : _enviar,
                        child: _cargando ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : Text(_registro ? 'Crear cuenta' : 'Iniciar sesión'),
                      ),
                      TextButton(
                        onPressed: _cargando
                            ? null
                            : () => setState(() {
                                  _registro = !_registro;
                                  _error = null;
                                }),
                        child: Text(_registro ? 'Ya tengo cuenta' : 'Registrarme con código de invitación'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
