import 'package:flutter/material.dart';

/// Paleta Cantaluna: beige y café en tonos pastel, con un verde salvia suave como acento.
const _claro = ColorScheme(
  brightness: Brightness.light,
  primary: Color(0xFF7A5C45),
  onPrimary: Color(0xFFFFFBF5),
  primaryContainer: Color(0xFFEADCC9),
  onPrimaryContainer: Color(0xFF3E2C1E),
  secondary: Color(0xFFA68B73),
  onSecondary: Color(0xFFFFFFFF),
  secondaryContainer: Color(0xFFF1E7D8),
  onSecondaryContainer: Color(0xFF4A3A2C),
  tertiary: Color(0xFF7F9170),
  onTertiary: Color(0xFFFFFFFF),
  tertiaryContainer: Color(0xFFE3EAD8),
  onTertiaryContainer: Color(0xFF2F3A27),
  error: Color(0xFFB3574B),
  onError: Color(0xFFFFFFFF),
  errorContainer: Color(0xFFF6DDD8),
  onErrorContainer: Color(0xFF5A1F18),
  surface: Color(0xFFFBF7F0),
  onSurface: Color(0xFF3A2E26),
  onSurfaceVariant: Color(0xFF6E5E50),
  surfaceContainerLowest: Color(0xFFFFFFFF),
  surfaceContainerLow: Color(0xFFF6EFE4),
  surfaceContainer: Color(0xFFF1E8DA),
  surfaceContainerHigh: Color(0xFFEBE0CF),
  surfaceContainerHighest: Color(0xFFE5D8C5),
  outline: Color(0xFFB5A491),
  outlineVariant: Color(0xFFE2D5C3),
  inverseSurface: Color(0xFF3A2E26),
  onInverseSurface: Color(0xFFF6EFE4),
  inversePrimary: Color(0xFFD9BC9B),
  shadow: Color(0xFF000000),
  scrim: Color(0xFF000000),
  surfaceTint: Color(0xFF7A5C45),
);

const _oscuro = ColorScheme(
  brightness: Brightness.dark,
  primary: Color(0xFFD9BC9B),
  onPrimary: Color(0xFF3B2918),
  primaryContainer: Color(0xFF574231),
  onPrimaryContainer: Color(0xFFF0DEC8),
  secondary: Color(0xFFC9B199),
  onSecondary: Color(0xFF3A2D22),
  secondaryContainer: Color(0xFF4A3B2F),
  onSecondaryContainer: Color(0xFFEADBC8),
  tertiary: Color(0xFFB4C4A4),
  onTertiary: Color(0xFF22301B),
  tertiaryContainer: Color(0xFF384A2F),
  onTertiaryContainer: Color(0xFFD3E3C2),
  error: Color(0xFFE8A397),
  onError: Color(0xFF4A1812),
  errorContainer: Color(0xFF6B2E26),
  onErrorContainer: Color(0xFFFADAD3),
  surface: Color(0xFF1D1814),
  onSurface: Color(0xFFEFE5D8),
  onSurfaceVariant: Color(0xFFC7B8A6),
  surfaceContainerLowest: Color(0xFF17130F),
  surfaceContainerLow: Color(0xFF241E19),
  surfaceContainer: Color(0xFF2A231D),
  surfaceContainerHigh: Color(0xFF342C25),
  surfaceContainerHighest: Color(0xFF3E352D),
  outline: Color(0xFF8F8070),
  outlineVariant: Color(0xFF463C33),
  inverseSurface: Color(0xFFEFE5D8),
  onInverseSurface: Color(0xFF2A231D),
  inversePrimary: Color(0xFF7A5C45),
  shadow: Color(0xFF000000),
  scrim: Color(0xFF000000),
  surfaceTint: Color(0xFFD9BC9B),
);

