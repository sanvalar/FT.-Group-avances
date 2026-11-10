/* ============================================================================
   FT. GROUP — Generador de histórico sintético (12 meses)
   ----------------------------------------------------------------------------
   Uso:
     1. Abre la app en http://localhost:5173 e inicia sesión.
     2. Abre la consola del navegador (F12 → pestaña Console).
     3. Pega TODO este archivo y presiona Enter.
     4. Recarga la página (F5).

   Qué hace:
     - Conserva tus usuarios, grupos y miembros actuales.
     - Reemplaza los gastos por 12 meses de datos simulados con estacionalidad.
     - Respeta el esquema del documento técnico: GASTO, DIVISION_GASTO
       (monto_asignado, estado_pago, fecha_pago) e HISTORIAL.
     - Es determinista: la semilla fija genera siempre los mismos datos.

   Para deshacer: usa "Empezar vacío" o "Restaurar demostración" en Mi perfil.
   ========================================================================== */

(function seedHistorico() {
  const MESES = 12;          // meses hacia atrás (incluye el actual)
  const SEMILLA = 20261007;  // cambia este número para otro escenario

  /* ---------- utilidades ---------- */

  // Generador congruencial determinista (mulberry32).
  let _s = SEMILLA >>> 0;
  const rnd = () => {
    _s = (_s + 0x6D2B79F5) >>> 0;
    let t = _s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entre = (a, b) => a + rnd() * (b - a);
  const entero = (a, b) => Math.round(entre(a, b));
  const elegir = arr => arr[Math.floor(rnd() * arr.length)];
  const miles = n => Math.round(n / 1000) * 1000;

  // Reparto equitativo sin perder pesos (idéntico a utils/balances.js).
  const splitEqual = (total, ids) => {
    const n = ids.length;
    if (!n) return [];
    const base = Math.floor(total / n);
    let resto = total - base * n;
    return ids.map(usuario_id => {
      const extra = resto > 0 ? 1 : 0;
      resto -= extra;
      return { usuario_id, monto_asignado: base + extra };
    });
  };

  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sumarDias = (fecha, dias) => {
    const d = new Date(fecha + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return d;
  };

  /* ---------- localizar el estado ---------- */

  const claves = Object.keys(localStorage).filter(k => k.startsWith('ft_finanzas_'));
  if (!claves.length) {
    console.error('No se encontró el almacenamiento de FT. GROUP. Inicia sesión primero y vuelve a ejecutar.');
    return;
  }
  const clave = claves[0];
  const st = JSON.parse(localStorage.getItem(clave));
  const me = String(clave.replace('ft_finanzas_', ''));

  if (!st.grupos || !st.grupos.length) {
    console.error('No hay grupos. Crea al menos un grupo (o restaura la demostración) y vuelve a ejecutar.');
    return;
  }

  /* ---------- catálogo de gastos por tipo de grupo ---------- */

  // [descripción, categoría, monto mínimo, monto máximo, veces al mes]
  const PLANTILLAS = {
    building: [   // hogar
      ['Arriendo del mes',        'vivienda',        1150000, 1250000, 1],
      ['Servicios públicos',      'servicios',        210000,  340000, 1],
      ['Internet y TV',           'servicios',         95000,  120000, 1],
      ['Mercado semanal',         'alimentacion',     260000,  420000, 4],
      ['Aseo y droguería',        'otro',              45000,  110000, 2],
      ['Domicilio de comida',     'alimentacion',      38000,   95000, 3],
      ['Gas domiciliario',        'servicios',         32000,   58000, 1],
    ],
    safe: [       // trabajo / caja chica
      ['Papelería y suministros', 'oficina',          180000,  360000, 1],
      ['Cafetería de oficina',    'alimentacion',      60000,  140000, 2],
      ['Tóner de impresora',      'oficina',          190000,  260000, 1],
      ['Transporte mensajería',   'transporte',        25000,   70000, 2],
    ],
    plane: [      // viaje (solo meses de temporada)
      ['Tiquetes de avión',       'transporte',       980000, 1480000, 1],
      ['Hotel – noches',          'alojamiento',      820000, 1980000, 1],
      ['Cena del grupo',          'alimentacion',     180000,  340000, 2],
      ['Tour y entradas',         'entretenimiento',  120000,  290000, 2],
      ['Taxis y traslados',       'transporte',        45000,  120000, 3],
    ],
    otros: [
      ['Compra conjunta',         'otro',              80000,  260000, 2],
      ['Salida del grupo',        'entretenimiento',  110000,  280000, 1],
      ['Mercado compartido',      'alimentacion',     140000,  320000, 2],
    ],
  };

  // Estacionalidad: factor multiplicador por mes (1 = enero).
  const ESTACION = { 1: 0.92, 2: 0.95, 3: 1.00, 4: 1.00, 5: 1.03, 6: 1.12, 7: 1.10, 8: 1.00, 9: 0.98, 10: 1.02, 11: 1.06, 12: 1.28 };
  const MESES_VIAJE = [6, 7, 12];   // los grupos de viaje solo gastan en temporada
  const TENDENCIA = 0.006;          // ~0,6 % de inflación mensual acumulada

  /* ---------- generación ---------- */

  const hoy = new Date();
  const gastos = [];
  const divisiones = [];
  const historial = [];
  let n = 0;

  for (let atras = MESES - 1; atras >= 0; atras--) {
    const ref = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
    const anio = ref.getFullYear();
    const mes = ref.getMonth() + 1;
    const diasMes = new Date(anio, mes, 0).getDate();
    const topeDia = atras === 0 ? hoy.getDate() : diasMes;  // el mes actual va hasta hoy
    const factor = ESTACION[mes] * (1 + TENDENCIA * (MESES - 1 - atras));

    for (const g of st.grupos) {
      if (g.estado !== 'activo') continue;
      const miembros = st.miembros
        .filter(m => m.grupo_id === g.id && m.estado === 'activo')
        .map(m => m.usuario_id);
      if (!miembros.length) continue;

      const esViaje = g.icono === 'plane';
      if (esViaje && !MESES_VIAJE.includes(mes)) continue;

      const plantilla = PLANTILLAS[g.icono] || PLANTILLAS.otros;

      // El mes en curso va solo hasta hoy: se reduce la frecuencia en proporción
      // a los días transcurridos, para que la proyección tenga sentido.
      const avance = atras === 0 ? topeDia / diasMes : 1;

      for (const [desc, categoria, min, max, vecesMes] of plantilla) {
        let veces = vecesMes === 1 ? 1 : entero(Math.max(1, vecesMes - 1), vecesMes);
        if (avance < 1) {
          const esperados = veces * avance;
          veces = Math.floor(esperados) + (rnd() < esperados % 1 ? 1 : 0);
        }
        if (veces <= 0) continue;
        for (let i = 0; i < veces; i++) {
          const dia = Math.min(topeDia, entero(1, Math.min(diasMes, topeDia)));
          const fecha_gasto = iso(new Date(anio, mes - 1, dia));
          const monto = miles(entre(min, max) * factor);
          if (monto <= 0) continue;

          const pagador_id = elegir(miembros);
          const id = `s-${++n}`;
          const esOcr = rnd() < 0.18;

          gastos.push({
            id, grupo_id: g.id, pagador_id, descripcion: desc,
            monto_total: monto, fecha_gasto, categoria,
            tipo_division: 'equitativa',
            origen_registro: esOcr ? 'ocr' : 'manual',
            fecha_registro: fecha_gasto,
          });

          // Los meses viejos están casi todos saldados; el actual, a medias.
          const probPago = atras === 0 ? 0.35 : atras === 1 ? 0.80 : 0.96;

          for (const div of splitEqual(monto, miembros)) {
            const esPagador = div.usuario_id === pagador_id;
            const pagado = esPagador || rnd() < probPago;
            divisiones.push({
              gasto_id: id,
              ...div,
              estado_pago: pagado ? 'pagado' : 'pendiente',
              fecha_pago: pagado
                ? (esPagador ? fecha_gasto : iso(sumarDias(fecha_gasto, entero(1, 18))))
                : null,
            });
          }

          historial.push({
            id: `h-${n}`, usuario_id: pagador_id, grupo_id: g.id, gasto_id: id,
            tipo_movimiento: 'gasto_creado',
            descripcion: `${desc} · $${monto.toLocaleString('es-CO')}`,
            fecha: new Date(`${fecha_gasto}T12:00:00`).toISOString(),
          });
        }
      }
    }
  }

  /* ---------- guardar ---------- */

  st.gastos = gastos;
  st.divisiones = divisiones;
  st.historial = historial.reverse();   // el historial va del más reciente al más antiguo
  st.recibos = st.recibos || [];
  st.demo = true;

  localStorage.setItem(clave, JSON.stringify(st));

  /* ---------- resumen ---------- */

  const total = gastos.reduce((s, g) => s + g.monto_total, 0);
  const porMes = {};
  for (const g of gastos) {
    const m = g.fecha_gasto.slice(0, 7);
    porMes[m] = (porMes[m] || 0) + g.monto_total;
  }
  const pendientes = divisiones.filter(d => d.estado_pago === 'pendiente').length;

  console.log('%cHistórico sintético generado', 'color:#E8871E;font-weight:bold;font-size:14px');
  console.log(`Gastos: ${gastos.length}  ·  Divisiones: ${divisiones.length}  ·  Pendientes: ${pendientes}`);
  console.log(`Total simulado: $${total.toLocaleString('es-CO')}`);
  console.table(
    Object.entries(porMes).sort().map(([mes, monto]) => ({ mes, total: monto.toLocaleString('es-CO') }))
  );
  console.log('%cRecarga la página (F5) para ver los datos.', 'color:#2E7D32;font-weight:bold');
})();
