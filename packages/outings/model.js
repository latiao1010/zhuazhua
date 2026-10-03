const catalog = require('./catalog')
const ROOT = '/packages/outings/'
const FAVORITES_KEY = 'paw_outing_favorites_v1'
const CITY_KEY = 'paw_outing_city_v1'
const MAX_SHARE = 12
const CATEGORIES = [
  { id: 'all', label: '全部', glyph: '去' },
  { id: 'eat', label: '吃饭', glyph: '食' },
  { id: 'coffee', label: '喝咖啡', glyph: '咖' },
  { id: 'stay', label: '住一晚', glyph: '宿' },
  { id: 'outdoor', label: '户外玩', glyph: '野' },
  { id: 'shop', label: '逛一逛', glyph: '逛' },
  { id: 'other', label: '其他', glyph: '游' }
]
const FILTERS = [
  { id: 'indoor', label: '室内有携宠线索', short: '室内携宠', values: ['yes'] },
  { id: 'large', label: '有大型犬到访线索', short: '大型犬', values: ['yes'] },
  { id: 'ground', label: '有允许落地线索', short: '允许落地', values: ['yes'] },
  { id: 'stroller', label: '有推车到访或要求', short: '带推车', values: ['required', 'used'] },
  { id: 'reservation', label: '需先预约或沟通', short: '先预约', values: ['required'] }
]
const byId = Object.create(null)
catalog.places.forEach(place => { byId[place.id] = place })
const STATUS = { pending: '携宠规则待确认', review: '出发前重点确认', denied: '有拒绝携犬的记录' }

function getPlace(id) { return typeof id === 'string' ? byId[id] || null : null }
function cleanIds(ids, limit = 1000) {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.filter(id => typeof id === 'string' && /^[a-f0-9]{12}$/.test(id) && getPlace(id)))].slice(0, limit)
}
function storage() { return typeof wx === 'undefined' ? null : wx }
function favorites() {
  try { return cleanIds(storage().getStorageSync(FAVORITES_KEY)) } catch (e) { return [] }
}
function toggleFavorite(id) {
  if (!getPlace(id)) return { ok: false, message: '地点暂时无法找到' }
  const ids = favorites(), wasSaved = ids.includes(id)
  const next = wasSaved ? ids.filter(value => value !== id) : ids.concat(id)
  try { storage().setStorageSync(FAVORITES_KEY, next) } catch (e) { return { ok: false, message: '保存失败，请检查设备存储后重试' } }
  return { ok: true, saved: !wasSaved, ids: next }
}
function validCity(city) { return catalog.cities.some(item => item.name === city) }
function initialCity(requested) {
  if (validCity(requested)) return requested
  try { const last = storage().getStorageSync(CITY_KEY); if (validCity(last)) return last } catch (e) {}
  return '上海市'
}
function rememberCity(city) { if (validCity(city)) { try { storage().setStorageSync(CITY_KEY, city) } catch (e) {} } }
function cityOptions(query = '') {
  const value = String(query).trim().toLowerCase()
  return catalog.cities.filter(city => value ? (city.name + city.province).toLowerCase().includes(value) : city.count > 0)
    .slice().sort((a, b) => (b.count > 0) - (a.count > 0) || a.name.localeCompare(b.name, 'zh-CN'))
}
function category(id) { return CATEGORIES.find(c => c.id === id) || CATEGORIES[0] }
function policyRows(place) {
  const policy = place.policy
  return [
    { key: 'indoor', label: '室内区域', value: policy.indoor === 'yes' ? '有携宠线索' : policy.indoor === 'no' ? '有不可进入记录' : '待确认' },
    { key: 'large', label: '大型犬', value: policy.large === 'yes' ? '有可到访线索' : policy.large === 'no' ? '有体型限制' : '待确认' },
    { key: 'ground', label: '是否可落地', value: policy.ground === 'yes' ? '有可落地线索' : policy.ground === 'no' ? '有不可落地记录' : '待确认' },
    { key: 'stroller', label: '推车', value: policy.stroller === 'required' ? '来源称需使用' : policy.stroller === 'used' ? '作者曾使用' : '待确认' },
    { key: 'reservation', label: '预约 / 沟通', value: policy.reservation === 'required' ? '请提前联系门店' : '待确认' }
  ].map(row => ({ ...row, uncertain: policy[row.key] === 'unknown' || policy[row.key] === 'conflict', value: policy[row.key] === 'conflict' ? '来源有分歧' : row.value }))
}
function card(place, savedIds = []) {
  const primary = category(place.categories[0])
  const tags = place.status === 'pending' ? FILTERS.filter(f => f.values.includes(place.policy[f.id])).map(f => f.short) : []
  return {
    id: place.id, name: place.name, city: place.city, location: place.location,
    category: primary.label, categoryId: primary.id, glyph: primary.glyph,
    tags: tags.slice(0, 3), status: place.status, statusLabel: STATUS[place.status],
    sourceCount: place.sources.length, saved: savedIds.includes(place.id)
  }
}
function queryPlaces({ city, categoryId = 'all', query = '', filters = [] }) {
  const wanted = FILTERS.filter(f => Array.isArray(filters) && filters.includes(f.id))
  const tokens = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean)
  return catalog.places.filter(place => {
    if (place.city !== city || (categoryId !== 'all' && !place.categories.includes(categoryId))) return false
    if (wanted.length && (place.status !== 'pending' || !wanted.every(f => f.values.includes(place.policy[f.id])))) return false
    const haystack = [place.name, place.city, ...place.addresses, ...place.locations].join(' ').toLowerCase()
    return tokens.every(token => haystack.includes(token))
  }).sort((a, b) => {
    const order = { pending: 0, review: 1, denied: 2 }
    return order[a.status] - order[b.status] || Number(!!b.address) - Number(!!a.address) || b.sources.length - a.sources.length || a.name.localeCompare(b.name, 'zh-CN')
  })
}
function sharedIds(value) {
  if (typeof value !== 'string' || value.length > 300) return []
  return cleanIds(value.split('.'), MAX_SHARE)
}
function listShare(ids) {
  const selected = cleanIds(ids, MAX_SHARE)
  if (!selected.length) return { title: '带狗出门，一起找个好去处', path: ROOT + 'index', query: '' }
  const query = 'ids=' + selected.join('.')
  return { title: `一起带狗出门 · ${selected.length} 个想去的地方`, path: ROOT + 'saved?' + query, query }
}
function navigate(page, query = '', redirect = false) {
  const api = storage()
  api[redirect ? 'redirectTo' : 'navigateTo']({ url: ROOT + page + (query ? '?' + query : ''), fail: () => api.showToast({ title: '页面暂时无法打开，请重试', icon: 'none' }) })
}
function showShareMenu() { if (storage() && storage().showShareMenu) storage().showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] }) }
module.exports = { catalog, CATEGORIES, FILTERS, MAX_SHARE, STATUS, getPlace, cleanIds, favorites, toggleFavorite, validCity, initialCity, rememberCity, cityOptions, category, card, policyRows, queryPlaces, sharedIds, listShare, navigate, showShareMenu }
