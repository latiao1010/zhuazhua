function buildWeightTrend(records, currentWeight, todayKey, historyLimit = 30) {
  let normalized = (records || [])
    .map(item => {
      const weight = Number(item.weight)
      const createdAt = Number(item.createdAt) || Number(item.id) || new Date(`${item.dayKey || todayKey}T00:00:00`).getTime()
      return { ...item, weight, createdAt }
    })
    .filter(item => item.dayKey && item.weight > 0)
    .sort((a, b) => b.createdAt - a.createdAt)
  if (!normalized.length && Number(currentWeight) > 0) {
    const createdAt = Date.now()
    normalized = [{ id: createdAt, createdAt, dayKey: todayKey, time: '', weight: Number(currentWeight) }]
  }
  const byDay = {}
  normalized.forEach(item => {
    if (!byDay[item.dayKey]) byDay[item.dayKey] = item
  })
  const ordered = Object.values(byDay).sort((a, b) => a.dayKey.localeCompare(b.dayKey))
  const recent = ordered.slice(-8)
  const weights = recent.map(item => item.weight)
  const min = weights.length ? Math.min(...weights) : 0
  const max = weights.length ? Math.max(...weights) : 0
  const range = max - min
  const bars = recent.map(item => {
    const parts = item.dayKey.split('-')
    return {
      ...item,
      dateLabel: `${Number(parts[1])}/${Number(parts[2])}`,
      height: range ? Math.round(42 + (item.weight - min) / range * 78) : 76
    }
  })
  const first = normalized[normalized.length - 1]
  const last = normalized[0]
  const change = first && last ? Number((last.weight - first.weight).toFixed(1)) : 0
  return {
    bars,
    history: normalized.slice(0, historyLimit).map(item => ({
      ...item,
      date: item.dayKey.replace(/-/g, '.'),
      timeText: item.time || ''
    })),
    current: last ? last.weight : Number(currentWeight) || 0,
    change,
    changeText: change === 0 ? '保持稳定' : `${change > 0 ? '增加' : '减少'} ${Math.abs(change).toFixed(1)}kg`,
    changeClass: change > 0 ? 'up' : change < 0 ? 'down' : 'stable',
    min: min || Number(currentWeight) || 0,
    max: max || Number(currentWeight) || 0,
    hasTrend: ordered.length > 1
  }
}

module.exports = { buildWeightTrend }
