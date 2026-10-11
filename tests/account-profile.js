const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const { createRequire } = require('node:module')
const fixture = require('./fixtures/account-pet.json')
const root = path.resolve(__dirname, '..')
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const event = (key, value) => ({ currentTarget: { dataset: { key, field: key, label: key, section: key } }, detail: { value } })

function load(file, deps, wx) {
  const filename = path.join(root, file)
  const localRequire = createRequire(filename)
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, console, wx,
    require: key => Object.hasOwn(deps, key) ? deps[key] : localRequire(key)
  }, { filename })
  return module.exports
}

function setup({ demo = false, role = 'owner' } = {}) {
  const disk = { paw_data_mode: demo ? 'demo' : 'real', paw_share_status: { shared: true, role } }
  const toasts = [], writes = []
  let failWrite = false, saveResult = { ok: true }, tabVisible = true
  const wx = {
    getStorageSync: key => clone(disk[key]),
    setStorageSync: (key, value) => { if (failWrite) throw new Error('storage full'); disk[key] = clone(value); writes.push(key) },
    showToast: opts => toasts.push(opts.title),
    showTabBar: () => { tabVisible = true }, hideTabBar: () => { tabVisible = false },
    nextTick: fn => fn()
  }
  const cloud = { isAvailable: () => false }
  const store = load('utils/store.js', { './cloud-data': { saveKey: () => Promise.resolve(saveResult) } }, wx)
  store.ensureSeedData()
  disk[store.KEYS.pet] = clone(fixture)
  const cloudData = {
    getShareStatus: () => clone(disk.paw_share_status),
    createShareInvitation: () => Promise.resolve({ ok: false, skipped: true })
  }
  const factory = load('pages/shared/account-controller.js', {
    '../../utils/store': store, '../../utils/cloud': cloud,
    '../../utils/cloud-data': cloudData,
    '../../utils/cloud-album': { loadGrowthPhotos: photos => Promise.resolve(photos) },
    '../../utils/tab-navigation': { takeTarget: () => '' }
  }, wx)
  const page = factory()
  page.data = clone(page.data)
  page.setData = update => Object.entries(update).forEach(([key, value]) => {
    const parts = key.split('.')
    const last = parts.pop()
    const parent = parts.reduce((obj, part) => obj[part] || (obj[part] = {}), page.data)
    parent[last] = clone(value)
  })
  page.onShow()
  writes.length = 0
  return { page, store, disk, toasts, writes,
    begin: () => { page.openProfileSection(event('care')); page.editCareProfile() },
    setFailWrite: value => { failWrite = value }, setSaveResult: value => { saveResult = value },
    tabVisible: () => tabVisible
  }
}

