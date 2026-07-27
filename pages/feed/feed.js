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

function buildSummary(type, records, pet) {
  if (type === 'feed') {
    const total = records.reduce((sum, item) => sum + parseNumber(item.amount), 0)
    return {
      kind: 'progress', label: '今日已摄入', value: total, unit: 'g', goalText: `目标 ${FEED_GOAL}g`,
      progress: Math.min(100, Math.round(total / FEED_GOAL * 100)),
      footLeft: `今日 ${records.length} 餐`, footRight: total >= FEED_GOAL ? '已达标' : `还差 ${FEED_GOAL - total}g`
    }
  }
  if (type === 'water') {
    const goal = Math.round((Number(pet.weight) || 0) * 55) || FEED_GOAL
    const total = records.reduce((sum, item) => sum + parseNumber(item.amount), 0)
    return {
      kind: 'progress', label: '今日已饮水', value: total, unit: 'ml', goalText: `目标 ${goal}ml`,
      progress: Math.min(100, Math.round(total / goal * 100)),
      footLeft: `今日 ${records.length} 次`, footRight: total >= goal ? '已达标' : `还差 ${goal - total}ml`
    }
  }
  if (type === 'stool') {
    const abnormal = records.filter(item => item.abnormal).length
    return {
      kind: 'count', warning: !!abnormal, score: abnormal ? '!' : '✓',
      headline: abnormal ? '今天有异常记录' : '今天状态正常',
      sub: `已记录 ${records.length} 次${abnormal ? ' · 建议持续观察' : ' · 继续保持规律饮食'}`,
      count: records.length, countUnit: '次'
    }
  }
  const minutes = records.reduce((sum, item) => sum + parseNumber(item.duration), 0)
  return {
    kind: 'count', warning: false, score: '🐾',
    headline: minutes ? `今天累计走了 ${minutes} 分钟` : '今天还没出门',
    sub: records.length ? '保持每天规律活动，有助于消化和情绪' : '带它出去走走吧',
    count: records.length, countUnit: '次'
  }
}

Page({
  data: {
    pet: {}, day: '', month: '', currentType: 'feed',
    tabs: Object.keys(TYPES).map(key => ({ key, tab: TYPES[key].tab, icon: TYPES[key].icon })),
    rows: [], summary: {}, typeMeta: {},
    adding: false, mealTypes: ['早餐', '午餐', '晚餐', '零食'],
    stoolConditions: ['正常成形', '偏软', '稀便', '便秘/干硬'], stoolColors: ['棕色', '黄色', '黑色', '红色'], draft: {}
  },
  onShow() { this.refresh() },
  refresh() {
    const type = this.data.currentType
    const dayKey = store.todayKey()
    const pet = store.get('pet')
    const records = store.get(TYPES[type].storeKey).filter(item => item.dayKey === dayKey)
    const now = new Date()
    this.setData({
      pet, day: now.getDate(), month: now.getMonth() + 1, typeMeta: TYPES[type],
      rows: records.map(item => toRow(type, item)), summary: buildSummary(type, records, pet)
    })
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
    if (!d.food.trim() || !d.amount) return wx.showToast({ title: '请补充食物和分量', icon: 'none' })
    const feeds = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, type: d.type, food: d.food, amount: `${parseInt(d.amount, 10)}g`, icon: d.type === '零食' ? '🦴' : '🥣' }, ...store.get('feeds')]
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
    const amount = parseInt(d.amount, 10)
    if (!amount || amount <= 0) return wx.showToast({ title: '请填写饮水量', icon: 'none' })
    const waters = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, amount: `${amount}ml`, note: (d.note || '').trim(), icon: '💧' }, ...store.get('waters')]
    store.set('waters', waters)
    this.finishSave('饮水记录已保存')
  },
  saveWalk() {
    const d = this.data.draft
    const duration = parseInt(d.duration, 10)
    if (!duration || duration <= 0) return wx.showToast({ title: '请填写散步时长', icon: 'none' })
    const walks = [{ id: Date.now(), dayKey: store.todayKey(), date: '今天', time: d.time, duration, distance: String(d.distance || '').trim(), note: (d.note || '').trim(), icon: '🐾' }, ...store.get('walks')]
    store.set('walks', walks)
    this.finishSave('散步记录已保存')
  },
  finishSave(title) { this.setData({ adding: false }); this.refresh(); wx.showToast({ title, icon: 'none' }) },
  removeRecord(e) {
    const key = TYPES[this.data.currentType].storeKey
    const id = e.currentTarget.dataset.id
    wx.showActionSheet({ itemList: ['删除这条记录'], success: () => { store.set(key, store.get(key).filter(item => item.id !== id)); this.refresh() } })
  }
})
