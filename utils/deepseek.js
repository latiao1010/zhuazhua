const DEFAULT_ENDPOINT = 'http://127.0.0.1:8789/api/chat'
const cloud = require('./cloud')

function getEndpoint() {
  try {
    const custom = wx.getStorageSync && wx.getStorageSync('paw_ai_proxy_url')
    return String(custom || DEFAULT_ENDPOINT).trim()
  } catch (error) {
    return DEFAULT_ENDPOINT
  }
}

function isAvailable() {
  return cloud.isAvailable() || (typeof wx !== 'undefined' && typeof wx.request === 'function')
}

function toApiMessages(messages) {
  return (messages || []).slice(-16).map(message => ({
    role: message.role === 'ai' ? 'assistant' : 'user',
    content: String(message.text || '').trim()
  })).filter(message => message.content)
}

function createChatRequest({ messages, pet }) {
  if (cloud.isAvailable()) {
    let aborted = false
    const promise = cloud.callFunction('pet-ai', {
      action: 'chat',
      pet: {
        name: pet && pet.name,
        breed: pet && pet.breed,
        weight: pet && pet.weight
      },
      messages: toApiMessages(messages)
    }).then(result => {
      if (aborted) throw new Error('request_aborted')
      if (!String(result.content || '').trim()) throw new Error('empty_model_response')
      return {
        content: String(result.content).trim(),
        model: result.model || 'deepseek-cloud'
      }
    })
    return {
      promise,
      abort() { aborted = true }
    }
  }

  let requestTask
  const promise = new Promise((resolve, reject) => {
    requestTask = wx.request({
      url: getEndpoint(),
      method: 'POST',
      timeout: 50000,
      header: { 'content-type': 'application/json' },
      data: {
        pet: {
          name: pet && pet.name,
          breed: pet && pet.breed,
          weight: pet && pet.weight
        },
        messages: toApiMessages(messages)
      },
      success(response) {
        const content = response && response.data && response.data.content
        if (response.statusCode >= 200 && response.statusCode < 300 && String(content || '').trim()) {
          resolve({
            content: String(content).trim(),
            model: response.data.model || 'deepseek-v4-flash'
          })
          return
        }
        const detail = response && response.data && response.data.error
        reject(new Error(String(detail || `HTTP ${response.statusCode || 0}`)))
      },
      fail(error) {
        reject(new Error(error && error.errMsg ? error.errMsg : 'network_error'))
      }
    })
  })
  return {
    promise,
    abort() {
      if (requestTask && requestTask.abort) requestTask.abort()
    }
  }
}

module.exports = { createChatRequest, isAvailable }
