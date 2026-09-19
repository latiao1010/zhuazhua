const store = require('../../utils/store')
const cloudData = require('../../utils/cloud-data')

const TYPES = {
  feed: { storeKey: 'feeds', tab: '喂食', icon: '🥣', title: '喂食时间轴', empty: '今天还没有喂食记录。', addText: '记录一次喂食', sheetTitle: '记一餐' },
  stool: { storeKey: 'stools', tab: '排便', icon: '💩', title: '排便时间轴', empty: '今天还没有排便记录。', addText: '记录一次排便', sheetTitle: '记录排便情况' },
  water: { storeKey: 'waters', tab: '饮水', icon: '💧', title: '饮水时间轴', empty: '今天还没有饮水记录。', addText: '记录一次饮水', sheetTitle: '记一次饮水' },
  walk: { storeKey: 'walks', tab: '散步', icon: '🐾', title: '散步时间轴', empty: '今天还没有散步记录。', addText: '记录一次散步', sheetTitle: '记一次散步' }
}

const FEED_GOAL = 260

function isReadOnlyMember() {
  if (store.isDemoMode && store.isDemoMode()) return false
  const share = wx.getStorageSync && wx.getStorageSync('paw_share_status')
  return !!(share && share.shared && share.role === 'viewer')
}

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

