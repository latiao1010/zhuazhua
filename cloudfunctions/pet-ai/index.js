const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV, timeout: 150000 })

const MAX_JSON_BYTES = 20 * 1024 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const AVATAR_STYLES = {
  soft3d: '高品质软萌3D宠物公仔风格，圆润比例，细腻可见的毛发，搪胶与毛绒融合质感，柔和棚拍光线，温暖奶油色纯净背景',
  anime: '治愈系日式动画宠物头像，干净清晰线稿，柔和赛璐璐上色，大而有神的眼睛，明亮通透配色，清新简洁背景',
  crayon: '温暖儿童绘本蜡笔风格，明显但细腻的蜡笔颗粒与纸张纹理，手绘轮廓，柔和活泼配色，留白简洁背景',
  pixel: '精致16位复古像素艺术宠物头像，清晰像素块，有限且协调的复古游戏配色，轮廓辨识度高，简洁像素背景'
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function request(url, options = {}) {
  const method = options.method || 'GET'
  const body = options.body === undefined ? null : Buffer.from(
    typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
  )
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': body.length } : {}),
        ...(options.headers || {})
      },
      timeout: options.timeout || 55000
    }, response => {
      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > (options.maxBytes || MAX_JSON_BYTES)) {
          response.destroy(new Error('upstream_response_too_large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        const content = Buffer.concat(chunks)
        if (response.statusCode < 200 || response.statusCode >= 300) {
          let detail = `HTTP ${response.statusCode || 0}`
          try {
            const parsed = JSON.parse(content.toString('utf8'))
            detail = cleanText(parsed && parsed.error && (parsed.error.message || parsed.error), 240) || detail
          } catch (error) {}
          reject(new Error(detail))
          return
        }
        resolve(content)
      })
    })
    req.on('timeout', () => req.destroy(new Error('upstream_timeout')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function requestJson(url, options) {
  const body = await request(url, options)
  try {
    return JSON.parse(body.toString('utf8'))
  } catch (error) {
    throw new Error('invalid_upstream_response')
  }
}

function buildSystemPrompt(pet) {
  const name = cleanText(pet && pet.name, 30) || '宠物'
  const breed = cleanText(pet && pet.breed, 30) || '未知品种'
  const weight = Number(pet && pet.weight)
  return [
    '你是“爪爪 AI 顾问”，一名温和、可靠的宠物日常照护助手。',
    `当前宠物档案：名字${name}，品种${breed}，体重${Number.isFinite(weight) && weight > 0 ? `${weight}kg` : '未记录'}。`,
    '请用简洁自然的中文回答，优先结合档案和用户提供的近期记录，不要假装看到了未提供的数据。',
    '涉及健康问题时先给低风险的观察与照护建议，并明确说明不能替代兽医诊断。',
    '出现呼吸困难、抽搐、持续呕吐、明显虚弱、误食毒物、严重出血等紧急信号时，直接建议尽快联系兽医或动物急诊。',
    '不要在缺少兽医确认时给出人用药名称或具体药物剂量。'
  ].join('\n')
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages.slice(-16).map(message => ({
    role: message && message.role === 'assistant' ? 'assistant' : 'user',
    content: cleanText(message && message.content, 4000)
  })).filter(message => message.content)
}

async function chat(event) {
  const messages = normalizeMessages(event.messages)
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw new Error('缺少用户消息')
  const modelName = cleanText(process.env.CLOUD_AI_TEXT_MODEL, 100) || 'hy3'
  const providerName = cleanText(process.env.CLOUD_AI_TEXT_PROVIDER, 100) || 'hunyuan-v3'
  const model = cloud.ai().createModel(providerName)
  const result = await model.generateText({
    model: modelName,
    messages: [{ role: 'system', content: buildSystemPrompt(event.pet) }, ...messages]
  })
  const content = result && result.text
  if (!cleanText(content, 20000)) throw new Error('AI 没有返回内容')
  return { ok: true, content: cleanText(content, 20000), model: modelName, provider: providerName }
}

async function weather(event) {
  const latitude = Number(event.location && event.location.latitude)
  const longitude = Number(event.location && event.location.longitude)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error('无效纬度')
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error('无效经度')
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,weather_code',
    hourly: 'precipitation_probability,precipitation',
    forecast_hours: '24',
    timezone: 'auto'
  })
  const data = await requestJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { timeout: 10000 })
  return { ok: true, data }
}

function avatarPrompt(styleId, style, petName) {
  const styleText = AVATAR_STYLES[styleId] || cleanText(style, 80) || AVATAR_STYLES.soft3d
  const name = cleanText(petName, 30) || '这只宠物'
  return [
    `以输入照片中的${name}为唯一主体，严格保留毛色、花纹、耳朵、脸型与品种识别特征。`,
    styleText,
    '生成正方形头像构图，主体居中，完整头部和上半身，表情亲切，背景干净。',
    '不要添加文字、水印、项圈文字或多余动物，不改变宠物身份。'
  ].join('\n')
}

async function avatar(event, context) {
  const sourceFileID = cleanText(event.sourceFileID, 1000)
  if (!sourceFileID.startsWith('cloud://')) throw new Error('无效的云端原图')
  let source
  try {
    source = await cloud.downloadFile({ fileID: sourceFileID })
    const fileContent = source && source.fileContent
    if (!fileContent || fileContent.length > MAX_IMAGE_BYTES) throw new Error('图片不能超过 8MB')
    const modelName = 'HY-Image-v3.0-I2I-ToB-v1.0.1'
    const imageModel = cloud.ai().createImageModel('hunyuan-image')
    const result = await imageModel.generateImage({
      model: modelName,
      prompt: avatarPrompt(event.styleId, event.style, event.petName),
      images: [fileContent.toString('base64')],
      size: '1024x1024',
      revise: { value: true },
      enable_thinking: { value: false }
    })
    const first = result && result.data && result.data[0]
    const output = first && first.url
      ? await request(first.url, { timeout: 30000, maxBytes: 20 * 1024 * 1024 })
      : null
    if (!output || !output.length) throw new Error('图片生成服务没有返回图片')
    const wxContext = cloud.getWXContext()
    const owner = cleanText(wxContext.OPENID || context.OPENID, 128) || 'anonymous'
    const suffix = crypto.randomBytes(5).toString('hex')
    const uploaded = await cloud.uploadFile({
      cloudPath: `generated-avatars/${owner}/${Date.now()}-${suffix}.jpg`,
      fileContent: output
    })
    if (!uploaded || !uploaded.fileID) throw new Error('生成图片保存到云端失败')
    return { ok: true, status: 'success', imageFileID: uploaded.fileID, model: modelName }
  } finally {
    try { await cloud.deleteFile({ fileList: [sourceFileID] }) } catch (error) {}
  }
}

function safeError(error) {
  const message = cleanText(error && error.message, 240)
  if (/429|EXCEED_TOKEN_QUOTA_LIMIT/i.test(message)) {
    return 'AI 额度尚未开通或已用完，请先在微信公众平台报名小程序成长计划'
  }
  if (/EXCEED_CONCURRENT_REQUEST_LIMIT/i.test(message)) {
    return 'AI 服务繁忙，请稍后重试'
  }
  return message || '云服务暂时不可用'
}

exports.main = async (event = {}, context = {}) => {
  try {
    if (event.action === 'chat') return await chat(event)
    if (event.action === 'weather') return await weather(event)
    if (event.action === 'avatar') return await avatar(event, context)
    return { ok: false, error: '不支持的云函数操作' }
  } catch (error) {
    return { ok: false, error: safeError(error) }
  }
}
