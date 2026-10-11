const assert = require('node:assert/strict')
const { database } = require('./helpers/analytics-db')
const { runtime, NOW, clone, hash } = require('./helpers/analytics-runtime')
const cases = [], test = (name, fn) => cases.push([name, fn])
const tick = async () => { for (let i = 0; i < 100; i++) await Promise.resolve() }
function linked(user = 'owner') {
  const db = database(), r = runtime({ release: true, db })
  r.context.OPENID = user
  const main = r.load('cloudfunctions/pet-analytics/index.js').main
  r.wx.cloud.callFunction = async options => { r.calls.push(clone(options)); return { result: await main(options.data) } }
  return { db, r, main, a: r.load('utils/analytics.js') }
}
function mount(r, file) {
  r.load(file)
  const p = { ...r.page, data: clone(r.page.data) }
  p.setData = patch => { for (const [key, value] of Object.entries(patch)) { const parts = key.split('.'); let target = p.data; while (parts.length > 1) { const part = parts.shift(); target = target[part] ||= {} } target[parts[0]] = value } }
  p.onLoad?.(); return p
}
const tap = data => ({ type: 'tap', currentTarget: { dataset: data } })
const input = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } })
const quality = patch => ({ reporter: 'qa-device-0001', day: '2026-10-10', version: '1.0.0', revision: 1, generated: 1, confirmed: 0, rejected: 0, overflow: 0, expired: 0, failedBatches: 0, partialBatches: 0, successfulBatches: 0, storageFailures: 0, ...patch })
const release = patch => ({ version: '1.2.3', publishedAt: NOW - 3600000, notes: '修复卡片生成失败', goal: '观察一周内卡片生成失败率', updatedAt: 0, ...patch })
test('页面点击经埋点、上传、诊断补报后进入管理员看板，补报不空轮询', async () => {
  const { r, main, a, db } = linked('admin')
  const instrument = r.load('utils/analytics-page.js').instrument
  let clicked = false
  const page = instrument('home', { data: {}, openDiscovery() { clicked = true } })
  page.openDiscovery(tap({ tool: 'age' })); assert.equal(clicked, true)
  a.pause(); await a.flush(); await a.flush()
  assert.equal(r.disk.paw_analytics_queue_v1.length, 0)
  const calls = r.calls.length; await a.flush(); assert.equal(r.calls.length, calls)
  const q = await main({ action: 'delivery_summary', days: 1 })
  assert.equal(q.ok, true); assert.equal(q.rows[0].received, 1); assert.equal(q.rows[0].confirmed, 1); assert.equal(q.rows[0].generated, 1)
  assert.equal(q.rows[0].avgLatencyMs, 0)
  const dashboard = mount(r, 'packages/operations/analytics.js'); await tick()
  assert.equal(dashboard.data.summary.clicks, 1); assert.equal(dashboard.data.rows.find(x => x.module === 'age').clicks, 1)
  await dashboard.loadQuality(); assert.equal(dashboard.data.quality.received, 1)
  const snapshot = [...db.data.values()].find(x => x.recordType === 'delivery_health')
  assert.equal(snapshot.reporter, undefined); assert.equal(snapshot.uid, undefined)
})
test('服务端已落库但响应丢失，重试保留相同 ID 且统计只增加一次', async () => {
  const { r, main, a, db } = linked('admin')
  let first = true
  r.wx.cloud.callFunction = async options => { const result = await main(options.data); if (first) { first = false; throw new Error('response lost') } return { result } }
  a.track('home', 'click', 'tab'); a.pause(); await a.flush()
  assert.equal(r.disk.paw_analytics_queue_v1.length, 1)
  r.tick(61000); await a.flush(); await a.flush()
  assert.equal([...db.data.values()].filter(x => x.kind).length, 1)
  const q = (await main({ action: 'delivery_summary', days: 1 })).rows[0]
  assert.equal(q.confirmed, 1); assert.equal(q.failedBatches, 1); assert.equal(q.received, 1)
})
test('快照乱序、重复、并发新计数和非法输入不会重复或回退', async () => {
  const { r, main } = linked('admin')
  for (const value of [quality({ revision: 2, generated: 4 }), quality(), quality({ revision: 2, generated: 4 }), quality({ revision: 3, generated: 2 })]) await main({ action: 'collect', events: [], quality: [value] })
  assert.equal((await main({ action: 'delivery_summary', days: 1 })).rows[0].generated, 4)
  const bad = await main({ action: 'collect', events: [], quality: [quality({ generated: -1 })] }); assert.equal(bad.qualityIds.length, 0)
  const d = r.load('utils/delivery-quality.js'); d.bump('1.0.0', { generated: 1 }); const sent = d.snapshots(); d.bump('1.0.0', { generated: 1 }); d.acknowledge(sent, sent.map(s => `${s.day}:${s.version}:${s.revision}`)); assert.equal(d.pending(), true); assert.equal(d.snapshots()[0].generated, 2)
})
test('队列超限、过期、缓存写入失败计数可核对', async () => {
  const { r, a } = linked()
  a.pause(); for (let n = 0; n < 205; n++) a.track('home', 'click', 'tab')
  let row = r.load('utils/delivery-quality.js').snapshots()[0]; assert.equal(row.overflow, 5); assert.equal(r.disk.paw_analytics_queue_v1.length, 200)
  r.setNow(NOW + 8 * 86400000); a.track('home', 'click', 'tab')
  row = r.load('utils/delivery-quality.js').snapshots()[0]; assert.equal(row.expired, 200)
  const write = r.wx.setStorageSync; r.wx.setStorageSync = (k, v) => { if (k === 'paw_analytics_queue_v1') throw new Error('full'); write(k, v) }
  a.track('home', 'click', 'tab'); assert.equal(r.load('utils/delivery-quality.js').snapshots()[0].storageFailures, 1)
})
test('上传期间关闭统计，迟到响应不会恢复队列或诊断', async () => {
  const { r, a } = linked(); let resolve
  r.wx.cloud.callFunction = () => new Promise(done => { resolve = done })
  a.track('home', 'click', 'tab'); a.pause(); const pending = a.flush(); await tick(); a.setEnabled(false)
  resolve({ result: { ok: true, ids: [], qualityIds: [], deliverySchema: 1 } }); await pending
  assert.equal(r.disk.paw_analytics_queue_v1.length, 0); assert.equal(r.load('utils/delivery-quality.js').pending(), false)
})
test('发送中的八条事件不会被新增记录挤掉，部分确认和拒收分别计数', async () => {
  const { r, a } = linked(); let resolve, request
  r.wx.cloud.callFunction = options => { request = options.data; return new Promise(done => { resolve = done }) }
  a.pause(); for (let i = 0; i < 8; i++) a.track('home', 'click', 'tab')
  const pending = a.flush(); await tick()
  for (let i = 0; i < 205; i++) a.track('home', 'click', 'tab')
  assert.equal(r.disk.paw_analytics_queue_v1.length, 200)
  assert.ok(request.events.every(e => r.disk.paw_analytics_queue_v1.some(x => x.id === e.id)))
  resolve({ result: { ok: true, deliverySchema: 1, ids: request.events.slice(0, 2).map(x => x.id), rejectedIds: [request.events[1].id], qualityIds: [] } }); await pending
  const q = r.load('utils/delivery-quality.js').snapshots()[0]
  assert.equal(q.overflow, 13); assert.equal(q.confirmed, 1); assert.equal(q.rejected, 1); assert.equal(q.partialBatches, 1)
  assert.equal(r.disk.paw_analytics_queue_v1.length, 198)
})
test('本机缓存写入失败时，关闭统计在当前会话仍立即生效', async () => {
  const { r, a } = linked(); a.track('home', 'click', 'tab'); a.pause()
  r.wx.setStorageSync = () => { throw new Error('storage unavailable') }
  a.setEnabled(false); assert.equal(a.enabled(), false)
  a.track('home', 'click', 'tab'); await a.flush(); assert.equal(r.calls.length, 0)
})
test('诊断事务失败不影响业务事件确认；诊断后续补齐', async () => {
  const { main, db } = linked('admin')
  db.failNextTransaction(); const first = await main({ action: 'collect', events: [], quality: [quality()] }); assert.equal(first.ok, true); assert.equal(first.qualityIds.length, 0)
  const next = await main({ action: 'collect', events: [], quality: [quality()] }); assert.equal(next.qualityIds.length, 1)
})
test('用户提交页面→管理员回复页面→用户刷新查看，第二账号读不到', async () => {
  const { r, main } = linked()
  const user = mount(r, 'pages/feedback/feedback.js'); await tick()
  user.input({ detail: { value: '联调验收：生成图片一直未完成' } }); await user.submit(); assert.equal(user.data.error, ''); assert.equal(user.data.rows.length, 1)
  const id = user.data.rows[0].id
  r.context.OPENID = 'other'; assert.equal((await main({ action: 'feedback_mine', uid: hash('test-app:owner') })).rows.length, 0)
  r.context.OPENID = 'admin'
  const admin = mount(r, 'packages/operations/analytics.js'); admin.setData({ allowed: true, source: 'cloud' }); await admin.loadFeedback()
  admin.changeFeedback(tap({ id })); admin.editReply(input('reply', '已修复，请更新后再试。')); admin.editReply(input('fixVersion', '1.2.3'))
  admin.chooseReplyStatus({ detail: { value: admin.data.replyStates.findIndex(x => x.value === 'resolved') } }); await admin.saveReply(); await tick()
  assert.equal(admin.data.replyError, '')
  r.context.OPENID = 'owner'; await user.loadRows()
  assert.equal(user.data.rows[0].reply, '已修复，请更新后再试。'); assert.equal(user.data.rows[0].fixVersion, '1.2.3'); assert.equal(user.data.rows[0].status, 'resolved'); assert.ok(user.data.rows[0].replyDateLabel)
})
test('回复冲突保留草稿，旧客户端更新状态不抹掉回复，空回复不能新标已处理', async () => {
  const { r, main } = linked('admin')
  const submitted = await main({ action: 'feedback_submit', feedback: { id: 'qa-feedback-001', type: 'bug', module: 'age', message: '仅用于隔离测试的反馈' } })
  const old = (await main({ action: 'feedback_list' })).rows[0], base = { action: 'feedback_update', id: submitted.id, updatedAt: old.updatedAt, status: 'resolved', reply: '修复已完成', fixVersion: '1.2.3' }
  assert.equal((await main({ ...base, reply: '' })).error, 'invalid_feedback_reply')
  assert.equal((await main(base)).ok, true); assert.equal((await main({ ...base, reply: '过期草稿' })).error, 'feedback_changed')
  const latest = (await main({ action: 'feedback_list' })).rows[0]
  assert.equal((await main({ action: 'feedback_update', id: latest.id, updatedAt: latest.updatedAt, status: 'triaged' })).ok, true)
  assert.equal((await main({ action: 'feedback_list' })).rows[0].reply, '修复已完成')
  const p = mount(r, 'packages/operations/analytics.js'); await tick(); await p.loadFeedback(); p.changeFeedback(tap({ id: latest.id })); p.editReply(input('reply', '保留的草稿'))
  const row = (await main({ action: 'feedback_list' })).rows[0]; await main({ ...base, updatedAt: row.updatedAt, reply: '另一个管理员回复' })
  await p.saveReply(); assert.match(p.data.replyError, /更新/); assert.equal(p.data.feedbackEdit.reply, '保留的草稿')
})
test('所有统计、回复、上线接口都由云端阻止普通用户越权', async () => {
  const { main, db, r } = linked()
  for (const action of ['summary', 'operations', 'delivery_summary', 'feedback_list', 'feedback_update', 'release_list', 'release_save', 'maintenance_status', 'maintenance_run', 'history']) {
    const result = await main({ action, days: 30, admin: true, uid: hash('test-app:admin'), release: release() }); assert.equal(result.error, 'forbidden', action)
  }
  assert.equal(db.data.size, 0)
  r.context.OPENID = ''; assert.equal((await main({ action: 'release_list' })).error, 'unauthorized')
})
test('上线记录保存、编辑、版本不可改名、并发保护，列表不泄露账号字段', async () => {
  const { main, r } = linked('admin'), first = await main({ action: 'release_save', release: release() })
  assert.equal(first.ok, true); assert.equal((await main({ action: 'release_save', release: release() })).error, 'release_changed')
  const changed = await main({ action: 'release_save', release: { ...first.row, notes: '修复卡片并缩短生成耗时' } }); assert.equal(changed.ok, true); assert.ok(changed.row.updatedAt > first.row.updatedAt)
  assert.equal((await main({ action: 'release_save', release: { ...changed.row, version: 'other' } })).error, 'invalid_release')
  const list = await main({ action: 'release_list' }); assert.equal(list.rows.length, 1); assert.equal(list.rows[0].uid, undefined)
  const page = mount(r, 'packages/operations/analytics.js'); await tick(); await page.loadReleases(); assert.equal(page.data.releaseRows[0].version, '1.2.3')
  page.editRelease(tap({ id: changed.row.id })); page.inputRelease(input('goal', '新版本失败率低于旧版本')); await page.saveRelease(); assert.equal(page.data.releaseFormError, ''); assert.equal(page.data.releaseEdit, null)
  assert.equal((await main({ action: 'release_list' })).rows[0].goal, '新版本失败率低于旧版本')
})
test('上线记录输入拒绝未来时间/超长内容，分页稳定且不进入点击汇总', async () => {
  const { main } = linked('admin')
  for (const patch of [{ publishedAt: NOW + 1 }, { notes: '' }, { goal: 'x'.repeat(201) }, { version: '<bad>' }, { updatedAt: -1 }]) assert.equal((await main({ action: 'release_save', release: release(patch) })).error, 'invalid_release')
  for (let i = 0; i < 22; i++) assert.equal((await main({ action: 'release_save', release: release({ version: '1.0.' + i }) })).ok, true)
  const first = await main({ action: 'release_list' }), next = await main({ action: 'release_list', cursor: first.cursor })
  assert.equal(first.rows.length, 20); assert.equal(next.rows.length, 2); assert.equal(new Set([...first.rows, ...next.rows].map(x => x.id)).size, 22)
  const summary = await main({ action: 'summary', days: 30 }); assert.equal(summary.users, 0); assert.equal(summary.rows.reduce((n, x) => n + x.clicks, 0), 0)
})
;(async () => { let passed = 0; for (const [name, fn] of cases) { try { await fn(); console.log('✓ ' + name); passed++ } catch (e) { console.error('✗ ' + name, e); process.exitCode = 1 } } console.log(`诊断、反馈与上线记录 ${passed}/${cases.length} 通过（实际客户端/云函数代码，隔离内存数据库）`) })()
