// 每只宠物拥有独立的本机档案、同步队列和权限；账号级设置不随宠物切换。
const VERSION_KEY = 'paw_pet_spaces_v1'
const ACTIVE_KEY = 'paw_active_pet_v1'
const LIST_KEY = 'paw_pet_list_v1'
const PET_KEYS = [
  'paw_pet', 'paw_feeds', 'paw_diaries', 'paw_chats', 'paw_stools',
  'paw_care_schedule', 'paw_care_records', 'paw_supply_records', 'paw_water_records',
  'paw_walk_records', 'paw_weight_records', 'paw_growth_photos', 'paw_family_members',
  'paw_generated_avatar', 'paw_avatar_generation_status', 'paw_feed_goal', 'paw_water_goal',
  'paw_share_status', 'paw_cloud_sync_status', 'paw_pending_sync_v1',
  'paw_fun_quiz_v1_real_cat', 'paw_fun_quiz_v1_real_dog',
  'paw_record_defaults_feed', 'paw_record_defaults_water', 'paw_record_defaults_stool', 'paw_record_defaults_walk'
]
let initialized = false
let generation = 0
let operations = 0
function keyFor(key, scope) { return `paw_pet_space:${scope}:${key}` }
function initialize() {
  if (initialized) return
  if (!wx.getStorageSync(VERSION_KEY)) {
    const previous = wx.getStorageSync('paw_share_status') || {}
    // 老版本最后打开的是共享宠物时，只把这份缓存归到该共享宠物。
    // 原始键保留作为迁移备份，自己的档案由独立云端范围恢复。
    const scope = previous.shared && previous.role !== 'owner' && previous.groupId ? previous.groupId : 'personal'
    const keys = new Set((wx.getStorageInfoSync && wx.getStorageInfoSync().keys) || [])
    PET_KEYS.filter(key => key !== 'paw_pending_sync_v1').forEach(key => {
      const value = wx.getStorageSync(key)
      if (keys.has(key) || (value !== '' && value !== undefined && value !== null)) wx.setStorageSync(keyFor(key, scope), value)
    })
    const queue = wx.getStorageSync('paw_pending_sync_v1') || {}
    const queues = {}
    Object.keys(queue).forEach(key => {
      const item = queue[key]
      if (!item || typeof item !== 'object') return
      const target = item.scope === previous.groupId && previous.role === 'owner' ? 'personal' : item.scope || scope
      if (!queues[target]) queues[target] = {}
      queues[target][key] = { ...item, scope: target }
    })
    Object.keys(queues).forEach(target => wx.setStorageSync(keyFor('paw_pending_sync_v1', target), queues[target]))
    wx.setStorageSync(ACTIVE_KEY, 'personal')
    wx.setStorageSync(VERSION_KEY, true)
  }
  initialized = true
}
function current() { initialize(); return wx.getStorageSync(ACTIVE_KEY) || 'personal' }
function storageKey(key, scope = current()) { return keyFor(key, scope) }
function select(scope) {
  initialize()
  if (typeof scope !== 'string' || !scope || scope.length > 128) throw new Error('宠物档案无效')
  if (scope !== current()) { wx.setStorageSync(ACTIVE_KEY, scope); generation++ }
}
function capture() { return { scope: current(), generation, mode: wx.getStorageSync('paw_data_mode') } }
function isCurrent(context) { return context.scope === current() && context.generation === generation && context.mode === wx.getStorageSync('paw_data_mode') }
function assertCurrent(context) { if (!isCurrent(context)) throw new Error('宠物已切换，请在当前宠物中重新操作') }
function beginOperation() { operations++; let ended = false; return () => { if (!ended) { ended = true; operations-- } } }
function isBusy() { return operations > 0 }
function getProfiles() { const items = wx.getStorageSync(LIST_KEY); return Array.isArray(items) ? items : [] }
function saveProfiles(items) { wx.setStorageSync(LIST_KEY, Array.isArray(items) ? items : []) }
module.exports = { initialize, current, select, storageKey, capture, isCurrent, assertCurrent, beginOperation, isBusy, getProfiles, saveProfiles }
