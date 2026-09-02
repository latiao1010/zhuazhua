const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION = 'growth_photos'
const DATA_COLLECTION = 'pet_data'
const SHARE_GROUP_COLLECTION = 'pet_share_groups'
const SHARE_MEMBER_COLLECTION = 'pet_share_members'
const SHARE_INVITE_COLLECTION = 'pet_share_invites'
const EXTERNAL_KNOWLEDGE_COLLECTION = 'pet_external_knowledge'
// 必须和 utils/store.js 的 SIX_MONTH_DEMO_VERSION 保持一致。
// 不一致时云端会认为「已播种且完整」，把旧数据回灌覆盖客户端刚生成的新数据。
const DEMO_VERSION = 'eight-month-v1'
const META_KEY = '__demo_version'
const BREED_KNOWLEDGE_KEY = 'breedKnowledge'
const BREED_SYNC_INTERVAL = 7 * 24 * 60 * 60 * 1000
const DOG_BREEDS_URL = 'https://api.thedogapi.com/v1/breeds'
const CAT_BREEDS_URL = 'https://api.thecatapi.com/v1/breeds'
const DATA_KEYS = new Set([
  'pet', 'feeds', 'diaries', 'chats', 'stools', 'waters', 'walks',
  'care', 'careRecords', 'supplies', 'weightRecords', 'growthPhotos',
  'familyMembers', 'generatedAvatar', 'avatarGenerationStatus', 'feedGoal', 'waterGoal'
])
const OWNER_ONLY_KEYS = new Set(['familyMembers'])

const BREED_ALIAS_RULES = [
  { cn: ['柯基'], en: ['Pembroke Welsh Corgi', 'Cardigan Welsh Corgi', 'Corgi'] },
  { cn: ['金毛', '金毛寻回犬'], en: ['Golden Retriever'] },
  { cn: ['拉布拉多', '拉拉'], en: ['Labrador Retriever'] },
  { cn: ['贵宾', '泰迪'], en: ['Poodle'] },
  { cn: ['柴犬'], en: ['Shiba Inu'] },
  { cn: ['边牧', '边境牧羊犬'], en: ['Border Collie'] },
  { cn: ['哈士奇', '二哈'], en: ['Siberian Husky'] },
  { cn: ['萨摩耶'], en: ['Samoyed'] },
  { cn: ['博美'], en: ['Pomeranian'] },
  { cn: ['比熊'], en: ['Bichon Frise'] },
  { cn: ['雪纳瑞'], en: ['Miniature Schnauzer', 'Standard Schnauzer', 'Giant Schnauzer'] },
  { cn: ['法斗', '法国斗牛犬'], en: ['French Bulldog'] },
  { cn: ['英斗', '英国斗牛犬'], en: ['Bulldog'] },
  { cn: ['德牧', '德国牧羊犬'], en: ['German Shepherd Dog'] },
  { cn: ['阿拉斯加'], en: ['Alaskan Malamute'] },
  { cn: ['英短', '英国短毛猫'], en: ['British Shorthair'] },
  { cn: ['美短', '美国短毛猫'], en: ['American Shorthair'] },
  { cn: ['布偶', '布偶猫'], en: ['Ragdoll'] },
  { cn: ['暹罗'], en: ['Siamese'] },
  { cn: ['缅因'], en: ['Maine Coon'] },
  { cn: ['波斯'], en: ['Persian'] },
  { cn: ['加菲', '异国短毛猫'], en: ['Exotic Shorthair'] },
  { cn: ['无毛猫', '斯芬克斯'], en: ['Sphynx'] },
  { cn: ['狸花', '中华狸花'], en: ['Chinese Li Hua'] }
]

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function inviteCode(value) {
  const cleaned = cleanText(value, 32).toUpperCase().replace(/[^A-Z0-9-]/g, '')
  return cleaned
}

