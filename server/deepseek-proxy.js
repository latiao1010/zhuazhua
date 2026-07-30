const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const { execFile } = require('child_process')

function loadLocalEnv() {
  const envPath = path.join(__dirname, '.env.local')
  if (!fs.existsSync(envPath)) return
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match || process.env[match[1]]) return
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  })
}

loadLocalEnv()

const API_KEY = String(process.env.DEEPSEEK_API_KEY || '').trim()
const ALLOWED_MODELS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro'])
const requestedModel = String(process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash').trim()
const MODEL = ALLOWED_MODELS.has(requestedModel) ? requestedModel : 'deepseek-v4-flash'
const HOST = String(process.env.AI_PROXY_HOST || '127.0.0.1')
const PORT = Number(process.env.AI_PROXY_PORT) || 8789
const MAX_BODY_BYTES = 128 * 1024
const MAX_AVATAR_BODY_BYTES = 12 * 1024 * 1024
const GENERATED_ROOT = path.join(__dirname, 'generated')
const userHome = process.env.USERPROFILE || process.env.HOME || ''
const DREAMINA_CLI_PATH = String(process.env.DREAMINA_CLI_PATH || (
  process.platform === 'win32' ? path.join(userHome, 'bin', 'dreamina.exe') : 'dreamina'
))
const AVATAR_STYLES = {
  soft3d: '高品质软萌3D宠物公仔风格，圆润比例，细腻可见的毛发，搪胶与毛绒融合质感，柔和棚拍光线，温暖奶油色纯净背景',
  anime: '治愈系日式动画宠物头像，干净清晰线稿，柔和赛璐璐上色，大而有神的眼睛，明亮通透配色，清新简洁背景',
  crayon: '温暖儿童绘本蜡笔风格，明显但细腻的蜡笔颗粒与纸张纹理，手绘轮廓，柔和活泼配色，留白简洁背景',
  pixel: '精致16位复古像素艺术宠物头像，清晰像素块，有限且协调的复古游戏配色，轮廓辨识度高，简洁像素背景'
}
const LEGACY_AVATAR_STYLE_IDS = {
  '软萌 3D': 'soft3d',
  '软萌公仔': 'soft3d',
  '日系漫画': 'anime',
  '治愈漫画': 'anime',
  '蜡笔涂鸦': 'crayon',
  '蜡笔绘本': 'crayon',
  '复古像素': 'pixel'
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  })
  response.end(JSON.stringify(body))
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength)
}

function buildSystemPrompt(pet) {
  const name = cleanText(pet && pet.name, 30) || '宠物'
  const breed = cleanText(pet && pet.breed, 30) || '未知品种'
  const weight = Number(pet && pet.weight)
  const weightText = Number.isFinite(weight) && weight > 0 ? `${weight}kg` : '未记录'
  return [
    '你是“爪爪 AI 顾问”，一名温和、可靠的宠物日常照护助手。',
    `当前宠物档案：名字${name}，品种${breed}，体重${weightText}。`,
    '请用简洁自然的中文回答，优先结合档案和用户提供的近期记录，不要假装看到了未提供的数据。',
    '涉及健康问题时先给低风险的观察与照护建议，并明确说明不能替代兽医诊断。',
    '出现呼吸困难、抽搐、持续呕吐、明显虚弱、误食毒物、严重出血等紧急信号时，直接建议尽快联系兽医或动物急诊。',
    '不要在缺少兽医确认时给出人用药名称或具体药物剂量。'
  ].join('\n')
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  return messages
    .slice(-16)
    .map(message => ({
      role: message && message.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(message && message.content, 4000)
    }))
    .filter(message => message.content)
}

function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    request.on('data', chunk => {
      size += chunk.length
      if (size > maxBytes) {
        reject(Object.assign(new Error('request_too_large'), { statusCode: 413 }))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch (error) {
        reject(Object.assign(new Error('invalid_json'), { statusCode: 400 }))
      }
    })
    request.on('error', reject)
  })
}

function runDreamina(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    execFile(DREAMINA_CLI_PATH, args, {
      cwd: __dirname,
      timeout,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = cleanText(stderr || stdout || error.message, 500)
        reject(Object.assign(new Error(detail || 'dreamina_command_failed'), { statusCode: 502 }))
        return
      }
      resolve(String(stdout || '').trim())
    })
  })
}

function parseCliJson(output) {
  const text = String(output || '').trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch (error) {}
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    try {
      return JSON.parse(text.slice(objectStart, objectEnd + 1))
    } catch (error) {}
  }
  return {}
}

