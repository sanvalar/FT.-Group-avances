import { request } from './http.js';

/**
 * Cliente para consultas GraphQL contra el endpoint /graphql.
 * Permite seleccionar campos especificos evitando el over-fetching.
 */
export async function queryGraphQL(query, variables = {}) {
  const respuesta = await request('/../graphql', {
    method: 'POST',
    auth: true,
    body: { query, variables },
  });

  if (respuesta?.errors && respuesta.errors.length > 0) {
    throw new Error(respuesta.errors[0]?.message || 'Error en la consulta GraphQL');
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
    return data?.usuarios || [];
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
        }
      }
    `;
    const data = await queryGraphQL(query);
    return data?.misGrupos || [];
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
