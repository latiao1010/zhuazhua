const cloud = require('./cloud')
const store = require('./store')

const DATA_KEYS = [
  'pet', 'feeds', 'diaries', 'chats', 'stools', 'waters', 'walks',
  'care', 'careRecords', 'supplies', 'weightRecords', 'growthPhotos',
  'familyMembers', 'generatedAvatar', 'avatarGenerationStatus', 'feedGoal', 'waterGoal'
]

const STATUS_KEY = 'paw_cloud_sync_status'
const SHARE_STATUS_KEY = 'paw_share_status'
const BREED_KNOWLEDGE_CHECK_INTERVAL = 24 * 60 * 60 * 1000
let syncing = false
let seedPromise = null
let breedSyncPromise = null

function setStatus(status, detail = {}) {
  try {
    wx.setStorageSync(STATUS_KEY, {
      status,
      ...detail,
      updatedAt: Date.now()
    })
  } catch (error) {}
}

function setShareStatus(share = {}) {
  try {
    wx.setStorageSync(SHARE_STATUS_KEY, {
      shared: !!share.shared,
      groupId: share.groupId || '',
      role: share.role || 'owner',
      updatedAt: Date.now()
    })
  } catch (error) {}
}

function getShareStatus() {
  try {
    const status = wx.getStorageSync(SHARE_STATUS_KEY)
    if (store.isDemoMode && store.isDemoMode()) return { shared: false, role: 'owner' }
    return status && typeof status === 'object' ? status : { shared: false, role: 'owner' }
  } catch (error) {
    return { shared: false, role: 'owner' }
  }
}

function isReadOnly() {
  const status = getShareStatus()
  return status.shared && status.role === 'viewer'
}

function snapshotLocalData() {
  const data = {}
  DATA_KEYS.forEach(key => { data[key] = store.get(key) })
  return data
}

function applyRemoteData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return
  syncing = true
  try {
    DATA_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        store.set(key, data[key], { skipCloud: true })
      }
    })
  } finally {
    syncing = false
  }
}

// 保留旧调用入口以兼容各页面；正式模式仅同步，绝不灌入演示数据。
function seedAndSyncSixMonthDemo() { return syncAll() }

