const { instrument } = require('../../utils/analytics-page')
const analytics = require('../../utils/analytics')
const model = require('./model')
const PAGE_SIZE = 20
Page(instrument('outings', {
  data: { city: '上海市', query: '', categoryId: 'all', categories: model.CATEGORIES,
    filters: [], filterOptions: model.FILTERS, cityOpen: false, filterOpen: false,
    cityQuery: '', cityOptions: [], draftFilters: [], draftTotal: 0, activeFilters: [],
    resultTitle: '本城好去处', categoryLabel: '全部', rows: [], total: 0, cityCount: 0,
    hasMore: false, favoriteCount: 0, hasSearch: false, filterCount: 0, availableCityCount: model.cityOptions().length },
  onLoad(options = {}) {
    this.setData({ city: model.initialCity(options.city), categoryId: model.category(options.category).id })
    model.rememberCity(this.data.city)
    model.showShareMenu()
    this.refresh()
  },
  onShow() { if (this.results) this.renderRows() },
  onUnload() { clearTimeout(this.searchTimer) },
  refresh({ scrollToTop = false } = {}) {
    clearTimeout(this.searchTimer)
    this.searchTimer = null
    this.results = model.queryPlaces(this.data)
    this.outingFlow = analytics.beginFlow('outings')
    if (!this.results.length) analytics.track('outings', 'complete', 'empty_results')
    this.visible = PAGE_SIZE
    const categoryLabel = model.category(this.data.categoryId).label
    this.setData({ cityCount: model.catalog.cities.find(c => c.name === this.data.city).count,
      hasSearch: !!this.data.query.trim() || this.data.categoryId !== 'all' || this.data.filters.length > 0,
      filterCount: this.data.filters.length,
      categoryLabel,
      activeFilters: model.FILTERS.filter(f => this.data.filters.includes(f.id)),
      resultTitle: this.data.query.trim() ? '搜索结果' : this.data.filters.length ? '符合条件的地点' :
        this.data.categoryId === 'all' ? '本城好去处' : categoryLabel })
    this.renderRows(scrollToTop)
  },
  renderRows(scrollToTop = false) {
    const favorites = model.favorites()
    this.setData({ rows: this.results.slice(0, this.visible).map(p => model.card(p, favorites)),
      total: this.results.length, hasMore: this.results.length > this.visible, favoriteCount: favorites.length },
      () => { if (scrollToTop) wx.pageScrollTo({ scrollTop: 0, duration: 0 }) })
  },
  search(e) { this.setData({ query: String(e.detail.value || '').slice(0, 60) }); clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.refresh({ scrollToTop: true }), 180) },
  searchNow() { this.refresh({ scrollToTop: true }) },
  clearSearch() { this.setData({ query: '' }); this.refresh({ scrollToTop: true }) },
  chooseCategory(e) { this.setData({ categoryId: model.category(e.currentTarget.dataset.id).id }); this.refresh({ scrollToTop: true }) },
  resetFilters() { this.setData({ query: '', categoryId: 'all', filters: [] }); this.refresh({ scrollToTop: true }) },
  removeFilter(e) { this.setData({ filters: this.data.filters.filter(id => id !== e.currentTarget.dataset.id) }); this.refresh({ scrollToTop: true }) },
  clearFilters() { this.setData({ filters: [] }); this.refresh({ scrollToTop: true }) },
  openCities() { this.setData({ cityOpen: true, cityQuery: '', cityOptions: model.cityOptions() }) },
  closeCities() { this.setData({ cityOpen: false }) },
  searchCity(e) { const cityQuery = String(e.detail.value || '').slice(0, 40); this.setData({ cityQuery, cityOptions: model.cityOptions(cityQuery) }) },
  chooseCity(e) {
    const city = e.currentTarget.dataset.city
    if (!model.validCity(city)) return
    this.setData({ city, cityOpen: false, query: '', categoryId: 'all', filters: [] })
    model.rememberCity(city); this.refresh({ scrollToTop: true })
  },
  openFilters() {
    if (this.searchTimer) this.refresh({ scrollToTop: true })
    this.updateDraft(this.data.filters)
    this.setData({ filterOpen: true })
  },
  closeFilters() { this.setData({ filterOpen: false }) },
  updateDraft(ids) {
    const draftFilters = model.FILTERS.filter(f => ids.includes(f.id)).map(f => f.id)
    this.setData({ draftFilters,
      draftTotal: model.queryPlaces({ ...this.data, filters: draftFilters }).length,
      filterOptions: model.FILTERS.map(f => ({ ...f, selected: draftFilters.includes(f.id) })) })
  },
  toggleFilter(e) {
    const id = e.currentTarget.dataset.id
    const draftFilters = this.data.draftFilters.includes(id) ? this.data.draftFilters.filter(x => x !== id) : this.data.draftFilters.concat(id)
    this.updateDraft(draftFilters)
  },
  clearDraft() { this.updateDraft([]) },
  applyFilters() { this.setData({ filters: this.data.draftFilters, filterOpen: false }); this.refresh({ scrollToTop: true }) },
  openPlace(e) { analytics.handoffOuting(this.outingFlow, e.currentTarget.dataset.id); model.navigate('detail', 'id=' + e.currentTarget.dataset.id) },
  toggleSaved(e) {
    const result = model.toggleFavorite(e.currentTarget.dataset.id)
    if (result.ok) {
      analytics.track('outings', 'complete', 'favorite')
      if (result.saved) { analytics.stepFlow(this.outingFlow, 1); analytics.stepFlow(this.outingFlow, 2) }
    } else analytics.failure('outings', 'favorite', 'unavailable')
    wx.showToast({ title: result.ok ? (result.saved ? '已加入我的清单' : '已取消收藏') : result.message, icon: 'none' })
    this.renderRows()
  },
  openSaved() { model.navigate('saved') },
  emptyAction() { if (this.data.cityCount) this.resetFilters(); else this.openCities() },
  loadMore() { this.visible += PAGE_SIZE; this.renderRows() },
  onReachBottom() { if (this.data.hasMore) this.loadMore() },
  noop() {},
  share() {
    const query = 'city=' + encodeURIComponent(this.data.city) + '&category=' + this.data.categoryId
    return { title: this.data.city.replace(/市$/, '') + ' · 一起带狗出门', path: '/packages/outings/index?' + query, query }
  },
  onShareAppMessage() { return this.share() },
  onShareTimeline() { const s = this.share(); return { title: s.title, query: s.query } }
}))
