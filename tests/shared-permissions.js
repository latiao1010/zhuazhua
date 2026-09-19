const assert = require('assert')
const { assertRecordMutationAllowed } = require('../cloudfunctions/pet-data/permissions')

const owner = { shared:true, role:'owner' }
const admin = { shared:true, role:'admin' }
const viewer = { shared:true, role:'viewer' }
const ownerRecord = { actorOpenid:'owner-openid' }
const adminRecord = { actorOpenid:'admin-openid' }

assert.doesNotThrow(() => assertRecordMutationAllowed({ scope:owner, existing:adminRecord, openid:'owner-openid', operation:'update' }))
assert.doesNotThrow(() => assertRecordMutationAllowed({ scope:owner, existing:adminRecord, openid:'owner-openid', operation:'delete' }))
assert.doesNotThrow(() => assertRecordMutationAllowed({ scope:admin, existing:null, openid:'admin-openid', operation:'upsert' }))
assert.doesNotThrow(() => assertRecordMutationAllowed({ scope:admin, existing:adminRecord, openid:'admin-openid', operation:'update' }))
assert.throws(() => assertRecordMutationAllowed({ scope:admin, existing:ownerRecord, openid:'admin-openid', operation:'update' }), /只能修改或删除自己/)
assert.throws(() => assertRecordMutationAllowed({ scope:admin, existing:ownerRecord, openid:'admin-openid', operation:'delete' }), /只能修改或删除自己/)
assert.throws(() => assertRecordMutationAllowed({ scope:viewer, existing:null, openid:'viewer-openid', operation:'upsert' }), /只读成员/)

console.log('✓ 主人可管理全部记录')
console.log('✓ 共同照护者可新增并修改自己的记录，不能改动主人记录')
console.log('✓ 只读成员不能新增、修改或删除记录')
console.log('7/7 shared permission scenarios passed.')
