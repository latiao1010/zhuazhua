const model = require('./model')
const PAGE_SIZE = 20
Page({
  data: { city: '上海市', query: '', categoryId: 'all', categories: model.CATEGORIES,
    filters: [], filterOptions: model.FILTERS, cityOpen: false, filterOpen: false,
    cityQuery: '', cityOptions: [], draftFilters: [], rows: [], total: 0, cityCount: 0,
    hasMore: false, favoriteCount: 0, hasSearch: false, filterCount: 0, availableCityCount: model.cityOptions().length },
  onLoad(options = {}) {
    this.setData({ city: model.initialCity(options.city), categoryId: model.category(options.category).id })
    model.rememberCity(this.data.city)
    model.showShareMenu()
    this.refresh()
  },
  onShow() { if (this.results) this.renderRows() },
  onUnload() { clearTimeout(this.searchTimer) },
  refresh() {
    this.results = model.queryPlaces(this.data)
    this.visible = PAGE_SIZE
    this.setData({ cityCount: model.catalog.cities.find(c => c.name === this.data.city).count,
      hasSearch: !!this.data.query.trim() || this.data.categoryId !== 'all' || this.data.filters.length > 0,
      filterCount: this.data.filters.length })
    this.renderRows()
  },
  renderRows() {
    const favorites = model.favorites()
    this.setData({ rows: this.results.slice(0, this.visible).map(p => model.card(p, favorites)),
      total: this.results.length, hasMore: this.results.length > this.visible, favoriteCount: favorites.length })
  },
  search(e) { this.setData({ query: String(e.detail.value || '').slice(0, 60) }); clearTimeout(this.searchTimer); this.searchTimer = setTimeout(() => this.refresh(), 180) },
  searchNow() { clearTimeout(this.searchTimer); this.refresh() },
  clearSearch() { clearTimeout(this.searchTimer); this.setData({ query: '' }); this.refresh() },
  chooseCategory(e) { this.setData({ categoryId: model.category(e.currentTarget.dataset.id).id }); this.refresh() },
  resetFilters() { clearTimeout(this.searchTimer); this.setData({ query: '', categoryId: 'all', filters: [] }); this.refresh() },
  openCities() { this.setData({ cityOpen: true, cityQuery: '', cityOptions: model.cityOptions() }) },
  closeCities() { this.setData({ cityOpen: false }) },
  searchCity(e) { const cityQuery = String(e.detail.value || '').slice(0, 40); this.setData({ cityQuery, cityOptions: model.cityOptions(cityQuery) }) },
  chooseCity(e) {
    const city = e.currentTarget.dataset.city
    if (!model.validCity(city)) return
    clearTimeout(this.searchTimer)
    this.setData({ city, cityOpen: false, query: '', categoryId: 'all', filters: [] })
    model.rememberCity(city); this.refresh()
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  openFilters() { this.setData({ filterOpen: true, draftFilters: this.data.filters, filterOptions: model.FILTERS.map(f => ({ ...f, selected: this.data.filters.includes(f.id) })) }) },
  closeFilters() { this.setData({ filterOpen: false }) },
  toggleFilter(e) {
    const id = e.currentTarget.dataset.id
    const draftFilters = this.data.draftFilters.includes(id) ? this.data.draftFilters.filter(x => x !== id) : this.data.draftFilters.concat(id)
    this.setData({ draftFilters, filterOptions: model.FILTERS.map(f => ({ ...f, selected: draftFilters.includes(f.id) })) })
  },
  clearDraft() { this.setData({ draftFilters: [], filterOptions: model.FILTERS.map(f => ({ ...f, selected: false })) }) },
  applyFilters() { this.setData({ filters: this.data.draftFilters, filterOpen: false }); this.refresh() },
  openPlace(e) { model.navigate('detail', 'id=' + e.currentTarget.dataset.id) },
  toggleSaved(e) { const result = model.toggleFavorite(e.currentTarget.dataset.id); if (!result.ok) wx.showToast({ title: result.message, icon: 'none' }); this.renderRows() },
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
})
