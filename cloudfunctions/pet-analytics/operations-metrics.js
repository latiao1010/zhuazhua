// 固定维度；不接收用户输入、地址、宠物资料或错误正文。
const entries = {
  outings: { label: '发现 · 城市好去处', module: 'outings' },
  age: { label: '发现 · 年龄卡片', module: 'age' },
  personality: { label: '发现 · 性格测试', module: 'personality' },
  bingo: { label: '发现 · 行为宾果', module: 'bingo' },
  feed: { label: '今日概况 · 喂食', module: 'feed' },
  water: { label: '今日概况 · 饮水', module: 'water' },
  stool: { label: '今日概况 · 排便', module: 'stool' },
  walk: { label: '今日概况 · 散步', module: 'walk' },
  weather: { label: '天气详情', module: 'weather' },
  recent: { label: '近期情况', module: 'recent' },
  knowledge: { label: '每日知识', module: 'knowledge' },
  care: { label: '照护提醒', module: 'care' },
  profile: { label: '宠物头像', module: 'profile' }
}
const operations = {
  sync_write: { label: '云端保存', modules: ['home'], slowMs: 3000 },
  sync_read: { label: '云端读取', modules: ['home'], slowMs: 3000 },
  poster: { label: '生成带码图片', modules: ['age', 'personality', 'bingo'], slowMs: 5000 },
  export_build: { label: '生成导出文件', modules: ['export'], slowMs: 1500 }
}
const has = (obj, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key)
const percent = (n, d) => d ? Math.round(n / d * 1000) / 10 : null
function cleanDetail(event) {
  if (['impression', 'engagement'].includes(event.kind)) {
    if (!has(entries, event.entry) || event.module !== entries[event.entry].module || event.action !== 'home_entry' || !/^[a-z0-9-]{10,70}$/.test(event.exposureId || '')) return null
    return { entry: event.entry, exposureId: event.exposureId }
  }
  if (event.kind === 'measure') {
    if (!has(operations, event.operation) || !operations[event.operation].modules.includes(event.module) || event.action !== 'operation' || !['success', 'failure', 'cancelled'].includes(event.outcome) || !Number.isSafeInteger(event.durationMs) || event.durationMs < 0 || event.durationMs > 120000) return null
    return { operation: event.operation, outcome: event.outcome, durationMs: event.durationMs }
  }
  return {}
}
function presentMeasures(rows) {
  const groups = {}
  for (const row of rows) {
    const key = [row.version || 'unknown', row.module, row.operation].join(':')
    const r = groups[key] || (groups[key] = { version: row.version || 'unknown', module: row.module, operation: row.operation, success: 0, failure: 0, cancelled: 0, duration: 0, slow: 0, maxMs: 0 })
    r[row.outcome] += row.count
    if (row.outcome !== 'cancelled') { r.duration += row.duration || 0; r.slow += row.slow || 0; r.maxMs = Math.max(r.maxMs, row.maxMs || 0) }
  }
  return Object.values(groups).map(r => ({ ...r, label: operations[r.operation]?.label || r.operation, attempts: r.success + r.failure,
    failureRate: percent(r.failure, r.success + r.failure), slowRate: percent(r.slow, r.success + r.failure), avgMs: r.success + r.failure ? Math.round(r.duration / (r.success + r.failure)) : null }))
}
function alerts(measures, eventCount) {
  const rows = []
  for (const row of measures) {
    if (row.attempts >= 20 && row.failure >= 5 && row.failureRate >= 10) rows.push({ key: ['failure', row.version, row.module, row.operation].join(':'), type: 'failure', title: row.label + '失败率偏高', version: row.version, module: row.module, detail: `${row.failure} / ${row.attempts} 次失败（${row.failureRate}%）` })
    if (row.attempts >= 20 && row.slow >= 5 && row.slowRate >= 20) rows.push({ key: ['slow', row.version, row.module, row.operation].join(':'), type: 'slow', title: row.label + '耗时偏高', version: row.version, module: row.module, detail: `${row.slow} / ${row.attempts} 次超过 ${operations[row.operation].slowMs / 1000} 秒` })
  }
  if (eventCount >= 100000) rows.push({ key: 'volume', type: 'volume', title: '统计事件量偏高', detail: `今日已接收 ${eventCount} 条事件，请检查增长与云资源用量。` })
  return rows
}
function versionRows(events, flowCounts, flowSpecs, measures) {
  const versions = new Set([...events.map(r => r.version || 'unknown'), ...flowCounts.map(r => r.version || 'unknown'), ...measures.map(r => r.version)])
  return [...versions].map(version => ({ version, events: events.filter(r => (r.version || 'unknown') === version).reduce((s, r) => s + r.events, 0),
    flows: Object.entries(flowSpecs).map(([name, spec]) => {
      const rows = flowCounts.filter(r => r.version === version && r.flowName === name)
      const started = rows.filter(r => r.reached >= 0).reduce((s, r) => s + r.count, 0)
      const completed = rows.filter(r => r.reached === spec.steps.length - 1).reduce((s, r) => s + r.count, 0)
      return { name, label: spec.label, started, completed, rate: percent(completed, started) }
    }), measures: measures.filter(r => r.version === version) })).sort((a, b) => b.events - a.events)
}
function localMetrics(events, flowCounts, flowSpecs) {
  const pairs = {}, measured = {}, versions = {}
  for (const e of events) {
    const version = e.version || 'unknown'; versions[version] = (versions[version] || 0) + 1
    if (['impression', 'engagement'].includes(e.kind) && cleanDetail(e)) {
      const key = [e.uid || 'local', e.exposureId, e.entry, version].join(':')
      const pair = pairs[key] || (pairs[key] = { entry: e.entry, version, seen: 0, clicked: 0 })
      pair[e.kind === 'impression' ? 'seen' : 'clicked'] = 1
    }
    if (e.kind === 'measure' && cleanDetail(e)) {
      const key = [version, e.module, e.operation, e.outcome].join(':')
      const row = measured[key] || (measured[key] = { version, module: e.module, operation: e.operation, outcome: e.outcome, count: 0, duration: 0, maxMs: 0, slow: 0 })
      row.count++; row.duration += e.durationMs; row.maxMs = Math.max(row.maxMs, e.durationMs); row.slow += e.durationMs > operations[e.operation].slowMs ? 1 : 0
    }
  }
  const exposure = {}
  for (const p of Object.values(pairs).filter(p => p.seen)) {
    const key = p.entry + ':' + p.version, row = exposure[key] || (exposure[key] = { entry: p.entry, version: p.version, impressions: 0, clicks: 0 })
    row.impressions++; row.clicks += p.clicked
  }
  const measures = presentMeasures(Object.values(measured)), eventRows = Object.entries(versions).map(([version, count]) => ({ version, events: count }))
  return { exposures: Object.values(exposure), measures, versionComparison: versionRows(eventRows, flowCounts, flowSpecs, measures) }
}
module.exports = { entries, operations, cleanDetail, presentMeasures, alerts, percent, versionRows, localMetrics }
