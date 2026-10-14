const assert = require('node:assert/strict')
const { runtime, clone, NOW } = require('./helpers/analytics-runtime')
const cases = []
const test = (name, run) => cases.push([name, run])
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const code = 'ZZ-TEST-1011'
const group = { shared: true, groupId: 'family-1', role: 'admin', currentMemberId: 'member', members: [{ id: 'member', role: 'admin', name: '家人' }] }

function setup(options = {}) {
  const r = runtime(), requests = [], modals = [], loading = [], toasts = []
  const context = r.load('utils/pet-context.js')
  context.select(options.shared ? group.groupId : 'personal')
  const store = r.load('utils/store.js'); store.ensureSeedData()
  r.disk[context.storageKey('paw_share_status')] = options.shared ? clone(group) : { shared: false, role: 'owner' }
  const ownData = { pet: { ...store.get('pet'), name: '个人档案' }, waters: [] }
  const sharedData = { pet: { ...store.get('pet'), name: '共享档案' }, familyMembers: group.members, waters: [] }
  const state = { writeError: '', joinError: '', already: !!options.shared, onCall: null }
  r.wx.showModal = value => modals.push(value)
  r.wx.showLoading = value => loading.push(value)
  r.wx.hideLoading = () => loading.push('hide')
  r.wx.showToast = value => toasts.push(value.title)
  r.wx.cloud.callFunction = async ({ data }) => {
    if (data.action === 'getPetProfiles') return { result: { ok:true, petContextVersion:1, profiles:[] } }
    requests.push(clone(data))
    if (state.onCall) { const handled = await state.onCall(data); if (handled) return { result: handled } }
    if (data.action === 'previewShareInvitation') return { result: { ok: true, groupId: group.groupId, alreadyJoined: state.already, share: state.already ? group : { shared: false } } }
    if (data.action === 'mutateDataRecord' || data.action === 'setDataItem') {
      if (state.writeError) throw new Error(state.writeError)
      return { result: { ok: true } }
    }
    if (data.action === 'acceptShareInvitation') {
      if (state.joinError) throw new Error(state.joinError)
      const alreadyJoined = state.already
      state.already = true
      return { result: { ok: true, profiles:[{id:'personal'},{id:group.groupId}], groupId:group.groupId, alreadyJoined } }
    }
    if (data.action === 'getAllData') { const shared = data.petScope === group.groupId; return { result: { ok: true, data: shared ? sharedData : ownData, share: shared ? group : { shared: false } } } }
    throw new Error('Unexpected action: ' + data.action)
  }
  const sync = r.load('utils/cloud-data.js')
  const queue = (scope = options.shared ? group.groupId : 'personal') => {
    r.disk[store.KEYS.waters] = [{ id: 'local-1', amount: '10ml', note: '未同步修改' }]
    r.disk[context.storageKey('paw_pending_sync_v1')] = { 'record:waters:local-1': { type: 'record', key: 'waters', operation: 'upsert', recordId: 'local-1', record: clone(r.disk[store.KEYS.waters][0]), version: 'mutation-1', scope } }
  }
  const page = () => {
    const p = r.load('pages/shared/account-controller.js')()
    p.data = clone(p.data)
    p.setData = value => Object.assign(p.data, clone(value))
    return p
  }
  return { r, context, sync, store, requests, modals, loading, toasts, state, queue, page }
}

