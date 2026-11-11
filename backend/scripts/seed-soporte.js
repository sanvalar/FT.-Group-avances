require('dotenv').config();
const { Pool } = require('pg');

if (process.env.NODE_ENV === 'production') {
  console.error('El seeder de casos de soporte está bloqueado en producción.');
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'ft_group',
});

const casos = [
  {
    asunto: 'Demo · No puedo unirme a un grupo',
    categoria: 'grupos',
    descripcion: 'Al aceptar una invitación a un grupo, aparece un mensaje de que el enlace ya no es válido.',
    prioridad: 'alta',
    estado: 'abierto',
    mensajes: [
      { rol: 'usuario', contenido: 'La invitación todavía aparece como pendiente para quien la envió.' },
    ],
  },
  {
    asunto: 'Demo · Un gasto no se dividió correctamente',
    categoria: 'divisiones',
    descripcion: 'Registré un gasto compartido, pero el monto asignado a uno de los integrantes no coincide.',
    prioridad: 'normal',
    estado: 'en_revision',
    mensajes: [
      { rol: 'usuario', contenido: 'El total del gasto es correcto; el problema está en la distribución entre integrantes.' },
      { rol: 'moderador', contenido: 'Estamos revisando la configuración de división del gasto. ¿Podrías confirmar si se eligió una división personalizada?' },
    ],
  },
  {
    asunto: 'Demo · No aparece el comprobante del pago',
    categoria: 'pagos',
    descripcion: 'Reporté un pago hace unos minutos, pero no encuentro el comprobante adjunto en el movimiento.',
    prioridad: 'normal',
    estado: 'resuelto',
    mensajes: [
      { rol: 'usuario', contenido: 'El archivo se había cargado, pero no se veía en el detalle del pago.' },
      { rol: 'moderador', contenido: 'Actualizamos el registro y el comprobante ya aparece en el detalle del movimiento.' },
    ],
  },
  {
    asunto: 'Demo · El balance del grupo tarda en actualizarse',
    categoria: 'balances',
    descripcion: 'Después de confirmar una liquidación, el balance del grupo seguía mostrando el saldo anterior.',
    prioridad: 'baja',
    estado: 'cerrado',
    mensajes: [
      { rol: 'usuario', contenido: 'El balance se actualizó luego de volver a cargar la página.' },
      { rol: 'moderador', contenido: 'Gracias por avisarnos. El saldo quedó actualizado y cerramos el caso.' },
    ],
  },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [20261111]);

    const usuarios = await client.query(
      `SELECT id, email, rol
       FROM usuario
       WHERE email = ANY($1::text[])`,
      [['usuario@ftgroup.test', 'moderador@ftgroup.test']],
    );
    const usuario = usuarios.rows.find((fila) => fila.email === 'usuario@ftgroup.test');
    const moderador = usuarios.rows.find((fila) => fila.email === 'moderador@ftgroup.test');

    if (!usuario || usuario.rol !== 'usuario' || !moderador || moderador.rol !== 'moderador') {
      throw new Error('Primero ejecuta npm run seed:roles para crear las cuentas de demostración.');
    }

    let creados = 0;
    for (const caso of casos) {
      const existente = await client.query(
        'SELECT id FROM ticket_soporte WHERE usuario_id = $1 AND asunto = $2',
        [usuario.id, caso.asunto],
      );
      let ticketId = existente.rows[0]?.id;

      if (!ticketId) {
        const anio = new Date().getFullYear();
        const consecutivo = await client.query(
          `INSERT INTO ticket_consecutivo (anio, ultimo)
           VALUES ($1, 1)
           ON CONFLICT (anio) DO UPDATE SET ultimo = ticket_consecutivo.ultimo + 1
           RETURNING ultimo`,
          [anio],
        );
        const numero = `FT-${anio}-${String(consecutivo.rows[0].ultimo).padStart(4, '0')}`;
        const atendidoPor = caso.estado === 'abierto' ? null : moderador.id;
        const fechaCierre = ['resuelto', 'cerrado'].includes(caso.estado);
        const insertado = await client.query(
          `INSERT INTO ticket_soporte
             (numero, usuario_id, categoria, asunto, descripcion, prioridad, estado, atendido_por, fecha_cierre)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CASE WHEN $9 THEN NOW() ELSE NULL END)
           RETURNING id`,
          [
            numero,
            usuario.id,
            caso.categoria,
            caso.asunto,
            caso.descripcion,
            caso.prioridad,
            caso.estado,
            atendidoPor,
            fechaCierre,
          ],
        );
        ticketId = insertado.rows[0].id;
        creados += 1;
      }

      for (const mensaje of caso.mensajes) {
        const autorId = mensaje.rol === 'usuario' ? usuario.id : moderador.id;
        await client.query(
          `INSERT INTO ticket_mensaje (ticket_id, autor_id, autor_rol, contenido)
           SELECT $1, $2, $3, $4
           WHERE NOT EXISTS (
             SELECT 1 FROM ticket_mensaje
             WHERE ticket_id = $1 AND autor_id = $2 AND contenido = $4
           )`,
          [ticketId, autorId, mensaje.rol, mensaje.contenido],
        );
      }
    }

    await client.query('COMMIT');
    console.log(`Casos de demostración listos: ${casos.length} en total, ${creados} nuevos.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

seed()
  .catch((error) => {
    console.error('No se pudieron generar los casos de soporte:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
