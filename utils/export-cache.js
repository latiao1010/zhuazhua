const INDEX_KEY = 'paw_visit_export_cache_v1'
const MAX_AGE = 7 * 24 * 60 * 60 * 1000
const active = new Set()
function entries() {
  try { const value = wx.getStorageSync(INDEX_KEY); return Array.isArray(value) ? value : [] } catch (_) { return [] }
}
function owned(path) {
  return typeof path === 'string' && path.startsWith(`${wx.env.USER_DATA_PATH}/`) && /^就诊记录_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.(txt|csv)$/.test(path.slice(wx.env.USER_DATA_PATH.length + 1))
}
function begin(path) { active.add(path) }
function end(path) { active.delete(path) }
function remember(path) {
  if (!owned(path)) return
  try { wx.setStorageSync(INDEX_KEY, [...entries().filter(item => item.path !== path), { path, createdAt:Date.now() }]) } catch (_) {}
}
function cleanup() {
  let fs
  try { fs = wx.getFileSystemManager() } catch (_) { return }
  if (!fs || !fs.unlinkSync) return
  // Include exports created before the cache index existed; never scan subdirectories.
  if (fs.readdirSync && fs.statSync) {
    try {
      const indexed = entries()
      const paths = new Set(indexed.map(item => item.path))
      fs.readdirSync(wx.env.USER_DATA_PATH).forEach(name => {
        const path = `${wx.env.USER_DATA_PATH}/${name}`
        if (!owned(path) || paths.has(path) || active.has(path)) return
        try {
          const result = fs.statSync(path)
          const stats = result.stats || result
          const modified = Number(stats.lastModifiedTime)
          if (Number.isFinite(modified) && modified > 0) indexed.push({ path, createdAt:modified < 1e12 ? modified * 1000 : modified })
        } catch (_) {}
      })
      wx.setStorageSync(INDEX_KEY, indexed)
    } catch (_) {}
  }
  entries().forEach(item => {
    if (!owned(item.path) || active.has(item.path) || !Number.isFinite(item.createdAt) || Date.now() - item.createdAt <= MAX_AGE) return
    try {
      fs.unlinkSync(item.path)
      wx.setStorageSync(INDEX_KEY, entries().filter(entry => entry.path !== item.path || entry.createdAt !== item.createdAt))
    } catch (_) {}
  })
}
module.exports = { begin, end, remember, cleanup }
