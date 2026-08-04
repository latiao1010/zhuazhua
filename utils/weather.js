const DEFAULT_LOCATION = { latitude: 31.2304, longitude: 121.4737, label: '上海（默认）' }
const cloud = require('./cloud')

const weatherMap = {
  0: ['晴', '☀️'], 1: ['晴间多云', '🌤️'], 2: ['多云', '⛅'], 3: ['阴', '☁️'],
  45: ['有雾', '🌫️'], 48: ['雾凇', '🌫️'], 51: ['小毛毛雨', '🌦️'], 53: ['毛毛雨', '🌦️'],
  55: ['较强毛毛雨', '🌧️'], 61: ['小雨', '🌦️'], 63: ['中雨', '🌧️'], 65: ['大雨', '🌧️'],
  80: ['阵雨', '🌦️'], 81: ['较强阵雨', '🌧️'], 82: ['强阵雨', '⛈️'], 95: ['雷雨', '⛈️'],
  96: ['雷雨伴冰雹', '⛈️'], 99: ['强雷雨伴冰雹', '⛈️']
}

function parseForecast(data, label) {
  const current = data.current || {}
  const hourly = data.hourly || {}
  const times = hourly.time || []
  const probabilities = hourly.precipitation_probability || []
  const precipitation = hourly.precipitation || []
  const now = Date.now()
  let rainIndex = -1
  let maxRainChance = 0

  times.forEach((time, index) => {
    const chance = Number(probabilities[index]) || 0
    maxRainChance = Math.max(maxRainChance, chance)
    if (rainIndex < 0 && new Date(time).getTime() >= now - 1800000 && (chance >= 50 || Number(precipitation[index]) > 0.1)) rainIndex = index
  })

  const weather = weatherMap[current.weather_code] || ['天气变化', '🌤️']
  const rainTime = rainIndex >= 0 ? times[rainIndex].slice(11, 16) : ''
  return {
    location: label,
    temperature: Math.round(current.temperature_2m || 0),
    apparent: Math.round(current.apparent_temperature || current.temperature_2m || 0),
    condition: weather[0],
    icon: weather[1],
    rainTime,
    maxRainChance,
    rainText: rainTime ? `预计 ${rainTime} 左右可能下雨（概率 ${probabilities[rainIndex]}%）` : `未来 24 小时降雨概率较低（最高 ${maxRainChance}%）`,
    live: true
  }
}

function requestForecast(location) {
  if (cloud.isAvailable()) {
    return cloud.callFunction('pet-ai', {
      action: 'weather',
      location: {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude)
      }
    }).then(result => {
      if (!result.data || !result.data.current) throw new Error('weather response error')
      return parseForecast(result.data, location.label)
    })
  }
  return new Promise((resolve, reject) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,weather_code&hourly=precipitation_probability,precipitation&forecast_hours=24&timezone=auto`
    wx.request({ url, timeout: 8000, success: res => {
      if (res.statusCode === 200 && res.data && res.data.current) resolve(parseForecast(res.data, location.label))
      else reject(new Error('weather response error'))
    }, fail: reject })
  })
}

function getWeather() {
  return new Promise(resolve => {
    wx.getLocation({
      type: 'wgs84',
      success: position => requestForecast({ latitude: position.latitude, longitude: position.longitude, label: '当前位置' }).then(resolve).catch(() => requestForecast(DEFAULT_LOCATION).then(resolve).catch(() => resolve(fallback()))),
      fail: () => requestForecast(DEFAULT_LOCATION).then(resolve).catch(() => resolve(fallback()))
    })
  })
}

function fallback() {
  return { location: '离线提示', temperature: 28, apparent: 30, condition: '天气变化', icon: '🌤️', rainTime: '', maxRainChance: 0, rainText: '暂未取得实时天气，出门前请查看当地降雨预报', live: false }
}

module.exports = { getWeather }
