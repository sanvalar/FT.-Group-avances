import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activeGroupCountForUser,
  activeMemberCountForGroup,
  assertCanAddGroupMember,
  assertCanCreateGroup,
  MAX_GROUPS_PER_PERSON,
  MAX_MEMBERS_PER_GROUP,
} from '../src/utils/groupLimits.js'

function stateWithGroups(groupCount = 0, memberCount = 1) {
  const grupos = Array.from({ length: groupCount }, (_, index) => ({
    id: `g-${index}`,
    estado: 'activo',
  }))
  const miembros = grupos.flatMap(group => [
    { grupo_id: group.id, usuario_id: 'user-1', estado: 'activo' },
    ...Array.from({ length: memberCount - 1 }, (_, index) => ({
      grupo_id: group.id,
      usuario_id: `${group.id}-member-${index}`,
      estado: 'activo',
    })),
  ])
  return { grupos, miembros }
}

test('cuenta solo grupos activos y membresías activas por persona', () => {
  const state = stateWithGroups(2)
  state.grupos.push({ id: 'archived', estado: 'archivado' })
  state.miembros.push({ grupo_id: 'archived', usuario_id: 'user-1', estado: 'activo' })
  state.miembros.push({ grupo_id: 'g-0', usuario_id: 'user-1', estado: 'salido' })

  assert.equal(activeGroupCountForUser(state, 'user-1'), 2)
  assert.equal(activeMemberCountForGroup(state, 'g-0'), 1)
})

test('rechaza creación cuando el grupo supera el máximo incluyendo al creador', () => {
  assert.throws(
    () => assertCanCreateGroup(stateWithGroups(), 'owner', Array.from({ length: MAX_MEMBERS_PER_GROUP }, (_, index) => `user-${index}`)),
    /máximo 20 integrantes/,
  )
})

test('rechaza añadir integrante si la persona ya está en el máximo de grupos', () => {
  const state = stateWithGroups(MAX_GROUPS_PER_PERSON)
  assert.throws(() => assertCanAddGroupMember(state, 'user-1', 'new-group'), /máximo a 10 grupos/)
})

test('rechaza añadir integrantes cuando el grupo ya alcanzó el máximo', () => {
  const state = stateWithGroups(1, MAX_MEMBERS_PER_GROUP)
  assert.throws(() => assertCanAddGroupMember(state, 'new-user', 'g-0'), /máximo 20 integrantes/)
})
