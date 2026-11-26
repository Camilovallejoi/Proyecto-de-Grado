import 'package:flutter/material.dart';
import 'api.dart';
import 'navegacion.dart';
import 'pantallas/aviso_emergente.dart';
import 'pantallas/cambiar_clave.dart';
import 'pantallas/inicio.dart';
import 'pantallas/login.dart';
import 'push.dart';
import 'tema.dart';
import 'tiempo_real.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await PushService.i.inicializar();
  runApp(const CantalunaApp());
}

class CantalunaApp extends StatefulWidget {
  const CantalunaApp({super.key});

  @override
  State<CantalunaApp> createState() => _CantalunaAppState();
}

class _CantalunaAppState extends State<CantalunaApp> {
  bool _arrancando = true;
  String? _mensajeLogin;

  @override
  void initState() {
    super.initState();
    Api.i.alVencerSesion = () {
      if (!mounted) return;
      CentroAvisos.i.detener();
      navegador.currentState?.popUntil((r) => r.isFirst);
      setState(() => _mensajeLogin = 'Tu sesión terminó. Inicia sesión de nuevo.');
    };
    _restaurar();
  }

  /// Si hay una sesión guardada y sigue siendo válida, se entra sin pedir la contraseña.
  Future<void> _restaurar() async {
    await Api.i.restaurarSesion();
    if (mounted) setState(() => _arrancando = false);
  }

  void _cerrarSesion() {
    CentroAvisos.i.detener();
    setState(() {
      _mensajeLogin = null;
      Api.i.cerrarSesion();
    });
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: modoTema,
      builder: (context, modo, _) => MaterialApp(
        title: 'Cantaluna',
        debugShowCheckedModeBanner: false,
        navigatorKey: navegador,
        theme: temaClaro,
        darkTheme: temaOscuro,
        themeMode: modo,
        // Los avisos emergentes van por encima de todas las pantallas.
        builder: (context, hijo) => Stack(children: [hijo!, const AvisosEmergentes()]),
        home: _arrancando
            ? const Scaffold(body: Center(child: LunaLogo(tamano: 96, conFondo: true)))
            : Api.i.sesionIniciada
                ? (Api.i.usuario!.cambioClavePendiente
                    ? CambiarClavePage(obligatorio: true, onListo: () => setState(() {}), onSalir: _cerrarSesion)
                    : InicioPage(onSalir: _cerrarSesion))
                : LoginPage(mensaje: _mensajeLogin, onEntrar: () => setState(() => _mensajeLogin = null)),
      ),
    );
  }
}
