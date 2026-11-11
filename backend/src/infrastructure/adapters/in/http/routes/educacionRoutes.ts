import { Router } from 'express';
import { pool } from '../../../../adapters/out/persistence/postgres/db';
import { autenticar, autorizarRoles, RequestAutenticado } from '../middlewares/authMiddleware';
import { evaluarRespuestaAcademia } from '../../../../../domain/services/evaluarRespuestaAcademia';

const router = Router();
router.use(autenticar);

router.get('/moderacion', autorizarRoles('moderador', 'supervisor'), async (_req, res, next) => {
  try {
    const [lecciones, participantes, completados] = await Promise.all([
      pool.query(`
        SELECT l.id, l.titulo, l.ruta, l.orden, l.publicada,
               COUNT(p.usuario_id)::int AS iniciados,
               COUNT(p.usuario_id) FILTER (WHERE p.estado = 'completada')::int AS completados
        FROM academia_leccion l
        LEFT JOIN academia_progreso p ON p.leccion_id = l.id
        GROUP BY l.id, l.titulo, l.ruta, l.orden
        ORDER BY l.orden`),
      pool.query("SELECT COUNT(*)::int AS total FROM usuario WHERE estado='activo'"),
      pool.query("SELECT COUNT(DISTINCT usuario_id)::int AS total FROM academia_progreso WHERE estado='completada'"),
    ]);
    res.json({
      alcance: 'agregado-anonimo',
      lecciones: lecciones.rows,
      participantes: participantes.rows[0]?.total ?? 0,
      participantesConProgreso: completados.rows[0]?.total ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/moderacion/lecciones/:leccionId/publicar', autorizarRoles('supervisor'), async (req, res, next) => {
  try {
    const { publicada = true } = req.body as { publicada?: boolean };
    const result = await pool.query(
      `UPDATE academia_leccion SET publicada=$2 WHERE id=$1 RETURNING id, publicada`,
      [req.params.leccionId, Boolean(publicada)],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'LeccionNoEncontrada', mensaje: 'La lección educativa no existe.' });
    }
    res.json({
      leccionId: req.params.leccionId,
      publicada: result.rows[0].publicada,
      mensaje: Boolean(publicada) ? 'Lección publicada para los participantes.' : 'Lección retirada de publicación.',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', autorizarRoles('usuario'), async (req: RequestAutenticado, res, next) => {
  try {
    const lecciones = await pool.query(
      `SELECT l.*, p.estado, COALESCE(p.puntaje,0) puntaje, COALESCE(p.intentos,0) intentos
       FROM academia_leccion l LEFT JOIN academia_progreso p
       ON p.leccion_id=l.id AND p.usuario_id=$1
       WHERE l.publicada = TRUE
       ORDER BY l.orden`,
      [req.usuario!.id],
    );
    const leccionesVisibles = lecciones.rows.map((leccion) => ({
      ...leccion,
      contenido: Array.isArray(leccion.contenido)
        ? leccion.contenido.map((bloque: Record<string, unknown>) => {
          if (bloque.tipo !== 'quiz') return bloque;
          return Object.fromEntries(Object.entries(bloque).filter(([clave]) => clave !== 'respuesta'));
        })
        : leccion.contenido,
    }));
    const metas = await pool.query(
      'SELECT * FROM meta_financiera WHERE usuario_id=$1 AND estado<>$2 ORDER BY fecha_limite NULLS LAST, id DESC',
      [req.usuario!.id, 'cancelada'],
    );
    const presupuestos = await pool.query(
      'SELECT * FROM presupuesto_categoria WHERE usuario_id=$1 ORDER BY periodo DESC, categoria',
      [req.usuario!.id],
    );
    const completadas = leccionesVisibles.filter((l) => l.estado === 'completada').length;
    const recomendaciones = completadas < 2
      ? [{ tipo: 'aprender', titulo: 'Empieza por presupuesto', mensaje: 'Completa la primera ruta para convertir tus gastos en decisiones sostenibles.' }]
      : [{ tipo: 'meta', titulo: 'Revisa tus metas', mensaje: 'Compara tu progreso mensual y ajusta aportes realistas.' }];
    res.json({ lecciones: leccionesVisibles, metas: metas.rows, presupuestos: presupuestos.rows, progreso: { completadas, total: leccionesVisibles.length }, recomendaciones });
  } catch (error) {
    next(error);
  }
});

router.post('/progreso', autorizarRoles('usuario'), async (req: RequestAutenticado, res, next) => {
  try {
    const { leccionId, respuesta } = req.body as { leccionId: string; respuesta: number };
    if (!leccionId || !Number.isInteger(respuesta)) {
      return res.status(400).json({ error: 'Datos de progreso inválidos.' });
    }
    const leccion = await pool.query(
      'SELECT contenido FROM academia_leccion WHERE id=$1 AND publicada=TRUE',
      [leccionId],
    );
    if (leccion.rowCount === 0) {
      return res.status(404).json({ error: 'Lección no encontrada o no publicada.' });
    }
    const puntaje = evaluarRespuestaAcademia(leccion.rows[0].contenido, respuesta);
    const completada = puntaje >= 70;
    const result = await pool.query(
      `INSERT INTO academia_progreso(usuario_id,leccion_id,estado,puntaje,intentos,completada_at)
       VALUES($1,$2,$3,$4,1,$5)
       ON CONFLICT(usuario_id,leccion_id) DO UPDATE SET
       estado=CASE WHEN EXCLUDED.puntaje>=70 OR academia_progreso.estado='completada' THEN 'completada' ELSE 'iniciada' END,
       puntaje=GREATEST(EXCLUDED.puntaje, academia_progreso.puntaje),
       intentos=academia_progreso.intentos+1,
       completada_at=COALESCE(academia_progreso.completada_at, CASE WHEN EXCLUDED.puntaje>=70 THEN NOW() ELSE NULL END),
       actualizada_at=NOW()
       RETURNING *`,
      [req.usuario!.id, leccionId, completada ? 'completada' : 'iniciada', puntaje, completada ? new Date() : null],
    );
    res.json({ progreso: result.rows[0], aprobada: completada });
  } catch (error) {
    next(error);
  }
});

router.post('/presupuestos', autorizarRoles('usuario'), async (req: RequestAutenticado, res, next) => {
  try {
    const { categoria, periodo, montoLimite } = req.body;
    if (!categoria || !/^\d{4}-\d{2}$/.test(periodo) || !Number.isFinite(Number(montoLimite))) {
      return res.status(400).json({ error: 'Datos de presupuesto inválidos.' });
    }
    const result = await pool.query(
      `INSERT INTO presupuesto_categoria(usuario_id,categoria,periodo,monto_limite)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(usuario_id,categoria,periodo) DO UPDATE SET monto_limite=EXCLUDED.monto_limite
       RETURNING *`,
      [req.usuario!.id, categoria, periodo, Number(montoLimite)],
    );
    res.status(201).json({ presupuesto: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/metas', autorizarRoles('usuario'), async (req: RequestAutenticado, res, next) => {
  try {
    const { titulo, montoObjetivo, montoActual = 0, fechaLimite } = req.body;
    if (!titulo || !Number.isFinite(Number(montoObjetivo)) || Number(montoObjetivo) <= 0) {
      return res.status(400).json({ error: 'Datos de meta inválidos.' });
    }
    const result = await pool.query(
      `INSERT INTO meta_financiera(usuario_id,titulo,monto_objetivo,monto_actual,fecha_limite)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.usuario!.id, titulo, Number(montoObjetivo), Number(montoActual), fechaLimite || null],
    );
    res.status(201).json({ meta: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch('/metas/:metaId', autorizarRoles('usuario'), async (req: RequestAutenticado, res, next) => {
  try {
    const montoActual = Number(req.body.montoActual);
    if (!Number.isFinite(montoActual) || montoActual < 0) {
      return res.status(400).json({ error: 'Monto de ahorro inválido.' });
    }
    const result = await pool.query(
      `UPDATE meta_financiera SET monto_actual=$1,
       estado=CASE WHEN $1>=monto_objetivo THEN 'completada' ELSE 'activa' END
       WHERE id=$2 AND usuario_id=$3 RETURNING *`,
      [montoActual, Number(req.params.metaId), req.usuario!.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Meta no encontrada.' });
    res.json({ meta: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/metas/:metaId/aportes', autorizarRoles('usuario'), async (req: RequestAutenticado, res, next) => {
  try {
    const aporte = Number(req.body.aporte);
    if (!Number.isFinite(aporte) || aporte <= 0) {
      return res.status(400).json({ error: 'El aporte de ahorro debe ser mayor que cero.' });
    }
    const result = await pool.query(
      `UPDATE meta_financiera
       SET monto_actual = monto_actual + $1,
           estado = CASE WHEN monto_actual + $1 >= monto_objetivo THEN 'completada' ELSE 'activa' END
       WHERE id = $2 AND usuario_id = $3 AND estado <> 'cancelada'
       RETURNING *`,
      [aporte, Number(req.params.metaId), req.usuario!.id],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Meta no encontrada.' });
    res.json({ meta: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
