// 上线登记与统计事件分开保存；不因部署云函数而自动登记小程序上线。
module.exports = function releases(db, collection, hash) {
  const _ = db.command, safe = { recordType: 'release', _openid: _.exists(false) }
  const view = r => ({ id: r._id, version: r.version, publishedAt: r.publishedAt, notes: r.notes, goal: r.goal, createdAt: r.createdAt, updatedAt: r.updatedAt })
  async function list(cursor) {
    if (cursor && (!Number.isSafeInteger(cursor.time) || !/^op_release_[a-f0-9]{64}$/.test(cursor.id || ''))) return { ok: false, error: 'invalid_cursor' }
    const where = cursor ? _.and([safe, _.or([{ createdAt: _.lt(cursor.time) }, { createdAt: cursor.time, _id: _.lt(cursor.id) }])]) : safe
    const result = await db.collection(collection).where(where).orderBy('createdAt', 'desc').orderBy('_id', 'desc').limit(21).get()
    const rows = result.data.slice(0, 20), last = rows[rows.length - 1]
    return { ok: true, rows: rows.map(view), cursor: result.data.length > 20 ? { time: last.createdAt, id: last._id } : null }
  }
  async function save(input) {
    if (!input || typeof input.version !== 'string' || !/^[a-zA-Z0-9._-]{1,32}$/.test(input.version) ||
      !Number.isSafeInteger(input.publishedAt) || input.publishedAt < Date.UTC(2020, 0, 1) || input.publishedAt > Date.now() ||
      typeof input.notes !== 'string' || typeof input.goal !== 'string' || !Number.isSafeInteger(input.updatedAt) || input.updatedAt < 0) return { ok: false, error: 'invalid_release' }
    const clean = s => s.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    const notes = clean(input.notes), goal = clean(input.goal)
    if (!notes || notes.length > 1000 || !goal || goal.length > 200) return { ok: false, error: 'invalid_release' }
    const id = 'op_release_' + hash(input.version)
    if (input.id && input.id !== id) return { ok: false, error: 'invalid_release' }
    const result = await db.runTransaction(async tx => {
      const ref = tx.collection(collection).doc(id)
      let old
      try { const r = await ref.get(); old = Array.isArray(r.data) ? r.data[0] : r.data }
      catch (e) { if (!/document.*(not exist|not found)|document.*不存在/i.test(e.message || e.errMsg || '')) throw e }
      if (old && (old.recordType !== 'release' || Object.prototype.hasOwnProperty.call(old, '_openid'))) return { ok: false, error: 'invalid_release' }
      if ((old ? old.updatedAt : 0) !== input.updatedAt) return { ok: false, error: 'release_changed' }
      const data = { recordType: 'release', version: input.version, publishedAt: input.publishedAt, notes, goal,
        createdAt: old ? old.createdAt : Date.now(), updatedAt: Math.max(Date.now(), (old?.updatedAt || 0) + 1) }
      await ref.set({ data })
      return { ok: true, row: view({ ...data, _id: id }) }
    })
    return result && result.result !== undefined ? result.result : result
  }
  return { list, save }
}
