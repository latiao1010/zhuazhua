const model = require('./operations-model')
const fields = ['generated', 'confirmed', 'rejected', 'overflow', 'expired', 'failedBatches', 'partialBatches', 'successfulBatches', 'storageFailures']
module.exports = function delivery(db, collection, hash) {
  const _ = db.command, $ = _.aggregate, safe = { _openid: _.exists(false) }
  async function collect(values, uid, now) {
    if (!Array.isArray(values) || values.length > 4) return []
    const ids = []
    for (const value of values) {
      if (!value || typeof value.reporter !== 'string' || !/^[a-z0-9-]{10,70}$/.test(value.reporter) || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || value.day < model.dayKey(now - 7 * model.DAY) || value.day > model.dayKey(now)) continue
      if (typeof value.version !== 'string' || !/^[a-zA-Z0-9._-]{1,32}$/.test(value.version) || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 100000000) continue
      if (fields.some(k => !Number.isSafeInteger(value[k]) || value[k] < 0 || value[k] > 10000000)) continue
      const id = 'op_delivery_' + hash(uid + ':' + value.reporter + ':' + value.day + ':' + value.version)
      await db.runTransaction(async tx => {
        const ref = tx.collection(collection).doc(id)
        let old
        try { const r = await ref.get(); old = Array.isArray(r.data) ? r.data[0] : r.data }
        catch (e) { if (!/document.*(not exist|not found)|document.*不存在/i.test(e.message || e.errMsg || '')) throw e }
        if (old && old.revision >= value.revision) return
        await ref.set({ data: { recordType: 'delivery_health', day: value.day, version: value.version, revision: value.revision, receivedAt: now,
          ...Object.fromEntries(fields.map(k => [k, Math.max(value[k], old?.[k] || 0)])) } })
      })
      ids.push(value.day + ':' + value.version + ':' + value.revision)
    }
    return ids
  }
  async function summary(days, end = model.dayKey(Date.now())) {
    const start = model.shiftDay(end, 1 - days)
    const range = _.gte(start).and(_.lte(end))
    const [snapshots, received] = await Promise.all([
      db.collection(collection).aggregate().match({ ...safe, recordType: 'delivery_health', day: range })
        .group({ _id: '$version', snapshots: $.sum(1), lastReportAt: $.max('$receivedAt'), ...Object.fromEntries(fields.map(k => [k, $.sum('$' + k)])) }).limit(1000).end(),
      db.collection(collection).aggregate().match({ ...safe, day: range, kind: _.exists(true), receivedAt: _.exists(true) })
        .group({ _id: '$version', received: $.sum(1), lastReceivedAt: $.max('$receivedAt'),
          latencyMs: $.sum($.subtract(['$receivedAt', '$time'])), maxLatencyMs: $.max($.subtract(['$receivedAt', '$time'])),
          delayed: $.sum($.cond({ if: $.gt([$.subtract(['$receivedAt', '$time']), 60000]), then: 1, else: 0 })) }).limit(1000).end()
    ])
    const versions = [...new Set([...snapshots.list, ...received.list].map(r => r._id || 'unknown'))]
    return { ok: true, start, end, limited: snapshots.list.length >= 1000 || received.list.length >= 1000,
      rows: versions.map(version => {
        const client = snapshots.list.find(r => r._id === version) || {}, server = received.list.find(r => (r._id || 'unknown') === version) || {}
        return { version, snapshots: client.snapshots || 0, lastReportAt: client.lastReportAt || 0, ...Object.fromEntries(fields.map(k => [k, client[k] || 0])),
          received: server.received || 0, lastReceivedAt: server.lastReceivedAt || 0, delayed: server.delayed || 0,
          avgLatencyMs: server.received ? Math.round(server.latencyMs / server.received) : null, maxLatencyMs: server.maxLatencyMs || 0 }
      }).sort((a, b) => b.received - a.received) }
  }
  return { collect, summary }
}
