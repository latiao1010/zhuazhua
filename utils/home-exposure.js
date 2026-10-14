const analytics = require('./analytics')
// 每次首页可见期间，同一入口只算一次；卡片切换不会把未出现的卡片算作曝光。
function create(page) {
  let active = false, blocked = false, seen = {}, clicked = {}, visible = {}, timers = {}, observers = [], visit = ''
  const specs = [
    ['discovery', '.discovery-swiper'], ['weather', '.weather-forecast'],
    ...['feed', 'water', 'stool', 'walk'].map(k => [k, '.metric-' + k]),
    ['recent', '.home-recent'], ['recent', '.recent-compact-entry'],
    ['knowledge', '.knowledge-entry'], ['care', '.care-float'], ['profile', '.pet-avatar']
  ]
  const entryFor = slot => slot === 'discovery' ? (page.data.discoverySlides[page.data.discoveryIndex] || {}).tool : slot
  const isBlocked = () => ['recentOpen', 'careRemindersOpen', 'knowledgeOpen', 'festivalOpen', 'healthTipOpen', 'weightTrendOpen', 'feedDetailOpen', 'stoolDetailOpen'].some(key => page.data[key])
  function emit(entry) {
    if (!active || blocked || seen[entry] || !analytics.enabled() || !analytics.metrics.entries[entry]) return
    seen[entry] = true
    analytics.track(analytics.metrics.entries[entry].module, 'impression', 'home_entry', '', { entry, exposureId: visit })
  }
  function update() {
    blocked = isBlocked()
    for (const timer of Object.values(timers)) clearTimeout(timer)
    timers = {}
    if (!active || blocked) return
    const entries = new Set(specs.filter((_, i) => visible[i]).map(([slot]) => entryFor(slot)))
    for (const entry of entries) if (entry && !seen[entry]) timers[entry] = setTimeout(() => { delete timers[entry]; emit(entry) }, 500)
  }
  function stop() {
    active = false
    for (const timer of Object.values(timers)) clearTimeout(timer)
    for (const observer of observers) observer.disconnect()
    observers = []; timers = {}; visible = {}
  }
  function start() {
    stop(); active = true; seen = {}; clicked = {}; visit = analytics.newId()
    const attach = () => {
      if (!active || typeof page.createIntersectionObserver !== 'function') return
      specs.forEach(([slot, selector], i) => {
        try {
          const observer = page.createIntersectionObserver({ thresholds: [0, 0.5, 1], initialRatio: 0 })
          observers.push(observer)
          observer.relativeToViewport().observe(selector, result => { visible[i] = result.intersectionRatio >= 0.5; update() })
        } catch (_) { /* 不支持观察器时不猜测曝光；实际点击仍可确认可见。 */ }
      })
      update()
    }
    if (typeof wx !== 'undefined' && wx.nextTick) wx.nextTick(attach); else attach()
  }
  function click(method, event) {
    if (!active || isBlocked()) return
    const data = event && event.currentTarget && event.currentTarget.dataset || {}
    let entry = { openWeatherDetails: 'weather', openKnowledge: 'knowledge', openRecent: 'recent', openFinding: 'recent', openCareReminders: 'care' }[method]
    if (method === 'goAccount' && data.exposure === 'profile') entry = 'profile'
    if (method === 'openDiscovery') entry = data.tool
    if (method === 'openStatusDetail') entry = page.data.homeDashboard.statusCards[data.index]?.action
    if (!analytics.metrics.entries[entry] || clicked[entry] || !analytics.enabled()) return
    // 主动点击确认入口已可见，短于 500ms 的点击也有相应曝光分母。
    blocked = false; emit(entry); clicked[entry] = true
    analytics.track(analytics.metrics.entries[entry].module, 'engagement', 'home_entry', '', { entry, exposureId: visit })
  }
  return { start, stop, update, click }
}
module.exports = { create }
