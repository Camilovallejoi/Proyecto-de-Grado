/// Modelos de los módulos de visitantes, chat, comunicados, PQRS y usuarios.
DateTime _f(dynamic v) => DateTime.parse(v as String);
DateTime? _fn(dynamic v) => v == null ? null : DateTime.parse(v as String);

class Visita {
  final int id;
  final String nombre;
  final String? documento;
  final String? placa;
  final String codigo;
  final DateTime validaHasta;
  final String estado; // autorizada | dentro | finalizada | cancelada | vencida
  final String origen; // residente | porteria
  final DateTime? entradaEn;
  final DateTime? salidaEn;
  final String unidad;
  final String? residente;
  final String? recibidoPor;
  final int? residenteId;
  final String? residenteTelefono; // solo lo recibe el vigilante

  Visita({
    required this.id,
    required this.nombre,
    this.documento,
    this.placa,
    required this.codigo,
    required this.validaHasta,
    required this.estado,
    required this.origen,
    this.entradaEn,
    this.salidaEn,
    required this.unidad,
    this.residente,
    this.recibidoPor,
    this.residenteId,
    this.residenteTelefono,
  });

  factory Visita.fromJson(Map<String, dynamic> j) => Visita(
        id: j['id'] as int,
        nombre: j['nombre'] as String,
        documento: j['documento'] as String?,
        placa: j['placa'] as String?,
        codigo: j['codigo'] as String,
        validaHasta: _f(j['valida_hasta']),
        estado: j['estado'] as String,
        origen: j['origen'] as String,
        entradaEn: _fn(j['entrada_en']),
        salidaEn: _fn(j['salida_en']),
        unidad: j['unidad'] as String,
        residente: j['residente'] as String?,
        recibidoPor: j['recibido_por'] as String?,
        residenteId: j['residente_id'] as int?,
        residenteTelefono: j['residente_telefono'] as String?,
      );

  bool get autorizada => estado == 'autorizada';
  bool get dentro => estado == 'dentro';

  /// Visitante que espera en portería a que el residente visitado lo autorice o lo rechace.
  bool get solicitada => estado == 'solicitada';
}

class Mensaje {
  final int id;
  final String cuerpo;
  final DateTime creadoEn;
  final int autorId;
  final String autor;
  final String rol;
  Mensaje({required this.id, required this.cuerpo, required this.creadoEn, required this.autorId, required this.autor, required this.rol});

  factory Mensaje.fromJson(Map<String, dynamic> j) => Mensaje(
        id: (j['id'] as num).toInt(),
        cuerpo: j['cuerpo'] as String,
        creadoEn: _f(j['creado_en']),
        autorId: j['autor_id'] as int,
        autor: j['autor'] as String,
        rol: j['rol'] as String,
      );
}

/// Conversación de portería con un residente (la ve el personal).
class Hilo {
  final int residenteId;
  final String nombre;
  final String? unidad;
  final String? ultimo;
  final DateTime? ultimoEn;
  final String? telefono;
  final bool sinLeer;
  Hilo({required this.residenteId, required this.nombre, this.unidad, this.ultimo, this.ultimoEn, this.telefono, this.sinLeer = false});

  factory Hilo.fromJson(Map<String, dynamic> j) => Hilo(
        residenteId: j['residente_id'] as int,
        nombre: j['nombre'] as String,
        unidad: j['unidad'] as String?,
        ultimo: j['ultimo'] as String?,
        ultimoEn: _fn(j['ultimo_en']),
        telefono: j['telefono'] as String?,
        sinLeer: j['sin_leer'] == true,
      );
}

class Comunicado {
  final int id;
  final String titulo;
  final String cuerpo;
  final bool importante;
  final DateTime creadoEn;
  final String? autor;
  Comunicado({required this.id, required this.titulo, required this.cuerpo, required this.importante, required this.creadoEn, this.autor});

  factory Comunicado.fromJson(Map<String, dynamic> j) => Comunicado(
        id: j['id'] as int,
        titulo: j['titulo'] as String,
        cuerpo: j['cuerpo'] as String,
        importante: j['importante'] as bool,
        creadoEn: _f(j['creado_en']),
        autor: j['autor'] as String?,
      );
}

class Pqrs {
  final int id;
  final String tipo; // peticion | queja | reclamo | sugerencia
  final String asunto;
  final String descripcion;
  final String estado; // registrada | en_proceso | cerrada | cancelada
  final String? respuesta;
  final DateTime creadoEn;
  final String usuario;
  final String? unidad;
  final String? respondidoPor;
  Pqrs({
    required this.id,
    required this.tipo,
    required this.asunto,
    required this.descripcion,
    required this.estado,
    this.respuesta,
    required this.creadoEn,
    required this.usuario,
    this.unidad,
    this.respondidoPor,
  });

  factory Pqrs.fromJson(Map<String, dynamic> j) => Pqrs(
        id: j['id'] as int,
        tipo: j['tipo'] as String,
        asunto: j['asunto'] as String,
        descripcion: j['descripcion'] as String,
        estado: j['estado'] as String,
        respuesta: j['respuesta'] as String?,
        creadoEn: _f(j['creado_en']),
        usuario: j['usuario'] as String,
        unidad: j['unidad'] as String?,
        respondidoPor: j['respondido_por'] as String?,
      );

  bool get cerrada => estado == 'cerrada' || estado == 'cancelada';
}

