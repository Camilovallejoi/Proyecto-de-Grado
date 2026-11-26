import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { autenticar, exigirRol } from '../auth.js';

export const reportesRouter = Router();
reportesRouter.use(autenticar, exigirRol('administrador'));

// Resumen de gestión de los últimos N días para la administración.
reportesRouter.get('/resumen', async (req, res) => {
  const cop = req.user!.copropiedadId;
  const { dias } = z.object({ dias: z.coerce.number().int().min(1).max(90).default(30) }).parse(req.query);
  const q = (sql: string) => pool.query(sql, [cop, dias]).then((r) => r.rows);

  const [reservasZona, ingresosDia, portonRows, pqrsEstado, usuarios, paquetes, incidencias] = await Promise.all([
    // El historial de reservas se borra al terminar; el uso de zonas sale de la auditoría.
    q(`SELECT COALESCE(z.nombre, 'Zona eliminada') AS zona, count(*)::int AS reservas
         FROM registro_auditoria a LEFT JOIN zona_comun z ON z.id = (a.detalle->>'zona_id')::int
        WHERE a.copropiedad_id = $1 AND a.accion = 'crear_reserva' AND a.creado_en >= now() - make_interval(days => $2::int)
        GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT to_char(entrada_en AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS dia, count(*)::int AS ingresos
         FROM visita WHERE copropiedad_id = $1 AND entrada_en >= now() - make_interval(days => $2::int)
        GROUP BY 1 ORDER BY 1`),
    q(`SELECT count(*) FILTER (WHERE estado = 'atendido')::int AS atendidos,
              count(*) FILTER (WHERE estado = 'vencido')::int AS vencidos,
              count(*) FILTER (WHERE estado = 'cancelado')::int AS cancelados,
              round(avg(extract(epoch FROM atendido_en - creado_en)) FILTER (WHERE estado = 'atendido') / 60.0, 1)::float AS minutos_promedio
         FROM aviso_porton WHERE copropiedad_id = $1 AND creado_en >= now() - make_interval(days => $2::int)`),
    q(`SELECT estado, count(*)::int AS cantidad FROM pqrs
        WHERE copropiedad_id = $1 AND creado_en >= now() - make_interval(days => $2::int) GROUP BY estado`),
    q(`SELECT r.nombre AS rol, count(*)::int AS cantidad FROM usuario u JOIN rol r ON r.id = u.rol_id
        WHERE u.copropiedad_id = $1 AND u.estado = 'activo' AND $2::int > 0 GROUP BY r.nombre`),
    q(`SELECT count(*)::int AS recibidos, count(*) FILTER (WHERE estado = 'entregado')::int AS entregados,
              count(*) FILTER (WHERE estado = 'por_recoger')::int AS por_recoger
         FROM paquete WHERE copropiedad_id = $1 AND recibido_en >= now() - make_interval(days => $2::int)`),
    q(`SELECT estado, count(*)::int AS cantidad FROM incidencia
        WHERE copropiedad_id = $1 AND creado_en >= now() - make_interval(days => $2::int) GROUP BY estado`),
  ]);

  const visitasHoy = await pool.query(`SELECT count(*) FILTER (WHERE estado = 'dentro')::int AS dentro FROM visita WHERE copropiedad_id = $1`, [cop]);
  res.json({
    dias,
    reservas_por_zona: reservasZona,
    ingresos_por_dia: ingresosDia,
    porton: portonRows[0],
    pqrs_por_estado: pqrsEstado,
    usuarios_activos: usuarios,
    paquetes: paquetes[0],
    incidencias_por_estado: incidencias,
    visitantes_dentro: visitasHoy.rows[0].dentro,
  });
});
