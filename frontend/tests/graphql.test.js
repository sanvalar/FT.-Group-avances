import test from 'node:test';
import assert from 'node:assert/strict';
import { graphqlApi } from '../src/services/graphqlApi.js';

test('graphqlApi estructura las consultas GraphQL adecuadamente', () => {
  assert.equal(typeof graphqlApi.obtenerUsuarios, 'function');
  assert.equal(typeof graphqlApi.obtenerMisGrupos, 'function');
  assert.equal(typeof graphqlApi.archivarGrupo, 'function');
  assert.equal(typeof graphqlApi.desactivarUsuario, 'function');
});
