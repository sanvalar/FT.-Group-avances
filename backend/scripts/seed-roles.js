require('dotenv').config();
const argon2 = require('argon2');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'ft_group'
});

async function seed() {
  console.log('🌱 Ejecutando Seeder de Usuarios y Roles de Prueba...');
  try {
    // Roles de prueba
    const users = [
      { email: 'usuario@ftgroup.test', nombre: 'Carlos Usuario', password: 'Usuario2026!', rol: 'usuario', score: 780, nivel: 'Plata' },
      { email: 'moderador@ftgroup.test', nombre: 'Ana Moderadora', password: 'Moderador2026!', rol: 'moderador', score: 850, nivel: 'Oro' },
      { email: 'supervisor@ftgroup.test', nombre: 'Sanny Supervisora', password: 'Supervisor2026!', rol: 'supervisor', score: 920, nivel: 'Diamante' }
    ];

    for (const u of users) {
      const passwordHash = await argon2.hash(u.password);
      const usuario = await pool.query(
        `INSERT INTO usuario (email, nombre, password_hash, rol, estado)
         VALUES ($1, $2, $3, $4, 'activo')
         ON CONFLICT (email) DO UPDATE
         SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash,
             rol = EXCLUDED.rol, estado = 'activo'
         RETURNING id`,
        [u.email, u.nombre, passwordHash, u.rol]
      );
      
      await pool.query(
        `INSERT INTO usuario_ft_score (usuario_id, ft_score, nivel) 
         VALUES ($1, $2, $3)
         ON CONFLICT (usuario_id) DO UPDATE SET ft_score = $2, nivel = $3;`,
        [usuario.rows[0].id, u.score, u.nivel]
      );
    }
    console.log('✅ Usuarios de prueba creados exitosamente:');
    console.log(' - Usuario Común: usuario@ftgroup.test (Rol: usuario)');
    console.log(' - Moderador: moderador@ftgroup.test (Rol: moderador)');
    console.log(' - Supervisor: supervisor@ftgroup.test (Rol: supervisor)');
  } catch (err) {
    console.error('Error en seeder:', err);
  } finally {
    await pool.end();
  }
}

seed();
