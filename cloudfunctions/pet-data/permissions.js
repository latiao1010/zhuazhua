function assertRecordMutationAllowed({ scope, existing, openid, operation }) {
  if (scope && scope.shared && scope.role === 'viewer') {
    throw new Error('你当前是只读成员，不能修改该宠物档案')
  }
  const changesExisting = operation === 'update' || operation === 'delete'
  if (changesExisting && existing && existing.actorOpenid && existing.actorOpenid !== openid && scope && scope.role !== 'owner') {
    throw new Error('共同照护成员只能修改或删除自己提交的记录')
  }
  return true
}

module.exports = { assertRecordMutationAllowed }
