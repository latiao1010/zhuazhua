const assert = require('node:assert/strict')
const { runtime, clone } = require('./helpers/analytics-runtime')
const cases = []
const test = (name, run) => cases.push([name, run])
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

function setup(role = 'admin') {
  const r = runtime({ dependencies: { '../../utils/analytics-page': { instrument: (_, page) => page } } })
  const store = r.load('utils/store.js')
  const context = r.load('utils/pet-context.js')
  context.select(role === 'owner' ? 'personal' : 'family')
  store.ensureSeedData()
  r.disk[context.storageKey('paw_share_status')] = { shared: true, role, groupId: 'family' }
  const requests = [], toasts = [], state = { fail: false, onWrite: null }
  r.wx.showToast = options => toasts.push(options.title)
  r.wx.cloud.callFunction = async ({ data }) => {
    if (data.action === 'getPetProfiles') return { result: { ok: true, petContextVersion: 1, profiles: [] } }
    requests.push(clone(data))
    if (data.action === 'getAllData') return { result: { ok: true, data: { waters: [] }, share: r.disk[context.storageKey('paw_share_status')] } }
    if (data.action === 'mutateDataRecord' || data.action === 'setDataItem') {
      if (state.fail) throw new Error('network offline')
      if (state.onWrite) await state.onWrite(data)
    }
    return { result: { ok: true } }
  }
  const sync = r.load('utils/cloud-data.js')
  const page = () => {
    r.load('pages/feed/feed.js')
    const p = r.page
    p.data = clone(p.data)
    p.setData = update => Object.assign(p.data, clone(update))
    p.onLoad({ type: 'water' })
    p.openAdd()
    p.data.draft = { ...p.data.draft, amount: '100', note: '队列回归' }
    return p
  }
  return { r, context, store, sync, requests, toasts, state, page, writes: () => requests.filter(v => v.action === 'mutateDataRecord') }
}