test('有待上传记录也能加入，共享只加入列表且不覆盖自己的档案', async () => {
  const c = setup(); c.queue()
  const before = clone(c.store.get('pet'))
  const result = await c.sync.acceptShareInvitation(code)
  assert.equal(result.ok, true)
  assert.deepEqual(c.requests.map(x => x.action), ['acceptShareInvitation'])
  assert.equal(c.sync.getSyncStatus().pending, 1)
  assert.deepEqual(clone(c.store.get('pet')), before)
  assert.equal(c.context.current(), 'personal')
})
test('主动切回自己的宠物才变更当前身份标记', async () => {
  const c = setup({ shared: true })
  assert.equal((await c.sync.switchPet('personal')).ok, true)
  assert.equal(c.sync.getShareStatus().shared, false)
  assert.equal(c.sync.getShareStatus().currentMemberId, '')
})
test('同一家庭生成邀请保留当前成员ID，新家庭使用服务器返回的ID', async () => {
  const c = setup({ shared: true })
  c.state.onCall = () => ({ ok: true, groupId: group.groupId, code })
  await c.sync.createShareInvitation()
  assert.equal(c.sync.getShareStatus().currentMemberId, 'member')
  c.state.onCall = () => ({ ok: true, groupId: 'new-family', code, currentMemberId: 'new-owner' })
  await c.sync.createShareInvitation()
  assert.equal(c.sync.getShareStatus().currentMemberId, 'new-owner')
})
test('上传原宠物期间加入共享不会改变这次上传的范围', async () => {
  const c = setup(); c.queue(); const wait = deferred()
  c.state.onCall = data => data.action === 'mutateDataRecord' ? wait.promise : null
  const flushing = c.sync.retryPending(); await tick()
  const joining = c.sync.acceptShareInvitation(code)
  assert.equal((await joining).ok, true)
  assert.equal(c.context.current(), 'personal')
  wait.resolve({ok:true}); await flushing
  assert.equal(c.requests.filter(x => x.action === 'mutateDataRecord').length, 1)
  assert.equal(c.requests.find(x => x.action === 'mutateDataRecord').petScope, 'personal')
})
test('加入共享不会清理或重发原宠物失败的待传队列', async () => {
  const c = setup(); c.queue(); c.state.writeError = '网络中断'
  const before = clone(c.r.disk[c.context.storageKey('paw_pending_sync_v1')])
  assert.equal((await c.sync.acceptShareInvitation(code)).ok, true)
  assert.deepEqual(c.r.disk[c.context.storageKey('paw_pending_sync_v1')], before)
  assert.equal(c.store.get('waters')[0].note, '未同步修改')
})
test('重复加入保留当前只读/照护身份及未上传内容', async () => {
  const c = setup({shared:true}); c.queue()
  const result = await c.sync.acceptShareInvitation(code)
  assert.equal(result.ok, true); assert.equal(result.alreadyJoined, true)
  assert.equal(c.sync.getShareStatus().currentMemberId, 'member')
  assert.equal(c.sync.getSyncStatus().pending, 1)
})
test('错误范围队列继续阻止写入，加入不绕过队列隔离', async () => {
  const c = setup(); c.queue('another-family')
  assert.equal((await c.sync.acceptShareInvitation(code)).ok, true)
  assert.equal((await c.sync.retryPending()).ok, false)
  assert.equal(c.sync.getSyncStatus().pending, 1)
})
test('重复点击与返回前台共用一个加入任务', async () => {
  const c = setup(); const first = c.sync.acceptShareInvitation(code)
  assert.equal(c.sync.acceptShareInvitation(code), first)
  assert.equal(c.sync.syncOnResume(), first); assert.equal(c.sync.syncAll(), first)
  await first
  assert.equal(c.requests.filter(x => x.action === 'acceptShareInvitation').length, 1)
})
test('等待旧档案启动同步后加入，迟到结果不会覆盖新档案', async () => {
  const c = setup(), wait = deferred()
  c.state.onCall = data => data.action === 'getAllData' ? wait.promise : null
  const startup = c.sync.syncAll(); await tick()
  const join = c.sync.acceptShareInvitation(code); await tick()
  assert.equal(c.requests.some(x => x.action === 'previewShareInvitation'), false)
  wait.resolve({ ok: true, data: { pet: { name: '旧档案' } }, share: { shared: false } })
  await startup; await join
  assert.equal(c.store.get('pet').name, '旧档案')
})
test('重复邀请仍通过服务端幂等处理，不覆盖档案', async () => {
  const c = setup({ shared: true })
  const result = await c.sync.acceptShareInvitation(code)
  assert.equal(result.alreadyJoined, true)
  assert.deepEqual(c.requests.map(x => x.action), ['acceptShareInvitation'])
})
test('邀请无效或服务未连接时保留本机修改', async () => {
  const c = setup(); c.queue()
  c.state.onCall = () => { throw new Error('共享码已过期') }
  assert.match((await c.sync.acceptShareInvitation(code)).error, /已过期/)
  assert.equal(c.sync.getSyncStatus().pending, 1)
  c.r.wx.cloud = null
  assert.match((await c.sync.acceptShareInvitation(code)).error, /无法连接云端/)
})
test('邀请由页面按钮确认，刷新保留弹窗；首次点击立即处理中且连点只提交一次', async () => {
  const c = setup(), p = c.page(), wait = deferred()
  c.state.onCall = data => data.action === 'acceptShareInvitation' ? wait.promise : null
  p.onLoad({ shareCode: code }); p.onShow(); p.onShow(); p.promptAcceptShare(code)
  assert.equal(c.modals.length, 0); assert.equal(p.data.pendingShareCode, '')
  assert.equal(p.data.sharePromptOpen, true); assert.equal(p.data.sharePromptCode, code)
  const task = p.confirmAcceptShare()
  assert.equal(p.data.shareAccepting, true)
  assert.equal(c.requests.length, 0, '按钮状态在请求发出前立即改变')
  assert.equal(p.confirmAcceptShare(), task)
  assert.equal(p.acceptShareInvitation(code), task)
  p.cancelAcceptShare(); p.onHide(); p.onShow()
  assert.equal(p.data.sharePromptOpen, true); assert.equal(p.data.shareAccepting, true)
  assert.equal(p.data.pageVisible, true); assert.equal(c.modals.length, 0)
  assert.equal(c.loading.length, 0, '不依赖原生弹窗或 Loading 遮罩回调')
  wait.resolve({ ok: true, groupId: group.groupId, alreadyJoined: false, share: { shared: false } })
  await task
  assert.equal(p.data.shareAccepting, false); assert.equal(p.data.familyOpen, false)
  assert.equal(p.data.sharePromptOpen, false); assert.equal(p.data.sharePromptCode, '')
  p.onShow(); assert.equal(p.data.familyOpen, false)
  assert.equal(p.confirmAcceptShare(), undefined, '成功关闭后旧按钮事件不会再次提交')
  assert.equal(c.requests.filter(x => x.action === 'acceptShareInvitation').length, 1)
})
test('加入失败在原界面保留原因与共享码，页面刷新和单次重试均有效', async () => {
  const c = setup(), p = c.page(); c.state.joinError = '连接失败，请检查网络'
  assert.equal((await p.acceptShareInvitation(code)).ok, false)
  assert.equal(p.data.shareAccepting, false); assert.equal(p._shareAcceptTask, null)
  assert.equal(c.modals.length, 0); assert.match(p.data.shareJoinError, /连接失败/)
  p.onShow()
  assert.equal(p.data.sharePromptOpen, true); assert.match(p.data.shareJoinError, /连接失败/)
  assert.equal(p.data.sharePromptCode, code)
  c.state.joinError = ''; const task = p.confirmAcceptShare()
  assert.equal(p.data.shareJoinError, ''); assert.equal(p.data.shareAccepting, true)
  assert.equal((await task).ok, true)
  assert.equal(p.data.familyOpen, false); assert.equal(p.data.sharePromptOpen, false)
})
test('稍后会消费邀请且不会提交；重新打开邀请仍能一次加入', async () => {
  const c = setup(), p = c.page()
  p.onLoad({ shareCode: code }); p.onShow(); p.cancelAcceptShare(); p.onShow()
  assert.equal(p.data.sharePromptOpen, false); assert.equal(p.data.sharePromptCode, '')
  assert.equal(p.data.pendingShareCode, ''); assert.equal(c.requests.length, 0)
  assert.equal(p.confirmAcceptShare(), undefined)
  p.promptAcceptShare(code)
  assert.equal(p.data.sharePromptOpen, true)
  assert.equal((await p.confirmAcceptShare()).ok, true)
})
test('确认中忽略重复邀请，不会悄悄切换将要加入的家庭', async () => {
  const c = setup(), p = c.page()
  p.promptAcceptShare(code); p.promptAcceptShare('ANOTHER-CODE')
  assert.equal(p.data.sharePromptCode, code)
  assert.equal((await p.confirmAcceptShare()).ok, true)
  assert.equal(c.requests.find(x => x.action === 'acceptShareInvitation').code, code)
})