class UsuarioFila {
  final int id;
  final String nombre;
  final String correo;
  final String estado;
  final String rol;
  final String? unidad;
  final String? telefono;
  UsuarioFila({required this.id, required this.nombre, required this.correo, required this.estado, required this.rol, this.unidad, this.telefono});

  factory UsuarioFila.fromJson(Map<String, dynamic> j) => UsuarioFila(
        id: j['id'] as int,
        nombre: j['nombre'] as String,
        correo: j['correo'] as String,
        estado: j['estado'] as String,
        rol: j['rol'] as String,
        unidad: j['unidad'] as String?,
        telefono: j['telefono'] as String?,
      );
}

class Paquete {
  final int id;
  final String tipo; // paquete | domicilio | correspondencia
  final String? descripcion;
  final String estado; // por_recoger | entregado
  final DateTime recibidoEn;
  final DateTime? entregadoEn;
  final String? entregadoA;
  final String unidad;
  final String? recibidoPor;
  final DateTime? enCaminoEn;
  Paquete({required this.id, required this.tipo, this.descripcion, required this.estado, required this.recibidoEn, this.entregadoEn, this.entregadoA, required this.unidad, this.recibidoPor, this.enCaminoEn});

  factory Paquete.fromJson(Map<String, dynamic> j) => Paquete(
        id: j['id'] as int,
        tipo: j['tipo'] as String,
        descripcion: j['descripcion'] as String?,
        estado: j['estado'] as String,
        recibidoEn: _f(j['recibido_en']),
        entregadoEn: _fn(j['entregado_en']),
        entregadoA: j['entregado_a'] as String?,
        unidad: j['unidad'] as String,
        recibidoPor: j['recibido_por'] as String?,
        enCaminoEn: _fn(j['en_camino_en']),
      );

  bool get porRecoger => estado == 'por_recoger';

  /// El residente avisó hace poco que ya va a recoger.
  bool get vieneEnCamino => porRecoger && enCaminoEn != null && DateTime.now().difference(enCaminoEn!).inMinutes < 30;
}

class Incidencia {
  final int id;
  final String descripcion;
  final String gravedad; // baja | media | alta
  final String estado; // registrada | en_revision | en_proceso | cerrada | cancelada
  final String? respuesta;
  final DateTime creadoEn;
  final String reportadoPor;
  final String? zona;
  final String? atendidoPor;
  Incidencia({required this.id, required this.descripcion, required this.gravedad, required this.estado, this.respuesta, required this.creadoEn, required this.reportadoPor, this.zona, this.atendidoPor});

  factory Incidencia.fromJson(Map<String, dynamic> j) => Incidencia(
        id: j['id'] as int,
        descripcion: j['descripcion'] as String,
        gravedad: j['gravedad'] as String,
        estado: j['estado'] as String,
        respuesta: j['respuesta'] as String?,
        creadoEn: _f(j['creado_en']),
        reportadoPor: j['reportado_por'] as String,
        zona: j['zona'] as String?,
        atendidoPor: j['atendido_por'] as String?,
      );

  bool get cerrada => estado == 'cerrada' || estado == 'cancelada';
}

class Anotacion {
  final int id;
  final String tipo; // novedad | ronda | alerta
  final String descripcion;
  final DateTime creadoEn;
  final String? autor;
  Anotacion({required this.id, required this.tipo, required this.descripcion, required this.creadoEn, this.autor});

  factory Anotacion.fromJson(Map<String, dynamic> j) => Anotacion(
        id: j['id'] as int,
        tipo: j['tipo'] as String,
        descripcion: j['descripcion'] as String,
        creadoEn: _f(j['creado_en']),
        autor: j['autor'] as String?,
      );
}

typedef UnidadItem = ({int id, String nombre});

/// Residente al que puede visitar alguien que llega a portería sin autorización previa.
typedef ResidenteItem = ({int id, String nombre, String unidad});

/// Ficha del directorio de portería. El teléfono solo aparece si el residente autorizó compartirlo.
typedef Contacto = ({int id, String nombre, String? unidad, String? telefono});

/// Aviso de la bandeja de notificaciones.
class Notificacion {
  final int id;
  final String tipo;
  final String titulo;
  final String mensaje;
  final int? referenciaId;
  final bool leida;
  final DateTime creadoEn;
  Notificacion({required this.id, required this.tipo, required this.titulo, required this.mensaje, this.referenciaId, required this.leida, required this.creadoEn});

  factory Notificacion.fromJson(Map<String, dynamic> j) => Notificacion(
        id: j['id'] as int,
        tipo: j['tipo'] as String,
        titulo: j['titulo'] as String,
        mensaje: j['mensaje'] as String,
        referenciaId: (j['referencia_id'] as num?)?.toInt(),
        leida: j['leida'] as bool,
        creadoEn: _f(j['creado_en']),
      );
}

/// Respuesta de la consulta ligera que la app repite cada pocos segundos.
class ResumenAvisos {
  final int sinLeer;
  final int chatSinLeer;
  final int ultimoId;
  final List<Notificacion> nuevas;
  ResumenAvisos({required this.sinLeer, required this.chatSinLeer, required this.ultimoId, required this.nuevas});

  factory ResumenAvisos.fromJson(Map<String, dynamic> j) => ResumenAvisos(
        sinLeer: j['sin_leer'] as int? ?? 0,
        chatSinLeer: j['chat_sin_leer'] as int? ?? 0,
        ultimoId: j['ultimo_id'] as int? ?? 0,
        nuevas: ((j['nuevas'] as List?) ?? []).map((e) => Notificacion.fromJson(e as Map<String, dynamic>)).toList(),
      );
}
