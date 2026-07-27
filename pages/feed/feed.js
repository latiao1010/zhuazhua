const store = require('../../utils/store')

Page({
  data: {
    pet: {}, day: '', month: '', currentType: 'feed', feeds: [], stools: [], totalAmount: 0,
    todayCount: 0, progress: 0, remaining: 260, todayStoolCount: 0, abnormalCount: 0,
    adding: false, mealTypes: ['早餐', '午餐', '晚餐', '零食'],
    stoolConditions: ['正常成形', '偏软', '稀便', '便秘/干硬'], stoolColors: ['棕色', '黄色', '黑色', '红色'], draft: {}
  },
  onShow() { this.refresh() },
  refresh() {
    const dayKey = store.todayKey()
    const feeds = store.get('feeds').filter(item => item.dayKey === dayKey)
    const stools = store.get('stools').filter(item => item.dayKey === dayKey)
    const todayFeeds = feeds
    const todayStools = stools
    const totalAmount = todayFeeds.reduce((sum, item) => sum + (parseInt(item.amount, 10) || 0), 0)
    const now = new Date()
    this.setData({
      pet: store.get('pet'), day: now.getDate(), month: now.getMonth() + 1, feeds, stools, totalAmount,
      todayCount: todayFeeds.length, progress: Math.min(100, Math.round(totalAmount / 260 * 100)),
      remaining: Math.max(0, 260 - totalAmount), todayStoolCount: todayStools.length,
      abnormalCount: todayStools.filter(item => item.abnormal).length
    })
  },
  switchType(e) { this.setData({ currentType: e.currentTarget.dataset.type, adding: false }) },
  openAdd() {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const draft = this.data.currentType === 'feed'
      ? { type: '晚餐', food: '', amount: '', time }
      : { condition: '正常成形', color: '棕色', note: '', time }
    this.setData({ adding: true, draft })
  },
  closeAdd() { this.setData({ adding: false }) },
  noop() {},
  chooseType(e) { this.setData({ 'draft.type': e.currentTarget.dataset.value }) },
  chooseCondition(e) { this.setData({ 'draft.condition': e.currentTarget.dataset.value }) },
  chooseColor(e) { this.setData({ 'draft.color': e.currentTarget.dataset.value }) },
  onInput(e) { this.setData({ [`draft.${e.currentTarget.dataset.key}`]: e.detail.value }) },
  onTime(e) { this.setData({ 'draft.time': e.detail.value }) },
  saveRecord() { this.data.currentType === 'feed' ? this.saveFeed() : this.saveStool() },
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
  finishSave(title) { this.setData({ adding: false }); this.refresh(); wx.showToast({ title, icon: 'none' }) },
  removeFeed(e) { this.confirmRemove('feeds', e.currentTarget.dataset.id) },
  removeStool(e) { this.confirmRemove('stools', e.currentTarget.dataset.id) },
  confirmRemove(key, id) {
    wx.showActionSheet({ itemList: ['删除这条记录'], success: () => { store.set(key, store.get(key).filter(x => x.id !== id)); this.refresh() } })
  }
})
