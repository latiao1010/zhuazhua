const https = require('https')
const { URL } = require('url')
const HOUR = 3600000
const CACHE_TTL = 10 * 60 * 1000
const MAX_CACHE = 128
const MAX_PENDING = 32

function requestJson(url, get = https.get) {
  return new Promise((resolve, reject) => {
    let req, settled = false, bytes = 0, body = ''
    const finish = (error, data) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) { reject(error); if (req) req.destroy() }
      else resolve(data)
    }
    // 总时限包含 DNS、连接与响应，防止上游持续慢速发送占用云函数。
    const timer = setTimeout(() => finish(new Error('upstream_timeout')), 8000)
    try {
      req = get(url, { headers: { 'User-Agent': 'zhuazhua-weather/1.0', Accept: 'application/json' } }, response => {
        if (response.statusCode !== 200) {
          response.resume()
          return finish(new Error(response.statusCode === 429 ? 'upstream_busy' : 'upstream_response'))
        }
        response.setEncoding('utf8')
        response.on('data', chunk => {
          bytes += Buffer.byteLength(chunk)
          if (bytes > 128 * 1024) return finish(new Error('upstream_response'))
          body += chunk
        })
        response.on('error', () => finish(new Error('upstream_network')))
        response.on('aborted', () => finish(new Error('upstream_network')))
        response.on('end', () => {
          if (settled) return
          try { finish(null, JSON.parse(body)) } catch (_) { finish(new Error('upstream_response')) }
        })
      })
      req.on('error', () => finish(new Error('upstream_network')))
    } catch (_) { finish(new Error('upstream_network')) }
  })
}

function coordinate(value, limit) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) throw new Error('invalid_location')
  return Number(value.toFixed(2))
}
function cleanForecast(data, now) {
  const c = data && data.current
  if (!c || !Number.isFinite(c.temperature_2m) || !Number.isFinite(c.time) ||
      now - c.time * 1000 > 3 * HOUR || c.time * 1000 - now > HOUR) throw new Error('upstream_data')
  const h = data.hourly || {}
  const values = key => Array.isArray(h[key]) ? h[key].slice(0, 25).map(v => Number.isFinite(v) ? v : null) : []
  return {
    utc_offset_seconds: Number.isFinite(data.utc_offset_seconds) ? data.utc_offset_seconds : 0,
    current: {
      time: c.time, temperature_2m: c.temperature_2m,
      apparent_temperature: Number.isFinite(c.apparent_temperature) ? c.apparent_temperature : null,
      weather_code: Number.isFinite(c.weather_code) ? c.weather_code : null,
      is_day: c.is_day === 0 ? 0 : 1
    },
    hourly: { time: values('time'), precipitation_probability: values('precipitation_probability'), precipitation: values('precipitation') }
  }
}
function createService({ fetchJson = requestJson, now = Date.now, apiKey = process.env.OPEN_METEO_API_KEY || '' } = {}) {
  // 仅在实例内短期缓存按位置网格计算的天气，不写库、不记录用户位置或账号。
  const cache = new Map(), pending = new Map()
  async function getForecast(input = {}) {
    try {
      const latitude = coordinate(input.latitude, 90), longitude = coordinate(input.longitude, 180)
      const key = `${latitude},${longitude}`
      const existing = cache.get(key)
      if (existing && now() >= existing.at && now() - existing.at < CACHE_TTL) return { ok: true, data: existing.data }
      cache.delete(key)
      if (pending.has(key)) return pending.get(key)
      if (pending.size >= MAX_PENDING) return { ok: false, code: 'upstream_busy' }
      const url = new URL(apiKey ? 'https://customer-api.open-meteo.com/v1/forecast' : 'https://api.open-meteo.com/v1/forecast')
      const params = { latitude, longitude, current: 'temperature_2m,apparent_temperature,weather_code,is_day',
        hourly: 'precipitation_probability,precipitation', forecast_hours: 25, timezone: 'auto', timeformat: 'unixtime' }
      Object.entries(params).forEach(([name, value]) => url.searchParams.set(name, String(value)))
      if (apiKey) url.searchParams.set('apikey', apiKey)
      const task = Promise.resolve().then(() => fetchJson(url.toString())).then(raw => {
        const data = cleanForecast(raw, now())
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value)
        cache.set(key, { at: now(), data })
        return { ok: true, data }
      }).catch(error => {
        const safeCodes = ['upstream_timeout', 'upstream_network', 'upstream_busy', 'upstream_response', 'upstream_data']
        // 不把上游 URL、可能含密钥的错误消息或原始响应返回客户端。
        return { ok: false, code: safeCodes.includes(error && error.message) ? error.message : 'upstream_network' }
      }).finally(() => pending.delete(key))
      pending.set(key, task)
      return task
    } catch (_) { return { ok: false, code: 'invalid_location' } }
  }
  return { getForecast }
}
module.exports = { createService, requestJson }
