const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto')
const ROOT = path.resolve(__dirname, '../..'), NOW = Date.parse('2026-10-10T12:00:00+08:00')
const clone = value => JSON.parse(JSON.stringify(value))
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
function runtime({ release = false, db, dependencies = {} } = {}) {
  let now = NOW, timerId = 0, pageDefinition
  const timers = new Map(), disk = {}, cache = {}, calls = [], logs = [], context = { APPID: 'test-app', OPENID: 'owner' }
  const wx = {
    getStorageSync: k => disk[k], removeStorageSync: k => { delete disk[k] }, showToast() {}, stopPullDownRefresh() {}, setStorageSync: (k, v) => { disk[k] = clone(v) },
    getAccountInfoSync: () => ({ miniProgram: { envVersion: release ? 'release' : 'develop', version: '1.0.0' } }),
    getDeviceInfo: () => ({ platform: 'ios' }), nextTick: fn => fn(),
    cloud: { init() {}, callFunction: async options => { calls.push(options); return { result: { ok: true, ids: options.data.events?.map(e => e.id) || [] } } } }
  }
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])) } static now() { return now } }
  const env = { Date: Clock, Buffer, console: { warn: (...args) => logs.push(args), log() {} }, wx, Page: p => { pageDefinition = p },
    process: { env: { ANALYTICS_ADMIN_IDS: hash('test-app:admin') } },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id }, clearTimeout: id => timers.delete(id) }
  function load(file) {
    const filename = path.resolve(ROOT, file)
    if (cache[filename]) return cache[filename].exports
    const module = { exports: {} }; cache[filename] = module
    const requireHere = name => {
      if (dependencies[name]) return dependencies[name]
      if (name === 'wx-server-sdk') return { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => db, getWXContext: () => context }
      if (name.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), name)
        return name.endsWith('.json') ? JSON.parse(fs.readFileSync(target, 'utf8')) : load(target + (path.extname(target) ? '' : '.js'))
      }
      return require(name)
    }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { ...env, module, exports: module.exports, require: requireHere }, { filename })
    return module.exports
  }
  return { wx, disk, calls, context, logs, load, get page() { return pageDefinition }, now: () => now,
    tick(ms) { now += ms; const due = [...timers.entries()].filter(([, t]) => t.at <= now); for (const [id, t] of due) { timers.delete(id); t.fn() } },
    setNow(time) { now = time }, timers }
}
module.exports = { runtime, NOW, clone, hash }
