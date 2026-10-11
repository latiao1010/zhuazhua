const model = require('./operations-model')

module.exports = function operations(db, collection, hash) {
  const metricQueries = require('./metrics')(db, collection)
  const command = db.command, $ = command.aggregate
  const safe = { _openid: command.exists(false) }
  const base = recordType => db.collection(collection).aggregate().match({ ...safe, recordType })
  const range = (start, end) => command.gte(start).and(command.lte(end))
  const count = condition => $.sum($.cond({ if: condition, then: 1, else: 0 }))
  const recordsInRange = start => $.gt([$.size($.filter({ input: '$recordDays', as: 'day', cond: $.gte(['$$day', start]) })), 0])
  async function get(ref) {
    try { const r = await ref.get(); return Array.isArray(r.data) ? r.data[0] || null : r.data || null }
    catch (e) { if (/document.*(not exist|not found)|document.*不存在/i.test(e.message || e.errMsg || '')) return null; throw e }
  }
  async function mutate(id, update) {
    const result = await db.runTransaction(async transaction => {
      const ref = transaction.collection(collection).doc(id)
      const old = await get(ref), next = update(old)
      if (next) await ref.set({ data: next })
      return next || old
    })
    return result && result.result !== undefined ? result.result : result
  }
  async function collect(events, uid, now) {
    const recent = events.filter(e => e.schema === 2)
    if (!recent.length) return
    await mutate('op_user_' + uid, old => model.mergeVisitor(old, recent, now))
    const groups = {}
    for (const event of recent.filter(e => e.kind === 'funnel')) {
      const id = 'op_flow_' + hash(uid + ':' + event.flowName + ':' + event.flowId)
      ;(groups[id] || (groups[id] = [])).push(event)
    }
    for (const [id, group] of Object.entries(groups)) await mutate(id, old => model.mergeFlow(old, group))
  }
  async function summary(days) {
    const today = model.dayKey(Date.now()), start = model.shiftDay(today, 1 - days)
    const firstRange = range(start, today)
    const [totals, cohort, channels, activeDays, newDays, extra] = await Promise.all([
      base('visitor').match({ lastDay: command.gte(start) }).group({ _id: null, users: $.sum(1),
        newUsers: count($.gte(['$firstDay', start])), recordUsers: count(recordsInRange(start)) }).end(),
      base('visitor').match({ firstDay: firstRange }).group({ _id: null, total: $.sum(1),
        eligible1: count($.lte(['$firstDay', model.shiftDay(today, -2)])),
        returned1: count($.and([$.lte(['$firstDay', model.shiftDay(today, -2)]), $.eq(['$d1', true])])),
        eligible7: count($.lte(['$firstDay', model.shiftDay(today, -8)])),
        returned7: count($.and([$.lte(['$firstDay', model.shiftDay(today, -8)]), $.eq(['$d7', true])])) }).end(),
      base('visitor').match({ firstDay: firstRange }).group({ _id: '$firstChannel', users: $.sum(1), recordUsers: count(recordsInRange(start)),
        eligible7: count($.lte(['$firstDay', model.shiftDay(today, -8)])),
        returned7: count($.and([$.lte(['$firstDay', model.shiftDay(today, -8)]), $.eq(['$d7', true])])) }).limit(100).end(),
      base('visitor').match({ lastDay: command.gte(start) }).unwind('$days').match({ days: firstRange }).group({ _id: '$days', users: $.sum(1) }).limit(31).end(),
      base('visitor').match({ firstDay: firstRange }).group({ _id: '$firstDay', users: $.sum(1) }).limit(31).end(),
      metricQueries.read(start, today)
    ])
    const total = totals.list[0] || {}, retention = cohort.list[0] || {}
    const daily = Array.from({ length: days }, (_, index) => {
      const day = model.shiftDay(start, index)
      return { day, users: (activeDays.list.find(d => d._id === day) || {}).users || 0, newUsers: (newDays.list.find(d => d._id === day) || {}).users || 0 }
    })
    return { users: total.users || 0, newUsers: total.newUsers || 0, returningUsers: (total.users || 0) - (total.newUsers || 0), recordUsers: total.recordUsers || 0,
      retention: [1, 7].map(day => ({ day, eligible: retention['eligible' + day] || 0, returned: retention['returned' + day] || 0, pending: (retention.total || 0) - (retention['eligible' + day] || 0) })),
      channels: channels.list.map(c => ({ channel: c._id, users: c.users, recordUsers: c.recordUsers, eligible7: c.eligible7, returned7: c.returned7 })).sort((a, b) => b.users - a.users),
      ...extra, funnels: model.funnelRows(extra.flowCounts), daily,
      versions: extra.eventVersions.slice(0, 20), versionsLimited: extra.eventVersions.length > 20 }
  }
  function feedbackView(row) {
    return { id: row._id, type: row.type, module: row.module, message: row.message, version: row.version, platform: row.platform,
      createdAt: row.createdAt, status: row.status, updatedAt: row.updatedAt,
      reply: row.reply || '', fixVersion: row.fixVersion || '', repliedAt: row.repliedAt || 0 }
  }
  async function submitFeedback(input, uid) {
    if (!input || typeof input.id !== 'string' || !/^[a-z0-9-]{10,70}$/.test(input.id) || !model.has(model.feedbackTypes, input.type)) return { ok: false, error: 'invalid_feedback' }
    const message = typeof input.message === 'string' ? input.message.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '') : ''
    if (message.length < 5 || message.length > 1000) return { ok: false, error: 'invalid_feedback' }
    const now = Date.now(), id = 'op_feedback_' + hash(uid + ':' + input.id), day = model.dayKey(now)
    const result = await db.runTransaction(async transaction => {
      const ref = transaction.collection(collection).doc(id), old = await get(ref)
      if (old) return { ok: true, id }
      const quotaRef = transaction.collection(collection).doc('op_feedback_quota_' + hash(uid + ':' + day))
      const quota = await get(quotaRef)
      if (quota && quota.count >= 5) return { ok: false, error: 'feedback_limit' }
      const meta = model.context(input)
      await ref.set({ data: { recordType: 'feedback', uid, type: input.type, module: input.module, message,
        version: meta.version, platform: meta.platform, createdAt: now, updatedAt: now, status: 'new' } })
      await quotaRef.set({ data: { recordType: 'feedback_quota', expiresAt: now + 2 * model.DAY, count: (quota && quota.count || 0) + 1 } })
      return { ok: true, id }
    })
    return result && result.result !== undefined ? result.result : result
  }
  async function feedbackList(event, uid, admin) {
    const where = { ...safe, recordType: 'feedback', ...(!admin ? { uid } : {}) }
    if (model.has(model.feedbackStates, event.status)) where.status = event.status
    const cursor = event.cursor
    const valid = cursor && Number.isSafeInteger(cursor.time) && /^op_feedback_[a-f0-9]{64}$/.test(cursor.id || '')
    const condition = valid ? command.and([where, command.or([{ createdAt: command.lt(cursor.time) }, { createdAt: cursor.time, _id: command.lt(cursor.id) }])]) : where
    const result = await db.collection(collection).where(condition).orderBy('createdAt', 'desc').orderBy('_id', 'desc').limit(21).get()
    const rows = result.data.slice(0, 20), last = rows[rows.length - 1]
    return { ok: true, rows: rows.map(feedbackView), cursor: result.data.length > 20 && last ? { time: last.createdAt, id: last._id } : null }
  }
  async function feedbackUpdate(event) {
    if (!/^op_feedback_[a-f0-9]{64}$/.test(event.id || '') || !model.has(model.feedbackStates, event.status) || !Number.isSafeInteger(event.updatedAt)) return { ok: false, error: 'invalid_feedback' }
    const changes = { status: event.status }
    if (event.reply !== undefined || event.fixVersion !== undefined) {
      if (typeof event.reply !== 'string' || typeof event.fixVersion !== 'string') return { ok: false, error: 'invalid_feedback_reply' }
      const reply = event.reply.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''), fixVersion = event.fixVersion.trim()
      if (reply.length > 1000 || (event.status === 'resolved' && !reply) || (fixVersion && !/^[a-zA-Z0-9._-]{1,32}$/.test(fixVersion)) || (fixVersion && !reply)) return { ok: false, error: 'invalid_feedback_reply' }
      Object.assign(changes, { reply, fixVersion })
    }
    const ref = db.collection(collection).doc(event.id), old = await get(ref)
    if (!old || old.recordType !== 'feedback' || old._openid) return { ok: false, error: 'feedback_missing' }
    const updatedAt = Math.max(Date.now(), old.updatedAt + 1)
    if (changes.reply !== undefined) changes.repliedAt = changes.reply ? (changes.reply !== (old.reply || '') || changes.fixVersion !== (old.fixVersion || '') ? updatedAt : old.repliedAt || updatedAt) : 0
    // 使用条件更新防止两位管理员覆盖彼此的处理状态。
    const result = await db.collection(collection).where({ ...safe, _id: event.id, recordType: 'feedback', updatedAt: event.updatedAt }).update({ data: { ...changes, updatedAt } })
    return result.stats && result.stats.updated ? { ok: true } : { ok: false, error: 'feedback_changed' }
  }
  return { collect, summary, submitFeedback, feedbackList, feedbackUpdate }
}
