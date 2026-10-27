// Colombia (America/Bogota) es siempre UTC-5, sin horario de verano.
const _diasSemana = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const _meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/// Convierte un instante a "hora de pared" de Bogotá (los campos de la fecha devuelta son la hora local).
DateTime aBogota(DateTime instante) => instante.toUtc().subtract(const Duration(hours: 5));

/// Instante (UTC) correspondiente a una fecha y hora de pared de Bogotá.
DateTime desdeBogota(DateTime dia, int minutosDelDia) =>
    DateTime.utc(dia.year, dia.month, dia.day).add(Duration(minutes: minutosDelDia + 5 * 60));

DateTime hoyBogota() {
  final b = aBogota(DateTime.now());
  return DateTime.utc(b.year, b.month, b.day);
}

String fechaIso(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String hhmm(int minutos) => '${(minutos ~/ 60).toString().padLeft(2, '0')}:${(minutos % 60).toString().padLeft(2, '0')}';

int minutosDeHhmm(String s) {
  final p = s.split(':');
  return int.parse(p[0]) * 60 + int.parse(p[1]);
}

String fechaLarga(DateTime d) => '${_diasSemana[d.weekday - 1]} ${d.day} ${_meses[d.month - 1]}';

String fechaHoraBogota(DateTime instante) {
  final b = aBogota(instante);
  return '${fechaLarga(b)}, ${hhmm(b.hour * 60 + b.minute)}';
}
