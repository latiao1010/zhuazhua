const analytics = require('./analytics')
const KEY = 'paw_feedback_local_v1'
function read() { try { const saved = wx.getStorageSync(KEY); return Array.isArray(saved) ? saved : [] } catch (_) { return [] } }
async function submit(feedback) {
  const payload = { ...feedback, ...analytics.metadata() }
  if (!analytics.isDebug()) return analytics.request({ action: 'feedback_submit', feedback: payload })
  const rows = read(), existing = rows.find(row => row.id === payload.id)
  if (!existing) {
    const now = Date.now()
    wx.setStorageSync(KEY, [{ ...payload, createdAt: now, updatedAt: now, status: 'new' }, ...rows].slice(0, 100))
  }
  return { ok: true, id: payload.id, local: true }
}
async function list({ local = analytics.isDebug(), admin = false, status = '', cursor = null } = {}) {
  if (local) {
    const rows = read().filter(row => !status || row.status === status)
    const start = Number(cursor) || 0
    return { rows: rows.slice(start, start + 20), cursor: rows.length > start + 20 ? start + 20 : null }
  }
  return analytics.request({ action: admin ? 'feedback_list' : 'feedback_mine', status, cursor })
}
async function update(row, status, local, resolution) {
  const changes = { status }
  if (resolution) {
    const reply = String(resolution.reply || '').trim(), fixVersion = String(resolution.fixVersion || '').trim()
    if (reply.length > 1000 || (status === 'resolved' && !reply) || (fixVersion && !/^[a-zA-Z0-9._-]{1,32}$/.test(fixVersion)) || (fixVersion && !reply)) throw new Error('invalid_feedback_reply')
    Object.assign(changes, { reply, fixVersion })
  }
  if (local) {
    const rows = read(), index = rows.findIndex(r => r.id === row.id)
    if (index < 0) throw new Error('feedback_missing')
    if (rows[index].updatedAt !== row.updatedAt) throw new Error('feedback_changed')
    const updatedAt = Math.max(Date.now(), rows[index].updatedAt + 1)
    if (resolution) changes.repliedAt = changes.reply ? (changes.reply !== (rows[index].reply || '') || changes.fixVersion !== (rows[index].fixVersion || '') ? updatedAt : rows[index].repliedAt || updatedAt) : 0
    rows[index] = { ...rows[index], ...changes, updatedAt }; wx.setStorageSync(KEY, rows)
    return { ok: true }
  }
  return analytics.request({ action: 'feedback_update', id: row.id, updatedAt: row.updatedAt, ...changes })
}
function view(row) {
  return { ...row, typeLabel: analytics.operations.feedbackTypes[row.type] || '其他', moduleLabel: analytics.catalog.modules[row.module] || '其他',
    statusLabel: analytics.operations.feedbackStates[row.status] || '待处理', dateLabel: new Date(row.createdAt + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' '),
    replyDateLabel: row.repliedAt ? new Date(row.repliedAt + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ') : '' }
}
module.exports = { submit, list, update, view }
