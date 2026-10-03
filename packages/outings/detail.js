const model = require('./model')
Page({
  data: { place: null, saved: false, policyRows: [], sourceOpen: false, statusLabel: '', highlights: [] },
  onLoad(options = {}) {
    const place = model.getPlace(options.id)
    if (!place) { this.setData({ place: null }); return }
    this.setData({ place, policyRows: model.policyRows(place), statusLabel: model.STATUS[place.status],
      categoryLabel: place.categories.map(id => model.category(id).label).join(' · '),
      highlights: [...new Set(place.sources.map(s => s.conditions))] })
    model.showShareMenu()
  },
  onShow() { this.setData({ saved: !!this.data.place && model.favorites().includes(this.data.place.id) }) },
  toggleSaved() {
    if (!this.data.place) return
    const result = model.toggleFavorite(this.data.place.id)
    if (result.ok) this.setData({ saved: result.saved })
    wx.showToast({ title: result.ok ? (result.saved ? '已加入我的清单' : '已取消收藏') : result.message, icon: 'none' })
  },
  copyAddress() {
    const place = this.data.place
    if (!place) return
    wx.setClipboardData({ data: place.city + ' ' + place.name + '\n' + place.location,
      fail: () => wx.showToast({ title: '复制失败，请重试', icon: 'none' }) })
  },
  toggleSources() { this.setData({ sourceOpen: !this.data.sourceOpen }) },
  copySource(e) {
    const place = this.data.place
    const source = place && place.sources.find(s => s.noteId === e.currentTarget.dataset.id)
    if (source) wx.setClipboardData({ data: source.url, fail: () => wx.showToast({ title: '链接复制失败，请重试', icon: 'none' }) })
  },
  moreInCity() { model.navigate('index', this.data.place ? 'city=' + encodeURIComponent(this.data.place.city) : '', true) },
  openSaved() { model.navigate('saved') },
  goHome() { wx.switchTab({ url: '/pages/profile/profile' }) },
  onShareAppMessage() {
    const place = this.data.place
    return place ? { title: place.name + ' · 携宠出门前看看', path: '/packages/outings/detail?id=' + place.id } : model.listShare([])
  },
  onShareTimeline() { return this.data.place ? { title: this.data.place.name + ' · 携宠注意事项', query: 'id=' + this.data.place.id } : { title: '带狗出门', query: '' } }
})
