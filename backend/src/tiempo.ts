// Colombia no usa horario de verano: America/Bogota es siempre UTC-5.
const OFFSET_MS = -5 * 3600 * 1000;

export function aLocal(fecha: Date) {
  const d = new Date(fecha.getTime() + OFFSET_MS);
  return {
    dia: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`,
    diaSemana: d.getUTCDay(), // 0 = domingo
    minutos: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

// 'HH:MM' o 'HH:MM:SS' -> minutos desde medianoche
export function minutosDeHora(hora: string) {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// 'YYYY-MM-DD' (hora de Bogotá) -> [inicio, fin) del día en UTC
export function limitesDelDia(fecha: string) {
  const inicio = new Date(`${fecha}T00:00:00-05:00`);
  return { inicio, fin: new Date(inicio.getTime() + 24 * 3600 * 1000) };
}
