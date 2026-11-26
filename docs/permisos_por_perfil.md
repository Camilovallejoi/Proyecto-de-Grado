# Permisos por perfil

Criterios de diseño:

1. **Mínimo privilegio:** cada perfil ve y hace solo lo que necesita para su trabajo.
2. **Separación de funciones:** el vigilante lleva la operación diaria (acceso, visitas, paquetes, reservas y minuta); la administración gestiona el conjunto (comunicados, PQRS, incidencias, usuarios, unidades y zonas comunes) y se apoya en el resumen de gestión, que muestra cifras agregadas sin datos de la operación persona por persona. Los sitios consultados describen un perfil de portería aparte del administrativo (ConjuntosApp, Residentia, Mi Conjunto); en Edifia la portería consulta las reservas pero no las crea ni las aprueba, así que el reparto de reservas de Cantaluna es una decisión propia.
3. **Privacidad de los datos personales:** la Ley 1581 de 2012 considera a la copropiedad responsable del tratamiento de los datos de residentes, visitantes y empleados. Por eso cada residente ve solo lo suyo, el chat es privado entre residente y vigilante, y los datos de los visitantes (nombre, documento, placa) solo los ven quien los registra, el vigilante que los recibe y la administración en el registro de ingresos.

Leyenda: **Ver** = solo lectura; **Hacer** = puede crear o modificar; **—** = sin acceso.

## Matriz

| Módulo | Residente | Vigilante | Administración |
|---|---|---|---|
| Zonas comunes (consulta) | Ver zonas activas | Ver todas | Ver todas |
| Zonas: crear, editar horarios y reglas, poner en mantenimiento y eliminar | — | Hacer | Hacer |
| Reservas: reservar y cancelar las propias | Hacer | — | — |
| Reservas del conjunto: ver, cancelar y eliminar | — | Hacer | — |
| Aviso de llegada al portón: enviar y cancelar el propio | Hacer (solo los suyos) | — | — |
| Avisos del portón del conjunto: ver | — | Ver | — |
| Avisos del portón: atender (abrir) | — | Hacer | — |
| Visitantes: autorizar, ver y cancelar los propios (QR) | Hacer (solo los suyos) | — | — |
| Visitantes: validar código, registrar entrada y salida | — | Hacer | — |
| Visitante sin autorización previa: pedir autorización al residente que visita | — | Hacer | — |
| Visitante sin autorización previa: autorizar o rechazar | Hacer (solo el residente visitado) | — | — |
| Visitas por atender y registro de ingresos | — | Ver | — |
| Paquetes y domicilios: ver los de su unidad y avisar «ya voy» | Hacer (solo su unidad) | — | — |
| Paquetes y domicilios: registrar y entregar | — | Hacer | — |
| Paquetes y domicilios: ver todos | — | Ver | — |
| Chat residente–vigilante | Hacer (solo el suyo) | Hacer (con cada residente) | — |
| Minuta de portería | — | Hacer | Ver (las alertas le llegan al instante) |
| Incidencias: reportar | Hacer | Hacer | — |
| Incidencias: ver | Ver (las suyas) | Ver (todas) | Ver (todas) |
| Incidencias: dar seguimiento y cerrar | — | — | Hacer |
| Comunicados: leer | Ver | Ver | Ver |
| Comunicados: publicar y eliminar | — | — | Hacer |
| PQRS: radicar y ver las propias | Hacer | — | — |
| PQRS: ver todas, responder y cerrar | — | — | Hacer |
| Llamar a portería (número único) | Hacer | Ver | Ver |
| Número de portería: registrar y cambiar | — | — | Hacer |
| Teléfono propio: registrar (con autorización) y borrar | Hacer | — | — |
| Teléfonos de residentes: ver | Nunca los de otros | Ver (solo quienes autorizaron) y llamar | Ver en la gestión de usuarios |
| Bandeja de notificaciones | La propia | La propia | La propia |
| Usuarios: listar, agregar residentes y vigilantes, activar o desactivar | — | — | Hacer |
| Contraseña: cambiar la propia | Hacer | Hacer | Hacer |
| Contraseña: restablecer la de residentes y vigilantes (con identidad confirmada) | — | — | Hacer |
| Unidades e invitaciones | — | — | Hacer |
| Resumen de gestión (reportes) | — | — | Ver |

## Decisiones que conviene justificar en el documento

