const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTION = 'growth_photos'

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
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
  try {
    await db.collection(COLLECTION).limit(1).get()
  } catch (error) {
    if (typeof db.createCollection !== 'function') throw error
    try { await db.createCollection(COLLECTION) } catch (createError) {
      if (!/exist|已存在/i.test(String(createError && createError.message || createError))) throw createError
    }
  }
}

async function listGrowthPhotos(openid) {
  await ensureCollection()
  const result = []
  const pageSize = 100
  for (let offset = 0; offset < 1000; offset += pageSize) {
    const page = await db.collection(COLLECTION)
      .where({ _openid: openid })
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
  const photos = (Array.isArray(items) ? items : []).slice(0, 9).map(normalizePhoto).filter(Boolean)
  if (!photos.length) throw new Error('没有可保存的成长照片')
  const inserted = await Promise.all(photos.map(async photo => {
    const result = await db.collection(COLLECTION).add({ data: { ...photo, _openid: openid } })
    return { id: result._id, ...photo }
  }))
  return { ok: true, photos: inserted }
}

exports.main = async (event = {}) => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = cleanText(wxContext.OPENID, 128)
    if (!openid) throw new Error('无法识别当前微信用户')
    if (event.action === 'listGrowthPhotos') return await listGrowthPhotos(openid)
    if (event.action === 'addGrowthPhotos') return await addGrowthPhotos(openid, event.photos)
    return { ok: false, error: '不支持的云函数操作' }
  } catch (error) {
    return { ok: false, error: cleanText(error && error.message, 240) || '云端数据服务暂时不可用' }
  }
}
