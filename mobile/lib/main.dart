import 'package:flutter/material.dart';
import 'api.dart';
import 'pantallas/inicio.dart';
import 'pantallas/login.dart';
import 'tema.dart';

void main() => runApp(const CantalunaApp());

class CantalunaApp extends StatefulWidget {
  const CantalunaApp({super.key});

  @override
  State<CantalunaApp> createState() => _CantalunaAppState();
}

class _CantalunaAppState extends State<CantalunaApp> {
  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: modoTema,
      builder: (context, modo, _) => MaterialApp(
        title: 'Cantaluna',
        debugShowCheckedModeBanner: false,
        theme: temaClaro,
        darkTheme: temaOscuro,
        themeMode: modo,
        home: Api.i.sesionIniciada
            ? InicioPage(onSalir: () => setState(Api.i.cerrarSesion))
            : LoginPage(onEntrar: () => setState(() {})),
      ),
    );
  }
}
