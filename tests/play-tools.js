const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')
const { calculateAge } = require('../utils/pet-age')
const { personality, questions } = require('../utils/pet-personality')
const { bingo, BINGO_VERSION, canCompareBingo } = require('../utils/pet-bingo')
const share = require('../utils/fun-share')
const pet = require('./fixtures/account-pet.json')
const today = '2026-10-09'
const clone = x => JSON.parse(JSON.stringify(x))
const ev = (key, value) => ({ currentTarget: { dataset: { [key]: value } }, detail: { value } })
function page(file, options = {}, deps = {}) {
  const disk = {}, calls = { urls: [], toasts: [] }
  const wx = {
    getStorageSync: k => disk[k], setStorageSync: (k, v) => { disk[k] = clone(v) }, removeStorageSync: k => { delete disk[k] },
    showToast: o => calls.toasts.push(o.title), setNavigationBarTitle() {}, showShareMenu() {},
    navigateTo: o => calls.urls.push(o.url), redirectTo: o => calls.urls.push(o.url),
    showModal: o => o.success({ confirm: true }), previewImage() {}
  }
  const filename = path.join(__dirname, '../pages/play', file + '.js'), localRequire = createRequire(filename)
  let def
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { Page: value => { def = value }, wx,
    require: key => deps[key] || (key === '../../utils/store' ? { get: () => clone(pet), todayKey: () => today, isDemoMode: () => true } : localRequire(key)) }, { filename })
  const p = { ...def, data: clone(def.data), setData(patch) {
    for (const [key, value] of Object.entries(patch)) { const parts = key.split('.'), last = parts.pop(); const parent = parts.reduce((o, k) => o[k], this.data); parent[last] = value }
  } }
  p.onLoad(options)
  return { p, wx, disk, calls }
}
const cases = [], test = (name, fn) => cases.push([name, fn])
test('狗狗四种体型四岁换算符合对照表', () => {
  for (const [size, age] of [32, 33, 35, 37].entries()) {
    const r = calculateAge({ species: 'dog', size, birthday: '2022-10-09', name: '可乐' }, today)
    assert.equal(r.h, age); assert.equal(r.a, 48); assert.equal(r.b, 0)
  }
})
test('猫咪换算、相伴日期与出生天数', () => {
  const r = calculateAge({ species: 'cat', size: 0, birthday: '2022-10-09', togetherSince: '2026-10-01' }, today)
  assert.equal(r.h, 32); assert.equal(r.d, 9); assert.equal(r.x, true)
  assert.equal(calculateAge({ species: 'dog', size: 1, birthday: '2023-03-16', togetherSince: today }, today).d, 1)
  assert.equal(calculateAge({ species: 'dog', size: 1, birthday: '2023-03-16', togetherSince: '2023-05-20' }, today).d, 1239)
})
test('闰年生日和月末日期有效', () => {
  const r = calculateAge({ species: 'cat', size: 0, birthday: '2024-02-29' }, '2025-02-28')
  assert.equal(r.a, 12); assert.equal(r.b, 0)
  assert.equal(calculateAge({ species: 'dog', size: 0, birthday: '2026-08-31' }, '2026-09-30').a, 1)
})
test('出生当天和超出换算范围的老年宠物', () => {
  const input = { species: 'dog', size: 0, birthday: today }
  assert.equal(calculateAge(input, today).d, 0)
  assert.equal(calculateAge({ ...input, birthday: '2000-10-09' }, today).h, null)
})
test('年龄非法日期、体型、种类、相伴日期拒绝', () => {
  const valid = { species: 'dog', size: 1, birthday: '2023-03-16' }
  for (const patch of [{ birthday: '2023-02-29' }, { birthday: '2099-01-01' }, { size: -1 }, { size: 4 }, { species: 'bird' }, { togetherSince: '2020-01-01' }, { togetherSince: '2099-01-01' }]) assert.throws(() => calculateAge({ ...valid, ...patch }, today))
})
test('猫狗题目各十道，答案文字完整', () => {
  for (const species of ['cat', 'dog']) { const q = questions(species); assert.equal(q.length, 10); q.forEach(item => assert.equal(item.options.length, 4)) }
  assert.notEqual(questions('cat')[0].options[0], questions('dog')[0].options[0])
})
test('性格分数确定且位于0到100', () => {
  for (let seed = 0; seed < 100; seed++) {
    const a = Array.from({ length: 10 }, (_, i) => (seed + i * 3) % 4)
    const r = personality(a, 'dog'); assert.deepEqual(r, personality(a, 'dog'))
    assert.ok(r.metrics.every(m => m.value >= 0 && m.value <= 100))
  }
  assert.equal(personality(Array(10).fill(0), 'cat').key, 'shadow')
  assert.equal(personality(Array(10).fill(2), 'cat').key, 'boss')
})
test('未答完与非法答案不能生成性格结果', () => {
  for (const answers of [[], Array(9).fill(0), Array(10).fill(null), Array(10).fill(4)]) assert.throws(() => personality(answers, 'cat'))
})
test('宾果0项、横线、对角线、九项八线', () => {
  assert.equal(bingo([]).count, 0); assert.equal(bingo([0, 1, 2]).lines, 1)
  assert.equal(bingo([0, 4, 8]).lines, 1); assert.equal(bingo(Array.from({ length: 9 }, (_, i) => i)).lines, 8)
})
test('宾果拒绝重复、越界、非整数', () => {
  for (const selected of [[1, 1], [-1], [9], [0.5], ['1']]) assert.throws(() => bingo(selected))
})
test('三种结果分享链接可往返，名称长度有上限', () => {
  const list = [calculateAge({ species: 'dog', size: 1, birthday: pet.birthday, name: pet.name }, today),
    { v: 1, t: 'personality', n: '糯米', s: 'dog', q: Array(10).fill(0), e: today },
    { v: 1, t: 'bingo', n: '名字'.repeat(30), s: 'dog', q: [1, 4, 7], e: today }]
  for (const result of list) { const decoded = share.readResult(share.sharePath(result).split('?r=')[1].split('&')[0]); assert.equal(decoded.t, result.t); assert.ok(decoded.n.length <= 12); assert.ok(share.viewResult(decoded).shareTitle) }
})
test('坏链接和伪造卡片不能进入结果展示', () => {
  for (const raw of ['', '%bad', '{}', 'null', '{"v":2}']) assert.throws(() => share.readResult(raw))
  const r = calculateAge({ species: 'dog', size: 1, birthday: pet.birthday }, today)
  assert.throws(() => share.readResult(JSON.stringify({ ...r, h: 999 })))
})
test('好友九宫格计算共同项，分享不会改变本地选择', () => {
  const r = share.readResult(JSON.stringify({ v: 1, t: 'bingo', n: '糯米', s: 'dog', q: [0, 1, 4], e: today, peer: { n: '可乐', s: 'cat', q: [1, 4, 5] } }))
  assert.equal(share.viewResult(r).commonCount, 2); assert.deepEqual(r.q, [0, 1, 4])
})
test('年龄页面预填档案，计算生成结果路由', () => {
  const { p, calls } = page('play', { tool: 'age' }); assert.equal(p.data.name, pet.name)
  p.calculate(); assert.equal(share.readResult(calls.urls[0].split('?r=')[1].split('&')[0]).t, 'age')
  p.setData({ birthday: '2099-01-01' }); p.calculate(); assert.ok(p.data.error)
})
test('答题未选阻止前进、上一题修改、十题完成', () => {
  const { p, calls } = page('play', { tool: 'personality' }); p.start(); p.next(); assert.equal(p.data.index, 0); assert.ok(p.data.error)
  for (let i = 0; i < 10; i++) { p.select(ev('index', 0)); p.next() }
  assert.equal(share.readResult(calls.urls.at(-1).split('?r=')[1].split('&')[0]).q.length, 10)
  p.previous(); assert.equal(p.data.index, 8); p.select(ev('index', 2)); assert.equal(p.data.answers[8], 2)
})
test('答题进度恢复、猫狗隔离、重新开始', () => {
  const { p, disk } = page('play', { tool: 'personality' }); p.start(); p.select(ev('index', 1)); p.next()
  p.start(); assert.equal(p.data.restored, true); assert.equal(p.data.index, 1)
  assert.ok(Object.keys(disk)[0].includes('_demo_dog'))
  p.restart(); assert.equal(p.data.index, 0); assert.ok(p.data.answers.every(a => a === null))
  p.chooseSpecies(ev('value', 'cat')); p.start(); assert.equal(p.data.restored, false)
})
test('宾果页面勾选、取消、清空和好友参数校验', () => {
  const { p, calls } = page('play', { tool: 'bingo', peer: '%bad' }); assert.ok(p.data.error)
  p.toggleBingo(ev('id', 2)); assert.equal(p.data.bingoCount, 1); p.toggleBingo(ev('id', 2)); assert.equal(p.data.bingoCount, 0)
  p.toggleBingo(ev('id', 9)); assert.equal(p.data.bingoCount, 0); p.clearBingo(); p.finishBingo()
  assert.equal(share.readResult(calls.urls[0].split('?r=')[1].split('&')[0]).q.length, 0)
})
test('坏结果页可回到工具，不会崩溃', () => {
  const { p, calls } = page('result', { r: '%bad' }); assert.ok(p.data.error); p.tryTool(); assert.ok(calls.urls[0].endsWith('tool=age'))
})
test('小程序码失败禁止导出，重试成功且重复生成被拦截', async () => {
  let count = 0, available = false
  const requests = []
  const result = calculateAge({ species: 'dog', size: 1, birthday: pet.birthday }, today)
  const { p, wx } = page('result', { r: JSON.stringify(result) }, { '../../utils/fun-share': { ...share, getCode: async (tool, options) => { requests.push(options); if (!available) throw new Error('offline'); return { filePath: '/tmp/code.png', envVersion: 'develop' } }, drawPoster: async (_, __, code) => { assert.ok(code.filePath); count++; return '/tmp/poster.png' } } })
  let exports = 0
  wx.saveImageToPhotosAlbum = () => { exports++ }; wx.showShareImageMenu = () => { exports++ }
  p.canvas = async () => ({})
  const first = p.generate(); assert.equal(await p.generate(), false); await first
  assert.equal(p.data.poster, ''); assert.equal(p.data.codeState, 'unavailable'); assert.equal(count, 0)
  await p.save(); await p.posterAction(); assert.equal(exports, 0)
  available = true
  assert.equal(await p.generate(), true)
  assert.equal(requests.at(-1).force, true)
  assert.equal(p.data.poster, '/tmp/poster.png'); assert.equal(p.data.codeState, 'ready'); assert.equal(count, 1)
  assert.equal(p.data.generating, false)
})
test('猫狗新版宾果各有九题，旧链接的题意保持不变', () => {
  assert.equal(BINGO_VERSION, 2)
  for (const species of ['dog', 'cat']) {
    const result = { v: BINGO_VERSION, t: 'bingo', n: '糯米', s: species, q: [0, 4, 8], e: today }
    const decoded = share.readResult(share.sharePath(result).split('?r=')[1].split('&')[0])
    const model = share.viewResult(decoded)
    assert.equal(model.cells.length, 9); assert.equal(new Set(model.cells.map(c => c.label)).size, 9)
    assert.equal(model.cells[0].label, species === 'dog' ? '出门就兴奋' : '喜欢纸箱')
    assert.equal(model.count, 3); assert.equal(model.lines, 1)
    assert.equal(share.viewResult({ ...result, v: 1 }).cells[0].label, '喜欢纸箱')
  }
  assert.throws(() => bingo([], 'bird', 2)); assert.throws(() => bingo([], 'dog', 3))
})
test('猫狗勾选分别保留，清空和无效输入不会串改', () => {
  const { p, calls } = page('play', { tool: 'bingo' })
  p.toggleBingo(ev('id', 0)); p.toggleBingo(ev('id', 1))
  p.chooseSpecies(ev('value', 'cat')); assert.equal(p.data.bingoCount, 0)
  assert.equal(p.data.bingoCells[0].label, '喜欢纸箱')
  p.toggleBingo(ev('id', 4)); p.chooseSpecies(ev('value', 'dog'))
  assert.deepEqual(clone(p.data.bingoSelected), [0, 1])
  assert.equal(p.data.bingoCells[0].label, '出门就兴奋')
  p.clearBingo(); p.chooseSpecies(ev('value', 'cat'))
  assert.deepEqual(clone(p.data.bingoSelected), [4])
  p.chooseSpecies(ev('value', 'bird')); p.toggleBingo(ev('id', -1)); p.toggleBingo(ev('id', 'bad'))
  p.finishBingo()
  const result = share.readResult(calls.urls.at(-1).split('?r=')[1].split('&')[0])
  assert.equal(result.v, BINGO_VERSION); assert.equal(result.s, 'cat'); assert.deepEqual(result.q, [4])
})
test('好友卡片只比较相同题目，切换不同题库解除对照', () => {
  const dog = { v: 2, t: 'bingo', n: '可乐', s: 'dog', q: [0, 1, 2], e: today }
  assert.equal(canCompareBingo(dog, { v: 1, s: 'dog' }), false)
  assert.equal(canCompareBingo({ v: 2, s: 'cat' }, { v: 1, s: 'dog' }), true)
  assert.throws(() => share.readResult(JSON.stringify({ ...dog, peer: { v: 2, s: 'cat', q: [0] } })))
  const { p, calls } = page('play', { tool: 'bingo', peer: JSON.stringify(dog) })
  p.toggleBingo(ev('id', 0)); p.finishBingo()
  assert.equal(share.viewResult(share.readResult(calls.urls.at(-1).split('?r=')[1].split('&')[0])).commonCount, 1)
  p.chooseSpecies(ev('value', 'cat')); assert.equal(p.data.peer, null)
  p.finishBingo(); assert.equal(share.readResult(calls.urls.at(-1).split('?r=')[1].split('&')[0]).peer, undefined)
})
test('年龄表单猫狗体型和品种分别保留，猫咪体型不参与换算', () => {
  const { p, calls } = page('play', { tool: 'age' })
  p.chooseSize(ev('value', 3)); p.chooseSpecies(ev('value', 'cat'))
  assert.equal(p.data.breed, ''); assert.equal(p.data.catSize, -1)
  p.calculate(); const before = share.readResult(calls.urls.at(-1).split('?r=')[1].split('&')[0])
  p.input({ currentTarget: { dataset: { field: 'breed' } }, detail: { value: '缅因猫' } })
  p.chooseSize(ev('value', 2)); p.calculate()
  assert.deepEqual(share.readResult(calls.urls.at(-1).split('?r=')[1].split('&')[0]), before)
  for (const value of [-1, 4, 0.5, 'bad']) p.chooseSize(ev('value', value))
  assert.equal(p.data.catSize, 2)
  p.chooseSpecies(ev('value', 'dog')); assert.equal(p.data.size, 3); assert.equal(p.data.breed, pet.breed)
  p.chooseSpecies(ev('value', 'cat')); assert.equal(p.data.catSize, 2); assert.equal(p.data.breed, '缅因猫')
  assert.equal(before.x, false); assert.equal(share.viewResult(before).dayLabel, '来到世界')
  assert.equal(p.data.togetherSince, undefined)
})
test('保存连点仅调用一次相册，取消后可重新保存', async () => {
  const { p, wx, calls } = page('result', { r: JSON.stringify({ v: 2, t: 'bingo', n: '糯米', s: 'dog', q: [], e: today }) })
  p.setData({ poster: '/tmp/poster.png', codeState: 'ready' })
  const saves = []; wx.saveImageToPhotosAlbum = options => saves.push(options)
  await Promise.all([p.save(), p.save()])
  assert.equal(saves.length, 1); assert.equal(saves[0].filePath, '/tmp/poster.png')
  saves[0].fail({ errMsg: 'saveImageToPhotosAlbum:fail cancel' }); saves[0].complete()
  assert.equal(p.data.saving, false); assert.equal(calls.toasts.length, 0)
  await p.save(); assert.equal(saves.length, 2)
  saves[1].success(); saves[1].complete(); assert.equal(calls.toasts.at(-1), '已保存到手机相册')
})
test('相册拒绝授权能进入设置，授权后重试', async () => {
  const { p, wx } = page('result', { r: JSON.stringify({ v: 2, t: 'bingo', n: '糯米', s: 'cat', q: [], e: today }) })
  p.setData({ poster: '/tmp/poster.png', codeState: 'ready' })
  const saves = []; let modal, settings
  wx.saveImageToPhotosAlbum = options => saves.push(options)
  wx.showModal = options => { modal = options }; wx.openSetting = options => { settings = options }
  await p.save(); saves[0].fail({ errMsg: 'saveImageToPhotosAlbum:fail auth deny' }); saves[0].complete()
  assert.equal(modal.title, '需要相册权限')
  modal.success({ confirm: true }); settings.success({ authSetting: { 'scope.writePhotosAlbum': true } })
  await Promise.resolve(); assert.equal(saves.length, 2)
})
test('分享取消不弹预览，失败和不支持分享菜单时可预览', async () => {
  const { p, wx } = page('result', { r: JSON.stringify({ v: 2, t: 'bingo', n: '糯米', s: 'dog', q: [0], e: today }) })
  p.setData({ poster: '/tmp/poster.png', codeState: 'ready' })
  let menu, previews = 0
  wx.showShareImageMenu = options => { menu = options }; wx.previewImage = () => { previews++ }
  await p.posterAction(); assert.equal(menu.path, '/tmp/poster.png'); assert.equal(menu.needShowEntrance, true)
  assert.equal(share.readResult(menu.entrancePath.split('?r=')[1].split('&')[0]).v, 2)
  menu.fail({ errMsg: 'cancel' }); assert.equal(previews, 0)
  menu.fail({ errMsg: 'failed' }); assert.equal(previews, 1)
  delete wx.showShareImageMenu; await p.posterAction(); assert.equal(previews, 2)
})
test('离开结果页后不再绘图或调用保存', async () => {
  let resolveCode, drawn = 0, saves = 0
  const { p, wx } = page('result', { r: JSON.stringify({ v: 2, t: 'bingo', n: '糯米', s: 'cat', q: [], e: today }) }, { '../../utils/fun-share': { ...share, getCode: () => new Promise(resolve => { resolveCode = resolve }), drawPoster: () => { drawn++; return '/tmp/poster.png' } } })
  wx.saveImageToPhotosAlbum = () => { saves++ }
  const generating = p.generate(); p.onUnload(); resolveCode({ filePath: '/tmp/code.png' }); await generating
  assert.equal(drawn, 0)
  p.alive = true; p.setData({ poster: '/tmp/poster.png', codeState: 'ready', generating: false })
  const saving = p.save(); p.onUnload(); await saving; assert.equal(saves, 0)
})
test('Canvas绘制三类猫狗带码卡片，禁止无小程序码图片', async () => {
  const originalWx = global.wx
  global.wx = { canvasToTempFilePath: o => { assert.equal(o.destWidth, 1200); assert.equal(o.destHeight, 1760); o.success({ tempFilePath: '/tmp/rendered.png' }) } }
  try {
    for (const species of ['dog', 'cat']) for (const result of [calculateAge({ species, size: 1, birthday: pet.birthday }, today), { v: 1, t: 'personality', n: '糯米', s: species, q: Array(10).fill(1), e: today }, { v: 2, t: 'bingo', n: '糯米', s: species, q: [0, 1, 2], e: today }]) {
      const labels = []; let images = 0
      const ctx = new Proxy({}, { get: (_, k) => k === 'fillText' ? text => labels.push(text) : k === 'drawImage' ? () => { images++ } : () => {}, set: () => true })
      const canvas = { getContext: () => ctx, createImage: () => ({ set src(value) { assert.equal(value, '/tmp/code.png'); queueMicrotask(() => this.onload()) } }) }
      await assert.rejects(share.drawPoster(canvas, share.viewResult(result), null), /miniprogram_code_required/)
      assert.equal(await share.drawPoster(canvas, share.viewResult(result), { filePath: '/tmp/code.png' }), '/tmp/rendered.png')
      assert.ok(labels.length > 10); assert.equal(images, 1)
      if (result.t === 'bingo') assert.ok(labels.includes(species === 'dog' ? '出门就兴奋' : '喜欢纸箱'))
    }
  } finally { global.wx = originalWx }
})
;(async () => {
  let failed = 0
  for (const [name, fn] of cases) { try { await fn(); console.log('✓ ' + name) } catch (e) { failed++; console.error('✗ ' + name, e) } }
  console.log(`${cases.length - failed}/${cases.length} play scenarios passed.`)
  if (failed) process.exitCode = 1
})()
