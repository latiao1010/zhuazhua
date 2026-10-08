const CACHE_TTL = 15 * 60 * 1000
const LOCATION_TTL = 5 * 60 * 1000
const HOUR = 3600000
const LOCATION_SCOPE = 'scope.userFuzzyLocation'

const CONDITIONS = {
  0: ['晴', '☀️'], 1: ['晴间多云', '🌤️'], 2: ['多云', '⛅'], 3: ['阴', '☁️'],
  45: ['雾', '🌫️'], 48: ['雾凇', '🌫️'], 51: ['小毛毛雨', '🌦️'], 53: ['毛毛雨', '🌧️'], 55: ['较强毛毛雨', '🌧️'],
  56: ['冻毛毛雨', '🌧️'], 57: ['冻毛毛雨', '🌧️'], 61: ['小雨', '🌦️'], 63: ['中雨', '🌧️'], 65: ['大雨', '🌧️'],
  66: ['冻雨', '🌧️'], 67: ['冻雨', '🌧️'], 71: ['小雪', '🌨️'], 73: ['中雪', '🌨️'], 75: ['大雪', '❄️'], 77: ['米雪', '🌨️'],
  80: ['阵雨', '🌦️'], 81: ['较强阵雨', '🌧️'], 82: ['强阵雨', '⛈️'], 85: ['阵雪', '🌨️'], 86: ['强阵雪', '❄️'],
  95: ['雷雨', '⛈️'], 96: ['雷雨伴冰雹', '⛈️'], 99: ['强雷雨伴冰雹', '⛈️']
}

let pending = null
let cache = null

