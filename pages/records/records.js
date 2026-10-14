const { instrument } = require('../../utils/analytics-page')
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
// Keep these dimensions aligned with .records-advisor-float.
const ADVISOR_WIDTH = 144
const ADVISOR_HEIGHT = 44
const advisorBounds = () => {
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  return { right: Math.max(8, info.windowWidth - ADVISOR_WIDTH - 8), bottom: Math.max(8, info.windowHeight - ADVISOR_HEIGHT - 8) }
}
const clampAdvisor = (position, bounds) => ({
  left: Math.max(8, Math.min(bounds.right, position.left)),
  top: Math.max(8, Math.min(bounds.bottom, position.top))
})
Page(instrument('records', {
  ...carePage,
  data: { ...carePage.data, advisorFloating: true, advisorStyle: '', pet: {}, records: [], today: '', readOnly: false, weightTrendOpen: false, weightTrend: {}, weightCount: 0 },
  onShow() {
    carePage.onShow.call(this)
    this.visible = true
    this.refresh()
    this.clampAdvisorPosition()
    cloudData.syncOnResume().then(() => { if (this.visible) this.refresh() }).catch(() => {})
  },
  onHide() { this.visible = false; this._advisorDrag = null; carePage.onHide.call(this); this.setData({ weightTrendOpen: false, careDetailOpen: false, supplyOpen: false }) },
  onUnload() { this.visible = false },
  onResize() { this._advisorDrag = null; this.clampAdvisorPosition() },
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
  openFloatingAdvisor() {
    if (Date.now() < (this._advisorTapBlockedUntil || 0)) return
    carePage.openAdvisor.call(this)
  },
  setAdvisorPosition(position) {
    this._advisorPosition = position
    this.setData({ advisorStyle: `left:${position.left}px;top:${position.top}px;right:auto;bottom:auto;` })
  },
  clampAdvisorPosition() {
    if (this._advisorPosition) this.setAdvisorPosition(clampAdvisor(this._advisorPosition, advisorBounds()))
  },
  startAdvisorDrag(e) {
    const touch = e.touches && e.touches[0]
    if (!touch) return
    const bounds = advisorBounds()
    const position = this._advisorPosition || { left: bounds.right - 8, top: bounds.bottom - 4 }
    this._advisorDrag = { ...clampAdvisor(position, bounds), x: touch.clientX, y: touch.clientY, bounds, moved: false }
  },
  moveAdvisorDrag(e) {
    const drag = this._advisorDrag
    const touch = e.touches && e.touches[0]
    if (!drag || !touch) return
    const dx = touch.clientX - drag.x
    const dy = touch.clientY - drag.y
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return
    drag.moved = true
    this._advisorTapBlockedUntil = Date.now() + 400
    this.setAdvisorPosition(clampAdvisor({ left: drag.left + dx, top: drag.top + dy }, drag.bounds))
  },
  endAdvisorDrag() {
    if (this._advisorDrag && this._advisorDrag.moved) this._advisorTapBlockedUntil = Date.now() + 400
    this._advisorDrag = null
  },
  noop() {}
}))