const QUEUE_KEY = 'paw_pending_sync_v1'
const RECORD_KEYS = new Set(['feeds', 'diaries', 'stools', 'waters', 'walks', 'careRecords', 'weightRecords'])
let flushPromise = null
const localRevisions = {}
function pendingWrites() {
  const saved = wx.getStorageSync(QUEUE_KEY)
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
}
function hasPendingForKey(queue, key) {
  return !!queue[key] || Object.keys(queue).some(queueKey => queue[queueKey] && queue[queueKey].type === 'record' && queue[queueKey].key === key)
}
function getSyncStatus() {
  if (store.isDemoMode && store.isDemoMode()) return { status: 'demo', pending: 0 }
  return { ...(wx.getStorageSync(STATUS_KEY) || {}), pending: Object.keys(pendingWrites()).length }
}
function discardPendingAndSync() {
  wx.setStorageSync(QUEUE_KEY, {})
  setStatus('pending')
  return syncAll()
}
function previewRemoteChanges() {
  if (store.isDemoMode && store.isDemoMode()) return Promise.resolve({ ok: true, changes: [] })
  if (!cloud.isAvailable()) return Promise.resolve({ ok: false, changes: [], error: '当前网络不可用' })
  return cloud.callFunction('pet-data', { action: 'getAllData' }).then(result => {
    const changes = []
    const labels = { feeds:'喂食', diaries:'日记', stools:'排便', waters:'饮水', walks:'散步', careRecords:'护理', weightRecords:'体重' }
    RECORD_KEYS.forEach(key => {
      const local = new Map((store.get(key) || []).filter(item => item && item.id != null).map(item => [String(item.id), item]))
      const remote = new Map(((result.data && result.data[key]) || []).filter(item => item && item.id != null).map(item => [String(item.id), item]))
      remote.forEach((record, id) => {
        const before = local.get(id)
        if (before && JSON.stringify(before) === JSON.stringify(record)) return
        changes.push({ key, recordId:id, type:before ? 'updated' : 'added', typeText:before ? '修改' : '新增', label:labels[key], actor:record.recordedByName || '家庭成员', role:record.recordedByRole === 'owner' ? '主人' : record.recordedByRole === 'admin' ? '共同照护' : '', time:Number(record._syncUpdatedAt) || 0, localValue:before || null, remoteValue:record })
      })
      local.forEach((record, id) => {
        if (!remote.has(id) && record._syncUpdatedAt) changes.push({ key, recordId:id, type:'deleted', typeText:'删除', label:labels[key], actor:'家庭成员', role:'', time:0, localValue:record, remoteValue:null })
      })
    })
    ;[['pet','宠物资料'],['care','护理计划'],['supplies','用品余量'],['feedGoal','喂食目标'],['waterGoal','饮水目标']].forEach(([key,label]) => {
      if (!result.data || !Object.prototype.hasOwnProperty.call(result.data,key)) return
      const localValue=store.get(key), remoteValue=result.data[key]
      if (JSON.stringify(localValue) !== JSON.stringify(remoteValue)) changes.push({ key, recordId:`whole-${key}`, whole:true, type:'updated', typeText:'修改', label, actor:'家庭成员', role:'', time:0, localValue, remoteValue })
    })
    return { ok:true, changes:changes.sort((a,b)=>b.time-a.time), share:result.share }
  }).catch(error => ({ ok:false, changes:[], error:error.message || String(error) }))
}
function applyRemoteChanges(changes = []) {
  const queue = pendingWrites()
  const applied = [], skipped = []
  syncing = true
  try {
    changes.forEach(change => {
      if (!change || hasPendingForKey(queue, change.key)) { skipped.push(change); return }
      if (change.whole) {
        store.set(change.key, change.remoteValue, { skipCloud:true })
      } else {
        const records = store.get(change.key)
        const id = String(change.recordId)
        const next = change.type === 'deleted'
          ? records.filter(item => String(item.id) !== id)
          : [change.remoteValue, ...records.filter(item => String(item.id) !== id)]
        store.set(change.key, next, { skipCloud:true })
      }
      applied.push(change)
    })
  } finally { syncing = false }
  setStatus(skipped.length ? 'pending' : 'success')
  return Promise.resolve({ ok:!skipped.length, applied:applied.length, skipped:skipped.length })
}
function retryPending() {
  if (store.isDemoMode && store.isDemoMode()) return Promise.resolve({ ok: true, skipped: true })
  if (flushPromise) return flushPromise
  if (!cloud.isAvailable()) { setStatus('pending'); return Promise.resolve({ ok: false, skipped: true }) }
  flushPromise = (async () => {
    try {
      setStatus('syncing')
      while (Object.keys(pendingWrites()).length) {
        const queue = pendingWrites()
        const key = Object.keys(queue)[0]
        const item = queue[key]
        if (item.scope !== (getShareStatus().groupId || 'personal')) throw new Error('共享范围已变化，请先处理未同步记录')
        if (item.type === 'record') {
          await cloud.callFunction('pet-data', {
            action: 'mutateDataRecord', key: item.key, operation: item.operation,
            record: item.record, recordId: item.recordId, mutationId: item.version,
            baseUpdatedAt: Number(item.baseUpdatedAt) || 0
          })
        } else {
          await cloud.callFunction('pet-data', { action: 'setDataItem', key, value: item.value })
        }
        const latest = pendingWrites()
        if (latest[key] && latest[key].version === item.version) delete latest[key]
        wx.setStorageSync(QUEUE_KEY, latest)
      }
      setStatus('success')
      return { ok: true }
    } catch (error) {
      const message = error.message || String(error)
      setStatus(/已被其他成员修改|只能修改或删除自己/.test(message) ? 'conflict' : 'fail', { error: message })
      return { ok: false, error: error.message || String(error) }
    } finally { flushPromise = null }
  })()
  return flushPromise
}
function syncAll() {
  if (store.isDemoMode && store.isDemoMode()) return Promise.resolve({ ok: true, skipped: true })
  if (seedPromise) return seedPromise
  if (!cloud.isAvailable()) return Promise.resolve({ ok: false, skipped: true })
  seedPromise = (async () => {
    try {
      const flushed = await retryPending()
      if (!flushed.ok) return flushed
      setStatus('syncing')
      const before = { ...localRevisions }
      const result = await cloud.callFunction('pet-data', { action: 'getAllData' })
      const pending = pendingWrites()
      const safeData = { ...result.data }
      DATA_KEYS.forEach(key => { if (hasPendingForKey(pending, key) || before[key] !== localRevisions[key]) delete safeData[key] })
      applyRemoteData(safeData)
      setShareStatus(result.share)
      setStatus(Object.keys(pending).length ? 'pending' : 'success')
      return result
    } catch (error) {
      setStatus('fail', { error: error.message || String(error) })
      return { ok: false, error: error.message || String(error) }
    } finally { seedPromise = null }
  })()
  return seedPromise
}
function syncOnResume() {
  const share = getShareStatus()
  if (share.shared && share.role === 'owner') return retryPending()
  return syncAll()
}
function saveKey(key, value, context = {}) {
  if (syncing || !DATA_KEYS.includes(key) || (store.isDemoMode && store.isDemoMode())) return Promise.resolve({ ok: true, skipped: true })
  localRevisions[key] = (localRevisions[key] || 0) + 1
  const queue = pendingWrites()
  const scope = getShareStatus().groupId || 'personal'
  if (RECORD_KEYS.has(key) && Array.isArray(value)) {
    const previous = Array.isArray(context.previousValue) ? context.previousValue : []
    const before = new Map(previous.filter(item => item && item.id).map(item => [String(item.id), item]))
    const after = new Map(value.filter(item => item && item.id).map(item => [String(item.id), item]))
    after.forEach((record, recordId) => {
      const old = before.get(recordId)
      if (old && JSON.stringify(old) === JSON.stringify(record)) return
      const version = `${Date.now()}-${Math.random()}`
      queue[`record:${key}:${recordId}`] = { type: 'record', key, operation: old ? 'update' : 'upsert', record, recordId, baseUpdatedAt: Number(old && old._syncUpdatedAt) || 0, version, scope }
    })
    before.forEach((record, recordId) => {
      if (after.has(recordId)) return
      const version = `${Date.now()}-${Math.random()}`
      queue[`record:${key}:${recordId}`] = { type: 'record', key, operation: 'delete', recordId, baseUpdatedAt: Number(record._syncUpdatedAt) || 0, version, scope }
    })
  } else {
    queue[key] = { value, version: `${Date.now()}-${Math.random()}`, scope }
  }
  wx.setStorageSync(QUEUE_KEY, queue)
  setStatus('pending')
  return retryPending()
}

