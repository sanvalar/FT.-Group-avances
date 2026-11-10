import { request, GRAPHQL_URL, ApiError } from './http.js';

/**
 * Cliente para consultas GraphQL contra el endpoint /graphql.
 * Permite seleccionar campos especificos evitando el over-fetching.
 */
export async function queryGraphQL(query, variables = {}) {
  let respuesta;
  try {
    respuesta = await request(GRAPHQL_URL, {
      method: 'POST',
      auth: true,
      body: { query, variables },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;

    console.error(JSON.stringify({
      level: 'error',
      type: 'graphql_request_failed',
      errorName: error instanceof Error ? error.name : 'Error',
    }));
    throw new ApiError('No fue posible completar la solicitud GraphQL.', 0);
  }

  if (respuesta?.errors && respuesta.errors.length > 0) {
    const error = respuesta.errors[0];
    const codigo = error?.extensions?.code;
    const estados = {
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      BAD_USER_INPUT: 400,
      NOT_FOUND: 404,
      CONFLICT: 409,
      SERVICE_UNAVAILABLE: 503,
      INTERNAL_SERVER_ERROR: 500,
    };
    throw new ApiError(
      error?.message || 'Error en la consulta GraphQL',
      estados[codigo] || 400,
      respuesta.errors,
    )
  }

  return respuesta?.data;
}

export const graphqlApi = {
  /**
   * Consulta usuarios combinando Base de Datos Activa y Cold Storage (Inactivos)
   */
  async obtenerUsuarios(estado = null) {
    const query = `
      query ObtenerUsuarios($estado: EstadoUsuario) {
        usuarios(estado: $estado) {
          id
          nombre
          email
          rol
          estado
          fechaRegistro
          origenBaseDatos
        }
      }
    `;
    const data = await queryGraphQL(query, { estado });
    return (data?.usuarios || []).map(usuario => ({ ...usuario, id: Number(usuario.id) }));
  },

  async obtenerYo() {
    const data = await queryGraphQL('query { yo { id nombre email rol estado fechaRegistro } }');
    return data?.yo ? { ...data.yo, id: Number(data.yo.id) } : null;
  },

  async obtenerGruposArchivados() {
    const data = await queryGraphQL(`
      query {
        gruposArchivados {
          id
          nombre
          descripcion
          estado
          fechaCreacion
        }
      }
    `);
    return data?.gruposArchivados || [];
  },

  /**
   * Consulta grupos activos con GraphQL
   */
  async obtenerMisGrupos() {
    const query = `
      query {
        misGrupos {
          id
          nombre
          descripcion
          rol
          miembrosActivos
          fechaCreacion
          icono
          ciudad
          totalGastos
          numGastos
          miBalance
          miembros {
            id
            nombre
            email
            rol
          }
        }
      }
    `;
    const data = await queryGraphQL(query);
    return (data?.misGrupos || []).map(grupo => ({
      ...grupo,
      total_gastos: grupo.totalGastos,
      num_gastos: grupo.numGastos,
      mi_balance: grupo.miBalance,
    }));
  },

  async obtenerMiPanel() {
    const query = `
      query ObtenerMiPanel {
        miPanel {
          teDeben
          debes
          balance
          grupos {
            id
            nombre
            descripcion
            rol
            miembrosActivos
            fechaCreacion
            icono
            ciudad
            totalGastos
            numGastos
            miBalance
            miembros {
              id
              nombre
              email
              rol
            }
          }
          liquidaciones {
            grupo_id
            grupo
            de
            para
            monto
            deUsuario { id nombre }
            paraUsuario { id nombre }
          }
        }
      }
    `;
    const data = await queryGraphQL(query);
    const panel = data?.miPanel;
    if (!panel) return null;
    return {
      ...panel,
      grupos: (panel.grupos || []).map(grupo => ({
        ...grupo,
        total_gastos: grupo.totalGastos,
        num_gastos: grupo.numGastos,
        mi_balance: grupo.miBalance,
      })),
    };
  },

  async obtenerFinanzasUsuario(usuarioId, { limite = 50, offset = 0 } = {}) {
    const query = `
      query FinanzasUsuario($usuarioId: ID!, $limite: Int!, $offset: Int!) {
        finanzasUsuario(usuarioId: $usuarioId, limite: $limite, offset: $offset) {
          usuario { id nombre email rol estado fechaRegistro }
          resumen { grupos gastos montoPagado montoAsignado montoPendiente }
          grupos {
            id
            nombre
            estado
            rol
            fechaUnion
            fechaCreacion
            numeroGastos
          }
          gastos {
            id
            grupoId
            grupo
            pagadorId
            pagador
            descripcion
            montoTotal
            fechaGasto
            categoria
            montoAsignado
            estadoPago
            fechaPago
          }
          paginacion { limite offset total }
        }
      }
    `;
    const data = await queryGraphQL(query, { usuarioId: String(usuarioId), limite, offset });
    return data?.finanzasUsuario;
  },

  async cambiarEstadoUsuario(usuarioId, estado) {
    const query = `
      mutation CambiarEstadoUsuario($usuarioId: ID!, $estado: EstadoUsuario!) {
        cambiarEstadoUsuario(usuarioId: $usuarioId, estado: $estado) {
          id nombre email rol estado fechaRegistro origenBaseDatos
        }
      }
    `;
    const data = await queryGraphQL(query, { usuarioId: String(usuarioId), estado });
    return { ...data.cambiarEstadoUsuario, id: Number(data.cambiarEstadoUsuario.id) };
  },

  async cambiarRolUsuario(usuarioId, rol) {
    const query = `
      mutation CambiarRolUsuario($usuarioId: ID!, $rol: RolUsuario!) {
        cambiarRolUsuario(usuarioId: $usuarioId, rol: $rol) {
          id nombre email rol estado fechaRegistro origenBaseDatos
        }
      }
    `;
    const data = await queryGraphQL(query, { usuarioId: String(usuarioId), rol });
    return { ...data.cambiarRolUsuario, id: Number(data.cambiarRolUsuario.id) };
  },

  /**
   * Archiva un grupo y lo transfiere a la base de datos historica
   */
  async archivarGrupo(grupoId) {
    const query = `
      mutation Archivar($grupoId: ID!) {
        archivarGrupo(grupoId: $grupoId)
      }
    `;
    const data = await queryGraphQL(query, { grupoId: String(grupoId) });
    return data?.archivarGrupo;
  },

  /**
   * Desactiva un usuario trasladandolo a la BD historica / cold storage
   */
  async desactivarUsuario(usuarioId) {
    const query = `
      mutation Desactivar($usuarioId: ID!) {
        desactivarUsuario(usuarioId: $usuarioId) {
          id
          nombre
          estado
          origenBaseDatos
        }
      }
    `;
    const data = await queryGraphQL(query, { usuarioId: String(usuarioId) });
    return data?.desactivarUsuario;
  },
};