function server() {
  const tables = {
    pet_share_invites: [{ _id: 'invite', code, groupId: group.groupId, status: 'active', expiresAt: NOW + 60000 }],
    pet_share_members: [{ _id: 'member', groupId: group.groupId, ownerOpenid: 'owner', memberOpenid: 'member', role: 'viewer', name: '原昵称', relation: '家人', status: 'active', updatedAt: NOW }]
  }
  let writes = 0
  const db = { createCollection: async () => {}, collection(name) {
    let query = {}, limit = Infinity, offset = 0
    const api = {
      where(value) { query = value; return api }, limit(value) { limit = value; return api }, skip(value) { offset = value; return api },
      async get() { return { data: clone((tables[name] || []).filter(row => Object.entries(query).every(([key, value]) => row[key] === value)).slice(offset, offset + limit)) } },
      add() { writes++; throw new Error('unexpected write') },
      doc() { return { update() { writes++; throw new Error('unexpected update') } } }
    }; return api
  } }
  const r = runtime({ db }); r.context.OPENID = 'member'
  return { r, main: r.load('cloudfunctions/pet-data/index.js').main, tables, writes: () => writes }
}
test('服务端预检按真实账号判断家庭，重复加入不改变只读角色或昵称', async () => {
  const c = server(), before = clone(c.tables.pet_share_members)
  const preview = await c.main({ action: 'previewShareInvitation', code })
  assert.equal(preview.ok, true); assert.equal(preview.alreadyJoined, true); assert.equal(preview.share.role, 'viewer')
  assert.equal(preview.share.currentMemberId, 'member')
  const result = await c.main({ action: 'acceptShareInvitation', code, profile: { name: '覆盖昵称', role: 'owner' } })
  assert.equal(result.ok, true); assert.equal(result.alreadyJoined, true)
  assert.deepEqual(c.tables.pet_share_members, before); assert.equal(c.writes(), 0)
})
test('同名成员的当前身份按微信会话返回，不按角色或客户端指定值判断', async () => {
  const c = server()
  c.tables.pet_share_members = [
    { _id: 'owner-id', groupId: group.groupId, ownerOpenid: 'owner', memberOpenid: 'owner', role: 'owner', name: '我', status: 'active', updatedAt: NOW },
    { _id: 'member-id', groupId: group.groupId, ownerOpenid: 'owner', memberOpenid: 'member', role: 'admin', name: '我', status: 'active', updatedAt: NOW },
    { _id: 'other-id', groupId: group.groupId, ownerOpenid: 'owner', memberOpenid: 'other', role: 'admin', name: '我', status: 'active', updatedAt: NOW }
  ]
  for (const [openid, memberId, role] of [['owner', 'owner-id', 'owner'], ['member', 'member-id', 'admin'], ['other', 'other-id', 'admin']]) {
    c.r.context.OPENID = openid
    const result = await c.main({ action: 'getAllData', currentMemberId: 'forged', role: 'owner' })
    assert.equal(result.share.currentMemberId, memberId)
    assert.equal(result.share.role, role)
    assert.equal(result.share.members.length, 3)
    assert.equal(result.share.members.filter(item => item.role === 'owner').length, 1)
    assert.equal(result.share.members.some(item => item.memberOpenid || item.isSelf), false)
  }
  assert.equal(c.writes(), 0)
})
test('其他账号的预检不泄露家庭成员，不接受伪造当前成员身份', async () => {
  const c = server(); c.r.context.OPENID = 'stranger'
  const result = await c.main({ action: 'previewShareInvitation', code, openid: 'member', alreadyJoined: true })
  assert.equal(result.alreadyJoined, false); assert.equal(result.share.shared, false)
  assert.equal(result.share.members, undefined); assert.equal(result.data, undefined); assert.equal(c.writes(), 0)
})
test('过期、无效邀请及无身份请求不会触发成员写入', async () => {
  const c = server()
  assert.equal((await c.main({ action: 'previewShareInvitation', code: 'missing' })).ok, false)
  c.tables.pet_share_invites[0].expiresAt = NOW - 1
  assert.match((await c.main({ action: 'previewShareInvitation', code })).error, /过期/)
  c.r.context.OPENID = ''
  assert.equal((await c.main({ action: 'previewShareInvitation', code })).ok, false)
  assert.equal(c.writes(), 0)
})

;(async () => {
  let passed = 0
  for (const [name, run] of cases) {
    try { await run(); passed++; console.log('✓ ' + name) }
    catch (error) { process.exitCode = 1; console.error('✗ ' + name, error) }
  }
  console.log(`家庭共享加入 ${passed}/${cases.length} 通过（隔离测试，无真实云端写入）`)
})()
