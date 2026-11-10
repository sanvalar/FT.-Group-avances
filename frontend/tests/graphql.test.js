import test from 'node:test';
import assert from 'node:assert/strict';
import { graphqlApi, queryGraphQL } from '../src/services/graphqlApi.js';
import { API_URL, GRAPHQL_URL } from '../src/services/http.js';
import { ApiError } from '../src/services/http.js';

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

test('el cliente GraphQL traduce errores de autorización en ApiError 403', async () => {
  const fetchOriginal = globalThis.fetch;
  const storageOriginal = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} };
  globalThis.fetch = async () => new Response(JSON.stringify({
    errors: [{ message: 'No tienes permisos.', extensions: { code: 'FORBIDDEN' } }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  try {
    await assert.rejects(queryGraphQL('{ usuarios { id } }'), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 403);
      assert.equal(error.message, 'No tienes permisos.');
      return true;
    });
  } finally {
    globalThis.fetch = fetchOriginal;
    globalThis.sessionStorage = storageOriginal;
  }
});

test('el cliente GraphQL captura y reporta errores de transporte', async () => {
  const fetchOriginal = globalThis.fetch;
  const storageOriginal = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} };
  globalThis.fetch = async () => { throw new Error('detalle interno de transporte'); };

  try {
    await assert.rejects(queryGraphQL('{ miPanel { balance } }'), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 0);
      assert.match(error.message, /No fue posible conectar/);
      return true;
    });
  } finally {
    globalThis.fetch = fetchOriginal;
    globalThis.sessionStorage = storageOriginal;
  }
});
