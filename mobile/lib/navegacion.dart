import 'package:flutter/material.dart';
import 'api.dart';

/// A dónde ir al tocar un aviso o una acción rápida: [seccion] es la etiqueta de la barra inferior
/// y [pestana] la pestaña superior dentro de ella.
class Destino {
  final String seccion;
  final String? pestana;
  const Destino(this.seccion, [this.pestana]);

  @override
  String toString() => pestana == null ? seccion : '$seccion/$pestana';
}

/// La pantalla principal y sus pestañas escuchan este valor.
final ValueNotifier<Destino?> destino = ValueNotifier(null);

/// Navegador principal: permite volver a la pantalla de inicio desde cualquier pantalla abierta encima.
final GlobalKey<NavigatorState> navegador = GlobalKey<NavigatorState>();

/// Tipo del aviso que se tocó cuando la app estaba cerrada; se atiende al iniciar sesión.
String? avisoPendientePorAbrir;

void irA(String seccion, [String? pestana]) {
  navegador.currentState?.popUntil((ruta) => ruta.isFirst);
  destino.value = Destino(seccion, pestana);
}

/// Pantalla que corresponde a cada tipo de aviso según el perfil. Nulo si no hay a dónde ir.
Destino? destinoDeAviso(String tipo, Usuario u) {
  if (u.esAdmin) {
    return switch (tipo) {
      'pqrs' => const Destino('Conjunto', 'PQRS'),
      'incidencia' => const Destino('Conjunto', 'Incidencias'),
      'minuta' => const Destino('Conjunto', 'Minuta'),
      _ => null,
    };
  }
  if (u.esVigilante) {
    return switch (tipo) {
      'aviso_porton' || 'porton_cancelado' => const Destino('Portería', 'Portón'),
      'visita_respuesta' => const Destino('Portería', 'Visitas'),
      'paquete_en_camino' => const Destino('Portería', 'Paquetes'),
      'chat' => const Destino('Chat', 'Conversaciones'),
      'comunicado' => const Destino('Novedades', 'Comunicados'),
      'incidencia' => const Destino('Novedades', 'Incidencias'),
      _ => null,
    };
  }
  return switch (tipo) {
    'porton' => const Destino('Acceso', 'Portón'),
    'visita' || 'visita_solicitud' => const Destino('Acceso', 'Visitas'),
    'paquete' => const Destino('Acceso', 'Paquetes'),
    'chat' => const Destino('Chat'),
    'comunicado' => const Destino('Conjunto', 'Comunicados'),
    'pqrs' => const Destino('Conjunto', 'PQRS'),
    'incidencia' => const Destino('Conjunto', 'Incidencias'),
    'reserva' || 'zona' => const Destino('Reservas', 'Mis reservas'),
    _ => null,
  };
}

/// Abre la pantalla de un tipo de aviso para el usuario actual.
void abrirAviso(String tipo) {
  final u = Api.i.usuario;
  if (u == null) {
    avisoPendientePorAbrir = tipo;
    return;
  }
  final d = destinoDeAviso(tipo, u);
  if (d != null) irA(d.seccion, d.pestana);
}

/// Icono de cada tipo de aviso.
IconData iconoDeAviso(String tipo) => switch (tipo) {
      'aviso_porton' || 'porton' || 'porton_cancelado' => Icons.garage_outlined,
      'visita' || 'visita_solicitud' || 'visita_respuesta' => Icons.person_pin_circle_outlined,
      'paquete' => Icons.inventory_2_outlined,
      'paquete_en_camino' => Icons.directions_walk,
      'chat' => Icons.chat_bubble_outline,
      'comunicado' => Icons.campaign_outlined,
      'pqrs' => Icons.forum_outlined,
      'incidencia' => Icons.build_circle_outlined,
      'minuta' => Icons.warning_amber_rounded,
      'reserva' => Icons.event_available_outlined,
      'zona' => Icons.pool_outlined,
      'cuenta' => Icons.lock_reset,
      _ => Icons.notifications_none,
    };
