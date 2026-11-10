import React, { useState } from 'react';
import { contractsApi } from '../services/contractsApi';

export default function SmartContractEduComponent({ gasto, participantes = [], onContractCreated }) {
  const [clausula, setClausula] = useState('RESTRUCTURACION');
  const [fechaLimite, setFechaLimite] = useState('');
  const [firmas, setFirmas] = useState(participantes.map(p => ({ ...p, firmado: false })));
  const [contratoCreado, setContratoCreado] = useState(false);
  const [contratoId, setContratoId] = useState('');

  const handleFirmar = async (id) => {
    if (!contratoId) return;
    await contractsApi.sign(contratoId, true);
    setFirmas(firmas.map(f => f.id === id ? { ...f, firmado: true, fechaFirma: new Date().toLocaleTimeString() } : f));
  };

  const handleCrearContrato = async () => {
    setContratoCreado(true);
    try {
      const resultado = await contractsApi.create({
        gastoId: gasto?.id,
        grupoId: gasto?.grupo_id,
        titulo: gasto?.descripcion || 'Gasto compartido',
        montoTotal: gasto?.monto_total || gasto?.monto || 0,
        moneda: gasto?.moneda || 'COP',
        fechaLimitePago: fechaLimite,
        clausulaImpago: clausula,
        participantes: firmas.map(f => ({ usuarioId: f.id, montoAsignado: f.monto || 0 })),
      });
      setContratoId(resultado.contrato.id);
      if (onContractCreated) onContractCreated(resultado.contrato);
    } catch (error) {
      setContratoCreado(false);
      console.error(error);
      return;
    }
  };

  return (
    <div style={{ background: '#0f172a', color: '#f8fafc', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #334155', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, color: '#38bdf8', fontSize: '1.25rem', fontWeight: 600 }}>
          📜 Acuerdo de Compromiso Digital & FT-Score
        </h3>
        <span style={{ background: '#1e293b', color: '#f59e0b', padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.85rem', border: '1px solid #78350f' }}>
          💡 Educación Financiera
        </span>
      </div>

      <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Este contrato vincula la responsabilidad de pago del grupo. El cumplimiento puntual incrementará tu <strong>FT-Score</strong> (Puntaje Crediticio Grupal), dándote acceso a insignias y beneficios en la plataforma.
      </p>

      {!contratoCreado ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>
              ¿Qué hacer si un participante no paga a tiempo? (Cláusula de Resolución)
            </label>
            <select 
              value={clausula} 
              onChange={(e) => setClausula(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', background: '#1e293b', color: '#fff', border: '1px solid #475569' }}
            >
              <option value="RESTRUCTURACION">🔄 Plan de Reestructuración en Micro-Cuotas (Sin penalización inicial)</option>
              <option value="FONDO_COBERTURA">🛡️ Cobertura por Fondo del Grupo (Recargo de 0.05% interés diario)</option>
              <option value="PENALIZACION_SCORE">⚠️ Penalización Directa de FT-Score (-50 pts en Reputación)</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>
              Fecha Límite de Pago Acordada
            </label>
            <input 
              type="date" 
              value={fechaLimite}
              onChange={(e) => setFechaLimite(e.target.value)}
              style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', background: '#1e293b', color: '#fff', border: '1px solid #475569' }}
            />
          </div>

          <button 
            onClick={handleCrearContrato}
            disabled={!fechaLimite}
            style={{ marginTop: '0.5rem', padding: '0.75rem', borderRadius: '0.5rem', background: fechaLimite ? '#0284c7' : '#334155', color: '#fff', fontWeight: 600, border: 'none', cursor: fechaLimite ? 'pointer' : 'not-allowed' }}
          >
            Generar Contrato de Compromiso Grupal
          </button>
        </div>
      ) : (
        <div>
          <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '0.75rem', marginBottom: '1rem', borderLeft: '4px solid #10b981' }}>
            <div style={{ fontWeight: 600, color: '#34d399' }}>Contrato Activo #FT-{Math.floor(1000 + Math.random() * 9000)}</div>
            <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '0.25rem' }}>
              Cláusula activa: <strong>{clausula}</strong> | Fecha Límite: <strong>{fechaLimite}</strong>
            </div>
          </div>

          <h4 style={{ color: '#e2e8f0', fontSize: '1rem', marginBottom: '0.5rem' }}>Firmas Digitales de los Participantes:</h4>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {firmas.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1e293b', padding: '0.6rem 1rem', borderRadius: '0.5rem' }}>
                <div>
                  <span style={{ fontWeight: 500, color: '#f8fafc' }}>{p.nombre}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.5rem' }}>(${p.monto || 0} COP)</span>
                </div>
                {p.firmado ? (
                  <span style={{ color: '#34d399', fontSize: '0.85rem', fontWeight: 600 }}>
                    ✅ Firmado ({p.fechaFirma})
                  </span>
                ) : (
                  <button 
                    onClick={() => handleFirmar(p.id)}
                    style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    Aceptar y Firmar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
