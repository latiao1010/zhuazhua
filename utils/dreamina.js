const DEFAULT_BASE_URL = 'http://127.0.0.1:8789'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const cloud = require('./cloud')

function getBaseUrl() {
  try {
    const mediaUrl = wx.getStorageSync && wx.getStorageSync('paw_media_proxy_url')
    const aiUrl = wx.getStorageSync && wx.getStorageSync('paw_ai_proxy_url')
    const custom = String(mediaUrl || aiUrl || '').trim()
    if (custom) return custom.replace(/\/api\/chat\/?$/, '').replace(/\/$/, '')
  } catch (error) {}
  return DEFAULT_BASE_URL
}

function isAvailable() {
  return cloud.isAvailable() || (typeof wx !== 'undefined' &&
    typeof wx.request === 'function' &&
    typeof wx.getFileSystemManager === 'function')
}

function imageMimeType(filePath) {
  return /\.png$/i.test(filePath) ? 'image/png' : /\.webp$/i.test(filePath) ? 'image/webp' : 'image/jpeg'
}

function imageExtension(filePath) {
  if (/\.png$/i.test(filePath)) return 'png'
  if (/\.webp$/i.test(filePath)) return 'webp'
  return 'jpg'
}

function readImage(filePath) {
  return new Promise((resolve, reject) => {
    const fileSystem = wx.getFileSystemManager()
    fileSystem.getFileInfo({
      filePath,
      success(info) {
        if (Number(info.size) > MAX_IMAGE_BYTES) {
          reject(new Error('图片不能超过 8MB'))
          return
        }
        fileSystem.readFile({
          filePath,
          encoding: 'base64',
          success(result) { resolve(result.data) },
          fail(error) { reject(new Error(error.errMsg || '读取图片失败')) }
        })
      },
      fail(error) { reject(new Error(error.errMsg || '读取图片失败')) }
    })
  })
}

function request(options) {
  let task
  const promise = new Promise((resolve, reject) => {
    task = wx.request({
      ...options,
      timeout: options.timeout || 90000,
      header: { 'content-type': 'application/json', ...(options.header || {}) },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data || {})
          return
        }
        reject(new Error(String(response.data && response.data.error || `HTTP ${response.statusCode || 0}`)))
      },
      fail(error) { reject(new Error(error.errMsg || '网络请求失败')) }
    })
  })
  return {
    promise,
    abort() { if (task && task.abort) task.abort() }
  }
}

function createAvatarTask({ filePath, styleId, style, pet }) {
  if (cloud.isAvailable()) {
    let aborted = false
    const cloudPath = `avatar-inputs/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${imageExtension(filePath)}`
    const promise = cloud.uploadFile(cloudPath, filePath)
      .then(sourceFileID => cloud.callFunction('pet-ai', {
        action: 'avatar',
        sourceFileID,
        mimeType: imageMimeType(filePath),
        styleId,
        style,
        petName: pet && pet.name
      }))
      .then(result => {
        if (aborted) throw new Error('request_aborted')
        const imageUrl = result.imageFileID || result.imageUrl
        if (!imageUrl) throw new Error('empty_avatar_result')
        return { status: 'success', imageUrl, imageFileID: result.imageFileID || '' }
      })
    return {
      promise,
      abort() { aborted = true }
    }
  }

  let activeRequest
  const promise = readImage(filePath).then(imageBase64 => {
    activeRequest = request({
      url: `${getBaseUrl()}/api/avatar`,
      method: 'POST',
      data: {
        imageBase64,
        mimeType: imageMimeType(filePath),
        styleId,
        style,
        petName: pet && pet.name
      }
    })
    return activeRequest.promise
  })
  return {
    promise,
    abort() { if (activeRequest) activeRequest.abort() }
  }
}

function queryAvatarTask(submitId) {
  return request({
    url: `${getBaseUrl()}/api/avatar/result?submit_id=${encodeURIComponent(submitId)}`,
    method: 'GET'
  })
}

function downloadImage(imageUrl) {
  if (/^cloud:\/\//.test(String(imageUrl || ''))) return Promise.resolve(imageUrl)
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url: imageUrl,
      success(result) {
        if (result.statusCode === 200 && result.tempFilePath) resolve(result.tempFilePath)
        else reject(new Error(`下载生成图片失败（${result.statusCode || 0}）`))
      },
      fail(error) { reject(new Error(error.errMsg || '下载生成图片失败')) }
    })
  })
}

module.exports = { createAvatarTask, downloadImage, isAvailable, queryAvatarTask }
