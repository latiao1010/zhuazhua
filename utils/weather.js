function getWeather() {
  return Promise.resolve({
    location: '本地提示',
    temperature: '--',
    apparent: '--',
    condition: '天气未定位',
    icon: '🌤️',
    rainTime: '',
    maxRainChance: 0,
    rainText: '审核版暂不获取定位；出门前请查看当地天气，避开高温、暴雨和湿滑路面。',
    live: false
  })
}

module.exports = { getWeather }
