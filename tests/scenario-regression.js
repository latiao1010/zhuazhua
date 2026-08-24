const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const ROOT = path.resolve(__dirname, '..')
const TODAY = '2026-07-30'

function offsetDayKey(daysAgo) {
  const date = new Date(`${TODAY}T00:00:00`)
  date.setDate(date.getDate() - daysAgo)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function setPath(target, key, value) {
  const parts = key.split('.')
  let current = target
  parts.slice(0, -1).forEach(part => {
    if (!current[part] || typeof current[part] !== 'object') current[part] = {}
    current = current[part]
  })
  current[parts[parts.length - 1]] = value
}

function pageContext(page, data = {}) {
  const context = {
    ...page,
    data: { ...clone(page.data), ...clone(data) },
    setData(update) {
      Object.keys(update).forEach(key => setPath(this.data, key, update[key]))
    }
  }
  return context
}

function defaultCare() {
  return {
    deworming: '2026-08-06', dewormingCycle: 3, dewormingLast: '',
    medicine: '2026-08-29', medicineCycle: 30, medicineLast: '',
    vaccine: '2027-07-30', vaccineCycle: 12, vaccineLast: '',
    bath: '2026-08-13', bathCycle: 14, bathLast: '',
    dental: TODAY, dentalCycle: 1, dentalLast: '',
    nail: '2026-08-29', nailCycle: 30, nailLast: ''
  }
}

function makeState(overrides = {}) {
  const pet = {
    name: '糯米', breed: '柯基', sex: '男孩', birthday: '2023-03-16',
    togetherSince: '2023-03-16', weight: 11.2, avatar: '/assets/momo-chibi.png'
  }
  return {
    pet,
    feeds: [],
    stools: [],
    waters: [],
    walks: [],
    feedGoal: 260,
    waterGoal: 616,
    chats: [],
    diaries: [],
    care: defaultCare(),
    careRecords: [],
    supplies: {
      dogFood: { productName: '', openedDate: '', packageAmount: '', history: [] },
      snack: { productName: '', openedDate: '', packageAmount: '', history: [] }
    },
    familyMembers: [{ id: 'owner', name: '我', relation: '主人', role: 'owner', roleLabel: '主人', status: '已加入', joinedAt: TODAY, lastActive: TODAY }],
    weightRecords: [{ id: 1, createdAt: 1, dayKey: '2026-07-01', time: '08:00', weight: 11, photoPath: '' }],
    ...clone(overrides)
  }
}

function makeStore(state) {
  return {
    get(key) {
      const value = state[key]
      return value === undefined ? [] : value
    },
    set(key, value) {
      state[key] = value
      return Promise.resolve({ ok: true })
    },
    todayKey() {
      return TODAY
    },
    getDefaultCareSchedule: defaultCare,
    normalizeCareSchedule(value) {
      return { ...defaultCare(), ...(value || {}) }
    },
    normalizeSupplies(value) {
      const defaults = makeState().supplies
      return {
        dogFood: { ...defaults.dogFood, ...((value && value.dogFood) || {}) },
        snack: { ...defaults.snack, ...((value && value.snack) || {}) }
      }
    },
    normalizeFamilyMembers(value) {
      const roles = { owner: '主人', admin: '共同照护', viewer: '只读查看' }
      const members = Array.isArray(value) ? value : []
      const normalized = members.map((item, index) => {
        const role = roles[item.role] ? item.role : index === 0 ? 'owner' : 'admin'
        return { ...item, role, roleLabel: roles[role], name: item.name || '家庭成员', relation: item.relation || '家人', status: item.status || '已加入', joinedAt: item.joinedAt || TODAY }
      })
      return normalized.some(item => item.role === 'owner')
        ? normalized
        : [{ id: 'owner', name: '我', relation: '主人', role: 'owner', roleLabel: '主人', status: '已加入', joinedAt: TODAY }, ...normalized]
    }
  }
}

function makeWx() {
  const calls = {
    toasts: [], saved: [], removed: [], previews: [], navigations: [], switches: [],
    tabShows: 0, tabHides: 0, vibrations: 0, clipboard: [], albums: [], settings: 0
  }
  let savedIndex = 0
  const wx = {
    showToast(options) { calls.toasts.push(options) },
    showTabBar() { calls.tabShows += 1 },
    hideTabBar() { calls.tabHides += 1 },
    showModal(options) { options.success({ confirm: true, cancel: false }) },
    showActionSheet(options) { options.success({ tapIndex: 0 }) },
    saveFile(options) {
      savedIndex += 1
      const savedFilePath = `wxfile://saved-${savedIndex}.jpg`
      calls.saved.push({ tempFilePath: options.tempFilePath, savedFilePath })
      options.success({ savedFilePath })
    },
    removeSavedFile(options) { calls.removed.push(options.filePath); if (options.success) options.success({}) },
    chooseMedia() {},
    previewImage(options) { calls.previews.push(options) },
    saveImageToPhotosAlbum(options) { calls.albums.push(options.filePath); options.success({}) },
    openSetting() { calls.settings += 1 },
    navigateTo(options) { calls.navigations.push(options.url) },
    switchTab(options) { calls.switches.push(options.url) },
    setNavigationBarTitle() {},
    vibrateShort() { calls.vibrations += 1 },
    setClipboardData(options) { calls.clipboard.push(options.data) }
  }
  return { wx, calls }
}

function loadPage(relativePath, store, wx, weather) {
  const filename = path.join(ROOT, relativePath)
  delete require.cache[require.resolve(filename)]
  const knowledgePath = path.join(ROOT, 'utils/pet-knowledge.js')
  if (require.cache[knowledgePath]) delete require.cache[knowledgePath]
  const originalLoad = Module._load
  const originalPage = global.Page
  let captured
  global.wx = wx
  global.Page = config => { captured = config }
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../utils/store') return store
    if (request === './store' && parent && parent.filename === knowledgePath) return store
    if (request === '../../utils/weather') return weather || { getWeather: () => Promise.resolve({ apparent: 25, rainTime: '' }) }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    require(filename)
  } finally {
    Module._load = originalLoad
    global.Page = originalPage
  }
  if (!captured) throw new Error(`Page was not registered: ${relativePath}`)
  return captured
}

const results = []