test('启动空队列同步后新增记录会真正上传', async () => {
  const c = setup()
  await c.sync.retryPending()
  await c.store.set('waters', [{ id: 'one', amount: '100ml' }])
  assert.equal(c.writes().length, 1)
  assert.equal(c.sync.getSyncStatus().pending, 0)
})
test('多次空队列同步不会阻塞以后新增或更新', async () => {
  const c = setup()
  for (let i = 0; i < 3; i++) await c.sync.retryPending()
  await c.store.set('waters', [{ id: 'one', amount: '100ml' }])
  await c.sync.retryPending()
  await c.store.set('waters', [{ id: 'one', amount: '120ml' }])
  assert.deepEqual(c.writes().map(v => v.operation), ['upsert', 'update'])
  assert.equal(c.sync.getSyncStatus().pending, 0)
})
test('完整启动同步后共同照护成员仍可上传', async () => {
  const c = setup()
  await c.sync.syncAll()
  await c.store.set('waters', [{ id: 'one', amount: '100ml' }])
  assert.equal(c.writes().length, 1)
  assert.equal(c.sync.getSyncStatus().pending, 0)
})
test('主人恢复前台的空队列同步不会阻塞后续保存', async () => {
  const c = setup('owner')
  await c.sync.syncOnResume()
  await c.store.set('waters', [{ id: 'one', amount: '100ml' }])
  assert.equal(c.writes().length, 1)
  assert.equal(c.requests.some(v => v.action === 'getAllData'), false)
})
test('升级前已排队的记录正常重试，不新增另一条记录', async () => {
  const c = setup()
  c.r.disk[c.context.storageKey('paw_pending_sync_v1')] = { old: { type: 'record', key: 'waters', operation: 'upsert', recordId: 'old', record: { id: 'old', amount: '100ml' }, version: 'old-version', scope: 'family' } }
  await c.sync.syncAll()
  assert.equal(c.writes().length, 1)
  assert.equal(c.writes()[0].recordId, 'old')
  assert.equal(c.sync.getSyncStatus().pending, 0)
})
test('同时重试共用同一任务，上传中新增仍会被处理', async () => {
  const c = setup(), wait = deferred()
  c.state.onWrite = () => wait.promise
  const first = c.store.set('waters', [{ id: 'one', amount: '100ml' }])
  const second = c.sync.retryPending()
  assert.equal(first, second)
  await tick()
  const more = c.store.set('waters', [{ id: 'one', amount: '100ml' }, { id: 'two', amount: '20ml' }])
  wait.resolve()
  await Promise.all([first, more])
  assert.deepEqual(c.writes().map(v => v.recordId), ['one', 'two'])
  assert.equal(c.sync.getSyncStatus().pending, 0)
})
test('同一记录上传中再修改，旧结果不会删掉新版本', async () => {
  const c = setup(), wait = deferred()
  c.state.onWrite = () => wait.promise
  const first = c.store.set('waters', [{ id: 'one', amount: '100ml' }])
  await tick()
  const update = c.store.set('waters', [{ id: 'one', amount: '120ml' }])
  wait.resolve(); await Promise.all([first, update])
  assert.deepEqual(c.writes().map(v => v.record.amount), ['100ml', '120ml'])
  assert.equal(c.sync.getSyncStatus().pending, 0)
})
test('网络失败保留本机记录与队列，恢复后可重新上传', async () => {
  const c = setup(); await c.sync.retryPending(); c.state.fail = true
  assert.equal((await c.store.set('waters', [{ id: 'one', amount: '100ml' }])).ok, false)
  assert.equal(c.sync.getSyncStatus().pending, 1)
  assert.equal(c.store.get('waters')[0].amount, '100ml')
  c.state.fail = false; await c.sync.retryPending()
  assert.equal(c.sync.getSyncStatus().pending, 0)
})
test('不同共享范围的队列仍受保护，同步锁也能释放', async () => {
  const c = setup()
  c.r.disk[c.context.storageKey('paw_pending_sync_v1')] = { old: { type: 'record', key: 'waters', recordId: 'old', record: { id: 'old' }, scope: 'another-family' } }
  assert.equal((await c.sync.retryPending()).ok, false)
  const next = await c.sync.retryPending()
  assert.match(next.error, /共享范围已变化/)
  assert.equal(c.writes().length, 0)
  assert.equal(c.sync.getSyncStatus().pending, 1)
})
test('页面保存先显示本机保存，再确认云同步成功', async () => {
  const c = setup(), wait = deferred(); await c.sync.retryPending()
  c.state.onWrite = () => wait.promise
  const p = c.page(), saving = p.saveRecord()
  assert.equal(p.data.adding, false)
  assert.equal(c.toasts.at(-1), '已保存在本机，正在同步')
  wait.resolve(); await saving
  assert.equal(c.toasts.at(-1), '饮水记录已保存')
  assert.equal(c.sync.getSyncStatus().pending, 0)
})
test('页面网络失败明确提示尚未同步且保留记录', async () => {
  const c = setup(); await c.sync.retryPending(); c.state.fail = true
  await c.page().saveRecord()
  assert.equal(c.toasts.at(-1), '已保存在本机，云端尚未同步')
  assert.equal(c.store.get('waters')[0].amount, '100ml')
  assert.equal(c.sync.getSyncStatus().pending, 1)
})
test('只读成员仍不能新增，演示记录仍不进入云端', async () => {
  const c = setup('viewer')
  await c.store.set('waters', [{ id: 'one', amount: '100ml' }])
  assert.equal(c.store.get('waters').length, 0)
  assert.equal(c.writes().length, 0)
  c.store.setDemoMode(true)
  await c.store.set('waters', [{ id: 'demo-one', amount: '100ml' }])
  assert.equal(c.writes().length, 0)
  assert.equal(c.r.disk[c.context.storageKey('paw_water_records')].length, 0)
})

;(async () => {
  let failed = 0
  for (const [name, run] of cases) {
    try { await run(); console.log(`✓ ${name}`) }
    catch (error) { failed++; console.error(`✗ ${name}\n${error.stack}`) }
  }
  console.log(`${cases.length - failed}/${cases.length} sync queue scenarios passed.`)
  if (failed) process.exitCode = 1
})()
