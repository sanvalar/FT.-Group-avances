import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { Router } from 'express';
import { pool } from '../../../../adapters/out/persistence/postgres/db';
import { autenticar, RequestAutenticado } from '../middlewares/authMiddleware';

const router = Router();
router.use(autenticar);

router.post('/', async (req: RequestAutenticado, res, next) => {
  try {
    const { gastoId, grupoId, titulo, montoTotal, moneda, fechaLimitePago, clausulaImpago, participantes } = req.body;
    if (!Number.isSafeInteger(Number(gastoId)) || !Number.isSafeInteger(Number(grupoId)) ||
        !Number.isFinite(Number(montoTotal)) || !Array.isArray(participantes) || participantes.length === 0) {
      return res.status(400).json({ error: 'Datos del contrato incompletos o inválidos.' });
    }
    const contratoId = randomUUID();
    await pool.query('BEGIN');
    await pool.query(
      `INSERT INTO contrato_gasto
       (id, gasto_id, grupo_id, creador_id, titulo, monto_total, moneda, fecha_limite_pago, clausula_impago)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [contratoId, Number(gastoId), Number(grupoId), req.usuario!.id, titulo, Number(montoTotal),
       moneda || 'COP', fechaLimitePago, clausulaImpago || 'RESTRUCTURACION'],
    );
    for (const participante of participantes) {
      const usuarioId = Number(participante.usuarioId);
      const montoAsignado = Number(participante.montoAsignado);
      if (!Number.isSafeInteger(usuarioId) || !Number.isFinite(montoAsignado)) {
        throw new Error('Participante inválido.');
      }
      await pool.query(
        `INSERT INTO contrato_firma (id, contrato_id, usuario_id, monto_asignado)
         VALUES ($1,$2,$3,$4)`,
        [randomUUID(), contratoId, usuarioId, montoAsignado],
      );
    }
    await pool.query('COMMIT');
    return res.status(201).json({ contrato: { id: contratoId, estado: 'PENDIENTE_FIRMAS' } });
  } catch (error) {
    await pool.query('ROLLBACK');
    next(error);
  }
});

router.get('/:contratoId', async (req, res, next) => {
  try {
    const contrato = await pool.query('SELECT * FROM contrato_gasto WHERE id = $1', [req.params.contratoId]);
    if (contrato.rowCount === 0) return res.status(404).json({ error: 'Contrato no encontrado.' });
    const firmas = await pool.query(
      `SELECT f.*, u.nombre, u.email FROM contrato_firma f
       JOIN usuario u ON u.id = f.usuario_id WHERE f.contrato_id = $1 ORDER BY f.id`,
      [req.params.contratoId],
    );
    return res.json({ contrato: contrato.rows[0], firmas: firmas.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/:contratoId/firmar', async (req: RequestAutenticado, res, next) => {
  try {
    const hash = crypto.createHash('sha256')
      .update(`${req.params.contratoId}:${req.usuario!.id}:${req.body.acepta !== false}`)
      .digest('hex');
    const firma = await pool.query(
      `UPDATE contrato_firma SET firmado = $1, fecha_firma = CASE WHEN $1 THEN NOW() ELSE NULL END, hash_firma = $2
       WHERE contrato_id = $3 AND usuario_id = $4 RETURNING *`,
      [req.body.acepta === true, hash, req.params.contratoId, req.usuario!.id],
    );
    if (firma.rowCount === 0) return res.status(403).json({ error: 'No eres participante de este contrato.' });
    await pool.query(
      `UPDATE contrato_gasto SET estado = CASE WHEN NOT EXISTS (
         SELECT 1 FROM contrato_firma WHERE contrato_id = $1 AND firmado = false
       ) THEN 'ACTIVO' ELSE estado END WHERE id = $1`,
      [req.params.contratoId],
    );
    return res.status(200).json({ firma: firma.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
