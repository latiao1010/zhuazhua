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
  walks: 'paw_walk_records'
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
  return { ...getDefaultCareSchedule(), ...(schedule || {}) }
}

function getDefaultSupplies() {
  return {
    dogFood: { productName: '', openedDate: '', packageAmount: '', history: [] },
    snack: { productName: '', openedDate: '', packageAmount: '', history: [] }
  }
}

function normalizeSupplies(supplies) {
  const defaults = getDefaultSupplies()
  return {
    dogFood: { ...defaults.dogFood, ...((supplies && supplies.dogFood) || {}) },
    snack: { ...defaults.snack, ...((supplies && supplies.snack) || {}) }
  }
}

const seedFeeds = [
  { id: 3, date: '今天', time: '18:30', type: '晚餐', food: '低敏犬粮', amount: '95g', icon: '🥣' },
  { id: 2, date: '今天', time: '12:15', type: '零食', food: '鸡胸肉干', amount: '18g', icon: '🦴' },
  { id: 1, date: '今天', time: '07:40', type: '早餐', food: '低敏犬粮', amount: '90g', icon: '🥣' }
]

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

function ensureSeedData() {
  if (!wx.getStorageSync(KEYS.pet)) wx.setStorageSync(KEYS.pet, seedPet)
  const pet = wx.getStorageSync(KEYS.pet)
  if (pet && !pet.togetherSince) wx.setStorageSync(KEYS.pet, { ...pet, togetherSince: pet.birthday })
  if (!wx.getStorageSync(KEYS.feeds)) wx.setStorageSync(KEYS.feeds, seedFeeds)
  if (!wx.getStorageSync(KEYS.diaries)) wx.setStorageSync(KEYS.diaries, seedDiaries)
  if (!wx.getStorageSync(KEYS.chats)) wx.setStorageSync(KEYS.chats, [])
  if (!wx.getStorageSync(KEYS.stools)) wx.setStorageSync(KEYS.stools, seedStools)
  if (!wx.getStorageSync(KEYS.waters)) wx.setStorageSync(KEYS.waters, seedWaters)
  if (!wx.getStorageSync(KEYS.walks)) wx.setStorageSync(KEYS.walks, seedWalks)
  if (!wx.getStorageSync(KEYS.careRecords)) wx.setStorageSync(KEYS.careRecords, [])
  const supplies = wx.getStorageSync(KEYS.supplies)
  const normalizedSupplies = normalizeSupplies(supplies)
  if (!supplies || !supplies.dogFood || !supplies.snack) wx.setStorageSync(KEYS.supplies, normalizedSupplies)
  const care = wx.getStorageSync(KEYS.care)
  const normalizedCare = normalizeCareSchedule(care)
  if (!care || Object.keys(normalizedCare).some(key => care[key] === undefined)) wx.setStorageSync(KEYS.care, normalizedCare)
  ;['feeds', 'stools', 'waters', 'walks'].forEach(key => {
    const records = wx.getStorageSync(KEYS[key]) || []
    if (records.some(item => !item.dayKey)) {
      wx.setStorageSync(KEYS[key], records.map(item => ({ ...item, dayKey: item.dayKey || todayKey() })))
    }
  })
}

const get = key => wx.getStorageSync(KEYS[key]) || []
const set = (key, value) => wx.setStorageSync(KEYS[key], value)

module.exports = { KEYS, ensureSeedData, get, set, todayKey, getDefaultCareSchedule, normalizeCareSchedule, getDefaultSupplies, normalizeSupplies }
