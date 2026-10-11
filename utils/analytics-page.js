const analytics = require('./analytics')
const types = ['feed', 'water', 'stool', 'walk']
const tools = ['age', 'personality', 'bingo']
function moduleFor(key, page, method, event) {
  const data = page.data || {}, target = event && event.currentTarget && event.currentTarget.dataset || {}
  if (key === 'play' || key === 'result') return tools.includes(data.tool || data.model && data.model.tool) ? (data.tool || data.model.tool) : 'age'
  if (method === 'openDiscovery' && ['outings', ...tools].includes(target.tool)) return target.tool
  if (method === 'openStatusDetail') { const item = data.homeDashboard && data.homeDashboard.statusCards[target.index]; if (item && types.includes(item.action)) return item.action }
  if (['addRecord', 'openDetail'].includes(method) && types.includes(target.type)) return target.type
  if (/Weather/.test(method)) return 'weather'
  if (/Knowledge/.test(method)) return 'knowledge'
  if (/Recent|Finding|Insight/.test(method)) return 'recent'
  if (/Festival/.test(method)) return 'anniversary'
  if (/Weight/.test(method)) return 'weight'
  if (/Growth|Album/.test(method)) return 'album'
  if (/Family|Invite/.test(method)) return 'family'
  if (/Supply/.test(method)) return 'supplies'
  if (/CareProfile/.test(method) || method === 'openProfileSection') return 'care_profile'
  if (/Care/.test(method)) return 'care'
  if (/Advisor/.test(method)) return 'advisor'
  if (/Profile|Avatar|savePet/.test(method)) return 'profile'
  if (key === 'record_detail') return types.includes(data.currentType) ? data.currentType : 'feed'
  return analytics.catalog.modules[key] ? key : 'home'
}
const overlayEntries = { openWeightTrend: 'weightTrendOpen', openGrowthAlbum: 'growthAlbumOpen', openFamilyManager: 'familyOpen', openCareDetail: 'careDetailOpen', openSupply: 'supplyOpen', openProfileFieldEdit: 'profileFieldEditOpen', openProfileSection: 'profileSection', openKnowledge: 'knowledgeOpen', openRecent: 'recentOpen', openFestivals: 'festivalOpen', openCareReminders: 'careRemindersOpen' }
function instrument(key, definition) {
  const page = { ...definition }
  for (const method of analytics.catalog.handlers[key] || []) {
    const original = definition[method]; if (typeof original !== 'function') continue
    page[method] = function(event, ...args) {
      const fromUI = event && ['tap', 'longpress', 'change', 'confirm'].includes(event.type)
      const module = moduleFor(key, this, method, event)
      const wasOpen = overlayEntries[method] && this.data[overlayEntries[method]]
      if (fromUI && key === 'home' && this._homeExposure) this._homeExposure.click(method, event)
      if (fromUI) analytics.track(module, 'click', method)
      try {
        const result = original.call(this, event, ...args)
        if (key === 'home' && this._homeExposure) this._homeExposure.update()
        if (overlayEntries[method] && !wasOpen && this.data[overlayEntries[method]]) analytics.track(module, 'view', 'page')
        if (fromUI && method === 'switchType' && module !== moduleFor(key, this, '')) analytics.track(moduleFor(key, this, ''), 'view', 'page')
        if (result && typeof result.then === 'function') return result.catch(error => { analytics.failure(module, method, error); throw error })
        return result
      } catch (error) { analytics.failure(module, method, error); throw error }
    }
  }
  page.onShow = function(...args) {
    const result = definition.onShow && definition.onShow.apply(this, args)
    if (!this._analyticsVisible) {
      this._analyticsVisible = true; analytics.track(moduleFor(key, this, ''), 'view', 'page')
      if (key === 'home') {
        this._homeExposure = this._homeExposure || require('./home-exposure').create(this)
        this._homeExposure.start()
      }
    }
    return result
  }
  page.onTabItemTap = function(...args) {
    analytics.track(moduleFor(key, this, ''), 'click', 'tab')
    return definition.onTabItemTap && definition.onTabItemTap.apply(this, args)
  }
  for (const method of ['onHide', 'onUnload']) page[method] = function(...args) {
    this._analyticsVisible = false
    if (this._homeExposure) this._homeExposure.stop()
    return definition[method] && definition[method].apply(this, args)
  }
  for (const [method, action] of [['onShareAppMessage', 'message_menu'], ['onShareTimeline', 'timeline_menu']]) {
    if (!definition[method]) continue
    page[method] = function(...args) {
      const result = definition[method].apply(this, args), module = moduleFor(key, this, '')
      analytics.track(module, 'share', action)
      return analytics.tagShare(result, module, method === 'onShareTimeline')
    }
  }
  return page
}
module.exports = { instrument, moduleFor }
