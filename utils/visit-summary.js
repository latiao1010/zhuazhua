const store = require('./store')
function buildSummary(start, end, options = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end || end > store.todayKey()) throw new Error('请选择有效的日期范围')
  for (const key of [start,end]) {
    const date = new Date(key + 'T00:00:00')
    if (!Number.isFinite(date.getTime()) || date.getDate() !== Number(key.slice(8))) throw new Error('日期无效')
  }
  const pet = store.get('pet')
  const groups = [
    ['feeds', '喂食', r => `${r.type || ''} ${r.food || ''} ${r.amount || ''}`],
    ['waters', '饮水', r => `${r.amount || ''} ${r.note || ''}`],
    ['stools', '排便', r => `${r.condition || ''} ${r.color || ''} ${r.note || ''}${r.abnormal ? '（记录标记异常）' : ''}`],
    ['walks', '散步', r => `${r.duration || 0}分钟 ${r.distance ? r.distance + 'km' : ''} ${r.note || ''}`],
    ['careRecords', '护理与用药', r => `${({ medicine: '用药', vaccine: '疫苗', deworming: '驱虫', bath: '洗澡', dental: '刷牙', nail: '剪指甲' })[r.key] || r.key || ''} ${r.note || ''}`],
    ['weightRecords', '体重', r => `${r.weight}kg`]
  ]
  const identity = options.redact ? `宠物：${pet.breed || '未填写'}` : `宠物：${pet.name} · ${pet.breed} · ${pet.sex}`
  const lines = ['宠物就诊记录摘要', `${start} 至 ${end}`, identity, `档案体重：${pet.weight || '未填写'}kg · 生日：${pet.birthday || '未填写'}`, '', '以下为已录入记录，缺少记录不代表没有发生；不包含自动诊断。']
  groups.forEach(([key, label, describe]) => {
    const records = store.get(key).filter(r => (r.dayKey || r.date) >= start && (r.dayKey || r.date) <= end).sort((a,b) => `${a.dayKey || a.date} ${a.time || ''}`.localeCompare(`${b.dayKey || b.date} ${b.time || ''}`))
    lines.push('', `${label}（${records.length}条）`)
    if (!records.length) lines.push('该时间段暂无记录')
    records.forEach(r => {
      const actor = r.recordedByName ? ` · 记录人：${r.recordedByName}${r.recordedByRole === 'owner' ? '（主人）' : r.recordedByRole === 'admin' ? '（共同照护）' : ''}` : ''
      lines.push(`${r.dayKey || r.date} ${r.time || ''} ${describe(r).trim()}${actor}`)
    })
  })
  if (store.isDemoMode && store.isDemoMode()) lines.unshift('【演示数据，不用于真实就诊】')
  return lines.join('\n')
}
module.exports = { buildSummary }
