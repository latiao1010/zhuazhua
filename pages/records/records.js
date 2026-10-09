const store = require('../../utils/store')
const cloudData = require('../../utils/cloud-data')
const { buildWeightTrend } = require('../../utils/weight-trend')
const { openTab } = require('../../utils/tab-navigation')
const carePage = require('../shared/account-controller')({ careOnly: true, tabName: 'records' })

const TYPES = [
  { key: 'feed', storeKey: 'feeds', label: '喂食', field: 'amount', unit: 'g', tone: 'peach' },
  { key: 'water', storeKey: 'waters', label: '饮水', field: 'amount', unit: 'ml', tone: 'mint' },
  { key: 'stool', storeKey: 'stools', label: '排便', unit: '次', tone: 'cream' },
  { key: 'walk', storeKey: 'walks', label: '散步', field: 'duration', unit: '分钟', tone: 'blue' }
]
const number = value => Number((String(value == null ? '' : value).match(/[\d.]+/) || [0])[0]) || 0
Page({
  ...carePage,
  data: { ...carePage.data, pet: {}, records: [], today: '', readOnly: false, weightTrendOpen: false, weightTrend: {}, weightCount: 0, advisorStyle: '' },
  onShow() {
    carePage.onShow.call(this)
    this.visible = true
    this.refresh()
    cloudData.syncOnResume().then(() => { if (this.visible) this.refresh() }).catch(() => {})
  },
  onHide() { this.visible = false; carePage.onHide.call(this); this.setData({ weightTrendOpen: false, careDetailOpen: false, supplyOpen: false }) },
  onUnload() { this.visible = false },
  refresh() {
    this.refreshCareOverview()
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
  startAdvisorDrag(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return
    this._advisorDrag = { ...this._advisorPosition, x: touch.clientX, y: touch.clientY, moved: false }
  },
  moveAdvisorDrag(e) {
    const drag = this._advisorDrag
    const touch = e.touches && e.touches[0]
    if (!drag || !touch) return
    const dx = touch.clientX - drag.x
    const dy = touch.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) < 4) return
    drag.moved = true
    const info = wx.getWindowInfo ? wx.getWindowInfo() : { windowWidth: 375, windowHeight: 667 }
    const scale = info.windowWidth / 750
    const cardWidth = 212 * scale
    const cardHeight = 70 * scale
    const left = Math.max(8, Math.min(info.windowWidth - cardWidth - 8, (drag.left == null ? info.windowWidth - cardWidth - 28 * scale : drag.left) + dx))
    const top = Math.max(8, Math.min(info.windowHeight - cardHeight - 8, (drag.top == null ? info.windowHeight - cardHeight - 112 * scale : drag.top) + dy))
    drag.left = left
    drag.top = top
    drag.x = touch.clientX
    drag.y = touch.clientY
    this._advisorPosition = { left, top }
    this.setData({ advisorStyle: `left:${left}px;top:${top}px;right:auto;bottom:auto;` })
  },
  endAdvisorDrag() { this._advisorDrag = null },
  noop() {}
})
