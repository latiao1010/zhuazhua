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

function seedAndSyncSixMonthDemo() {
  if (!cloud.isAvailable()) return Promise.resolve({ ok: false, skipped: true })
  if (seedPromise) return seedPromise
  setStatus('syncing')
  seedPromise = cloud.callFunction('pet-data', {
    action: 'seedSixMonthDemoData',
    data: snapshotLocalData()
  }).then(result => {
    applyRemoteData(result.data)
    setShareStatus(result.share)
    setStatus('success', { keys: Object.keys(result.data || {}) })
    seedPromise = null
    return result
  }).catch(error => {
    const message = error.message || String(error)
    setStatus('fail', { error: message })
    seedPromise = null
    return { ok: false, error: message }
  })
  return seedPromise
}

function syncAll() {
  if (!cloud.isAvailable()) return Promise.resolve({ ok: false, skipped: true })
  return cloud.callFunction('pet-data', { action: 'getAllData' }).then(result => {
    applyRemoteData(result.data)
    setShareStatus(result.share)
    return result
  }).catch(error => ({ ok: false, error: error.message || String(error) }))
}

function saveKey(key, value) {
  if (syncing || !DATA_KEYS.includes(key) || !cloud.isAvailable()) return Promise.resolve({ ok: false, skipped: true })
  return cloud.callFunction('pet-data', { action: 'setDataItem', key, value })
    .catch(error => ({ ok: false, error: error.message || String(error) }))
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

module.exports = { DATA_KEYS, seedAndSyncSixMonthDemo, syncAll, saveKey, syncBreedKnowledge, getLocalBreedKnowledge, createShareInvitation, acceptShareInvitation, getShareStatus, isReadOnly }
