const catalog = require('./analytics-catalog')
const { CLOUD_ENV_ID } = require('./cloud')
const operations = require('./operations-model')
const metrics = require('./operations-metrics')
const delivery = require('./delivery-quality')
const OPS_KEY = 'paw_operations_local_v2'
const QUEUE_KEY = 'paw_analytics_queue_v1'
const LOCAL_KEY = 'paw_analytics_local_v1'
const kinds = ['view', 'click', 'complete', 'error', 'share', 'session', 'funnel', 'impression', 'engagement', 'measure']
const actions = new Set([...Object.values(catalog.handlers).flat(), ...catalog.extraActions])
let queue, local, timer, sending = false, active = true, retryAt = 0, failures = 0, sequence = 0
let adminCache = null
let session = null, lastActive = 0, pendingTool = null, pendingOuting = null
let consentVersion = 0
let consentChoice
let deliveryAvailable = true
let inFlightIds = new Set()
const newId = () => Date.now().toString(36) + '-' + (++sequence).toString(36) + '-' + Math.random().toString(36).slice(2, 12)
const read = (key, fallback) => { try { return wx.getStorageSync(key) || fallback } catch (_) { return fallback } }
const write = (key, value) => { try { wx.setStorageSync(key, value); return true } catch (_) { return false } }
const dayKey = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10)
function isDebug() {
  try { return wx.getAccountInfoSync().miniProgram.envVersion !== 'release' || wx.getStorageSync('paw_data_mode') === 'demo' }
  catch (_) { return true }
}
function enabled() { return consentChoice === undefined ? read('paw_usage_enabled', true) !== 'off' : consentChoice }
function setEnabled(value) {
  consentVersion++
  consentChoice = !!value
  session = null
  const persisted = write('paw_usage_enabled', value ? 'on' : 'off')
  if (!value) { queue = []; write(QUEUE_KEY, queue); delivery.reset(); pendingTool = null; pendingOuting = null; if (timer) { clearTimeout(timer); timer = null } }
  return persisted
}
function load() {
  if (!queue) { const saved = read(QUEUE_KEY, []); queue = Array.isArray(saved) ? saved.filter(e => e && Number.isFinite(e.time)) : [] }
  if (!local) { const saved = read(LOCAL_KEY, {}); local = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {} }
}
function saveQueue() {
  if (!write(QUEUE_KEY, queue) && enabled() && !isDebug()) delivery.bump(metadata().version, { storageFailures: 1 })
}
function trimQueue() {
  const valid = queue.filter(e => inFlightIds.has(e.id) || Date.now() - e.time < 7 * 86400000)
  const expired = queue.length - valid.length, overflow = Math.max(0, valid.length - 200)
  let remove = overflow
  queue = valid.filter(e => { if (remove && !inFlightIds.has(e.id)) { remove--; return false } return true })
  if (expired || overflow) delivery.bump(metadata().version, { expired, overflow })
  return !!(expired || overflow)
}
function emptyRow(module) { return { module, label: catalog.modules[module], views: 0, clicks: 0, completes: 0, errors: 0, shares: 0, users: 0 } }
const columns = { view: 'views', click: 'clicks', complete: 'completes', error: 'errors', share: 'shares' }
function localRecord(event) {
  const saved = read(OPS_KEY, { events: [], visitor: null })
  const events = (Array.isArray(saved.events) ? saved.events : []).filter(e => e.time >= Date.now() - 30 * operations.DAY).concat(event).slice(-3000)
  write(OPS_KEY, { events, visitor: operations.mergeVisitor(saved.visitor, [event], Date.now()), limited: !!saved.limited || events.length === 3000 })
  if (!columns[event.kind]) return
  const day = dayKey(event.time)
  for (const key of Object.keys(local)) if (key < dayKey(Date.now() - 30 * 86400000)) delete local[key]
  if (!local[day]) local[day] = {}
  const row = local[day][event.module] || (local[day][event.module] = { ...emptyRow(event.module), actions: {} })
  row[columns[event.kind]]++
  const key = event.action + ':' + event.kind + (event.reason ? ':' + event.reason : '')
  row.actions[key] = (row.actions[key] || 0) + 1
  write(LOCAL_KEY, local)
}
function metadata() {
  const debug = isDebug()
  if (!session || session.debug !== debug) {
    let version = 'unknown', platform = 'unknown'
    try { version = wx.getAccountInfoSync().miniProgram.version || (debug ? 'develop' : 'unknown'); platform = (wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()).platform } catch (_) {}
    session = { ...operations.context({ version, platform, session: newId() }), debug }
  }
  return operations.context(session)
}
function track(module, kind, action = 'page', reason = '', detail = {}) {
  try {
    if (!enabled()) return
    if (!Object.prototype.hasOwnProperty.call(catalog.modules, module) || !kinds.includes(kind) || !actions.has(action)) return
    load()
    const time = Date.now()
    const event = { id: newId(), time, module, kind, action, ...metadata() }
    const measured = metrics.cleanDetail({ ...event, ...detail })
    if (!measured) return
    Object.assign(event, measured)
    if (kind === 'funnel') {
      const spec = operations.flows[detail.flowName]
      if (!spec || spec.module !== module || !Number.isInteger(detail.step) || detail.step < 0 || detail.step >= spec.steps.length || !/^[a-z0-9-]{10,70}$/.test(detail.flowId || '')) return
      Object.assign(event, { flowName: detail.flowName, flowId: detail.flowId, step: detail.step })
    }
    if (kind === 'error') event.reason = errorReason(reason)
    if (isDebug()) { localRecord(event); return }
    delivery.bump(event.version, { generated: 1 })
    queue.push(event); trimQueue(); saveQueue()
    schedule()
  } catch (_) { /* 统计不可阻断业务。 */ }
}
function errorReason(error) {
  const value = String(error && (error.errMsg || error.message) || error || '')
  if (/cancel/i.test(value)) return 'cancel'
  if (/auth|permission|denied|forbidden|readonly|权限/i.test(value)) return 'permission'
  if (/timeout|超时/i.test(value)) return 'timeout'
  if (/network|offline|网络/i.test(value)) return 'network'
  if (/valid|invalid|日期|填写|选择/i.test(value)) return 'validation'
  return 'unavailable'
}
function failure(module, action, error) { if (errorReason(error) !== 'cancel') track(module, 'error', action, error) }
function startOperation(module, operation) {
  const start = Date.now(), debug = isDebug(), consent = consentVersion, meta = metadata()
  let finished = false
  return (error, cancelled = false) => {
    if (finished) return
    finished = true
    if (!enabled() || consent !== consentVersion || debug !== isDebug() || meta.version !== metadata().version) return
    const outcome = cancelled || errorReason(error) === 'cancel' ? 'cancelled' : error ? 'failure' : 'success'
    track(module, 'measure', 'operation', '', { operation, outcome, durationMs: Math.min(120000, Math.max(0, Date.now() - start)) })
  }
}
function request(data) {
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.callFunction) return Promise.reject(new Error('cloud_unavailable'))
  wx.cloud.init({ env: CLOUD_ENV_ID })
  let timeout
  const call = Promise.resolve().then(() => wx.cloud.callFunction({ name: 'pet-analytics', config: { env: CLOUD_ENV_ID }, data }))
  return Promise.race([call, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('analytics_timeout')), 25000) })]).finally(() => clearTimeout(timeout)).then(response => {
    const result = response && response.result
    if (!result || !result.ok) throw new Error(result && result.error || 'analytics_unavailable')
    return result
  })
}
function schedule() {
  if (!active || !enabled() || timer || sending || isDebug() || !queue || (!queue.length && !(deliveryAvailable && delivery.pending()))) return
  timer = setTimeout(() => { timer = null; flush() }, Math.max(15000, retryAt - Date.now()))
}
async function flush() {
  if (sending) return
  let ownsRequest = false
  const consent = consentVersion, version = metadata().version
  try {
    load()
    if (!enabled() || isDebug() || (!queue.length && !(deliveryAvailable && delivery.pending())) || Date.now() < retryAt) return
    sending = true; ownsRequest = true
    if (timer) { clearTimeout(timer); timer = null }
    if (trimQueue()) saveQueue()
    const batch = queue.slice(0, 8)
    inFlightIds = new Set(batch.map(e => e.id))
    const quality = deliveryAvailable ? delivery.snapshots() : []
    if (!batch.length && !quality.length) return
    const result = await request({ action: 'collect', events: batch, quality })
    if (consent !== consentVersion || !enabled() || isDebug()) return
    deliveryAvailable = result.deliverySchema === 1
    delivery.acknowledge(quality, result.qualityIds)
    const acknowledged = new Set(Array.isArray(result.ids) ? result.ids : [])
    const rejected = new Set(Array.isArray(result.rejectedIds) ? result.rejectedIds : [])
    const confirmed = batch.filter(e => acknowledged.has(e.id) && !rejected.has(e.id)).length
    const refused = batch.filter(e => acknowledged.has(e.id) && rejected.has(e.id)).length
    if (batch.length && !confirmed && !refused) throw new Error('analytics_batch_unacknowledged')
    if (!batch.length && quality.length && deliveryAvailable && !result.qualityIds?.length) throw new Error('analytics_quality_unacknowledged')
    if (batch.length) delivery.bump(version, { confirmed, rejected: refused,
      successfulBatches: confirmed + refused === batch.length ? 1 : 0, partialBatches: confirmed + refused < batch.length ? 1 : 0 })
    const previousLength = queue.length
    queue = queue.filter(e => !acknowledged.has(e.id))
    if (queue.length !== previousLength) saveQueue()
    failures = 0; retryAt = 0
  } catch (_) {
    if (ownsRequest && consent === consentVersion && enabled() && !isDebug()) delivery.bump(version, { failedBatches: 1 })
    failures++; retryAt = Date.now() + Math.min(600000, 30000 * Math.pow(2, Math.min(failures, 4)))
  }
  finally { if (ownsRequest) { sending = false; inFlightIds.clear() } schedule() }
}
function pause() { active = false; lastActive = Date.now(); if (timer) { clearTimeout(timer); timer = null } }
function resume(options) {
  active = true
  deliveryAvailable = true
  const source = operations.source(options)
  if (!session || Date.now() - lastActive > 30 * 60000 || session.debug !== isDebug() || source !== 'unknown' && source !== session.channel) {
    session = null; metadata(); session.channel = source
    track('home', 'session', 'app_open')
  }
  lastActive = Date.now(); flush()
}
function beginFlow(name) {
  if (!enabled() || !operations.has(operations.flows, name)) return null
  const flow = { name, id: newId(), debug: isDebug(), createdAt: Date.now(), steps: {} }
  stepFlow(flow, 0); return flow
}
function stepFlow(flow, step) {
  if (!enabled() || !flow || flow.debug !== isDebug() || Date.now() - flow.createdAt > 7 * operations.DAY || flow.steps[step]) return
  const spec = operations.flows[flow.name]
  if (!spec || !Number.isInteger(step) || step < 0 || step >= spec.steps.length) return
  flow.steps[step] = true
  track(spec.module, 'funnel', 'flow_step', '', { flowName: flow.name, flowId: flow.id, step })
}
function handoffTool(flow) { pendingTool = flow }
function takeTool(name) { const flow = pendingTool; pendingTool = null; return flow && flow.name === name && Date.now() - flow.createdAt < 7 * operations.DAY ? flow : null }
function handoffOuting(flow, id) { pendingOuting = { flow, id } }
function takeOuting(id) { const pending = pendingOuting; pendingOuting = null; return pending && pending.id === id ? pending.flow : null }
function tagShare(value, module, timeline = false) {
  if (!value || typeof value !== 'object') return value
  const channel = ['age', 'personality', 'bingo'].includes(module) ? module + '_share' : ['place', 'outings', 'saved'].includes(module) ? 'outings_share' : module === 'family' || module === 'account' ? 'family_share' : ''
  if (!channel) return value
  const field = timeline ? 'query' : 'path', raw = value[field] || (timeline ? '' : '')
  if (!timeline && !raw) return value
  const clean = raw.replace(/([?&])src=[^&]*&?/g, '$1').replace(/[?&]$/, '')
  return { ...value, [field]: clean + (timeline ? clean ? '&' : '' : clean.includes('?') ? '&' : '?') + 'src=' + channel }
}
function localOperations(days) {
  const saved = read(OPS_KEY, { events: [], visitor: null })
  return { ...operations.localReport(saved.events || [], days, Date.now(), saved.visitor), limited: !!saved.limited }
}
function localSummary(days = 7) {
  load()
  const start = dayKey(Date.now() - (days - 1) * 86400000), end = dayKey(Date.now())
  const rows = Object.keys(catalog.modules).map(emptyRow), byModule = Object.fromEntries(rows.map(r => [r.module, r]))
  const daily = [], actionRows = {}
  for (let n = days - 1; n >= 0; n--) {
    const day = dayKey(Date.now() - n * 86400000), dayRow = { day, views: 0, clicks: 0, completes: 0, errors: 0, shares: 0 }
    for (const [module, source] of Object.entries(local[day] || {})) {
      const target = byModule[module]; if (!target) continue
      for (const column of Object.values(columns)) { target[column] += Number(source[column]) || 0; dayRow[column] += Number(source[column]) || 0 }
      if (source.views) target.users = 1
      for (const [key, count] of Object.entries(source.actions || {})) {
        const id = module + ':' + key
        const [action, kind, reason] = key.split(':')
        actionRows[id] = actionRows[id] || { module, action, kind, ...(reason ? { reason } : {}), count: 0 }
        actionRows[id].count += Number(count) || 0
      }
    }
    daily.push(dayRow)
  }
  return { ok: true, source: 'local', start, end, users: rows.some(r => r.views) ? 1 : 0, rows, daily, actions: Object.values(actionRows) }
}
async function access() {
  if (isDebug()) return { visible: true, debug: true }
  if (adminCache && Date.now() - adminCache.time < 60000) return adminCache.value
  try { const result = await request({ action: 'status' }); const value = { visible: !!result.admin, debug: false }; adminCache = { time: Date.now(), value }; return value }
  catch (_) { return { visible: false, debug: false } }
}
module.exports = { catalog, operations, metrics, startOperation, track, failure, flush, pause, resume, access, request, isDebug, localSummary, localOperations,
  beginFlow, stepFlow, handoffTool, takeTool, handoffOuting, takeOuting, tagShare, metadata, newId, enabled, setEnabled }
