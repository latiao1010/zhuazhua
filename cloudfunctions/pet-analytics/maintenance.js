const model = require('./operations-model')
const metrics = require('./operations-metrics')
const POLICY = { rawDays: 90, flowDays: 90, resolvedFeedbackDays: 180, quotaDays: 2, finalizeAfterDays: 15 }
const STATE = 'op_maintenance_v3'
module.exports = function maintenance(db, collection, hash) {
  const _ = db.command, reports = require('./metrics')(db, collection)
  const safe = { _openid: _.exists(false) }
  const doc = id => db.collection(collection).doc(id)
  async function get(id) {
    try { const r = await doc(id).get(); return Array.isArray(r.data) ? r.data[0] || null : r.data || null }
    catch (e) { if (/document.*(not exist|not found)|document.*不存在/i.test(e.message || e.errMsg || '')) return null; throw e }
  }
  async function transaction(update) {
    const result = await db.runTransaction(async tx => {
      const ref = tx.collection(collection).doc(STATE)
      let old
      try { const r = await ref.get(); old = Array.isArray(r.data) ? r.data[0] : r.data }
      catch (e) { if (!/document.*(not exist|not found)|document.*不存在/i.test(e.message || e.errMsg || '')) throw e }
      const value = update(old || {})
      if (value) delete value._id
      if (value) await ref.set({ data: { ...value, recordType: 'maintenance' } })
      return value
    })
    return result && result.result !== undefined ? result.result : result
  }
  // 小批删除，并带完整条件再次匹配；中断后再次运行可继续，不依赖 offset。
  async function removeBatch(condition) {
    const query = { ...safe, ...condition }
    const result = await db.collection(collection).where(query).field({ _id: true }).limit(100).get()
    if (!result.data.length) return 0
    const ids = result.data.map(r => r._id)
    const removed = await db.collection(collection).where(_.and([query, { _id: _.in(ids) }])).remove()
    return removed.stats?.removed || 0
  }
  async function monitor(report, now) {
    const current = metrics.alerts(report.measures, report.events)
    if (!report.complete) current.push({ key: 'incomplete', type: 'system', title: '汇总维度超过单次处理容量', detail: '当前汇总可能不完整，清理已暂停。' })
    const id = 'op_alerts_' + report.day, previous = await get(id)
    for (const item of current) if (!(previous?.alerts || []).some(old => old.key === item.key)) console.warn('PAW_OPERATIONS_ALERT', JSON.stringify({ day: report.day, ...item }))
    await doc(id).set({ data: { recordType: 'alert_snapshot', day: report.day, updatedAt: now, alerts: current } })
    return current
  }
  async function run() {
    const now = Date.now(), today = model.dayKey(now), token = hash(String(now) + ':' + Math.random())
    const state = await transaction(old => old.leaseUntil > now ? null : { ...old, createdAt: old.createdAt || now, leaseToken: token, leaseUntil: now + 120000, lastStartedAt: now })
    if (!state) return { ok: true, busy: true }
    const deadline = now + 12000, counts = { archived: 0, removed: 0 }
    let finalCursor = state.finalCursor || '', finalError = ''
    try {
      const current = await reports.daily(today)
      if (Buffer.byteLength(JSON.stringify(current)) > 700000) throw new Error('incomplete_summary')
      // 今日汇总可重建，已封存的日期永不以删除后的明细重新计算。
      await doc('op_daily_' + today).set({ data: { ...current, finalized: false, purged: false } })
      await monitor(current, now)
      if (!current.complete) throw new Error('incomplete_summary')
      if (!finalCursor) {
        const first = await db.collection(collection).where({ ...safe, kind: _.exists(true), day: _.exists(true) }).orderBy('day', 'asc').limit(1).get()
        finalCursor = [first.data[0]?.day || today, model.shiftDay(today, -7)].sort()[0]
      }
      const mature = model.shiftDay(today, -POLICY.finalizeAfterDays)
      for (let n = 0; n < 2 && finalCursor <= mature && Date.now() < deadline; n++) {
        const id = 'op_daily_' + finalCursor, existing = await get(id)
        if (!existing?.finalized) {
          const daily = await reports.daily(finalCursor)
          if (!daily.complete || Buffer.byteLength(JSON.stringify(daily)) > 700000) throw new Error('incomplete_archive')
          await doc(id).set({ data: { ...daily, finalized: true, purged: false } })
        }
        finalCursor = model.shiftDay(finalCursor, 1); counts.archived++
      }
      // 只有已经成功封存完整日报的日期，才允许删除原始事件和对应流程。
      if (Date.now() < deadline) {
        const expired = await db.collection(collection).where({ ...safe, recordType: 'daily_report', finalized: true, complete: true, purged: false, day: _.lt(model.shiftDay(today, -POLICY.rawDays)) }).orderBy('day', 'asc').limit(1).get()
        const report = expired.data[0]
        if (report) {
          const raw = { day: report.day, kind: _.exists(true) }, flows = { recordType: 'flow', startDay: report.day }
          const quality = { recordType: 'delivery_health', day: report.day }
          for (let n = 0; n < 10 && Date.now() < deadline; n++) {
            const rawRemoved = await removeBatch(raw), flowRemoved = await removeBatch(flows)
            const qualityRemoved = report.delivery ? await removeBatch(quality) : 0
            counts.removed += rawRemoved + flowRemoved + qualityRemoved
            if (rawRemoved < 100 && flowRemoved < 100 && qualityRemoved < 100) break
          }
          const [leftRaw, leftFlows, leftQuality] = await Promise.all([db.collection(collection).where({ ...safe, ...raw }).count(), db.collection(collection).where({ ...safe, ...flows }).count(), report.delivery ? db.collection(collection).where({ ...safe, ...quality }).count() : { total: 0 }])
          if (!leftRaw.total && !leftFlows.total && !leftQuality.total) await doc(report._id).update({ data: { purged: true, purgedAt: now } })
        }
      }
      if (Date.now() < deadline) counts.removed += await removeBatch({ recordType: 'feedback_quota', expiresAt: _.lt(now) })
      if (Date.now() < deadline) counts.removed += await removeBatch({ recordType: 'feedback', status: 'resolved', updatedAt: _.lt(now - POLICY.resolvedFeedbackDays * model.DAY) })
      if (Date.now() < deadline) counts.removed += await removeBatch({ recordType: 'flow', startDay: '', lastTime: _.lt(now - POLICY.flowDays * model.DAY) })
      if (Date.now() < deadline) counts.removed += await removeBatch({ recordType: 'alert_snapshot', day: _.lt(model.shiftDay(today, -POLICY.rawDays)) })
      return { ok: true, ...counts, finalCursor }
    } catch (error) {
      finalError = /incomplete/.test(error.message || '') ? 'incomplete_summary' : 'maintenance_failed'
      console.warn('PAW_OPERATIONS_MAINTENANCE_FAILED', { code: finalError })
      return { ok: false, error: finalError }
    } finally {
      await transaction(old => old.leaseToken !== token ? null : { ...old, finalCursor, leaseUntil: 0, leaseToken: '', lastFinishedAt: Date.now(), lastSuccessAt: finalError ? old.lastSuccessAt || 0 : Date.now(), lastError: finalError, lastCounts: counts })
    }
  }
  async function status() {
    const now = Date.now(), today = model.dayKey(now)
    const [state, snapshot, current] = await Promise.all([get(STATE), get('op_alerts_' + today), reports.read(today, today)])
    const total = current.eventVersions.reduce((sum, r) => sum + r.events, 0)
    const alerts = metrics.alerts(current.measures, total)
    if (!state?.lastSuccessAt) alerts.push({ key: 'not_started', type: 'system', title: '自动维护尚未完成首次运行', detail: '需要部署并启用定时触发器。' })
    else if (now - state.lastSuccessAt > 26 * 3600000 || state.lastError) alerts.push({ key: 'maintenance', type: 'system', title: '自动维护需要检查', detail: state.lastError ? '最近一次执行失败，已保留未处理的数据。' : '超过 26 小时没有成功运行。' })
    if (current.metricsLimited) alerts.push({ key: 'incomplete', type: 'system', title: '部分运营维度未完整返回', detail: '请检查汇总容量。' })
    return { ok: true, alerts, policy: POLICY, maintenance: { lastSuccessAt: state?.lastSuccessAt || 0, lastError: state?.lastError || '', finalCursor: state?.finalCursor || '', lastCounts: state?.lastCounts || null, busy: (state?.leaseUntil || 0) > now, alertCheckedAt: snapshot?.updatedAt || 0 } }
  }
  async function history(cursor) {
    const where = { ...safe, recordType: 'daily_report' }
    if (typeof cursor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cursor)) where.day = _.lt(cursor)
    const result = await db.collection(collection).where(where).orderBy('day', 'desc').limit(31).get()
    const rows = result.data.slice(0, 30).map(r => ({ day: r.day, users: r.users, newUsers: r.newUsers, events: r.events, finalized: !!r.finalized, complete: !!r.complete, generatedAt: r.generatedAt }))
    return { ok: true, rows, cursor: result.data.length > 30 ? rows[rows.length - 1].day : null }
  }
  return { run, status, history }
}
