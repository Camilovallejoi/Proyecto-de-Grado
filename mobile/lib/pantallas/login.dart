import 'package:flutter/material.dart';
import '../api.dart';
import '../tema.dart';

class LoginPage extends StatefulWidget {
  final VoidCallback onEntrar;
  const LoginPage({super.key, required this.onEntrar});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _correo = TextEditingController();
  final _password = TextEditingController();
  final _nombre = TextEditingController();
  final _codigo = TextEditingController();
  bool _registro = false;
  bool _cargando = false;
  String? _error;

  Future<void> _enviar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      if (_registro) {
        await Api.i.registro(nombre: _nombre.text.trim(), correo: _correo.text.trim(), password: _password.text, codigo: _codigo.text.trim());
      } else {
        await Api.i.login(_correo.text.trim(), _password.text);
      }
      widget.onEntrar();
    } on ApiError catch (e) {
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

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
                      Text('Zonas comunes', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: cs.onSurfaceVariant, letterSpacing: 0.6)),
                      const SizedBox(height: 32),
                      if (_registro) ...[
                        TextField(controller: _nombre, decoration: const InputDecoration(labelText: 'Nombre completo')),
                        const SizedBox(height: 12),
                      ],
                      TextField(controller: _correo, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Correo')),
                      const SizedBox(height: 12),
                      TextField(controller: _password, obscureText: true, decoration: InputDecoration(labelText: _registro ? 'Contraseña (mínimo 8 caracteres)' : 'Contraseña')),
                      if (_registro) ...[
                        const SizedBox(height: 12),
                        TextField(controller: _codigo, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Código de invitación', helperText: 'Te lo entrega la administración')),
                      ] else
                        Align(
                          alignment: Alignment.centerRight,
                          // Pendiente: por ahora la opción solo se muestra y no hace nada.
                          child: TextButton(onPressed: () {}, child: const Text('¿Olvidaste tu contraseña?')),
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
