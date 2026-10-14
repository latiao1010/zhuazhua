const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createService, requestJson } = require('../cloudfunctions/pet-weather/weather')
const { runtime } = require('./helpers/analytics-runtime')
const NOW = Date.now(), position = { latitude: 31.23456, longitude: 121.45678 }
const cases = [], test = (name, run) => cases.push([name, run])
const fixture = () => ({ current: { time: Math.floor(NOW / 1000), temperature_2m: 22, apparent_temperature: 21, weather_code: 2, is_day: 1 },
  utc_offset_seconds: 28800, hourly: { time: [NOW / 1000], precipitation_probability: [20], precipitation: [0] } })
test('固定上游地址、只传两位坐标、忽略客户端 URL 与身份字段', async () => {
  let url
  const service = createService({ now: () => NOW, fetchJson: async value => { url = new URL(value); return fixture() } })
  const result = await service.getForecast({ ...position, url: 'http://localhost', openid: 'pretend', apiKey: 'client-key' })
  assert.equal(result.ok, true); assert.equal(url.origin, 'https://api.open-meteo.com')
  assert.equal(url.pathname, '/v1/forecast'); assert.equal(url.searchParams.get('latitude'), '31.23')
  assert.equal(url.searchParams.get('longitude'), '121.46'); assert.equal(url.searchParams.get('forecast_hours'), '25')
  assert.equal(url.searchParams.has('openid'), false); assert.equal(url.searchParams.has('apikey'), false)
})
test('拒绝非法坐标，不请求上游', async () => {
  const service = createService({ fetchJson: () => { throw new Error('不应请求') } })
  for (const value of [null, undefined, {}, { latitude: '31', longitude: 121 }, { latitude: NaN, longitude: 121 },
    { latitude: 91, longitude: 121 }, { latitude: 30, longitude: -181 }]) {
    assert.equal((await service.getForecast(value)).code, 'invalid_location')
  }
})
test('相同位置的并发及短期缓存合并，过期后重新请求', async () => {
  let count = 0, now = NOW, release
  const service = createService({ now: () => now, fetchJson: async () => { count++; if (count === 1) await new Promise(r => { release = r }); return fixture() } })
  const a = service.getForecast(position), b = service.getForecast(position)
  await Promise.resolve(); assert.equal(count, 1); release()
  assert.equal((await a).ok, true); assert.equal((await b).ok, true)
  await service.getForecast(position); assert.equal(count, 1)
  now += 10 * 60 * 1000 + 1; await service.getForecast(position); assert.equal(count, 2)
})
test('缓存容量有界，最早的位置会被淘汰', async () => {
  let count = 0
  const service = createService({ now: () => NOW, fetchJson: async () => { count++; return fixture() } })
  for (let i = 0; i < 129; i++) await service.getForecast({ latitude: i / 100, longitude: 120 })
  await service.getForecast({ latitude: 0, longitude: 120 }); assert.equal(count, 130)
})
test('实例并发有界，超限明确繁忙，结束后可重试', async () => {
  let release
  const gate = new Promise(r => { release = r })
  const service = createService({ now: () => NOW, fetchJson: async () => { await gate; return fixture() } })
  const active = Array.from({ length: 32 }, (_, i) => service.getForecast({ latitude: i, longitude: 120 }))
  assert.equal((await service.getForecast({ latitude: 40, longitude: 120 })).code, 'upstream_busy')
  release(); await Promise.all(active)
  assert.equal((await service.getForecast({ latitude: 40, longitude: 120 })).ok, true)
})
test('失败不缓存、不暴露密钥或上游错误，重试可以成功', async () => {
  let failed = true
  const service = createService({ now: () => NOW, apiKey: 'server-only-key', fetchJson: async url => {
    if (failed) { assert.equal(new URL(url).hostname, 'customer-api.open-meteo.com'); throw new Error(url) }
    return fixture()
  } })
  const result = await service.getForecast(position)
  assert.equal(result.code, 'upstream_network'); assert.equal(JSON.stringify(result).includes('server-only-key'), false)
  failed = false; assert.equal((await service.getForecast(position)).ok, true)
})
test('拒绝缺失、过期或未来天气，输出不带供应商额外字段', async () => {
  for (const patch of [{ temperature_2m: null }, { time: NOW / 1000 - 4 * 3600 }, { time: NOW / 1000 + 2 * 3600 }]) {
    const data = fixture(); Object.assign(data.current, patch)
    const service = createService({ now: () => NOW, fetchJson: async () => data })
    assert.equal((await service.getForecast(position)).code, 'upstream_data')
  }
  const data = fixture(); data.internal = 'discard'; data.hourly.time = Array(100).fill(NOW / 1000)
  const result = await createService({ now: () => NOW, fetchJson: async () => data }).getForecast(position)
  assert.equal(result.data.internal, undefined); assert.equal(result.data.hourly.time.length, 25)
})
test('云函数检查真实调用身份，伪造 OPENID 不能发起天气请求', async () => {
  let calls = 0
  const r = runtime({ dependencies: { './weather': { createService: () => ({ getForecast: async () => { calls++; return { ok: true } } }) } } })
  const main = r.load('cloudfunctions/pet-weather/index.js').main
  r.context.OPENID = ''; assert.equal((await main({ ...position, OPENID: 'pretend' })).code, 'unauthorized'); assert.equal(calls, 0)
  r.context.OPENID = 'actual-test-caller'; assert.equal((await main(position)).ok, true); assert.equal(calls, 1)
})
function transport({ status = 200, body = '{}', error = false, idle = false } = {}) {
  const req = new EventEmitter(); req.destroy = () => { req.destroyed = true }
  return { req, get: (_url, _options, done) => {
    if (!idle) setImmediate(() => {
      if (error) return req.emit('error', new Error('private upstream error'))
      const response = new EventEmitter(); response.statusCode = status; response.setEncoding = () => {}; response.resume = () => {}
      done(response); response.emit('data', body); response.emit('end')
    })
    return req
  } }
}
test('HTTP 错误、非 JSON、超大响应和网络失败都终止请求', async () => {
  for (const [options, expected] of [[{ status: 429 }, 'upstream_busy'], [{ status: 500 }, 'upstream_response'],
    [{ body: '<html>error</html>' }, 'upstream_response'], [{ body: 'x'.repeat(128 * 1024 + 1) }, 'upstream_response'],
    [{ error: true }, 'upstream_network']]) {
    const t = transport(options)
    await assert.rejects(requestJson('https://example.test', t.get), new RegExp(expected)); assert.equal(t.req.destroyed, true)
  }
  assert.deepEqual(await requestJson('https://example.test', transport({ body: '{"ok":true}' }).get), { ok: true })
})
test('无响应连接在总时限后终止，不永久等待', async () => {
  const t = transport({ idle: true })
  await assert.rejects(requestJson('https://example.test', t.get), /upstream_timeout/)
  assert.equal(t.req.destroyed, true)
})
;(async () => {
  let failed = 0
  for (const [name, run] of cases) { try { await run(); console.log('✓ ' + name) } catch (error) { failed++; console.error('✗ ' + name, error) } }
  console.log(`${cases.length - failed}/${cases.length} weather cloud scenarios passed (isolated)`)
  if (failed) process.exitCode = 1
})()