function getLocalBreedKnowledge() {
  return store.get('externalBreedKnowledge')
}

function applyBreedKnowledge(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.items)) return
  try {
    wx.setStorageSync(store.KEYS.externalBreedKnowledge, {
      version: data.version || 'external-breed-v1',
      updatedAt: Number(data.updatedAt) || Date.now(),
      sources: Array.isArray(data.sources) ? data.sources : ['TheDogAPI', 'TheCatAPI'],
      dogCount: Number(data.dogCount) || 0,
      catCount: Number(data.catCount) || 0,
      items: data.items
    })
    wx.setStorageSync(store.KEYS.externalBreedKnowledgeCheckedAt, Date.now())
  } catch (error) {}
}

function shouldCheckBreedKnowledge(force) {
  if (force) return true
  try {
    const checkedAt = Number(wx.getStorageSync(store.KEYS.externalBreedKnowledgeCheckedAt)) || 0
    return Date.now() - checkedAt >= BREED_KNOWLEDGE_CHECK_INTERVAL
  } catch (error) {
    return true
  }
}

function syncBreedKnowledge(options = {}) {
  const force = !!options.force
  if (!cloud.isAvailable()) return Promise.resolve({ ok: false, skipped: true, data: getLocalBreedKnowledge() })
  if (!shouldCheckBreedKnowledge(force)) return Promise.resolve({ ok: true, skipped: true, data: getLocalBreedKnowledge() })
  if (breedSyncPromise && !force) return breedSyncPromise

  breedSyncPromise = cloud.callFunction('pet-data', {
    action: 'getBreedKnowledge',
    force
  }).then(result => {
    applyBreedKnowledge(result && result.data)
    return result
  }).catch(error => ({ ok: false, error: error.message || String(error), data: getLocalBreedKnowledge() }))
    .then(result => {
      breedSyncPromise = null
      return result
    })
  return breedSyncPromise
}

function createShareInvitation(payload = {}) {
  if (!cloud.isAvailable()) return Promise.resolve({ ok: false, skipped: true })
  return cloud.callFunction('pet-data', {
    action: 'createShareInvitation',
    petName: payload.petName || '',
    code: payload.code || ''
  }).then(result => {
    if (result && result.groupId) setShareStatus({ shared: true, groupId: result.groupId, role: 'owner' })
    return result
  }).catch(error => ({ ok: false, error: error.message || String(error) }))
}

function acceptShareInvitation(code, profile = {}) {
  if (Object.keys(pendingWrites()).length) return Promise.resolve({ ok: false, error: '请先同步当前档案，再加入家庭共享' })
  if (!cloud.isAvailable()) return Promise.resolve({ ok: false, skipped: true, error: 'cloud_unavailable' })
  setStatus('syncing')
  return cloud.callFunction('pet-data', {
    action: 'acceptShareInvitation',
    code,
    profile
  }).then(result => {
    applyRemoteData(result.data)
    setShareStatus(result.share)
    setStatus('success', { share: result.share || {} })
    return result
  }).catch(error => {
    const message = error.message || String(error)
    setStatus('fail', { error: message })
    return { ok: false, error: message }
  })
}

module.exports = { getSyncStatus, retryPending, discardPendingAndSync, previewRemoteChanges, applyRemoteChanges, syncOnResume, DATA_KEYS, RECORD_KEYS, seedAndSyncSixMonthDemo, syncAll, saveKey, syncBreedKnowledge, getLocalBreedKnowledge, createShareInvitation, acceptShareInvitation, getShareStatus, isReadOnly }
