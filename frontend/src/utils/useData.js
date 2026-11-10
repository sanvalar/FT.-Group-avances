import { useCallback, useEffect, useState } from 'react'

/** Carga datos asíncronos con estados de carga/error y función de recarga. */
export function useData(loader, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(async () => {
    setError('')
    try { setData(await loader()) }
    catch (err) { setError(err.message || 'No fue posible cargar la información.') }
    finally { setLoading(false) }
  }, deps)

  useEffect(() => { reload() }, [reload])
  return { data, error, loading, reload }
}
