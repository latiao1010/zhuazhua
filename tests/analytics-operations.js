const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { database } = require('./helpers/analytics-db')
const model = require('../utils/operations-model'), metrics = require('../utils/operations-metrics')
const NOW = Date.parse('2026-10-10T12:00:00+08:00')
const clone = value => JSON.parse(JSON.stringify(value))
const cases = [], test = (name, fn) => cases.push([name, fn])
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const { runtime } = require('./helpers/analytics-runtime')
const event = (patch = {}) => ({ id: 'event-00000001', time: NOW, module: 'home', kind: 'view', action: 'page', schema: 2, version: '1.0.0', platform: 'ios', channel: 'community', session: 'session-00000001', ...patch })
test('本机与正式环境隔离，字段固定，不记录任意输入', async () => {
  const r = runtime(), a = r.load('utils/analytics.js')
  a.track('home', 'view', 'page', '', { message: '不应采集' }); a.track('invalid', 'view', 'page'); a.track('home', 'click', 'invalid')
  const saved = r.disk.paw_operations_local_v2.events
  assert.equal(saved.length, 1); assert.equal(saved[0].message, undefined); await a.flush(); assert.equal(r.calls.length, 0)
})
test('断网后保留原 ID 重试；部分确认只移除已接收的事件', async () => {
  const r = runtime({ release: true }), a = r.load('utils/analytics.js')
  a.track('home', 'view', 'page'); a.track('home', 'click', 'tab'); a.pause()
  const ids = r.disk.paw_analytics_queue_v1.map(e => e.id)
  r.wx.cloud.callFunction = async () => { throw new Error('offline') }
  await a.flush(); assert.equal(r.disk.paw_analytics_queue_v1.length, 2)
  r.tick(61000); r.wx.cloud.callFunction = async () => ({ result: { ok: true, ids: [ids[0]] } })
  await a.flush(); assert.deepEqual(r.disk.paw_analytics_queue_v1.map(e => e.id), [ids[1]])
  r.wx.cloud.callFunction = async () => ({ result: { ok: true, ids: [ids[1]] } }); await a.flush(); assert.equal(r.disk.paw_analytics_queue_v1.length, 0)
})
test('关闭统计清空队列；旧耗时操作不能跨越关闭/重开继续上报', () => {
  const r = runtime({ release: true }), a = r.load('utils/analytics.js')
  const finish = a.startOperation('age', 'poster'); a.track('home', 'view', 'page')
  a.setEnabled(false); assert.equal(r.disk.paw_analytics_queue_v1.length, 0)
  a.setEnabled(true); finish(); assert.equal(r.disk.paw_analytics_queue_v1.length, 0)
})
test('流程节点去重、限制范围，演示流程不进入正式数据', () => {
  const r = runtime(), a = r.load('utils/analytics.js'), flow = a.beginFlow('age')
  a.stepFlow(flow, 1); a.stepFlow(flow, 1); a.stepFlow(flow, 999)
  assert.equal(r.disk.paw_operations_local_v2.events.length, 2)
  r.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: 'release', version: '1.0.0' } }); a.stepFlow(flow, 2)
  assert.equal(r.disk.paw_analytics_queue_v1, undefined)
})
test('用户取消、失败与慢操作分开；一次操作只上报一次结果', () => {
  const r = runtime(), a = r.load('utils/analytics.js')
  const finish = a.startOperation('age', 'poster'); r.tick(6000); finish(new Error('network')); finish()
  const cancel = a.startOperation('age', 'poster'); cancel(new Error('cancel'))
  const report = a.localOperations(1), m = report.measures[0]
  assert.equal(m.failure, 1); assert.equal(m.cancelled, 1); assert.equal(m.attempts, 1); assert.equal(m.slow, 1)
})
test('曝光只计可见卡片，快速滑过、弹层和后台不计；点击与曝光配对', () => {
  const r = runtime(), a = r.load('utils/analytics.js'), observers = []
  const page = { data: { discoverySlides: ['outings', 'age', 'personality', 'bingo'].map(tool => ({ tool })), discoveryIndex: 0 }, createIntersectionObserver() {
    const o = { relativeToViewport() { return o }, observe(selector, callback) { o.selector = selector; o.callback = callback }, disconnect() { o.disconnected = true } }; observers.push(o); return o
  } }
  const exposure = r.load('utils/home-exposure.js').create(page); exposure.start()
  observers[0].callback({ intersectionRatio: 1 }); r.tick(499)
  assert.equal(r.disk.paw_operations_local_v2, undefined)
  page.data.discoveryIndex = 1; exposure.update(); r.tick(500)
  let events = r.disk.paw_operations_local_v2.events; assert.equal(events.length, 1); assert.equal(events[0].entry, 'age')
  exposure.click('openDiscovery', { currentTarget: { dataset: { tool: 'age' } } }); exposure.click('openDiscovery', { currentTarget: { dataset: { tool: 'age' } } })
  page.data.discoveryIndex = 2; exposure.update(); page.data.recentOpen = true; exposure.update(); r.tick(500)
  assert.equal(r.disk.paw_operations_local_v2.events.length, 2)
  page.data.recentOpen = false; exposure.update(); exposure.stop(); r.tick(500)
  events = r.disk.paw_operations_local_v2.events; assert.equal(events.length, 2); assert.equal(events[0].exposureId, events[1].exposureId)
  assert.equal(a.localOperations(1).exposures[0].clicks, 1)
})
test('先点击的短曝光也提供分母；再次进入首页产生新曝光', () => {
  const r = runtime(), a = r.load('utils/analytics.js'), page = { data: { discoverySlides: [{ tool: 'bingo' }], discoveryIndex: 0 } }
  const exposure = r.load('utils/home-exposure.js').create(page)
  exposure.start(); exposure.click('openDiscovery', { currentTarget: { dataset: { tool: 'bingo' } } }); exposure.stop(); exposure.start(); exposure.click('openDiscovery', { currentTarget: { dataset: { tool: 'bingo' } } })
  const row = a.localOperations(1).exposures[0]; assert.equal(row.impressions, 2); assert.equal(row.clicks, 2)
})
test('留存以完整自然日为准，晚到事件修正首访，老用户身份保留', () => {
  const start = NOW - 10 * model.DAY
  let visitor = model.mergeVisitor(null, [event({ time: start })], NOW)
  visitor = model.mergeVisitor(visitor, [event({ time: start + 7 * model.DAY })], NOW)
  assert.equal(visitor.d7, true)
  visitor = model.mergeVisitor(visitor, [event({ time: NOW + 150 * model.DAY })], NOW + 150 * model.DAY)
  assert.equal(visitor.firstTime, start); assert.equal(visitor.d7, true)
  const report = model.localReport([], 30, NOW, model.mergeVisitor(null, [event({ time: NOW - 7 * model.DAY })], NOW))
  assert.equal(report.retention[1].eligible, 0); assert.equal(report.retention[1].pending, 1)
})
test('流程版本归属开始节点，跨版本分母独立，超长流程不完成', () => {
  let flow = model.mergeFlow(null, [event({ flowName: 'age', step: 2, time: NOW + 1000, version: '2.0' })])
  flow = model.mergeFlow(flow, [event({ flowName: 'age', step: 0, version: '1.0' }), event({ flowName: 'age', step: 1, time: NOW + 500, version: '1.0' })])
  assert.equal(flow.version, '1.0'); assert.equal(flow.reached, 2)
  flow = model.mergeFlow(flow, [event({ flowName: 'age', step: 3, time: NOW + 8 * model.DAY })]); assert.equal(flow.reached, 2)
  const result = metrics.versionRows([], [{ ...flow, count: 4 }, { ...flow, version: '2.0', reached: 3, count: 2 }], model.flows, [])
  assert.equal(result.find(r => r.version === '1.0').flows.find(f => f.name === 'age').rate, 0)
  assert.equal(result.find(r => r.version === '2.0').flows.find(f => f.name === 'age').rate, 100)
})
test('告警需要最低样本，取消不进入失败分母', () => {
  const base = { version: '1', module: 'age', operation: 'poster', label: '图片', attempts: 20, failure: 5, failureRate: 25, slow: 5, slowRate: 25 }
  assert.equal(metrics.alerts([{ ...base, attempts: 19 }], 0).length, 0)
  assert.equal(metrics.alerts([base], 100000).length, 3)
})
test('云端重复补报幂等，攻击者改相同 ID 的内容不会替换原事件', async () => {
  const db = database(), r = runtime({ db }), main = r.load('cloudfunctions/pet-analytics/index.js').main
  assert.equal((await main({ action: 'collect', events: [event()] })).ok, true)
  await main({ action: 'collect', events: [event({ module: 'age' })] })
  const raw = [...db.data.values()].filter(r => r.kind)
  assert.equal(raw.length, 1); assert.equal(raw[0].module, 'home')
  assert.equal([...db.data.values()].filter(r => r.recordType === 'visitor').length, 1)
})
test('原事件落库后事务失败，重试可补齐快照且不重复', async () => {
  const db = database(), r = runtime({ db }), main = r.load('cloudfunctions/pet-analytics/index.js').main
  db.failNextTransaction(); assert.equal((await main({ action: 'collect', events: [event()] })).ok, false)
  assert.equal([...db.data.values()].filter(r => r.kind).length, 1)
  assert.equal((await main({ action: 'collect', events: [event()] })).ok, true)
  assert.equal([...db.data.values()].filter(r => r.kind).length, 1); assert.equal([...db.data.values()].filter(r => r.recordType === 'visitor').length, 1)
})
test('管理员接口逐一拒绝普通用户；伪造定时触发不会执行清理', async () => {
  const db = database(), r = runtime({ db }), main = r.load('cloudfunctions/pet-analytics/index.js').main
  for (const action of ['summary', 'operations', 'feedback_list', 'feedback_update', 'maintenance_status', 'maintenance_run', 'history']) assert.equal((await main({ action, days: 30 })).error, 'forbidden', action)
  await main({ Type: 'Timer', TriggerName: 'analytics_hourly' }); assert.equal(db.data.size, 0)
})
test('双账号反馈隔离，重复提交不消耗额外额度，普通用户不能改处理状态', async () => {
  const db = database(), r = runtime({ db }), main = r.load('cloudfunctions/pet-analytics/index.js').main
  const feedback = { id: 'feedback-000001', type: 'bug', module: 'age', message: '生成图片一直没有完成', version: '1.0', platform: 'ios' }
  const first = await main({ action: 'feedback_submit', feedback }); assert.equal(first.ok, true)
  await main({ action: 'feedback_submit', feedback }); assert.equal([...db.data.values()].find(r => r.recordType === 'feedback_quota').count, 1)
  r.context.OPENID = 'other'; assert.equal((await main({ action: 'feedback_mine', uid: hash('test-app:owner') })).rows.length, 0)
  assert.equal((await main({ action: 'feedback_update', id: first.id, status: 'resolved' })).error, 'forbidden')
  r.context.OPENID = 'owner'; assert.equal((await main({ action: 'feedback_mine' })).rows.length, 1)
  r.context.OPENID = 'admin'; const list = await main({ action: 'feedback_list' }); assert.equal(list.rows.length, 1); assert.equal(list.rows[0].uid, undefined)
  const change = { action: 'feedback_update', id: first.id, status: 'triaged', updatedAt: list.rows[0].updatedAt }
  assert.equal((await main(change)).ok, true); assert.equal((await main({ ...change, status: 'resolved' })).error, 'feedback_changed')
})
test('反馈每天最多五条，分页按账号、时间和 ID 稳定返回', async () => {
  const db = database(), r = runtime({ db }), main = r.load('cloudfunctions/pet-analytics/index.js').main
  for (let i = 0; i < 6; i++) {
    const result = await main({ action: 'feedback_submit', feedback: { id: 'feedback-00000' + i, type: 'other', module: 'home', message: '测试反馈内容足够长' } })
    assert.equal(result.ok, i < 5)
  }
  for (let i = 0; i < 22; i++) {
    const id = 'op_feedback_' + hash(String(i)); db.data.set(id, { _id: id, recordType: 'feedback', uid: 'other', createdAt: NOW, updatedAt: NOW, status: 'new', type: 'bug', module: 'age', message: '分页测试' })
  }
  r.context.OPENID = 'admin'; const first = await main({ action: 'feedback_list' }), second = await main({ action: 'feedback_list', cursor: first.cursor })
  assert.equal(first.rows.length, 20); assert.equal(second.rows.length, 7); assert.equal(new Set([...first.rows, ...second.rows].map(r => r.id)).size, 27)
})
test('云端曝光聚合、耗时和版本对比与本机口径一致', async () => {
  const db = database(), r = runtime({ db }), main = r.load('cloudfunctions/pet-analytics/index.js').main
  const events = [event({ id: 'exposure-000001', kind: 'impression', action: 'home_entry', module: 'age', entry: 'age', exposureId: 'homevisit-00001' }),
    event({ id: 'clicked-000001', kind: 'engagement', action: 'home_entry', module: 'age', entry: 'age', exposureId: 'homevisit-00001' }),
    event({ id: 'measure-000001', kind: 'measure', action: 'operation', module: 'age', operation: 'poster', outcome: 'failure', durationMs: 8000 }),
    ...[0, 1, 2, 3].map(step => event({ id: 'flowevent-0000' + step, flowId: 'flow-000000001', flowName: 'age', kind: 'funnel', action: 'flow_step', module: 'age', step }))]
  await main({ action: 'collect', events }); r.context.OPENID = 'admin'
  const remote = (await main({ action: 'operations', days: 1 })).operations
  const local = model.localReport(events, 1, NOW)
  assert.deepEqual(clone(remote.exposures), clone(local.exposures)); assert.deepEqual(clone(remote.measures), clone(local.measures)); assert.deepEqual(clone(remote.versionComparison), clone(local.versionComparison))
})
test('清理先保存完整日报；保留首访摘要及未处理反馈；重跑不覆盖归档', async () => {
  const db = database(), r = runtime({ db }), main = r.load('cloudfunctions/pet-analytics/index.js').main, day = model.dayKey(NOW - 100 * model.DAY)
  db.data.set('old-event', { ...event({ time: NOW - 100 * model.DAY }), _id: 'old-event', uid: 'u', day })
  db.data.set('op_user_u', { _id: 'op_user_u', ...model.mergeVisitor(null, [event({ time: NOW - 100 * model.DAY })], NOW) })
  db.data.set('new-feedback', { _id: 'new-feedback', recordType: 'feedback', status: 'new', updatedAt: NOW - 200 * model.DAY })
  db.data.set('old-feedback', { _id: 'old-feedback', recordType: 'feedback', status: 'resolved', updatedAt: NOW - 200 * model.DAY })
  db.data.set('quota', { _id: 'quota', recordType: 'feedback_quota', expiresAt: NOW - 1 })
  r.context.OPENID = 'admin'; const first = await main({ action: 'maintenance_run' }); assert.equal(first.ok, true)
  const archive = db.data.get('op_daily_' + day); assert.equal(archive.events, 1); assert.equal(archive.finalized, true); assert.equal(archive.purged, true)
  assert.equal(db.data.has('old-event'), false); assert.equal(db.data.has('old-feedback'), false); assert.equal(db.data.has('quota'), false)
  assert.equal(db.data.has('op_user_u'), true); assert.equal(db.data.has('new-feedback'), true)
  await main({ action: 'maintenance_run' }); assert.equal(db.data.get('op_daily_' + day).events, 1)
  assert.equal((await main({ action: 'maintenance_status' })).maintenance.lastSuccessAt, NOW)
})
test('汇总不完整时不删除明细，维护租约阻止并发重复执行', async () => {
  const db = database(), r = runtime({ db, dependencies: { './metrics': () => ({ daily: async day => ({ day, complete: false, measures: [], events: 0 }), read: async () => ({ eventVersions: [], measures: [] }) }) } })
  const maintenance = r.load('cloudfunctions/pet-analytics/maintenance.js')(db, 'test', hash)
  db.data.set('keep', { _id: 'keep', kind: 'view', day: '2020-01-01' })
  assert.equal((await maintenance.run()).ok, false); assert.equal(db.data.has('keep'), true); assert.equal(db.removed.length, 0)
  db.data.set('op_maintenance_v3', { _id: 'op_maintenance_v3', recordType: 'maintenance', leaseUntil: NOW + 60000 })
  assert.equal((await maintenance.run()).busy, true)
})
;(async () => {
  let passed = 0
  for (const [name, fn] of cases) { try { await fn(); console.log('✓ ' + name); passed++ } catch (e) { console.error('✗ ' + name, e); process.exitCode = 1 } }
  console.log(`运营回归 ${passed}/${cases.length} 通过（内存隔离环境，不写正式数据）`)
})()
