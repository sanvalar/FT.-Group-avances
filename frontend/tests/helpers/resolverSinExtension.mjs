// Hook de resolución para node --test: el código del frontend importa
// módulos sin extensión ('../utils/format'), como permite Vite. Node exige
// la extensión, así que aquí se reintenta añadiendo ".js".
export async function resolve(especificador, contexto, siguiente) {
  try {
    return await siguiente(especificador, contexto)
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && especificador.startsWith('.') && !/\.[cm]?js$/.test(especificador)) {
      return siguiente(`${especificador}.js`, contexto)
    }
    throw error
  }
}
