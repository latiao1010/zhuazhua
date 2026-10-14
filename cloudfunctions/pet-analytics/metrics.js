const model = require('./operations-model')
const metrics = require('./operations-metrics')
const LIMIT = 1000
module.exports = function metricQueries(db, collection) {
  const delivery = require('./delivery')(db, collection)
  const _ = db.command, $ = _.aggregate
  const base = (start, end) => db.collection(collection).aggregate().match({ _openid: _.exists(false), schema: 2, day: _.gte(start).and(_.lte(end)) })
  async function read(start, end) {
    const [exposure, measured, flows, versions] = await Promise.all([
      base(start, end).match({ kind: _.in(['impression', 'engagement']) })
        .group({ _id: { uid: '$uid', exposureId: '$exposureId', entry: '$entry', version: '$version' }, seen: $.max($.cond({ if: $.eq(['$kind', 'impression']), then: 1, else: 0 })), clicked: $.max($.cond({ if: $.eq(['$kind', 'engagement']), then: 1, else: 0 })) })
        .match({ seen: 1 }).group({ _id: { entry: '$_id.entry', version: '$_id.version' }, impressions: $.sum(1), clicks: $.sum('$clicked') }).limit(LIMIT).end(),
      base(start, end).match({ kind: 'measure' })
        .group({ _id: { operation: '$operation', module: '$module', version: '$version', outcome: '$outcome' }, count: $.sum(1), duration: $.sum('$durationMs'), maxMs: $.max('$durationMs'),
          slow: $.sum($.cond({ if: $.gt(['$durationMs', $.cond({ if: $.eq(['$operation', 'poster']), then: 5000, else: $.cond({ if: $.eq(['$operation', 'export_build']), then: 1500, else: 3000 }) })]), then: 1, else: 0 })) }).limit(LIMIT).end(),
      db.collection(collection).aggregate().match({ _openid: _.exists(false), recordType: 'flow', startDay: _.gte(start).and(_.lte(end)), reached: _.gte(0) })
        .group({ _id: { version: '$version', flowName: '$flowName', reached: '$reached' }, count: $.sum(1) }).limit(LIMIT).end(),
      base(start, end).group({ _id: '$version', events: $.sum(1) }).sort({ events: -1 }).limit(LIMIT).end()
    ])
    const flowCounts = flows.list.map(r => ({ ...r._id, count: r.count }))
    const eventVersions = versions.list.map(r => ({ version: r._id || 'unknown', events: r.events }))
    const measures = metrics.presentMeasures(measured.list.map(r => ({ ...r._id, count: r.count, duration: r.duration, slow: r.slow, maxMs: r.maxMs })))
    return { exposures: exposure.list.map(r => ({ ...r._id, impressions: r.impressions, clicks: r.clicks })), measures, flowCounts, eventVersions,
      versionComparison: metrics.versionRows(eventVersions, flowCounts, model.flows, measures), metricsLimited: [exposure, measured, flows, versions].some(r => r.list.length >= LIMIT) }
  }
  async function daily(day) {
    const raw = () => db.collection(collection).aggregate().match({ day, kind: _.exists(true), _openid: _.exists(false) })
    const [extra, rows, users, firstUsers, total, quality] = await Promise.all([
      read(day, day),
      raw().group({ _id: { module: '$module', kind: '$kind', action: '$action', reason: '$reason' }, count: $.sum(1) }).limit(LIMIT).end(),
      raw().group({ _id: '$uid' }).count('users').end(),
      db.collection(collection).aggregate().match({ recordType: 'visitor', firstDay: day, _openid: _.exists(false) }).group({ _id: null, users: $.sum(1), returned1: $.sum($.cond({ if: '$d1', then: 1, else: 0 })), returned7: $.sum($.cond({ if: '$d7', then: 1, else: 0 })) }).end(),
      raw().count('events').end(),
      delivery.summary(1, day)
    ])
    const events = total.list[0]?.events || 0, breakdown = rows.list.map(r => ({ ...r._id, count: r.count }))
    // 归档只保存基础汇总维度，版本展示行可按需重建，避免重复存八条流程标签。
    delete extra.versionComparison
    return { recordType: 'daily_report', day, schema: 3, generatedAt: Date.now(), events, users: users.list[0]?.users || 0,
      newUsers: firstUsers.list[0]?.users || 0, returned1: firstUsers.list[0]?.returned1 || 0, returned7: firstUsers.list[0]?.returned7 || 0,
      breakdown, ...extra, delivery: quality.rows,
      complete: !extra.metricsLimited && !quality.limited && rows.list.length < LIMIT && breakdown.reduce((s, r) => s + r.count, 0) === events }
  }
  return { read, daily }
}
