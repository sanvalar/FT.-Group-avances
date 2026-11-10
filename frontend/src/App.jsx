import React, { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { authApi } from './services/authApi'
import { tokens } from './services/http'
import Layout from './components/Layout'
import { Login, Register } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Groups from './pages/Groups'
import Expenses from './pages/Expenses'
import History from './pages/History'
import Analisis from './pages/Analisis'
import Scan from './pages/Scan'
import Soporte from './pages/Soporte'
import Profile from './pages/Profile'
import Administracion from './pages/Administracion'
import Auditoria from './pages/Auditoria'
import EstadoSistema from './pages/EstadoSistema'
import BrandMark from './components/BrandMark'
import EducacionFinanciera from './pages/EducacionFinanciera'
import Supervision from './pages/Supervision'
import Moderacion from './pages/Moderacion'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('App ErrorBoundary caught:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', maxWidth: '500px', margin: '40px auto', background: 'var(--surface)', borderRadius: '16px', border: '1px solid var(--line)', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--accent-hi)', marginBottom: '12px' }}>Algo salió mal</h2>
          <p style={{ color: 'var(--muted)', marginBottom: '20px', fontSize: '14px' }}>
            {this.state.error?.message || 'Error inesperado en la interfaz.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ hasError: false })
              window.location.reload()
            }}
          >
            Recargar aplicación
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Protected({ user, onLogout, children, roles, exceptRoles, redirectTo = '/panel' }) {
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.rol)) return <Navigate to="/panel" replace />
  if (exceptRoles?.includes(user.rol)) return <Navigate to={redirectTo} replace />
  return (
    <Layout user={user} onLogout={onLogout}>
      <ErrorBoundary>
        {children}
      </ErrorBoundary>
    </Layout>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(authApi.hasSession())

  useEffect(() => {
    if (!authApi.hasSession()) {
      setLoading(false)
      return
    }
    authApi.restore()
      .then(u => setUser(u))
      .catch(() => tokens.clear())
      .finally(() => setLoading(false))
  }, [])

  const logout = async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
  }

  if (loading) return <div className="splash"><BrandMark /><span className="spinner" /></div>

  const props = { user }
  const home = user?.rol === 'supervisor' ? '/supervision' : user?.rol === 'moderador' ? '/moderacion' : '/panel'
  const page = el => <Protected user={user} onLogout={logout}>{el}</Protected>
  const userModulePage = el => <Protected user={user} onLogout={logout} exceptRoles={['supervisor', 'moderador']} redirectTo={home}>{el}</Protected>
  const staffPage = el => <Protected user={user} onLogout={logout} roles={['moderador', 'supervisor']}>{el}</Protected>
  const moderatorPage = el => <Protected user={user} onLogout={logout} roles={['moderador']}>{el}</Protected>
  const supervisorPage = el => <Protected user={user} onLogout={logout} roles={['supervisor']}>{el}</Protected>
  const supportPage = <Protected user={user} onLogout={logout} exceptRoles={['supervisor']} redirectTo="/supervision"><Soporte {...props} /></Protected>

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login onLogin={setUser} />} />
        <Route path="/registro" element={user ? <Navigate to={home} replace /> : <Register />} />
        <Route path="/panel" element={userModulePage(<Dashboard {...props} />)} />
        <Route path="/grupos" element={userModulePage(<Groups {...props} />)} />
        <Route path="/gastos" element={userModulePage(<Expenses {...props} />)} />
        <Route path="/historial" element={userModulePage(<History {...props} />)} />
        <Route path="/analisis" element={userModulePage(<Analisis {...props} />)} />
        <Route path="/educacion" element={page(<EducacionFinanciera {...props} />)} />
        <Route path="/indicadores" element={<Navigate to="/analisis" replace />} />
        <Route path="/escanear" element={userModulePage(<Scan {...props} />)} />
        <Route path="/perfil" element={page(<Profile user={user} setUser={setUser} onLogout={logout} />)} />
        <Route path="/moderacion" element={moderatorPage(<Moderacion />)} />
        <Route path="/supervision" element={supervisorPage(<Supervision />)} />
        <Route path="/administracion" element={staffPage(<Administracion {...props} />)} />
        <Route path="/auditoria" element={supervisorPage(<Auditoria />)} />
        <Route path="/estado-sistema" element={supervisorPage(<EstadoSistema />)} />
        <Route path="/soporte" element={supportPage} />
        <Route path="*" element={<Navigate to={user ? home : '/login'} replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