const cases = []
function test(name, fn) { cases.push([name, fn]) }
test('完整假资料读取和健康字段保留', () => {
  const { page } = setup()
  for (const key of Object.keys(fixture)) assert.deepEqual(page.data.pet[key], fixture[key], key)
})
test('查看照护信息、关闭后恢复底栏', () => {
  const c = setup(); c.page.openProfileSection(event('care'))
  assert.equal(c.page.data.careProfileHasContent, true); assert.equal(c.tabVisible(), false)
  c.page.closeProfileSection(); assert.equal(c.page.data.profileSection, ''); assert.equal(c.tabVisible(), true)
})
test('取消编辑不改变存储或标签', () => {
  const c = setup(); c.begin(); c.page.onCareProfileInput(event('dietHabits', '未保存'))
  c.page.toggleCareProfileTag(event('亲人')); c.page.cancelCareProfileEdit()
  assert.equal(c.store.get('pet').dietHabits, fixture.dietHabits)
  assert.deepEqual(clone(c.store.get('pet').personalityTags), fixture.personalityTags)
  assert.equal(c.writes.length, 0)
})
for (const role of ['owner', 'admin']) test(`${role} 可统一保存五个照护字段`, async () => {
  const c = setup({ role }); c.begin()
  for (const key of ['dietHabits', 'outingHabits', 'familiarCommands', 'careNotes']) c.page.onCareProfileInput(event(key, '  新内容\n第二行  '))
  c.page.toggleCareProfileTag(event('亲人')); await c.page.saveCareProfile()
  for (const key of ['dietHabits', 'outingHabits', 'familiarCommands', 'careNotes']) assert.equal(c.store.get('pet')[key], '新内容\n第二行')
  assert.equal(c.store.get('pet').personalityTags.includes('亲人'), false)
  assert.equal(c.store.get('pet').clinic, fixture.clinic); assert.equal(c.page.data.careProfileEditing, false)
  assert.equal(c.writes.filter(k => k === 'paw_pet').length, 1)
})
test('只合并修改项，保留其他同步更新', async () => {
  const c = setup(); c.begin(); c.page.onCareProfileInput(event('dietHabits', '新的饮食记录'))
  c.disk.paw_pet.clinic = '其他家人更新的医院'; c.disk.paw_pet.outingHabits = '其他家人更新的外出习惯'
  await c.page.saveCareProfile()
  assert.equal(c.store.get('pet').clinic, '其他家人更新的医院')
  assert.equal(c.store.get('pet').outingHabits, '其他家人更新的外出习惯')
})
test('无修改不重复写入', async () => {
  const c = setup(); c.begin(); await c.page.saveCareProfile(); assert.equal(c.writes.length, 0)
})
test('选填字段和性格标签可清空', async () => {
  const c = setup(); c.begin()
  for (const key of ['dietHabits', 'outingHabits', 'familiarCommands', 'careNotes']) c.page.onCareProfileInput(event(key, ''))
  for (const tag of fixture.personalityTags) c.page.toggleCareProfileTag(event(tag))
  await c.page.saveCareProfile(); assert.equal(c.page.data.careProfileHasContent, false)
  assert.equal(c.store.get('pet').careNotes, '')
})
test('空白内容仅有空格时按未填写显示', () => {
  const c = setup(); for (const key of ['dietHabits', 'outingHabits', 'familiarCommands', 'careNotes']) c.disk.paw_pet[key] = '  '
  c.disk.paw_pet.personalityTags = []; c.page.openProfileSection(event('care'))
  assert.equal(c.page.data.careProfileHasContent, false)
})
test('标签最多六个，非法选项不写入', () => {
  const c = setup(); c.begin(); c.page.toggleCareProfileTag(event('安静')); c.page.toggleCareProfileTag(event('怕生'))
  c.page.toggleCareProfileTag(event('未知标签')); assert.equal(c.page.data.careProfileDraft.personalityTags.length, 6)
  assert.ok(c.toasts.some(text => text.includes('最多选择')))
})
test('兼容旧自定义性格标签', () => {
  const c = setup(); c.disk.paw_pet.personalityTags = ['习惯独处']; c.begin()
  assert.ok(c.page.data.careProfileTagOptions.some(item => item.label === '习惯独处' && item.selected))
})
for (const [key, max] of [['dietHabits', 300], ['outingHabits', 300], ['familiarCommands', 300], ['careNotes', 500]]) {
  test(`${key} 接受上限、阻止超长输入`, async () => {
    const c = setup(); c.begin(); c.page.onCareProfileInput(event(key, '长'.repeat(max + 1))); await c.page.saveCareProfile()
    assert.equal(c.writes.length, 0); assert.equal(c.page.data.careProfileEditing, true)
    c.page.onCareProfileInput(event(key, '长'.repeat(max))); await c.page.saveCareProfile()
    assert.equal(c.store.get('pet')[key].length, max)
  })
}
test('存储失败保留草稿，可再次保存', async () => {
  const c = setup(); c.begin(); c.page.onCareProfileInput(event('dietHabits', '保留我')); c.setFailWrite(true)
  await c.page.saveCareProfile(); assert.equal(c.page.data.careProfileEditing, true); assert.equal(c.page.data.careProfileSaving, false)
  assert.equal(c.page.data.careProfileDraft.dietHabits, '保留我')
  c.setFailWrite(false); await c.page.saveCareProfile(); assert.equal(c.store.get('pet').dietHabits, '保留我')
})
test('云端失败、本机成功时明确提示待同步', async () => {
  const c = setup(); c.setSaveResult({ ok: false }); c.begin(); c.page.onCareProfileInput(event('careNotes', '离线内容'))
  await c.page.saveCareProfile(); assert.equal(c.store.get('pet').careNotes, '离线内容')
  assert.ok(c.toasts.some(text => text.includes('已保存在本机')))
})
test('保存中防重复提交和误关闭', async () => {
  const c = setup(); c.begin(); c.page.onCareProfileInput(event('careNotes', '保存内容'))
  const first = c.page.saveCareProfile(); c.page.saveCareProfile(); c.page.closeProfileSection()
  assert.equal(c.page.data.profileSection, 'care'); await first
  assert.equal(c.writes.filter(k => k === 'paw_pet').length, 1)
})
test('临时切出再返回保留草稿和底栏状态', () => {
  const c = setup(); c.begin(); c.page.onCareProfileInput(event('careNotes', '尚未保存'))
  c.page.onHide(); c.page.onShow()
  assert.equal(c.page.data.careProfileEditing, true); assert.equal(c.page.data.careProfileDraft.careNotes, '尚未保存')
  assert.equal(c.tabVisible(), false)
})
test('只读成员可查看长资料，不能编辑和保存', async () => {
  const c = setup({ role: 'viewer' }); c.begin(); assert.equal(c.page.data.careProfileEditing, false)
  c.page.openProfileFieldEdit(event('allergies')); assert.equal(c.page.data.profileFieldValue, fixture.allergies)
  c.page.onProfileFieldInput(event('', '非法修改')); await c.page.saveProfileFieldEdit()
  c.page.editAvatar(); c.page.chooseGrowthPhotos(); c.page.openAddFamilyMember()
  assert.equal(c.writes.length, 0); assert.equal(c.page.data.familyDraftOpen, false)
})
test('编辑途中权限降为只读时撤掉编辑入口', () => {
  const c = setup(); c.begin(); c.disk.paw_share_status.role = 'viewer'; c.page.onShow()
  assert.equal(c.page.data.shareReadOnly, true); assert.equal(c.page.data.careProfileEditing, false)
})
test('即使页面权限过期，存储层仍拒绝只读写入', async () => {
  const c = setup(); c.begin(); c.page.onCareProfileInput(event('careNotes', '非法修改')); c.disk.paw_share_status.role = 'viewer'
  await c.page.saveCareProfile(); assert.equal(c.store.get('pet').careNotes, fixture.careNotes)
})
test('基本资料可保存，非法生日被拒绝', async () => {
  const c = setup(); c.page.openProfileFieldEdit(event('name')); c.page.onProfileFieldInput(event('', '小糯米'))
  await c.page.saveProfileFieldEdit(); assert.equal(c.store.get('pet').name, '小糯米')
  c.page.openProfileFieldEdit(event('birthday')); c.page.onProfileFieldDate({ detail: { value: '2099-01-01' } })
  await c.page.saveProfileFieldEdit(); assert.equal(c.store.get('pet').birthday, fixture.birthday)
})
test('修改健康资料不删除照护字段', async () => {
  const c = setup(); c.page.openProfileFieldEdit(event('clinic')); c.page.onProfileFieldInput(event('', '新医院'))
  await c.page.saveProfileFieldEdit(); assert.equal(c.store.get('pet').clinic, '新医院')
  assert.equal(c.store.get('pet').careNotes, fixture.careNotes)
})
test('相册和家庭面板可打开并返回', async () => {
  const c = setup({ demo: true }); c.page.openGrowthAlbum(); await Promise.resolve()
  assert.equal(c.page.data.growthPhotos.length, 22); c.page.closeGrowthAlbum(); assert.equal(c.tabVisible(), true)
  c.page.openFamilyManager(); assert.equal(c.page.data.familyMembers.length, 3)
  c.page.closeFamilyManager(); assert.equal(c.tabVisible(), true)
})
test('演示模式不会覆盖正式资料', async () => {
  const c = setup({ demo: true }); c.disk.paw_pet = { name: '真实资料' }; c.begin()
  c.page.onCareProfileInput(event('careNotes', '假数据')); await c.page.saveCareProfile()
  assert.equal(c.disk.paw_pet.name, '真实资料'); assert.equal(c.disk.demo_paw_pet.careNotes, '假数据')
})
test('相册只读视图隐藏上传和删除入口', () => {
  const wxml = fs.readFileSync(path.join(root, 'pages/account/account.wxml'), 'utf8')
  for (const handler of ['chooseGrowthPhotos', 'deleteGrowthPhoto']) {
    const tag = wxml.match(new RegExp(`<[^>]*(?:bindtap|catchtap)="${handler}"[^>]*>`))
    assert.ok(tag, handler)
    assert.ok(tag[0].includes('wx:if="{{!shareReadOnly}}"'), handler)
  }
})
test('家庭共享添加按钮宽度限制在头部网格内', () => {
  const css = fs.readFileSync(path.join(root, 'pages/account/account.wxss'), 'utf8')
  assert.match(css, /\.family-add\s*\{[^}]*width:\s*100%!important/)
  assert.match(css, /\.family-top\s*\{[^}]*minmax\(0,\s*1fr\)/)
})

;(async () => {
  let failed = 0
  for (const [name, fn] of cases) {
    try { await fn(); console.log(`✓ ${name}`) }
    catch (error) { failed++; console.error(`✗ ${name}\n${error.stack}`) }
  }
  console.log(`${cases.length - failed}/${cases.length} account profile scenarios passed.`)
  if (failed) process.exitCode = 1
})()