function findNestedValue(value, keys) {
  if (!value || typeof value !== 'object') return undefined
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== '') return value[key]
  }
  for (const child of Object.values(value)) {
    const found = findNestedValue(child, keys)
    if (found !== undefined) return found
  }
  return undefined
}

function findSubmitId(data, output) {
  const nested = findNestedValue(data, ['submit_id', 'submitId'])
  if (nested) return String(nested)
  const match = String(output || '').match(/submit[_-]?id["'\s:=]+([A-Za-z0-9_-]{8,128})/i)
  return match ? match[1] : ''
}

function findStatus(data) {
  return String(findNestedValue(data, ['gen_status', 'status']) || 'querying').toLowerCase()
}

function imageExtension(base64, mimeType) {
  const mime = String(mimeType || '').toLowerCase()
  if (mime.includes('png')) return '.png'
  if (mime.includes('webp')) return '.webp'
  const signature = Buffer.from(base64.slice(0, 16), 'base64')
  if (signature.slice(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '.png'
  if (signature.slice(0, 4).toString('ascii') === 'RIFF') return '.webp'
  return '.jpg'
}

function avatarPrompt(styleId, style, petName) {
  const resolvedStyleId = AVATAR_STYLES[styleId] ? styleId : LEGACY_AVATAR_STYLE_IDS[style] || 'soft3d'
  const styleText = AVATAR_STYLES[resolvedStyleId]
  const name = cleanText(petName, 30) || '这只宠物'
  return [
    `严格参考输入照片中${name}的品种、脸型、毛色、花纹、耳朵和眼睛特征，生成一张正方形Q版宠物头像。`,
    styleText,
    '主体居中，头肩构图，表情自然可爱，画面干净，不增加文字、水印、项圈文字或多余动物。',
    '必须保持原宠物身份辨识度，不能改变关键毛色与面部花纹。'
  ].join(' ')
}

function listGeneratedImages(directory) {
  if (!fs.existsSync(directory)) return []
  const files = []
  const walk = current => {
    fs.readdirSync(current, { withFileTypes: true }).forEach(entry => {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) walk(target)
      else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) files.push(target)
    })
  }
  walk(directory)
  return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
}

function validSubmitId(value) {
  return /^[A-Za-z0-9_-]{8,128}$/.test(String(value || ''))
}

async function submitAvatarTask(request, response) {
  if (!fs.existsSync(DREAMINA_CLI_PATH)) {
    sendJson(response, 503, { error: 'Dreamina CLI is not installed.' })
    return
  }
  const body = await readJsonBody(request, MAX_AVATAR_BODY_BYTES)
  const rawBase64 = String(body.imageBase64 || '').replace(/^data:image\/[A-Za-z0-9.+-]+;base64,/, '')
  if (!rawBase64 || rawBase64.length > MAX_AVATAR_BODY_BYTES) {
    sendJson(response, 400, { error: 'A valid image is required.' })
    return
  }
  const image = Buffer.from(rawBase64, 'base64')
  if (!image.length || image.length > 8 * 1024 * 1024) {
    sendJson(response, 413, { error: 'Image must be smaller than 8 MB.' })
    return
  }
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamina-avatar-'))
  const inputPath = path.join(temporaryDirectory, `input${imageExtension(rawBase64, body.mimeType)}`)
  fs.writeFileSync(inputPath, image)
  try {
    const output = await runDreamina([
      'image2image',
      '--images', inputPath,
      '--prompt', avatarPrompt(body.styleId, body.style, body.petName),
      '--ratio', '1:1',
      '--resolution_type', '2k',
      '--model_version', '5.0',
      '--generate_num', '1',
      '--poll', '0'
    ], 90000)
    const data = parseCliJson(output)
    const submitId = findSubmitId(data, output)
    if (!validSubmitId(submitId)) {
      throw Object.assign(new Error('Dreamina did not return a valid submit_id.'), { statusCode: 502 })
    }
    sendJson(response, 202, { submitId, status: findStatus(data) })
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

async function queryAvatarTask(request, response, requestUrl) {
  const submitId = requestUrl.searchParams.get('submit_id')
  if (!validSubmitId(submitId)) {
    sendJson(response, 400, { error: 'Invalid submit_id.' })
    return
  }
  const downloadDirectory = path.join(GENERATED_ROOT, submitId)
  fs.mkdirSync(downloadDirectory, { recursive: true })
  const output = await runDreamina([
    'query_result',
    `--submit_id=${submitId}`,
    '--download_dir', downloadDirectory
  ], 90000)
  const data = parseCliJson(output)
  const status = findStatus(data)
  const files = listGeneratedImages(downloadDirectory)
  if (files.length) {
    const relative = path.relative(path.join(GENERATED_ROOT, submitId), files[0]).split(path.sep).map(encodeURIComponent).join('/')
    sendJson(response, 200, {
      submitId,
      status: 'success',
      imageUrl: `http://${request.headers.host}/generated/${encodeURIComponent(submitId)}/${relative}`
    })
    return
  }
  if (status === 'fail' || status === 'failed') {
    const reason = cleanText(findNestedValue(data, ['fail_reason', 'message', 'error']), 300) || 'Dreamina generation failed.'
    sendJson(response, 200, { submitId, status: 'fail', error: reason })
    return
  }
  sendJson(response, 200, { submitId, status: 'querying' })
}

function serveGeneratedImage(response, requestUrl) {
  const match = requestUrl.pathname.match(/^\/generated\/([A-Za-z0-9_-]{8,128})\/(.+)$/)
  if (!match) return false
  const submitId = match[1]
  const relative = match[2].split('/').map(decodeURIComponent).join(path.sep)
  const base = path.resolve(GENERATED_ROOT, submitId)
  const target = path.resolve(base, relative)
  if (!target.startsWith(`${base}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    sendJson(response, 404, { error: 'image_not_found' })
    return true
  }
  const extension = path.extname(target).toLowerCase()
  const contentType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg'
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=86400',
    'Access-Control-Allow-Origin': '*'
  })
  fs.createReadStream(target).pipe(response)
  return true
}

function requestDeepSeek(messages) {
  const body = JSON.stringify({
    model: MODEL,
    messages,
    thinking: { type: 'disabled' },
    max_tokens: 700,
    temperature: 0.45,
    stream: false
  })

  return new Promise((resolve, reject) => {
    const upstream = https.request({
      hostname: 'api.deepseek.com',
      port: 443,
      path: '/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 45000
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8')
        let data
        try {
          data = JSON.parse(raw)
        } catch (error) {
          reject(Object.assign(new Error('invalid_upstream_response'), { statusCode: 502 }))
          return
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const detail = cleanText(data && data.error && data.error.message, 240) || `HTTP ${response.statusCode}`
          reject(Object.assign(new Error(detail), { statusCode: 502 }))
          return
        }
        const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
        if (!cleanText(content, 20000)) {
          reject(Object.assign(new Error('empty_model_response'), { statusCode: 502 }))
          return
        }
        resolve({
          content: cleanText(content, 20000),
          model: data.model || MODEL,
          usage: data.usage || {}
        })
      })
    })
    upstream.on('timeout', () => upstream.destroy(new Error('upstream_timeout')))
    upstream.on('error', error => reject(Object.assign(error, { statusCode: 502 })))
    upstream.end(body)
  })
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`)
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }
  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      configured: !!API_KEY,
      model: MODEL,
      dreaminaConfigured: fs.existsSync(DREAMINA_CLI_PATH)
    })
    return
  }
  if (request.method === 'GET' && serveGeneratedImage(response, requestUrl)) return
  if (request.method === 'POST' && requestUrl.pathname === '/api/avatar') {
    try {
      await submitAvatarTask(request, response)
    } catch (error) {
      sendJson(response, Number(error.statusCode) || 500, { error: cleanText(error.message, 300) || 'avatar_submit_failed' })
    }
    return
  }
  if (request.method === 'GET' && requestUrl.pathname === '/api/avatar/result') {
    try {
      await queryAvatarTask(request, response, requestUrl)
    } catch (error) {
      sendJson(response, Number(error.statusCode) || 500, { error: cleanText(error.message, 300) || 'avatar_query_failed' })
    }
    return
  }
  if (request.method !== 'POST' || requestUrl.pathname !== '/api/chat') {
    sendJson(response, 404, { error: 'not_found' })
    return
  }
  if (!API_KEY) {
    sendJson(response, 503, { error: 'DeepSeek API key is not configured.' })
    return
  }

  try {
    const body = await readJsonBody(request)
    const messages = normalizeMessages(body.messages)
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      sendJson(response, 400, { error: 'A user message is required.' })
      return
    }
    const result = await requestDeepSeek([
      { role: 'system', content: buildSystemPrompt(body.pet) },
      ...messages
    ])
    sendJson(response, 200, result)
  } catch (error) {
    const statusCode = Number(error.statusCode) || 500
    sendJson(response, statusCode, { error: cleanText(error.message, 240) || 'request_failed' })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`DeepSeek proxy listening on http://${HOST}:${PORT} (${MODEL})`)
})

server.on('error', error => {
  console.error(`DeepSeek proxy failed: ${error.message}`)
  process.exitCode = 1
})
