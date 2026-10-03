const assert = require('assert')
const path = require('path')
const data = new Map()
let failWrite = false
const calls = { toast: [], navigation: [], clipboard: [] }
global.wx = {
  getStorageSync: key => data.get(key),
  setStorageSync(key, value) { if (failWrite) throw new Error('quota'); data.set(key, value) },
  showToast: value => calls.toast.push(value),
  setNavigationBarTitle() {}, showShareMenu() {}, pageScrollTo() {},
  navigateTo: value => calls.navigation.push(value), redirectTo: value => calls.navigation.push(value),
  setClipboardData: value => calls.clipboard.push(value.data)
}
const model = require('../packages/outings/model')
function page(name, options = {}) {
  let definition
  global.Page = value => { definition = value }
  const file = require.resolve('../packages/outings/' + name)
  delete require.cache[file]; require(file)
  const instance = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value) { Object.assign(this.data, value) } }
  instance.onLoad(options)
  if (instance.onShow) instance.onShow()
  return instance
}
const event = (key, value) => ({ currentTarget: { dataset: { [key]: value } } })

const ids = model.catalog.places.map(p => p.id)
assert.strictEqual(new Set(ids).size, ids.length)
assert.ok(model.catalog.places.length > 0)
for (const p of model.catalog.places) {
  assert.ok(model.validCity(p.city))
  assert.strictEqual(p.verifiedAt, null)
  assert.ok(p.sources.every(s => /^https:\/\/www\.xiaohongshu\.com\/explore\/[a-f0-9]{24}$/.test(s.url)))
}
for (const city of model.catalog.cities) assert.strictEqual(city.count, model.catalog.places.filter(p => p.city === city.name).length)
const inf = model.catalog.places.find(p => p.name === 'Inf coffee')
assert.ok(model.queryPlaces({ city: '青岛市', query: '太平角 33' }).some(p => p.id === inf.id))
assert.strictEqual(model.queryPlaces({ city: '济南市', query: 'Inf coffee' }).length, 0)
assert.strictEqual(model.queryPlaces({ city: '青岛市', categoryId: 'stay', query: 'Inf coffee' }).length, 0)
const chembox = model.catalog.places.find(p => p.name === 'CHEMBOX（五大道店）')
assert.ok(model.queryPlaces({ city: '天津市', filters: ['indoor'] }).some(p => p.id === chembox.id))
assert.ok(!model.queryPlaces({ city: '天津市', filters: ['indoor', 'large'] }).some(p => p.id === chembox.id))
const park = model.catalog.places.find(p => p.name === '大华朗香公园')
assert.strictEqual(park.policy.reservation, 'unknown', '无需预约 must not become 需预约')
const stroller = model.catalog.places.find(p => p.name === 'pakupaku')
assert.strictEqual(stroller.policy.stroller, 'used', 'Author using a stroller is not a merchant requirement')
assert.ok(model.queryPlaces({ city: '石家庄市', filters: ['stroller'] }).some(p => p.id === stroller.id))
const refused = model.catalog.places.find(p => p.name === '龙歌（雨花万象店）')
assert.strictEqual(refused.status, 'denied', 'A documented refusal must remain visible as a refusal')
const restricted = model.catalog.places.find(p => p.name === 'Shake Shack（天环）')
assert.strictEqual(restricted.policy.indoor, 'no')
assert.ok(!model.queryPlaces({ city: restricted.city, filters: ['indoor'] }).some(p => p.id === restricted.id))
for (const city of model.cityOptions()) for (const filter of model.FILTERS) {
  assert.ok(model.queryPlaces({ city: city.name, filters: [filter.id] }).every(p => p.status === 'pending' && filter.values.includes(p.policy[filter.id])))
}
assert.strictEqual(model.getPlace('__proto__'), null)
assert.deepStrictEqual(model.sharedIds('x'.repeat(400)), [])
assert.deepStrictEqual(model.sharedIds(ids[0] + '.' + ids[0] + '.bad'), [ids[0]])
assert.strictEqual(model.sharedIds(ids.slice(0, 20).join('.')).length, model.MAX_SHARE)
const share = model.listShare([inf.id, chembox.id])
assert.deepStrictEqual(model.sharedIds(share.query.slice(4)), [inf.id, chembox.id])
assert.ok(share.path.length < 500)
data.set('paw_outing_favorites_v1', 'corrupt')
assert.deepStrictEqual(model.favorites(), [])
assert.ok(model.toggleFavorite(inf.id).saved)
assert.deepStrictEqual(model.favorites(), [inf.id])
failWrite = true
assert.strictEqual(model.toggleFavorite(inf.id).ok, false)
assert.deepStrictEqual(model.favorites(), [inf.id])
failWrite = false
assert.strictEqual(model.toggleFavorite(inf.id).saved, false)
assert.deepStrictEqual(model.favorites(), [])