function number(value) {
  return value === null || value === undefined || value === '' ? NaN : Number(value)
}
function emptyWeather(status = 'idle') {
  const messages = {
    idle: '自动获取当前位置的天气',
    privacy: '开启后使用大致位置识别城市并查询天气',
    denied: '开启位置授权后，自动显示当地天气',
    unsupported: '当前微信版本暂不支持定位天气，请更新微信',
    location_failed: '暂时无法定位，请检查系统定位服务后重试',
    unavailable: '天气暂时无法获取，请稍后重试'
  }
  return {
    live: false, status, location: '', temperature: '--', apparent: '--', condition: '',
    icon: '🌤️', rainTime: '', maxRainChance: null, updatedLabel: '',
    rainText: messages[status] || messages.unavailable
  }
}
function request(url, data, timeout = 10000) {
  return new Promise((resolve, reject) => {
    wx.request({ url, data, timeout,
      success(res) {
        if (res.statusCode === 200 && res.data && typeof res.data === 'object' && !res.data.error) resolve(res.data)
        else reject(new Error('weather_response_error'))
      }, fail: reject
    })
  })
}
function privacySetting() {
  return new Promise((resolve, reject) => {
    if (typeof wx.getPrivacySetting !== 'function') return resolve({ needAuthorization: false })
    wx.getPrivacySetting({ success: resolve, fail: reject })
  })
}
function locationSetting() {
  return new Promise((resolve, reject) => {
    wx.getSetting({ success: res => resolve((res.authSetting || {})[LOCATION_SCOPE]), fail: reject })
  })
}
function locate() {
  return new Promise((resolve, reject) => {
    if (typeof wx.getFuzzyLocation !== 'function') return reject(new Error('unsupported'))
    wx.getFuzzyLocation({ type: 'wgs84', success: position => {
      const latitude = number(position.latitude)
      const longitude = number(position.longitude)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return reject(new Error('location_failed'))
      resolve({ latitude, longitude })
    }, fail: error => {
      const message = String(error.errMsg || '')
      if (/privacy/i.test(message)) reject(new Error('privacy'))
      else if (/auth deny|auth denied|user deny|user denied|permission denied/i.test(message)) reject(new Error('denied'))
      else reject(new Error('location_failed'))
    } })
  })
}
function positionKey(position) {
  return `${position.latitude.toFixed(2)},${position.longitude.toFixed(2)}`
}
function resolveCity(position) {
  // 只在刚获取微信授权定位后从客户端请求，不使用 IP 或旧的手选城市兜底。
  // 服务商的免费客户端接口不能用于模拟器坐标；模拟器仅展示该坐标的天气。
  try {
    const device = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : wx.getSystemInfoSync()
    if (device.platform === 'devtools') return Promise.resolve('模拟器位置')
  } catch (_) { return Promise.resolve('当前位置') }
  return request('https://api.bigdatacloud.net/data/reverse-geocode-client', {
    latitude: position.latitude, longitude: position.longitude, localityLanguage: 'zh'
  }, 5000).then(data => {
    if (/ip/i.test(String(data.lookupSource || ''))) return '当前位置'
    const name = data.city || data.locality
    return typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : '当前位置'
  }).catch(() => '当前位置')
}
function clockLabel(seconds, offset) {
  const date = new Date((seconds + offset) * 1000)
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}
function forecastLabel(seconds, now, offset) {
  const day = Math.floor((seconds + offset) / 86400)
  const today = Math.floor((now / 1000 + offset) / 86400)
  return `${day > today ? '明天 ' : '今天 '}${clockLabel(seconds, offset)}`
}
function parseForecast(data, city, now = Date.now()) {
  const current = data.current || {}
  const temperature = number(current.temperature_2m)
  const apparent = number(current.apparent_temperature)
  const observedAt = number(current.time) * 1000
  // 拒绝缺失或明显过期的天气，不能将 null、旧缓存当作当前 0℃。
  if (!Number.isFinite(temperature) || !Number.isFinite(observedAt) || now - observedAt > 3 * HOUR || observedAt - now > HOUR) {
    throw new Error('weather_data_unavailable')
  }
  const offset = number(data.utc_offset_seconds) || 0
  const code = number(current.weather_code)
  const condition = CONDITIONS[code] || ['天气数据更新中', '🌤️']
  const hourly = data.hourly || {}
  const times = Array.isArray(hourly.time) ? hourly.time : []
  const probabilities = Array.isArray(hourly.precipitation_probability) ? hourly.precipitation_probability : []
  const amounts = Array.isArray(hourly.precipitation) ? hourly.precipitation : []
  let rainTime = ''
  let firstChance = null
  let maxRainChance = null
  let completeHours = 0
  // forecast_hours 从当前小时起算；过滤掉已经结束的小时，避免跨日误报。
  times.forEach((value, index) => {
    const time = number(value)
    if (!Number.isFinite(time) || time * 1000 + HOUR <= now || time * 1000 >= now + 24 * HOUR) return
    const chance = number(probabilities[index])
    const amount = number(amounts[index])
    if (Number.isFinite(chance) && chance >= 0 && chance <= 100) {
      completeHours += 1
      maxRainChance = Math.max(maxRainChance === null ? 0 : maxRainChance, chance)
    }
    if (!rainTime && (chance >= 50 || amount > 0.1)) {
      rainTime = time * 1000 <= now ? '当前时段' : forecastLabel(time, now, offset)
      firstChance = Number.isFinite(chance) && chance >= 0 && chance <= 100 ? chance : null
    }
  })
  const rainText = rainTime
    ? `${rainTime}可能有降水${firstChance === null ? '' : ` · 概率 ${Math.round(firstChance)}%`}`
    : completeHours >= 24
      ? `未来 24 小时降水概率最高 ${Math.round(maxRainChance)}%`
      : '降水预报暂缺，出门前留意天气变化'
  return {
    live: true, status: 'ready', location: city.name, temperature: Math.round(temperature),
    apparent: Number.isFinite(apparent) ? Math.round(apparent) : Math.round(temperature),
    condition: condition[0], icon: code === 0 && current.is_day === 0 ? '🌙' : condition[1],
    observedAt, updatedLabel: clockLabel(current.time, offset), rainTime, maxRainChance, rainText
  }
}
function fetchForecast(position) {
  return request('https://api.open-meteo.com/v1/forecast', {
    latitude: position.latitude, longitude: position.longitude,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    hourly: 'precipitation_probability,precipitation', forecast_hours: 25,
    timezone: 'auto', timeformat: 'unixtime'
  })
}
async function loadCurrentWeather(force) {
  // 先检查授权，授权撤回后不显示之前缓存的位置或天气。
  const privacy = await privacySetting()
  if (privacy.needAuthorization) { cache = null; return emptyWeather('privacy') }
  if (await locationSetting() === false) { cache = null; return emptyWeather('denied') }
  const now = Date.now()
  if (!force && cache && now >= cache.locatedAt && now - cache.locatedAt < LOCATION_TTL && now - cache.savedAt < CACHE_TTL) {
    try { return parseForecast(cache.data, { name: cache.name }) } catch (_) { cache = null }
  }
  let position
  try { position = await locate() } catch (error) {
    cache = null
    return emptyWeather(error.message)
  }
  const key = positionKey(position)
  // 换城市后不复用旧位置天气；城市名查询失败不阻塞经纬度天气查询。
  if (!force && cache && cache.key === key && now >= cache.savedAt && now - cache.savedAt < CACHE_TTL) {
    try {
      const weather = parseForecast(cache.data, { name: cache.name })
      cache.locatedAt = Date.now()
      return weather
    } catch (_) { cache = null }
  }
  const [name, data] = await Promise.all([resolveCity(position), fetchForecast(position)])
  const weather = parseForecast(data, { name })
  cache = { key, name, data, savedAt: Date.now(), locatedAt: Date.now() }
  return weather
}
function getWeather({ force = false } = {}) {
  if (pending) return pending
  pending = loadCurrentWeather(force).catch(() => emptyWeather('unavailable')).then(weather => {
    pending = null
    return weather
  })
  return pending
}

module.exports = { getWeather, emptyWeather, LOCATION_SCOPE }
