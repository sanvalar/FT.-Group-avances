export const MAX_GROUPS_PER_PERSON = 10
export const MAX_MEMBERS_PER_GROUP = 20

export function activeGroupCountForUser(state, userId) {
  const activeGroups = new Set(
    (state.grupos || []).filter(group => group.estado === 'activo').map(group => String(group.id)),
  )
  return new Set(
    (state.miembros || [])
      .filter(member => String(member.usuario_id) === String(userId) && member.estado === 'activo')
      .map(member => String(member.grupo_id))
      .filter(groupId => activeGroups.has(groupId)),
  ).size
}

export function activeMemberCountForGroup(state, groupId) {
  return (state.miembros || []).filter(member =>
    String(member.grupo_id) === String(groupId) && member.estado === 'activo',
  ).length
}

export function assertCanCreateGroup(state, creatorId, memberIds) {
  const uniqueIds = [...new Set([String(creatorId), ...memberIds.map(String)])]
  if (uniqueIds.length > MAX_MEMBERS_PER_GROUP) {
    throw new Error(`Un grupo puede tener máximo ${MAX_MEMBERS_PER_GROUP} integrantes, incluyéndote.`)
  }
  for (const userId of uniqueIds) {
    if (activeGroupCountForUser(state, userId) >= MAX_GROUPS_PER_PERSON) {
      throw new Error(`Cada persona puede pertenecer como máximo a ${MAX_GROUPS_PER_PERSON} grupos activos.`)
    }
  }
}

export function assertCanAddGroupMember(state, userId, groupId) {
  if (activeMemberCountForGroup(state, groupId) >= MAX_MEMBERS_PER_GROUP) {
    throw new Error(`Un grupo puede tener máximo ${MAX_MEMBERS_PER_GROUP} integrantes, incluyéndote.`)
  }
  if (activeGroupCountForUser(state, userId) >= MAX_GROUPS_PER_PERSON) {
    throw new Error(`Cada persona puede pertenecer como máximo a ${MAX_GROUPS_PER_PERSON} grupos activos.`)
  }
}
