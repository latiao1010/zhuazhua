const assert = require('node:assert/strict')
const { runtime, clone, NOW } = require('./helpers/analytics-runtime')
const cases = []
const test = (name, run) => cases.push([name, run])
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const code = 'ZZ-TEST-1011'
const group = { shared: true, groupId: 'family-1', role: 'admin', members: [{ id: 'member', role: 'admin', name: '家人' }] }

function setup(options = {}) {
  const r = runtime(), requests = [], modals = [], loading = [], toasts = []
  const store = r.load('utils/store.js'); store.ensureSeedData()
  r.disk.paw_share_status = options.shared ? clone(group) : { shared: false, role: 'owner' }
  const ownData = { pet: { ...store.get('pet'), name: '个人档案' }, waters: [] }
  const sharedData = { pet: { ...store.get('pet'), name: '共享档案' }, familyMembers: group.members, waters: [] }
  const state = { writeError: '', joinError: '', already: !!options.shared, onCall: null }
  r.wx.showModal = value => modals.push(value)
  r.wx.showLoading = value => loading.push(value)
  r.wx.hideLoading = () => loading.push('hide')
  r.wx.showToast = value => toasts.push(value.title)
  r.wx.cloud.callFunction = async ({ data }) => {
    requests.push(clone(data))
    if (state.onCall) { const handled = await state.onCall(data); if (handled) return { result: handled } }
    if (data.action === 'previewShareInvitation') return { result: { ok: true, groupId: group.groupId, alreadyJoined: state.already, share: state.already ? group : { shared: false } } }
    if (data.action === 'mutateDataRecord' || data.action === 'setDataItem') {
      if (state.writeError) throw new Error(state.writeError)
      return { result: { ok: true } }
    }
    if (data.action === 'acceptShareInvitation') {
      if (state.joinError) throw new Error(state.joinError)
      state.already = true
      return { result: { ok: true, data: sharedData, share: group } }
    }
    if (data.action === 'getAllData') return { result: { ok: true, data: state.already ? sharedData : ownData, share: state.already ? group : { shared: false } } }
    throw new Error('Unexpected action: ' + data.action)
  }
  const sync = r.load('utils/cloud-data.js')
  const queue = (scope = options.shared ? group.groupId : 'personal') => {
    r.disk.paw_waters = [{ id: 'local-1', amount: '10ml', note: '未同步修改' }]
    r.disk.paw_pending_sync_v1 = { 'record:waters:local-1': { type: 'record', key: 'waters', operation: 'upsert', recordId: 'local-1', record: clone(r.disk.paw_waters[0]), version: 'mutation-1', scope } }
  }
  const page = () => {
    const p = r.load('pages/shared/account-controller.js')()
    p.data = clone(p.data)
    p.setData = value => Object.assign(p.data, clone(value))
    return p
  }
  return { r, sync, store, requests, modals, loading, toasts, state, queue, page }
}

test('有待上传记录时自动同步，完成后一次加入', async () => {
  const c = setup(); c.queue()
  const result = await c.sync.acceptShareInvitation(code)
  assert.equal(result.ok, true)
  assert.deepEqual(c.requests.map(x => x.action), ['previewShareInvitation', 'mutateDataRecord', 'acceptShareInvitation'])
  assert.equal(c.sync.getSyncStatus().pending, 0)
  assert.equal(c.store.get('pet').name, '共享档案')
})
test('正在上传时复用同一次上传，不要求再点加入', async () => {
  const c = setup(); c.queue(); const wait = deferred()
  c.state.onCall = data => data.action === 'mutateDataRecord' ? wait.promise : null
  const flushing = c.sync.retryPending(); await tick()
  const joining = c.sync.acceptShareInvitation(code); await tick()
  assert.equal(c.requests.filter(x => x.action === 'acceptShareInvitation').length, 0)
  wait.resolve({ ok: true }); await flushing
  assert.equal((await joining).ok, true)
  assert.equal(c.requests.filter(x => x.action === 'mutateDataRecord').length, 1)
})
test('同步失败保留待传队列及本机内容，不切换家庭', async () => {
  const c = setup(); c.queue(); c.state.writeError = '网络中断'
  const before = clone(c.r.disk.paw_pending_sync_v1)
  const result = await c.sync.acceptShareInvitation(code)
  assert.equal(result.ok, false); assert.match(result.error, /网络中断/)
  assert.deepEqual(c.r.disk.paw_pending_sync_v1, before)
  assert.equal(c.r.disk.paw_waters[0].note, '未同步修改')
  assert.equal(c.requests.some(x => x.action === 'acceptShareInvitation'), false)
})
test('已在同一家庭且同步失败时打开原家庭，保留未同步内容并提示', async () => {
  const c = setup({ shared: true }); c.queue(); c.state.writeError = '共同照护成员只能修改或删除自己提交的记录'
  const before = clone(c.r.disk.paw_pending_sync_v1)
  const result = await c.sync.acceptShareInvitation(code)
  assert.equal(result.ok, true); assert.equal(result.alreadyJoined, true)
  assert.match(result.syncWarning, /本机修改/); assert.deepEqual(c.r.disk.paw_pending_sync_v1, before)
  assert.equal(c.requests.some(x => x.action === 'acceptShareInvitation'), false)
})
test('队列属于其他档案时不能误写进当前家庭', async () => {
  for (const shared of [false, true]) {
    const c = setup({ shared }); c.queue('another-family')
    const result = await c.sync.acceptShareInvitation(code)
    assert.equal(result.ok, shared)
    assert.equal(c.requests.length, 1)
    assert.equal(c.sync.getSyncStatus().pending, 1)
  }
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
  assert.equal(c.store.get('pet').name, '共享档案')
})
test('已在同一家庭时只读取最新数据，不再次提交加入', async () => {
  const c = setup({ shared: true })
  const result = await c.sync.acceptShareInvitation(code)
  assert.equal(result.alreadyJoined, true)
  assert.deepEqual(c.requests.map(x => x.action), ['previewShareInvitation', 'getAllData'])
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
  c.state.onCall = data => data.action === 'previewShareInvitation' ? wait.promise : null
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
  assert.equal(p.data.shareAccepting, false); assert.equal(p.data.familyOpen, true)
  assert.equal(p.data.sharePromptOpen, false); assert.equal(p.data.sharePromptCode, '')
  p.onShow(); assert.equal(p.data.familyOpen, true)
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
  assert.equal(p.data.familyOpen, true); assert.equal(p.data.sharePromptOpen, false)
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
  const result = await c.main({ action: 'acceptShareInvitation', code, profile: { name: '覆盖昵称', role: 'owner' } })
  assert.equal(result.ok, true); assert.equal(result.alreadyJoined, true)
  assert.deepEqual(c.tables.pet_share_members, before); assert.equal(c.writes(), 0)
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
