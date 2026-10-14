const CLOUD_ENV_ID = 'cloudbase-d3glshm6n124d98a4'

let initialized = false

function isAvailable() {
  return typeof wx !== 'undefined' && (!wx.getStorageSync || wx.getStorageSync('paw_data_mode') !== 'demo') && wx.cloud && typeof wx.cloud.callFunction === 'function'
}

function init() {
  if (initialized || !isAvailable() || typeof wx.cloud.init !== 'function') return isAvailable()
  const options = { traceUser: true }
  if (CLOUD_ENV_ID) options.env = CLOUD_ENV_ID
  wx.cloud.init(options)
  initialized = true
  return true
}

function callFunction(name, data) {
  init()
  if (!isAvailable()) return Promise.reject(new Error('cloud_unavailable'))
  const mode = wx.getStorageSync && wx.getStorageSync('paw_data_mode')
  // 延迟引用避免 cloud 与 analytics 的初始化循环；只测实际云端读写请求。
  const operation = name === 'pet-data' && data && (['setDataItem', 'mutateDataRecord'].includes(data.action) ? 'sync_write' : data.action === 'getAllData' ? 'sync_read' : '')
  const finish = operation ? require('./analytics').startOperation('home', operation) : () => {}
  return Promise.resolve().then(() => wx.cloud.callFunction({ name, data })).then(response => {
    if (wx.getStorageSync && mode !== wx.getStorageSync('paw_data_mode')) throw new Error('data_mode_changed')
    const result = response && response.result
    if (result && result.ok !== false) { finish(); return result || {} }
    const error = result && result.error
    throw new Error(String(error || 'cloud_function_failed'))
  }).catch(error => { finish(error, error.message === 'data_mode_changed'); throw error })
}

function uploadFile(cloudPath, filePath) {
  init()
  if (!isAvailable() || typeof wx.cloud.uploadFile !== 'function') {
    return Promise.reject(new Error('cloud_upload_unavailable'))
  }
  return wx.cloud.uploadFile({ cloudPath, filePath }).then(result => {
    if (!result || !result.fileID) throw new Error('cloud_upload_failed')
    return result.fileID
  })
}

function downloadFile(fileID) {
  init()
  if (!isAvailable() || typeof wx.cloud.downloadFile !== 'function') {
    return Promise.reject(new Error('cloud_download_unavailable'))
  }
  return wx.cloud.downloadFile({ fileID }).then(result => {
    if (!result || !result.tempFilePath) throw new Error('cloud_download_failed')
    return result.tempFilePath
  })
}

module.exports = { CLOUD_ENV_ID, init, isAvailable, callFunction, downloadFile, uploadFile }
