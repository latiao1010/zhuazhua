const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '../utils/weather.js'), 'utf8')
function fixture() {
  const now = Math.floor(Date.now() / 1000), hour = Math.floor(now / 3600) * 3600
  return { utc_offset_seconds: 28800,
    current: { time: now, temperature_2m: 22, apparent_temperature: 21, weather_code: 2, is_day: 1 },
    hourly: { time: Array.from({ length: 25 }, (_, i) => hour + i * 3600), precipitation_probability: Array(25).fill(20), precipitation: Array(25).fill(0) } }
}
function setup(overrides = {}, data = fixture()) {
  const calls = { location: 0, forecast: 0, city: 0, cloudRequests: [] }
  const wx = {
    getPrivacySetting: o => o.success({ needAuthorization: false }),
    getSetting: o => o.success({ authSetting: { 'scope.userFuzzyLocation': true } }),
    getFuzzyLocation: o => { calls.location++; o.success({ latitude: 31.2, longitude: 121.4 }) },
    getDeviceInfo: () => ({ platform: 'ios' }),
    cloud: { init() {}, callFunction: async o => { calls.forecast++; calls.cloudRequests.push(o); return { result: { ok: true, data } } } },
    request: o => { assert.match(o.url, /reverse-geocode/); calls.city++; o.success({ statusCode: 200, data: { city: '上海市', lookupSource: 'coordinates' } }) },
    ...overrides
  }
  const module = { exports: {} }; vm.runInNewContext(source, { module, wx, console, require: name => {
    assert.equal(name, './cloud'); return { CLOUD_ENV_ID: 'test-weather-env' }
  } }, { filename: 'weather.js' })
  return { api: module.exports, wx, calls, data }
}
const cases = []
const test = (name, fn) => cases.push([name, fn])
test('自动定位、城市匹配、实时天气和24小时降雨摘要', async () => {
  const c = setup(), w = await c.api.getWeather()
  assert.equal(w.live, true); assert.equal(w.location, '上海市'); assert.equal(w.temperature, 22)
  assert.equal(w.apparent, 21); assert.equal(w.condition, '多云'); assert.match(w.rainText, /最高 20%/)
})
test('并发请求合并，缓存复用，强制刷新重新请求', async () => {
  const c = setup(); const first = c.api.getWeather(); assert.equal(c.api.getWeather(), first); await first
  await c.api.getWeather(); assert.equal(c.calls.forecast, 1)
  await c.api.getWeather({ force: true }); assert.equal(c.calls.forecast, 2)
})
test('隐私授权未完成不访问定位或网络', async () => {
  const c = setup({ getPrivacySetting: o => o.success({ needAuthorization: true }) })
  assert.equal((await c.api.getWeather()).status, 'privacy'); assert.equal(c.calls.location, 0); assert.equal(c.calls.forecast, 0)
})
test('位置权限被拒绝时不发请求', async () => {
  const c = setup({ getSetting: o => o.success({ authSetting: { 'scope.userFuzzyLocation': false } }) })
  assert.equal((await c.api.getWeather()).status, 'denied'); assert.equal(c.calls.forecast, 0)
})
test('撤回授权立即清除缓存天气', async () => {
  const c = setup(); await c.api.getWeather()
  c.wx.getSetting = o => o.success({ authSetting: { 'scope.userFuzzyLocation': false } })
  const w = await c.api.getWeather(); assert.equal(w.live, false); assert.equal(w.location, ''); assert.equal(w.temperature, '--')
})
test('不支持定位API给出升级提示', async () => {
  const c = setup({ getFuzzyLocation: undefined }); assert.equal((await c.api.getWeather()).status, 'unsupported')
})
test('定位异常与非法坐标不给假天气', async () => {
  for (const location of [o => o.fail({ errMsg: 'fail GPS error' }), o => o.success({ latitude: 120, longitude: 0 }), o => o.success({ latitude: null, longitude: 121 })]) {
    const c = setup({ getFuzzyLocation: location }), w = await c.api.getWeather()
    assert.equal(w.status, 'location_failed'); assert.equal(w.live, false)
  }
})
test('云请求失败或上游错误可重试，不能回退到被拦截的直连接口', async () => {
  const c = setup({ cloud: { callFunction: async () => { throw new Error('offline') } } })
  assert.equal((await c.api.getWeather()).status, 'unavailable')
  c.wx.cloud.callFunction = async () => ({ result: { ok: false, code: 'upstream_response' } })
  assert.equal((await c.api.getWeather()).live, false)
  c.wx.cloud.callFunction = async () => ({ result: { ok: true, data: fixture() } })
  assert.equal((await c.api.getWeather()).live, true)
})
test('城市解析失败不阻塞天气，IP结果不会当成定位城市', async () => {
  for (const cityResponse of [null, { city: '错误城市', lookupSource: 'ip' }]) {
    const c = setup({ request: o => o.url.includes('reverse-geocode')
      ? cityResponse ? o.success({ statusCode: 200, data: cityResponse }) : o.fail({})
      : o.success({ statusCode: 200, data: fixture() }) })
    const w = await c.api.getWeather(); assert.equal(w.live, true); assert.equal(w.location, '当前位置')
  }
})
test('模拟器天气明确标注模拟器位置', async () => {
  const c = setup({ getDeviceInfo: () => ({ platform: 'devtools' }) })
  assert.equal((await c.api.getWeather()).location, '模拟器位置'); assert.equal(c.calls.city, 0)
})
test('缺失温度、过期和未来天气被拒绝', async () => {
  for (const patch of [{ temperature_2m: null }, { time: Math.floor(Date.now() / 1000) - 4 * 3600 }, { time: Math.floor(Date.now() / 1000) + 2 * 3600 }]) {
    const data = fixture(); Object.assign(data.current, patch)
    assert.equal((await setup({}, data).api.getWeather()).live, false)
  }
})
test('降雨时段正确显示，无概率数据不能宣称不会下雨', async () => {
  const data = fixture(); data.hourly.precipitation_probability[2] = 75
  assert.match((await setup({}, data).api.getWeather()).rainText, /可能有降水.*75%/)
  data.hourly.precipitation_probability.fill(null)
  assert.match((await setup({}, data).api.getWeather()).rainText, /降水预报暂缺/)
})
test('城市域名被拦截时仍通过云端显示当前位置天气', async () => {
  const c = setup({ request: o => o.fail({ errMsg: 'request:fail url not in domain list' }) })
  const w = await c.api.getWeather()
  assert.equal(w.live, true); assert.equal(w.location, '当前位置')
  assert.equal(c.calls.forecast, 1)
  assert.equal(c.calls.cloudRequests[0].name, 'pet-weather')
  assert.equal(c.calls.cloudRequests[0].config.env, 'test-weather-env')
})
test('只发送两位小数的大致坐标，不发送档案或用户标识', async () => {
  const c = setup({ getFuzzyLocation: o => o.success({ latitude: 31.234567, longitude: 121.456789 }) })
  await c.api.getWeather()
  assert.equal(JSON.stringify(c.calls.cloudRequests[0].data), JSON.stringify({ latitude: 31.23, longitude: 121.46 }))
})
test('缺少云能力、函数未部署、超时与繁忙分别提示且不生成假天气', async () => {
  const missing = setup({ cloud: null })
  assert.equal((await missing.api.getWeather()).status, 'cloud_unavailable')
  for (const [response, expected] of [
    [{ code: 'upstream_timeout' }, 'weather_timeout'], [{ code: 'upstream_busy' }, 'weather_busy'],
    [{ code: 'upstream_data' }, 'weather_data_unavailable'], [{ code: 'unauthorized' }, 'unavailable']
  ]) {
    const c = setup({ cloud: { callFunction: async () => ({ result: { ok: false, ...response } }) } })
    const w = await c.api.getWeather(); assert.equal(w.status, expected); assert.equal(w.live, false)
  }
  const missingFn = setup({ cloud: { callFunction: async () => { throw { errMsg: 'FUNCTION_NOT_FOUND' } } } })
  assert.equal((await missingFn.api.getWeather()).status, 'cloud_unavailable')
})
;(async () => {
  let failed = 0
  for (const [name, fn] of cases) { try { await fn(); console.log('✓ ' + name) } catch (e) { failed++; console.error('✗ ' + name, e) } }
  console.log(`${cases.length - failed}/${cases.length} weather scenarios passed.`)
  if (failed) process.exitCode = 1
})()
