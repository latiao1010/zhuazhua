const assert = require('assert')
const fs = require('fs')
const path = require('path')
const Module = require('module')

const ROOT = path.resolve(__dirname, '..')
const TODAY = '2026-07-30'

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
    chats: [],
    diaries: [],
    care: defaultCare(),
    careRecords: [],
    supplies: {
      dogFood: { productName: '', openedDate: '', packageAmount: '', history: [] },
      snack: { productName: '', openedDate: '', packageAmount: '', history: [] }
    },
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
    }
  }
}

function makeWx() {
  const calls = {
    toasts: [], saved: [], removed: [], previews: [], navigations: [], switches: [],
    tabShows: 0, tabHides: 0, vibrations: 0, clipboard: []
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
    removeSavedFile(options) { calls.removed.push(options.filePath) },
    chooseMedia() {},
    previewImage(options) { calls.previews.push(options) },
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
  const originalLoad = Module._load
  const originalPage = global.Page
  let captured
  global.wx = wx
  global.Page = config => { captured = config }
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../../utils/store') return store
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
  await scenario('空存储能初始化全部基础数据', () => {
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
    assert.ok(storage.paw_feeds.length > 80)
    assert.ok(storage.paw_stools.length > 60)
    assert.ok(storage.paw_water_records.length > 110)
    assert.ok(storage.paw_walk_records.length > 45)
    const feedDays = [...new Set(storage.paw_feeds.map(item => item.dayKey))].sort()
    assert.ok(feedDays.length >= 60)
    assert.ok((new Date(`${feedDays[feedDays.length - 1]}T00:00:00`) - new Date(`${feedDays[0]}T00:00:00`)) / 86400000 >= 59)
    assert.ok(storage.paw_weight_records.length >= 9)
    assert.deepStrictEqual([...new Set(storage.paw_care_records.map(item => item.key))].sort(), ['bath', 'dental', 'deworming', 'medicine', 'nail', 'vaccine'])
    assert.ok(storage.paw_growth_photos.length >= 10)
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
    assert.ok(storage.paw_supply_records.dogFood.openedDate)
    assert.ok(storage.paw_supply_records.snack.openedDate)
    assert.ok(storage.paw_care_schedule.dentalCycle > 0)
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

  await scenario('体重变化和照片都能形成可预览的成长记录', () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const store = makeStore(state)
    const account = loadPage('pages/account/account.js', store, wx)
    const accountContext = pageContext(account, {
      pet: clone(state.pet),
      draft: { ...state.pet, weight: 11.6 },
      careDraft: defaultCare(),
      today: TODAY,
      weightPhotoTemp: 'temp-growth.jpg'
    })
    account.savePet.call(accountContext)
    assert.strictEqual(state.weightRecords.length, 2)
    assert.strictEqual(state.weightRecords[0].weight, 11.6)
    assert.ok(state.weightRecords[0].photoPath.startsWith('wxfile://'))
    const profile = loadPage('pages/profile/profile.js', store, wx, { getWeather: () => Promise.resolve({ apparent: 25, rainTime: '' }) })
    const profileContext = pageContext(profile)
    profile.refresh.call(profileContext)
    profile.openWeightTrend.call(profileContext)
    const photoIndex = profileContext.data.weightTrend.history.findIndex(item => item.hasPhoto)
    profile.previewWeightPhoto.call(profileContext, { currentTarget: { dataset: { index: photoIndex } } })
    assert.strictEqual(calls.previews.length, 1)
    assert.strictEqual(calls.previews[0].current, state.weightRecords[0].photoPath)
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

  await scenario('成长照片保存失败时不会写入半条记录', () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    wx.saveFile = options => options.fail(new Error('disk full'))
    const page = loadPage('pages/account/account.js', makeStore(state), wx)
    const context = pageContext(page, {
      pet: clone(state.pet),
      draft: { ...state.pet, weight: 11.8 },
      careDraft: defaultCare(),
      today: TODAY,
      weightPhotoTemp: 'temp-failed.jpg'
    })
    page.savePet.call(context)
    assert.strictEqual(state.pet.weight, 11.2)
    assert.strictEqual(state.weightRecords.length, 1)
    assert.strictEqual(context.data.saving, false)
    assert.ok(calls.toasts.some(item => item.title.includes('失败')))
  })

  await scenario('体重历史超过 100 条时会清理最旧照片文件', () => {
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
    assert.ok(calls.removed.includes('wxfile://oldest-growth.jpg'))
  })

  await scenario('清空聊天会取消尚未返回的 AI 回复', () => withTimers(flush => {
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

  await scenario('AI 聊天正常回复会持久化并解除思考状态', () => withTimers(flush => {
    const state = makeState()
    const { wx } = makeWx()
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, input: '今天应该喝多少水？', messages: [], thinking: false })
    page.send.call(context)
    flush()
    assert.strictEqual(state.chats.length, 2)
    assert.strictEqual(state.chats[1].role, 'ai')
    assert.ok(state.chats[1].text.includes('560') && state.chats[1].text.includes('672'))
    assert.strictEqual(context.data.thinking, false)
  }))

  await scenario('AI 聊聊会通过本地代理调用 DeepSeek 并保存真实回复', async () => {
    const state = makeState()
    const { wx } = makeWx()
    let requestOptions
    wx.request = options => {
      requestOptions = options
      options.success({
        statusCode: 200,
        data: { content: '这是来自 DeepSeek 的宠物照护建议。', model: 'deepseek-v4-flash' }
      })
      return { abort() {} }
    }
    const page = loadPage('pages/chat/chat.js', makeStore(state), wx)
    const context = pageContext(page, { pet: state.pet, input: '糯米今天精神怎么样？', messages: [], thinking: false })
    page.send.call(context)
    await Promise.resolve()
    await Promise.resolve()
    assert.strictEqual(requestOptions.url, 'http://127.0.0.1:8789/api/chat')
    assert.strictEqual(requestOptions.data.messages[0].role, 'user')
    assert.ok(!JSON.stringify(requestOptions.data).includes('sk-'))
    assert.strictEqual(state.chats.length, 2)
    assert.strictEqual(state.chats[1].text, '这是来自 DeepSeek 的宠物照护建议。')
    assert.strictEqual(state.chats[1].source, 'deepseek-v4-flash')
    assert.strictEqual(context.data.thinking, false)
  })

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

  await scenario('AI Q版头像会调用即梦并阻止重复提交', async () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const store = makeStore(state)
    const requests = []
    wx.getFileSystemManager = () => ({
      getFileInfo(options) { options.success({ size: 1024 }) },
      readFile(options) { options.success({ data: 'ZmFrZS1pbWFnZQ==' }) }
    })
    wx.request = options => {
      requests.push(options)
      if (options.method === 'POST') {
        options.success({ statusCode: 202, data: { submitId: 'dreamina-submit-1', status: 'querying' } })
      } else {
        options.success({ statusCode: 200, data: { submitId: 'dreamina-submit-1', status: 'success', imageUrl: 'http://127.0.0.1:8789/generated/result.png' } })
      }
      return { abort() {} }
    }
    wx.downloadFile = options => options.success({ statusCode: 200, tempFilePath: 'wxfile://tmp-dreamina.png' })
    const avatar = loadPage('pages/avatar/avatar.js', store, wx)
    const avatarContext = pageContext(avatar, { pet: state.pet, photo: 'wxfile://pet.jpg', generating: false, generated: false })
    avatar.chooseStyle.call(avatarContext, {
      currentTarget: { dataset: { id: 'anime', name: '治愈漫画' } }
    })
    avatar.generate.call(avatarContext)
    avatar.generate.call(avatarContext)
    for (let index = 0; index < 8; index += 1) await Promise.resolve()
    assert.strictEqual(requests.filter(item => item.method === 'POST').length, 1)
    assert.ok(requests[0].url.endsWith('/api/avatar'))
    assert.strictEqual(requests[0].data.styleId, 'anime')
    assert.strictEqual(requests[0].data.style, '治愈漫画')
    assert.strictEqual(avatarContext.data.generatedImage, 'wxfile://saved-1.jpg')
    assert.strictEqual(avatarContext.data.generated, true)
    assert.strictEqual(state.generatedAvatar.path, 'wxfile://saved-1.jpg')
    assert.strictEqual(state.avatarGenerationStatus.status, 'success')
    assert.strictEqual(calls.vibrations, 1)
  })

  await scenario('头像页会恢复并可预览最近生成的Q版头像', () => {
    const state = makeState({
      generatedAvatar: { path: 'wxfile://saved-q-avatar.jpg', styleId: 'anime', style: '治愈漫画', createdAt: 123 }
    })
    const { wx, calls } = makeWx()
    const avatar = loadPage('pages/avatar/avatar.js', makeStore(state), wx)
    const avatarContext = pageContext(avatar)
    avatar.onShow.call(avatarContext)
    assert.strictEqual(avatarContext.data.generated, true)
    assert.strictEqual(avatarContext.data.generatedImage, 'wxfile://saved-q-avatar.jpg')
    assert.strictEqual(avatarContext.data.generatedStyle, '治愈漫画')
    avatar.previewGenerated.call(avatarContext)
    assert.deepStrictEqual(calls.previews[0].urls, ['wxfile://saved-q-avatar.jpg'])
  })

  await scenario('即梦失败原因会留在头像页而不是只显示短提示', () => {
    const state = makeState()
    const { wx, calls } = makeWx()
    const avatar = loadPage('pages/avatar/avatar.js', makeStore(state), wx)
    const avatarContext = pageContext(avatar, { pet: state.pet, styleId: 'soft3d', style: '软萌公仔', generating: true })
    avatarContext.generationVersion = 2
    avatar.failGenerate.call(avatarContext, new Error('generation failed: task was deleted'), 2)
    assert.strictEqual(avatarContext.data.generating, false)
    assert.ok(avatarContext.data.generationError.includes('任务已被服务端删除'))
    assert.strictEqual(state.avatarGenerationStatus.status, 'fail')
    assert.strictEqual(calls.toasts[0].title, '本次生成未成功')
  })

  await scenario('Q版头像页使用单屏布局且不需要横向或纵向滚动', () => {
    const wxml = fs.readFileSync(path.join(ROOT, 'pages/avatar/avatar.wxml'), 'utf8')
    const wxss = fs.readFileSync(path.join(ROOT, 'pages/avatar/avatar.wxss'), 'utf8')
    assert.ok(!wxml.includes('<scroll-view'))
    assert.ok(/class="step-card photo-step" bindtap="choosePhoto"/.test(wxml))
    assert.ok(wxml.includes('无遮挡 · 支持 JPG / PNG'))
    assert.ok(wxml.includes('class="controls-panel"'))
    assert.ok(wxml.includes('class="action-zone"'))
    assert.ok(wxml.includes('class="steps-stack"'))
    assert.ok(!wxml.includes('class="selection-status"'))
    assert.ok(/page\s*\{[^}]*overflow\s*:\s*hidden/s.test(wxss))
    assert.ok(/\.avatar-page\s*\{[^}]*height\s*:\s*100%/s.test(wxss))
    assert.ok(/\.controls-panel\s*\{[^}]*flex\s*:\s*1/s.test(wxss))
    assert.ok(/grid-template-rows\s*:\s*minmax\(0,1fr\) minmax\(0,1fr\)/s.test(wxss))
    assert.ok(/grid-template-columns\s*:\s*repeat\(4/s.test(wxss))
    assert.ok(/\.preview\s*\{[^}]*height\s*:\s*420rpx/s.test(wxss))
    assert.ok(/\.result image\s*\{[^}]*width\s*:\s*100%[^}]*height\s*:\s*100%/s.test(wxss))
    assert.ok(/\.style-art\s*\{[^}]*height\s*:\s*56rpx/s.test(wxss))
  })

  await scenario('WXML 中所有交互处理函数都真实存在', () => {
    const pageNames = ['profile', 'feed', 'chat', 'avatar', 'account', 'diary']
    pageNames.forEach(name => {
      const state = makeState()
      const { wx } = makeWx()
      const page = loadPage(`pages/${name}/${name}.js`, makeStore(state), wx, { getWeather: () => Promise.resolve({ apparent: 25, rainTime: '' }) })
      const wxml = fs.readFileSync(path.join(ROOT, `pages/${name}/${name}.wxml`), 'utf8')
      const handlers = [...wxml.matchAll(/\b(?:bind|catch)(?:tap|input|change|confirm|submit|longpress)="([^"]+)"/g)].map(match => match[1])
      handlers.forEach(handler => assert.strictEqual(typeof page[handler], 'function', `${name}.${handler} is missing`))
    })
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
    assert.strictEqual(context.data.homeDashboard.findings.length, 4)
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
    assert.strictEqual(weather.location, '离线提示')
    assert.ok(weather.rainText.includes('暂未取得实时天气'))
  })

  await scenario('页面清单和四个 Tab 路由都指向真实文件', () => {
    const appConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
    assert.strictEqual(appConfig.tabBar.list.length, 4)
    const routes = [...appConfig.pages, ...appConfig.tabBar.list.map(item => item.pagePath)]
    routes.forEach(route => {
      assert.ok(fs.existsSync(path.join(ROOT, `${route}.js`)), `${route}.js is missing`)
      assert.ok(fs.existsSync(path.join(ROOT, `${route}.wxml`)), `${route}.wxml is missing`)
      assert.ok(fs.existsSync(path.join(ROOT, `${route}.wxss`)), `${route}.wxss is missing`)
    })
    assert.strictEqual(new Set(appConfig.tabBar.list.map(item => item.pagePath)).size, 4)
  })

  await scenario('DeepSeek 密钥不会进入小程序前端包', () => {
    const projectConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'))
    const ignored = projectConfig.packOptions.ignore || []
    assert.ok(ignored.some(item => item.type === 'folder' && item.value === 'server'))
    const frontendFiles = [
      'app.js', 'app.json',
      ...['profile', 'feed', 'chat', 'avatar', 'account', 'diary'].flatMap(name => [
        `pages/${name}/${name}.js`,
        `pages/${name}/${name}.wxml`,
        `pages/${name}/${name}.json`
      ]),
      'utils/store.js', 'utils/weather.js', 'utils/deepseek.js', 'utils/dreamina.js'
    ]
    frontendFiles.forEach(relativePath => {
      const content = fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
      assert.ok(!/sk-[A-Za-z0-9_-]{20,}/.test(content), `${relativePath} must not contain an API key`)
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