- **Un solo número de portería y teléfonos con autorización.** Los vigilantes rotan, así que no se expone su celular personal. El residente decide si comparte el suyo: se le muestra para qué se usará (Ley 1581 de 2012), puede borrarlo cuando quiera y solo lo ven el vigilante (para llamarlo) y la administración (que gestiona los datos del conjunto). La llamada se hace con el marcador del teléfono, sin permiso especial de la app.
- **Dos maneras de dar de alta a un residente.** Con un **código de invitación** (el residente crea su contraseña y decide si comparte su teléfono) o **agregado por la administración** (útil para quien no se registra solo). En el segundo caso, y para los vigilantes, la contraseña es temporal: el servidor no deja usar la app hasta cambiarla. La administración no puede registrar el teléfono de nadie, porque la autorización de la Ley 1581 la da el titular.
- **Olvido de contraseña: restablece la administración.** Debe confirmar la identidad en persona o llamando a un número que ya conocía. La app muestra una contraseña temporal una sola vez; vence en 24 horas, obliga a crear una nueva, cierra las sesiones abiertas, desconecta las notificaciones del teléfono, queda en la auditoría (sin la contraseña) y deja un aviso al titular. Nadie puede restablecer desde la app la cuenta de la administración: se hace en el servidor con `npm run admin:clave -- correo`.
- **Desactivar a un usuario anula lo que tenía vigente.** Sus visitas autorizadas (y sus códigos QR) dejan de servir, su aviso de portón y sus reservas futuras se cancelan, su teléfono deja de recibir avisos y su sesión termina de inmediato.

- **La administración gestiona, no opera.** No ve ni atiende el portón, las visitas, el registro de ingresos, los paquetes, las reservas ni los chats; el servidor lo impide, no solo la pantalla. Conserva la minuta (las alertas le llegan al instante) y las incidencias porque son insumo de la gestión. Consecuencia: si una zona que quiere eliminar tiene reservas futuras, debe pedir a portería que las cancele, o dejarla en mantenimiento. Y si un conjunto necesita revisar un ingreso concreto, hoy solo puede consultarlo el vigilante.
- **El vigilante tiene el control operativo de las zonas y las reservas.** Crea, configura, pone en mantenimiento y elimina zonas (igual que la administración), y es quien ve, cancela y elimina reservas; toda acción queda en la auditoría. Es una decisión de diseño propia: en Edifia, por ejemplo, la portería solo consulta las reservas y las recibe la administración, por lo que conviene justificarla con el diagnóstico de campo.
- **Un visitante sin autorización previa no entra hasta que el residente visitado lo autorice.** El vigilante elige a qué residente visita y le envía una solicitud; solo ese residente (no otros de su unidad, ni el vigilante, ni la administración) puede responder, tiene 10 minutos y no puede acumular más de 3 solicitudes pendientes. Si no responde, la solicitud vence y el vigilante sigue el procedimiento del conjunto (por ejemplo, llamarlo). Es el esquema de Edifia, donde la portería registra y pide autorización, y el residente responde.
- **El residente no ve a otros residentes.** Ni sus avisos de llegada, visitas, paquetes o conversaciones; tampoco el registro de ingresos ni la minuta.

## Fuentes

- Sitios oficiales consultados el 24 de noviembre de 2026: [ConjuntosApp](https://conjuntosapp.co/), [Residentia](https://residentia.net/), [Edifia](https://edifia.com.co/residentes) y [Mi Conjunto](https://www.109apps.com) (ver `docs/comparativa_apps.md`).
- Ley 1581 de 2012, de protección de datos personales: [texto en Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
- Superintendencia de Industria y Comercio, [Guía sobre el Tratamiento de Datos Personales en la Propiedad Horizontal](https://www.hklaw.com/es/insights/publications/2020/12/colombia-delegation-for-protection-of-personal-data-publishes-guide) (diciembre de 2020; la fuente enlazada es un resumen de un despacho de abogados, conviene consultar la guía original en el sitio de la SIC).
- La búsqueda de tesis y proyectos académicos sobre sistemas de propiedad horizontal no arrojó una matriz de permisos por rol comparable; solo confirma que intervienen residentes, guardas y administradores. La matriz anterior es, por tanto, una propuesta de diseño propia apoyada en las aplicaciones comerciales y en la normativa, y debe validarse con los administradores y vigilantes del diagnóstico de campo.

## Conservación y borrado de datos

El criterio es guardar cada dato solo mientras sirve (minimización). El servidor revisa los vencimientos cada 20 segundos y borra cada 10 minutos.

| Dato | Qué pasa |
|---|---|
| Solicitud de visita sin respuesta | Vence a los 10 minutos; se avisa al vigilante (para que llame) y al residente |
| Aviso de portón sin atender | Vence a los 30 minutos y se avisa al residente; se borra a las 24 horas |
| Reservas | Se borran al terminar; las canceladas a las 24 horas. Recordatorio una hora antes |
| Visitas en las que nadie entró (canceladas, vencidas, rechazadas, sin respuesta) | 7 días |
| Registro de ingresos y minuta | 90 días |
| Chat y paquetes entregados | 30 días (en las listas diarias del vigilante, los entregados se ven 24 horas) |
| Notificaciones | Las leídas 7 días; todas 30 días. Un aviso nuevo del mismo asunto reemplaza al anterior y los resueltos se marcan solos |
| Registros de teléfonos para notificaciones | Se borran si no se renuevan en 60 días, al cerrar sesión o al desactivar la cuenta |
| Invitaciones | Vencidas sin usar, 7 días; usadas, 90 días |
| Contraseña temporal de un restablecimiento | Deja de servir a las 24 horas si no se cambió |
| Auditoría | 1 año |

Estos plazos son una propuesta de diseño; conviene confirmarlos con la administración del conjunto piloto y con la política de tratamiento de datos.

