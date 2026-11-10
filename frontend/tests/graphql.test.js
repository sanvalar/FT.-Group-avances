import test from 'node:test';
import assert from 'node:assert/strict';
import { graphqlApi } from '../src/services/graphqlApi.js';
import { API_URL, GRAPHQL_URL } from '../src/services/http.js';

test('graphqlApi estructura las consultas GraphQL adecuadamente', () => {
  assert.equal(typeof graphqlApi.obtenerUsuarios, 'function');
  assert.equal(typeof graphqlApi.obtenerYo, 'function');
  assert.equal(typeof graphqlApi.obtenerMisGrupos, 'function');
  assert.equal(typeof graphqlApi.obtenerGruposArchivados, 'function');
  assert.equal(typeof graphqlApi.obtenerMiPanel, 'function');
  assert.equal(typeof graphqlApi.obtenerFinanzasUsuario, 'function');
  assert.equal(typeof graphqlApi.cambiarEstadoUsuario, 'function');
  assert.equal(typeof graphqlApi.cambiarRolUsuario, 'function');
  assert.equal(typeof graphqlApi.archivarGrupo, 'function');
  assert.equal(typeof graphqlApi.desactivarUsuario, 'function');
});

test('el cliente GraphQL deriva su endpoint correctamente desde API_URL', () => {
  const apiBase = API_URL.replace(/\/+$/, '');
  const expected = apiBase.endsWith('/api')
    ? `${apiBase.slice(0, -4)}/graphql`
    : `${apiBase}/graphql`;
  assert.equal(GRAPHQL_URL, expected);
});