function buildTrend(type, records, endDate, selectedDate, pet, feedGoal, waterGoal, range = 30) {
  const config = getTrendConfig(type, pet, feedGoal, waterGoal)
  // 周对比始终覆盖完整的两个七天窗口，不受图表展示范围影响。
  const historyLength = Math.max(range, 14)
  const historyDays = Array.from({ length: historyLength }, (_, index) => {
    const dayKey = offsetDateKey(endDate, index - (historyLength - 1))
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
      isLatest: index === historyLength - 1,
      selected: dayKey === selectedDate
    }
  })
  const days = historyDays.slice(-range)
  const maxValue = Math.max(config.goal, ...days.map(item => item.total), 1)
  const activeDays = days.filter(item => item.total > 0)
  const totalEvents = days.reduce((sum, item) => sum + item.count, 0)
  const average = activeDays.length ? Math.round(activeDays.reduce((sum, item) => sum + item.total, 0) / activeDays.length) : 0
  const latest7 = historyDays.slice(-7)
  const previous7 = historyDays.slice(-14, -7)
  const latest7Average = Math.round(latest7.reduce((sum, item) => sum + item.total, 0) / 7)
  const previous7Average = Math.round(previous7.reduce((sum, item) => sum + item.total, 0) / 7)
  const change = latest7Average - previous7Average
  let changeText = '近两周基本稳定'
  let changeClass = 'stable'
  const latestRecordedDays = latest7.filter(item => item.count > 0).length
  const previousRecordedDays = previous7.filter(item => item.count > 0).length
  if (latestRecordedDays < 7 || previousRecordedDays < 7) {
    changeClass = 'insufficient'
    changeText = `记录不足，暂不作周对比（近 7 天 ${latestRecordedDays}/7 天，前 7 天 ${previousRecordedDays}/7 天）`
  } else if (type === 'stool') {
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
    title: config.title.replace('30', range),
    metrics: config.metricLabels.map((label, index) => ({ label: label.replace('30 天', `${range} 天`), value: metricValues[index] })),
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
  const syncDate = item._syncUpdatedAt ? new Date(Number(item._syncUpdatedAt)) : null
  const syncTime = syncDate && Number.isFinite(syncDate.getTime())
    ? `${String(syncDate.getHours()).padStart(2, '0')}:${String(syncDate.getMinutes()).padStart(2, '0')}`
    : ''
  const roleLabel = item.recordedByRole === 'owner' ? '主人' : item.recordedByRole === 'admin' ? '共同照护' : ''
  const authorText = item.recordedByName ? `${item.recordedByName}${roleLabel ? ` · ${roleLabel}` : ''}${syncTime ? ` · ${syncTime}同步` : ''}` : ''
  const base = { id: item.id, time: item.time, date: item.date, authorText }
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
    pet: {}, day: '', month: '', today: '', selectedDate: '', trendEndDate: '', dateFilterText: '今天', emptyText: '', currentType: 'feed', singleMode: true, detailTitle: '喂食详情', detailEyebrow: 'FEEDING DETAIL', trendRange: 30,
    tabs: Object.keys(TYPES).map(key => ({ key, tab: TYPES[key].tab, icon: TYPES[key].icon })),
    rows: [], summary: {}, typeMeta: {}, feedTrend: { days: [], scrollLeft: 0, activeDays: 0, totalMeals: 0, average: 0, latest7Average: 0 },
    adding: false, editingRecordId: null,
    editingFeedGoal: false, feedGoal: FEED_GOAL, feedGoalDraft: String(FEED_GOAL),
    editingWaterGoal: false, waterGoal: 600, waterGoalDraft: '600',
    mealTypes: ['早餐', '午餐', '晚餐', '零食'],
    stoolConditions: ['正常成形', '偏软', '稀便', '便秘/干硬'], stoolColors: ['棕色', '黄色', '黑色', '红色'], draft: {}, recordSearch: '', authorFilter: 'all', authorOptions: [{ value: 'all', label: '全部成员' }], selectingRecords: false, selectedRecordIds: []
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
    cloudData.syncOnResume().then(result => { if (result && result.ok !== false) this.refresh() })
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
    const keyword = String(this.data.recordSearch || '').trim().toLowerCase()
    const authorFilter = this.data.authorFilter || 'all'
    const authorOptions = [{ value: 'all', label: '全部成员' }, ...Array.from(new Map(typeRecords.filter(item => item && item.recordedBy).map(item => [item.recordedBy, { value:item.recordedBy, label:item.recordedByName || '家庭成员' }])).values())]
    const records = typeRecords
      .filter(item => item && item.dayKey === selectedDate && (authorFilter === 'all' || item.recordedBy === authorFilter))
      .filter(item => !keyword || JSON.stringify(item).toLowerCase().includes(keyword))
      .sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')))
    const selectedRecordIds = this.data.selectedRecordIds || []
    const rows = records.map(item => toRow(type, {
      ...item,
      date: dateFilterText
    })).map(item => ({ ...item, selected:selectedRecordIds.includes(String(item.id)) }))
    const selected = new Date(`${selectedDate}T00:00:00`)
    const isToday = selectedDate === today
    this.setData({
      pet, today, selectedDate, day: selected.getDate(), month: selected.getMonth() + 1, dateFilterText,
      emptyText: keyword || authorFilter !== 'all' ? '当前日期没有符合筛选条件的记录，请调整搜索或成员筛选。' : isToday ? TYPES[type].empty : `${dateFilterText}没有${TYPES[type].tab}记录。`,
      typeMeta: TYPES[type],
      detailTitle: `${pet.name}的${TYPES[type].tab}`,
      detailEyebrow: { feed: 'FEEDING DETAIL', stool: 'STOOL DETAIL', water: 'WATER DETAIL', walk: 'WALK DETAIL' }[type],
      rows,
      feedGoal, waterGoal,
      summary: buildSummary(type, records, pet, isToday, feedGoal, waterGoal),
      feedTrend: buildTrend(type, typeRecords, trendEndDate, selectedDate, pet, feedGoal, waterGoal, this.data.trendRange || 30),
      authorOptions,
      authorFilterLabel: (authorOptions.find(item => item.value === authorFilter) || authorOptions[0]).label,
      readOnly: isReadOnlyMember()
    })
  },
  onRecordDate(e) {
    this.setData({ selectedDate: e.detail.value, trendEndDate: e.detail.value, selectedRecordIds: [], selectingRecords: false })
    this.refresh()
  },
  onTrendDay(e) {
    const selectedDate = e.currentTarget.dataset.date
    if (!selectedDate) return
    this.setData({ selectedDate, selectedRecordIds: [], selectingRecords: false })
    this.refresh()
  },
  setTrendRange(e) {
    const trendRange = Number(e.currentTarget.dataset.range)
    if (![7, 30, 180].includes(trendRange)) return
    this.setData({ trendRange })
    this.refresh()
  },
  onRecordSearch(e) {
    this.setData({ recordSearch:e.detail.value, selectedRecordIds: [] })
    this.refresh()
  },
  onAuthorFilter(e) {
    const option = this.data.authorOptions[Number(e.detail.value)] || this.data.authorOptions[0]
    this.setData({ authorFilter:option.value, selectedRecordIds: [] })
    this.refresh()
  },
  toggleRecordSelectionMode() {
    if (isReadOnlyMember()) return
    this.setData({ selectingRecords:!this.data.selectingRecords, selectedRecordIds:[] })
    this.refresh()
  },
  toggleSelectedRecord(e) {
    const id = String(e.currentTarget.dataset.id)
    const selectedRecordIds = this.data.selectedRecordIds.includes(id)
      ? this.data.selectedRecordIds.filter(value => value !== id)
      : [...this.data.selectedRecordIds, id]
    this.setData({ selectedRecordIds })
    this.refresh()
  },
  removeSelectedRecords() {
    if (isReadOnlyMember()) return wx.showToast({ title:'只读成员不能删除记录', icon:'none' })
    const ids = this.data.selectedRecordIds
    if (!ids.length) return wx.showToast({ title:'请先选择记录', icon:'none' })
    const key = TYPES[this.data.currentType].storeKey
    wx.showModal({ title:'删除所选记录', content:`将删除 ${ids.length} 条记录。`, confirmText:'删除', success:result => {
      if (!result.confirm) return
      if (isReadOnlyMember()) return wx.showToast({ title:'权限已变化，不能删除', icon:'none' })
      store.set(key, store.get(key).filter(item => !ids.includes(String(item.id))))
      this.setData({ selectingRecords:false, selectedRecordIds:[] })
      this.refresh()
    } })
  },
  switchType(e) {
    this.setData({ currentType: e.currentTarget.dataset.type, adding: false, selectedRecordIds: [], selectingRecords: false, authorFilter: 'all', recordSearch: '' })
    this.refresh()
  },
  openAdd() {
    if (isReadOnlyMember()) return wx.showToast({ title: '只读成员不能新增记录', icon: 'none' })
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const drafts = {
      feed: { type: '晚餐', food: '', amount: '', time },
      stool: { condition: '正常成形', color: '棕色', note: '', time },
      water: { amount: '', note: '', time },
      walk: { duration: '', distance: '', note: '', time }
    }
    const last = wx.getStorageSync ? wx.getStorageSync('paw_record_defaults_' + this.data.currentType) : null
    this.setData({ adding: true, editingRecordId: null, draft: { ...drafts[this.data.currentType], ...(['feed', 'water', 'walk'].includes(this.data.currentType) ? last || {} : {}), time, dayKey: this.data.selectedDate || store.todayKey() } })
  },
  onDraftDate(e) { this.setData({ 'draft.dayKey': e.detail.value }) },
  persistRecord(key, record) {
    if (isReadOnlyMember()) { wx.showToast({ title: '只读成员不能修改记录', icon: 'none' }); return false }
    const dayKey = this.data.draft.dayKey || store.todayKey()
    const date = new Date(`${dayKey}T00:00:00`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey) || !Number.isFinite(date.getTime()) || dayKey > store.todayKey() || offsetDateKey(dayKey, 0) !== dayKey) {
      wx.showToast({ title: '请选择有效的记录日期', icon: 'none' })
      return false
    }
    const records = store.get(key)
    const id = this.data.editingRecordId
    if (id != null && !records.some(item => item.id === id)) {
      wx.showToast({ title: '记录已变化，请刷新后重试', icon: 'none' })
      return false
    }
    const previous = id == null ? {} : records.find(item => item.id === id)
    const next = { ...previous, ...record, dayKey, date: dayKey, id: id == null ? record.id : id }
    store.set(key, id == null ? [next, ...records] : records.map(item => item.id === id ? next : item))
    if (wx.setStorageSync) {
      const { dayKey: ignoredDate, time: ignoredTime, note: ignoredNote, ...defaults } = this.data.draft
      wx.setStorageSync('paw_record_defaults_' + this.data.currentType, defaults)
    }
    return true
  },
  editRecord(e) {
    if (isReadOnlyMember()) return wx.showToast({ title: '只读成员不能编辑记录', icon: 'none' })
    const item = store.get(TYPES[this.data.currentType].storeKey).find(record => record.id === e.currentTarget.dataset.id)
    if (!item) return
    const draft = { ...item }
    if (item.amount) draft.amount = String(parseFloat(item.amount))
    this.setData({ adding: true, editingRecordId: item.id, draft })
  },
  closeAdd() { this.setData({ adding: false }) },
  openFeedGoalEditor() {
    if (this.data.currentType !== 'feed') return
    if (isReadOnlyMember()) return wx.showToast({ title: '只读成员不能修改目标', icon: 'none' })
    this.setData({ editingFeedGoal: true, feedGoalDraft: String(this.data.feedGoal || FEED_GOAL) })
  },
  closeFeedGoalEditor() { this.setData({ editingFeedGoal: false }) },
  onFeedGoalInput(e) { this.setData({ feedGoalDraft: e.detail.value }) },
  saveFeedGoal() {
    const goal = Math.round(Number(this.data.feedGoalDraft))
    if (!Number.isFinite(goal) || goal <= 0 || goal > 5000) {
      return wx.showToast({ title: '请输入 1～5000 克的目标值', icon: 'none' })
    }
    const previousGoal = this.data.feedGoal
    const saved = store.set('feedGoal', goal)
    this.setData({ editingFeedGoal: false, feedGoal: goal, feedGoalDraft: String(goal) })
    this.refresh()
    Promise.resolve(saved).then(result => {
      if (result && result.ok === false) {
        this.setData({ feedGoal: previousGoal, feedGoalDraft: String(previousGoal) })
        this.refresh()
        wx.showToast({ title: '喂食目标未保存', icon: 'none' })
        return
      }
      wx.showToast({ title: '喂食目标已更新', icon: 'success' })
    })
  },
  openWaterGoalEditor() {
    if (this.data.currentType !== 'water') return
    if (isReadOnlyMember()) return wx.showToast({ title: '只读成员不能修改目标', icon: 'none' })
    this.setData({ editingWaterGoal: true, waterGoalDraft: String(this.data.waterGoal || 600) })
  },
  closeWaterGoalEditor() { this.setData({ editingWaterGoal: false }) },
  onWaterGoalInput(e) { this.setData({ waterGoalDraft: e.detail.value }) },
  saveWaterGoal() {
    const goal = Math.round(Number(this.data.waterGoalDraft))
    if (!Number.isFinite(goal) || goal <= 0 || goal > 10000) {
      return wx.showToast({ title: '请输入 1～10000 毫升的目标值', icon: 'none' })
    }
    const previousGoal = this.data.waterGoal
    const saved = store.set('waterGoal', goal)
    this.setData({ editingWaterGoal: false, waterGoal: goal, waterGoalDraft: String(goal) })
    this.refresh()
    Promise.resolve(saved).then(result => {
      if (result && result.ok === false) {
        this.setData({ waterGoal: previousGoal, waterGoalDraft: String(previousGoal) })
        this.refresh()
        wx.showToast({ title: '饮水目标未保存', icon: 'none' })
        return
      }
      wx.showToast({ title: '饮水目标已更新', icon: 'success' })
    })
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
    if (!this.persistRecord('feeds', feeds[0])) return
    this.finishSave('喂食记录已保存')
  },
  saveStool() {
    const d = this.data.draft
    const abnormal = ['稀便', '便秘/干硬'].includes(d.condition) || ['黑色', '红色'].includes(d.color)
    const stools = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, condition: d.condition, color: d.color, note: d.note || '', icon: '💩', abnormal }, ...store.get('stools')]
    if (!this.persistRecord('stools', stools[0])) return
    this.finishSave(abnormal ? '已保存，建议持续观察' : '排便记录已保存')
  },
  saveWater() {
    const d = this.data.draft
    const amount = Number(d.amount)
    if (!Number.isFinite(amount) || amount <= 0) return wx.showToast({ title: '请填写正确的饮水量', icon: 'none' })
    const waters = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, amount: `${amount}ml`, note: (d.note || '').trim(), icon: '💧' }, ...store.get('waters')]
    if (!this.persistRecord('waters', waters[0])) return
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
    if (!this.persistRecord('walks', walks[0])) return
    this.finishSave('散步记录已保存')
  },
  finishSave(title) {
    const dayKey = this.data.draft.dayKey || store.todayKey()
    this.setData({ adding: false, editingRecordId: null, selectedDate: dayKey, trendEndDate: dayKey })
    this.refresh()
    wx.showToast({ title, icon: 'none' })
  },
  removeRecord(e) {
    if (isReadOnlyMember()) return wx.showToast({ title: '只读成员不能删除记录', icon: 'none' })
    const key = TYPES[this.data.currentType].storeKey
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({ itemList: ['删除这条记录'], success: () => { store.set(key, store.get(key).filter(item => item.id !== id)); this.refresh() } })
  },
  openRecordActions(e) {
    if (isReadOnlyMember()) return wx.showToast({ title: '只读成员不能修改记录', icon: 'none' })
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: ['编辑记录', '删除记录'],
      success: result => {
        if (result.tapIndex === 0) this.editRecord({ currentTarget: { dataset: { id } } })
        else this.removeRecord({ currentTarget: { dataset: { id } } })
      }
    })
  }
})
