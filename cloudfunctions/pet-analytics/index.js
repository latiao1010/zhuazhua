const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const catalog = require('./catalog')
const configuredAdmins = require('./admins.json')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database(), command = db.command, aggregate = command.aggregate
const COLLECTION = 'pet_usage_events_v1'
const model = require('./operations-model')
const operations = require('./operations')(db, COLLECTION, hashValue)
const metrics = require('./operations-metrics')
const maintenance = require('./maintenance')(db, COLLECTION, hashValue)
const delivery = require('./delivery')(db, COLLECTION, hashValue)
const releases = require('./releases')(db, COLLECTION, hashValue)
const kinds = ['view', 'click', 'complete', 'error', 'share', 'session', 'funnel', 'impression', 'engagement', 'measure']
const columns = { view: 'views', click: 'clicks', complete: 'completes', error: 'errors', share: 'shares' }
const actions = new Set([...Object.values(catalog.handlers).flat(), ...catalog.extraActions])
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
function hashValue(value) { return crypto.createHash('sha256').update(value).digest('hex') }
const dayKey = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10)
let ready = false
async function ensureCollection() {
  if (ready) return
  try { await db.collection(COLLECTION).limit(1).get() }
  catch (_) { try { await db.createCollection(COLLECTION) } catch (error) { if (!/exist|已存在/i.test(error.message || '')) throw error } }
  ready = true
}
function adminAllowed(uid) {
  const admins = [...configuredAdmins, ...(process.env.ANALYTICS_ADMIN_IDS || '').split(',').map(s => s.trim())]
  return admins.includes(uid)
}
function cleanEvent(value, uid, now) {
  if (!value || typeof value.id !== 'string' || !/^[a-z0-9-]{10,70}$/.test(value.id)) return null
  if (!Object.prototype.hasOwnProperty.call(catalog.modules, value.module) || !kinds.includes(value.kind) || !actions.has(value.action)) return null
  if (!Number.isSafeInteger(value.time) || value.time < now - 7 * 86400000 || value.time > now + 5 * 60000) return null
  const reason = ['permission', 'timeout', 'network', 'validation', 'unavailable'].includes(value.reason) ? value.reason : 'unavailable'
  let detail = {}
  const measured = metrics.cleanDetail(value)
  if (!measured) return null
  if (value.kind === 'funnel') {
    if (!model.has(model.flows, value.flowName)) return null
    const flow = model.flows[value.flowName]
    if (flow.module !== value.module || value.action !== 'flow_step' || !/^[a-z0-9-]{10,70}$/.test(value.flowId || '') || !Number.isInteger(value.step) || value.step < 0 || value.step >= flow.steps.length) return null
    detail = { flowName: value.flowName, flowId: value.flowId, step: value.step }
  }
  const time = Math.min(value.time, now)
  return { _id: hash(uid + ':' + value.id), uid, day: dayKey(time), time, receivedAt: now,
    module: value.module, kind: value.kind, action: value.action, ...(value.schema === 2 ? model.context(value) : {}), ...detail, ...measured, ...(value.kind === 'error' ? { reason } : {}) }
}
async function collect(events, uid, quality) {
  if (!Array.isArray(events) || events.length > 20) return { ok: false, error: 'invalid_batch' }
  await ensureCollection()
  const ids = [], rejectedIds = [], accepted = [], now = Date.now()
  // 分组限制并发；只确认已落库/已存在的事件，失败项留给客户端重试。
  for (let offset = 0; offset < events.length; offset += 4) {
    await Promise.all(events.slice(offset, offset + 4).map(async input => {
      const event = cleanEvent(input, uid, now)
      if (!event) { if (input && typeof input.id === 'string') { ids.push(input.id); rejectedIds.push(input.id) } return }
      try { await db.collection(COLLECTION).add({ data: event }); ids.push(input.id); accepted.push(event) }
      catch (error) {
        if (/duplicate|already exists|重复|已存在/i.test(error.message || error.errMsg || '')) {
          const saved = await db.collection(COLLECTION).doc(event._id).get()
          const stored = Array.isArray(saved.data) ? saved.data[0] : saved.data
          if (stored && stored.uid === uid) { ids.push(input.id); accepted.push(stored) }
        }
      }
    }))
  }
  // 快照使用集合并和最早时间，不做累加；原始事件已写入后重试也不会重复计数。
  await operations.collect(accepted, uid, now)
  // 诊断快照失败不撤销已落库事件的确认；下次使用同一版本快照补报。
  let qualityIds = []
  try { qualityIds = await delivery.collect(quality, uid, now) } catch (_) { console.warn('analytics_delivery_snapshot_failed') }
  return { ok: true, ids, rejectedIds, qualityIds, deliverySchema: 1 }
}
async function summary(days) {
  const start = dayKey(Date.now() - (days - 1) * 86400000), end = dayKey(Date.now())
  await ensureCollection()
  // 客户端直写会带 _openid；只汇总经此云函数验证后创建的记录。
  const where = { day: command.gte(start).and(command.lte(end)), kind: command.in(Object.keys(columns)), _openid: command.exists(false) }
  const base = () => db.collection(COLLECTION).aggregate().match(where)
  const [counts, visitors, totalVisitors, daily, details] = await Promise.all([
    base().group({ _id: { module: '$module', kind: '$kind' }, count: aggregate.sum(1) }).limit(1000).end(),
    base().match({ kind: 'view' }).group({ _id: { module: '$module', uid: '$uid' } }).group({ _id: '$_id.module', users: aggregate.sum(1) }).limit(1000).end(),
    base().match({ kind: 'view' }).group({ _id: '$uid' }).count('users').end(),
    base().group({ _id: { day: '$day', kind: '$kind' }, count: aggregate.sum(1) }).limit(1000).end(),
    base().group({ _id: { module: '$module', action: '$action', kind: '$kind', reason: '$reason' }, count: aggregate.sum(1) }).sort({ count: -1 }).limit(1000).end()
  ])
  const rows = Object.keys(catalog.modules).map(module => ({ module, label: catalog.modules[module], views: 0, clicks: 0, completes: 0, errors: 0, shares: 0, users: 0 }))
  const byModule = Object.fromEntries(rows.map(row => [row.module, row]))
  for (const row of counts.list || []) if (byModule[row._id.module] && columns[row._id.kind]) byModule[row._id.module][columns[row._id.kind]] = row.count
  for (const row of visitors.list || []) if (byModule[row._id]) byModule[row._id].users = row.users
  const daysMap = {}
  for (let n = days - 1; n >= 0; n--) { const day = dayKey(Date.now() - n * 86400000); daysMap[day] = { day, views: 0, clicks: 0, completes: 0, errors: 0, shares: 0 } }
  for (const row of daily.list || []) if (daysMap[row._id.day] && columns[row._id.kind]) daysMap[row._id.day][columns[row._id.kind]] = row.count
  return { ok: true, source: 'cloud', start, end, rows, daily: Object.values(daysMap), users: (totalVisitors.list || [])[0]?.users || 0,
    actions: (details.list || []).map(row => ({ ...row._id, count: row.count })), actionsLimited: (details.list || []).length === 1000 }
}
exports.main = async (event = {}) => {
  try {
    const context = cloud.getWXContext()
    // 仅无小程序调用身份的真实定时器可执行维护；客户端伪造 Type/TriggerName 无效。
    if (!context.OPENID && !context.UNIONID && event.Type === 'Timer' && event.TriggerName === 'analytics_hourly') {
      await ensureCollection()
      return await maintenance.run()
    }
    if (!context.OPENID || !context.APPID) return { ok: false, error: 'unauthorized' }
    const uid = hash(context.APPID + ':' + context.OPENID), admin = adminAllowed(uid)
    if (event.action === 'status') return { ok: true, admin, viewerId: uid }
    if (event.action === 'collect') return await collect(event.events, uid, event.quality)
    if (event.action === 'feedback_submit') {
      if (!event.feedback || !Object.prototype.hasOwnProperty.call(catalog.modules, event.feedback.module)) return { ok: false, error: 'invalid_feedback' }
      await ensureCollection()
      return await operations.submitFeedback(event.feedback, uid)
    }
    if (event.action === 'feedback_mine') { await ensureCollection(); return await operations.feedbackList(event, uid, false) }
    if (['release_list', 'release_save', 'operations', 'delivery_summary', 'feedback_list', 'feedback_update', 'maintenance_status', 'maintenance_run', 'history'].includes(event.action)) {
      if (!admin) return { ok: false, error: 'forbidden' }
      await ensureCollection()
      if (event.action === 'release_list') return await releases.list(event.cursor)
      if (event.action === 'release_save') return await releases.save(event.release)
      if (event.action === 'feedback_list') return await operations.feedbackList(event, uid, true)
      if (event.action === 'feedback_update') return await operations.feedbackUpdate(event)
      if (event.action === 'maintenance_status') return await maintenance.status()
      if (event.action === 'maintenance_run') return await maintenance.run()
      if (event.action === 'history') return await maintenance.history(event.cursor)
      if (![1, 7, 30].includes(Number(event.days))) return { ok: false, error: 'invalid_range' }
      if (event.action === 'delivery_summary') return await delivery.summary(Number(event.days))
      return { ok: true, operations: await operations.summary(Number(event.days)) }
    }
    if (event.action === 'summary') {
      if (!admin) return { ok: false, error: 'forbidden' }
      const days = Number(event.days)
      if (![1, 7, 30].includes(days)) return { ok: false, error: 'invalid_range' }
      return await summary(days)
    }
    return { ok: false, error: 'unsupported_action' }
  } catch (error) {
    console.warn('analytics request failed', { action: ['collect', 'summary', 'operations', 'feedback_submit', 'feedback_mine', 'feedback_list', 'feedback_update'].includes(event.action) ? event.action : 'unknown', code: String(error.errCode || error.code || 'unknown').slice(0, 40) })
    return { ok: false, error: 'analytics_unavailable' }
  }
}