function generateInviteCode() {
  return `ZZ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

function normalizePhoto(item) {
  const path = cleanText(item && item.path, 1000)
  const dayKey = cleanText(item && item.dayKey, 10)
  const time = cleanText(item && item.time, 5)
  const createdAt = Number(item && item.createdAt)
  if (!path.startsWith('cloud://')) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null
  if (time && !/^\d{2}:\d{2}$/.test(time)) return null
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null
  return { path, dayKey, time, createdAt }
}

async function ensureCollection() {
  await ensureNamedCollection(COLLECTION)
}

async function ensureDataCollection() {
  await ensureNamedCollection(DATA_COLLECTION)
}

async function ensureShareCollections() {
  await ensureNamedCollection(SHARE_GROUP_COLLECTION)
  await ensureNamedCollection(SHARE_MEMBER_COLLECTION)
  await ensureNamedCollection(SHARE_INVITE_COLLECTION)
}

async function ensureExternalKnowledgeCollection() {
  await ensureNamedCollection(EXTERNAL_KNOWLEDGE_COLLECTION)
}

async function ensureNamedCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    if (typeof db.createCollection !== 'function') throw error
    try { await db.createCollection(name) } catch (createError) {
      if (!/exist|已存在/i.test(String(createError && createError.message || createError))) throw createError
    }
  }
}

function apiHeaders(source) {
  const headers = { 'User-Agent': 'zhuazhua-pet-mini-program/1.0' }
  if (source === 'dog' && process.env.THEDOGAPI_KEY) headers['x-api-key'] = process.env.THEDOGAPI_KEY
  if (source === 'cat' && process.env.THECATAPI_KEY) headers['x-api-key'] = process.env.THECATAPI_KEY
  return headers
}

function fetchJson(url, source) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: apiHeaders(source), timeout: 15000 }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`fetch_${source}_breeds_${response.statusCode}`))
          return
        }
        try {
          resolve(JSON.parse(body))
        } catch (error) {
          reject(new Error(`parse_${source}_breeds_failed`))
        }
      })
    })
    request.on('timeout', () => {
      request.destroy(new Error(`fetch_${source}_breeds_timeout`))
    })
    request.on('error', reject)
  })
}

function aliasesForBreed(name) {
  const text = String(name || '').toLowerCase()
  return BREED_ALIAS_RULES
    .filter(rule => rule.en.some(item => text.includes(String(item).toLowerCase())) || rule.cn.some(item => text.includes(String(item).toLowerCase())))
    .flatMap(rule => rule.cn)
}

function listFromCommaText(value, limit = 8) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeDogBreed(item) {
  const name = cleanText(item && item.name, 80)
  if (!name) return null
  const temperament = listFromCommaText(item.temperament)
  const bredFor = cleanText(item.bred_for, 160)
  const breedGroup = cleanText(item.breed_group, 80)
  return {
    id: `dog-${cleanText(item.id, 32) || name}`,
    species: 'dog',
    source: 'TheDogAPI',
    name,
    aliases: aliasesForBreed(name),
    temperament,
    lifeSpan: cleanText(item.life_span, 40),
    weight: cleanText(item.weight && item.weight.metric, 40),
    height: cleanText(item.height && item.height.metric, 40),
    origin: cleanText(item.origin || item.country_code, 80),
    breedGroup,
    summary: [breedGroup ? `犬组：${breedGroup}` : '', bredFor ? `原始用途：${bredFor}` : '', temperament.length ? `常见性格：${temperament.slice(0, 5).join('、')}` : ''].filter(Boolean).join('；'),
    careTags: [breedGroup, bredFor].filter(Boolean).slice(0, 4)
  }
}

function normalizeCatBreed(item) {
  const name = cleanText(item && item.name, 80)
  if (!name) return null
  const temperament = listFromCommaText(item.temperament)
  return {
    id: `cat-${cleanText(item.id, 32) || name}`,
    species: 'cat',
    source: 'TheCatAPI',
    name,
    aliases: aliasesForBreed(name),
    temperament,
    lifeSpan: cleanText(item.life_span, 40),
    weight: cleanText(item.weight && item.weight.metric, 40),
    origin: cleanText(item.origin, 80),
    summary: cleanText(item.description, 240) || (temperament.length ? `常见性格：${temperament.slice(0, 5).join('、')}` : ''),
    scores: {
      energy: Number(item.energy_level) || 0,
      grooming: Number(item.grooming) || 0,
      healthIssues: Number(item.health_issues) || 0,
      childFriendly: Number(item.child_friendly) || 0,
      dogFriendly: Number(item.dog_friendly) || 0,
      socialNeeds: Number(item.social_needs) || 0,
      vocalisation: Number(item.vocalisation) || 0
    },
    careTags: ['grooming', 'energy', 'socialNeeds'].filter(key => Number(item[key]) >= 4)
  }
}

function compactBreedKnowledge(dogBreeds, catBreeds) {
  const dogs = (Array.isArray(dogBreeds) ? dogBreeds : []).map(normalizeDogBreed).filter(Boolean)
  const cats = (Array.isArray(catBreeds) ? catBreeds : []).map(normalizeCatBreed).filter(Boolean)
  return {
    version: 'external-breed-v1',
    updatedAt: Date.now(),
    sources: ['TheDogAPI', 'TheCatAPI'],
    dogCount: dogs.length,
    catCount: cats.length,
    items: [...dogs, ...cats]
  }
}

async function latestBreedKnowledgeDoc() {
  await ensureExternalKnowledgeCollection()
  const page = await db.collection(EXTERNAL_KNOWLEDGE_COLLECTION)
    .where({ key: BREED_KNOWLEDGE_KEY })
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get()
  return (page.data || [])[0] || null
}

async function replaceBreedKnowledgeDoc(data) {
  await ensureExternalKnowledgeCollection()
  const existing = await db.collection(EXTERNAL_KNOWLEDGE_COLLECTION).where({ key: BREED_KNOWLEDGE_KEY }).limit(20).get()
  await Promise.all((existing.data || []).map(item => db.collection(EXTERNAL_KNOWLEDGE_COLLECTION).doc(item._id).remove().catch(() => null)))
  await db.collection(EXTERNAL_KNOWLEDGE_COLLECTION).add({
    data: {
      key: BREED_KNOWLEDGE_KEY,
      updatedAt: data.updatedAt,
      source: 'TheDogAPI+TheCatAPI',
      data
    }
  })
  return data
}

async function syncBreedKnowledge(force = false) {
  const current = await latestBreedKnowledgeDoc()
  if (!force && current && current.data && Date.now() - (Number(current.updatedAt) || 0) < BREED_SYNC_INTERVAL) {
    return { ok: true, skipped: true, data: current.data, updatedAt: current.updatedAt }
  }
  const [dogBreeds, catBreeds] = await Promise.all([
    fetchJson(DOG_BREEDS_URL, 'dog'),
    fetchJson(CAT_BREEDS_URL, 'cat')
  ])
  const data = compactBreedKnowledge(dogBreeds, catBreeds)
  await replaceBreedKnowledgeDoc(data)
  return { ok: true, synced: true, data, updatedAt: data.updatedAt }
}

async function getBreedKnowledge(force = false) {
  const current = await latestBreedKnowledgeDoc()
  if (force || !current || !current.data || Date.now() - (Number(current.updatedAt) || 0) >= BREED_SYNC_INTERVAL) {
    return await syncBreedKnowledge(force)
  }
  return { ok: true, data: current.data, updatedAt: current.updatedAt }
}

async function listGrowthPhotos(openid) {
  await ensureCollection()
  const scope = await getActiveScope(openid)
  const result = []
  const pageSize = 100
  const where = scope.shared ? { scopeId: scope.scopeId } : { _openid: openid }
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const page = await db.collection(COLLECTION)
      .where(where)
      .orderBy('createdAt', 'desc')
      .skip(offset)
      .limit(pageSize)
      .get()
    const rows = page.data || []
    rows.forEach(item => result.push({
      id: item._id,
      path: item.path,
      dayKey: item.dayKey,
      time: item.time || '',
      createdAt: Number(item.createdAt) || 0
    }))
    if (rows.length < pageSize) break
  }
  return { ok: true, photos: result }
}

async function addGrowthPhotos(openid, items) {
  await ensureCollection()
  const scope = await getActiveScope(openid)
  assertCanWrite(scope, 'growthPhotos')
  const photos = (Array.isArray(items) ? items : []).slice(0, 9).map(normalizePhoto).filter(Boolean)
  if (!photos.length) throw new Error('没有可保存的成长照片')
  const inserted = await Promise.all(photos.map(async photo => {
    const result = await db.collection(COLLECTION).add({ data: { ...photo, _openid: openid, scopeId: scope.scopeId, groupId: scope.groupId || '', ownerOpenid: scope.ownerOpenid || openid } })
    return { id: result._id, ...photo }
  }))
  return { ok: true, photos: inserted }
}

function samePhotoScope(photo, scope, openid) {
  if (!photo) return false
  if (scope.shared) return photo.scopeId === scope.scopeId
  return photo._openid === openid
}

async function deleteGrowthPhoto(openid, event = {}) {
  await ensureCollection()
  const scope = await getActiveScope(openid)
  assertCanWrite(scope, 'growthPhotos')
  const id = cleanText(event.id, 128)
  const path = cleanText(event.path, 1000)
  if (!id && !path) throw new Error('请选择要删除的成长照片')

  const targets = []
  if (id && !id.startsWith('growth-') && !id.startsWith('demo-')) {
    try {
      const doc = await db.collection(COLLECTION).doc(id).get()
      if (doc && doc.data && samePhotoScope(doc.data, scope, openid)) targets.push({ id, ...doc.data })
    } catch (error) {}
  }
  if (!targets.length && path) {
    const where = scope.shared ? { scopeId: scope.scopeId, path } : { _openid: openid, path }
    const page = await db.collection(COLLECTION).where(where).limit(20).get()
    ;(page.data || []).forEach(item => targets.push(item))
  }

  const unique = []
  const seen = new Set()
  targets.forEach(item => {
    const targetId = item._id || item.id
    if (!targetId || seen.has(targetId)) return
    seen.add(targetId)
    unique.push({ ...item, _id: targetId })
  })

  await Promise.all(unique.map(item => db.collection(COLLECTION).doc(item._id).remove().catch(() => null)))
  const fileList = [...new Set(unique.map(item => item.path).filter(item => /^cloud:\/\//.test(String(item || ''))))]
  if (fileList.length && typeof cloud.deleteFile === 'function') {
    await cloud.deleteFile({ fileList }).catch(() => null)
  }
  return { ok: true, deleted: unique.length }
}

function cleanKey(value) {
  const key = cleanText(value, 64)
  if (!DATA_KEYS.has(key)) throw new Error('不支持的数据模块')
  return key
}

function cleanDataMap(data) {
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  const result = {}
  DATA_KEYS.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key]
  })
  return result
}

async function listDataDocs(openid, extraWhere = {}) {
  await ensureDataCollection()
  const result = []
  const pageSize = 100
  const where = { _openid: openid, ...extraWhere }
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const page = await db.collection(DATA_COLLECTION)
      .where(where)
      .skip(offset)
      .limit(pageSize)
      .get()
    const rows = page.data || []
    rows.forEach(item => result.push(item))
    if (rows.length < pageSize) break
  }
  return result
}

async function removeDocs(docs) {
  await Promise.all((docs || []).map(item => db.collection(DATA_COLLECTION).doc(item._id).remove()))
}

async function listMemberDocs(openid) {
  await ensureShareCollections()
  const page = await db.collection(SHARE_MEMBER_COLLECTION)
    .where({ memberOpenid: openid, status: 'active' })
    .limit(20)
    .get()
  return page.data || []
}

async function getActiveScope(openid) {
  const memberships = await listMemberDocs(openid)
  if (memberships.length) {
    const member = memberships.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))[0]
    return {
      scopeId: `group:${member.groupId}`,
      groupId: member.groupId,
      role: member.role || 'admin',
      ownerOpenid: member.ownerOpenid || '',
      shared: true
    }
  }
  return { scopeId: `user:${openid}`, groupId: '', role: 'owner', ownerOpenid: openid, shared: false, legacy: true }
}

async function listScopedDataDocs(scope, extraWhere = {}) {
  await ensureDataCollection()
  if (scope.shared) {
    const result = []
    const pageSize = 100
    const where = { scopeId: scope.scopeId, ...extraWhere }
    for (let offset = 0; offset < 1000; offset += pageSize) {
      const page = await db.collection(DATA_COLLECTION).where(where).skip(offset).limit(pageSize).get()
      const rows = page.data || []
      rows.forEach(item => result.push(item))
      if (rows.length < pageSize) break
    }
    return result
  }
  return await listDataDocs(openidFromScope(scope), extraWhere)
}

function openidFromScope(scope) {
  return String(scope.scopeId || '').replace(/^user:/, '') || scope.ownerOpenid
}

async function replaceScopedDataItem(scope, actorOpenid, key, value, options = {}) {
  await ensureDataCollection()
  const now = Date.now()
  const existing = await listScopedDataDocs(scope, { key })
  await removeDocs(existing)
  await db.collection(DATA_COLLECTION).add({
    data: {
      _openid: actorOpenid,
      ownerOpenid: scope.ownerOpenid || actorOpenid,
      scopeId: scope.scopeId,
      groupId: scope.groupId || '',
      key,
      value,
      demo: !!options.demo,
      demoVersion: options.demoVersion || '',
      updatedAt: now
    }
  })
}

function assertCanWrite(scope, key) {
  if (!scope || !scope.shared) return
  if (scope.role === 'viewer') throw new Error('你当前是只读成员，不能修改该宠物档案')
  if (OWNER_ONLY_KEYS.has(key) && scope.role !== 'owner') throw new Error('只有主人可以管理家庭成员和权限')
}

async function replaceDataItem(openid, key, value, options = {}) {
  const scope = await getActiveScope(openid)
  assertCanWrite(scope, key)
  if (key === 'familyMembers' && scope.shared) await syncShareMembersFromValue(scope.groupId, value)
  await replaceScopedDataItem(scope, openid, key, value, options)
}

async function getAllData(openid) {
  const scope = await getActiveScope(openid)
  const docs = await listScopedDataDocs(scope)
  const data = {}
  docs.forEach(item => {
    if (DATA_KEYS.has(item.key) && !Object.prototype.hasOwnProperty.call(data, item.key)) {
      data[item.key] = item.value
    }
  })
  if (scope.shared) data.familyMembers = await listShareMembers(scope.groupId)
  return { ok: true, data, share: await getShareInfoForScope(scope) }
}

async function seedSixMonthDemoData(openid, data) {
  await ensureDataCollection()
  const scope = await getActiveScope(openid)
  if (scope.shared && scope.role === 'viewer') throw new Error('你当前是只读成员，不能初始化或覆盖共享档案')
  const existingDocs = await listScopedDataDocs(scope)
  const metaDocs = existingDocs.filter(item => item.key === META_KEY)
  const existingData = {}
  existingDocs.forEach(item => {
    if (DATA_KEYS.has(item.key) && !Object.prototype.hasOwnProperty.call(existingData, item.key)) existingData[item.key] = item.value
  })
  const seeded = metaDocs.some(item => item.value === DEMO_VERSION)
  const complete = isCompleteSixMonthData(existingData)
  if (!seeded || !complete) {
    const demoDocs = existingDocs.filter(item => item.demo === true)
    const demoIds = new Set(demoDocs.map(item => item._id))
    await removeDocs(demoDocs)
    const cleanData = cleanDataMap(data)
    await Promise.all(Object.keys(cleanData).map(key => replaceScopedDataItem(scope, openid, key, cleanData[key], { demo: true, demoVersion: DEMO_VERSION })))
    await removeDocs(metaDocs.filter(item => !demoIds.has(item._id)))
    await db.collection(DATA_COLLECTION).add({
      data: {
        _openid: openid,
        ownerOpenid: scope.ownerOpenid || openid,
        scopeId: scope.scopeId,
        groupId: scope.groupId || '',
        key: META_KEY,
        value: DEMO_VERSION,
        demo: true,
        demoVersion: DEMO_VERSION,
        updatedAt: Date.now()
      }
    })
  }
  return await getAllData(openid)
}

async function listShareMembers(groupId) {
  if (!groupId) return []
  await ensureShareCollections()
  const page = await db.collection(SHARE_MEMBER_COLLECTION)
    .where({ groupId, status: 'active' })
    .limit(100)
    .get()
  return (page.data || []).map(item => ({
    id: item._id,
    name: item.name || (item.role === 'owner' ? '我' : '家庭成员'),
    relation: item.relation || (item.role === 'owner' ? '主人' : '家人'),
    role: item.role || 'admin',
    roleLabel: item.role === 'owner' ? '主人' : item.role === 'viewer' ? '只读查看' : '共同照护',
    status: '已加入',
    joinedAt: item.joinedAt || '',
    lastActive: item.lastActive || ''
  }))
}

async function syncShareMembersFromValue(groupId, members) {
  if (!groupId || !Array.isArray(members)) return
  await ensureShareCollections()
  const currentPage = await db.collection(SHARE_MEMBER_COLLECTION)
    .where({ groupId, status: 'active' })
    .limit(100)
    .get()
  const current = currentPage.data || []
  const incomingById = {}
  members.forEach(item => {
    if (item && item.id) incomingById[item.id] = item
  })
  await Promise.all(current.map(item => {
    if (item.role === 'owner') return Promise.resolve()
    const incoming = incomingById[item._id] || incomingById[item.id]
    if (!incoming) {
      return db.collection(SHARE_MEMBER_COLLECTION).doc(item._id).update({
        data: { status: 'removed', updatedAt: Date.now() }
      })
    }
    const role = incoming.role === 'viewer' ? 'viewer' : 'admin'
    return db.collection(SHARE_MEMBER_COLLECTION).doc(item._id).update({
      data: {
        name: cleanText(incoming.name || item.name || '家庭成员', 16),
        relation: cleanText(incoming.relation || item.relation || '家人', 12),
        role,
        updatedAt: Date.now()
      }
    })
  }))
}

async function getShareInfoForScope(scope) {
  if (!scope || !scope.shared) return { shared: false }
  return {
    shared: true,
    groupId: scope.groupId,
    role: scope.role,
    members: await listShareMembers(scope.groupId)
  }
}

async function findOwnedGroup(openid) {
  await ensureShareCollections()
  const page = await db.collection(SHARE_GROUP_COLLECTION)
    .where({ ownerOpenid: openid, status: 'active' })
    .limit(1)
    .get()
  return (page.data || [])[0] || null
}

async function ensureOwnerMember(groupId, openid) {
  const existing = await db.collection(SHARE_MEMBER_COLLECTION)
    .where({ groupId, memberOpenid: openid })
    .limit(1)
    .get()
  const now = Date.now()
  if ((existing.data || []).length) {
    await db.collection(SHARE_MEMBER_COLLECTION).doc(existing.data[0]._id).update({
      data: { role: 'owner', status: 'active', updatedAt: now, lastActive: cleanText(new Date().toISOString().slice(0, 10), 10) }
    })
    return existing.data[0]._id
  }
  const result = await db.collection(SHARE_MEMBER_COLLECTION).add({
    data: {
      groupId,
      ownerOpenid: openid,
      memberOpenid: openid,
      name: '我',
      relation: '主人',
      role: 'owner',
      status: 'active',
      joinedAt: new Date().toISOString().slice(0, 10),
      lastActive: new Date().toISOString().slice(0, 10),
      createdAt: now,
      updatedAt: now
    }
  })
  return result._id
}

async function ensureOwnedGroup(openid, petName) {
  await ensureShareCollections()
  const existing = await findOwnedGroup(openid)
  if (existing) {
    await ensureOwnerMember(existing._id, openid)
    return existing
  }
  const now = Date.now()
  const groupResult = await db.collection(SHARE_GROUP_COLLECTION).add({
    data: {
      ownerOpenid: openid,
      petName: cleanText(petName, 32),
      status: 'active',
      createdAt: now,
      updatedAt: now
    }
  })
  const group = { _id: groupResult._id, ownerOpenid: openid, petName: cleanText(petName, 32), status: 'active' }
  await ensureOwnerMember(group._id, openid)
  await migrateLegacyDataToGroup(openid, group._id)
  return group
}

async function migrateLegacyDataToGroup(openid, groupId) {
  const legacyDocs = await listDataDocs(openid)
  const scope = { scopeId: `group:${groupId}`, groupId, ownerOpenid: openid, shared: true }
  const scopedDocs = await listScopedDataDocs(scope)
  const existingKeys = new Set(scopedDocs.map(item => item.key))
  const byKey = {}
  legacyDocs.forEach(item => {
    if (!item.scopeId && DATA_KEYS.has(item.key) && !byKey[item.key]) byKey[item.key] = item.value
  })
  await Promise.all(Object.keys(byKey)
    .filter(key => !existingKeys.has(key))
    .map(key => replaceScopedDataItem(scope, openid, key, byKey[key], { demo: false })))
}

async function createShareInvitation(openid, payload = {}) {
  const petName = cleanText(payload.petName || payload.name || '宠物', 32)
  const scope = await getActiveScope(openid)
  if (scope.shared && scope.role !== 'owner') throw new Error('只有主人可以生成家庭共享邀请')
  const group = scope.shared ? { _id: scope.groupId, ownerOpenid: scope.ownerOpenid, petName } : await ensureOwnedGroup(openid, petName)
  const code = inviteCode(payload.code) || generateInviteCode()
  const finalCode = code.startsWith('ZZ-') ? code : `ZZ-${code}`
  const now = Date.now()
  await db.collection(SHARE_INVITE_COLLECTION).add({
    data: {
      code: finalCode,
      groupId: group._id,
      ownerOpenid: openid,
      petName,
      status: 'active',
      createdAt: now,
      expiresAt: now + 1000 * 60 * 60 * 24 * 30
    }
  })
  return { ok: true, code: finalCode, groupId: group._id, members: await listShareMembers(group._id) }
}

async function acceptShareInvitation(openid, code, profile = {}) {
  await ensureShareCollections()
  const cleanCode = inviteCode(code)
  if (!cleanCode) throw new Error('请输入有效共享码')
  const invitePage = await db.collection(SHARE_INVITE_COLLECTION)
    .where({ code: cleanCode, status: 'active' })
    .limit(1)
    .get()
  const invite = (invitePage.data || [])[0]
  if (!invite) throw new Error('共享码不存在或已失效')
  if (Number(invite.expiresAt) && Number(invite.expiresAt) < Date.now()) throw new Error('共享码已过期，请让主人重新生成')
  const now = Date.now()
  const name = cleanText(profile.name || '我', 16)
  const relation = cleanText(profile.relation || '家人', 12)
  const existing = await db.collection(SHARE_MEMBER_COLLECTION)
    .where({ groupId: invite.groupId, memberOpenid: openid })
    .limit(1)
    .get()
  if ((existing.data || []).length) {
    await db.collection(SHARE_MEMBER_COLLECTION).doc(existing.data[0]._id).update({
      data: { name, relation, status: 'active', updatedAt: now, lastActive: new Date().toISOString().slice(0, 10) }
    })
  } else {
    await db.collection(SHARE_MEMBER_COLLECTION).add({
      data: {
        groupId: invite.groupId,
        ownerOpenid: invite.ownerOpenid,
        memberOpenid: openid,
        name,
        relation,
        role: openid === invite.ownerOpenid ? 'owner' : 'admin',
        status: 'active',
        joinedAt: new Date().toISOString().slice(0, 10),
        lastActive: new Date().toISOString().slice(0, 10),
        createdAt: now,
        updatedAt: now
      }
    })
  }
  return await getAllData(openid)
}

function isCompleteSixMonthData(data) {
  const supplies = data && data.supplies
  const dogFoodHistory = supplies && supplies.dogFood && supplies.dogFood.history
  const snackHistory = supplies && supplies.snack && supplies.snack.history
  return data && typeof data === 'object' &&
    Array.isArray(data.feeds) && data.feeds.length > 600 &&
    Array.isArray(data.stools) && data.stools.length > 500 &&
    Array.isArray(data.waters) && data.waters.length > 980 &&
    Array.isArray(data.walks) && data.walks.length > 420 &&
    Array.isArray(data.weightRecords) && data.weightRecords.length >= 35 &&
    Array.isArray(data.careRecords) && data.careRecords.length >= 58 &&
    Array.isArray(data.growthPhotos) && data.growthPhotos.length >= 24 &&
    Array.isArray(data.diaries) && data.diaries.length >= 14 &&
    Array.isArray(data.chats) && data.chats.length >= 12 &&
    Array.isArray(dogFoodHistory) && dogFoodHistory.length >= 4 &&
    Array.isArray(snackHistory) && snackHistory.length >= 4
}

async function setDataItem(openid, key, value) {
  await replaceDataItem(openid, cleanKey(key), value, { demo: false })
  return { ok: true }
}

exports.main = async (event = {}) => {
  try {
    if (
      event.action === 'syncBreedKnowledge' ||
      event.TriggerName === 'weeklyBreedKnowledge' ||
      event.triggerName === 'weeklyBreedKnowledge'
    ) {
      return await syncBreedKnowledge(!!event.force)
    }
    if (event.action === 'getBreedKnowledge') return await getBreedKnowledge(!!event.force)

    const wxContext = cloud.getWXContext()
    const openid = cleanText(wxContext.OPENID, 128)
    if (!openid) throw new Error('无法识别当前微信用户')
    if (event.action === 'listGrowthPhotos') return await listGrowthPhotos(openid)
    if (event.action === 'addGrowthPhotos') return await addGrowthPhotos(openid, event.photos)
    if (event.action === 'deleteGrowthPhoto') return await deleteGrowthPhoto(openid, event)
    if (event.action === 'seedSixMonthDemoData') return await seedSixMonthDemoData(openid, event.data)
    if (event.action === 'getAllData') return await getAllData(openid)
    if (event.action === 'setDataItem') return await setDataItem(openid, event.key, event.value)
    if (event.action === 'createShareInvitation') return await createShareInvitation(openid, event)
    if (event.action === 'acceptShareInvitation') return await acceptShareInvitation(openid, event.code, event.profile)
    return { ok: false, error: '不支持的云函数操作' }
  } catch (error) {
    return { ok: false, error: cleanText(error && error.message, 240) || '云端数据服务暂时不可用' }
  }
}
