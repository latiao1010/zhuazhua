const cloud = require('./cloud')

function normalizePhoto(item) {
  if (!item || !item.path) return null
  return {
    id: item.id || item._id || `${item.createdAt || Date.now()}-${item.path}`,
    path: item.path,
    dayKey: item.dayKey || '',
    time: item.time || '',
    createdAt: Number(item.createdAt) || 0
  }
}

function mergePhotos(remotePhotos, localPhotos) {
  const merged = []
  const known = new Set()
  ;[...(remotePhotos || []), ...(localPhotos || [])].forEach(item => {
    const photo = normalizePhoto(item)
    if (!photo) return
    const key = photo.path || photo.id
    if (known.has(key)) return
    known.add(key)
    merged.push(photo)
  })
  return merged.sort((a, b) => b.createdAt - a.createdAt)
}

function loadGrowthPhotos(localPhotos) {
  if (!cloud.isAvailable()) return Promise.resolve(mergePhotos([], localPhotos))
  return cloud.callFunction('pet-data', { action: 'listGrowthPhotos' })
    .then(result => mergePhotos(result.photos || [], localPhotos))
}

function extension(filePath) {
  const match = String(filePath || '').match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/)
  const value = match ? match[1].toLowerCase() : 'jpg'
  return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(value) ? value : 'jpg'
}

function saveLocalPhotos(tempPaths, metadata) {
  return new Promise(resolve => {
    const saved = []
    const next = index => {
      if (index >= tempPaths.length) {
        resolve(saved)
        return
      }
      wx.saveFile({
        tempFilePath: tempPaths[index],
        success: result => {
          saved.push({
            id: `growth-${metadata.createdAt}-${index}`,
            path: result.savedFilePath,
            dayKey: metadata.dayKey,
            time: metadata.time,
            createdAt: metadata.createdAt + index
          })
          next(index + 1)
        },
        fail: () => next(index + 1)
      })
    }
    next(0)
  })
}

function saveGrowthPhotos(tempPaths, metadata) {
  if (!cloud.isAvailable()) return saveLocalPhotos(tempPaths, metadata)
  const uploads = tempPaths.map((filePath, index) => {
    const cloudPath = `growth-photos/${metadata.dayKey}/${metadata.createdAt}-${index}-${Math.random().toString(36).slice(2, 9)}.${extension(filePath)}`
    return cloud.uploadFile(cloudPath, filePath).then(fileID => ({
      id: `growth-${metadata.createdAt}-${index}`,
      path: fileID,
      dayKey: metadata.dayKey,
      time: metadata.time,
      createdAt: metadata.createdAt + index
    })).catch(() => null)
  })
  return Promise.all(uploads).then(items => {
    const photos = items.filter(Boolean)
    if (!photos.length) return []
    return cloud.callFunction('pet-data', { action: 'addGrowthPhotos', photos })
      .then(result => mergePhotos(result.photos || photos, []))
  })
}

module.exports = { loadGrowthPhotos, mergePhotos, saveGrowthPhotos }
