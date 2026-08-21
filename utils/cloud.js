const CLOUD_ENV_ID = 'cloudbase-d3glshm6n124d98a4'

let initialized = false

function isAvailable() {
  return typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.callFunction === 'function'
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
  return wx.cloud.callFunction({ name, data }).then(response => {
    const result = response && response.result
    if (result && result.ok !== false) return result || {}
    const error = result && result.error
    throw new Error(String(error || 'cloud_function_failed'))
  })
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
