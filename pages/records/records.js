const store = require('../../utils/store')
const cloudData = require('../../utils/cloud-data')
const { buildWeightTrend } = require('../../utils/weight-trend')
const { openTab } = require('../../utils/tab-navigation')

const TYPES = [
  { key: 'feed', storeKey: 'feeds', label: '喂食', field: 'amount', unit: 'g', tone: 'peach' },
  { key: 'water', storeKey: 'waters', label: '饮水', field: 'amount', unit: 'ml', tone: 'mint' },
  { key: 'stool', storeKey: 'stools', label: '排便', unit: '次', tone: 'cream' },
  { key: 'walk', storeKey: 'walks', label: '散步', field: 'duration', unit: '分钟', tone: 'blue' }
]
const number = value => Number((String(value == null ? '' : value).match(/[\d.]+/) || [0])[0]) || 0
Page({
  data: { pet: {}, records: [], today: '', readOnly: false, weightTrendOpen: false, weightTrend: {}, weightCount: 0 },
  onShow() {
    this.visible = true
    if (wx.showTabBar) wx.showTabBar({ animation: false })
    this.refresh()
    cloudData.syncOnResume().then(() => { if (this.visible) this.refresh() }).catch(() => {})
  },
  onHide() { this.visible = false; this.setData({ weightTrendOpen: false }) },
  onUnload() { this.visible = false },
  refresh() {
    const today = store.todayKey()
    const pet = store.get('pet')
    const share = cloudData.getShareStatus()
    const readOnly = !(store.isDemoMode && store.isDemoMode()) && !!share.shared && share.role === 'viewer'
    const records = TYPES.map(type => {
      const all = store.get(type.storeKey) || []
      const items = all.filter(item => item && item.dayKey === today)
      const total = type.field ? items.reduce((sum, item) => sum + number(item[type.field]), 0) : items.length
      return { ...type, count: items.length, total: Math.round(total * 10) / 10,
        historyCount: all.length }
    })
    const weights = store.get('weightRecords') || []
    this.setData({ pet, today, readOnly, records, weightCount: weights.filter(item => item && Number(item.weight) > 0).length,
      weightTrend: buildWeightTrend(weights, pet.weight, today) })
  },
  openDetail(e) {
    const type = e.currentTarget.dataset.type
    if (!TYPES.some(item => item.key === type)) return
    wx.navigateTo({ url: '/pages/feed/feed?type=' + type + '&single=1' })
  },
  addRecord(e) {
    if (this.data.readOnly) return
    const type = e.currentTarget.dataset.type
    if (!TYPES.some(item => item.key === type)) return
    wx.navigateTo({ url: '/pages/feed/feed?type=' + type + '&add=1&single=1' })
  },
  openWeightTrend() { this.setData({ weightTrendOpen: true }) },
  closeWeightTrend() { this.setData({ weightTrendOpen: false }) },
  editWeight() { if (!this.data.readOnly) openTab('account', 'weight') },
  openVisitData() { wx.navigateTo({ url: '/pages/manage/manage' }) },
  noop() {}
})