const index = page('index', { city: '青岛市', category: 'all' })
index.search({ detail: { value: '太平角' } }); index.searchNow()
assert.ok(index.data.rows.some(r => r.id === inf.id))
index.toggleSaved(event('id', inf.id))
assert.strictEqual(index.data.favoriteCount, 1)
index.chooseCity(event('city', '唐山市'))
assert.strictEqual(index.data.total, 0)
assert.strictEqual(index.data.cityCount, 0)
assert.strictEqual(model.initialCity(), '唐山市')
index.emptyAction(); assert.strictEqual(index.data.cityOpen, true)
index.searchCity({ detail: { value: '山东' } })
assert.ok(index.data.cityOptions.every(c => c.province === '山东省'))
index.chooseCity(event('city', '天津市')); index.openFilters()
index.toggleFilter(event('id', 'indoor')); index.applyFilters()
assert.ok(index.data.rows.some(r => r.id === chembox.id))
assert.strictEqual(index.data.filterCount, 1)
index.chooseCategory(event('id', 'stay'))
assert.strictEqual(index.data.total, 0)
index.resetFilters(); assert.ok(index.data.total > 0)
index.onUnload()

const detail = page('detail', { id: inf.id })
assert.ok(detail.data.saved)
detail.copyAddress(); assert.ok(calls.clipboard.pop().includes('33'))
detail.copySource(event('id', inf.sources[0].noteId)); assert.strictEqual(calls.clipboard.pop(), inf.sources[0].url)
assert.ok(detail.onShareAppMessage().path.endsWith(inf.id))
const missing = page('detail', { id: 'not-a-place' })
assert.strictEqual(missing.data.place, null)
missing.copyAddress(); missing.toggleSaved()

const saved = page('saved')
assert.strictEqual(saved.data.total, 1)
saved.toggleSelection(event('id', inf.id))
assert.ok(saved.onShareAppMessage().path.includes(inf.id))
const shared = page('saved', { ids: inf.id + '.' + chembox.id + '.invalid' })
assert.strictEqual(shared.data.shared, true)
assert.strictEqual(shared.data.total, 2)
assert.strictEqual(shared.data.missingCount, 1)
assert.deepStrictEqual(model.favorites(), [inf.id], 'Opening a shared list must not change local favorites')
shared.toggleSaved(event('id', inf.id))
assert.strictEqual(shared.data.total, 2, 'Unsave must not remove a venue from the shared list')
assert.deepStrictEqual(model.favorites(), [])
assert.strictEqual(page('saved', { ids: '' }).data.total, 0)
assert.strictEqual(page('saved', { ids: 'invalid' }).data.total, 0)
data.set('paw_outing_favorites_v1', ids.slice(0, 13))
const large = page('saved')
large.selectAll(); assert.strictEqual(large.data.selectedCount, 0)
ids.slice(0, 13).forEach(id => large.toggleSelection(event('id', id)))
assert.strictEqual(large.data.selectedCount, 12)
large.toggleSaved(event('id', ids[0])); assert.strictEqual(large.data.selectedCount, 11)
console.log('✓ 城市搜索、筛选未知值、拒绝记录、收藏失败、详情、失效链接、分享隔离及 12 项上限通过')
