const store = require('../../utils/store')

const TYPES = {
  feed: { storeKey: 'feeds', tab: '喂食', icon: '🥣', title: '喂食时间轴', empty: '今天还没有喂食记录。', addText: '记录一次喂食', sheetTitle: '记一餐' },
  stool: { storeKey: 'stools', tab: '排便', icon: '💩', title: '排便时间轴', empty: '今天还没有排便记录。', addText: '记录一次排便', sheetTitle: '记录排便情况' },
  water: { storeKey: 'waters', tab: '饮水', icon: '💧', title: '饮水时间轴', empty: '今天还没有饮水记录。', addText: '记录一次饮水', sheetTitle: '记一次饮水' },
  walk: { storeKey: 'walks', tab: '散步', icon: '🐾', title: '散步时间轴', empty: '今天还没有散步记录。', addText: '记录一次散步', sheetTitle: '记一次散步' }
}

const FEED_GOAL = 260

function parseNumber(value) {
  const match = String(value === undefined || value === null ? '' : value).match(/[\d.]+/)
  return match ? Number(match[0]) || 0 : 0
}

function offsetDateKey(sourceKey, days) {
  const date = new Date(`${sourceKey}T00:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function recordDateLabel(item, today, yesterday) {
  if (item.dayKey === today) return '今天'
  if (item.dayKey === yesterday) return '昨天'
  const match = String(item.dayKey || '').match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (match) return `${Number(match[1])}月${Number(match[2])}日`
  return item.date || '历史记录'
}

function getTrendConfig(type, pet, feedGoal = FEED_GOAL, savedWaterGoal) {
  const waterGoal = Number(savedWaterGoal) || Math.round((Number(pet && pet.weight) || 0) * 55) || 600
  return {
    feed: {
      title: '近 30 天喂食趋势', unit: 'g', eventUnit: '餐', goal: feedGoal,
      goalText: `目标线 ${feedGoal}g`, mergeText: '单日多餐已合并', threshold: 5,
      metricLabels: ['记录日均 / g', '近 7 天日均 / g', '30 天总餐次']
    },
    water: {
      title: '近 30 天饮水趋势', unit: 'ml', eventUnit: '次', goal: waterGoal,
      goalText: `目标线 ${waterGoal}ml`, mergeText: '单日多次已合并', threshold: 20,
      metricLabels: ['记录日均 / ml', '近 7 天日均 / ml', '30 天总次数']
    },
    stool: {
      title: '近 30 天排便趋势', unit: '次', eventUnit: '次', goal: 2,
      goalText: '参考线 2次/天', mergeText: '异常记录已标色', threshold: 1,
      metricLabels: ['30 天总次数', '正常记录占比', '异常天数']
    },
    walk: {
      title: '近 30 天活动趋势', unit: '分钟', eventUnit: '次', goal: 30,
      goalText: '目标线 30分钟', mergeText: '单日多次已合并', threshold: 3,
      metricLabels: ['记录日均 / 分钟', '近 7 天日均 / 分钟', '30 天总次数']
    }
  }[type]
}

function getTrendDayValue(type, dayRecords) {
  if (type === 'stool') return dayRecords.length
  const valueKey = type === 'walk' ? 'duration' : 'amount'
  return Math.round(dayRecords.reduce((sum, item) => sum + parseNumber(item[valueKey]), 0))
}

function buildTrend(type, records, endDate, selectedDate, pet, feedGoal, waterGoal) {
  const config = getTrendConfig(type, pet, feedGoal, waterGoal)
  const days = Array.from({ length: 30 }, (_, index) => {
    const dayKey = offsetDateKey(endDate, index - 29)
    const dayRecords = (records || []).filter(item => item && item.dayKey === dayKey)
    const total = getTrendDayValue(type, dayRecords)
    const abnormal = type === 'stool' ? dayRecords.filter(item => item.abnormal).length : 0
    const parts = dayKey.split('-').map(Number)
    return {
      dayKey,
      total,
      count: dayRecords.length,
      abnormal,
      warning: abnormal > 0,
      countText: dayRecords.length
        ? type === 'stool' && abnormal ? `${abnormal}异常` : `${dayRecords.length}${config.eventUnit}`
        : '—',
      dateLabel: parts[2] === 1 ? `${parts[1]}/1` : String(parts[2]),
      isLatest: index === 29,
      selected: dayKey === selectedDate
    }
  })
  const maxValue = Math.max(config.goal, ...days.map(item => item.total), 1)
  const activeDays = days.filter(item => item.total > 0)
  const totalEvents = days.reduce((sum, item) => sum + item.count, 0)
  const average = activeDays.length ? Math.round(activeDays.reduce((sum, item) => sum + item.total, 0) / activeDays.length) : 0
  const latest7 = days.slice(-7)
  const previous7 = days.slice(-14, -7)
  const latest7Average = Math.round(latest7.reduce((sum, item) => sum + item.total, 0) / 7)
  const previous7Average = Math.round(previous7.reduce((sum, item) => sum + item.total, 0) / 7)
  const change = latest7Average - previous7Average
  let changeText = '近两周基本稳定'
  let changeClass = 'stable'
  if (type === 'stool') {
    const latestAbnormal = latest7.reduce((sum, item) => sum + item.abnormal, 0)
    const previousAbnormal = previous7.reduce((sum, item) => sum + item.abnormal, 0)
    const abnormalChange = latestAbnormal - previousAbnormal
    if (!latestAbnormal) {
      changeText = '近 7 天状态稳定'
      changeClass = 'down'
    } else if (abnormalChange) {
      changeText = `近 7 天异常${abnormalChange > 0 ? '增加' : '减少'} ${Math.abs(abnormalChange)} 次`
      changeClass = abnormalChange > 0 ? 'up' : 'down'
    } else {
      changeText = `近 7 天有 ${latestAbnormal} 次需观察`
      changeClass = 'up'
    }
  } else if (!previous7Average && latest7Average) {
    changeText = '近 7 天开始形成记录'
    changeClass = 'up'
  } else if (Math.abs(change) >= config.threshold) {
    changeText = `近 7 天日均${change > 0 ? '增加' : '减少'} ${Math.abs(change)}${config.unit}`
    changeClass = change > 0 ? 'up' : 'down'
  }
  const abnormalDays = days.filter(item => item.abnormal > 0).length
  const normalRecords = totalEvents - days.reduce((sum, item) => sum + item.abnormal, 0)
  const normalRate = totalEvents ? Math.round(normalRecords / totalEvents * 100) : 0
  const metricValues = type === 'stool'
    ? [totalEvents, `${normalRate}%`, abnormalDays]
    : [average, latest7Average, totalEvents]
  return {
    days: days.map(item => ({
      ...item,
      barHeight: item.total ? Math.max(14, Math.round(item.total / maxValue * 132)) : 0
    })),
    theme: type,
    title: config.title,
    metrics: config.metricLabels.map((label, index) => ({ label, value: metricValues[index] })),
    chartWidth: days.length * 70,
    scrollLeft: days.length * 70,
    endLabel: `${Number(endDate.slice(5, 7))}月${Number(endDate.slice(8, 10))}日`,
    goalBottom: Math.min(100, Math.round(config.goal / maxValue * 100)),
    goalText: config.goalText,
    footText: `${activeDays.length} 天有记录 · ${config.mergeText}`,
    activeDays: activeDays.length,
    totalMeals: totalEvents,
    average,
    latest7Average,
    changeText,
    changeClass,
    hasData: activeDays.length > 0
  }
}

function toRow(type, item) {
  const base = { id: item.id, time: item.time, date: item.date }
  if (type === 'feed') {
    return { ...base, icon: item.icon, iconClass: '', dotClass: '', title: item.type, meta: item.amount, metaClass: 'amount', sub: item.food }
  }
  if (type === 'stool') {
    return {
      ...base, icon: '💩', iconClass: 'stool-icon', dotClass: item.abnormal ? 'stool-dot warning-dot' : 'stool-dot',
      title: item.condition, meta: item.abnormal ? '需观察' : '正常',
      metaClass: item.abnormal ? 'condition warning-text' : 'condition',
      sub: `${item.color}${item.note ? ' · ' + item.note : ''}`
    }
  }
  if (type === 'water') {
    return { ...base, icon: '💧', iconClass: 'water-icon', dotClass: 'water-dot', title: '饮水', meta: item.amount, metaClass: 'amount', sub: item.note || '' }
  }
  const detail = [item.distance ? `${item.distance} km` : '', item.note].filter(Boolean).join(' · ')
  return { ...base, icon: '🐾', iconClass: 'walk-icon', dotClass: 'walk-dot', title: '散步', meta: `${item.duration} 分钟`, metaClass: 'amount', sub: detail }
}

function buildSummary(type, records, pet, isToday, feedGoal = FEED_GOAL, savedWaterGoal) {
  const dayText = isToday ? '今日' : '当日'
  const naturalDayText = isToday ? '今天' : '当日'
  if (type === 'feed') {
    const total = records.reduce((sum, item) => sum + parseNumber(item.amount), 0)
    return {
      kind: 'progress', label: `${dayText}已摄入`, value: total, unit: 'g', goalText: `目标 ${feedGoal}g`,
      progress: Math.min(100, Math.round(total / feedGoal * 100)),
      footLeft: `${dayText} ${records.length} 餐`, footRight: total >= feedGoal ? '已达标' : `还差 ${feedGoal - total}g`
    }
  }
  if (type === 'water') {
    const goal = Number(savedWaterGoal) || Math.round((Number(pet.weight) || 0) * 55) || FEED_GOAL
    const total = records.reduce((sum, item) => sum + parseNumber(item.amount), 0)
    return {
      kind: 'progress', label: `${dayText}已饮水`, value: total, unit: 'ml', goalText: `目标 ${goal}ml`,
      progress: Math.min(100, Math.round(total / goal * 100)),
      footLeft: `${dayText} ${records.length} 次`, footRight: total >= goal ? '已达标' : `还差 ${goal - total}ml`
    }
  }
  if (type === 'stool') {
    const abnormal = records.filter(item => item.abnormal).length
    return {
      kind: 'count', warning: !!abnormal, score: abnormal ? '!' : '✓',
      headline: !records.length ? `${naturalDayText}暂无记录` : abnormal ? `${naturalDayText}有异常记录` : `${naturalDayText}状态正常`,
      sub: records.length ? `已记录 ${records.length} 次${abnormal ? ' · 建议持续观察' : ' · 继续保持规律饮食'}` : '选择其他日期可查看历史记录',
      count: records.length, countUnit: '次'
    }
  }
  const minutes = records.reduce((sum, item) => sum + parseNumber(item.duration), 0)
  return {
    kind: 'count', warning: false, score: '🐾',
    headline: minutes ? `${naturalDayText}累计走了 ${minutes} 分钟` : `${naturalDayText}没有散步记录`,
    sub: records.length ? '保持每天规律活动，有助于消化和情绪' : isToday ? '带它出去走走吧' : '选择其他日期可查看历史记录',
    count: records.length, countUnit: '次'
  }
}

Page({
  data: {
    pet: {}, day: '', month: '', today: '', selectedDate: '', trendEndDate: '', dateFilterText: '今天', emptyText: '', currentType: 'feed', singleMode: true, detailTitle: '喂食详情', detailEyebrow: 'FEEDING DETAIL',
    tabs: Object.keys(TYPES).map(key => ({ key, tab: TYPES[key].tab, icon: TYPES[key].icon })),
    rows: [], summary: {}, typeMeta: {}, feedTrend: { days: [], scrollLeft: 0, activeDays: 0, totalMeals: 0, average: 0, latest7Average: 0 },
    adding: false,
    editingFeedGoal: false, feedGoal: FEED_GOAL, feedGoalDraft: String(FEED_GOAL),
    editingWaterGoal: false, waterGoal: 600, waterGoalDraft: '600',
    mealTypes: ['早餐', '午餐', '晚餐', '零食'],
    stoolConditions: ['正常成形', '偏软', '稀便', '便秘/干硬'], stoolColors: ['棕色', '黄色', '黑色', '红色'], draft: {}
  },
  onLoad(options) {
    const targetType = options && TYPES[options.type] ? options.type : 'feed'
    const today = store.todayKey()
    this.pendingAdd = !!(options && options.add === '1')
    this.pendingMealType = options && options.meal === 'breakfast' ? '早餐' : options && options.meal === 'dinner' ? '晚餐' : ''
    this.setData({ currentType: targetType, singleMode: !options || options.single !== '0', adding: false, today, selectedDate: today, trendEndDate: today })
    if (wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: `${TYPES[targetType].tab}详情` })
  },
  onShow() {
    this.refresh()
    if (this.pendingAdd) {
      this.pendingAdd = false
      this.openAdd()
      if (this.data.currentType === 'feed' && this.pendingMealType) this.setData({ 'draft.type': this.pendingMealType })
    }
    this.pendingMealType = ''
  },
  refresh() {
    const type = this.data.currentType
    const today = store.todayKey()
    const selectedDate = this.data.selectedDate || today
    const trendEndDate = this.data.trendEndDate || selectedDate
    const yesterdayKey = offsetDateKey(today, -1)
    const dateFilterText = recordDateLabel({ dayKey: selectedDate }, today, yesterdayKey)
    const pet = store.get('pet')
    const feedGoal = Number(store.get('feedGoal')) || FEED_GOAL
    const waterGoal = Number(store.get('waterGoal')) || Math.round((Number(pet.weight) || 0) * 55) || 600
    const typeRecords = store.get(TYPES[type].storeKey)
    const records = typeRecords
      .filter(item => item && item.dayKey === selectedDate)
      .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
    const rows = records.map(item => toRow(type, {
      ...item,
      date: dateFilterText
    }))
    const selected = new Date(`${selectedDate}T00:00:00`)
    const isToday = selectedDate === today
    this.setData({
      pet, today, selectedDate, day: selected.getDate(), month: selected.getMonth() + 1, dateFilterText,
      emptyText: isToday ? TYPES[type].empty : `${dateFilterText}没有${TYPES[type].tab}记录。`,
      typeMeta: TYPES[type],
      detailTitle: `${pet.name}的${TYPES[type].tab}`,
      detailEyebrow: { feed: 'FEEDING DETAIL', stool: 'STOOL DETAIL', water: 'WATER DETAIL', walk: 'WALK DETAIL' }[type],
      rows,
      feedGoal, waterGoal,
      summary: buildSummary(type, records, pet, isToday, feedGoal, waterGoal),
      feedTrend: buildTrend(type, typeRecords, trendEndDate, selectedDate, pet, feedGoal, waterGoal)
    })
  },
  onRecordDate(e) {
    this.setData({ selectedDate: e.detail.value, trendEndDate: e.detail.value })
    this.refresh()
  },
  onTrendDay(e) {
    const selectedDate = e.currentTarget.dataset.date
    if (!selectedDate) return
    this.setData({ selectedDate })
    this.refresh()
  },
  switchType(e) {
    this.setData({ currentType: e.currentTarget.dataset.type, adding: false })
    this.refresh()
  },
  openAdd() {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const drafts = {
      feed: { type: '晚餐', food: '', amount: '', time },
      stool: { condition: '正常成形', color: '棕色', note: '', time },
      water: { amount: '', note: '', time },
      walk: { duration: '', distance: '', note: '', time }
    }
    this.setData({ adding: true, draft: drafts[this.data.currentType] })
  },
  closeAdd() { this.setData({ adding: false }) },
  openFeedGoalEditor() {
    if (this.data.currentType !== 'feed') return
    this.setData({ editingFeedGoal: true, feedGoalDraft: String(this.data.feedGoal || FEED_GOAL) })
  },
  closeFeedGoalEditor() { this.setData({ editingFeedGoal: false }) },
  onFeedGoalInput(e) { this.setData({ feedGoalDraft: e.detail.value }) },
  saveFeedGoal() {
    const goal = Math.round(Number(this.data.feedGoalDraft))
    if (!Number.isFinite(goal) || goal <= 0 || goal > 5000) {
      return wx.showToast({ title: '请输入 1～5000 克的目标值', icon: 'none' })
    }
    store.set('feedGoal', goal)
    this.setData({ editingFeedGoal: false, feedGoal: goal, feedGoalDraft: String(goal) })
    this.refresh()
    wx.showToast({ title: '喂食目标已更新', icon: 'success' })
  },
  openWaterGoalEditor() {
    if (this.data.currentType !== 'water') return
    this.setData({ editingWaterGoal: true, waterGoalDraft: String(this.data.waterGoal || 600) })
  },
  closeWaterGoalEditor() { this.setData({ editingWaterGoal: false }) },
  onWaterGoalInput(e) { this.setData({ waterGoalDraft: e.detail.value }) },
  saveWaterGoal() {
    const goal = Math.round(Number(this.data.waterGoalDraft))
    if (!Number.isFinite(goal) || goal <= 0 || goal > 10000) {
      return wx.showToast({ title: '请输入 1～10000 毫升的目标值', icon: 'none' })
    }
    store.set('waterGoal', goal)
    this.setData({ editingWaterGoal: false, waterGoal: goal, waterGoalDraft: String(goal) })
    this.refresh()
    wx.showToast({ title: '饮水目标已更新', icon: 'success' })
  },
  noop() {},
  chooseType(e) { this.setData({ 'draft.type': e.currentTarget.dataset.value }) },
  chooseCondition(e) { this.setData({ 'draft.condition': e.currentTarget.dataset.value }) },
  chooseColor(e) { this.setData({ 'draft.color': e.currentTarget.dataset.value }) },
  onInput(e) { this.setData({ [`draft.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  onTime(e) { this.setData({ 'draft.time': e.detail.value }) },
  saveRecord() {
    const savers = { feed: 'saveFeed', stool: 'saveStool', water: 'saveWater', walk: 'saveWalk' }
    this[savers[this.data.currentType]]()
  },
  saveFeed() {
    const d = this.data.draft
    const food = String(d.food || '').trim()
    const amount = Number(d.amount)
    if (!food || !Number.isFinite(amount) || amount <= 0) return wx.showToast({ title: '请补充正确的食物和分量', icon: 'none' })
    const feeds = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, type: d.type, food, amount: `${amount}g`, icon: d.type === '零食' ? '🦴' : '🥣' }, ...store.get('feeds')]
    store.set('feeds', feeds)
    this.finishSave('喂食记录已保存')
  },
  saveStool() {
    const d = this.data.draft
    const abnormal = ['稀便', '便秘/干硬'].includes(d.condition) || ['黑色', '红色'].includes(d.color)
    const stools = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, condition: d.condition, color: d.color, note: d.note || '', icon: '💩', abnormal }, ...store.get('stools')]
    store.set('stools', stools)
    this.finishSave(abnormal ? '已保存，建议持续观察' : '排便记录已保存')
  },
  saveWater() {
    const d = this.data.draft
    const amount = Number(d.amount)
    if (!Number.isFinite(amount) || amount <= 0) return wx.showToast({ title: '请填写正确的饮水量', icon: 'none' })
    const waters = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, amount: `${amount}ml`, note: (d.note || '').trim(), icon: '💧' }, ...store.get('waters')]
    store.set('waters', waters)
    this.finishSave('饮水记录已保存')
  },
  saveWalk() {
    const d = this.data.draft
    const duration = Number(d.duration)
    const distance = String(d.distance || '').trim()
    const distanceValue = distance ? Number(distance) : 0
    if (!Number.isFinite(duration) || duration <= 0) return wx.showToast({ title: '请填写正确的散步时长', icon: 'none' })
    if (distance && (!Number.isFinite(distanceValue) || distanceValue < 0)) return wx.showToast({ title: '请填写正确的散步距离', icon: 'none' })
    const walks = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, duration, distance, note: (d.note || '').trim(), icon: '🐾' }, ...store.get('walks')]
    store.set('walks', walks)
    this.finishSave('散步记录已保存')
  },
  finishSave(title) {
    const today = store.todayKey()
    this.setData({ adding: false, selectedDate: today, trendEndDate: today })
    this.refresh()
    wx.showToast({ title, icon: 'none' })
  },
  removeRecord(e) {
    const key = TYPES[this.data.currentType].storeKey
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({ itemList: ['删除这条记录'], success: () => { store.set(key, store.get(key).filter(item => item.id !== id)); this.refresh() } })
  }
})