ThemeData _construir(ColorScheme cs) {
  final base = ThemeData(brightness: cs.brightness, useMaterial3: true);
  final texto = base.textTheme.apply(bodyColor: cs.onSurface, displayColor: cs.onSurface);
  final borde = OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: cs.outlineVariant));
  return ThemeData(
    useMaterial3: true,
    colorScheme: cs,
    scaffoldBackgroundColor: cs.surface,
    textTheme: texto,
    appBarTheme: AppBarTheme(
      backgroundColor: cs.surface,
      foregroundColor: cs.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(color: cs.onSurface, fontSize: 20, fontWeight: FontWeight.w600, letterSpacing: 0.3),
    ),
    cardTheme: CardThemeData(
      color: cs.surfaceContainerLow,
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: cs.outlineVariant)),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: cs.surfaceContainerLow,
      indicatorColor: cs.primaryContainer,
      elevation: 0,
      height: 68,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: cs.surfaceContainerLow,
      border: borde,
      enabledBorder: borde,
      focusedBorder: borde.copyWith(borderSide: BorderSide(color: cs.primary, width: 1.6)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: cs.primary)),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: cs.primary,
        side: BorderSide(color: cs.outline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: cs.surfaceContainerLow,
      selectedColor: cs.primaryContainer,
      side: BorderSide(color: cs.outlineVariant),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      labelStyle: TextStyle(color: cs.onSurface),
      checkmarkColor: cs.onPrimaryContainer,
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: cs.primaryContainer,
      foregroundColor: cs.onPrimaryContainer,
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: cs.inverseSurface,
      contentTextStyle: TextStyle(color: cs.onInverseSurface),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    dialogTheme: DialogThemeData(backgroundColor: cs.surfaceContainerHigh, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24))),
    popupMenuTheme: PopupMenuThemeData(color: cs.surfaceContainerHigh, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
    dividerTheme: DividerThemeData(color: cs.outlineVariant),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: cs.primary),
  );
}

final ThemeData temaClaro = _construir(_claro);
final ThemeData temaOscuro = _construir(_oscuro);

/// Modo elegido por el usuario. Por defecto sigue el del sistema.
final ValueNotifier<ThemeMode> modoTema = ValueNotifier(ThemeMode.system);

/// Botón del sol y la luna: alterna entre modo claro y oscuro.
class BotonTema extends StatelessWidget {
  const BotonTema({super.key});

  @override
  Widget build(BuildContext context) {
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    return IconButton(
      tooltip: oscuro ? 'Modo claro' : 'Modo oscuro',
      icon: Icon(oscuro ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
      onPressed: () => modoTema.value = oscuro ? ThemeMode.light : ThemeMode.dark,
    );
  }
}

/// Logo de Cantaluna: una luna creciente con dos estrellas, dibujada en código (sin imágenes).
class LunaLogo extends StatelessWidget {
  final double tamano;
  final bool conFondo;
  const LunaLogo({super.key, this.tamano = 32, this.conFondo = false});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return CustomPaint(
      size: Size.square(tamano),
      painter: _LunaPainter(luna: cs.primary, estrella: cs.secondary, fondo: conFondo ? cs.primaryContainer : null),
    );
  }
}

class _LunaPainter extends CustomPainter {
  final Color luna;
  final Color estrella;
  final Color? fondo;
  _LunaPainter({required this.luna, required this.estrella, this.fondo});

  @override
  void paint(Canvas canvas, Size size) {
    final s = size.width;
    if (fondo != null) {
      canvas.drawRRect(RRect.fromRectAndRadius(Offset.zero & size, Radius.circular(s * 0.26)), Paint()..color = fondo!);
    }
    final c = Offset(s * 0.5, s * 0.52);
    final r = s * (fondo != null ? 0.30 : 0.42);
    final disco = Path()..addOval(Rect.fromCircle(center: c, radius: r));
    final corte = Path()..addOval(Rect.fromCircle(center: c + Offset(r * 0.46, -r * 0.30), radius: r * 0.86));
    canvas.drawPath(Path.combine(PathOperation.difference, disco, corte), Paint()..color = luna);
    final e = Paint()..color = estrella;
    canvas.drawCircle(Offset(s * 0.70, s * 0.30), s * 0.035, e);
    canvas.drawCircle(Offset(s * 0.80, s * 0.46), s * 0.025, e);
  }

  @override
  bool shouldRepaint(_LunaPainter old) => old.luna != luna || old.estrella != estrella || old.fondo != fondo;
}
