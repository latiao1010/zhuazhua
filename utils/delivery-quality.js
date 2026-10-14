// 单独保存发送质量计数；不创建业务事件，不读取用户输入。
const KEY = 'paw_delivery_quality_v1'
const DAY = 86400000
const fields = ['generated', 'confirmed', 'rejected', 'overflow', 'expired', 'failedBatches', 'partialBatches', 'successfulBatches', 'storageFailures']
const dayKey = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10)
let state
function load() {
  if (state) return state
  let saved
  try { saved = wx.getStorageSync(KEY) } catch (_) {}
  state = saved && Array.isArray(saved.rows) && /^[a-z0-9-]{10,70}$/.test(saved.reporter || '') ? saved : {
    reporter: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14), rows: [] }
  state.rows = state.rows.filter(r => r && typeof r.day === 'string' && r.day >= dayKey(Date.now() - 7 * DAY) && r.day <= dayKey(Date.now()) && /^[a-zA-Z0-9._-]{1,32}$/.test(r.version || '') && Number.isSafeInteger(r.revision) && r.revision > 0 && fields.every(k => Number.isSafeInteger(r[k]) && r[k] >= 0 && r[k] <= 10000000)).slice(-24)
  for (const row of state.rows) if (!Number.isSafeInteger(row.sentRevision)) row.sentRevision = 0
  return state
}
function persist() { try { wx.setStorageSync(KEY, state) } catch (_) {} }
function bump(version, changes) {
  const data = load(), day = dayKey(Date.now())
  data.rows = data.rows.filter(r => r.day >= dayKey(Date.now() - 7 * DAY)).slice(-24)
  let row = data.rows.find(r => r.day === day && r.version === version)
  if (!row) { row = { day, version, revision: 0, sentRevision: 0 }; data.rows.push(row); data.rows = data.rows.slice(-24) }
  for (const key of fields) row[key] = Math.min(10000000, (row[key] || 0) + Math.max(0, Number(changes[key]) || 0))
  row.revision++; row.updatedAt = Date.now(); persist()
}
function pending() { return load().rows.some(r => r.revision > r.sentRevision) }
function snapshots() {
  const data = load()
  return data.rows.filter(r => r.revision > r.sentRevision).slice(0, 4).map(r => ({
    reporter: data.reporter, day: r.day, version: r.version, revision: r.revision,
    ...Object.fromEntries(fields.map(k => [k, r[k] || 0]))
  }))
}
function acknowledge(sent, ids) {
  const data = load(), keys = new Set(ids || [])
  for (const value of sent) {
    if (value.reporter !== data.reporter || !keys.has(value.day + ':' + value.version + ':' + value.revision)) continue
    const row = data.rows.find(r => r.day === value.day && r.version === value.version)
    if (row) row.sentRevision = Math.max(row.sentRevision || 0, value.revision)
  }
  persist()
}
function reset() {
  state = { reporter: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14), rows: [] }
  try { wx.removeStorageSync(KEY) } catch (_) { persist() }
}
module.exports = { bump, pending, snapshots, acknowledge, reset }
