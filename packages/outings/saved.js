const model = require('./model')
Page({
  data: { shared: false, rows: [], selected: [], selectedCount: 0, total: 0, missingCount: 0, maxShare: model.MAX_SHARE, shareTitle: '', hasSelection: false },
  onLoad(options = {}) {
    this.sharedIds = Object.prototype.hasOwnProperty.call(options, 'ids') ? model.sharedIds(options.ids) : null
    const rawCount = typeof options.ids === 'string' ? Math.min(model.MAX_SHARE, new Set(options.ids.split('.').filter(Boolean)).size) : 0
    this.setData({ shared: this.sharedIds !== null, selected: this.sharedIds || [], missingCount: Math.max(0, rawCount - (this.sharedIds || []).length) })
    wx.setNavigationBarTitle({ title: this.data.shared ? '一起带狗出门' : '我的出行清单' })
    model.showShareMenu(); this.refresh()
  },
  onShow() { this.refresh() },
  refresh() {
    const favorites = model.favorites(), ids = this.sharedIds === null || this.sharedIds === undefined ? favorites : this.sharedIds
    const selected = this.data.selected.filter(id => ids.includes(id))
    this.setData({ rows: ids.map(id => ({ ...model.card(model.getPlace(id), favorites), selected: selected.includes(id) })),
      selected, selectedCount: selected.length, hasSelection: selected.length > 0, total: ids.length })
  },
  openPlace(e) { model.navigate('detail', 'id=' + e.currentTarget.dataset.id) },
  toggleSaved(e) {
    const result = model.toggleFavorite(e.currentTarget.dataset.id)
    if (!result.ok) wx.showToast({ title: result.message, icon: 'none' })
    this.refresh()
  },
  toggleSelection(e) {
    const id = e.currentTarget.dataset.id
    if (!this.data.rows.some(row => row.id === id)) return
    const selected = this.data.selected.slice(), index = selected.indexOf(id)
    if (index >= 0) selected.splice(index, 1)
    else {
      if (selected.length >= model.MAX_SHARE) { wx.showToast({ title: '每份分享清单最多 12 处地点', icon: 'none' }); return }
      selected.push(id)
    }
    this.setData({ selected }); this.refresh()
  },
  clearSelection() { this.setData({ selected: [] }); this.refresh() },
  selectionAction() { if (this.data.selectedCount) this.clearSelection(); else this.selectAll() },
  selectAll() {
    if (this.data.total > model.MAX_SHARE) { wx.showToast({ title: '请挑选最多 12 处地点分享', icon: 'none' }); return }
    this.setData({ selected: this.data.rows.map(row => row.id) }); this.refresh()
  },
  browse() { model.navigate('index', '', true) },
  onShareAppMessage() { return model.listShare(this.data.selected) },
  onShareTimeline() { const s = model.listShare(this.data.selected); return { title: s.title, query: s.query || 'ids=' } }
})
