const KEYS = {
  pet: 'paw_pet',
  feeds: 'paw_feeds',
  diaries: 'paw_diaries',
  chats: 'paw_chats',
  stools: 'paw_stools',
  care: 'paw_care_schedule',
  careRecords: 'paw_care_records',
  supplies: 'paw_supply_records',
  waters: 'paw_water_records',
  walks: 'paw_walk_records',
  weightRecords: 'paw_weight_records',
  generatedAvatar: 'paw_generated_avatar',
  avatarGenerationStatus: 'paw_avatar_generation_status',
  feedTrendDemo: 'paw_feed_trend_demo_v1',
  dailyTrendDemo: 'paw_daily_trend_demo_v1'
}

const seedPet = {
  name: '糯米',
  breed: '柯基',
  sex: '男孩',
  birthday: '2023-03-16',
  weight: '11.2',
  togetherSince: '2023-03-16',
  avatar: '/assets/momo-chibi.png',
  tags: ['黏人精', '小吃货', '爱散步']
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function offsetDateKey(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false
  const [year, month, day] = String(value).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function normalizePet(value) {
  const pet = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const weight = Number(pet.weight)
  const birthday = isValidDateKey(pet.birthday) ? pet.birthday : seedPet.birthday
  return {
    ...seedPet,
    ...pet,
    name: typeof pet.name === 'string' && pet.name.trim() ? pet.name.trim() : seedPet.name,
    breed: typeof pet.breed === 'string' && pet.breed.trim() ? pet.breed.trim() : seedPet.breed,
    sex: typeof pet.sex === 'string' && pet.sex ? pet.sex : seedPet.sex,
    birthday,
    togetherSince: isValidDateKey(pet.togetherSince) ? pet.togetherSince : birthday,
    weight: Number.isFinite(weight) && weight > 0 ? pet.weight : seedPet.weight,
    avatar: typeof pet.avatar === 'string' && pet.avatar ? pet.avatar : seedPet.avatar,
    tags: Array.isArray(pet.tags) ? pet.tags : seedPet.tags
  }
}

function getDefaultCareSchedule() {
  return {
    deworming: offsetDateKey(7), dewormingCycle: 3, dewormingLast: '',
    vaccine: offsetDateKey(30), vaccineCycle: 12, vaccineLast: '',
    bath: offsetDateKey(7), bathCycle: 14, bathLast: '',
    dental: todayKey(), dentalCycle: 1, dentalLast: '',
    nail: todayKey(), nailCycle: 30, nailLast: '',
    medicine: offsetDateKey(30), medicineCycle: 30, medicineLast: ''
  }
}

function normalizeCareSchedule(schedule) {
  const defaults = getDefaultCareSchedule()
  const value = schedule && typeof schedule === 'object' && !Array.isArray(schedule) ? schedule : {}
  const result = { ...defaults }
  ;['deworming', 'vaccine', 'bath', 'dental', 'nail', 'medicine'].forEach(key => {
    result[key] = isValidDateKey(value[key]) ? value[key] : defaults[key]
    const lastKey = `${key}Last`
    result[lastKey] = value[lastKey] === '' || value[lastKey] === undefined
      ? ''
      : isValidDateKey(value[lastKey]) ? value[lastKey] : defaults[lastKey]
    const cycleKey = `${key}Cycle`
    const cycle = Number(value[cycleKey])
    result[cycleKey] = Number.isFinite(cycle) && cycle > 0 ? cycle : defaults[cycleKey]
  })
  return result
}

function getDefaultSupplies() {
  return {
    dogFood: { productName: '', openedDate: '', packageAmount: '', history: [] },
    snack: { productName: '', openedDate: '', packageAmount: '', history: [] }
  }
}

function normalizeSupplies(supplies) {
  const defaults = getDefaultSupplies()
  const value = supplies && typeof supplies === 'object' && !Array.isArray(supplies) ? supplies : {}
  const normalizeItem = (item, fallback) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {}
    const amount = Number(source.packageAmount)
    const history = Array.isArray(source.history)
      ? source.history.filter(record => record && typeof record === 'object').map(record => {
        const recordAmount = Number(record.packageAmount)
        return {
          ...record,
          productName: typeof record.productName === 'string' ? record.productName : String(record.productName || ''),
          openedDate: isValidDateKey(record.openedDate) ? record.openedDate : '',
          packageAmount: Number.isFinite(recordAmount) && recordAmount > 0 ? recordAmount : ''
        }
      })
      : []
    return {
      ...fallback,
      ...source,
      productName: typeof source.productName === 'string' ? source.productName : String(source.productName || ''),
      openedDate: isValidDateKey(source.openedDate) ? source.openedDate : '',
      packageAmount: Number.isFinite(amount) && amount > 0 ? amount : '',
      history
    }
  }
  return {
    dogFood: normalizeItem(value.dogFood, defaults.dogFood),
    snack: normalizeItem(value.snack, defaults.snack)
  }
}

const seedTodayFeeds = [
  { id: 3, date: '今天', time: '18:30', type: '晚餐', food: '低敏犬粮', amount: '95g', icon: '🥣' },
  { id: 2, date: '今天', time: '12:15', type: '零食', food: '鸡胸肉干', amount: '18g', icon: '🦴' },
  { id: 1, date: '今天', time: '07:40', type: '早餐', food: '低敏犬粮', amount: '90g', icon: '🥣' }
]

function buildSeedFeedHistory() {
  const records = []
  for (let daysBack = 1; daysBack <= 29; daysBack += 1) {
    const dayKey = offsetDateKey(-daysBack)
    const [, month, day] = dayKey.split('-').map(Number)
    const daily = [
      { time: '07:35', type: '早餐', food: '低敏犬粮', amount: `${82 + daysBack % 5 * 3}g`, icon: '🥣' },
      { time: '18:25', type: '晚餐', food: '低敏犬粮', amount: `${92 + daysBack % 4 * 4}g`, icon: '🥣' }
    ]
    if (daysBack % 2 === 0) daily.push({ time: '10:20', type: '零食', food: '鸡胸肉干', amount: `${12 + daysBack % 3 * 2}g`, icon: '🦴' })
    if (daysBack % 3 === 0) daily.push({ time: '12:10', type: '午餐', food: '南瓜鸡肉餐', amount: `${48 + daysBack % 4 * 3}g`, icon: '🥣' })
    if (daysBack % 7 === 0) {
      daily.push(
        { time: '09:30', type: '零食', food: '训练奖励', amount: '6g', icon: '🦴' },
        { time: '15:10', type: '零食', food: '磨牙零食', amount: '9g', icon: '🦴' },
        { time: '20:20', type: '零食', food: '睡前奖励', amount: '5g', icon: '🦴' }
      )
    }
    daily.forEach((item, index) => records.push({
      ...item,
      id: `demo-feed-${dayKey}-${index}`,
      dayKey,
      date: `${month}月${day}日`
    }))
  }
  return records
}

const seedFeedHistory = buildSeedFeedHistory()
const seedFeeds = [...seedTodayFeeds, ...seedFeedHistory]

const seedDiaries = [{
  id: 1,
  date: '7月20日 · 星期一',
  title: '今天也是元气满满的一天',
  weather: '☀️ 28℃',
  mood: '开心',
  content: '早上我一听见饭碗的声音，就飞快地跑到了厨房。今天的鸡胸肉干特别香！傍晚还和最喜欢的人散了步，路边的风闻起来都是甜甜的。',
  highlight: '今日高光：准时吃完三餐，还多走了 1,200 步！'
}]

const seedStools = [
  { id: 2, date: '今天', time: '16:40', condition: '正常成形', color: '棕色', note: '状态很好', icon: '💩', abnormal: false },
  { id: 1, date: '今天', time: '08:05', condition: '正常成形', color: '棕色', note: '', icon: '💩', abnormal: false }
]

const seedWaters = [
  { id: 2, date: '今天', time: '15:20', amount: '160ml', note: '', icon: '💧' },
  { id: 1, date: '今天', time: '09:10', amount: '180ml', note: '散步回来喝的', icon: '💧' }
]

const seedWalks = [
  { id: 1, date: '今天', time: '08:20', duration: 35, distance: '1.6', note: '小区一圈', icon: '🐾' }
]

function buildSeedDailyTrendHistory() {
  const histories = { stools: [], waters: [], walks: [] }
  for (let daysBack = 1; daysBack <= 29; daysBack += 1) {
    const dayKey = offsetDateKey(-daysBack)
    const [, month, day] = dayKey.split('-').map(Number)
    const date = `${month}月${day}日`

    const stoolTimes = ['08:05', '17:10']
    if (daysBack % 5 === 0) stoolTimes.splice(1, 0, '12:35')
    if (daysBack % 11 === 0) stoolTimes.push('21:15')
    stoolTimes.forEach((time, index) => {
      const abnormal = (daysBack % 8 === 0 && index === 0) || (daysBack % 13 === 0 && index === stoolTimes.length - 1)
      histories.stools.push({
        id: `demo-stool-${dayKey}-${index}`,
        dayKey,
        date,
        time,
        condition: abnormal ? (daysBack % 2 ? '偏软' : '稀便') : '正常成形',
        color: abnormal && daysBack % 13 === 0 ? '黄色' : '棕色',
        note: abnormal ? '已标记观察' : '',
        icon: '💩',
        abnormal
      })
    })

    const waterTimes = ['07:50', '11:25', '15:20', '19:40']
    if (daysBack % 6 === 0) waterTimes.push('21:10', '22:00')
    waterTimes.forEach((time, index) => {
      histories.waters.push({
        id: `demo-water-${dayKey}-${index}`,
        dayKey,
        date,
        time,
        amount: `${95 + (daysBack + index * 3) % 6 * 12}ml`,
        note: index === 0 && daysBack % 4 === 0 ? '早餐后主动饮水' : '',
        icon: '💧'
      })
    })

    const walkEntries = [
      { time: '08:15', duration: 18 + daysBack % 5 * 2, distance: (0.8 + daysBack % 4 * 0.1).toFixed(1), note: '晨间散步' }
    ]
    if (daysBack % 4 !== 0) {
      walkEntries.push({ time: '18:45', duration: 25 + daysBack % 6 * 3, distance: (1.1 + daysBack % 5 * 0.2).toFixed(1), note: '晚间散步' })
    }
    if (daysBack % 9 === 0) {
      walkEntries.push({ time: '13:30', duration: 12, distance: '0.5', note: '午后短途活动' })
    }
    walkEntries.forEach((item, index) => histories.walks.push({
      ...item,
      id: `demo-walk-${dayKey}-${index}`,
      dayKey,
      date,
      icon: '🐾'
    }))
  }
  return histories
}

const seedDailyTrendHistory = buildSeedDailyTrendHistory()

function ensureSeedData() {
  const pet = normalizePet(wx.getStorageSync(KEYS.pet))
  wx.setStorageSync(KEYS.pet, pet)

  const arrayDefaults = {
    feeds: seedFeeds,
    diaries: seedDiaries,
    chats: [],
    stools: seedStools,
    waters: seedWaters,
    walks: seedWalks,
    careRecords: []
  }
  Object.keys(arrayDefaults).forEach(key => {
    const records = wx.getStorageSync(KEYS[key])
    if (!Array.isArray(records)) wx.setStorageSync(KEYS[key], arrayDefaults[key])
    else if (records.some(item => !item || typeof item !== 'object')) {
      wx.setStorageSync(KEYS[key], records.filter(item => item && typeof item === 'object'))
    }
  })

  const weightRecords = wx.getStorageSync(KEYS.weightRecords)
  if (!Array.isArray(weightRecords)) {
    const createdAt = Date.now()
    wx.setStorageSync(KEYS.weightRecords, [{ id: createdAt, createdAt, dayKey: todayKey(), time: '', weight: Number(pet.weight) || 0, photoPath: '' }])
  } else if (weightRecords.some(item => !item || typeof item !== 'object')) {
    wx.setStorageSync(KEYS.weightRecords, weightRecords.filter(item => item && typeof item === 'object'))
  }

  const supplies = wx.getStorageSync(KEYS.supplies)
  const normalizedSupplies = normalizeSupplies(supplies)
  wx.setStorageSync(KEYS.supplies, normalizedSupplies)

  const care = wx.getStorageSync(KEYS.care)
  const normalizedCare = normalizeCareSchedule(care)
  wx.setStorageSync(KEYS.care, normalizedCare)

  ;['feeds', 'stools', 'waters', 'walks'].forEach(key => {
    const records = wx.getStorageSync(KEYS[key])
    if (records.some(item => !item.dayKey)) {
      wx.setStorageSync(KEYS[key], records.map(item => ({ ...item, dayKey: item.dayKey || todayKey() })))
    }
  })

  if (wx.getAccountInfoSync) {
    try {
      const account = wx.getAccountInfoSync()
      if (account && account.miniProgram && account.miniProgram.envVersion === 'develop') {
        if (!wx.getStorageSync(KEYS.feedTrendDemo)) {
          const feeds = wx.getStorageSync(KEYS.feeds)
          const ids = new Set(feeds.map(item => item.id))
          const missingHistory = seedFeedHistory.filter(item => !ids.has(item.id))
          if (missingHistory.length) wx.setStorageSync(KEYS.feeds, [...feeds, ...missingHistory])
          wx.setStorageSync(KEYS.feedTrendDemo, true)
        }
        if (!wx.getStorageSync(KEYS.dailyTrendDemo)) {
          ;['stools', 'waters', 'walks'].forEach(key => {
            const records = wx.getStorageSync(KEYS[key])
            const ids = new Set(records.map(item => item.id))
            const missingHistory = seedDailyTrendHistory[key].filter(item => !ids.has(item.id))
            if (missingHistory.length) wx.setStorageSync(KEYS[key], [...records, ...missingHistory])
          })
          wx.setStorageSync(KEYS.dailyTrendDemo, true)
        }
      }
    } catch (error) {}
  }
}

const ARRAY_KEYS = new Set(['feeds', 'diaries', 'chats', 'stools', 'careRecords', 'waters', 'walks', 'weightRecords'])
const get = key => {
  const value = wx.getStorageSync(KEYS[key])
  if (key === 'pet') return normalizePet(value)
  if (key === 'care') return normalizeCareSchedule(value)
  if (key === 'supplies') return normalizeSupplies(value)
  if (key === 'generatedAvatar') {
    if (!value || typeof value !== 'object' || typeof value.path !== 'string' || !value.path) return null
    return {
      path: value.path,
      styleId: typeof value.styleId === 'string' ? value.styleId : '',
      style: typeof value.style === 'string' ? value.style : '',
      createdAt: Number(value.createdAt) || 0
    }
  }
  if (key === 'avatarGenerationStatus') {
    if (!value || typeof value !== 'object') return null
    const status = ['querying', 'success', 'fail'].includes(value.status) ? value.status : ''
    if (!status) return null
    return {
      status,
      submitId: typeof value.submitId === 'string' ? value.submitId : '',
      styleId: typeof value.styleId === 'string' ? value.styleId : '',
      style: typeof value.style === 'string' ? value.style : '',
      error: typeof value.error === 'string' ? value.error : '',
      createdAt: Number(value.createdAt) || 0
    }
  }
  if (ARRAY_KEYS.has(key)) return Array.isArray(value) ? value : []
  return value || []
}
const set = (key, value) => wx.setStorageSync(KEYS[key], value)

module.exports = { KEYS, ensureSeedData, get, set, todayKey, getDefaultCareSchedule, normalizeCareSchedule, getDefaultSupplies, normalizeSupplies }
