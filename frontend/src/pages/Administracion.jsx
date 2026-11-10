import { useEffect, useState } from 'react'
import { Alert, Loader, PageHeader } from '../components/ui'
import Icon from '../components/Icon'
import { adminApi } from '../services/adminApi'

const ROL_LABEL = {
  usuario: 'Usuario',
  moderador: 'Moderador',
  supervisor: 'Supervisor',
}

export default function Administracion({ user }) {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const esSupervisor = user.rol === 'supervisor'

  useEffect(() => {
    adminApi.users()
      .then(setUsuarios)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const updateUser = async (id, action, value) => {
    setError('')
    setMensaje('')
    try {
      const actualizado = action === 'rol'
        ? await adminApi.changeRole(id, value)
        : await adminApi.changeStatus(id, value)
      setUsuarios(actuales => actuales.map(usuario => usuario.id === id ? actualizado : usuario))
      setMensaje('Cambios guardados correctamente.')
    } catch (err) {
      setError(err.message)
    }
  }

  const activos = usuarios.filter(usuario => usuario.estado === 'activo').length
  const moderadores = usuarios.filter(usuario => usuario.rol === 'moderador').length
  const supervisores = usuarios.filter(usuario => usuario.rol === 'supervisor').length

  return (
    <>
      <PageHeader
        title="Administración"
        subtitle={esSupervisor
          ? 'Gestiona cuentas, estados y roles de acceso.'
          : 'Revisa las cuentas y gestiona el estado de usuarios estándar.'}
      />
      <Alert>{error}</Alert>
      <Alert type="success">{mensaje}</Alert>

      <div className="stats admin-stats">
        <article className="stat">
          <span className="stat-label">Cuentas registradas</span>
          <strong className="stat-value">{usuarios.length}</strong>
          <small>Usuarios de FT. GROUP</small>
        </article>
        <article className="stat">
          <span className="stat-label">Cuentas activas</span>
          <strong className="stat-value">{activos}</strong>
          <small>Con acceso habilitado</small>
        </article>
        <article className="stat">
          <span className="stat-label">Equipo de gestión</span>
          <strong className="stat-value">{moderadores + supervisores}</strong>
          <small>{moderadores} moderadores · {supervisores} supervisores</small>
        </article>
      </div>

      <section className="section">
        <div className="section-head admin-section-head">
          <h2 className="section-title">Cuentas de usuario</h2>
          <span className="muted small">{usuarios.length} en total</span>
        </div>
        {loading ? <Loader label="Cargando usuarios…" /> : usuarios.length === 0 ? (
          <div className="card admin-empty">
            <Icon name="users" size={24} />
            <strong>No hay cuentas para mostrar.</strong>
          </div>
        ) : (
          <div className="admin-users">
            {usuarios.map(usuario => {
              const propia = usuario.id === user.id
              const puedeGestionarEstado = !propia && (esSupervisor || usuario.rol === 'usuario')
              return (
                <article className="admin-user-row" key={usuario.id}>
                  <div className="admin-user-ident">
                    <span className="admin-user-icon"><Icon name="user" size={19} /></span>
                    <span>
                      <strong>{usuario.nombre}{propia ? ' (tú)' : ''}</strong>
                      <small>{usuario.email}</small>
                    </span>
                  </div>
                  <span className={`pill ${usuario.estado === 'activo' ? 'pill-ok' : ''}`}>{usuario.estado}</span>
                  <span className={`admin-role admin-role-${usuario.rol}`}>
                    <Icon name="shield" size={14} />{ROL_LABEL[usuario.rol]}
                  </span>
                  <div className="admin-user-controls">
                    {puedeGestionarEstado ? (
                      <label className="admin-control">
                        <span>Estado</span>
                        <select
                          aria-label={`Estado de ${usuario.nombre}`}
                          value={usuario.estado}
                          onChange={event => updateUser(usuario.id, 'estado', event.target.value)}
                        >
                          <option value="activo">Activo</option>
                          <option value="inactivo">Inactivo</option>
                          <option value="bloqueado">Bloqueado</option>
                        </select>
                      </label>
                    ) : <small className="muted">{propia ? 'Tu cuenta' : 'Solo supervisor puede gestionar esta cuenta'}</small>}
                    {esSupervisor && !propia && (
                      <label className="admin-control">
                        <span>Rol</span>
                        <select
                          aria-label={`Rol de ${usuario.nombre}`}
                          value={usuario.rol}
                          onChange={event => updateUser(usuario.id, 'rol', event.target.value)}
                        >
                          <option value="usuario">Usuario</option>
                          <option value="moderador">Moderador</option>
                          <option value="supervisor">Supervisor</option>
                        </select>
                      </label>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <p className="admin-footnote"><Icon name="shield" size={15} /> Los permisos se verifican también en el backend; ocultar controles no concede acceso.</p>
    </>
  )
}