async function scenario(name, run) {
  try {
    await run()
    results.push({ name, ok: true })
    console.log(`✓ ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error })
    console.error(`✗ ${name}\n  ${error.stack || error.message}`)
  }
}

function withTimers(run) {
  const originalSetTimeout = global.setTimeout
  const originalClearTimeout = global.clearTimeout
  let nextId = 1
  const timers = new Map()
  global.setTimeout = callback => {
    const id = nextId
    nextId += 1
    timers.set(id, callback)
    return id
  }
  global.clearTimeout = id => timers.delete(id)
  const flush = () => {
    while (timers.size) {
      const pending = [...timers.entries()]
      timers.clear()
      pending.forEach(([, callback]) => callback())
    }
  }
  try {
    return run(flush)
  } finally {
    global.setTimeout = originalSetTimeout
    global.clearTimeout = originalClearTimeout
  }
}

async function main() {
  await scenario('空存储能初始化覆盖半年的全部模块假数据', () => {
    const storage = {}
    const storePath = path.join(ROOT, 'utils/store.js')
    delete require.cache[require.resolve(storePath)]
    const originalWx = global.wx
    global.wx = {
      getStorageSync(key) { return storage[key] },
      setStorageSync(key, value) { storage[key] = clone(value) },
      getAccountInfoSync() { return { miniProgram: { envVersion: 'develop' } } }
    }
    const store = require(storePath)
    store.ensureSeedData()
    global.wx = originalWx
    assert.strictEqual(storage.paw_pet.name, '糯米')
    ;['paw_feeds', 'paw_diaries', 'paw_chats', 'paw_stools', 'paw_water_records', 'paw_walk_records', 'paw_care_records', 'paw_weight_records', 'paw_growth_photos']
      .forEach(key => assert.ok(Array.isArray(storage[key]), `${key} should be an array`))
    assert.ok(storage.paw_feeds.every(item => /^\d{4}-\d{2}-\d{2}$/.test(item.dayKey)))
    assert.ok(storage.paw_feeds.some(item => item.dayKey === store.todayKey()))
    assert.ok(storage.paw_feeds.length > 450)
    assert.ok(storage.paw_stools.length > 380)
    assert.ok(storage.paw_water_records.length > 740)
    assert.ok(storage.paw_walk_records.length > 310)
    const feedDays = [...new Set(storage.paw_feeds.map(item => item.dayKey))].sort()
    assert.ok(feedDays.length >= 180)
    assert.ok((new Date(`${feedDays[feedDays.length - 1]}T00:00:00`) - new Date(`${feedDays[0]}T00:00:00`)) / 86400000 >= 180)
    assert.ok(storage.paw_weight_records.length >= 27)
    assert.deepStrictEqual([...new Set(storage.paw_care_records.map(item => item.key))].sort(), ['bath', 'dental', 'deworming', 'medicine', 'nail', 'vaccine'])
    assert.ok(storage.paw_care_records.length >= 40)
    assert.ok(storage.paw_growth_photos.length >= 17)
    assert.ok(storage.paw_diaries.length >= 14)
    assert.ok(storage.paw_chats.length >= 12)
    assert.ok(storage.paw_chats.some(item => item.source === 'local-knowledge'))
    const photoCounts = storage.paw_growth_photos.reduce((counts, item) => {
      counts[item.dayKey] = (counts[item.dayKey] || 0) + 1
      return counts
    }, {})
    assert.ok(Math.max(...Object.values(photoCounts)) >= 2)
    const feedCounts = storage.paw_feeds.reduce((counts, item) => {
      counts[item.dayKey] = (counts[item.dayKey] || 0) + 1
      return counts
    }, {})
    assert.ok(Math.max(...Object.values(feedCounts)) >= 6)
    assert.strictEqual(storage.paw_feed_trend_demo_v1, true)
    assert.strictEqual(storage.paw_daily_trend_demo_v1, true)
    assert.strictEqual(storage.paw_two_month_demo_v1, true)
    assert.strictEqual(storage.paw_six_month_demo_v1, 'six-month-v1')
    assert.ok(storage.paw_supply_records.dogFood.openedDate)
    assert.ok(storage.paw_supply_records.snack.openedDate)
    assert.ok(storage.paw_supply_records.dogFood.history.length >= 4)
    assert.ok(storage.paw_supply_records.snack.history.length >= 4)
    assert.ok(storage.paw_care_schedule.dentalCycle > 0)
    assert.ok(storage.paw_care_schedule.dentalLast)
    assert.strictEqual(storage.paw_generated_avatar, undefined)
    assert.strictEqual(storage.paw_avatar_generation_status, undefined)
    assert.strictEqual(storage.paw_feed_goal, 260)
    assert.strictEqual(storage.paw_water_goal, 616)
  })

  await scenario('旧版和损坏的本地数据会被安全修复', () => {
    const storage = {
      paw_pet: { name: '测试狗', breed: '柴犬', birthday: '错误日期', weight: 'abc' },
      paw_feeds: { broken: true },
      paw_stools: [{ id: 1, condition: '正常成形' }],
      paw_waters: 'broken',
      paw_walks: null,
      paw_chats: {},
      paw_diaries: [],
      paw_care_records: 'broken',
      paw_weight_records: {},
      paw_care_schedule: { dental: 'not-a-date', dentalCycle: 'abc' },
      paw_supply_records: { dogFood: { productName: 99, openedDate: 'bad', packageAmount: 'NaN', history: 'bad' } }
    }
    const storePath = path.join(ROOT, 'utils/store.js')
    delete require.cache[require.resolve(storePath)]
    const originalWx = global.wx
    global.wx = {
      getStorageSync(key) { return storage[key] },
      setStorageSync(key, value) { storage[key] = clone(value) }
    }
    const store = require(storePath)
    store.ensureSeedData()
    const pet = store.get('pet')
    const care = store.get('care')
    const supplies = store.get('supplies')
    const feeds = store.get('feeds')
    const waters = store.get('waters')
    const careRecords = store.get('careRecords')
    global.wx = originalWx
    assert.ok(Array.isArray(feeds))
    assert.ok(Array.isArray(waters))
    assert.ok(Array.isArray(careRecords))
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(pet.birthday))
    assert.ok(Number(pet.weight) > 0)
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(care.dental))
    assert.ok(Number.isFinite(care.dentalCycle) && care.dentalCycle > 0)
    assert.strictEqual(typeof supplies.dogFood.productName, 'string')
    assert.ok(Array.isArray(supplies.dogFood.history))
  })

  await scenario('四类日常记录可在空数据和多数据间切换', () => {
    const state = makeState({
      feeds: [
        { id: 1, dayKey: TODAY, date: '今天', time: '08:00', type: '早餐', food: '犬粮', amount: '90g', icon: '🥣' },
        { id: 2, dayKey: TODAY, date: '今天', time: '12:00', type: '零食', food: '鸡肉干', amount: '15g', icon: '🦴' },
        { id: 6, dayKey: '2026-07-29', date: '今天', time: '18:00', type: '晚餐', food: '犬粮', amount: '95g', icon: '🥣' }
      ],
      stools: [
        { id: 3, dayKey: TODAY, date: '今天', time: '09:00', condition: '稀便', color: '棕色', abnormal: true },
        { id: 7, dayKey: '2026-07-28', date: '今天', time: '09:10', condition: '正常成形', color: '棕色', abnormal: false },
        { id: 10, dayKey: '2026-07-28', date: '今天', time: '15:20', condition: '正常成形', color: '棕色', abnormal: false },
        { id: 11, dayKey: '2026-07-28', date: '今天', time: '21:00', condition: '偏软', color: '黄色', abnormal: true }
      ],
      waters: [
        { id: 4, dayKey: TODAY, date: '今天', time: '10:00', amount: '180ml' },
        { id: 8, dayKey: '2026-07-29', date: '今天', time: '15:00', amount: '160ml' },
        { id: 12, dayKey: '2026-07-29', date: '今天', time: '11:00', amount: '90ml' },
        { id: 13, dayKey: '2026-07-29', date: '今天', time: '19:00', amount: '120ml' }
      ],
      walks: [
        { id: 5, dayKey: TODAY, date: '今天', time: '18:00', duration: 35, distance: '1.5' },
        { id: 9, dayKey: '2026-07-20', date: '今天', time: '19:00', duration: 30, distance: '1.2' },
        { id: 14, dayKey: '2026-07-20', date: '今天', time: '08:00', duration: 45, distance: '2.1' }
      ],
    })
    const { wx } = makeWx()
    const page = loadPage('pages/feed/feed.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onLoad.call(context, { type: 'feed', single: '0' })
    page.onShow.call(context)
    assert.strictEqual(context.data.rows.length, 2)
    assert.strictEqual(context.data.summary.value, 105)
    assert.strictEqual(context.data.feedTrend.days.length, 30)
    assert.strictEqual(context.data.feedTrend.days[29].total, 105)
    assert.strictEqual(context.data.feedTrend.days[29].count, 2)
    assert.strictEqual(context.data.feedTrend.days[28].total, 95)
    page.onTrendDay.call(context, { currentTarget: { dataset: { date: '2026-07-29' } } })
    assert.strictEqual(context.data.rows.length, 1)
    assert.strictEqual(context.data.summary.value, 95)
    assert.strictEqual(context.data.rows[0].date, '昨天')
    assert.strictEqual(context.data.feedTrend.days[29].dayKey, TODAY)
    assert.strictEqual(context.data.feedTrend.days[28].selected, true)
    page.onRecordDate.call(context, { detail: { value: '2026-07-29' } })
    assert.strictEqual(context.data.feedTrend.days[29].dayKey, '2026-07-29')
    page.switchType.call(context, { currentTarget: { dataset: { type: 'stool' } } })
    page.onRecordDate.call(context, { detail: { value: '2026-07-28' } })
    assert.strictEqual(context.data.rows.length, 3)
    assert.strictEqual(context.data.rows[0].date, '7月28日')
    assert.strictEqual(context.data.feedTrend.theme, 'stool')
    assert.strictEqual(context.data.feedTrend.days[29].total, 3)
    assert.strictEqual(context.data.feedTrend.days[29].abnormal, 1)
    assert.strictEqual(context.data.feedTrend.days[29].countText, '1异常')
    page.onTrendDay.call(context, { currentTarget: { dataset: { date: '2026-07-28' } } })
    assert.strictEqual(context.data.summary.count, 3)
    assert.strictEqual(context.data.feedTrend.days[29].selected, true)
    page.switchType.call(context, { currentTarget: { dataset: { type: 'water' } } })
    page.onRecordDate.call(context, { detail: { value: '2026-07-29' } })
    assert.strictEqual(context.data.rows.length, 3)
    assert.strictEqual(context.data.summary.value, 370)
    assert.strictEqual(context.data.feedTrend.theme, 'water')
    assert.strictEqual(context.data.feedTrend.days[29].total, 370)
    assert.strictEqual(context.data.feedTrend.days[29].count, 3)
    page.onTrendDay.call(context, { currentTarget: { dataset: { date: '2026-07-29' } } })
    assert.strictEqual(context.data.rows.length, 3)
    page.switchType.call(context, { currentTarget: { dataset: { type: 'walk' } } })
    page.onRecordDate.call(context, { detail: { value: '2026-07-20' } })
    assert.strictEqual(context.data.rows.length, 2)
    assert.strictEqual(context.data.feedTrend.theme, 'walk')
    assert.strictEqual(context.data.feedTrend.days[29].total, 75)
    assert.strictEqual(context.data.feedTrend.days[29].count, 2)
    page.onTrendDay.call(context, { currentTarget: { dataset: { date: '2026-07-20' } } })
    assert.strictEqual(context.data.summary.count, 2)
  })

  await scenario('非法喂食、饮水、散步数值不会写入记录', () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const page = loadPage('pages/feed/feed.js', makeStore(state), wx)
    const context = pageContext(page)
    const invalidFeeds = ['abc', '0', '-20', 'Infinity']
    invalidFeeds.forEach(amount => {
      context.data.currentType = 'feed'
      context.data.draft = { type: '早餐', food: '犬粮', amount, time: '08:00' }
      page.saveFeed.call(context)
    })
    assert.strictEqual(state.feeds.length, 0)
    context.data.currentType = 'water'
    context.data.draft = { amount: '-100', note: '', time: '09:00' }
    page.saveWater.call(context)
    context.data.currentType = 'walk'
    context.data.draft = { duration: 'abc', distance: '1', note: '', time: '18:00' }
    page.saveWalk.call(context)
    assert.strictEqual(state.waters.length, 0)
    assert.strictEqual(state.walks.length, 0)
    assert.ok(calls.toasts.length >= invalidFeeds.length + 2)
  })

  await scenario('有效记录保存后立即进入统计', () => {
    const state = makeState()
    const { wx } = makeWx()
    const page = loadPage('pages/feed/feed.js', makeStore(state), wx)
    const context = pageContext(page)
    context.data.currentType = 'feed'
    context.data.draft = { type: '晚餐', food: ' 低敏犬粮 ', amount: '95.5', time: '18:00' }
    page.saveFeed.call(context)
    assert.strictEqual(state.feeds.length, 1)
    assert.strictEqual(state.feeds[0].food, '低敏犬粮')
    assert.strictEqual(context.data.summary.value, 95.5)
    context.data.currentType = 'stool'
    context.data.draft = { condition: '稀便', color: '红色', note: '观察', time: '19:00' }
    page.saveStool.call(context)
    assert.strictEqual(state.stools[0].abnormal, true)
  })

  await scenario('每日喂食目标可修改、校验并立即更新统计', () => {
    const state = makeState({
      feedGoal: 260,
      feeds: [
        { id: 1, dayKey: TODAY, date: '今天', time: '08:00', type: '早餐', food: '犬粮', amount: '108g', icon: '🥣' },
        { id: 2, dayKey: TODAY, date: '今天', time: '18:00', type: '晚餐', food: '犬粮', amount: '95g', icon: '🥣' }
      ]
    })
    const { wx, calls } = makeWx()
    const page = loadPage('pages/feed/feed.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onLoad.call(context, { type: 'feed' })
    page.onShow.call(context)
    assert.strictEqual(context.data.summary.goalText, '目标 260g')
    page.openFeedGoalEditor.call(context)
    assert.strictEqual(context.data.editingFeedGoal, true)
    assert.strictEqual(context.data.feedGoalDraft, '260')
    page.onFeedGoalInput.call(context, { detail: { value: '300' } })
    page.saveFeedGoal.call(context)
    assert.strictEqual(state.feedGoal, 300)
    assert.strictEqual(context.data.editingFeedGoal, false)
    assert.strictEqual(context.data.summary.goalText, '目标 300g')
    assert.strictEqual(context.data.summary.progress, 68)
    assert.strictEqual(context.data.summary.footRight, '还差 97g')
    assert.strictEqual(context.data.feedTrend.goalText, '目标线 300g')
    page.openFeedGoalEditor.call(context)
    page.onFeedGoalInput.call(context, { detail: { value: '0' } })
    page.saveFeedGoal.call(context)
    assert.strictEqual(state.feedGoal, 300)
    assert.strictEqual(context.data.editingFeedGoal, true)
    assert.ok(calls.toasts.some(item => item.title.includes('1～5000')))
  })

  await scenario('每日饮水目标可修改、校验并立即更新统计', () => {
    const state = makeState({
      waterGoal: 616,
      waters: [
        { id: 1, dayKey: TODAY, date: '今天', time: '09:00', amount: '180ml', icon: '💧' },
        { id: 2, dayKey: TODAY, date: '今天', time: '15:00', amount: '160ml', icon: '💧' }
      ]
    })
    const { wx, calls } = makeWx()
    const page = loadPage('pages/feed/feed.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onLoad.call(context, { type: 'water' })
    page.onShow.call(context)
    assert.strictEqual(context.data.summary.goalText, '目标 616ml')
    page.openWaterGoalEditor.call(context)
    assert.strictEqual(context.data.editingWaterGoal, true)
    assert.strictEqual(context.data.waterGoalDraft, '616')
    page.onWaterGoalInput.call(context, { detail: { value: '700' } })
    page.saveWaterGoal.call(context)
    assert.strictEqual(state.waterGoal, 700)
    assert.strictEqual(context.data.editingWaterGoal, false)
    assert.strictEqual(context.data.summary.goalText, '目标 700ml')
    assert.strictEqual(context.data.summary.progress, 49)
    assert.strictEqual(context.data.summary.footRight, '还差 360ml')
    assert.strictEqual(context.data.feedTrend.goalText, '目标线 700ml')
    page.openWaterGoalEditor.call(context)
    page.onWaterGoalInput.call(context, { detail: { value: '10001' } })
    page.saveWaterGoal.call(context)
    assert.strictEqual(state.waterGoal, 700)
    assert.strictEqual(context.data.editingWaterGoal, true)
    assert.ok(calls.toasts.some(item => item.title.includes('1～10000')))
  })

  await scenario('我的页全屏入口和所有生命周期都会正确恢复 Tab', () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onShow.call(context)
    page.openProfileEdit.call(context)
    assert.strictEqual(context.data.profileEditOpen, true)
    page.closeProfileEdit.call(context)
    page.openCareDetail.call(context, { currentTarget: { dataset: { key: 'dental' } } })
    assert.strictEqual(context.data.careDetailOpen, true)
    page.closeCareDetail.call(context)
    page.onHide.call(context)
    page.onUnload.call(context)
    assert.strictEqual(calls.tabHides, 2)
    assert.strictEqual(calls.tabShows, 5)
  })

  await scenario('体重与护理周期拒绝非数字并保留原档案', () => {
    const state = makeState()
    const originalPet = clone(state.pet)
    const { wx, calls } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page, {
      pet: originalPet,
      draft: { ...originalPet, weight: 'abc' },
      careDraft: defaultCare(),
      today: TODAY
    })
    page.savePet.call(context)
    assert.deepStrictEqual(state.pet, originalPet)
    context.data.draft = { ...originalPet, weight: 11.5 }
    context.data.careDraft = { ...defaultCare(), bathCycle: 'abc' }
    page.savePet.call(context)
    assert.deepStrictEqual(state.pet, originalPet)
    assert.ok(calls.toasts.length >= 2)
  })

  await scenario('体重变化会形成趋势记录，成长照片仅在相册管理', () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const store = makeStore(state)
    const account = loadPage('pages/account/account.js', store, wx)
    const accountContext = pageContext(account, {
      pet: clone(state.pet),
      draft: { ...state.pet, weight: 11.6 },
      careDraft: defaultCare(),
      today: TODAY
    })
    account.savePet.call(accountContext)
    assert.strictEqual(state.weightRecords.length, 2)
    assert.strictEqual(state.weightRecords[0].weight, 11.6)
    assert.ok(!state.weightRecords[0].photoPath)
    const profile = loadPage('pages/profile/profile.js', store, wx, { getWeather: () => Promise.resolve({ apparent: 25, rainTime: '' }) })
    const profileContext = pageContext(profile)
    profile.refresh.call(profileContext)
    profile.openWeightTrend.call(profileContext)
    assert.strictEqual(typeof profile.previewWeightPhoto, 'undefined')
    const profileWxml = fs.readFileSync(path.join(ROOT, 'pages/profile/profile.wxml'), 'utf8')
    assert.ok(!profileWxml.includes('成长照片'))
    assert.ok(!profileWxml.includes('未添加照片'))
  })

  await scenario('编辑资料头像会上传云存储并更新档案头像', async () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    wx.cloud = {
      init() {},
      callFunction() { return Promise.resolve({ result: { ok: true } }) },
      uploadFile(options) {
        calls.saved.push({ tempFilePath: options.filePath, savedFilePath: `cloud://env/${options.cloudPath}` })
        return Promise.resolve({ fileID: `cloud://env/${options.cloudPath}` })
      }
    }
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page, {
      pet: clone(state.pet),
      draft: { ...state.pet, weight: 11.2 },
      careDraft: defaultCare(),
      today: TODAY,
      newAvatarTemp: 'wxfile://new-profile-avatar.png'
    })
    page.savePet.call(context)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    assert.ok(state.pet.avatar.startsWith('cloud://env/pet-avatars/'))
    assert.strictEqual(context.data.profileEditOpen, false)
    assert.strictEqual(calls.toasts[0].title, '资料已保存')
  })

  await scenario('资料卡每个字段可单独点开修改，右上角不再放统一修改入口', async () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onShow.call(context)

    page.openProfileFieldEdit.call(context, { currentTarget: { dataset: { field: 'name' } } })
    assert.strictEqual(context.data.profileFieldTitle, '昵称')
    page.onProfileFieldInput.call(context, { detail: { value: '小糯米' } })
    await page.saveProfileFieldEdit.call(context)
    assert.strictEqual(state.pet.name, '小糯米')

    page.openProfileFieldEdit.call(context, { currentTarget: { dataset: { field: 'breed' } } })
    const breedIndex = context.data.breedOptions.indexOf('贵宾')
    assert.ok(breedIndex >= 0)
    page.onProfileFieldBreed.call(context, { detail: { value: String(breedIndex) } })
    await page.saveProfileFieldEdit.call(context)
    assert.strictEqual(state.pet.breed, '贵宾')

    page.openProfileFieldEdit.call(context, { currentTarget: { dataset: { field: 'weight' } } })
    page.onProfileFieldWeight.call(context, { detail: { value: [10, 7] } })
    await page.saveProfileFieldEdit.call(context)
    assert.strictEqual(state.pet.weight, 11.7)
    assert.strictEqual(state.weightRecords[0].weight, 11.7)

    page.openProfileFieldEdit.call(context, { currentTarget: { dataset: { field: 'sex' } } })
    page.onProfileFieldSex.call(context, { detail: { value: '1' } })
    await page.saveProfileFieldEdit.call(context)
    assert.strictEqual(state.pet.sex, '女孩')

    const accountWxml = fs.readFileSync(path.join(ROOT, 'pages/account/account.wxml'), 'utf8')
    assert.ok(!accountWxml.includes('settings-icon" bindtap="openProfileEdit"'))
    assert.ok(accountWxml.includes('data-field="name" bindtap="openProfileFieldEdit"'))
    assert.ok(accountWxml.includes('data-field="birthday" bindtap="openProfileFieldEdit"'))
    assert.ok(accountWxml.includes('range="{{breedOptions}}"'))
    assert.ok(accountWxml.includes('mode="multiSelector" range="{{weightPickerRanges}}"'))
    assert.ok(calls.toasts.some(item => item.title === '资料已保存'))
  })

  await scenario('家庭共享可添加成员、调整权限、复制共享码并移除成员', async () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onShow.call(context)
    page.openFamilyManager.call(context)
    assert.strictEqual(context.data.familyOpen, true)
    assert.strictEqual(context.data.familyMembers.length, 1)

    page.openAddFamilyMember.call(context)
    page.onFamilyNameInput.call(context, { detail: { value: '妈妈' } })
    page.onFamilyRelation.call(context, { detail: { value: '2' } })
    page.onFamilyRole.call(context, { detail: { value: '0' } })
    await page.saveFamilyMember.call(context)
    assert.strictEqual(state.familyMembers.length, 2)
    assert.strictEqual(state.familyMembers[1].name, '妈妈')
    assert.strictEqual(state.familyMembers[1].role, 'admin')

    await page.changeFamilyMemberRole.call(context, { currentTarget: { dataset: { index: 1 } }, detail: { value: '1' } })
    assert.strictEqual(state.familyMembers[1].role, 'viewer')

    page.copyInviteCode.call(context)
    assert.ok(calls.clipboard[0].startsWith('ZZ-'))
    const share = page.onShareAppMessage.call(context)
    assert.ok(share.title.includes('邀请你一起照顾'))
    assert.ok(share.path.includes('shareCode='))

    page.removeFamilyMember.call(context, { currentTarget: { dataset: { index: 1 } } })
    await Promise.resolve()
    assert.strictEqual(state.familyMembers.length, 1)
    assert.ok(calls.toasts.some(item => item.title.includes('移除')))

    const accountWxml = fs.readFileSync(path.join(ROOT, 'pages/account/account.wxml'), 'utf8')
    assert.ok(accountWxml.includes('家庭成员共享管理'))
    assert.ok(accountWxml.includes('open-type="share"'))
  })

  await scenario('只读共享成员不能在我的页修改资料或管理成员', () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page, {
      pet: clone(state.pet),
      familyMembers: clone(state.familyMembers).map(item => ({ ...item, initial: item.name.slice(0, 1) })),
      shareShared: true,
      shareRole: 'viewer',
      shareRoleLabel: '只读查看',
      shareReadOnly: true
    })
    page.openProfileFieldEdit.call(context, { currentTarget: { dataset: { field: 'name' } } })
    assert.strictEqual(context.data.profileFieldEditOpen, false)
    page.editAvatar.call(context)
    page.openAddFamilyMember.call(context)
    assert.strictEqual(context.data.familyDraftOpen, false)
    assert.ok(calls.toasts.some(item => item.title.includes('只读') || item.title.includes('只有主人')))
  })

  await scenario('资料卡头像点击后会直接上传并替换头像', async () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    wx.chooseMedia = options => options.success({ tempFiles: [{ tempFilePath: 'wxfile://inline-avatar.jpg' }] })
    wx.cloud = {
      init() {},
      callFunction() { return Promise.resolve({ result: { ok: true } }) },
      uploadFile(options) {
        calls.saved.push({ tempFilePath: options.filePath, savedFilePath: `cloud://env/${options.cloudPath}` })
        return Promise.resolve({ fileID: `cloud://env/${options.cloudPath}` })
      }
    }
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onShow.call(context)
    await page.editAvatar.call(context)
    assert.ok(state.pet.avatar.startsWith('cloud://env/pet-avatars/'))
    assert.strictEqual(context.data.profileFieldSaving, false)
    assert.ok(calls.toasts.some(item => item.title === '头像已更新'))
  })

  await scenario('成长相册照片可以确认后删除且不会误触预览', async () => {
    const state = makeState({
      growthPhotos: [
        { id: 'photo-1', path: 'wxfile://growth-delete.jpg', dayKey: TODAY, time: '09:00', createdAt: 100 },
        { id: 'photo-2', path: 'wxfile://growth-keep.jpg', dayKey: TODAY, time: '10:00', createdAt: 200 }
      ]
    })
    const { wx, calls } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onShow.call(context)
    assert.strictEqual(context.data.growthPhotos.length, 2)
    const deleteIndex = context.data.growthPhotos.findIndex(item => item.id === 'photo-1')
    page.deleteGrowthPhoto.call(context, { currentTarget: { dataset: { index: deleteIndex } } })
    await Promise.resolve()
    await Promise.resolve()
    assert.strictEqual(state.growthPhotos.length, 1)
    assert.strictEqual(context.data.growthPhotos.length, 1)
    assert.strictEqual(context.data.growthPhotos[0].id, 'photo-2')
    assert.ok(calls.removed.includes('wxfile://growth-delete.jpg'))
    assert.strictEqual(calls.previews.length, 0)
    assert.ok(calls.toasts.some(item => item.title.includes('删除')))
  })

  await scenario('30 条体重假数据会正确去重、排序并限制图表数量', () => {
    const records = []
    for (let index = 0; index < 30; index += 1) {
      const day = String((index % 20) + 1).padStart(2, '0')
      records.push({
        id: index + 1,
        createdAt: 1000 + index,
        dayKey: `2026-07-${day}`,
        time: `${String(index % 24).padStart(2, '0')}:00`,
        weight: 10 + index / 10,
        photoPath: index % 3 === 0 ? `wxfile://growth-${index}.jpg` : ''
      })
    }
    const state = makeState({ weightRecords: records })
    const { wx } = makeWx()
    const profile = loadPage('pages/profile/profile.js', makeStore(state), wx, { getWeather: () => Promise.resolve({ apparent: 25, rainTime: '' }) })
    const context = pageContext(profile)
    profile.refresh.call(context)
    assert.strictEqual(context.data.weightTrend.bars.length, 8)
    assert.strictEqual(context.data.weightTrend.history.length, 30)
    assert.ok(context.data.weightTrend.history[0].createdAt > context.data.weightTrend.history[1].createdAt)
  })

  await scenario('用品拆封记录能处理错误值和正常消耗', () => {
    const state = makeState({
      feeds: [
        { id: 1, dayKey: '2026-07-29', type: '早餐', amount: '100g' },
        { id: 2, dayKey: TODAY, type: '晚餐', amount: '100g' }
      ]
    })
    const { wx, calls } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onShow.call(context)
    page.openSupply.call(context, { currentTarget: { dataset: { key: 'dogFood' } } })
    context.data.supplyDraft = { productName: '测试犬粮', packageAmount: 'abc', openedDate: TODAY }
    page.saveSupplyOpening.call(context)
    assert.strictEqual(state.supplies.dogFood.packageAmount, '')
    context.data.supplyDraft = { productName: '测试犬粮', packageAmount: '1000', openedDate: '2026-07-29' }
    page.saveSupplyOpening.call(context)
    assert.strictEqual(state.supplies.dogFood.packageAmount, 1000)
    assert.strictEqual(state.supplies.dogFood.history.length, 1)
    assert.ok(context.data.supplyView.dogFood.remaining <= 800)
    assert.ok(calls.toasts.length >= 2)
  })

  await scenario('护理历史日期会自动计算下次提醒', () => {
    const state = makeState()
    const { wx } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onShow.call(context)
    page.openCareDetail.call(context, { currentTarget: { dataset: { key: 'bath' } } })
    context.data.selectedRecordDate = TODAY
    page.markCareDone.call(context, { currentTarget: { dataset: { key: 'bath' } } })
    assert.strictEqual(state.careRecords.length, 1)
    assert.strictEqual(state.care.bathLast, TODAY)
    assert.strictEqual(state.care.bath, '2026-08-13')
  })

  await scenario('补录旧护理历史不会覆盖当前提醒计划', () => {
    const state = makeState({
      care: { ...defaultCare(), bathLast: TODAY, bath: '2026-08-13' }
    })
    const { wx } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page)
    page.onShow.call(context)
    page.openCareDetail.call(context, { currentTarget: { dataset: { key: 'bath' } } })
    context.data.selectedRecordDate = '2026-07-10'
    page.markCareDone.call(context, { currentTarget: { dataset: { key: 'bath' } } })
    assert.strictEqual(state.careRecords.length, 1)
    assert.strictEqual(state.care.bathLast, TODAY)
    assert.strictEqual(state.care.bath, '2026-08-13')
    assert.strictEqual(state.careRecords[0].nextDate, '2026-07-24')
  })

  await scenario('头像保存失败时不会写入半条资料记录', () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    wx.cloud = {
      init() {},
      callFunction() { return Promise.resolve({ result: { ok: true } }) },
      uploadFile() { return Promise.reject(new Error('upload failed')) }
    }
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page, {
      pet: clone(state.pet),
      draft: { ...state.pet, weight: 11.8 },
      careDraft: defaultCare(),
      today: TODAY,
      newAvatarTemp: 'temp-avatar.jpg'
    })
    page.savePet.call(context)
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
    assert.strictEqual(state.pet.weight, 11.2)
    assert.strictEqual(state.weightRecords.length, 1)
    assert.strictEqual(context.data.saving, false)
    assert.ok(calls.toasts.some(item => item.title.includes('失败')))
    })
  })

  await scenario('体重历史超过 100 条不会影响旧成长照片', () => {
    const records = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      createdAt: 1000 - index,
      dayKey: `2026-06-${String((index % 28) + 1).padStart(2, '0')}`,
      time: '08:00',
      weight: 11,
      photoPath: index === 99 ? 'wxfile://oldest-growth.jpg' : ''
    }))
    const state = makeState({ weightRecords: records })
    const { wx, calls } = makeWx()
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page, {
      pet: clone(state.pet),
      draft: { ...state.pet, weight: 11.3 },
      careDraft: defaultCare(),
      today: TODAY
    })
    page.savePet.call(context)
    assert.strictEqual(state.weightRecords.length, 100)
    assert.ok(!calls.removed.includes('wxfile://oldest-growth.jpg'))
  })

  await scenario('清空聊天会取消尚未返回的本地知识库回复', () => withTimers(flush => {
    const state = makeState()
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, input: '今天喝多少水？', messages: [], thinking: false })
    page.send.call(context)
    assert.strictEqual(state.chats.length, 1)
    page.clearChat.call(context)
    flush()
    assert.strictEqual(state.chats.length, 0)
    assert.strictEqual(context.data.messages.length, 0)
    assert.strictEqual(context.data.thinking, false)
  }))

  await scenario('本地知识库聊天正常回复会持久化并解除思考状态', () => withTimers(flush => {
    const state = makeState()
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, input: '今天应该喝多少水？', messages: [], thinking: false })
    page.send.call(context)
    flush()
    assert.strictEqual(state.chats.length, 2)
    assert.strictEqual(state.chats[1].role, 'ai')
    assert.ok(/\d+ml/.test(state.chats[1].text))
    assert.strictEqual(context.data.thinking, false)
  }))

  await scenario('宠物顾问使用本地知识库且不会请求 DeepSeek', () => withTimers(flush => {
    const state = makeState({
      feeds: [{ dayKey: TODAY, amount: 105 }],
      waters: [{ dayKey: TODAY, amount: 180 }],
      walks: [{ dayKey: TODAY, duration: 26, distance: 1.8 }]
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`审核版不应请求网络 AI：${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, input: '糯米今天应该喝多少水？', messages: [], thinking: false })
    page.send.call(context)
    flush()
    assert.strictEqual(state.chats.length, 2)
    assert.ok(state.chats[1].text.includes('糯米'))
    assert.ok(state.chats[1].text.length > 20)
    assert.strictEqual(state.chats[1].source, 'local-knowledge')
    assert.strictEqual(context.data.thinking, false)
  }))

  await scenario('本地知识库能结合饮食饮水散步便便体重和护理给出分场景建议', () => withTimers(flush => {
    const state = makeState({
      feeds: [
        { dayKey: TODAY, amount: 90, type: '早餐' },
        { dayKey: TODAY, amount: 70, type: '午餐' },
        { dayKey: '2026-07-29', amount: 255, type: '全天' }
      ],
      waters: [
        { dayKey: TODAY, amount: 110 },
        { dayKey: TODAY, amount: 130 },
        { dayKey: '2026-07-29', amount: 590 }
      ],
      walks: [
        { dayKey: TODAY, duration: 18, distance: 1.1 },
        { dayKey: '2026-07-29', duration: 42, distance: 2.2 }
      ],
      stools: [
        { dayKey: TODAY, condition: '偏软', color: '黄色', abnormal: true },
        { dayKey: '2026-07-29', condition: '正常成形', color: '棕色', abnormal: false }
      ],
      weightRecords: [
        { dayKey: '2026-07-16', weight: 10.9, createdAt: 1 },
        { dayKey: '2026-07-23', weight: 11.0, createdAt: 2 },
        { dayKey: TODAY, weight: 11.2, createdAt: 3 }
      ],
      care: { ...defaultCare(), bath: '2026-08-01', dental: TODAY, medicine: '2026-08-02' }
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`审核版本地知识库不应请求网络 AI：${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })

    context.data.input = '糯米今天状态怎么样？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('今日状态'))
    assert.ok(state.chats[1].text.includes('饮水'))
    assert.ok(state.chats[1].text.includes('偏软'))

    context.data.input = '糯米最近的体重趋势怎么样？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[3].text.includes('体重趋势'))
    assert.ok(state.chats[3].text.includes('11.2kg'))

    context.data.input = '糯米可以吃巧克力吗？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[5].text.includes('不建议'))
    assert.ok(state.chats[5].text.includes('巧克力'))

    context.data.input = '驱虫洗澡什么时候做？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[7].text.includes('护理提醒'))
    assert.ok(state.chats[7].text.includes('洗澡'))
    assert.ok(state.chats.every(item => item.source !== 'deepseek'))
  }))

  await scenario('单项护理问题只回答用户点名的项目，不被更近的护理提醒干扰', () => withTimers(flush => {
    const state = makeState({
      care: {
        ...defaultCare(),
        vaccine: '2026-08-22', vaccineCycle: 12, vaccineLast: '2025-08-22',
        deworming: '2026-08-16', dewormingCycle: 3, dewormingLast: '2026-05-16',
        dental: TODAY, dentalCycle: 1, dentalLast: '2026-07-29'
      },
      careRecords: [{ id: 'dental-1', key: 'dental', label: '刷牙护理', date: '2026-07-30', nextDate: '2026-07-31' }]
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })

    context.data.input = '下次疫苗是什么时候？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('疫苗提醒'))
    assert.ok(state.chats[1].text.includes('2026-08-22'))
    assert.ok(!state.chats[1].text.includes('刷牙'))

    context.data.input = '下次驱虫是什么时候？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[3].text.includes('驱虫提醒'))
    assert.ok(state.chats[3].text.includes('2026-08-16'))
    assert.ok(!state.chats[3].text.includes('刷牙'))

    context.data.input = '上次刷牙啥时候？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[5].text.includes('刷牙记录'))
    assert.ok(state.chats[5].text.includes('2026-07-30'))
    assert.ok(!state.chats[5].text.includes('口腔观察'))
  }))

  await scenario('零食还有多少会查询用品余量，不会误判成饮食建议', () => withTimers(flush => {
    const state = makeState({
      feeds: [{ dayKey: TODAY, amount: 180, type: '正餐' }, { dayKey: TODAY, amount: 12, type: '零食' }],
      supplies: {
        dogFood: { productName: '测试狗粮', openedDate: '2026-07-28', packageAmount: 2000, history: [] },
        snack: { productName: '鸡肉零食', openedDate: '2026-07-28', packageAmount: 500, history: [] }
      }
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })

    context.data.input = '零食还有多少？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('用品余量'))
    assert.ok(state.chats[1].text.includes('鸡肉零食'))
    assert.ok(state.chats[1].text.includes('约剩'))
    assert.ok(!state.chats[1].text.includes('饮食判断'))
  }))

  await scenario('宠物粮推荐覆盖档案推荐、筛选、玩具、对比和配料解释', () => withTimers(flush => {
    const state = makeState({
      pet: { ...makeState().pet, birthday: '2023-03-16', weight: 13.5 },
      stools: [{ dayKey: TODAY, condition: '偏软', abnormal: true }]
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    const cases = [
      ['根据我家宠物推荐主粮、零食和玩具', '根据宠物推荐'],
      ['帮我筛选适合我家宠物的主粮', '主粮筛选'],
      ['帮我筛选训练零食', '零食筛选'],
      ['帮我对比两款主粮应该看什么', '商品对比'],
      ['宠物粮的蛋白、脂肪和配料表怎么看', '营养/配料解释']
    ]
    cases.forEach(([input, expected], index) => {
      context.data.input = input
      page.send.call(context)
      flush()
      assert.ok(state.chats[index * 2 + 1].text.includes(expected))
      assert.ok(state.chats[index * 2 + 1].source === 'local-knowledge')
      if (index === 0) {
        assert.ok(state.chats[1].text.includes('零食'))
        assert.ok(state.chats[1].text.includes('玩具'))
      }
      if (index === 1) {
        assert.ok(state.chats[3].text.includes('价格 '))
        assert.ok(state.chats[3].text.includes('原料 '))
        assert.ok(state.chats[3].text.includes('优点 '))
        assert.ok(state.chats[3].text.includes('注意 '))
      }
    })
  }))

  await scenario('本地知识库覆盖症状、用品余量、食物安全和品种年龄提示', () => withTimers(flush => {
    const state = makeState({
      pet: { ...makeState().pet, breed: '柯基', birthday: '2023-03-16', weight: 11.2 },
      feeds: [
        { dayKey: TODAY, amount: 80, type: '早餐' },
        { dayKey: TODAY, amount: 95, type: '晚餐' },
        { dayKey: '2026-07-29', amount: 250, type: '全天' }
      ],
      waters: [{ dayKey: TODAY, amount: 260 }],
      walks: [{ dayKey: TODAY, duration: 32, distance: 1.8 }],
      stools: [{ dayKey: TODAY, condition: '正常成形', color: '棕色', abnormal: false }],
      care: { ...defaultCare(), bath: '2026-08-01', dental: TODAY },
      supplies: {
        dogFood: { productName: '测试狗粮', openedDate: '2026-07-20', packageAmount: 5000, history: [] },
        snack: { productName: '鸡肉零食', openedDate: '2026-07-25', packageAmount: 500, history: [] }
      }
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`审核版本地知识库不应请求网络 AI：${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })

    context.data.input = '糯米耳朵臭怎么办？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('耳朵观察'))
    assert.ok(state.chats[1].text.includes('耳道'))

    context.data.input = '狗粮余量还够吗？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[3].text.includes('用品余量'))
    assert.ok(state.chats[3].text.includes('测试狗粮'))
    assert.ok(state.chats[3].text.includes('约剩'))

    context.data.input = '糯米可以吃苹果吗？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[5].text.includes('食物安全'))
    assert.ok(state.chats[5].text.includes('少量'))

    context.data.input = '柯基今天运动怎么安排？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[7].text.includes('运动判断'))
    assert.ok(state.chats[7].text.includes('腰背'))
    assert.ok(state.chats.every(item => item.source !== 'deepseek'))
  }))

  await scenario('本地知识库覆盖泌尿中暑出行绝育护理操作和记录建议', () => withTimers(flush => {
    const state = makeState({
      pet: { ...makeState().pet, breed: '柯基', birthday: '2023-03-16', weight: 11.2 },
      feeds: [{ dayKey: TODAY, amount: 180, type: '全天' }],
      waters: [{ dayKey: TODAY, amount: 210 }],
      walks: [{ dayKey: TODAY, duration: 45, distance: 2.3 }],
      stools: [{ dayKey: TODAY, condition: '正常成形', color: '棕色', abnormal: false }],
      care: { ...defaultCare(), vaccine: '2026-08-20', deworming: '2026-08-10', bath: '2026-08-13', dental: TODAY, nail: '2026-08-15' }
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`审核版本地知识库不应请求网络 AI：${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })

    context.data.input = '糯米尿黄尿少怎么办？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('尿尿观察'))
    assert.ok(state.chats[1].text.includes('饮水'))

    context.data.input = '天气太热一直喘会不会中暑？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[3].text.includes('中暑'))
    assert.ok(state.chats[3].text.includes('建议：'))

    context.data.input = '下周寄养要准备什么？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[5].text.includes('出行/寄养'))
    assert.ok(state.chats[5].text.includes('疫苗'))

    context.data.input = '糯米绝育要注意什么？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[7].text.includes('绝育'))
    assert.ok(state.chats[7].text.includes('术后'))

    context.data.input = '洗澡和剪指甲怎么做？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[9].text.includes('洗澡护理') || state.chats[9].text.includes('剪指甲'))
    assert.ok(state.chats[9].text.includes('奖励') || state.chats[9].text.includes('吹干'))

    context.data.input = '平时要记录什么？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[11].text.includes('记录建议'))
    assert.ok(state.chats[11].text.includes('主粮总量'))
    assert.ok(state.chats.every(item => item.source !== 'deepseek'))
  }))

  await scenario('本地知识库覆盖食物清单活动时间日常洗护和常见不适处理', () => withTimers(flush => {
    const state = makeState({
      pet: { ...makeState().pet, breed: '柯基', birthday: '2023-03-16', weight: 11.2 },
      feeds: [{ dayKey: TODAY, amount: 200, type: '全天' }],
      waters: [{ dayKey: TODAY, amount: 300 }],
      walks: [{ dayKey: TODAY, duration: 35, distance: 2 }],
      stools: [{ dayKey: TODAY, condition: '正常成形', color: '棕色', abnormal: false }],
      care: { ...defaultCare(), bath: '2026-08-13', dental: TODAY, nail: '2026-08-15' }
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`审核版本地知识库不应请求网络 AI：${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })

    context.data.input = '宠物常见能吃的食物有哪些？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('可少量尝试食物'))
    assert.ok(state.chats[1].text.includes('鸡胸肉'))

    context.data.input = '宠物不能吃的食物有哪些？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[3].text.includes('禁食清单'))
    assert.ok(state.chats[3].text.includes('巧克力'))

    context.data.input = '对毛发和肠胃好的食物有什么？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[5].text.includes('友好食物'))
    assert.ok(state.chats[5].text.includes('鱼油') || state.chats[5].text.includes('南瓜'))

    context.data.input = '柯基每天活动时间多久合适？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[7].text.includes('建议活动量'))
    assert.ok(state.chats[7].text.includes('45-70'))

    context.data.input = '日常洗护怎么安排？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[9].text.includes('日常洗护'))
    assert.ok(state.chats[9].text.includes('刷牙'))

    context.data.input = '常见的不适症状和解决方法有哪些？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[11].text.includes('常见不适处理'))
    assert.ok(state.chats[11].text.includes('呕吐'))

    context.data.input = '糯米呕吐了怎么办？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[13].text.includes('呕吐观察'))
    assert.ok(state.chats[13].text.includes('建议：'))
    assert.ok(state.chats.every(item => item.source !== 'deepseek'))
  }))

  await scenario('本地知识库覆盖疫苗驱虫术后减肥老幼睡眠异物和应激场景', () => withTimers(flush => {
    const state = makeState({
      pet: { ...makeState().pet, breed: '柯基', birthday: '2023-03-16', weight: 13.5 },
      feeds: [{ dayKey: TODAY, amount: 230, type: '全天' }],
      waters: [{ dayKey: TODAY, amount: 360 }],
      walks: [{ dayKey: TODAY, duration: 28, distance: 1.4 }],
      stools: [{ dayKey: TODAY, condition: '正常成形', color: '棕色', abnormal: false }],
      care: { ...defaultCare(), vaccine: '2026-08-13', deworming: '2026-08-10' },
      weightRecords: [
        { dayKey: '2026-07-20', weight: 12.8, createdAt: 1 },
        { dayKey: TODAY, weight: 13.5, createdAt: 2 }
      ]
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`审核版本地知识库不应请求网络 AI：${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })

    context.data.input = '打完疫苗后要注意什么？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('疫苗后观察'))
    assert.ok(state.chats[1].text.includes('不要洗澡'))

    context.data.input = '术后伤口怎么观察？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[3].text.includes('术后伤口观察'))
    assert.ok(state.chats[3].text.includes('伊丽莎白圈'))

    context.data.input = '糯米太胖了怎么减肥？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[5].text.includes('体重管理'))
    assert.ok(state.chats[5].text.includes('零食'))

    context.data.input = '老年宠物怎么照护？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[7].text.includes('老年照护'))
    assert.ok(state.chats[7].text.includes('关节'))

    context.data.input = '睡太多正常吗？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[9].text.includes('睡眠观察'))

    context.data.input = '吞了袜子怎么办？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[11].text.includes('误吞异物'))
    assert.ok(state.chats[11].text.includes('不要'))

    context.data.input = '打雷分离焦虑怎么办？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[13].text.includes('应激') || state.chats[13].text.includes('分离焦虑'))
    assert.ok(state.chats.every(item => item.source !== 'deepseek'))
  }))

  await scenario('本地知识库批量覆盖家庭、训练、猫狗、天气、外出和护理场景包', () => withTimers(flush => {
    const state = makeState({
      pet: { ...makeState().pet, breed: '柯基', birthday: '2023-03-16', weight: 11.2 },
      feeds: [{ dayKey: TODAY, amount: 200, type: '全天' }],
      waters: [{ dayKey: TODAY, amount: 320 }],
      walks: [{ dayKey: TODAY, duration: 36, distance: 1.8 }],
      stools: [{ dayKey: TODAY, condition: '正常成形', color: '棕色', abnormal: false }]
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`审核版本地知识库不应请求网络 AI：${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    const cases = [
      ['家里电线阳台怎么防护？', '家庭环境安全'],
      ['新宠到家第一天怎么适应？', '新宠到家适应'],
      ['定点大小便和尿垫训练怎么做？', '定点如厕训练'],
      ['猫砂盆乱尿怎么办？', '猫砂盆与乱尿'],
      ['出门爆冲牵引训练怎么做？', '牵引爆冲与召回'],
      ['护食吃饭咬人怎么办？', '护食与资源守护'],
      ['路上捡食乱吃地上东西怎么办？', '外出捡食'],
      ['家里两只狗打架，多宠怎么相处？', '多宠相处'],
      ['猫狗混养狗追猫怎么办？', '猫狗混养'],
      ['雨天不能出门怎么消耗精力？', '雨天室内活动'],
      ['夏天散步柏油路会不会烫脚？', '夏天散步防烫脚'],
      ['冬天天气冷要不要穿衣服保暖？', '冬天保暖'],
      ['坐车流口水晕车怎么办？', '坐车晕车'],
      ['转粮和换主粮怎么过渡？', '换粮过渡'],
      ['训练零食奖励怎么给？', '训练零食与奖励'],
      ['坐下训练和等待训练怎么做？', '基础口令训练'],
      ['航空箱和笼内训练怎么做？', '笼内与航空箱训练'],
      ['猫吐毛球化毛怎么办？', '毛球与吐毛'],
      ['肛门腺蹭屁股屁股臭怎么办？', '肛门腺与蹭屁股'],
      ['脚垫舔脚趾间炎怎么办？', '脚垫与趾间炎'],
      ['耳螨跳蚤蜱虫体外驱虫怎么处理？', '耳螨跳蚤蜱虫'],
      ['幼犬换牙双排牙咬家具怎么办？', '换牙与口腔'],
      ['眼屎多流泪泪痕怎么办？', '眼睛分泌物'],
      ['宠物沐浴露和皮肤过敏怎么处理？', '皮肤过敏与洗护产品'],
      ['补钙营养膏卵磷脂要不要吃？', '补钙与营养品'],
      ['年度体检和健康检查多久一次？', '年度体检计划'],
      ['出差没人管，寄养和上门喂养怎么准备？', '寄养与上门喂养'],
      ['过年烟花鞭炮害怕怎么办？', '节假日烟花鞭炮'],
      ['上班怎么办，独自在家多久合适？', '独自在家安排'],
      ['疫苗没打完幼犬社交能不能出门？', '幼宠疫苗前社交'],
      ['老年关节爬楼腰背怎么保护？', '老年关节与爬楼'],
      ['挑食不吃粮只吃零食怎么办？', '挑食与拒食']
    ]
    cases.forEach(([input, expected], index) => {
      context.data.input = input
      page.send.call(context)
      flush()
      const reply = state.chats[index * 2 + 1].text
      assert.ok(reply.includes(expected), `${input} should hit ${expected}, got ${reply}`)
      assert.ok(reply.includes('参考：'), `${input} should include a concise record reference`)
      assert.ok(reply.includes('建议：'), `${input} should include a concise action`)
    })
    assert.ok(state.chats.every(item => item.source !== 'deepseek'))
  }))

  await scenario('ZIP 补充知识库可回答急症、症状、食物、日常提示和提醒规则', () => withTimers(flush => {
    const state = makeState({
      pet: { ...makeState().pet, breed: '柯基', birthday: '2023-03-16', weight: 11.2 },
      feeds: [{ dayKey: TODAY, amount: 190, type: '全天' }],
      waters: [{ dayKey: TODAY, amount: 280 }],
      walks: [{ dayKey: TODAY, duration: 30, distance: 1.5 }],
      stools: [{ dayKey: TODAY, condition: '正常成形', color: '棕色', abnormal: false }]
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`审核版本地知识库不应请求网络 AI：${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })

    context.data.input = '木糖醇中毒怎么办？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('急症卡：木糖醇中毒'))
    assert.ok(state.chats[1].text.includes('不要做：'))

    context.data.input = '便血要观察什么？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[3].text.includes('症状索引：便血'))
    assert.ok(state.chats[3].text.includes('危险信号：'))

    context.data.input = '生食能不能吃？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[5].text.includes('食物补充库：生食'))
    assert.ok(state.chats[5].text.includes('风险等级'))

    context.data.input = '牛磺酸对猫狗营养有什么用？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[7].text.includes('知识库补充：牛磺酸'))
    assert.ok(state.chats[7].text.includes('相关主题'))

    context.data.input = '口腔检查提醒多久一次？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[9].text.includes('提醒规则补充：口腔检查'))
    assert.ok(state.chats[9].text.includes('默认间隔'))

    assert.ok(state.chats.every(item => item.source !== 'deepseek'))
  }))

  await scenario('连续点击生成不会产生重复日记', () => withTimers(flush => {
    const state = makeState()
    const { wx } = makeWx()
    const store = makeStore(state)
    const diary = loadPage('pages/diary/diary.js', store, wx)
    const diaryContext = pageContext(diary, {
      pet: state.pet, diaries: [], creating: true, generating: false,
      draft: { mood: '开心', note: '去了公园' }
    })
    diary.generateDiary.call(diaryContext)
    diary.generateDiary.call(diaryContext)
    flush()
    assert.strictEqual(state.diaries.length, 1)
  }))

  await scenario('审核版已移除头像生成页面和图片模型入口', () => {
    const appConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
    assert.ok(!appConfig.pages.includes('pages/avatar/avatar'))
    assert.ok(!fs.existsSync(path.join(ROOT, 'pages/avatar/avatar.js')))
    assert.ok(!fs.existsSync(path.join(ROOT, 'utils/dreamina.js')))
    assert.ok(!fs.existsSync(path.join(ROOT, 'utils/deepseek.js')))
  })

  await scenario('WXML 中所有交互处理函数都真实存在', () => {
    const pageNames = ['profile', 'feed', 'chat', 'account', 'diary']
    pageNames.forEach(name => {
      const state = makeState()
      const { wx } = makeWx()
      const page = loadPage(`pages/${name}/${name}.js`, makeStore(state), wx, { getWeather: () => Promise.resolve({ apparent: 25, rainTime: '' }) })
      const wxml = fs.readFileSync(path.join(ROOT, `pages/${name}/${name}.wxml`), 'utf8')
      const handlers = [...wxml.matchAll(/\b(?:bind|catch)(?:tap|input|change|confirm|submit|longpress)="([^"]+)"/g)].map(match => match[1])
      handlers.forEach(handler => assert.strictEqual(typeof page[handler], 'function', `${name}.${handler} is missing`))
    })
  })

  await scenario('宠物顾问页面不再包含头像生成页签', () => {
    const chatWxml = fs.readFileSync(path.join(ROOT, 'pages/chat/chat.wxml'), 'utf8')
    assert.ok(!chatWxml.includes('data-tab="avatar"'))
    assert.ok(!chatWxml.includes('class="avatar-tab-panel"'))
    assert.ok(!chatWxml.includes('bindtap="generate"'))
    assert.ok(chatWxml.includes('class="head-title"'))
    const appConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
    assert.ok(!appConfig.tabBar.list.some(item => item.pagePath === 'pages/avatar/avatar'))
    assert.ok(!appConfig.pages.includes('pages/avatar/avatar'))
  })

  await scenario('首页在所有记录为空时仍能生成完整状态和 AI 预测', () => {
    const state = makeState({
      feeds: [], stools: [], waters: [], walks: [], careRecords: [], weightRecords: []
    })
    const { wx } = makeWx()
    const profile = loadPage('pages/profile/profile.js', makeStore(state), wx, { getWeather: () => Promise.resolve({ apparent: 25, rainTime: '' }) })
    const context = pageContext(profile)
    profile.refresh.call(context)
    assert.strictEqual(context.data.homeDashboard.tasks.length, 6)
    assert.strictEqual(context.data.homeDashboard.findings.length, 3)
    assert.strictEqual(context.data.todayFeedCount, 0)
    assert.strictEqual(context.data.todayStoolCount, 0)
    assert.strictEqual(context.data.weightTrend.history.length, 1)
  })

  await scenario('天气定位和网络都失败时会回退到离线提示', async () => {
    const weatherPath = path.join(ROOT, 'utils/weather.js')
    delete require.cache[require.resolve(weatherPath)]
    const originalWx = global.wx
    global.wx = {
      getLocation(options) { options.fail(new Error('permission denied')) },
      request(options) { options.fail(new Error('offline')) }
    }
    const weather = await require(weatherPath).getWeather()
    global.wx = originalWx
    assert.strictEqual(weather.live, false)
    assert.strictEqual(weather.location, '本地提示')
    assert.ok(weather.rainText.includes('审核版暂不获取定位'))
  })

  await scenario('页面清单和三个 Tab 路由都指向真实文件', () => {
    const appConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
    assert.strictEqual(appConfig.tabBar.list.length, 3)
    const routes = [...appConfig.pages, ...appConfig.tabBar.list.map(item => item.pagePath)]
    routes.forEach(route => {
      assert.ok(fs.existsSync(path.join(ROOT, `${route}.js`)), `${route}.js is missing`)
      assert.ok(fs.existsSync(path.join(ROOT, `${route}.wxml`)), `${route}.wxml is missing`)
      assert.ok(fs.existsSync(path.join(ROOT, `${route}.wxss`)), `${route}.wxss is missing`)
    })
    assert.strictEqual(new Set(appConfig.tabBar.list.map(item => item.pagePath)).size, 3)
    assert.strictEqual(appConfig.tabBar.list.find(item => item.pagePath === 'pages/chat/chat').text, '宠物顾问')
  })

  await scenario('审核版前端包不包含大模型接口或密钥', () => {
    const projectConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'))
    const ignored = projectConfig.packOptions.ignore || []
    assert.ok(ignored.some(item => item.type === 'folder' && item.value === 'server'))
    const frontendFiles = [
      'app.js', 'app.json',
      ...['profile', 'feed', 'chat', 'account', 'diary'].flatMap(name => [
        `pages/${name}/${name}.js`,
        `pages/${name}/${name}.wxml`,
        `pages/${name}/${name}.json`
      ]),
      'utils/store.js', 'utils/weather.js', 'utils/pet-knowledge.js', 'utils/pet-knowledge-supplement.js'
    ]
    frontendFiles.forEach(relativePath => {
      const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
      assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(content), `${relativePath} must not contain an API key`)
      assert.ok(!/deepseek|dreamina|生成 Q 版头像|Q版头像/i.test(content), `${relativePath} must not contain removed AI avatar/deepseek code`)
    })
  })

  await scenario('TheDogAPI/TheCatAPI weekly breed supplement answers from local cache', () => withTimers(flush => {
    const state = makeState({
      pet: { ...makeState().pet, breed: '柯基', birthday: '2023-03-16', weight: 11.2 },
      externalBreedKnowledge: {
        version: 'external-breed-v1',
        updatedAt: Date.UTC(2026, 7, 10),
        sources: ['TheDogAPI', 'TheCatAPI'],
        dogCount: 1,
        catCount: 1,
        items: [{
          id: 'dog-pembroke',
          species: 'dog',
          source: 'TheDogAPI',
          name: 'Pembroke Welsh Corgi',
          aliases: ['柯基'],
          temperament: ['Outgoing', 'Tenacious', 'Friendly'],
          lifeSpan: '12 - 14 years',
          weight: '10 - 14',
          origin: 'Wales',
          summary: 'Breed group: Herding'
        }]
      }
    })
    const { wx } = makeWx()
    wx.request = options => {
      throw new Error(`local cache should not request third-party API: ${options.url || ''}`)
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '柯基这个品种寿命和性格怎么样？'
    page.send.call(context)
    flush()
    const reply = state.chats[1].text
    assert.ok(reply.includes('每周品种补充'))
    assert.ok(reply.includes('TheDogAPI'))
    assert.ok(reply.includes('12 - 14 years'))
    assert.ok(reply.includes('11.2kg'))
    assert.ok(state.chats.every(item => item.source !== 'deepseek'))
  }))

  await scenario('Local knowledge keeps context for follow-up questions', () => withTimers(flush => {
    const state = makeState()
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '被虫咬了怎么办？'
    page.send.call(context)
    flush()
    context.data.input = '那后面还要注意什么？'
    page.send.call(context)
    flush()
    assert.strictEqual(state.chats.length, 4)
    assert.ok(state.chats[3].text.includes('虫咬') || state.chats[3].text.includes('红肿') || state.chats[3].text.includes('叮咬'))
    assert.strictEqual(state.chats[3].source, 'local-knowledge')
  }))

  await scenario('Local knowledge handles additive symptom updates without repeating the same template', () => withTimers(flush => {
    const state = makeState()
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '糯米吐了怎么办？'
    page.send.call(context)
    flush()
    context.data.input = '早上也吐了'
    page.send.call(context)
    flush()
    assert.strictEqual(state.chats.length, 4)
    assert.ok(state.chats[3].text.includes('呕吐次数增加'))
    assert.ok(state.chats[3].text.includes('2 次以上') || state.chats[3].text.includes('反复呕吐'))
    assert.strictEqual(state.chats[3].source, 'local-knowledge')
  }))

  await scenario('Local knowledge adds pet-specific context in a conversational tone', () => withTimers(flush => {
    const state = makeState({
      feeds: [{ dayKey: TODAY, amount: 120 }],
      waters: [{ dayKey: TODAY, amount: 260 }],
      walks: [{ dayKey: TODAY, duration: 18, distance: 1.1 }],
      stools: [{ dayKey: TODAY, condition: '偏软', abnormal: true }]
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '今天运动怎么安排？'
    page.send.call(context)
    flush()
    assert.ok(state.chats[1].text.includes('糯米'))
    assert.ok(state.chats[1].text.includes('已经动了') || state.chats[1].text.includes('轻松散步'))
    assert.ok(state.chats[1].text.includes('便便'))
    assert.ok(!state.chats[1].text.includes('结合糯米的日常记录：今日喂食'))
  }))

  await scenario('Local knowledge compares with previous records in follow-up questions', () => withTimers(flush => {
    const state = makeState({
      waters: [
        { dayKey: TODAY, amount: 260 },
        { dayKey: offsetDayKey(1), amount: 420 },
        { dayKey: offsetDayKey(2), amount: 410 },
        { dayKey: offsetDayKey(3), amount: 400 },
        { dayKey: offsetDayKey(8), amount: 560 },
        { dayKey: offsetDayKey(9), amount: 540 }
      ],
      feeds: [{ dayKey: TODAY, amount: 120 }],
      walks: [{ dayKey: TODAY, duration: 18, distance: 1.1 }],
      stools: [{ dayKey: TODAY, condition: '偏软', abnormal: true }]
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '糯米今天应该喝多少水？'
    page.send.call(context)
    flush()
    context.data.messages = state.chats
    context.data.input = '和之前比呢'
    page.send.call(context)
    flush()
    const reply = state.chats[3].text
    assert.ok(reply.includes('饮水对比'))
    assert.ok(reply.includes('和之前比'))
    assert.ok(reply.includes('昨天'))
    assert.ok(reply.includes('近 7 天'))
    assert.ok(!reply.includes('0 次喂食，共 0g'))
  }))

  await scenario('Comparison follow-up stays on the previous user topic, not side details in the reply', () => withTimers(flush => {
    const state = makeState({
      feeds: [
        { id: 'today-feed', dayKey: TODAY, time: '08:00', amount: 180 },
        { id: 'yesterday-feed', dayKey: offsetDayKey(1), time: '08:00', amount: 240 }
      ],
      waters: [
        { id: 'today-water', dayKey: TODAY, time: '08:00', amount: 0 },
        { id: 'yesterday-water', dayKey: offsetDayKey(1), time: '08:00', amount: 450 }
      ]
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '糯米最近吃的多吗'
    page.send.call(context)
    flush()
    context.data.input = '和之前呢'
    page.send.call(context)
    flush()
    const reply = state.chats[state.chats.length - 1].text
    assert.ok(reply.includes('饮食对比'))
    assert.ok(reply.includes('今天吃了'))
    assert.ok(!reply.includes('饮水对比'))
    assert.ok(reply.split('\n\n').length <= 3)
  }))

  await scenario('A new vomiting question is not hijacked by the previous weight comparison', () => withTimers(flush => {
    const state = makeState({
      weightRecords: [
        { dayKey: TODAY, weight: 11.2 },
        { dayKey: offsetDayKey(7), weight: 10.9 }
      ]
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '体重和之前比呢'
    page.send.call(context)
    flush()
    context.data.messages = state.chats
    context.data.input = '今天吐了怎么办'
    page.send.call(context)
    flush()
    const reply = state.chats[3].text
    assert.ok(reply.includes('呕吐观察'))
    assert.ok(!reply.includes('体重趋势判断'))
  }))

  await scenario('Local knowledge upgrades repeated symptoms with record-based triage', () => withTimers(flush => {
    const state = makeState({
      stools: [{ dayKey: TODAY, condition: '偏软', abnormal: true }],
      waters: [{ dayKey: TODAY, amount: 180 }]
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '糯米今天吐了 2 次，还没精神怎么办？'
    page.send.call(context)
    flush()
    const reply = state.chats[1].text
    assert.ok(reply.includes('已经呕吐 2 次'))
    assert.ok(reply.includes('不建议继续在家反复观察'))
    assert.ok(reply.includes('尽快联系兽医'))
    assert.ok(reply.includes('记录每次发生的时间和内容'))
  }))

  await scenario('V3 expert system retrieves local knowledge and applies emergency rules', () => {
    const expert = require(path.join(ROOT, 'utils/expert-system.js'))
    const result = expert.answer('我家公猫一直蹲猫砂盆但是尿不出来', { breed: '英短' })
    assert.ok(result)
    assert.strictEqual(result.riskLevel, 3)
    assert.ok(result.text.includes('立即联系动物急诊'))
    assert.ok(result.score >= 12)
  })

  await scenario('Medication questions are not mistaken for feeding questions', () => {
    const knowledge = require(path.join(ROOT, 'utils/pet-knowledge.js'))
    assert.strictEqual(knowledge.detectIntent('拉稀了吃什么药'), 'medicine')
    assert.strictEqual(knowledge.detectIntent('驱虫药怎么吃'), 'medicine')
  })

  await scenario('Medication history questions search records instead of giving drug advice', () => withTimers(flush => {
    const state = makeState({
      careRecords: [{ id: 'medicine-1', key: 'medicine', label: '宠物用药', date: '2026-07-23', nextDate: '2026-08-22' }]
    })
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, messages: [], thinking: false })
    context.data.input = '在记录里找糯米最近在吃什么药'
    page.send.call(context)
    flush()
    const reply = state.chats[1].text
    assert.strictEqual(require(path.join(ROOT, 'utils/pet-knowledge.js')).detectIntent('糯米最近在吃什么药'), 'medicineRecord')
    assert.ok(reply.includes('2026-07-23'))
    assert.ok(reply.includes('没有填写药名和剂量'))
    assert.ok(!reply.includes('用药提醒'))
  }))

  await scenario('Conflicting health questions use safety-first intent priorities', () => {
    const knowledge = require(path.join(ROOT, 'utils/pet-knowledge.js'))
    assert.strictEqual(knowledge.detectIntent('吃了人药怎么办'), 'danger')
    assert.strictEqual(knowledge.detectIntent('吃完驱虫药吐了'), 'postCare')
    assert.strictEqual(knowledge.detectIntent('巧克力吃了怎么办'), 'foodSafety')
    assert.strictEqual(knowledge.detectIntent('公猫蹲猫砂盆尿不出来'), 'urine')
    assert.strictEqual(knowledge.detectIntent('今天没吃饭还没精神'), 'symptomGuide')
    assert.strictEqual(knowledge.detectIntent('猫咪不喝水还吐了'), 'symptomGuide')
    assert.strictEqual(knowledge.detectIntent('打针后能洗澡吗'), 'postCare')
    assert.strictEqual(knowledge.detectIntent('感冒怎么办'), 'symptomGuide')
    assert.strictEqual(knowledge.detectIntent('天气太热一直喘会不会中暑'), 'heat')
    assert.strictEqual(knowledge.detectIntent('木糖醇中毒怎么办'), 'supplementEmergency')
  })

  await scenario('Responsive layouts hide scrollbars and keep small screens usable', () => {
    const appStyles = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8')
    const chatStyles = fs.readFileSync(path.join(ROOT, 'pages/chat/chat.wxss'), 'utf8')
    const profileStyles = fs.readFileSync(path.join(ROOT, 'pages/profile/profile.wxss'), 'utf8')
    const accountStyles = fs.readFileSync(path.join(ROOT, 'pages/account/account.wxss'), 'utf8')

    assert.ok(/::-webkit-scrollbar\s*\{[^}]*display\s*:\s*none/s.test(appStyles))

    const wxmlFiles = ['profile', 'feed', 'chat', 'account', 'diary']
      .map(name => path.join(ROOT, `pages/${name}/${name}.wxml`))
    wxmlFiles.forEach(file => {
      const wxml = fs.readFileSync(file, 'utf8')
      const scrollViews = [...wxml.matchAll(/<scroll-view\b[^>]*>/g)].map(match => match[0])
      scrollViews.forEach(tag => {
        assert.ok(/show-scrollbar="false"/.test(tag), `${path.relative(ROOT, file)} exposes a scrollbar`)
      })
    })

    const chatWxml = fs.readFileSync(path.join(ROOT, 'pages/chat/chat.wxml'), 'utf8')
    assert.ok(/<scroll-view class="chat-scroll"[^>]*scroll-y[^>]*show-scrollbar="false"/.test(chatWxml))
    assert.ok(/@media[^\{]*max-height\s*:\s*620px/.test(chatStyles))
    assert.ok(/@media[^\{]*max-height\s*:\s*620px/.test(profileStyles))
    assert.ok(/@media[^\{]*max-width\s*:\s*360px/.test(chatStyles))
    assert.ok(/@media[^\{]*max-width\s*:\s*360px/.test(profileStyles))
    assert.ok(/@media[^\{]*max-width\s*:\s*360px/.test(accountStyles))
    assert.ok(/\.profile-edit-page[\s\S]*safe-area-inset-bottom/.test(accountStyles))

    const deviceMatrix = [
      { name: 'iPhone SE', width: 320, height: 568 },
      { name: 'iPhone 8', width: 375, height: 667 },
      { name: 'iPhone 14', width: 390, height: 844 },
      { name: 'iPhone 15 Pro Max', width: 430, height: 932 },
      { name: 'Android compact', width: 360, height: 800 },
      { name: 'Android large', width: 412, height: 915 }
    ]
    deviceMatrix.forEach(device => {
      assert.ok(device.width >= 320 && device.width <= 430, `${device.name} width is outside the test matrix`)
      assert.ok(device.height >= 568 && device.height <= 932, `${device.name} height is outside the test matrix`)
    })
  })

  const failures = results.filter(result => !result.ok)
  console.log(`\n${results.length - failures.length}/${results.length} scenarios passed.`)
  if (failures.length) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
