const store = require('./store')
const displayValue = value => value === undefined || value === null || String(value).trim() === '' ? '未填写' : String(value)
const displayWeight = value => Number.isFinite(Number(value)) && Number(value) > 0 ? `${value}kg` : '未填写'
function rangeError(start, end, today = store.todayKey()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return '请选择完整的开始和结束日期'
  for (const key of [start,end]) {
    const date = new Date(key + 'T00:00:00')
    if (!Number.isFinite(date.getTime()) || date.getDate() !== Number(key.slice(8))) return '日期无效，请重新选择'
  }
  if (start > end) return '开始日期不能晚于结束日期'
  if (end > today) return '结束日期不能晚于今天'
  return ''
}
function buildReport(start, end, options = {}) {
  const error = rangeError(start, end)
  if (error) throw new Error(error)
  const pet = store.get('pet')
  const groups = [
    ['feeds', '喂食', r => `${r.type || ''} ${r.food || ''} ${r.amount || ''}`],
    ['waters', '饮水', r => `${r.amount || ''} ${r.note || ''}`],
    ['stools', '排便', r => `${r.condition || ''} ${r.color || ''} ${r.note || ''}${r.abnormal ? '（记录标记异常）' : ''}`],
    ['walks', '散步', r => `${r.duration || 0}分钟 ${r.distance ? r.distance + 'km' : ''} ${r.note || ''}`],
    ['careRecords', '护理与用药', r => `${({ medicine: '用药', vaccine: '疫苗', deworming: '驱虫', bath: '洗澡', dental: '刷牙', nail: '剪指甲' })[r.key] || r.key || ''} ${r.note || ''}`],
    ['weightRecords', '体重', r => displayWeight(r.weight)]
  ]
  const identity = options.redact ? `宠物：${displayValue(pet.breed)}` : `宠物：${displayValue(pet.name)} · ${displayValue(pet.breed)} · ${displayValue(pet.sex)}`
  const lines = ['宠物就诊记录摘要', `${start} 至 ${end}`, identity, `档案体重：${displayWeight(pet.weight)} · 生日：${displayValue(pet.birthday)}`, '', '以下为已录入记录，缺少记录不代表没有发生；不包含自动诊断。']
  const sections = groups.map(([key, label, describe]) => {
    const records = store.get(key).filter(r => (r.dayKey || r.date) >= start && (r.dayKey || r.date) <= end).sort((a,b) => `${a.dayKey || a.date} ${a.time || ''}`.localeCompare(`${b.dayKey || b.date} ${b.time || ''}`))
    const entries = records.map(r => {
      const actor = r.recordedByName ? ` · 记录人：${r.recordedByName}${r.recordedByRole === 'owner' ? '（主人）' : r.recordedByRole === 'admin' ? '（共同照护）' : ''}` : ''
      return `${r.dayKey || r.date} ${r.time || ''} ${describe(r).trim()}${actor}`
    })
    return { key, label, count:records.length, entries }
  })
  if (store.isDemoMode && store.isDemoMode()) lines.unshift('【演示数据，不用于真实就诊】')
  return { header:lines.join('\n'), sections }
}
function buildSummary(start, end, options = {}) {
  const report = buildReport(start, end, options)
  return [report.header, ...report.sections.map(section => `${section.label}（${section.count}条）\n${section.entries.length ? section.entries.join('\n') : '该时间段暂无记录'}`)].join('\n\n')
}
module.exports = { buildSummary, buildReport, rangeError }
