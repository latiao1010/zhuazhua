// 客户端与云端共用的运营口径；不包含宠物资料、输入内容或个人身份。
const DAY = 86400000
const metrics = require('./operations-metrics')
const dayKey = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10)
const shiftDay = (day, n) => dayKey(Date.parse(day + 'T00:00:00+08:00') + n * DAY)
const channels = {
  unknown: '未识别来源', direct: '直接进入', search: '微信搜索', scan: '普通扫码',
  chat: '聊天分享', timeline: '朋友圈',
  age_card: '年龄卡图片', personality_card: '性格卡图片', bingo_card: '宾果卡图片',
  age_share: '年龄工具分享', personality_share: '性格测试分享', bingo_share: '宾果分享',
  outings_share: '好去处分享', family_share: '家庭邀请',
  xhs: '小红书推广', community: '社群推广', offline: '线下推广'
}
const flows = {
  record_feed: { label: '喂食记录', module: 'feed', steps: ['打开新增表单', '提交保存', '本机保存成功'] },
  record_water: { label: '饮水记录', module: 'water', steps: ['打开新增表单', '提交保存', '本机保存成功'] },
  record_stool: { label: '排便记录', module: 'stool', steps: ['打开新增表单', '提交保存', '本机保存成功'] },
  record_walk: { label: '散步记录', module: 'walk', steps: ['打开新增表单', '提交保存', '本机保存成功'] },
  age: { label: '年龄卡片', module: 'age', steps: ['进入制作页', '生成结果', '生成带码图片', '打开图片分享'] },
  personality: { label: '性格测试', module: 'personality', steps: ['进入制作页', '生成结果', '生成带码图片', '打开图片分享'] },
  bingo: { label: '行为宾果', module: 'bingo', steps: ['进入制作页', '生成结果', '生成带码图片', '打开图片分享'] },
  outings: { label: '城市好去处', module: 'outings', steps: ['展示地点列表', '查看详情／直接收藏', '收藏或复制地址'] }
}
const feedbackTypes = { bug: '功能故障', experience: '使用不方便', data: '地点信息有误', suggestion: '功能建议', other: '其他' }
const feedbackStates = { new: '待处理', triaged: '处理中', resolved: '已处理' }
const has = (object, key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key)
function context(value = {}) {
  return {
    schema: 2,
    version: typeof value.version === 'string' && /^[a-zA-Z0-9._-]{1,32}$/.test(value.version) ? value.version : 'unknown',
    platform: ['ios', 'android', 'windows', 'mac', 'devtools'].includes(value.platform) ? value.platform : 'unknown',
    channel: has(channels, value.channel) ? value.channel : 'unknown',
    session: typeof value.session === 'string' && /^[a-z0-9-]{10,70}$/.test(value.session) ? value.session : ''
  }
}
function source(options = {}) {
  const query = options.query || {}
  if (has(channels, query.src)) return query.src
  // 旧版图片码 scene 只有工具名，也能按图片来源识别；不读取结果内容。
  let code = ''; try { code = decodeURIComponent(query.scene || '') } catch (_) {}
  if (['age', 'personality', 'bingo'].includes(code)) return code + '_card'
  const scene = Number(options.scene)
  if ([1007, 1008, 1044].includes(scene)) return 'chat'
  if (scene === 1154) return 'timeline'
  if ([1011, 1012, 1013, 1047, 1048, 1049].includes(scene)) return 'scan'
  if ([1005, 1006].includes(scene)) return 'search'
  if ([1001, 1089].includes(scene)) return 'direct'
  return 'unknown'
}
function mergeVisitor(previous, events, now) {
  const first = events.slice().sort((a, b) => a.time - b.time)[0]
  if (!first) return previous
  const old = previous || {}, earliest = !old.firstTime || first.time < old.firstTime
  const firstTime = earliest ? first.time : old.firstTime, firstDay = dayKey(firstTime)
  const cutoff = dayKey(now - 119 * DAY)
  const days = [...new Set([...(old.days || []), ...events.map(e => dayKey(e.time))])].filter(d => d >= cutoff).sort()
  const records = events.filter(e => e.kind === 'funnel' && /^record_/.test(e.flowName) && e.step === 2)
  const recordDays = [...new Set([...(old.recordDays || []), ...records.map(e => dayKey(e.time))])].filter(d => d >= cutoff).sort()
  // 第1/7天是否回访在窗口移出后仍保留；更早的离线上报会修正首次日期。
  const d1 = days.includes(shiftDay(firstDay, 1)) || (!earliest && !!old.d1)
  const d7 = days.includes(shiftDay(firstDay, 7)) || (!earliest && !!old.d7)
  return { recordType: 'visitor', firstTime, firstDay, firstChannel: earliest ? context(first).channel : old.firstChannel,
    lastDay: days[days.length - 1], days, recordDays, d1, d7, updatedAt: now }
}
function mergeFlow(previous, events) {
  const old = previous || {}, name = events[0].flowName, spec = flows[name]
  const times = { ...(old.times || {}) }
  for (const e of events) times['s' + e.step] = Math.min(times['s' + e.step] || Infinity, e.time)
  if (times.s0) for (const key of Object.keys(times)) if (times[key] > times.s0 + 7 * DAY) delete times[key]
  let reached = -1, last = 0
  for (let n = 0; n < spec.steps.length; n++) {
    const time = times['s' + n]
    if (!time || time < last) break
    reached = n; last = time
  }
  const startEvent = events.find(e => e.step === 0)
  return { recordType: 'flow', flowName: name, version: startEvent ? startEvent.version || 'unknown' : old.version || events[0].version || 'unknown', times,
    lastTime: Math.max(old.lastTime || 0, ...events.map(e => e.time)), startDay: times.s0 ? dayKey(times.s0) : '', reached }
}
function funnelRows(counts = []) {
  return Object.entries(flows).map(([name, spec]) => {
    const steps = spec.steps.map((label, index) => ({ label, count: counts.filter(r => r.flowName === name && r.reached >= index).reduce((s, r) => s + r.count, 0) }))
    return { name, label: spec.label, steps: steps.map((s, i) => ({ ...s, rate: steps[0].count ? Math.round(s.count / steps[0].count * 100) + '%' : '—', drop: i ? steps[i - 1].count - s.count : 0 })) }
  })
}
function localReport(events, days, now = Date.now(), savedVisitor) {
  const start = dayKey(now - (days - 1) * DAY), end = dayKey(now)
  const visitor = savedVisitor || mergeVisitor(null, events, now)
  const inRange = events.filter(e => dayKey(e.time) >= start && dayKey(e.time) <= end)
  const byFlow = {}
  for (const event of events.filter(e => e.kind === 'funnel' && has(flows, e.flowName))) {
    byFlow[event.flowId] = mergeFlow(byFlow[event.flowId], [event])
  }
  const active = visitor && visitor.lastDay >= start ? 1 : 0
  const isNew = active && visitor.firstDay >= start ? 1 : 0
  const retention = [1, 7].map(n => {
    const eligible = isNew && visitor.firstDay <= shiftDay(end, -n - 1) ? 1 : 0
    return { day: n, eligible, returned: eligible && visitor['d' + n] ? 1 : 0, pending: isNew - eligible }
  })
  const flowCounts = Object.values(byFlow).filter(f => f.startDay >= start && f.startDay <= end).map(f => ({ ...f, count: 1 }))
  const extra = metrics.localMetrics(inRange, flowCounts, flows)
  const todayMetrics = metrics.localMetrics(events.filter(e => dayKey(e.time) === end), [], flows)
  return { ...extra, alerts: metrics.alerts(todayMetrics.measures, events.filter(e => dayKey(e.time) === end).length), users: active, newUsers: isNew, returningUsers: active - isNew, recordUsers: active && visitor.recordDays.some(d => d >= start) ? 1 : 0,
    retention, funnels: funnelRows(Object.values(byFlow).filter(f => f.startDay >= start && f.startDay <= end).map(f => ({ ...f, count: 1 }))),
    channels: isNew ? [{ channel: visitor.firstChannel, users: 1, recordUsers: visitor.recordDays.some(d => d >= start) ? 1 : 0, eligible7: retention[1].eligible, returned7: retention[1].returned }] : [],
    daily: Array.from({ length: days }, (_, i) => { const day = shiftDay(start, i); return { day, users: visitor && visitor.days.includes(day) ? 1 : 0, newUsers: visitor && visitor.firstDay === day ? 1 : 0 } }),
    versions: [...new Set(inRange.map(e => e.version || 'unknown'))].map(version => ({ version, events: inRange.filter(e => (e.version || 'unknown') === version).length })),
    local: true }
}
module.exports = { DAY, dayKey, shiftDay, channels, flows, feedbackTypes, feedbackStates, has, context, source, mergeVisitor, mergeFlow, funnelRows, localReport }
